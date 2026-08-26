import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryLocalComputerRepository } from "../lib/local-computer/memory-repository.ts";
import { createLocalComputerTaskService } from "../lib/local-computer/service.ts";

const owner = "11111111-1111-4111-8111-111111111111";
const approvalSecret = "local-approval-secret-that-is-at-least-32-characters";

async function setup() {
  const repository = createMemoryLocalComputerRepository();
  const device = await repository.pairDevice({
    userId: owner,
    name: "客户的 Mac",
    publicKey: "p256-public-key",
    agentVersion: "0.1.0",
    tokenHash: "token-hash",
    tokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  const service = createLocalComputerTaskService({ repository, approvalSecret });
  return { repository, device, service };
}

function command(riskLevel: "low" | "medium" | "high" | "blocked") {
  return {
    userId: owner,
    conversationId: "33333333-3333-4333-8333-333333333333",
    sourceMessageId: crypto.randomUUID(),
    requestText: "处理电脑任务",
    requestSummary: "处理电脑任务",
    requestedOutcome: "完成客户要求",
    riskLevel,
    capabilities: ["files" as const],
  };
}

test("low-risk local work queues immediately on the paired Mac", async () => {
  const { device, service } = await setup();
  const result = await service.create(command("low"));

  assert.equal(result.task.deviceId, device.id);
  assert.equal(result.task.status, "queued");
  assert.equal(result.approvalToken, undefined);
});

test("medium and high-risk local work waits for one task-bound approval", async () => {
  const { service } = await setup();
  const result = await service.create(command("high"));

  assert.equal(result.task.status, "awaiting_task_approval");
  assert.ok(result.approvalToken);
  const approved = await service.approveTask(result.task.id, owner, result.approvalToken as string);
  assert.equal(approved.status, "queued");
  await assert.rejects(() => service.approveTask(result.task.id, owner, result.approvalToken as string), /LOCAL_APPROVAL_NOT_ALLOWED/);
});

test("blocked local work is never persisted or sent to the Mac", async () => {
  const { repository, service } = await setup();
  await assert.rejects(() => service.create(command("blocked")), /LOCAL_ACTION_BLOCKED/);
  assert.equal(await repository.getActiveTaskByOwner(owner), null);
});

test("local work requires an active paired Mac and can be canceled by its owner", async () => {
  const { device, service } = await setup();
  const created = await service.create(command("low"));
  assert.equal((await service.cancel(created.task.id, owner)).status, "canceled");

  await service.revokeDevice(device.id, owner);
  await assert.rejects(() => service.create(command("low")), /LOCAL_DEVICE_OFFLINE/);
});

test("an App Server permission expansion creates one exact action approval", async () => {
  const { repository, device, service } = await setup();
  const created = await service.create(command("low"));
  const leased = await repository.claimNextTask({ deviceId: device.id, leaseIdHash: "lease-1", leaseExpiresAt: new Date(Date.now() + 60_000).toISOString() });
  assert.ok(leased);
  await repository.transitionTask({ taskId: created.task.id, userId: owner, to: "running", event: { eventType: "started", publicMessage: "Codex 已开始执行", metadata: {} } });

  const approval = await service.requestActionApproval({
    taskId: created.task.id,
    userId: owner,
    actionId: "send-email-1",
    actionSummary: "向客户指定地址发送邮件",
    riskLevel: "high",
  });
  assert.equal(approval.task.status, "awaiting_action_approval");
  assert.ok(approval.approvalToken);
  assert.equal((await service.approveAction(created.task.id, owner, "send-email-1", approval.approvalToken)).status, "running");
});
