import Foundation

enum AppServerProcessError: Error { case codexNotInstalled, launchFailed }

final class AppServerProcess: @unchecked Sendable {
    let process: Process
    let temporaryDirectory: URL
    let webSocketURL: URL
    let token: String

    private init(process: Process, temporaryDirectory: URL, webSocketURL: URL, token: String) {
        self.process = process; self.temporaryDirectory = temporaryDirectory; self.webSocketURL = webSocketURL; self.token = token
    }

    static func start() throws -> AppServerProcess {
        let candidates = [URL(fileURLWithPath: "/Applications/ChatGPT.app/Contents/Resources/codex"), URL(fileURLWithPath: "/usr/local/bin/codex"), URL(fileURLWithPath: "/opt/homebrew/bin/codex")]
        guard let executable = candidates.first(where: { FileManager.default.isExecutableFile(atPath: $0.path) }) else { throw AppServerProcessError.codexNotInstalled }
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("jeffrey-app-server-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: false, attributes: [.posixPermissions: 0o700])
        let token = Data((0..<32).map { _ in UInt8.random(in: 0...255) }).base64URLEncodedString
        let tokenFile = directory.appendingPathComponent("capability-token")
        try Data(token.utf8).write(to: tokenFile, options: .atomic)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: tokenFile.path)
        let port = Int.random(in: 49_152...60_000)
        let url = URL(string: "ws://127.0.0.1:\(port)")!
        let process = Process(); process.executableURL = executable
        process.arguments = ["app-server", "--listen", url.absoluteString, "--ws-auth", "capability-token", "--ws-token-file", tokenFile.path]
        process.standardOutput = Pipe(); process.standardError = Pipe()
        do { try process.run() } catch { try? FileManager.default.removeItem(at: directory); throw AppServerProcessError.launchFailed }
        return AppServerProcess(process: process, temporaryDirectory: directory, webSocketURL: url, token: token)
    }

    func stop() {
        if process.isRunning { process.terminate() }
        try? FileManager.default.removeItem(at: temporaryDirectory)
    }

    deinit { stop() }
}
