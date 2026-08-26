import { assertDevelopmentTransition } from "./state-machine.ts";
import type {
  AppendDevelopmentEvent,
  CreateDevelopmentTask,
  DevelopmentTaskRepository,
  TransitionDevelopmentTask,
} from "./repository.ts";
import type { DevelopmentTask, DevelopmentTaskEvent, DevelopmentTaskStatus } from "./types.ts";

const inactiveStatuses = new Set<DevelopmentTaskStatus>(["failed", "canceled", "published", "rolled_back"]);

export function createMemoryDevelopmentTaskRepository(): DevelopmentTaskRepository {
  const tasks = new Map<string, DevelopmentTask>();
  const events: DevelopmentTaskEvent[] = [];

  function activeFor(userId: string) {
    return [...tasks.values()].find((task) => task.userId === userId && !inactiveStatuses.has(task.status)) ?? null;
  }

  async function appendEvent(taskId: string, userId: string, event: AppendDevelopmentEvent) {
    const task = tasks.get(taskId);
    if (!task || task.userId !== userId) throw new Error("DEVELOPMENT_TASK_NOT_FOUND");
    const externalEventId = event.externalEventId ?? null;
    if (externalEventId && events.some((item) => item.externalEventId === externalEventId)) return null;
    const saved: DevelopmentTaskEvent = {
      id: crypto.randomUUID(),
      taskId,
      userId,
      eventType: event.eventType,
      publicMessage: event.publicMessage,
      metadata: event.metadata,
      externalEventId,
      createdAt: new Date().toISOString(),
    };
    events.push(saved);
    return saved;
  }

  return {
    async create(command: CreateDevelopmentTask) {
      if (activeFor(command.userId)) throw new Error("ACTIVE_DEVELOPMENT_TASK_EXISTS");
      const now = new Date().toISOString();
      const task: DevelopmentTask = {
        id: crypto.randomUUID(),
        ...command,
        repositoryFullName: command.repositoryFullName ?? null,
        status: "queued",
        branchName: null,
        baseSha: null,
        previewSha: null,
        runnerRunId: null,
        runnerUrl: null,
        previewUrl: null,
        checks: { lint: "pending", typecheck: "pending", tests: "pending", build: "pending" },
        changeSummary: null,
        approvalNonceHash: null,
        approvalExpiresAt: null,
        approvedAt: null,
        publishedSha: null,
        previousProductionSha: null,
        publishedAt: null,
        errorCode: null,
        createdAt: now,
        updatedAt: now,
      };
      tasks.set(task.id, task);
      await appendEvent(task.id, task.userId, {
        eventType: "created",
        publicMessage: "已创建安全修改任务",
        metadata: {},
      });
      return { ...task };
    },
    async getByOwner(taskId, userId) {
      const task = tasks.get(taskId);
      return task?.userId === userId ? { ...task } : null;
    },
    async getActiveByOwner(userId) {
      const task = activeFor(userId);
      return task ? { ...task } : null;
    },
    async getLatestByOwner(userId) {
      const task = [...tasks.values()].filter((item) => item.userId === userId).sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
      return task ? { ...task } : null;
    },
    async transition(command: TransitionDevelopmentTask) {
      const current = tasks.get(command.taskId);
      if (!current || current.userId !== command.userId) throw new Error("DEVELOPMENT_TASK_NOT_FOUND");
      if (command.event.externalEventId && events.some((event) => event.externalEventId === command.event.externalEventId)) return { ...current };
      assertDevelopmentTransition(current.status, command.to);
      const updated: DevelopmentTask = {
        ...current,
        ...command.patch,
        status: command.to,
        updatedAt: new Date().toISOString(),
      };
      tasks.set(updated.id, updated);
      await appendEvent(updated.id, updated.userId, command.event);
      return { ...updated };
    },
    appendEvent,
    async listEvents(taskId, userId) {
      const task = tasks.get(taskId);
      if (!task || task.userId !== userId) return [];
      return events.filter((event) => event.taskId === taskId).map((event) => ({ ...event }));
    },
  };
}
