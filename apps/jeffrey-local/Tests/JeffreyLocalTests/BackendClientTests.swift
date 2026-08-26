import Foundation
import Testing
@testable import JeffreyLocal

final class MemorySecureStore: SecureStore, @unchecked Sendable {
    var values: [String: Data] = [:]
    func save(_ data: Data, account: String) throws { values[account] = data }
    func read(account: String) throws -> Data? { values[account] }
    func delete(account: String) throws { values.removeValue(forKey: account) }
}

actor RecordingTransport: HTTPTransport {
    var requests: [URLRequest] = []
    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        requests.append(request)
        let payload = #"{"success":true,"task":null}"#
        return (Data(payload.utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
    }
    func lastRequest() -> URLRequest? { requests.last }
}

@Test func backendSignsEveryAuthenticatedRequestWithoutPuttingSecretsInTheBody() async throws {
    let store = MemorySecureStore()
    let session = DeviceSession(deviceID: "device-1", token: "session-secret", expiresAt: Date().addingTimeInterval(3_600))
    try store.save(JSONEncoder().encode(session), account: "device-session")
    let transport = RecordingTransport()
    let client = try HTTPBackendClient(baseURL: URL(string: "https://jeffrey.example")!, store: store, transport: transport)
    _ = try await client.claimNextTask()
    let request = await transport.lastRequest()
    #expect(request?.value(forHTTPHeaderField: "X-Jeffrey-Device-Id") == "device-1")
    #expect(request?.value(forHTTPHeaderField: "X-Jeffrey-Signature")?.isEmpty == false)
    #expect(request?.httpBody == Data("{}".utf8))
    let bodyText = String(decoding: request?.httpBody ?? Data(), as: UTF8.self)
    #expect(!bodyText.contains("session-secret"))
}
