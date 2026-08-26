import type { LocalComputerTaskStatus } from "./types.ts";

const terminalStatuses = new Set<LocalComputerTaskStatus>(["completed", "canceled", "expired", "failed"]);

const allowedTransitions: Record<LocalComputerTaskStatus, ReadonlySet<LocalComputerTaskStatus>> = {
  draft: new Set(["awaiting_task_approval", "queued", "canceled", "expired", "failed"]),
  awaiting_task_approval: new Set(["queued", "canceled", "expired", "failed"]),
  queued: new Set(["leased", "canceled", "expired", "failed"]),
  leased: new Set(["running", "queued", "canceled", "expired", "failed"]),
  running: new Set(["awaiting_action_approval", "completed", "canceled", "expired", "failed"]),
  awaiting_action_approval: new Set(["running", "canceled", "expired", "failed"]),
  completed: new Set(),
  canceled: new Set(),
  expired: new Set(),
  failed: new Set(),
};

export function isLocalComputerTerminal(status: LocalComputerTaskStatus): boolean {
  return terminalStatuses.has(status);
}

export function assertLocalComputerTransition(from: LocalComputerTaskStatus, to: LocalComputerTaskStatus): void {
  if (!allowedTransitions[from].has(to)) {
    throw new Error(`INVALID_LOCAL_COMPUTER_TRANSITION:${from}:${to}`);
  }
}
