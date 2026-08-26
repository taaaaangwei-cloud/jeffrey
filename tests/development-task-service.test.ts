import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryDevelopmentTaskRepository } from "../lib/development/memory-repository.ts";
import { createRecordingDevelopmentRunner } from "../lib/development/recording-runner.ts";
import { createDevelopmentTaskService } from "../lib/development/service.ts";

const owner = "11111111-1111-4111-8111-111111111111";

function request() {
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

test("creating a development task persists it and dispatches exactly once", async () => {
  const repository = createMemoryDevelopmentTaskRepository();
  const runner = createRecordingDevelopmentRunner();
  const service = createDevelopmentTaskService({ repository, runner });

  const task = await service.create(request());

  assert.equal(task.status, "queued");
  assert.deepEqual(runner.calls.map((call) => call.operation), ["start"]);
  assert.equal((await repository.getByOwner(task.id, owner))?.id, task.id);
});

test("a dispatch failure is visible as a failed task without leaking runner details", async () => {
  const repository = createMemoryDevelopmentTaskRepository();
  const service = createDevelopmentTaskService({
    repository,
    runner: { async start() { throw new Error("secret runner token"); }, async continue() { throw new Error("unused"); } },
  });

  const task = await service.create(request());

  assert.equal(task.status, "failed");
  assert.equal(task.errorCode, "RUNNER_DISPATCH_FAILED");
  assert.equal(JSON.stringify(task).includes("secret runner token"), false);
});

test("continuing a preview reuses the task and invalidates the old approval", async () => {
  const repository = createMemoryDevelopmentTaskRepository();
  const runner = createRecordingDevelopmentRunner();
  const service = createDevelopmentTaskService({ repository, runner });
  const created = await service.create(request());
  await repository.transition({ taskId: created.id, userId: owner, to: "running", event: { eventType: "running", publicMessage: "", metadata: {} } });
  await repository.transition({ taskId: created.id, userId: owner, to: "testing", event: { eventType: "testing", publicMessage: "", metadata: {} } });
  await repository.transition({ taskId: created.id, userId: owner, to: "previewing", event: { eventType: "previewing", publicMessage: "", metadata: {} } });
  await repository.transition({ taskId: created.id, userId: owner, to: "awaiting_approval", patch: { previewSha: "old-sha", approvalNonceHash: "old-hash" }, event: { eventType: "preview", publicMessage: "", metadata: {} } });

  const updated = await service.continue(created.id, owner, "按钮再小一点");

  assert.equal(updated.status, "queued");
  assert.equal(updated.previewSha, null);
  assert.equal(updated.approvalNonceHash, null);
  assert.equal(runner.calls.at(-1)?.operation, "continue");
});

test("canceling a task keeps its audit history", async () => {
  const repository = createMemoryDevelopmentTaskRepository();
  const service = createDevelopmentTaskService({ repository, runner: createRecordingDevelopmentRunner() });
  const created = await service.create(request());
  const canceled = await service.cancel(created.id, owner);
  assert.equal(canceled.status, "canceled");
  assert.equal((await repository.listEvents(created.id, owner)).at(-1)?.eventType, "canceled");
});

test("release approval is bound to a fully checked preview and dispatches once", async () => {
  const repository = createMemoryDevelopmentTaskRepository();
  const released: string[] = [];
  const service = createDevelopmentTaskService({
    repository,
    runner: createRecordingDevelopmentRunner(),
    release: { async dispatch(task) { released.push(task.previewSha ?? ""); } },
  });
  const created = await service.create(request());
  for (const to of ["running", "testing", "previewing"] as const) {
    await repository.transition({ taskId: created.id, userId: owner, to, event: { eventType: to, publicMessage: "", metadata: {} } });
  }
  await repository.transition({
    taskId: created.id, userId: owner, to: "awaiting_approval",
    patch: { previewSha: "abcdef123456", checks: { lint: "passed", typecheck: "passed", tests: "passed", build: "passed" } },
    event: { eventType: "preview", publicMessage: "", metadata: {} },
  });

  const publishing = await service.approveRelease(created.id, owner);
  assert.equal(publishing.status, "publishing");
  assert.deepEqual(released, ["abcdef123456"]);
  await assert.rejects(() => service.approveRelease(created.id, owner), /INVALID_RELEASE_APPROVAL/);
});
