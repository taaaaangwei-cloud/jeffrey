import Foundation

protocol BackendClient: Sendable {
    func claimNextConversation() async throws -> ConversationTask?
    func completeConversation(taskID: UUID, reply: String) async throws
    func failConversation(taskID: UUID, code: String) async throws
    func claimNextTask() async throws -> AgentTask?
    func reportProgress(taskID: UUID, message: String) async throws
    func complete(taskID: UUID, summary: String) async throws
    func fail(taskID: UUID, code: String) async throws
    func requestApproval(taskID: UUID, actionID: String, summary: String, riskLevel: AgentRiskLevel) async throws -> Bool
}
