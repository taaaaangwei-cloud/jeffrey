import Foundation

actor TaskCoordinator {
    private let backend: any BackendClient
    private let codex: any CodexClient
    private(set) var status: AgentStatus = .offline
    private var activeTaskID: UUID?

    init(backend: any BackendClient, codex: any CodexClient) {
        self.backend = backend
        self.codex = codex
    }

    func setConnected(_ connected: Bool) {
        guard status != .paused else { return }
        status = connected ? .ready : .offline
    }

    func runOnce() async throws {
        guard status.canClaimTasks, activeTaskID == nil else { return }
        if let conversation = try await backend.claimNextConversation() {
            activeTaskID = conversation.id
            status = .running
            do {
                let vaultPath = UserDefaults.standard.string(forKey: "obsidianVaultPath") ?? ""
                let context = LocalKnowledgeSearch.search(query: conversation.request, vaultPath: vaultPath)
                let reply = try await codex.reply(conversation, knowledgeContext: context, progress: { _ in })
                try await backend.completeConversation(taskID: conversation.id, reply: reply)
                activeTaskID = nil; status = .ready
                return
            } catch {
                try? await backend.failConversation(taskID: conversation.id, code: "CODEX_CONVERSATION_FAILED")
                activeTaskID = nil; status = .error
                throw error
            }
        }
        guard let task = try await backend.claimNextTask() else { return }
        activeTaskID = task.id
        status = .running
        do {
            let backend = self.backend
            let summary = try await codex.execute(task, progress: { message in
                try? await backend.reportProgress(taskID: task.id, message: message)
            }, approval: { actionID, summary, riskLevel in
                try await backend.requestApproval(taskID: task.id, actionID: actionID, summary: summary, riskLevel: riskLevel)
            })
            try await backend.complete(taskID: task.id, summary: summary)
            activeTaskID = nil
            status = .ready
        } catch {
            try? await backend.fail(taskID: task.id, code: "CODEX_EXECUTION_FAILED")
            activeTaskID = nil
            status = .error
            throw error
        }
    }

    func pause() async {
        await codex.cancelCurrentTurn()
        activeTaskID = nil
        status = .paused
    }

    func resume() { status = .offline }
}
