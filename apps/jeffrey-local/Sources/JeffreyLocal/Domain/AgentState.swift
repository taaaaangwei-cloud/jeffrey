import Foundation

enum AgentStatus: String, Sendable {
    case unpaired, offline, ready, running, awaitingApproval, paused, incompatible, error

    var label: String {
        switch self {
        case .unpaired: "尚未配对"
        case .offline: "后端离线"
        case .ready: "已连接，等待任务"
        case .running: "Codex 正在执行"
        case .awaitingApproval: "等待手机确认"
        case .paused: "已暂停"
        case .incompatible: "需要更新 Jeffrey Local"
        case .error: "需要处理"
        }
    }

    var canClaimTasks: Bool { self == .ready }
}
