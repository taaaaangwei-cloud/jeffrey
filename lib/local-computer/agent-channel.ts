import type { LocalComputerRepository } from "./repository.ts";
import type { LocalComputerRiskLevel } from "./types.ts";

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

async function hash(value: string) {
  return base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}

function redactLocalResult(value: string) {
  return value
    .replace(/\/Users\/[^/\s]+/gu, "/Users/•••")
    .replace(/\b(?:token|secret|password|api[_-]?key)\s*[=:]\s*[^\s,;]+/giu, "$1=•••")
    .slice(0, 2000);
}

async function requireLease(repository: LocalComputerRepository, deviceId: string, taskId: string, leaseToken: string) {
  const task = await repository.getTaskByDevice(taskId, deviceId);
  if (!task || !task.leaseIdHash || task.leaseIdHash !== await hash(leaseToken) || !task.leaseExpiresAt || Date.parse(task.leaseExpiresAt) < Date.now()) {
    throw new Error("INVALID_LOCAL_TASK_LEASE");
  }
  return task;
}

export function createLocalAgentChannel({ repository, leaseSeconds }: { repository: LocalComputerRepository; leaseSeconds: number }) {
  return {
    async claim(deviceId: string) {
      const leaseToken = base64Url(crypto.getRandomValues(new Uint8Array(32)));
      const task = await repository.claimNextTask({ deviceId, leaseIdHash: await hash(leaseToken), leaseExpiresAt: new Date(Date.now() + leaseSeconds * 1000).toISOString() });
      return task ? { task, leaseToken } : null;
    },
    async start(command: { deviceId: string; taskId: string; leaseToken: string }) {
      const task = await requireLease(repository, command.deviceId, command.taskId, command.leaseToken);
      return repository.transitionTask({ taskId: task.id, userId: task.userId, to: "running", event: { eventType: "started", publicMessage: "Codex 已开始执行", metadata: {} }, patch: { startedAt: new Date().toISOString() } });
    },
    async progress(command: { deviceId: string; taskId: string; leaseToken: string; sequence: number; eventId: string; publicMessage: string }) {
      const task = await requireLease(repository, command.deviceId, command.taskId, command.leaseToken);
      return repository.appendAgentEvent({ taskId: task.id, deviceId: command.deviceId, leaseIdHash: task.leaseIdHash!, sequence: command.sequence, event: { eventType: "progress", publicMessage: command.publicMessage.slice(0, 500), metadata: {}, externalEventId: command.eventId } });
    },
    async complete(command: { deviceId: string; taskId: string; leaseToken: string; sequence: number; eventId: string; resultSummary: string }) {
      const task = await requireLease(repository, command.deviceId, command.taskId, command.leaseToken);
      const resultSummary = redactLocalResult(command.resultSummary);
      const progressed = await repository.appendAgentEvent({ taskId: task.id, deviceId: command.deviceId, leaseIdHash: task.leaseIdHash!, sequence: command.sequence, event: { eventType: "result", publicMessage: "Codex 已完成任务", metadata: {}, externalEventId: command.eventId } });
      return repository.transitionTask({ taskId: progressed.id, userId: progressed.userId, to: "completed", event: { eventType: "completed", publicMessage: "任务已完成", metadata: {} }, patch: { resultSummary, finishedAt: new Date().toISOString(), leaseIdHash: null, leaseExpiresAt: null } });
    },
    async requestActionApproval(command: { deviceId: string; taskId: string; leaseToken: string; actionId: string; actionSummary: string; riskLevel: LocalComputerRiskLevel }) {
      const task = await requireLease(repository, command.deviceId, command.taskId, command.leaseToken);
      if (task.status !== "running" || command.riskLevel === "blocked") throw new Error("LOCAL_APPROVAL_NOT_ALLOWED");
      return repository.transitionTask({ taskId: task.id, userId: task.userId, to: "awaiting_action_approval", event: { eventType: "action_approval_requested", publicMessage: `等待确认：${command.actionSummary}`, metadata: { riskLevel: command.riskLevel } }, patch: { pendingActionId: command.actionId, pendingActionSummary: command.actionSummary, pendingActionRiskLevel: command.riskLevel } });
    },
    async fail(command: { deviceId: string; taskId: string; leaseToken: string; errorCode: string }) {
      const task = await requireLease(repository, command.deviceId, command.taskId, command.leaseToken);
      return repository.transitionTask({ taskId: task.id, userId: task.userId, to: "failed", event: { eventType: "failed", publicMessage: "Codex 未能完成任务", metadata: {} }, patch: { errorCode: command.errorCode.slice(0, 100), finishedAt: new Date().toISOString(), leaseIdHash: null, leaseExpiresAt: null } });
    },
  };
}

export type LocalAgentChannel = ReturnType<typeof createLocalAgentChannel>;
