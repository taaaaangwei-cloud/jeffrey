import Foundation

protocol HTTPTransport: Sendable {
    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse)
}

struct URLSessionTransport: HTTPTransport {
    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw BackendClientError.invalidResponse }
        return (data, http)
    }
}

struct DeviceSession: Codable, Sendable {
    let deviceID: String
    let token: String
    let expiresAt: Date

    private enum CodingKeys: String, CodingKey { case deviceID, token, expiresAt }
    init(deviceID: String, token: String, expiresAt: Date) { self.deviceID = deviceID; self.token = token; self.expiresAt = expiresAt }
    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        deviceID = try values.decode(String.self, forKey: .deviceID); token = try values.decode(String.self, forKey: .token)
        let text = try values.decode(String.self, forKey: .expiresAt)
        let fractional = ISO8601DateFormatter(); fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let plain = ISO8601DateFormatter()
        guard let date = fractional.date(from: text) ?? plain.date(from: text) else { throw BackendClientError.invalidResponse }
        expiresAt = date
    }
    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(deviceID, forKey: .deviceID); try values.encode(token, forKey: .token)
        let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        try values.encode(formatter.string(from: expiresAt), forKey: .expiresAt)
    }
}

struct PairingInvitation: Codable, Sendable {
    let code: String
    let claimToken: String
    let expiresAt: Date
}

enum BackendClientError: Error { case unpaired, invalidResponse, server(Int) }

