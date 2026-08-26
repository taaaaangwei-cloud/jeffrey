import assert from "node:assert/strict";
import test from "node:test";
import { createLocalAgentChannel } from "../lib/local-computer/agent-channel.ts";
import { createMemoryLocalComputerRepository } from "../lib/local-computer/memory-repository.ts";
import { createLocalComputerTaskService } from "../lib/local-computer/service.ts";

const owner = "11111111-1111-4111-8111-111111111111";

test("the agent claims one task, reports ordered progress, and returns only a redacted result", async () => {
  const repository = createMemoryLocalComputerRepository();
  const device = await repository.pairDevice({ userId: owner, name: "Mac", publicKey: "key", agentVersion: "0.1.0", tokenHash: "hash", tokenExpiresAt: new Date(Date.now() + 60_000).toISOString() });
  const tasks = createLocalComputerTaskService({ repository, approvalSecret: "a".repeat(32) });
  const created = await tasks.create({ userId: owner, conversationId: "33333333-3333-4333-8333-333333333333", sourceMessageId: crypto.randomUUID(), requestText: "查找合同", requestSummary: "查找合同", requestedOutcome: "找到合同", riskLevel: "low", capabilities: ["files"] });
  const channel = createLocalAgentChannel({ repository, leaseSeconds: 60 });

  const claimed = await channel.claim(device.id);
  assert.ok(claimed);
  assert.equal(await channel.claim(device.id), null);
  const running = await channel.start({ deviceId: device.id, taskId: created.task.id, leaseToken: claimed!.leaseToken });
  assert.equal(running.status, "running");
  await channel.progress({ deviceId: device.id, taskId: created.task.id, leaseToken: claimed!.leaseToken, sequence: 1, eventId: "event-1", publicMessage: "正在搜索桌面" });
  const completed = await channel.complete({ deviceId: device.id, taskId: created.task.id, leaseToken: claimed!.leaseToken, sequence: 2, eventId: "event-2", resultSummary: "已找到 /Users/alice/Desktop/合同.md，token=secret-value" });
  assert.equal(completed.status, "completed");
  assert.doesNotMatch(completed.resultSummary ?? "", /alice|secret-value/);
});

test("wrong leases and repeated event sequences are rejected", async () => {
  const repository = createMemoryLocalComputerRepository();
  const device = await repository.pairDevice({ userId: owner, name: "Mac", publicKey: "key", agentVersion: "0.1.0", tokenHash: "hash", tokenExpiresAt: new Date(Date.now() + 60_000).toISOString() });
  const tasks = createLocalComputerTaskService({ repository, approvalSecret: "a".repeat(32) });
  await tasks.create({ userId: owner, conversationId: "33333333-3333-4333-8333-333333333333", sourceMessageId: crypto.randomUUID(), requestText: "查找合同", requestSummary: "查找合同", requestedOutcome: "找到合同", riskLevel: "low", capabilities: ["files"] });
  const channel = createLocalAgentChannel({ repository, leaseSeconds: 60 });
  const claimed = await channel.claim(device.id);
  await assert.rejects(() => channel.start({ deviceId: device.id, taskId: claimed!.task.id, leaseToken: "wrong" }), /INVALID_LOCAL_TASK_LEASE/);
});

test("an App Server approval request pauses the exact leased task", async () => {
  const repository = createMemoryLocalComputerRepository();
  const device = await repository.pairDevice({ userId: owner, name: "Mac", publicKey: "key", agentVersion: "0.1.0", tokenHash: "hash", tokenExpiresAt: new Date(Date.now() + 60_000).toISOString() });
  const tasks = createLocalComputerTaskService({ repository, approvalSecret: "a".repeat(32) });
  const created = await tasks.create({ userId: owner, conversationId: "33333333-3333-4333-8333-333333333333", sourceMessageId: crypto.randomUUID(), requestText: "查找合同", requestSummary: "查找合同", requestedOutcome: "找到合同", riskLevel: "low", capabilities: ["files"] });
  const channel = createLocalAgentChannel({ repository, leaseSeconds: 60 });
  const claimed = await channel.claim(device.id); await channel.start({ deviceId: device.id, taskId: created.task.id, leaseToken: claimed!.leaseToken });
  const waiting = await channel.requestActionApproval({ deviceId: device.id, taskId: created.task.id, leaseToken: claimed!.leaseToken, actionId: "delete-1", actionSummary: "删除旧副本", riskLevel: "high" });
  assert.equal(waiting.status, "awaiting_action_approval");
  assert.equal(waiting.pendingActionId, "delete-1");
});
