import Foundation

/// Foundation-only policy, compiled by the local macOS test harness as well as iOS.
enum NavigationPolicy {
    static let inbox = URL(string: "https://www.instagram.com/direct/inbox/")!
    enum Route { case messaging, authentication, external, blocked
        var isEmbedded: Bool { self == .messaging || self == .authentication }
    }
    enum Decision: Equatable { case allow, inbox, cancel }

    private static func publicURL(_ raw: String) -> URL? {
        guard raw.utf8.count <= 8192, !raw.contains("\\"),
              let parts = URLComponents(string: raw), parts.scheme?.lowercased() == "https",
              parts.user == nil, parts.password == nil,
              parts.port == nil || parts.port == 443,
              let host = parts.host?.lowercased(), host.contains("."), !host.hasSuffix("."),
              !host.contains(":"), !host.contains("["),
              !host.split(separator: ".").allSatisfy({ $0.allSatisfy(\.isNumber) }),
              !host.split(separator: ".").contains(where: { $0.hasPrefix("0x") }),
              !["localhost", "local", "internal", "lan", "home", "invalid"].contains(host.split(separator: ".").last.map(String.init) ?? ""),
              let url = parts.url else { return nil }
        return url
    }

    static func classify(_ raw: String) -> Route {
        guard let url = publicURL(raw) else { return .blocked }
        guard isInstagramHost(url.host) else { return externalDestination(raw) == nil ? .blocked : .external }
        guard let parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return .blocked }
        // Reject ambiguous encodings and dot segments rather than relying on the
        // different normalization rules in Foundation, WebKit and JavaScript.
        let path = parts.percentEncodedPath
        let lowerPath = path.lowercased()
        let segments = parts.path.split(separator: "/")
        guard !lowerPath.contains("%2f"), !lowerPath.contains("%5c"),
              !segments.contains(".."), !segments.contains(".") else { return .external }
        if within(path, "/direct") { return .messaging }
        if ["login", "password", "onetap", "signup", "confirm_email", "confirm_phone"].contains(where: { within(path, "/accounts/\($0)") })
            || ["challenge", "checkpoint", "consent", "auth_platform"].contains(where: { within(path, "/\($0)") })
            || within(path, "/privacy/consent") { return .authentication }
        return .external
    }

    static func isInstagramHost(_ host: String?) -> Bool {
        ["www.instagram.com", "instagram.com"].contains(host?.lowercased() ?? "")
    }

    private static func within(_ path: String, _ prefix: String) -> Bool { path == prefix || path.hasPrefix(prefix + "/") }

    static func externalDestination(_ raw: String) -> URL? {
        guard let url = publicURL(raw) else { return nil }
        if url.host?.lowercased() == "l.instagram.com" {
            guard let value = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "u" })?.value,
                  let target = publicURL(value), target.host?.lowercased() != "l.instagram.com" else { return nil }
            return target
        }
        return url
    }

    static func externalLink(_ raw: String, from source: URL) -> URL? {
        guard classify(source.absoluteString) == .messaging, classify(raw) == .external else { return nil }
        return externalDestination(raw)
    }

    static func decision(for url: URL, activatedLink: Bool) -> Decision {
        let route = classify(url.absoluteString)
        if route.isEmbedded { return .allow }
        // Instagram can redirect to the homepage after successful sign-in.
        if !activatedLink, isInstagramHost(url.host), route == .external { return .inbox }
        return .cancel
    }

    static func isCancellation(_ error: NSError) -> Bool {
        // WebKit can report a canceled navigation policy as a provisional load
        // failure (WebKitErrorFrameLoadInterruptedByPolicyChange).
        (error.domain == NSURLErrorDomain && error.code == NSURLErrorCancelled)
            || (error.domain == "WebKitErrorDomain" && error.code == 102)
    }
}
