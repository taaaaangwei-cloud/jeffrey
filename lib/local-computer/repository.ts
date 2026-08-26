import type {
  LocalComputerCapability,
  LocalComputerRiskLevel,
  LocalComputerTask,
  LocalComputerTaskEvent,
  LocalComputerTaskStatus,
  LocalDevice,
} from "./types.ts";

export interface PairLocalDevice {
  userId: string;
  name: string;
  publicKey: string;
  agentVersion: string;
  tokenHash: string;
  tokenExpiresAt: string;
}

export interface CreateLocalComputerTask {
  userId: string;
  conversationId: string;
  sourceMessageId: string;
  deviceId: string;
  requestText: string;
  requestSummary: string;
  requestedOutcome: string;
  riskLevel: LocalComputerRiskLevel;
  capabilities: LocalComputerCapability[];
}

export interface AppendLocalComputerEvent {
  eventType: string;
  publicMessage: string;
  metadata: Record<string, unknown>;
  externalEventId?: string | null;
}

export type LocalComputerTaskPatch = Partial<Omit<LocalComputerTask,
  "id" | "userId" | "conversationId" | "sourceMessageId" | "deviceId" | "status" | "createdAt" | "updatedAt"
>>;

export interface TransitionLocalComputerTask {
  taskId: string;
  userId: string;
  to: LocalComputerTaskStatus;
  event: AppendLocalComputerEvent;
  patch?: LocalComputerTaskPatch;
}

export interface ClaimLocalComputerTask {
  deviceId: string;
  leaseIdHash: string;
  leaseExpiresAt: string;
}

export interface AppendLocalAgentEvent {
  taskId: string;
  deviceId: string;
  leaseIdHash: string;
  sequence: number;
  event: AppendLocalComputerEvent;
}

export interface LocalComputerRepository {
  pairDevice(command: PairLocalDevice): Promise<LocalDevice>;
  getDeviceByOwner(deviceId: string, userId: string): Promise<LocalDevice | null>;
  getDeviceById(deviceId: string): Promise<LocalDevice | null>;
  getActiveDeviceByOwner(userId: string): Promise<LocalDevice | null>;
  revokeDevice(deviceId: string, userId: string): Promise<LocalDevice>;
  updateDeviceHeartbeat(deviceId: string, details: { agentVersion: string; codexVersion: string | null; status: LocalDevice["status"] }): Promise<LocalDevice>;
  createTask(command: CreateLocalComputerTask): Promise<LocalComputerTask>;
  getTaskByOwner(taskId: string, userId: string): Promise<LocalComputerTask | null>;
  getTaskByDevice(taskId: string, deviceId: string): Promise<LocalComputerTask | null>;
  getActiveTaskByOwner(userId: string): Promise<LocalComputerTask | null>;
  transitionTask(command: TransitionLocalComputerTask): Promise<LocalComputerTask>;
  claimNextTask(command: ClaimLocalComputerTask): Promise<LocalComputerTask | null>;
  appendAgentEvent(command: AppendLocalAgentEvent): Promise<LocalComputerTask>;
  listEvents(taskId: string, userId: string): Promise<LocalComputerTaskEvent[]>;
}
