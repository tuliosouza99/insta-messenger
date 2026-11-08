import SwiftUI
import WebKit

struct MessengerView: View {
    @StateObject private var session = WebSession()
    @State private var confirmReset = false

    var body: some View {
        NavigationStack {
            ZStack {
                WebContent(webView: session.webView)
                    .id(ObjectIdentifier(session.webView))
                    .accessibilityHidden(session.errorMessage != nil || session.isResetting)
                if let error = session.errorMessage {
                    VStack(spacing: 16) {
                        Image(systemName: "wifi.exclamationmark").font(.largeTitle)
                        Text("Unable to open messages").font(.headline)
                        Text(error).font(.callout).multilineTextAlignment(.center)
                        Button("Try Again", action: session.retry).buttonStyle(.borderedProminent)
                        if session.canStayOnPage {
                            Button("Stay on This Page", action: session.stayOnPage)
                        }
                        Button("Go to Inbox", action: session.openInbox)
                    }
                    .padding(24)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(.background)
                    .accessibilityElement(children: .contain)
                }
                if session.isResetting { ProgressView("Clearing local session…").padding().background(.regularMaterial) }
            }
            .navigationTitle("Messages")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button(action: session.openInbox) { Image(systemName: "tray") }
                        .accessibilityLabel("Open inbox")
                        .disabled(session.isResetting)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button("Reload", systemImage: "arrow.clockwise", action: session.retry)
                        Button("Reset Local Session…", systemImage: "person.crop.circle.badge.xmark", role: .destructive) { confirmReset = true }
                    } label: { Image(systemName: "ellipsis.circle").accessibilityLabel("Messages menu") }
                    .disabled(session.isResetting)
                }
            }
            .safeAreaInset(edge: .top, spacing: 0) {
                if session.isLoading { ProgressView().progressViewStyle(.linear).accessibilityLabel("Loading messages") }
            }
            .confirmationDialog("Reset this iPhone’s Instagram session?", isPresented: $confirmReset, titleVisibility: .visible) {
                Button("Reset Local Session", role: .destructive, action: session.resetSession)
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This clears Instagram website data on this iPhone app. You will need to sign in again.")
            }
        }
        // Keep the WebView inside SwiftUI's safe area. The keyboard resizes the
        // available region so Instagram's composer stays above the keyboard.
    }
}

private struct WebContent: UIViewRepresentable {
    let webView: WKWebView
    func makeUIView(context: Context) -> WKWebView { webView }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
