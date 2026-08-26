import assert from "node:assert/strict";
import test from "node:test";
import { createReleaseApprovalToken, verifyReleaseApprovalToken } from "../lib/development/approval.ts";

test("release approval is cryptographically bound to one task and preview sha", async () => {
  const secret = "approval-secret-that-is-at-least-32-characters";
  const token = await createReleaseApprovalToken(secret, "task-1", "abc1234");
  assert.equal(await verifyReleaseApprovalToken(secret, token, "task-1", "abc1234"), true);
  assert.equal(await verifyReleaseApprovalToken(secret, token, "task-1", "different"), false);
  assert.equal(await verifyReleaseApprovalToken(secret, token, "task-2", "abc1234"), false);
  assert.equal(await verifyReleaseApprovalToken(secret, token, "task-1", "abc1234", Date.now() + 16 * 60_000), false);
});
