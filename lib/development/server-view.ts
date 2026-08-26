import { createReleaseApprovalToken } from "./approval.ts";
import { toPublicDevelopmentTask, type DevelopmentTask } from "./types.ts";

export async function toServerPublicDevelopmentTask(task: DevelopmentTask, approvalSecret?: string) {
  const view = toPublicDevelopmentTask(task);
  if (approvalSecret && task.status === "awaiting_approval" && task.previewSha && Object.values(task.checks).every((check) => check === "passed")) {
    view.approvalToken = await createReleaseApprovalToken(approvalSecret, task.id, task.previewSha);
  }
  return view;
}
