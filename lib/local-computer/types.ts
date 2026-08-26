export const localComputerTaskStatuses = [
  "draft",
  "awaiting_task_approval",
  "queued",
  "leased",
  "running",
  "awaiting_action_approval",
  "completed",
  "canceled",
  "expired",
  "failed",
] as const;

export type LocalComputerTaskStatus = (typeof localComputerTaskStatuses)[number];
export type LocalComputerRiskLevel = "low" | "medium" | "high" | "blocked";
export type LocalComputerCapability = "files" | "shell" | "browser" | "applications";

export interface LocalComputerTask {
  id: string;
  userId: string;
  conversationId: string;
  sourceMessageId: string;
  deviceId: string | null;
  requestText: string;
  requestSummary: string;
  requestedOutcome: string;
  riskLevel: LocalComputerRiskLevel;
  capabilities: LocalComputerCapability[];
  status: LocalComputerTaskStatus;
  leaseIdHash: string | null;
  leaseExpiresAt: string | null;
  lastEventSequence: number;
  publicProgress: string | null;
  pendingActionId: string | null;
  pendingActionSummary: string | null;
  pendingActionRiskLevel: LocalComputerRiskLevel | null;
  resultSummary: string | null;
  errorCode: string | null;
  createdAt: string;
  approvedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
}

export interface LocalComputerTaskEvent {
  id: string;
  taskId: string;
  userId: string;
  sequence: number;
  eventType: string;
  publicMessage: string;
  metadata: Record<string, unknown>;
  externalEventId: string | null;
  createdAt: string;
}

export interface LocalDevice {
  id: string;
  userId: string;
  name: string;
  platform: "macos";
  publicKey: string;
  tokenHash: string | null;
  tokenExpiresAt: string | null;
  pairedAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
  agentVersion: string;
  codexVersion: string | null;
  status: "offline" | "online" | "paused" | "incompatible";
}

export interface PublicLocalComputerTask {
  id: string;
  requestSummary: string;
  riskLevel: LocalComputerRiskLevel;
  status: LocalComputerTaskStatus;
  publicProgress: string | null;
  pendingActionSummary: string | null;
  pendingActionRiskLevel: LocalComputerRiskLevel | null;
  resultSummary: string | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicLocalDevice {
  id: string;
  name: string;
  status: LocalDevice["status"];
  agentVersion: string;
  codexVersion: string | null;
  pairedAt: string;
  lastSeenAt: string | null;
}

export function toPublicLocalDevice(device: LocalDevice): PublicLocalDevice {
  return { id: device.id, name: device.name, status: device.status, agentVersion: device.agentVersion, codexVersion: device.codexVersion, pairedAt: device.pairedAt, lastSeenAt: device.lastSeenAt };
}

export function toPublicLocalComputerTask(task: LocalComputerTask): PublicLocalComputerTask {
  return {
    id: task.id,
    requestSummary: task.requestSummary,
    riskLevel: task.riskLevel,
    status: task.status,
    publicProgress: task.publicProgress,
    pendingActionSummary: task.pendingActionSummary,
    pendingActionRiskLevel: task.pendingActionRiskLevel,
    resultSummary: task.resultSummary,
    errorCode: task.errorCode,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}
