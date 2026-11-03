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
        for raw in ["https://www.instagram.com/", "https://www.instagram.com/explore/", "https://www.instagram.com/reels/", "https://www.instagram.com/direct/../explore/", "https://www.instagram.com/direct/%2e%2e/explore/", "https://www.instagram.com/direct%2finbox/", "https://www.instagram.com/accounts/delete/", "https://instagram.com.evil.test/direct/", "https://example.com/"] {
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
        check(NavigationPolicy.decision(for: external, source: inbox, activatedLink: true, mainFrameSource: true) == .openBrowser(external), "explicit chat link")
        check(NavigationPolicy.decision(for: external, source: inbox, activatedLink: false, mainFrameSource: true) == .cancel, "script navigation cannot open browser")
        check(NavigationPolicy.decision(for: external, source: inbox, activatedLink: true, mainFrameSource: false) == .cancel, "iframe cannot open browser")
        check(NavigationPolicy.decision(for: external, source: URL(string: "https://www.instagram.com/accounts/login/")!, activatedLink: true, mainFrameSource: true) == .cancel, "auth cannot open external browser")
        check(NavigationPolicy.decision(for: inbox, source: nil, activatedLink: false, mainFrameSource: true) == .allow, "initial inbox load")
        check(NavigationPolicy.decision(for: URL(string: "https://www.instagram.com/")!, source: inbox, activatedLink: false, mainFrameSource: true) == .inbox, "automatic feed redirect returns to inbox")
        if failures > 0 { exit(1) }
        print("Swift navigation policy: all checks passed")
    }
}
