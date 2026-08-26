import Foundation

enum EventRedactor {
    private static let patterns: [(String, String)] = [
        (#"/Users/[^/\s]+"#, "/Users/•••"),
        (#"(?i)\b(token|secret|password|api[_-]?key)\s*[=:]\s*[^\s,;]+"#, "$1=•••"),
        (#"sk-[A-Za-z0-9_-]{12,}"#, "sk-•••"),
    ]

    static func redact(_ input: String) -> String {
        var output = input
        for (pattern, replacement) in patterns {
            output = output.replacingOccurrences(of: pattern, with: replacement, options: .regularExpression)
        }
        return String(output.prefix(2_000))
    }
}
