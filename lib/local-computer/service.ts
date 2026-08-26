import { createLocalApprovalToken, verifyLocalApprovalToken } from "./approval.ts";
import type { CreateLocalComputerTask, LocalComputerRepository } from "./repository.ts";
import { getLocalComputerApprovalPolicy } from "./risk-policy.ts";
import { isLocalComputerTerminal } from "./state-machine.ts";
import type { LocalComputerRiskLevel, LocalComputerTask } from "./types.ts";

type CreateTaskInput = Omit<CreateLocalComputerTask, "deviceId">;

export interface LocalComputerTaskServiceDependencies {
  repository: LocalComputerRepository;
  approvalSecret: string;
}

export interface RequestLocalActionApproval {
  taskId: string;
  userId: string;
  actionId: string;
  actionSummary: string;
  riskLevel: LocalComputerRiskLevel;
}

function requireTask(task: LocalComputerTask | null): LocalComputerTask {
  if (!task) throw new Error("LOCAL_COMPUTER_TASK_NOT_FOUND");
  return task;
}

export function createLocalComputerTaskService({
  repository,
  approvalSecret,
}: LocalComputerTaskServiceDependencies) {
  return {
    async create(command: CreateTaskInput) {
      const policy = getLocalComputerApprovalPolicy(command.riskLevel);
      if (!policy.dispatchAllowed) throw new Error("LOCAL_ACTION_BLOCKED");

      const device = await repository.getActiveDeviceByOwner(command.userId);
      if (!device) throw new Error("LOCAL_DEVICE_OFFLINE");

      const draft = await repository.createTask({ ...command, deviceId: device.id });
      if (!policy.taskApproval) {
        const task = await repository.transitionTask({
          taskId: draft.id,
          userId: command.userId,
          to: "queued",
          event: { eventType: "queued", publicMessage: "任务已发送到 Mac", metadata: {} },
        });
        return { task, approvalToken: undefined };
      }

      const task = await repository.transitionTask({
        taskId: draft.id,
        userId: command.userId,
        to: "awaiting_task_approval",
        event: { eventType: "task_approval_requested", publicMessage: "等待你确认后发送到 Mac", metadata: {} },
      });
      const approvalToken = await createLocalApprovalToken(approvalSecret, {
        userId: command.userId,
        deviceId: device.id,
        taskId: task.id,
        actionId: null,
        riskLevel: task.riskLevel,
      });
      return { task, approvalToken };
    },

    async approveTask(taskId: string, userId: string, approvalToken: string) {
      const task = requireTask(await repository.getTaskByOwner(taskId, userId));
      if (task.status !== "awaiting_task_approval" || !task.deviceId) {
        throw new Error("LOCAL_APPROVAL_NOT_ALLOWED");
      }
      const valid = await verifyLocalApprovalToken(approvalSecret, approvalToken, {
        userId,
        deviceId: task.deviceId,
        taskId,
        actionId: null,
        riskLevel: task.riskLevel,
      });
      if (!valid) throw new Error("INVALID_LOCAL_APPROVAL");
      return repository.transitionTask({
        taskId,
        userId,
        to: "queued",
        event: { eventType: "task_approved", publicMessage: "已确认，等待 Mac 领取", metadata: {} },
        patch: { approvedAt: new Date().toISOString() },
      });
    },

    async cancel(taskId: string, userId: string) {
      const task = requireTask(await repository.getTaskByOwner(taskId, userId));
      if (isLocalComputerTerminal(task.status)) throw new Error("LOCAL_CANCEL_NOT_ALLOWED");
      return repository.transitionTask({
        taskId,
        userId,
        to: "canceled",
        event: { eventType: "canceled", publicMessage: "任务已取消", metadata: {} },
        patch: { finishedAt: new Date().toISOString(), leaseIdHash: null, leaseExpiresAt: null },
      });
    },

    revokeDevice(deviceId: string, userId: string) {
      return repository.revokeDevice(deviceId, userId);
    },

    async requestActionApproval(command: RequestLocalActionApproval) {
      const task = requireTask(await repository.getTaskByOwner(command.taskId, command.userId));
      const policy = getLocalComputerApprovalPolicy(command.riskLevel);
      if (!policy.dispatchAllowed) throw new Error("LOCAL_ACTION_BLOCKED");
      if (task.status !== "running" || !task.deviceId) throw new Error("LOCAL_APPROVAL_NOT_ALLOWED");

      const updated = await repository.transitionTask({
        taskId: task.id,
        userId: task.userId,
        to: "awaiting_action_approval",
        event: {
          eventType: "action_approval_requested",
          publicMessage: `等待确认：${command.actionSummary}`,
          metadata: { riskLevel: command.riskLevel },
        },
        patch: {
          pendingActionId: command.actionId,
          pendingActionSummary: command.actionSummary,
          pendingActionRiskLevel: command.riskLevel,
        },
      });
      const approvalToken = await createLocalApprovalToken(approvalSecret, {
        userId: task.userId,
        deviceId: task.deviceId,
        taskId: task.id,
        actionId: command.actionId,
        riskLevel: command.riskLevel,
      });
      return { task: updated, approvalToken };
    },

    async approveAction(taskId: string, userId: string, actionId: string, approvalToken: string) {
      const task = requireTask(await repository.getTaskByOwner(taskId, userId));
      if (task.status !== "awaiting_action_approval" || !task.deviceId || task.pendingActionId !== actionId || !task.pendingActionRiskLevel) {
        throw new Error("LOCAL_APPROVAL_NOT_ALLOWED");
      }
      const valid = await verifyLocalApprovalToken(approvalSecret, approvalToken, {
        userId,
        deviceId: task.deviceId,
        taskId,
        actionId,
        riskLevel: task.pendingActionRiskLevel,
      });
      if (!valid) throw new Error("INVALID_LOCAL_APPROVAL");
      return repository.transitionTask({
        taskId,
        userId,
        to: "running",
        event: { eventType: "action_approved", publicMessage: "操作已确认，Codex 继续执行", metadata: {} },
        patch: { pendingActionId: null, pendingActionSummary: null, pendingActionRiskLevel: null },
      });
    },
  };
}
