import type { LocalComputerTaskStatus } from "./types.ts";

export type LocalComputerTaskAction = "approve" | "approve_action" | "reject" | "cancel";

const presentations: Record<LocalComputerTaskStatus, { label: string; tone: "neutral" | "active" | "warning" | "success" | "danger"; actions: LocalComputerTaskAction[] }> = {
  draft: { label: "正在准备", tone: "neutral", actions: ["cancel"] },
  awaiting_task_approval: { label: "等待你确认", tone: "warning", actions: ["approve", "reject"] },
  queued: { label: "等待 Mac 领取", tone: "active", actions: ["cancel"] },
  leased: { label: "Mac 已领取", tone: "active", actions: ["cancel"] },
  running: { label: "Codex 正在执行", tone: "active", actions: ["cancel"] },
  awaiting_action_approval: { label: "等待确认具体操作", tone: "warning", actions: ["approve_action", "reject"] },
  completed: { label: "已完成", tone: "success", actions: [] },
  canceled: { label: "已取消", tone: "neutral", actions: [] },
  expired: { label: "已过期", tone: "neutral", actions: [] },
  failed: { label: "未能完成", tone: "danger", actions: [] },
};

export function getLocalComputerTaskPresentation(status: LocalComputerTaskStatus) {
  return presentations[status];
}
