import assert from "node:assert/strict";
import test from "node:test";
import { createLocalApprovalToken, verifyLocalApprovalToken } from "../lib/local-computer/approval.ts";

test("a local approval token binds one user, device, task, action, and risk", async () => {
  const secret = "local-approval-secret-that-is-at-least-32-characters";
  const binding = { userId: "user-1", deviceId: "device-1", taskId: "task-1", actionId: "action-1", riskLevel: "high" as const };
  const token = await createLocalApprovalToken(secret, binding, 1_000);

  assert.equal(await verifyLocalApprovalToken(secret, token, binding, 1_001), true);
  assert.equal(await verifyLocalApprovalToken(secret, token, { ...binding, actionId: "action-2" }, 1_001), false);
  assert.equal(await verifyLocalApprovalToken(secret, token, { ...binding, deviceId: "device-2" }, 1_001), false);
  assert.equal(await verifyLocalApprovalToken(secret, token, { ...binding, riskLevel: "medium" }, 1_001), false);
  assert.equal(await verifyLocalApprovalToken(secret, token, binding, 1_000 + 15 * 60_000 + 1), false);
});

test("tampered and malformed local approval tokens are rejected", async () => {
  const secret = "local-approval-secret-that-is-at-least-32-characters";
  const binding = { userId: "user-1", deviceId: "device-1", taskId: "task-1", actionId: null, riskLevel: "medium" as const };
  const token = await createLocalApprovalToken(secret, binding);

  assert.equal(await verifyLocalApprovalToken(secret, `${token}x`, binding), false);
  assert.equal(await verifyLocalApprovalToken(secret, "not-a-token", binding), false);
});
