import { createLocalApprovalToken } from "./approval.ts";
import { toPublicLocalComputerTask, type LocalComputerTask } from "./types.ts";

export async function toServerPublicLocalComputerTask(task: LocalComputerTask, approvalSecret?: string) {
  let approvalToken: string | undefined;
  if (approvalSecret && task.deviceId && (task.status === "awaiting_task_approval" || task.status === "awaiting_action_approval")) {
    const riskLevel = task.status === "awaiting_action_approval" ? task.pendingActionRiskLevel : task.riskLevel;
    if (riskLevel) approvalToken = await createLocalApprovalToken(approvalSecret, { userId: task.userId, deviceId: task.deviceId, taskId: task.id, actionId: task.status === "awaiting_action_approval" ? task.pendingActionId : null, riskLevel });
  }
  return { task: toPublicLocalComputerTask(task), approvalToken };
}
