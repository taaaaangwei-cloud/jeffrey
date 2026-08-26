import assert from "node:assert/strict";
import test from "node:test";
import { createGitHubActionsDevelopmentRunner } from "../lib/development/github-actions-runner.ts";
import type { DevelopmentTask } from "../lib/development/types.ts";

test("GitHub dispatch contains only task references and never customer text or knowledge", async () => {
  let request: { url: string; init?: RequestInit } | undefined;
  const runner = createGitHubActionsDevelopmentRunner({
    repository: "customer/private-app",
    async installationToken() { return "installation-token"; },
    async fetch(url, init) { request = { url: String(url), init }; return new Response(null, { status: 204 }); },
  });
  const task = {
    id: "55555555-5555-4555-8555-555555555555",
    requestText: "客户的完整私密要求",
    requestSummary: "更新背景",
  } as DevelopmentTask;

  const reference = await runner.start(task);
  const body = String(request?.init?.body);

  assert.equal(request?.url, "https://api.github.com/repos/customer/private-app/dispatches");
  assert.equal(body.includes(task.id), true);
  assert.equal(body.includes(task.requestText), false);
  assert.equal(body.includes("knowledge"), false);
  assert.equal(reference.runId.length > 0, true);
});

test("GitHub errors map to a stable runner failure", async () => {
  const runner = createGitHubActionsDevelopmentRunner({
    repository: "customer/private-app",
    async installationToken() { return "installation-token"; },
    async fetch() { return new Response("secret provider response", { status: 403 }); },
  });
  await assert.rejects(() => runner.start({ id: "task-1" } as DevelopmentTask), /GITHUB_DISPATCH_FAILED/);
});
