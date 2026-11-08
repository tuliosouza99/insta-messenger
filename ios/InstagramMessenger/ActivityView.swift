import SwiftUI
import WebKit

struct ActivityView: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var session: ActivitySession

    init(dataStore: WKWebsiteDataStore) {
        _session = StateObject(wrappedValue: ActivitySession(dataStore: dataStore))
    }

    var body: some View {
        NavigationStack {
            ZStack {
                if let view = session.webView {
                    WebContent(webView: view)
                        .id(ObjectIdentifier(view))
                        .opacity(session.phase == .ready ? 1 : 0)
                        .allowsHitTesting(session.phase == .ready)
                        .accessibilityHidden(session.phase != .ready)
                }
                switch session.phase {
                case .loading:
                    ProgressView("Loading Instagram activity…")
                case .ready:
                    EmptyView()
                case .signIn:
                    ContentUnavailableView("Sign In to Instagram", systemImage: "person.crop.circle",
                                           description: Text("Sign in from Messages to see your Instagram activity."))
                case .unavailable:
                    ContentUnavailableView {
                        Label("Notifications Unavailable", systemImage: "bell.slash")
                    } description: {
                        Text("Instagram’s activity panel couldn’t load.")
                    } actions: {
                        Button("Try Again", action: session.open)
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(.background)
            .navigationTitle("Notifications")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Back to Messages", systemImage: "chevron.left") { dismiss() }
                        .labelStyle(.iconOnly)
                }
            }
        }
        .onAppear(perform: session.open)
        .onDisappear(perform: session.close)
    }
}

@MainActor
private final class ActivitySession: NSObject, ObservableObject, WKNavigationDelegate, WKUIDelegate {
    enum Phase { case loading, ready, signIn, unavailable }

    @Published private(set) var webView: WKWebView?
    @Published private(set) var phase: Phase = .loading

    private let dataStore: WKWebsiteDataStore
    private let world = WKContentWorld.world(name: "MessengerActivity")
    private let bridgeName = "messengerActivity"
    private var candidate = 0
    private var sawSignIn = false
    private var timeout: Task<Void, Never>?
    private var routeObservation: NSKeyValueObservation?

    init(dataStore: WKWebsiteDataStore) {
        self.dataStore = dataStore
    }

    func open() {
        candidate = 0
        sawSignIn = false
        openNext()
    }

    func close() {
        timeout?.cancel()
        timeout = nil
        routeObservation = nil
        webView?.navigationDelegate = nil
        webView?.uiDelegate = nil
        webView?.stopLoading()
        webView = nil
    }

    private func openNext() {
        close()
        let candidates = NavigationPolicy.activityPages
        guard candidate < candidates.count,
              let file = Bundle.main.url(forResource: "activity", withExtension: "js"),
              let source = try? String(contentsOf: file, encoding: .utf8) else {
            phase = sawSignIn ? .signIn : .unavailable
            return
        }
        let url = candidates[candidate]
        candidate += 1
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = dataStore
        configuration.defaultWebpagePreferences.preferredContentMode = url.path == "/" ? .desktop : .mobile
        configuration.userContentController.addUserScript(WKUserScript(
            source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true, in: world
        ))
        configuration.userContentController.add(Bridge(session: self), contentWorld: world, name: bridgeName)

        let view = WKWebView(frame: .zero, configuration: configuration)
        view.navigationDelegate = self
        view.uiDelegate = self
        view.allowsLinkPreview = false
        view.scrollView.contentInsetAdjustmentBehavior = .never
        phase = .loading
        webView = view
        routeObservation = view.observe(\.url, options: [.new]) { [weak self, weak view] _, _ in
            Task { @MainActor in
                guard let self, let view, view === self.webView, let url = view.url,
                      !NavigationPolicy.isActivityPage(url) else { return }
                if NavigationPolicy.classify(url.absoluteString) == .authentication { self.sawSignIn = true }
                self.openNext()
            }
        }
        view.load(URLRequest(url: url))
        scheduleTimeout(for: view)
    }

    private func scheduleTimeout(for view: WKWebView) {
        timeout?.cancel()
        timeout = Task { [weak self, weak view] in
            do { try await Task.sleep(for: .seconds(6)) } catch { return }
            guard let self, let view, view === self.webView, self.phase == .loading else { return }
            self.openNext()
        }
    }

    private func receive(_ message: WKScriptMessage) {
        guard let view = webView, message.webView === view, message.frameInfo.isMainFrame,
              let current = view.url, NavigationPolicy.isActivityPage(current),
              let source = message.frameInfo.request.url, NavigationPolicy.isActivityPage(source),
              let body = message.body as? [String: Any] else { return }
        let origin = message.frameInfo.securityOrigin
        guard origin.protocol == "https", NavigationPolicy.isInstagramHost(origin.host),
              origin.port == 0 || origin.port == 443 else { return }

        if let ready = body["ready"] as? Bool {
            if ready {
                timeout?.cancel()
                phase = .ready
            } else if phase == .ready {
                phase = .loading
                scheduleTimeout(for: view)
            }
        } else if phase == .ready, let raw = body["url"] as? String,
                  let url = NavigationPolicy.externalDestination(raw), !NavigationPolicy.isActivityPage(url) {
            UIApplication.shared.open(url)
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard webView === self.webView, action.targetFrame?.isMainFrame == true,
              !action.shouldPerformDownload, let url = action.request.url else {
            decisionHandler(.cancel)
            return
        }
        if NavigationPolicy.isActivityPage(url) {
            decisionHandler(.allow)
        } else {
            decisionHandler(.cancel)
            if NavigationPolicy.classify(url.absoluteString) == .authentication {
                sawSignIn = true
                openNext()
            }
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        guard webView === self.webView, response.isForMainFrame, let url = response.response.url else {
            decisionHandler(.cancel)
            return
        }
        let status = (response.response as? HTTPURLResponse)?.statusCode ?? 200
        if NavigationPolicy.isActivityPage(url), response.canShowMIMEType, status < 400 {
            decisionHandler(.allow)
        } else {
            decisionHandler(.cancel)
            if NavigationPolicy.classify(url.absoluteString) == .authentication { sawSignIn = true }
            openNext()
        }
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        guard webView === self.webView, phase == .ready else { return }
        phase = .loading
        scheduleTimeout(for: webView)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if webView === self.webView, !NavigationPolicy.isCancellation(error as NSError) { openNext() }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        if webView === self.webView, !NavigationPolicy.isCancellation(error as NSError) { openNext() }
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        if webView === self.webView { openNext() }
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

    private final class Bridge: NSObject, WKScriptMessageHandler {
        weak var session: ActivitySession?
        init(session: ActivitySession) { self.session = session }

        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
            session?.receive(message)
        }
    }
}
