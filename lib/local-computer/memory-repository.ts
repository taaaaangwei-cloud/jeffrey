import { assertLocalComputerTransition, isLocalComputerTerminal } from "./state-machine.ts";
import type {
  AppendLocalComputerEvent,
  LocalComputerRepository,
  TransitionLocalComputerTask,
} from "./repository.ts";
import type { LocalComputerTask, LocalComputerTaskEvent, LocalDevice } from "./types.ts";

export function createMemoryLocalComputerRepository(): LocalComputerRepository {
  const devices = new Map<string, LocalDevice>();
  const tasks = new Map<string, LocalComputerTask>();
  const events: LocalComputerTaskEvent[] = [];

  function cloneDevice(device: LocalDevice) { return { ...device }; }
  function cloneTask(task: LocalComputerTask) { return { ...task, capabilities: [...task.capabilities] }; }

  function appendEvent(task: LocalComputerTask, sequence: number, event: AppendLocalComputerEvent) {
    const externalEventId = event.externalEventId ?? null;
    if (externalEventId && events.some((item) => item.externalEventId === externalEventId)) return null;
    const saved: LocalComputerTaskEvent = {
      id: crypto.randomUUID(),
      taskId: task.id,
      userId: task.userId,
      sequence,
      eventType: event.eventType,
      publicMessage: event.publicMessage,
      metadata: event.metadata,
      externalEventId,
      createdAt: new Date().toISOString(),
    };
    events.push(saved);
    return saved;
  }

  function activeTaskFor(userId: string) {
    return [...tasks.values()].find((task) => task.userId === userId && !isLocalComputerTerminal(task.status)) ?? null;
  }

  async function transitionTask(command: TransitionLocalComputerTask) {
    const current = tasks.get(command.taskId);
    if (!current || current.userId !== command.userId) throw new Error("LOCAL_COMPUTER_TASK_NOT_FOUND");
    if (command.event.externalEventId && events.some((event) => event.externalEventId === command.event.externalEventId)) return cloneTask(current);
    assertLocalComputerTransition(current.status, command.to);
    const updated: LocalComputerTask = {
      ...current,
      ...command.patch,
      status: command.to,
      updatedAt: new Date().toISOString(),
    };
    tasks.set(updated.id, updated);
    appendEvent(updated, updated.lastEventSequence, command.event);
    return cloneTask(updated);
  }

  return {
    async pairDevice(command) {
      const now = new Date().toISOString();
      for (const [id, device] of devices) {
        if (device.userId === command.userId && !device.revokedAt) devices.set(id, { ...device, revokedAt: now, status: "offline" });
      }
      const device: LocalDevice = {
        id: crypto.randomUUID(),
        userId: command.userId,
        name: command.name,
        platform: "macos",
        publicKey: command.publicKey,
        tokenHash: command.tokenHash,
        tokenExpiresAt: command.tokenExpiresAt,
        pairedAt: now,
        lastSeenAt: null,
        revokedAt: null,
        agentVersion: command.agentVersion,
        codexVersion: null,
        status: "offline",
      };
      devices.set(device.id, device);
      return cloneDevice(device);
    },
    async getDeviceByOwner(deviceId, userId) {
      const device = devices.get(deviceId);
      return device?.userId === userId ? cloneDevice(device) : null;
    },
    async getDeviceById(deviceId) {
      const device = devices.get(deviceId); return device ? cloneDevice(device) : null;
    },
    async getActiveDeviceByOwner(userId) {
      const device = [...devices.values()].find((item) => item.userId === userId && !item.revokedAt);
      return device ? cloneDevice(device) : null;
    },
    async revokeDevice(deviceId, userId) {
      const device = devices.get(deviceId);
      if (!device || device.userId !== userId) throw new Error("LOCAL_DEVICE_NOT_FOUND");
      const now = new Date().toISOString();
      const revoked: LocalDevice = { ...device, tokenHash: null, tokenExpiresAt: null, revokedAt: now, status: "offline" };
      devices.set(deviceId, revoked);
      for (const task of tasks.values()) {
        if (task.deviceId === deviceId && !isLocalComputerTerminal(task.status)) {
          await transitionTask({
            taskId: task.id,
            userId,
            to: "canceled",
            event: { eventType: "device_revoked", publicMessage: "Mac 已解除配对，任务已停止", metadata: {} },
            patch: { finishedAt: now, leaseIdHash: null, leaseExpiresAt: null },
          });
        }
      }
      return cloneDevice(revoked);
    },
    async updateDeviceHeartbeat(deviceId, details) {
      const device = devices.get(deviceId);
      if (!device || device.revokedAt) throw new Error("LOCAL_DEVICE_NOT_FOUND");
      const updated = { ...device, ...details, lastSeenAt: new Date().toISOString() };
      devices.set(deviceId, updated); return cloneDevice(updated);
    },
    async createTask(command) {
      if (activeTaskFor(command.userId)) throw new Error("ACTIVE_LOCAL_COMPUTER_TASK_EXISTS");
      const device = devices.get(command.deviceId);
      if (!device || device.userId !== command.userId || device.revokedAt) throw new Error("LOCAL_DEVICE_NOT_FOUND");
      const now = new Date().toISOString();
      const task: LocalComputerTask = {
        id: crypto.randomUUID(),
        ...command,
        status: "draft",
        leaseIdHash: null,
        leaseExpiresAt: null,
        lastEventSequence: 0,
        publicProgress: null,
        pendingActionId: null,
        pendingActionSummary: null,
        pendingActionRiskLevel: null,
        resultSummary: null,
        errorCode: null,
        createdAt: now,
        approvedAt: null,
        startedAt: null,
        finishedAt: null,
        updatedAt: now,
      };
      tasks.set(task.id, task);
      appendEvent(task, 0, { eventType: "created", publicMessage: "已创建本地电脑任务", metadata: {} });
      return cloneTask(task);
    },
    async getTaskByOwner(taskId, userId) {
      const task = tasks.get(taskId);
      return task?.userId === userId ? cloneTask(task) : null;
    },
    async getTaskByDevice(taskId, deviceId) {
      const task = tasks.get(taskId);
      return task?.deviceId === deviceId ? cloneTask(task) : null;
    },
    async getActiveTaskByOwner(userId) {
      const task = activeTaskFor(userId);
      return task ? cloneTask(task) : null;
    },
    transitionTask,
    async claimNextTask(command) {
      const device = devices.get(command.deviceId);
      if (!device || device.revokedAt) throw new Error("LOCAL_DEVICE_NOT_FOUND");
      const currentLease = [...tasks.values()].find((task) => task.deviceId === command.deviceId && ["leased", "running", "awaiting_action_approval"].includes(task.status));
      if (currentLease) return null;
      const queued = [...tasks.values()].filter((task) => task.deviceId === command.deviceId && task.status === "queued").sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0];
      if (!queued) return null;
      return transitionTask({
        taskId: queued.id,
        userId: queued.userId,
        to: "leased",
        event: { eventType: "leased", publicMessage: "Mac 已领取任务", metadata: {} },
        patch: { leaseIdHash: command.leaseIdHash, leaseExpiresAt: command.leaseExpiresAt },
      });
    },
    async appendAgentEvent(command) {
      const task = tasks.get(command.taskId);
      if (!task || task.deviceId !== command.deviceId) throw new Error("LOCAL_COMPUTER_TASK_NOT_FOUND");
      if (task.leaseIdHash !== command.leaseIdHash) throw new Error("INVALID_LOCAL_TASK_LEASE");
      const externalEventId = command.event.externalEventId ?? null;
      if (externalEventId && events.some((event) => event.externalEventId === externalEventId)) return cloneTask(task);
      if (command.sequence !== task.lastEventSequence + 1) throw new Error("INVALID_LOCAL_EVENT_SEQUENCE");
      const updated: LocalComputerTask = {
        ...task,
        lastEventSequence: command.sequence,
        publicProgress: command.event.publicMessage,
        updatedAt: new Date().toISOString(),
      };
      tasks.set(updated.id, updated);
      appendEvent(updated, command.sequence, command.event);
      return cloneTask(updated);
    },
    async listEvents(taskId, userId) {
      const task = tasks.get(taskId);
      if (!task || task.userId !== userId) return [];
      return events.filter((event) => event.taskId === taskId).map((event) => ({ ...event, metadata: { ...event.metadata } }));
    },
  };
}
