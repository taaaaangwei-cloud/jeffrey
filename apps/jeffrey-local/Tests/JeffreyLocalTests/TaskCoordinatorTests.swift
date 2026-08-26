import Foundation
import Testing
@testable import JeffreyLocal

final class FakeBackend: BackendClient, @unchecked Sendable {
    var nextConversation: ConversationTask?
    var nextTask: AgentTask?
    var completed: [(UUID, String)] = []
    var completedConversations: [(UUID, String)] = []
    init(task: AgentTask?, conversation: ConversationTask? = nil) { nextTask = task; nextConversation = conversation }
    func claimNextConversation() async throws -> ConversationTask? { defer { nextConversation = nil }; return nextConversation }
    func completeConversation(taskID: UUID, reply: String) async throws { completedConversations.append((taskID, reply)) }
    func failConversation(taskID: UUID, code: String) async throws {}
    func claimNextTask() async throws -> AgentTask? { defer { nextTask = nil }; return nextTask }
    func reportProgress(taskID: UUID, message: String) async throws {}
    func complete(taskID: UUID, summary: String) async throws { completed.append((taskID, summary)) }
    func fail(taskID: UUID, code: String) async throws {}
    func requestApproval(taskID: UUID, actionID: String, summary: String, riskLevel: AgentRiskLevel) async throws -> Bool { true }
}

final class FakeCodex: CodexClient, @unchecked Sendable {
    var executed: [UUID] = []
    var replied: [UUID] = []
    var canceled = false
    func reply(_ task: ConversationTask, knowledgeContext: String, progress: @escaping @Sendable (String) async -> Void) async throws -> String { replied.append(task.id); return "我在。" }
    func execute(_ task: AgentTask, progress: @escaping @Sendable (String) async -> Void, approval: @escaping @Sendable (String, String, AgentRiskLevel) async throws -> Bool) async throws -> String {
        executed.append(task.id); await progress("正在读取"); return "已完成"
    }
    func cancelCurrentTurn() async { canceled = true }
}

@Test func coordinatorPrioritizesAndCompletesOneConversation() async throws {
    let conversation = ConversationTask(id: UUID(), request: "今天好累", leaseToken: "lease", character: ConversationCharacter(id: "character", name: "Jeffrey", avatarUrl: nil, systemPrompt: "", personality: "温柔", relationshipSetting: "伴侣"), recentMessages: [])
    let backend = FakeBackend(task: nil, conversation: conversation)
    let codex = FakeCodex()
    let coordinator = TaskCoordinator(backend: backend, codex: codex)
    await coordinator.setConnected(true)
    try await coordinator.runOnce()
    #expect(codex.replied == [conversation.id])
    #expect(backend.completedConversations.first?.1 == "我在。")
}

@Test func coordinatorClaimsAndCompletesExactlyOneTask() async throws {
    let task = AgentTask(id: UUID(), request: "查找合同", summary: "查找合同", outcome: "找到合同", riskLevel: .low, capabilities: [.files], leaseToken: "lease")
    let backend = FakeBackend(task: task)
    let codex = FakeCodex()
    let coordinator = TaskCoordinator(backend: backend, codex: codex)
    await coordinator.setConnected(true)
    try await coordinator.runOnce()
    #expect(codex.executed == [task.id])
    #expect(backend.completed.first?.0 == task.id)
    #expect(await coordinator.status == .ready)
}

@Test func pauseCancelsTheCurrentCodexTurn() async {
    let backend = FakeBackend(task: nil)
    let codex = FakeCodex()
    let coordinator = TaskCoordinator(backend: backend, codex: codex)
    await coordinator.pause()
    #expect(codex.canceled)
    #expect(await coordinator.status == .paused)
}
