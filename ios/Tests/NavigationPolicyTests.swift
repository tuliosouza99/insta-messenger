import Foundation

@main
struct NavigationPolicyTests {
    static func main() {
        var failures = 0
        func check(_ condition: @autoclosure () -> Bool, _ description: String) {
            if !condition() { fputs("FAIL: \(description)\n", stderr); failures += 1 }
        }
        for path in ["/direct/", "/direct/inbox/", "/direct/t/123/", "/direct/new/"] {
            check(NavigationPolicy.classify("https://www.instagram.com\(path)") == .messaging, path)
        }
        for path in ["/accounts/login/", "/accounts/login/two_factor/", "/accounts/password/reset/", "/accounts/onetap/", "/challenge/abc/", "/checkpoint/", "/consent/", "/privacy/consent/", "/auth_platform/"] {
            check(NavigationPolicy.classify("https://instagram.com\(path)") == .authentication, path)
        }
        for raw in ["https://www.instagram.com/", "https://www.instagram.com/explore/", "https://www.instagram.com/reels/", "https://www.instagram.com/direct/../explore/", "https://www.instagram.com/direct/%2e%2e/explore/", "https://www.instagram.com/direct%2finbox/", "https://www.instagram.com/%64irect/inbox/", "https://www.instagram.com/accounts/delete/", "https://instagram.com.evil.test/direct/", "https://example.com/"] {
            check(!NavigationPolicy.classify(raw).isEmbedded, "must not embed \(raw)")
        }
        for raw in ["javascript:alert(1)", "file:///etc/passwd", "http://example.com/", "https://user@example.com/", "https://example.com:8080/", "https://127.1/", "https://2130706433/", "https://0x7f000001/", "https://[::1]/", "https://router.local/", "https://intranet/", "https://www.instagram.com./direct/", "https://www.instagram.com/direct/\\explore/"] {
            check(NavigationPolicy.externalDestination(raw) == nil, "unsafe URL \(raw)")
            check(!NavigationPolicy.classify(raw).isEmbedded, "unsafe embed \(raw)")
        }
        check(NavigationPolicy.externalDestination("https://example.com/a?q=hello")?.absoluteString == "https://example.com/a?q=hello", "public HTTPS")
        check(NavigationPolicy.externalDestination("https://l.instagram.com/?u=https%3A%2F%2Fexample.com%2Fhello")?.absoluteString == "https://example.com/hello", "unwrap link shim")
        check(NavigationPolicy.externalDestination("https://l.instagram.com/?u=javascript%3Aalert(1)") == nil, "reject unsafe shim")
        let inbox = URL(string: "https://www.instagram.com/direct/inbox/")!
        let external = URL(string: "https://example.com/")!
        let login = URL(string: "https://www.instagram.com/accounts/login/")!
        let home = URL(string: "https://www.instagram.com/")!
        check(NavigationPolicy.decision(for: external, activatedLink: true) == .cancel, "navigation type alone cannot authorize opening a browser")
        check(NavigationPolicy.decision(for: external, activatedLink: false) == .cancel, "script navigation cannot open browser")
        check(NavigationPolicy.externalLink(external.absoluteString, from: inbox) == external, "validate the isolated conversation handoff")
        check(NavigationPolicy.externalLink(external.absoluteString, from: login) == nil, "auth cannot open external browser")
        check(NavigationPolicy.externalLink("https://router.local/", from: inbox) == nil, "isolated handoff rechecks destinations")
        check(NavigationPolicy.decision(for: inbox, activatedLink: false) == .allow, "initial inbox load")
        check(NavigationPolicy.decision(for: home, activatedLink: false) == .inbox, "post-login home redirect returns to Direct")
        check(NavigationPolicy.isCancellation(NSError(domain: "WebKitErrorDomain", code: 102)), "WebKit policy interruption is cancellation")
        check(NavigationPolicy.isCancellation(NSError(domain: NSURLErrorDomain, code: NSURLErrorCancelled)), "URL cancellation")
        check(!NavigationPolicy.isCancellation(NSError(domain: NSURLErrorDomain, code: NSURLErrorNotConnectedToInternet)), "offline failure is not cancellation")
        for raw in ["https://www.instagram.com/", "https://instagram.com/accounts/activity/", "https://www.instagram.com/notifications?ref=home"] {
            check(NavigationPolicy.isActivityPage(URL(string: raw)!), "activity viewer can load \(raw)")
            check(!NavigationPolicy.classify(raw).isEmbedded, "messages keeps activity shell out of the inbox web view")
        }
        for raw in ["http://www.instagram.com/", "https://www.instagram.com/explore/", "https://www.instagram.com/notifications/settings/", "https://www.instagram.com/accounts/activity%2f", "https://www.instagram.com/direct/inbox/", "https://user@www.instagram.com/", "https://example.com/notifications/"] {
            check(!NavigationPolicy.isActivityPage(URL(string: raw)!), "activity viewer rejects \(raw)")
        }
        let thread = URL(string: "https://www.instagram.com/direct/t/123/")!
        check(NavigationPolicy.decision(for: home, activatedLink: true, from: thread) == .inbox, "a Home href in a conversation returns to the inbox")
        check(NavigationPolicy.externalLink(home.absoluteString, from: thread) == nil, "Home cannot be handed off to iOS")
        check(NavigationPolicy.decision(for: URL(string: "https://www.instagram.com/reel/SHARED/")!,
                                        activatedLink: false, from: thread) == .cancel,
              "unhandled Reel navigation preserves the conversation instead of loading the inbox")
        let selected = URL(string: "https://www.instagram.com/reel/SHARED/")!
        check(NavigationPolicy.attachmentDestination("https://instagram.com/person/reel/SHARED/?igsh=tracking") == selected, "Reel link is canonicalized")
        check(NavigationPolicy.sameAttachment(URL(string: "https://www.instagram.com/p/SHARED/")!, as: selected), "same Reel identity survives a canonical redirect")
        for raw in ["https://www.instagram.com/reel/NEXT/", "https://www.instagram.com/reels/", "https://www.instagram.com/reel/SHARED/liked_by/", "https://example.com/reel/SHARED/"] {
            check(!NavigationPolicy.sameAttachment(URL(string: raw)!, as: selected), "viewer rejects \(raw)")
        }
        if failures > 0 { exit(1) }
        print("Swift navigation policy: all checks passed")
    }
}
