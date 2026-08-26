import Foundation

enum RPCTransportError: Error { case invalidMessage, disconnected }

actor WebSocketRPCTransport: CodexRPCTransport {
    private let appServer: AppServerProcess
    private let socket: URLSessionWebSocketTask
    private var inbox: [Data] = []

    init(appServer: AppServerProcess) {
        self.appServer = appServer
        var request = URLRequest(url: appServer.webSocketURL)
        request.setValue("Bearer \(appServer.token)", forHTTPHeaderField: "Authorization")
        socket = URLSession.shared.webSocketTask(with: request)
        socket.resume()
    }

    func request(_ data: Data) async throws -> Data {
        guard let requestObject = try JSONSerialization.jsonObject(with: data) as? [String: Any], let requestID = requestObject["id"] as? Int else { throw RPCTransportError.invalidMessage }
        try await send(data)
        while true {
            let message = try await receive()
            if let object = try JSONSerialization.jsonObject(with: message) as? [String: Any], let responseID = object["id"] as? Int, responseID == requestID { return message }
            inbox.append(message)
        }
    }

    func notify(_ data: Data) async throws { try await send(data) }

    func nextMessage() async throws -> Data {
        if !inbox.isEmpty { return inbox.removeFirst() }
        return try await receive()
    }

    func close() async {
        socket.cancel(with: .goingAway, reason: nil)
        appServer.stop()
    }

    private func send(_ data: Data) async throws {
        guard let text = String(data: data, encoding: .utf8) else { throw RPCTransportError.invalidMessage }
        try await socket.send(.string(text))
    }

    private func receive() async throws -> Data {
        switch try await socket.receive() {
        case .string(let text): return Data(text.utf8)
        case .data(let data): return data
        @unknown default: throw RPCTransportError.invalidMessage
        }
    }
}
