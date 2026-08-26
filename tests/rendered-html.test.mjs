import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the private Jeffrey chat without a contacts screen", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>回声 · 让每段对话都被温柔记住<\/title>/);
  assert.match(html, />Jeffrey</);
  assert.match(html, /Jeffrey 的狐狸头像/);
  assert.match(html, /class="conversation full"/);
  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/);
  assert.doesNotMatch(html, /搜索对话|小满|联系人/);
});

test("client source uses real same-origin chat, history and knowledge APIs", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /fetch\("\/api\/chat"/);
  assert.match(source, /\/api\/conversations\/\$\{config\.conversationId\}\/messages/);
  assert.match(source, /fetch\("\/api\/knowledge\/import"/);
  assert.match(source, /disabled=\{!status\.configured \|\| sending\}/);
  assert.doesNotMatch(source, /const chats\s*=|小满|Mock response/);
  await Promise.all([
    access(new URL("../public/manifest.webmanifest", import.meta.url)),
    access(new URL("../public/sw.js", import.meta.url)),
    access(new URL("../public/jeffrey-avatar.jpg", import.meta.url)),
  ]);
});
