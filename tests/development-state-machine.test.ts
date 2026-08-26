import assert from "node:assert/strict";
import test from "node:test";
import { assertDevelopmentTransition } from "../lib/development/state-machine.ts";

test("a development task follows the preview and protected release path", () => {
  const path = ["queued", "running", "testing", "previewing", "awaiting_approval", "publishing", "published"] as const;

  for (let index = 0; index < path.length - 1; index += 1) {
    assert.doesNotThrow(() => assertDevelopmentTransition(path[index], path[index + 1]));
  }
});

test("a development task cannot skip checks or restart after a terminal state", () => {
  assert.throws(() => assertDevelopmentTransition("running", "published"), /INVALID_DEVELOPMENT_TRANSITION/);
  assert.throws(() => assertDevelopmentTransition("canceled", "running"), /INVALID_DEVELOPMENT_TRANSITION/);
  assert.throws(() => assertDevelopmentTransition("rolled_back", "queued"), /INVALID_DEVELOPMENT_TRANSITION/);
});

test("continuing an approved preview invalidates it and queues the same task again", () => {
  assert.doesNotThrow(() => assertDevelopmentTransition("awaiting_approval", "queued"));
  assert.throws(() => assertDevelopmentTransition("previewing", "queued"), /INVALID_DEVELOPMENT_TRANSITION/);
});

test("execution can fail, unpublished work can be canceled, and publishing can roll back", () => {
  for (const status of ["queued", "running", "testing", "previewing", "awaiting_approval"] as const) {
    assert.doesNotThrow(() => assertDevelopmentTransition(status, "failed"));
    assert.doesNotThrow(() => assertDevelopmentTransition(status, "canceled"));
  }
  assert.doesNotThrow(() => assertDevelopmentTransition("publishing", "rollback_running"));
  assert.doesNotThrow(() => assertDevelopmentTransition("published", "rollback_requested"));
  assert.doesNotThrow(() => assertDevelopmentTransition("rollback_requested", "rollback_running"));
  assert.doesNotThrow(() => assertDevelopmentTransition("rollback_running", "rolled_back"));
});
