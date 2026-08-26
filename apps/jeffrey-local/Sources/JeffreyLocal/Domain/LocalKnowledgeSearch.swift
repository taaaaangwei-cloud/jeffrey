import Foundation

enum LocalKnowledgeSearch {
    static func search(query: String, vaultPath: String, limit: Int = 8) -> String {
        guard !vaultPath.isEmpty else { return "" }
        let root = URL(fileURLWithPath: vaultPath).standardizedFileURL
        guard let enumerator = FileManager.default.enumerator(at: root, includingPropertiesForKeys: [.isRegularFileKey], options: [.skipsHiddenFiles]) else { return "" }
        let normalized = query.lowercased()
        var terms = Set(normalized.split { !$0.isLetter && !$0.isNumber }.map(String.init).filter { $0.count > 1 })
        let characters = normalized.filter { $0.isLetter || $0.isNumber }
        if characters.count >= 2 {
            for index in characters.indices.dropLast() {
                let next = characters.index(after: index)
                terms.insert(String(characters[index...next]))
            }
        }
        guard !terms.isEmpty else { return "" }
        var matches: [(Int, String)] = []
        for case let file as URL in enumerator where file.pathExtension.lowercased() == "md" {
            guard file.standardizedFileURL.path.hasPrefix(root.path), let text = try? String(contentsOf: file, encoding: .utf8) else { continue }
            let lower = text.lowercased()
            let score = terms.reduce(0) { $0 + (lower.components(separatedBy: $1).count - 1) }
            if score > 0 { matches.append((score, String(text.prefix(1800)))) }
        }
        return matches.sorted { $0.0 > $1.0 }.prefix(limit).map { "- \($0.1)" }.joined(separator: "\n")
    }
}
