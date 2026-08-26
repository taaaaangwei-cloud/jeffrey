import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryDevelopmentTaskRepository } from "../lib/development/memory-repository.ts";

const owner = "11111111-1111-4111-8111-111111111111";
const otherUser = "99999999-9999-4999-8999-999999999999";

function command() {
  return {
    userId: owner,
    conversationId: "33333333-3333-4333-8333-333333333333",
    sourceMessageId: "44444444-4444-4444-8444-444444444444",
    requestText: "把聊天背景换成深色",
    requestSummary: "将聊天背景改为深色",
    requestedChanges: ["更新聊天背景"],
    riskLevel: "normal" as const,
  };
}

test("creating a task records a safe created event and enforces owner reads", async () => {
  const repository = createMemoryDevelopmentTaskRepository();
  const task = await repository.create(command());

  assert.equal(task.status, "queued");
  assert.equal(await repository.getByOwner(task.id, otherUser), null);
  assert.equal((await repository.listEvents(task.id, owner))[0]?.eventType, "created");
});

test("transitioning a task updates status and appends one idempotent external event", async () => {
  const repository = createMemoryDevelopmentTaskRepository();
  const task = await repository.create(command());

  await repository.transition({
    taskId: task.id,
    userId: owner,
    to: "running",
    event: { eventType: "runner_started", publicMessage: "已开始安全修改", metadata: {}, externalEventId: "github-1" },
    patch: { runnerRunId: "run-1" },
  });
  await repository.appendEvent(task.id, owner, {
    eventType: "runner_started",
    publicMessage: "重复回调",
    metadata: {},
    externalEventId: "github-1",
  });

  assert.equal((await repository.getByOwner(task.id, owner))?.status, "running");
  assert.equal((await repository.listEvents(task.id, owner)).filter((event) => event.externalEventId === "github-1").length, 1);
});

test("one owner can have only one active development task", async () => {
  const repository = createMemoryDevelopmentTaskRepository();
  await repository.create(command());
  await assert.rejects(() => repository.create(command()), /ACTIVE_DEVELOPMENT_TASK_EXISTS/);
});
