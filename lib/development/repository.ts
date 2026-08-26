import type {
  DevelopmentRiskLevel,
  DevelopmentTask,
  DevelopmentTaskEvent,
  DevelopmentTaskStatus,
} from "./types.ts";

export interface CreateDevelopmentTask {
  userId: string;
  conversationId: string;
  sourceMessageId: string;
  requestText: string;
  requestSummary: string;
  requestedChanges: string[];
  riskLevel: DevelopmentRiskLevel;
  repositoryFullName?: string | null;
}

export interface AppendDevelopmentEvent {
  eventType: string;
  publicMessage: string;
  metadata: Record<string, unknown>;
  externalEventId?: string | null;
}

export type DevelopmentTaskPatch = Partial<Omit<DevelopmentTask,
  "id" | "userId" | "conversationId" | "sourceMessageId" | "status" | "createdAt" | "updatedAt"
>>;

export interface TransitionDevelopmentTask {
  taskId: string;
  userId: string;
  to: DevelopmentTaskStatus;
  event: AppendDevelopmentEvent;
  patch?: DevelopmentTaskPatch;
}

export interface DevelopmentTaskRepository {
  create(command: CreateDevelopmentTask): Promise<DevelopmentTask>;
  getByOwner(taskId: string, userId: string): Promise<DevelopmentTask | null>;
  getActiveByOwner(userId: string): Promise<DevelopmentTask | null>;
  getLatestByOwner(userId: string): Promise<DevelopmentTask | null>;
  transition(command: TransitionDevelopmentTask): Promise<DevelopmentTask>;
  appendEvent(taskId: string, userId: string, event: AppendDevelopmentEvent): Promise<DevelopmentTaskEvent | null>;
  listEvents(taskId: string, userId: string): Promise<DevelopmentTaskEvent[]>;
}
