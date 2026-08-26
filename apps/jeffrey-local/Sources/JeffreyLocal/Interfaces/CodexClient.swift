protocol CodexClient: Sendable {
    func reply(_ task: ConversationTask, knowledgeContext: String, progress: @escaping @Sendable (String) async -> Void) async throws -> String
    func execute(_ task: AgentTask, progress: @escaping @Sendable (String) async -> Void, approval: @escaping @Sendable (String, String, AgentRiskLevel) async throws -> Bool) async throws -> String
    func cancelCurrentTurn() async
}
