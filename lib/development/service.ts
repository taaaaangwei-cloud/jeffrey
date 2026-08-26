import type { CreateDevelopmentTask, DevelopmentTaskRepository } from "./repository.ts";
import type { DevelopmentRunner } from "./runner.ts";
import type { DevelopmentReleaseDispatcher } from "./release-dispatcher.ts";
import type { DevelopmentTask, DevelopmentTaskStatus } from "./types.ts";

export interface DevelopmentTaskService {
  create(command: CreateDevelopmentTask): Promise<DevelopmentTask>;
  get(taskId: string, userId: string): Promise<DevelopmentTask | null>;
  getActive(userId: string): Promise<DevelopmentTask | null>;
  getLatest(userId: string): Promise<DevelopmentTask | null>;
  continue(taskId: string, userId: string, instructions: string): Promise<DevelopmentTask>;
  cancel(taskId: string, userId: string): Promise<DevelopmentTask>;
  approveRelease(taskId: string, userId: string): Promise<DevelopmentTask>;
  applyRunnerEvent(command: {
    taskId: string;
    userId: string;
    eventId: string;
    status: Extract<DevelopmentTaskStatus, "running" | "testing" | "previewing" | "awaiting_approval" | "publishing" | "published" | "failed" | "rollback_running" | "rolled_back">;
    publicMessage: string;
    patch?: Parameters<DevelopmentTaskRepository["transition"]>[0]["patch"];
  }): Promise<DevelopmentTask>;
}

export function createDevelopmentTaskService(dependencies: {
  repository: DevelopmentTaskRepository;
  runner: DevelopmentRunner;
  release?: DevelopmentReleaseDispatcher;
}): DevelopmentTaskService {
  return {
    async create(command) {
      const task = await dependencies.repository.create(command);
      try {
        const reference = await dependencies.runner.start(task);
        await dependencies.repository.appendEvent(task.id, task.userId, {
          eventType: "dispatch_accepted",
          publicMessage: "修改任务已进入隔离队列",
          metadata: { runId: reference.runId },
        });
        return task;
      } catch {
        return dependencies.repository.transition({
          taskId: task.id,
          userId: task.userId,
          to: "failed",
          patch: { errorCode: "RUNNER_DISPATCH_FAILED" },
          event: {
            eventType: "dispatch_failed",
            publicMessage: "云端修改暂时无法启动，正式版本未受影响",
            metadata: { errorCode: "RUNNER_DISPATCH_FAILED" },
          },
        });
      }
    },
    get(taskId, userId) {
      return dependencies.repository.getByOwner(taskId, userId);
    },
    getActive(userId) {
      return dependencies.repository.getActiveByOwner(userId);
    },
    getLatest(userId) {
      return dependencies.repository.getLatestByOwner(userId);
    },
    async continue(taskId, userId, instructions) {
      const current = await dependencies.repository.getByOwner(taskId, userId);
      if (!current) throw new Error("DEVELOPMENT_TASK_NOT_FOUND");
      const queued = await dependencies.repository.transition({
        taskId,
        userId,
        to: "queued",
        patch: {
          requestText: `${current.requestText}\n\n继续调整：${instructions}`,
          previewSha: null,
          previewUrl: null,
          approvalNonceHash: null,
          approvalExpiresAt: null,
          approvedAt: null,
          checks: { lint: "pending", typecheck: "pending", tests: "pending", build: "pending" },
          changeSummary: null,
          errorCode: null,
        },
        event: { eventType: "instructions_added", publicMessage: "已收到继续调整要求，旧预览已失效", metadata: {} },
      });
      try {
        const reference = await dependencies.runner.continue(queued, instructions);
        await dependencies.repository.appendEvent(taskId, userId, {
          eventType: "dispatch_accepted",
          publicMessage: "继续调整已进入隔离队列",
          metadata: { runId: reference.runId },
        });
        return queued;
      } catch {
        return dependencies.repository.transition({
          taskId, userId, to: "failed", patch: { errorCode: "RUNNER_DISPATCH_FAILED" },
          event: { eventType: "dispatch_failed", publicMessage: "继续调整暂时无法启动，正式版本未受影响", metadata: { errorCode: "RUNNER_DISPATCH_FAILED" } },
        });
      }
    },
    async cancel(taskId, userId) {
      return dependencies.repository.transition({
        taskId,
        userId,
        to: "canceled",
        event: { eventType: "canceled", publicMessage: "修改任务已取消，正式版本未受影响", metadata: {} },
      });
    },
    async approveRelease(taskId, userId) {
      const current = await dependencies.repository.getByOwner(taskId, userId);
      const checksPassed = current && Object.values(current.checks).every((check) => check === "passed");
      if (!current || current.status !== "awaiting_approval" || !current.previewSha || !checksPassed || !dependencies.release) {
        throw new Error("INVALID_RELEASE_APPROVAL");
      }
      const publishing = await dependencies.repository.transition({
        taskId,
        userId,
        to: "publishing",
        patch: { approvedAt: new Date().toISOString() },
        event: { eventType: "release_approved", publicMessage: "已确认预览版本，正在执行受保护发布", metadata: { previewSha: current.previewSha } },
      });
      try {
        await dependencies.release.dispatch(publishing);
        return publishing;
      } catch {
        return dependencies.repository.transition({
          taskId, userId, to: "failed", patch: { errorCode: "RELEASE_DISPATCH_FAILED" },
          event: { eventType: "release_dispatch_failed", publicMessage: "发布没有启动，正式版本未受影响", metadata: { errorCode: "RELEASE_DISPATCH_FAILED" } },
        });
      }
    },
    async applyRunnerEvent(command) {
      return dependencies.repository.transition({
        taskId: command.taskId,
        userId: command.userId,
        to: command.status,
        patch: command.patch,
        event: {
          eventType: `runner_${command.status}`,
          publicMessage: command.publicMessage,
          metadata: {},
          externalEventId: command.eventId,
        },
      });
    },
  };
}
