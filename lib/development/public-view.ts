import type { PublicDevelopmentTask } from "./types.ts";

const labels: Record<PublicDevelopmentTask["status"], string> = {
  queued: "等待云端处理", running: "正在隔离修改", testing: "正在自动检查", previewing: "正在生成预览",
  awaiting_approval: "预览已准备好", publishing: "正在发布", published: "已发布",
  failed: "修改未完成", canceled: "已取消", rollback_requested: "正在准备恢复",
  rollback_running: "正在恢复旧版本", rolled_back: "已恢复旧版本",
};

export function getDevelopmentTaskPresentation(task: PublicDevelopmentTask) {
  const allPassed = Object.values(task.checks).every((status) => status === "passed");
  const terminal = ["published", "failed", "canceled", "rolled_back"].includes(task.status);
  const detail = task.status === "failed"
    ? "这次修改没有通过安全流程，正式版本未受影响。"
    : task.status === "awaiting_approval"
      ? allPassed ? "全部检查已通过。请先查看预览，再决定是否发布。" : "预览仍有检查未通过，暂时不能发布。"
      : task.status === "published" ? "你确认的版本已经发布。" : "Jeffrey 会在每个安全阶段完成后更新这里。";
  return {
    label: labels[task.status],
    detail,
    canApprove: task.status === "awaiting_approval" && allPassed && Boolean(task.previewSha),
    canCancel: !terminal && !["publishing", "rollback_running"].includes(task.status),
    canContinue: task.status === "awaiting_approval" || task.status === "failed",
    shouldPoll: !terminal,
  };
}
