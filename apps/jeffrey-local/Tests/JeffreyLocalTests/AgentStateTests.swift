import Testing
@testable import JeffreyLocal

@Test func agentStateUsesClearCustomerFacingLabels() {
    #expect(AgentStatus.unpaired.label == "尚未配对")
    #expect(AgentStatus.ready.label == "已连接，等待任务")
    #expect(AgentStatus.awaitingApproval.label == "等待手机确认")
    #expect(AgentStatus.paused.canClaimTasks == false)
    #expect(AgentStatus.ready.canClaimTasks == true)
}
