import Combine
import Foundation
import Network
import UIKit
import WebKit

@MainActor
final class WebSession: NSObject, ObservableObject, WKNavigationDelegate, WKUIDelegate {
    private enum Failure: String {
        case offline = "You appear to be offline. Reconnect and tap Try Again."
        case network = "Instagram could not load. Check your connection and try again."
        case service = "Instagram could not open this page. Try again or go to the inbox."
        case rateLimited = "Instagram is limiting requests. Wait a little before trying again."
        case signIn = "This step leaves Instagram’s supported login pages. Sign in directly with your Instagram account."
        case routing = "Instagram keeps leaving the inbox. Try again, or reset the local session if sign-in is stuck."
        case reset = "The local session could not be cleared. Try resetting again from the menu."
        case terminated = "The Instagram page stopped. Try again to reopen it."
    }

    @Published private(set) var webView: WKWebView
    @Published private(set) var isLoading = false
    @Published private(set) var isResetting = false
    @Published private(set) var canStayOnPage = false
    @Published private var failure: Failure?
    var errorMessage: String? { failure?.rawValue }

    private static let blankURL = URL(string: "about:blank")!
    private static let linkWorld = WKContentWorld.world(name: "MessengerLinks")
    private static let linkHandlerName = "messengerExternal"

    private var observations: [NSKeyValueObservation] = []
    private let monitor = NWPathMonitor()
    private var wasOffline = false
    private var reconnectRetryAvailable = false
    private var hasCommittedPage = false
    private var activeNavigation: WKNavigation?
    private var retryURL = NavigationPolicy.inbox
    private var inboxRedirects = 0