actor HTTPBackendClient: BackendClient {
    private let baseURL: URL
    private let store: any SecureStore
    private let transport: any HTTPTransport
    private let identity: P256DeviceIdentity
    private var sequences: [UUID: Int] = [:]
    private var leases: [UUID: String] = [:]

    init(baseURL: URL, store: any SecureStore = KeychainSecureStore(), transport: any HTTPTransport = URLSessionTransport()) throws {
        guard baseURL.scheme == "https" || baseURL.host == "127.0.0.1" || baseURL.host == "localhost" else { throw BackendClientError.invalidResponse }
        self.baseURL = baseURL
        self.store = store
        self.transport = transport
        identity = try P256DeviceIdentity(store: store)
    }

    func beginPairing(deviceName: String = Host.current().localizedName ?? "客户的 Mac") async throws -> PairingInvitation {
        let body = try JSONSerialization.data(withJSONObject: ["publicKey": try identity.publicKeyJWK, "name": deviceName, "agentVersion": "0.1.0"])
        let data = try await send(path: "/api/local-agent/pairing/start", body: body, authenticated: false)
        struct Response: Decodable { let code: String; let claimToken: String; let expiresAt: Date }
        let response = try decoder.decode(Response.self, from: data)
        return PairingInvitation(code: response.code, claimToken: response.claimToken, expiresAt: response.expiresAt)
    }

    func finishPairing(_ invitation: PairingInvitation) async throws -> DeviceSession {
        let body = try JSONEncoder().encode(["code": invitation.code, "claimToken": invitation.claimToken])
        let data = try await send(path: "/api/local-agent/pairing/finish", body: body, authenticated: false)
        struct Response: Decodable { let deviceId: String; let sessionToken: String; let expiresAt: Date }
        let response = try decoder.decode(Response.self, from: data)
        let session = DeviceSession(deviceID: response.deviceId, token: response.sessionToken, expiresAt: response.expiresAt)
        try store.save(JSONEncoder().encode(session), account: "device-session")
        return session
    }

    func claimNextConversation() async throws -> ConversationTask? {
        let data = try await send(path: "/api/local-agent/conversations/claim", body: Data("{}".utf8), authenticated: true)
        struct Response: Decodable { let task: ConversationTask? }
        guard let task = try decoder.decode(Response.self, from: data).task else { return nil }
        leases[task.id] = task.leaseToken
        return task
    }

    func completeConversation(taskID: UUID, reply: String) async throws {
        guard let lease = leases[taskID] else { throw BackendClientError.invalidResponse }
        let body = try JSONSerialization.data(withJSONObject: ["leaseToken": lease, "eventId": UUID().uuidString, "reply": EventRedactor.redact(reply)])
        _ = try await send(path: "/api/local-agent/conversations/\(taskID.uuidString)/complete", body: body, authenticated: true)
        leases.removeValue(forKey: taskID)
    }

    func failConversation(taskID: UUID, code: String) async throws {
        guard let lease = leases[taskID] else { return }
        let body = try JSONSerialization.data(withJSONObject: ["leaseToken": lease, "errorCode": String(code.prefix(100))])
        _ = try? await send(path: "/api/local-agent/conversations/\(taskID.uuidString)/fail", body: body, authenticated: true)
        leases.removeValue(forKey: taskID)
    }

    func claimNextTask() async throws -> AgentTask? {
        let data = try await send(path: "/api/local-agent/tasks/claim", body: Data("{}".utf8), authenticated: true)
        struct Response: Decodable { let task: AgentTask? }
        guard let task = try decoder.decode(Response.self, from: data).task else { return nil }
        leases[task.id] = task.leaseToken; sequences[task.id] = 0
        let body = try JSONEncoder().encode(["type": "started", "leaseToken": task.leaseToken])
        _ = try await send(path: "/api/local-agent/tasks/\(task.id.uuidString)/events", body: body, authenticated: true)
        return task
    }

    func reportProgress(taskID: UUID, message: String) async throws {
        guard let lease = leases[taskID] else { throw BackendClientError.invalidResponse }
        let sequence = (sequences[taskID] ?? 0) + 1; sequences[taskID] = sequence
        let body = try JSONSerialization.data(withJSONObject: ["type": "progress", "leaseToken": lease, "sequence": sequence, "eventId": UUID().uuidString, "publicMessage": EventRedactor.redact(message)])
        _ = try await send(path: "/api/local-agent/tasks/\(taskID.uuidString)/events", body: body, authenticated: true)
    }

    func complete(taskID: UUID, summary: String) async throws {
        guard let lease = leases[taskID] else { throw BackendClientError.invalidResponse }
        let sequence = (sequences[taskID] ?? 0) + 1
        let body = try JSONSerialization.data(withJSONObject: ["leaseToken": lease, "sequence": sequence, "eventId": UUID().uuidString, "resultSummary": EventRedactor.redact(summary)])
        _ = try await send(path: "/api/local-agent/tasks/\(taskID.uuidString)/complete", body: body, authenticated: true)
        leases.removeValue(forKey: taskID); sequences.removeValue(forKey: taskID)
    }

    func fail(taskID: UUID, code: String) async throws {
        guard let lease = leases[taskID] else { return }
        let body = try JSONSerialization.data(withJSONObject: ["leaseToken": lease, "errorCode": String(code.prefix(100))])
        _ = try? await send(path: "/api/local-agent/tasks/\(taskID.uuidString)/fail", body: body, authenticated: true)
        leases.removeValue(forKey: taskID); sequences.removeValue(forKey: taskID)
    }

    func requestApproval(taskID: UUID, actionID: String, summary: String, riskLevel: AgentRiskLevel) async throws -> Bool {
        guard let lease = leases[taskID] else { throw BackendClientError.invalidResponse }
        let body = try JSONSerialization.data(withJSONObject: ["type": "approval_request", "leaseToken": lease, "actionId": actionID, "actionSummary": EventRedactor.redact(summary), "riskLevel": riskLevel.rawValue])
        _ = try await send(path: "/api/local-agent/tasks/\(taskID.uuidString)/events", body: body, authenticated: true)
        struct StatusResponse: Decodable { let status: String }
        for _ in 0..<300 {
            try await Task.sleep(for: .seconds(2))
            let data = try await send(path: "/api/local-agent/tasks/\(taskID.uuidString)/status", body: Data("{}".utf8), authenticated: true)
            let status = try decoder.decode(StatusResponse.self, from: data).status
            if status == "running" { return true }
            if ["canceled", "expired", "failed"].contains(status) { return false }
        }
        return false
    }

    private var decoder: JSONDecoder {
        let value = JSONDecoder(); value.dateDecodingStrategy = .iso8601; return value
    }

    private func send(path: String, body: Data, authenticated: Bool) async throws -> Data {
        guard let url = URL(string: path, relativeTo: baseURL)?.absoluteURL else { throw BackendClientError.invalidResponse }
        var request = URLRequest(url: url); request.httpMethod = "POST"; request.httpBody = body; request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if authenticated {
            guard let data = try store.read(account: "device-session"), let session = try? decoder.decode(DeviceSession.self, from: data), session.expiresAt > Date() else { throw BackendClientError.unpaired }
            let signed = try identity.sign(method: "POST", path: path, body: body)
            request.setValue("Bearer \(session.token)", forHTTPHeaderField: "Authorization")
            request.setValue(session.deviceID, forHTTPHeaderField: "X-Jeffrey-Device-Id")
            request.setValue(String(signed.timestamp), forHTTPHeaderField: "X-Jeffrey-Timestamp")
            request.setValue(signed.nonce, forHTTPHeaderField: "X-Jeffrey-Nonce")
            request.setValue(signed.signature, forHTTPHeaderField: "X-Jeffrey-Signature")
        }
        let (data, response) = try await transport.send(request)
        guard (200..<300).contains(response.statusCode) else { throw BackendClientError.server(response.statusCode) }
        return data
    }
}
