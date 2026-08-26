import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryLocalComputerRepository } from "../lib/local-computer/memory-repository.ts";

const owner = "11111111-1111-4111-8111-111111111111";
const otherUser = "99999999-9999-4999-8999-999999999999";

async function pairedRepository() {
  const repository = createMemoryLocalComputerRepository();
  const device = await repository.pairDevice({
    userId: owner,
    name: "客户的 Mac",
    publicKey: "p256-public-key",
    agentVersion: "0.1.0",
    tokenHash: "token-hash",
    tokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  return { repository, device };
}

function taskCommand(deviceId: string) {
  return {
    userId: owner,
    conversationId: "33333333-3333-4333-8333-333333333333",
    sourceMessageId: "44444444-4444-4444-8444-444444444444",
    deviceId,
    requestText: "找一下桌面上的合同",
    requestSummary: "查找桌面合同",
    requestedOutcome: "返回合同文件位置",
    riskLevel: "low" as const,
    capabilities: ["files" as const],
  };
}

test("pairing a new Mac revokes the previous Mac and owner reads stay isolated", async () => {
  const { repository, device: first } = await pairedRepository();
  const second = await repository.pairDevice({
    userId: owner,
    name: "新 Mac",
    publicKey: "new-public-key",
    agentVersion: "0.1.0",
    tokenHash: "new-token-hash",
    tokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
  });

  assert.equal((await repository.getDeviceByOwner(first.id, owner))?.revokedAt !== null, true);
  assert.equal((await repository.getActiveDeviceByOwner(owner))?.id, second.id);
  assert.equal(await repository.getDeviceByOwner(second.id, otherUser), null);
});

test("a local task is owner-scoped and records a safe created event", async () => {
  const { repository, device } = await pairedRepository();
  const task = await repository.createTask(taskCommand(device.id));

  assert.equal(task.status, "draft");
  assert.equal(await repository.getTaskByOwner(task.id, otherUser), null);
  assert.equal((await repository.listEvents(task.id, owner))[0]?.eventType, "created");
});

test("one device leases one queued task and agent events must be ordered and idempotent", async () => {
  const { repository, device } = await pairedRepository();
  const task = await repository.createTask(taskCommand(device.id));
  await repository.transitionTask({
    taskId: task.id,
    userId: owner,
    to: "queued",
    event: { eventType: "queued", publicMessage: "已进入本地任务队列", metadata: {} },
  });

  const leased = await repository.claimNextTask({ deviceId: device.id, leaseIdHash: "lease-1", leaseExpiresAt: new Date(Date.now() + 60_000).toISOString() });
  assert.equal(leased?.id, task.id);
  assert.equal((await repository.claimNextTask({ deviceId: device.id, leaseIdHash: "lease-2", leaseExpiresAt: new Date(Date.now() + 60_000).toISOString() }))?.id ?? null, null);

  await repository.appendAgentEvent({
    taskId: task.id,
    deviceId: device.id,
    leaseIdHash: "lease-1",
    sequence: 1,
    event: { eventType: "progress", publicMessage: "正在查找", metadata: {}, externalEventId: "agent-event-1" },
  });
  await repository.appendAgentEvent({
    taskId: task.id,
    deviceId: device.id,
    leaseIdHash: "lease-1",
    sequence: 1,
    event: { eventType: "progress", publicMessage: "重复事件", metadata: {}, externalEventId: "agent-event-1" },
  });

  assert.equal((await repository.getTaskByOwner(task.id, owner))?.lastEventSequence, 1);
  assert.equal((await repository.listEvents(task.id, owner)).filter((event) => event.externalEventId === "agent-event-1").length, 1);
  await assert.rejects(() => repository.appendAgentEvent({
    taskId: task.id,
    deviceId: device.id,
    leaseIdHash: "lease-1",
    sequence: 3,
    event: { eventType: "progress", publicMessage: "乱序事件", metadata: {}, externalEventId: "agent-event-3" },
  }), /INVALID_LOCAL_EVENT_SEQUENCE/);
});

test("revoking the paired Mac cancels all unfinished work", async () => {
  const { repository, device } = await pairedRepository();
  const task = await repository.createTask(taskCommand(device.id));
  await repository.revokeDevice(device.id, owner);

  assert.equal((await repository.getTaskByOwner(task.id, owner))?.status, "canceled");
  assert.equal(await repository.getActiveDeviceByOwner(owner), null);
});