    override init() {
        webView = Self.makeWebView()
        super.init()
        attachWebView()
        monitor.pathUpdateHandler = { [weak self] path in
            let online = path.status == .satisfied
            Task { @MainActor [weak self] in
                guard let self else { return }
                let reconnected = self.wasOffline && online
                self.wasOffline = !online
                if reconnected { self.reconnectRetryAvailable = true }
                self.retryAfterReconnectIfNeeded()
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
        // The history guard runs in the page world. Link taps are verified
        // separately in a named world that website scripts cannot access.
        installScript("focus", in: .page, on: configuration.userContentController)
        installScript("links", in: linkWorld, on: configuration.userContentController)
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.allowsBackForwardNavigationGestures = true
        view.allowsLinkPreview = false
        view.scrollView.keyboardDismissMode = .interactive
        view.scrollView.contentInsetAdjustmentBehavior = .never
        view.isOpaque = false
        view.backgroundColor = .systemBackground
        return view
    }

    private static func installScript(_ name: String, in world: WKContentWorld, on controller: WKUserContentController) {
        guard let resource = Bundle.main.url(forResource: name, withExtension: "js"),
              let source = try? String(contentsOf: resource, encoding: .utf8) else { return }
        controller.addUserScript(WKUserScript(
            source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true, in: world
        ))
    }

    private func attachWebView() {
        webView.configuration.userContentController.add(
            ExternalLinkHandler(session: self), contentWorld: Self.linkWorld, name: Self.linkHandlerName
        )
        webView.navigationDelegate = self
        webView.uiDelegate = self
        observations = [
            webView.observe(\.isLoading, options: [.new]) { [weak self] view, _ in
                Task { @MainActor [weak self, weak view] in
                    guard let self, let view, self.webView === view, !self.isResetting else { return }
                    self.isLoading = view.isLoading
                    if !self.isLoading { self.retryAfterReconnectIfNeeded() }
                }
            },
            webView.observe(\.url, options: [.new]) { [weak self] view, _ in
                Task { @MainActor [weak self, weak view] in
                    guard let self, let view, self.webView === view,
                          !self.isResetting, !view.isLoading else { return }
                    self.checkCurrentRoute()
                }
            }
        ]
    }

    func openInbox() {
        guard !isResetting else { return }
        inboxRedirects = 0
        load(NavigationPolicy.inbox)
    }

    func retry() {
        guard !isResetting else { return }
        inboxRedirects = 0
        load(retryURL)
    }

    func stayOnPage() {
        guard canStayOnPage else { return }
        failure = nil
        canStayOnPage = false
        checkCurrentRoute()
    }

    private func load(_ url: URL) {
        failure = nil
        canStayOnPage = false
        reconnectRetryAvailable = false
        retryURL = url
        activeNavigation = webView.load(URLRequest(url: url))
    }

    private func retryAfterReconnectIfNeeded() {
        guard reconnectRetryAvailable, !wasOffline, !hasCommittedPage, failure == .offline,
              !isResetting, !webView.isLoading else { return }
        retry()
    }

    func resetSession() {
        guard !isResetting else { return }
        isResetting = true
        isLoading = false
        failure = nil
        canStayOnPage = false
        webView.stopLoading()
        // Wait for the blank page to commit. The old document can still run
        // scripts after stopLoading and before the replacement page commits.
        activeNavigation = webView.load(URLRequest(url: Self.blankURL))
        if activeNavigation == nil { resetFailed() }
    }

    private func resetFailed() {
        isResetting = false
        failure = .reset
        canStayOnPage = hasCommittedPage
    }

    private func eraseWebsiteData() {
        activeNavigation = nil
        hasCommittedPage = false
        let store = webView.configuration.websiteDataStore
        webView.navigationDelegate = nil
        webView.uiDelegate = nil
        observations.removeAll()

        store.removeData(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(), modifiedSince: .distantPast) { [weak self] in
            Task { @MainActor [weak self] in
                guard let self else { return }
                self.webView = Self.makeWebView()
                self.attachWebView()
                self.isResetting = false
                self.openInbox()
            }
        }
    }

    private func returnToInbox() {
        guard inboxRedirects < 3 else {
            webView.stopLoading()
            failure = .routing
            return
        }
        inboxRedirects += 1
        load(NavigationPolicy.inbox)
    }

    private func checkCurrentRoute() {
        guard failure == nil, let url = webView.url else { return }
        if NavigationPolicy.classify(url.absoluteString).isEmbedded {
            retryURL = url
        } else {
            handleDisallowedURL(url)
        }
    }

    private func handleDisallowedURL(_ url: URL) {
        if NavigationPolicy.classify(retryURL.absoluteString) == .authentication,
           !NavigationPolicy.isInstagramHost(url.host) {
            failure = .signIn
            canStayOnPage = hasCommittedPage
        } else {
            returnToInbox()
        }
    }

    private func isTrustedMainFrame(_ frame: WKFrameInfo) -> Bool {
        let origin = frame.securityOrigin
        return frame.isMainFrame && origin.protocol == "https"
            && NavigationPolicy.isInstagramHost(origin.host) && (origin.port == 0 || origin.port == 443)
    }

    private func openExternalLink(_ message: WKScriptMessage) {
        guard message.webView === webView, !isResetting, isTrustedMainFrame(message.frameInfo),
              let source = webView.url, let raw = message.body as? String,
              let destination = NavigationPolicy.externalLink(raw, from: source) else { return }
        UIApplication.shared.open(destination)
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard webView === self.webView, !action.shouldPerformDownload, let url = action.request.url else {
            decisionHandler(.cancel)
            return
        }
        if isResetting {
            let isResetPage = url == Self.blankURL && action.targetFrame?.isMainFrame == true
            decisionHandler(isResetPage ? .allow : .cancel)
            return
        }
        if let target = action.targetFrame, !target.isMainFrame {
            decisionHandler(.allow)
            return
        }
        let trustedSource = isTrustedMainFrame(action.sourceFrame)
        let sourceURL = webView.url ?? action.sourceFrame.request.url
        let isLink = action.navigationType == .linkActivated
        switch NavigationPolicy.decision(for: url, activatedLink: isLink) {
        case .allow:
            if action.targetFrame != nil {
                decisionHandler(.allow)
            } else {
                decisionHandler(.cancel)
                if trustedSource && isLink { webView.load(action.request) }
            }
        case .inbox:
            decisionHandler(.cancel)
            returnToInbox()
        case .cancel:
            decisionHandler(.cancel)
            if trustedSource, let sourceURL, !NavigationPolicy.isInstagramHost(url.host),
               NavigationPolicy.classify(sourceURL.absoluteString) == .authentication {
                failure = .signIn
                canStayOnPage = hasCommittedPage
            }
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        guard webView === self.webView else { decisionHandler(.cancel); return }
        if isResetting {
            let isResetPage = response.isForMainFrame && response.response.url == Self.blankURL
            decisionHandler(isResetPage ? .allow : .cancel)
            return
        }
        if response.isForMainFrame {
            guard let url = response.response.url else { decisionHandler(.cancel); return }
            guard NavigationPolicy.classify(url.absoluteString).isEmbedded else {
                decisionHandler(.cancel)
                handleDisallowedURL(url)
                return
            }
            retryURL = url
            if !response.canShowMIMEType {
                failure = .service
                canStayOnPage = hasCommittedPage
                decisionHandler(.cancel)
                return
            }
            if let http = response.response as? HTTPURLResponse, http.statusCode >= 400 {
                failure = http.statusCode == 429 ? .rateLimited : .service
                canStayOnPage = hasCommittedPage
                decisionHandler(.cancel)
                return
            }
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        guard webView === self.webView, !isResetting else { return }
        activeNavigation = navigation
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        guard webView === self.webView, let navigation, navigation === activeNavigation else { return }
        if isResetting {
            if webView.url == Self.blankURL { eraseWebsiteData() }
            return
        }
        hasCommittedPage = true
        failure = nil
        canStayOnPage = false
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard webView === self.webView, let navigation, navigation === activeNavigation else { return }
        if isResetting {
            if webView.url == Self.blankURL { eraseWebsiteData() }
            else { resetFailed() }
            return
        }
        checkCurrentRoute()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        show(error, from: webView, navigation: navigation, provisional: true)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        show(error, from: webView, navigation: navigation, provisional: false)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        guard webView === self.webView else { return }
        if isResetting {
            if activeNavigation != nil { eraseWebsiteData() }
            return
        }
        hasCommittedPage = false
        canStayOnPage = false
        failure = .terminated
    }

    private func show(_ error: Error, from view: WKWebView, navigation: WKNavigation?, provisional: Bool) {
        guard view === webView, let navigation, navigation === activeNavigation else { return }
        if isResetting {
            resetFailed()
            return
        }
        let error = error as NSError
        guard failure == nil, !NavigationPolicy.isCancellation(error) else { return }
        if !provisional { hasCommittedPage = false }
        canStayOnPage = provisional && hasCommittedPage
        if error.domain == NSURLErrorDomain {
            if let url = error.userInfo[NSURLErrorFailingURLErrorKey] as? URL,
               NavigationPolicy.classify(url.absoluteString).isEmbedded {
                retryURL = url
            }
            if error.code == NSURLErrorNotConnectedToInternet || error.code == NSURLErrorNetworkConnectionLost {
                failure = .offline
                retryAfterReconnectIfNeeded()
                return
            }
        }
        failure = .network
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        nil
    }

    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(.deny)
    }

    private final class ExternalLinkHandler: NSObject, WKScriptMessageHandler {
        weak var session: WebSession?

        init(session: WebSession) { self.session = session }

        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
            session?.openExternalLink(message)
        }
    }
}
