import Foundation

enum LinkPolicy {
    static let host = "lubimka-app.netlify.app"
    static let home = URL(string: "https://lubimka-app.netlify.app/")!

    private static func secure(_ url: URL) -> Bool {
        url.scheme?.lowercased() == "https" && url.user == nil && url.password == nil &&
        (url.port == nil || url.port == 443)
    }

    static func isApp(_ url: URL) -> Bool {
        secure(url) && url.host?.lowercased() == host
    }

    static func canOpenExternally(_ url: URL) -> Bool {
        if secure(url), let host = url.host, !host.isEmpty { return true }
        switch url.scheme?.lowercased() {
        case "tel":
            let number = String(url.absoluteString.dropFirst(4))
            return !number.isEmpty && number.range(of: #"^[+0-9(). -]+$"#, options: .regularExpression) != nil
        case "mailto":
            return !String(url.absoluteString.dropFirst(7)).isEmpty
        default:
            return false
        }
    }

    static func isTaxi(_ url: URL) -> Bool {
        secure(url) && url.host?.lowercased() == "taxi.lubimka.online" &&
        (url.path == "/zootaxi" || url.path.hasPrefix("/zootaxi/"))
    }

    static func isAppBlob(_ url: URL) -> Bool {
        guard url.scheme == "blob", let originAndID = URL(string: String(url.absoluteString.dropFirst(5))) else { return false }
        return isApp(originAndID)
    }

    // Existing printed tags point to GitHub Pages. Open the same public tag on the app origin.
    static func petTag(_ input: String) -> URL? {
        guard let parts = URLComponents(string: input), let url = parts.url, secure(url),
              parts.percentEncodedQuery == nil, let fragment = parts.percentEncodedFragment,
              fragment.range(of: #"^tag=[0-9a-f]{32}$"#, options: .regularExpression) != nil else { return nil }
        let legacy = parts.host?.lowercased() == "timvajb-design.github.io" &&
                     ["/lubimka/", "/lubimka"].contains(parts.percentEncodedPath)
        let current = isApp(url) && ["", "/"].contains(parts.percentEncodedPath)
        guard legacy || current else { return nil }
        var destination = URLComponents(url: home, resolvingAgainstBaseURL: false)
        destination?.percentEncodedFragment = fragment
        return destination?.url
    }
}

