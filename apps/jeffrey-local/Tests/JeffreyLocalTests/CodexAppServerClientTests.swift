import Foundation
import Testing
@testable import JeffreyLocal

actor FakeRPCTransport: CodexRPCTransport {
    var methods: [String] = []
    var notifications: [Data]
    var sentNotifications: [Data] = []
    init(notifications: [Data]) { self.notifications = notifications }
    func request(_ data: Data) async throws -> Data {
        let object = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        let method = object["method"] as! String; methods.append(method)
        let id = object["id"] as! Int
        let result: [String: Any] = method == "thread/start" ? ["thread": ["id": "thread-1"]] : method == "turn/start" ? ["turn": ["id": "turn-1"]] : [:]
        return try JSONSerialization.data(withJSONObject: ["jsonrpc": "2.0", "id": id, "result": result])
    }
    func notify(_ data: Data) async throws { sentNotifications.append(data) }
    func nextMessage() async throws -> Data { notifications.removeFirst() }
    func close() async {}
    func recordedMethods() -> [String] { methods }
    func recordedNotifications() -> [Data] { sentNotifications }
}

@Test func codexApprovalIsForwardedAndOnlyTheExactPhoneDecisionIsReturned() async throws {
    let approval = try JSONSerialization.data(withJSONObject: ["jsonrpc": "2.0", "id": 99, "method": "item/commandExecution/requestApproval", "params": ["itemId": "command-1", "command": "rm old-copy.txt"]])
    let completed = try JSONSerialization.data(withJSONObject: ["jsonrpc": "2.0", "method": "turn/completed", "params": ["turn": ["id": "turn-1"]]])
    let transport = FakeRPCTransport(notifications: [approval, completed])
    let client = CodexAppServerClient(transport: transport)
    let task = AgentTask(id: UUID(), request: "删除旧副本", summary: "删除旧副本", outcome: "删除", riskLevel: .high, capabilities: [.files], leaseToken: "lease")
    let result = try await client.execute(task, progress: { _ in }, approval: { actionID, _, risk in
        #expect(actionID == "command-1"); #expect(risk == .high); return true
    })
    #expect(result == "Codex 已完成任务")
    let sent = await transport.recordedNotifications()
    let texts = sent.map { String(decoding: $0, as: UTF8.self) }
    #expect(texts.contains(where: { $0.contains("\"decision\":\"accept\"") && $0.contains("\"id\":99") }))
    #expect(!texts.contains(where: { $0.contains("acceptForSession") }))
}

@Test func codexAdapterInitializesStartsAThreadAndReturnsRedactedAgentText() async throws {
    let delta = try JSONSerialization.data(withJSONObject: ["jsonrpc": "2.0", "method": "item/agentMessage/delta", "params": ["delta": "找到 /Users/alice/Desktop/a.md"]])
    let completed = try JSONSerialization.data(withJSONObject: ["jsonrpc": "2.0", "method": "turn/completed", "params": ["turn": ["id": "turn-1"]]])
    let transport = FakeRPCTransport(notifications: [delta, completed])
    let client = CodexAppServerClient(transport: transport)
    let task = AgentTask(id: UUID(), request: "查找文件", summary: "查找文件", outcome: "找到", riskLevel: .low, capabilities: [.files], leaseToken: "lease")
    let result = try await client.execute(task, progress: { _ in }, approval: { _, _, _ in true })
    #expect(await transport.recordedMethods() == ["initialize", "thread/start", "turn/start"])
    #expect(result.contains("/Users/•••"))
    #expect(!result.contains("alice"))
}
