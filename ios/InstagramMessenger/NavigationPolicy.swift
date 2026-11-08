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

    // These pages are only allowed in the separate activity viewer.
    static let activityPages = ["/accounts/activity/", "/notifications/", "/"].map {
        URL(string: "https://www.instagram.com" + $0)!
    }

    static func isActivityPage(_ url: URL) -> Bool {
        guard let safe = publicURL(url.absoluteString), isInstagramHost(safe.host),
              let path = URLComponents(url: safe, resolvingAgainstBaseURL: false)?.percentEncodedPath else { return false }
        return ["", "/", "/accounts/activity", "/accounts/activity/", "/notifications", "/notifications/"].contains(path)
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

    static func isInstagramHome(_ url: URL) -> Bool {
        guard let safe = publicURL(url.absoluteString), isInstagramHost(safe.host),
              let path = URLComponents(url: safe, resolvingAgainstBaseURL: false)?.percentEncodedPath else { return false }
        return path.isEmpty || path == "/"
    }

    static func isThread(_ url: URL) -> Bool {
        guard classify(url.absoluteString) == .messaging,
              let path = URLComponents(url: url, resolvingAgainstBaseURL: false)?.percentEncodedPath else { return false }
        return path.range(of: #"^/direct/t/[^/]+/?$"#, options: .regularExpression) != nil
    }

    static func attachmentDestination(_ raw: String) -> URL? {
        guard let safe = publicURL(raw), isInstagramHost(safe.host),
              let parts = URLComponents(url: safe, resolvingAgainstBaseURL: false),
              parts.percentEncodedPath.range(
                of: #"^/(?:[a-z0-9._]{1,30}/)?(p|reel|tv)/[a-z0-9_-]{1,128}/?$"#,
                options: [.regularExpression, .caseInsensitive]
              ) != nil else { return nil }
        let segments = parts.percentEncodedPath.split(separator: "/").suffix(2)
        var target = URLComponents()
        target.scheme = "https"
        target.host = "www.instagram.com"
        target.path = "/" + segments.joined(separator: "/") + "/"
        if let index = parts.queryItems?.first(where: { $0.name == "img_index" })?.value,
           index.range(of: #"^[1-9][0-9]{0,2}$"#, options: .regularExpression) != nil {
            target.queryItems = [URLQueryItem(name: "img_index", value: index)]
        }
        return target.url
    }

    static func sameAttachment(_ url: URL, as selected: URL) -> Bool {
        guard let candidate = attachmentDestination(url.absoluteString),
              let selection = attachmentDestination(selected.absoluteString) else { return false }
        return candidate.lastPathComponent == selection.lastPathComponent
    }

    static func externalLink(_ raw: String, from source: URL) -> URL? {
        guard classify(source.absoluteString) == .messaging, classify(raw) == .external,
              let destination = externalDestination(raw), !isInstagramHome(destination) else { return nil }
        return destination
    }

    static func decision(for url: URL, activatedLink: Bool, from source: URL? = nil) -> Decision {
        let route = classify(url.absoluteString)
        if route.isEmbedded { return .allow }
        if let source, classify(source.absoluteString) == .messaging {
            return isInstagramHome(url) ? .inbox : .cancel
        }
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
