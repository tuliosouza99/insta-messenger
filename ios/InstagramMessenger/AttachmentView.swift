import SwiftUI
import WebKit

struct AttachmentView: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var session: AttachmentSession

    init(url: URL, dataStore: WKWebsiteDataStore) {
        _session = StateObject(wrappedValue: AttachmentSession(url: url, dataStore: dataStore))
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            Color(red: 0.063, green: 0.067, blue: 0.078)
            WebContent(webView: session.webView)
                .opacity(session.phase == .displaying ? 1 : 0)
                .accessibilityHidden(session.phase != .displaying)
            if session.phase != .displaying {
                VStack(alignment: .leading, spacing: 20) {
                    Button("Back to Message", systemImage: "chevron.left") { dismiss() }
                        .buttonStyle(.bordered)
                    if session.phase == .failed {
                        Text("This attachment couldn’t be loaded.")
                    } else {
                        ProgressView("Loading attachment…")
                    }
                }
                .padding()
            }
        }
        .preferredColorScheme(.dark)
        .onAppear(perform: session.open)
        .onDisappear(perform: session.close)
        .onChange(of: session.wantsDismissal) { _, close in if close { dismiss() } }
    }
}

@MainActor
private final class AttachmentSession: NSObject, ObservableObject, WKNavigationDelegate, WKUIDelegate {
    enum Phase { case loading, displaying, failed }

    @Published private(set) var phase: Phase = .loading
    @Published private(set) var wantsDismissal = false
    let webView: WKWebView
    private let selected: URL
    private let scriptInstalled: Bool
    private var routeObservation: NSKeyValueObservation?

    init(url: URL, dataStore: WKWebsiteDataStore) {
        selected = url
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = dataStore
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = [.audio]
        configuration.defaultWebpagePreferences.preferredContentMode = .mobile
        let world = WKContentWorld.world(name: "MessengerAttachment")
        let resource = Bundle.main.url(forResource: "attachment", withExtension: "js")
        let script = resource.flatMap { try? String(contentsOf: $0, encoding: .utf8) }
        scriptInstalled = script != nil
        if let script {
            configuration.userContentController.addUserScript(WKUserScript(
                source: script, injectionTime: .atDocumentStart, forMainFrameOnly: true, in: world
            ))
        }
        webView = WKWebView(frame: .zero, configuration: configuration)
        super.init()
        configuration.userContentController.add(Bridge(session: self), contentWorld: world, name: "messengerAttachment")
        webView.allowsLinkPreview = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
    }

    func open() {
        guard scriptInstalled else { phase = .failed; return }
        phase = .loading
        webView.navigationDelegate = self
        webView.uiDelegate = self
        routeObservation = webView.observe(\.url, options: [.new]) { [weak self] _, _ in
            Task { @MainActor in
                guard let self, self.routeObservation != nil, let url = self.webView.url,
                      !NavigationPolicy.sameAttachment(url, as: self.selected) else { return }
                self.fail()
            }
        }
        webView.load(URLRequest(url: selected))
    }

    func close() {
        routeObservation = nil
        webView.navigationDelegate = nil
        webView.uiDelegate = nil
        webView.stopLoading()
        webView.pauseAllMediaPlayback(completionHandler: nil)
    }

    private func fail() {
        phase = .failed
        close()
    }

    private func receive(_ message: WKScriptMessage) {
        guard message.webView === webView, message.frameInfo.isMainFrame,
              message.frameInfo.securityOrigin.protocol == "https",
              NavigationPolicy.isInstagramHost(message.frameInfo.securityOrigin.host),
              let url = message.frameInfo.request.url, NavigationPolicy.sameAttachment(url, as: selected),
              let current = webView.url, NavigationPolicy.sameAttachment(current, as: selected),
              message.body as? String == "close" else { return }
        wantsDismissal = true
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard action.targetFrame?.isMainFrame == true, !action.shouldPerformDownload,
              let url = action.request.url else { decisionHandler(.cancel); return }
        if NavigationPolicy.sameAttachment(url, as: selected) {
            decisionHandler(.allow)
        } else {
            decisionHandler(.cancel)
            if phase == .loading { fail() }
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        let status = (response.response as? HTTPURLResponse)?.statusCode ?? 200
        guard response.isForMainFrame, response.canShowMIMEType, status < 400,
              let url = response.response.url, NavigationPolicy.sameAttachment(url, as: selected) else {
            decisionHandler(.cancel)
            if response.isForMainFrame { fail() }
            return
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        phase = .displaying
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if !NavigationPolicy.isCancellation(error as NSError) { fail() }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        if !NavigationPolicy.isCancellation(error as NSError) { fail() }
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { fail() }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? { nil }

    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) { decisionHandler(.deny) }

    private final class Bridge: NSObject, WKScriptMessageHandler {
        weak var session: AttachmentSession?
        init(session: AttachmentSession) { self.session = session }

        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
            session?.receive(message)
        }
    }
}
