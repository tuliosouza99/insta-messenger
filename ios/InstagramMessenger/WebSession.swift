import Combine
import Foundation
import Network
import UIKit
import WebKit

@MainActor
final class WebSession: NSObject, ObservableObject, WKNavigationDelegate, WKUIDelegate {
    @Published private(set) var webView: WKWebView
    @Published private(set) var isLoading = false
    @Published private(set) var isResetting = false
    @Published private(set) var errorMessage: String?
    private var observations: [NSKeyValueObservation] = []
    private let monitor = NWPathMonitor()
    private var wasOffline = false
    private var lastUsableURL = NavigationPolicy.inbox
    private var inboxRedirects: [Date] = []
    private var deferredFailure: String?

    override init() {
        webView = Self.makeWebView()
        super.init()
        attachWebView()
        monitor.pathUpdateHandler = { [weak self] path in
            let online = path.status == .satisfied
            Task { @MainActor [weak self] in
                guard let self else { return }
                let shouldRetry = online && self.wasOffline && self.errorMessage != nil && !self.isResetting
                self.wasOffline = !online
                if shouldRetry { self.retry() }
            }
        }
        monitor.start(queue: DispatchQueue(label: "messenger.network"))
        openInbox()
    }

    deinit { monitor.cancel() }

    private static func makeWebView() -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = [.audio]
        configuration.defaultWebpagePreferences.preferredContentMode = .mobile
        if let resource = Bundle.main.url(forResource: "focus", withExtension: "js"),
           let source = try? String(contentsOf: resource, encoding: .utf8) {
            // No script message handler: website code cannot invoke native APIs.
            configuration.userContentController.addUserScript(WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.allowsBackForwardNavigationGestures = true
        view.scrollView.keyboardDismissMode = .interactive
        view.scrollView.contentInsetAdjustmentBehavior = .never
        view.isOpaque = false
        view.backgroundColor = .systemBackground
        return view
    }

    private func attachWebView() {
        webView.navigationDelegate = self
        webView.uiDelegate = self
        observations = [
            webView.observe(\.isLoading, options: [.new]) { [weak self] view, _ in
                Task { @MainActor [weak self] in self?.isLoading = view.isLoading }
            },
            webView.observe(\.url, options: [.new]) { [weak self] view, _ in
                Task { @MainActor [weak self] in
                    guard let self, let url = view.url, !self.isResetting else { return }
                    // WKNavigationDelegate does not cover same-document history
                    // changes; URL observation provides a second SPA guard.
                    if NavigationPolicy.classify(url.absoluteString).isEmbedded { self.lastUsableURL = url }
                    else { self.returnToInbox() }
                }
            }
        ]
    }

    func openInbox() {
        guard !isResetting else { return }
        errorMessage = nil
        deferredFailure = nil
        lastUsableURL = NavigationPolicy.inbox
        webView.load(URLRequest(url: NavigationPolicy.inbox))
    }

    func retry() {
        guard !isResetting else { return }
        errorMessage = nil
        deferredFailure = nil
        inboxRedirects.removeAll()
        webView.load(URLRequest(url: lastUsableURL))
    }

    func resetSession() {
        guard !isResetting else { return }
        isResetting = true
        webView.stopLoading()
        webView.navigationDelegate = nil
        webView.uiDelegate = nil
        observations.removeAll()
        // Detach the old page before clearing, so it cannot immediately restore
        // cookies while WKWebsiteDataStore is being erased.
        webView = WKWebView(frame: .zero, configuration: WKWebViewConfiguration())
        WKWebsiteDataStore.default().removeData(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(), modifiedSince: .distantPast) { [weak self] in
            Task { @MainActor [weak self] in
                guard let self else { return }
                self.webView = Self.makeWebView()
                self.attachWebView()
                self.isResetting = false
                self.inboxRedirects.removeAll()
                self.openInbox()
            }
        }
    }

    private func returnToInbox() {
        let now = Date()
        inboxRedirects = inboxRedirects.filter { now.timeIntervalSince($0) < 10 }
        guard inboxRedirects.count < 3 else {
            webView.stopLoading()
            errorMessage = "Instagram keeps leaving the inbox. Try again, or reset the local session from the menu if sign-in is stuck."
            return
        }
        inboxRedirects.append(now)
        openInbox()
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard !isResetting, let url = action.request.url else { decisionHandler(.cancel); return }
        // Resource loads are handled by normal WebKit security. Subframes cannot
        // launch system applications; only main-frame navigation uses the policy.
        if let target = action.targetFrame, !target.isMainFrame { decisionHandler(.allow); return }
        let sourceOrigin = action.sourceFrame.securityOrigin
        let trustedSource = action.sourceFrame.isMainFrame && sourceOrigin.protocol == "https"
            && ["www.instagram.com", "instagram.com"].contains(sourceOrigin.host.lowercased())
            && (sourceOrigin.port == 0 || sourceOrigin.port == 443)
        let sourceURL = webView.url ?? action.sourceFrame.request.url
        let decision = NavigationPolicy.decision(for: url, source: sourceURL,
            activatedLink: action.navigationType == .linkActivated, mainFrameSource: trustedSource)
        switch decision {
        case .allow:
            if action.targetFrame == nil {
                decisionHandler(.cancel)
                webView.load(action.request)
            } else { decisionHandler(.allow) }
        case .inbox:
            decisionHandler(.cancel)
            returnToInbox()
        case .openBrowser(let destination):
            decisionHandler(.cancel)
            UIApplication.shared.open(destination, options: [.universalLinksOnly: false])
        case .cancel:
            decisionHandler(.cancel)
            if NavigationPolicy.classify(webView.url?.absoluteString ?? "") == .authentication {
                deferredFailure = "This sign-in step requires leaving Instagram’s supported login pages. Use direct Instagram login, or retry the inbox."
                errorMessage = deferredFailure
            }
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        if response.isForMainFrame {
            guard let url = response.response.url, NavigationPolicy.classify(url.absoluteString).isEmbedded else {
                decisionHandler(.cancel)
                returnToInbox()
                return
            }
            if let http = response.response as? HTTPURLResponse, http.statusCode >= 500 || http.statusCode == 429 {
                errorMessage = http.statusCode == 429 ? "Instagram is limiting requests. Wait a little before trying again." : "Instagram is temporarily unavailable. Try again when your connection is working."
                decisionHandler(.cancel)
                return
            }
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        errorMessage = deferredFailure
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { show(error) }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { show(error) }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        errorMessage = "The Instagram page stopped. Try again to reopen your conversation."
    }
    private func show(_ error: Error) {
        let code = (error as NSError).code
        guard (error as NSError).domain != NSURLErrorDomain || code != NSURLErrorCancelled else { return }
        if code == NSURLErrorNotConnectedToInternet || code == NSURLErrorNetworkConnectionLost {
            errorMessage = "You appear to be offline. Reconnect and tap Try Again. Messages will also retry when your connection returns."
        } else {
            errorMessage = "Instagram could not load. Check your connection and try again. If sign-in is stuck, reset the local session from the menu."
        }
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        // All target=_blank handling goes through the navigation delegate.
        // Never create another, unrestricted WebView.
        nil
    }
}
