import Foundation

enum AgentRiskLevel: String, Codable, Sendable { case low, medium, high }
enum AgentCapability: String, Codable, Sendable { case files, shell, browser, applications }

struct AgentTask: Codable, Equatable, Sendable {
    let id: UUID
    let request: String
    let summary: String
    let outcome: String
    let riskLevel: AgentRiskLevel
    let capabilities: [AgentCapability]
    let leaseToken: String
}

struct ConversationCharacter: Codable, Equatable, Sendable {
    let id: String
    let name: String
    let avatarUrl: String?
    let systemPrompt: String
    let personality: String
    let relationshipSetting: String
}

struct ConversationMessage: Codable, Equatable, Sendable {
    let role: String
    let content: String
}

struct ConversationTask: Codable, Equatable, Sendable {
    let id: UUID
    let request: String
    let leaseToken: String
    let character: ConversationCharacter
    let recentMessages: [ConversationMessage]
}
