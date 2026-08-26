import Foundation

protocol CodexRPCTransport: Sendable {
    func request(_ data: Data) async throws -> Data
    func notify(_ data: Data) async throws
    func nextMessage() async throws -> Data
    func close() async
}

enum CodexAppServerError: Error { case invalidResponse, approvalRequired(String) }

actor CodexAppServerClient: CodexClient {
    private let transport: any CodexRPCTransport
    private var requestID = 0
    private var initialized = false
    private var activeThreadID: String?
    private var activeTurnID: String?

    init(transport: any CodexRPCTransport) { self.transport = transport }

    func reply(_ task: ConversationTask, knowledgeContext: String, progress: @escaping @Sendable (String) async -> Void) async throws -> String {
        try await ensureInitialized()
        let threadResponse = try await request(CodexAppServerProtocol.startConversationThread(id: nextID()))
        guard let result = threadResponse["result"] as? [String: Any], let thread = result["thread"] as? [String: Any], let threadID = thread["id"] as? String else { throw CodexAppServerError.invalidResponse }
        activeThreadID = threadID
        let turnResponse = try await request(CodexAppServerProtocol.startConversationTurn(id: nextID(), threadID: threadID, task: task, knowledgeContext: knowledgeContext))
        guard let turnResult = turnResponse["result"] as? [String: Any], let turn = turnResult["turn"] as? [String: Any], let turnID = turn["id"] as? String else { throw CodexAppServerError.invalidResponse }
        activeTurnID = turnID
        var answer = ""
        while true {
            let object = try decode(try await transport.nextMessage())
            let method = object["method"] as? String ?? ""
            let params = object["params"] as? [String: Any] ?? [:]
            if method == "item/agentMessage/delta", let delta = params["delta"] as? String { answer += delta; await progress(delta) }
            else if method == "turn/completed" { activeThreadID = nil; activeTurnID = nil; return EventRedactor.redact(answer.trimmingCharacters(in: .whitespacesAndNewlines)) }
            else if method.contains("requestApproval"), let responseID = object["id"] { try await transport.notify(try encode(["jsonrpc": "2.0", "id": responseID, "result": ["decision": "decline"]])) }
        }
    }

    func execute(_ task: AgentTask, progress: @escaping @Sendable (String) async -> Void, approval: @escaping @Sendable (String, String, AgentRiskLevel) async throws -> Bool) async throws -> String {
        try await ensureInitialized()
        let threadResponse = try await request(CodexAppServerProtocol.startThread(id: nextID()))
        guard let result = threadResponse["result"] as? [String: Any], let thread = result["thread"] as? [String: Any], let threadID = thread["id"] as? String else { throw CodexAppServerError.invalidResponse }
        activeThreadID = threadID
        let turnResponse = try await request(CodexAppServerProtocol.startTurn(id: nextID(), threadID: threadID, task: task))
        guard let turnResult = turnResponse["result"] as? [String: Any], let turn = turnResult["turn"] as? [String: Any], let turnID = turn["id"] as? String else { throw CodexAppServerError.invalidResponse }
        activeTurnID = turnID

        var answer = ""
        while true {
            let object = try decode(try await transport.nextMessage())
            let method = object["method"] as? String ?? ""
            let params = object["params"] as? [String: Any] ?? [:]
            if method == "item/agentMessage/delta", let delta = params["delta"] as? String {
                let safe = EventRedactor.redact(delta); answer += safe; await progress(safe)
            } else if method == "turn/completed" {
                activeThreadID = nil; activeTurnID = nil
                return answer.isEmpty ? "Codex 已完成任务" : EventRedactor.redact(answer)
            } else if method.contains("requestApproval") {
                guard let responseID = object["id"] else { throw CodexAppServerError.invalidResponse }
                let summary = EventRedactor.redact(approvalSummary(params))
                let risk: AgentRiskLevel = method.localizedCaseInsensitiveContains("fileChange") ? .medium : .high
                let actionID = (params["approvalId"] as? String) ?? (params["itemId"] as? String) ?? String(describing: responseID)
                let accepted = try await approval(actionID, summary, risk)
                try await transport.notify(try encode(["jsonrpc": "2.0", "id": responseID, "result": ["decision": accepted ? "accept" : "decline"]]))
            }
        }
    }

    func cancelCurrentTurn() async {
        if let threadID = activeThreadID, let turnID = activeTurnID {
            _ = try? await request(CodexAppServerProtocol.interrupt(id: nextID(), threadID: threadID, turnID: turnID))
        }
        activeThreadID = nil; activeTurnID = nil
    }

    private func nextID() -> Int { requestID += 1; return requestID }
    private func ensureInitialized() async throws {
        if !initialized { _ = try await request(CodexAppServerProtocol.initialize(id: nextID())); try await transport.notify(try encode(CodexAppServerProtocol.initialized())); initialized = true }
    }
    private func request(_ object: [String: Any]) async throws -> [String: Any] { try decode(try await transport.request(try encode(object))) }
    private func encode(_ object: [String: Any]) throws -> Data { try JSONSerialization.data(withJSONObject: object) }
    private func decode(_ data: Data) throws -> [String: Any] {
        guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw CodexAppServerError.invalidResponse }
        return object
    }
    private func approvalSummary(_ params: [String: Any]) -> String {
        if let reason = params["reason"] as? String { return reason }
        if let command = params["command"] as? String { return command }
        return "Codex 请求扩大本地操作权限"
    }
}
