import assert from "node:assert/strict";
import test from "node:test";
import { createDevelopmentIntentRouter } from "../lib/development/intent-router.ts";

test("only an explicit current user app request becomes a development task", async () => {
  const router = createDevelopmentIntentRouter({
    async classify(message) {
      if (message.includes("背景")) return { kind: "app_change", summary: "将聊天背景改为深色", requestedChanges: ["更新聊天背景"], riskLevel: "normal" };
      return { kind: "chat" };
    },
  });

  assert.deepEqual(await router.route("今天好累"), { kind: "chat" });
  assert.equal((await router.route("把聊天背景换成深色")).kind, "app_change");
});

test("an unclear app comment asks a question instead of dispatching", async () => {
  const router = createDevelopmentIntentRouter({
    async classify() { return { kind: "ambiguous", question: "你想修改聊天页的哪一种颜色？" }; },
  });

  assert.deepEqual(await router.route("这个颜色不好看"), {
    kind: "ambiguous",
    question: "你想修改聊天页的哪一种颜色？",
  });
});

test("sensitive app changes require scope confirmation before dispatch", async () => {
  const router = createDevelopmentIntentRouter({
    async classify() {
      return { kind: "app_change", summary: "删除全部记忆", requestedChanges: ["删除记忆数据"], riskLevel: "sensitive" };
    },
  });

  assert.deepEqual(await router.route("删除全部记忆"), {
    kind: "sensitive_confirmation",
    summary: "删除全部记忆",
    question: "这项修改可能影响数据或安全。请明确确认修改范围后，我才会创建任务。",
  });
});

test("a classification failure safely falls back to ordinary chat", async () => {
  const router = createDevelopmentIntentRouter({ async classify() { throw new Error("provider down"); } });
  assert.deepEqual(await router.route("随便聊聊"), { kind: "chat" });
});
