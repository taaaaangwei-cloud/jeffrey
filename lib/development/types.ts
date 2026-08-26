export const developmentTaskStatuses = [
  "queued",
  "running",
  "testing",
  "previewing",
  "awaiting_approval",
  "publishing",
  "published",
  "failed",
  "canceled",
  "rollback_requested",
  "rollback_running",
  "rolled_back",
] as const;

export type DevelopmentTaskStatus = (typeof developmentTaskStatuses)[number];
export type DevelopmentRiskLevel = "normal" | "sensitive";

export interface DevelopmentCheckSummary {
  lint: "pending" | "passed" | "failed" | "skipped";
  typecheck: "pending" | "passed" | "failed" | "skipped";
  tests: "pending" | "passed" | "failed" | "skipped";
  build: "pending" | "passed" | "failed" | "skipped";
}

export interface DevelopmentTask {
  id: string;
  userId: string;
  conversationId: string;
  sourceMessageId: string;
  requestText: string;
  requestSummary: string;
  requestedChanges: string[];
  riskLevel: DevelopmentRiskLevel;
  status: DevelopmentTaskStatus;
  repositoryFullName: string | null;
  branchName: string | null;
  baseSha: string | null;
  previewSha: string | null;
  runnerRunId: string | null;
  runnerUrl: string | null;
  previewUrl: string | null;
  checks: DevelopmentCheckSummary;
  changeSummary: string | null;
  approvalNonceHash: string | null;
  approvalExpiresAt: string | null;
  approvedAt: string | null;
  publishedSha: string | null;
  previousProductionSha: string | null;
  publishedAt: string | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DevelopmentTaskEvent {
  id: string;
  taskId: string;
  userId: string;
  eventType: string;
  publicMessage: string;
  metadata: Record<string, unknown>;
  externalEventId: string | null;
  createdAt: string;
}

export interface PublicDevelopmentTask {
  id: string;
  requestSummary: string;
  riskLevel: DevelopmentRiskLevel;
  status: DevelopmentTaskStatus;
  branchName: string | null;
  previewSha: string | null;
  previewUrl: string | null;
  runnerUrl: string | null;
  checks: DevelopmentCheckSummary;
  changeSummary: string | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
  approvalToken?: string;
}

export function toPublicDevelopmentTask(task: DevelopmentTask): PublicDevelopmentTask {
  return {
    id: task.id,
    requestSummary: task.requestSummary,
    riskLevel: task.riskLevel,
    status: task.status,
    branchName: task.branchName,
    previewSha: task.previewSha,
    previewUrl: task.previewUrl,
    runnerUrl: task.runnerUrl,
    checks: task.checks,
    changeSummary: task.changeSummary,
    errorCode: task.errorCode,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}
