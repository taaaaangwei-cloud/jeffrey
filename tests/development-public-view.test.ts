import assert from "node:assert/strict";
import test from "node:test";
import { getDevelopmentTaskPresentation } from "../lib/development/public-view.ts";
import type { PublicDevelopmentTask } from "../lib/development/types.ts";

function task(status: PublicDevelopmentTask["status"], checks: PublicDevelopmentTask["checks"]): PublicDevelopmentTask {
  return {
    id: "task-1", requestSummary: "更新聊天背景", riskLevel: "normal", status, branchName: "jeffrey/task-1",
    previewSha: "abc123", previewUrl: "https://preview.example", runnerUrl: null, checks, changeSummary: null,
    errorCode: null, createdAt: "2026-08-25T00:00:00Z", updatedAt: "2026-08-25T00:00:00Z",
  };
}

const passed = { lint: "passed", typecheck: "passed", tests: "passed", build: "passed" } as const;

test("release confirmation appears only for a fully checked preview", () => {
  assert.equal(getDevelopmentTaskPresentation(task("awaiting_approval", passed)).canApprove, true);
  assert.equal(getDevelopmentTaskPresentation(task("awaiting_approval", { ...passed, tests: "failed" })).canApprove, false);
  assert.equal(getDevelopmentTaskPresentation(task("publishing", passed)).canApprove, false);
});

test("a failed task clearly says the production app is unaffected", () => {
  assert.match(getDevelopmentTaskPresentation(task("failed", passed)).detail, /正式版本未受影响/);
});
