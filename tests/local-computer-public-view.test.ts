import assert from "node:assert/strict";
import test from "node:test";
import { getLocalComputerTaskPresentation } from "../lib/local-computer/presentation.ts";

test("local task states expose clear Chinese progress and only valid actions", () => {
  assert.deepEqual(getLocalComputerTaskPresentation("awaiting_task_approval"), { label: "等待你确认", tone: "warning", actions: ["approve", "reject"] });
  assert.deepEqual(getLocalComputerTaskPresentation("running"), { label: "Codex 正在执行", tone: "active", actions: ["cancel"] });
  assert.deepEqual(getLocalComputerTaskPresentation("awaiting_action_approval"), { label: "等待确认具体操作", tone: "warning", actions: ["approve_action", "reject"] });
  assert.deepEqual(getLocalComputerTaskPresentation("completed"), { label: "已完成", tone: "success", actions: [] });
});
