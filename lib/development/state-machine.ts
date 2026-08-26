import type { DevelopmentTaskStatus } from "./types.ts";

const allowedTransitions: Record<DevelopmentTaskStatus, ReadonlySet<DevelopmentTaskStatus>> = {
  queued: new Set(["running", "failed", "canceled"]),
  running: new Set(["testing", "failed", "canceled"]),
  testing: new Set(["previewing", "failed", "canceled"]),
  previewing: new Set(["awaiting_approval", "failed", "canceled"]),
  awaiting_approval: new Set(["queued", "publishing", "failed", "canceled"]),
  publishing: new Set(["published", "failed", "rollback_running"]),
  published: new Set(["rollback_requested"]),
  failed: new Set(),
  canceled: new Set(),
  rollback_requested: new Set(["rollback_running"]),
  rollback_running: new Set(["rolled_back", "failed"]),
  rolled_back: new Set(),
};

export function assertDevelopmentTransition(from: DevelopmentTaskStatus, to: DevelopmentTaskStatus): void {
  if (!allowedTransitions[from].has(to)) {
    throw new Error(`INVALID_DEVELOPMENT_TRANSITION:${from}:${to}`);
  }
}
