import assert from "node:assert/strict";
import test from "node:test";
import { assertLocalComputerTransition } from "../lib/local-computer/state-machine.ts";

test("low-risk local work can start without an extra task confirmation", () => {
  for (const [from, to] of [
    ["draft", "queued"],
    ["queued", "leased"],
    ["leased", "running"],
    ["running", "completed"],
  ] as const) {
    assert.doesNotThrow(() => assertLocalComputerTransition(from, to));
  }
});

test("medium and high-risk local work waits for task approval", () => {
  assert.doesNotThrow(() => assertLocalComputerTransition("draft", "awaiting_task_approval"));
  assert.doesNotThrow(() => assertLocalComputerTransition("awaiting_task_approval", "queued"));
  assert.throws(() => assertLocalComputerTransition("awaiting_task_approval", "running"), /INVALID_LOCAL_COMPUTER_TRANSITION/);
});

test("a running local task pauses for one exact action approval", () => {
  assert.doesNotThrow(() => assertLocalComputerTransition("running", "awaiting_action_approval"));
  assert.doesNotThrow(() => assertLocalComputerTransition("awaiting_action_approval", "running"));
  assert.throws(() => assertLocalComputerTransition("awaiting_action_approval", "completed"), /INVALID_LOCAL_COMPUTER_TRANSITION/);
});

test("unfinished local work can cancel, expire, or fail but terminal work cannot restart", () => {
  for (const status of ["draft", "awaiting_task_approval", "queued", "leased", "running", "awaiting_action_approval"] as const) {
    assert.doesNotThrow(() => assertLocalComputerTransition(status, "canceled"));
    assert.doesNotThrow(() => assertLocalComputerTransition(status, "expired"));
    assert.doesNotThrow(() => assertLocalComputerTransition(status, "failed"));
  }
  for (const status of ["completed", "canceled", "expired", "failed"] as const) {
    assert.throws(() => assertLocalComputerTransition(status, "queued"), /INVALID_LOCAL_COMPUTER_TRANSITION/);
  }
});
