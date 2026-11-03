import Foundation

/// Foundation-only policy, compiled by the local macOS test harness as well as iOS.
enum NavigationPolicy {
    static let inbox = URL(string: "https://www.instagram.com/direct/inbox/")!
    enum Route { case messaging, authentication, external, blocked
        var isEmbedded: Bool { self == .messaging || self == .authentication }
    }
    enum Decision: Equatable { case allow, inbox, cancel, openBrowser(URL) }

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
        guard ["www.instagram.com", "instagram.com"].contains(url.host?.lowercased() ?? "") else { return .external }
        guard let parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return .blocked }
        // Reject ambiguous encodings and dot segments rather than relying on the
        // different normalization rules in Foundation, WebKit and JavaScript.
        let encoded = parts.percentEncodedPath.lowercased()
        let path = parts.path
        guard !encoded.contains("%2f"), !encoded.contains("%5c"),
              !path.split(separator: "/").contains(".."), !path.split(separator: "/").contains(".") else { return .external }
        if within(path, "/direct") { return .messaging }
        if ["login", "password", "onetap", "signup", "confirm_email", "confirm_phone"].contains(where: { within(path, "/accounts/\($0)") })
            || ["challenge", "checkpoint", "consent", "auth_platform"].contains(where: { within(path, "/\($0)") })
            || within(path, "/privacy/consent") { return .authentication }
        return .external
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

    static func decision(for url: URL, source: URL?, activatedLink: Bool, mainFrameSource: Bool) -> Decision {
        let route = classify(url.absoluteString)
        if route.isEmbedded { return .allow }
        if route == .external, activatedLink, mainFrameSource,
           let source, classify(source.absoluteString) == .messaging,
           let destination = externalDestination(url.absoluteString) { return .openBrowser(destination) }
        // Instagram often redirects to the homepage after a successful login.
        if !activatedLink, ["www.instagram.com", "instagram.com"].contains(url.host?.lowercased() ?? ""),
           route == .external { return .inbox }
        return .cancel
    }
}
