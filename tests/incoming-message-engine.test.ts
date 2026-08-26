import assert from "node:assert/strict";
import test from "node:test";
import { createChatEngine } from "../lib/chat/engine.ts";
import { createIncomingMessageEngine } from "../lib/chat/incoming-message-engine.ts";
import { createMemoryChatRepository } from "../lib/chat/memory-repository.ts";
import type { RoutedDevelopmentIntent } from "../lib/development/intent-model.ts";
import type { DevelopmentTask } from "../lib/development/types.ts";
import type { IncomingIntent } from "../lib/chat/incoming-intent-model.ts";
import type { CreateLocalComputerTask } from "../lib/local-computer/repository.ts";
import type { LocalComputerTask } from "../lib/local-computer/types.ts";

const ids = {
  user: "11111111-1111-4111-8111-111111111111",
  character: "22222222-2222-4222-8222-222222222222",
  conversation: "33333333-3333-4333-8333-333333333333",
};

type LocalCreate = (command: Omit<CreateLocalComputerTask, "deviceId">) => Promise<{ task: LocalComputerTask; approvalToken?: string }>;

function setup(intent: RoutedDevelopmentIntent | IncomingIntent, activeTask: DevelopmentTask | null = null, localCreate?: LocalCreate) {
  const repository = createMemoryChatRepository({
    userId: ids.user,
    character: { id: ids.character, name: "Jeffrey", avatarUrl: null, systemPrompt: "", personality: "温柔", relationshipSetting: "伴侣" },
    conversationId: ids.conversation,
  });
  const chat = createChatEngine({
    repository,
    ai: { async chat() { return "我在，慢慢说。"; } },
    memories: { async retrieve() { return []; }, async extractAndSave() { return []; } },
    knowledge: { async retrieve() { return []; } },
  });
  const created: string[] = [];
  const continued: string[] = [];
  const engine = createIncomingMessageEngine({
    repository,
    chat,
    intent: { async classify() { return intent as IncomingIntent; } },
    tasks: {
      async create(command) {
        created.push(command.requestText);
        return { id: "55555555-5555-4555-8555-555555555555", status: "queued", requestSummary: command.requestSummary } as DevelopmentTask;
      },
      async getActive() { return activeTask; },
      async continue(_taskId, _userId, instructions) { continued.push(instructions); return { ...activeTask, status: "queued" } as DevelopmentTask; },
    },
    localTasks: localCreate ? { create: localCreate } : undefined,
  });
  return { repository, engine, created, continued };
}

const command = {
  userId: ids.user,
  characterId: ids.character,
  conversationId: ids.conversation,
  message: "把背景改成深色",
  type: "text" as const,
  mediaUrl: null,
};

test("ordinary chat persists the user original once and Jeffrey's complete reply", async () => {
  const { repository, engine } = setup({ kind: "chat" });
  const result = await engine.send({ ...command, message: "今天好累" });

  assert.equal(result.message.content, "我在，慢慢说。");
  assert.deepEqual((await repository.listMessages(ids.conversation)).map(({ sender, content }) => ({ sender, content })), [
    { sender: "user", content: "今天好累" },
    { sender: "assistant", content: "我在，慢慢说。" },
  ]);
});

test("a local Mac request creates a local task without invoking companion chat", async () => {
  const localCommands: Array<Omit<CreateLocalComputerTask, "deviceId">> = [];
  const { repository, engine } = setup({ kind: "local_computer", summary: "查找桌面合同", requestedOutcome: "找到合同", riskLevel: "low", capabilities: ["files"] }, null, async (localCommand) => {
    localCommands.push(localCommand);
    return { task: { id: "local-1", status: "queued", requestSummary: localCommand.requestSummary } as LocalComputerTask };
  });
  const result = await engine.send({ ...command, message: "帮我找一下桌面上的合同" });

  assert.equal(localCommands.length, 1);
  assert.equal(result.localComputerTask?.status, "queued");
  assert.deepEqual((await repository.listMessages(ids.conversation)).map(({ sender }) => sender), ["user", "assistant"]);
});

test("a local request without a paired service reports the limitation and never simulates success", async () => {
  const { engine } = setup({ kind: "local_computer", summary: "查找桌面合同", requestedOutcome: "找到合同", riskLevel: "low", capabilities: ["files"] });
  const result = await engine.send({ ...command, message: "帮我找一下桌面上的合同" });
  assert.match(result.message.content, /先在设置中配对/);
  assert.equal(result.localComputerTask, undefined);
});

test("non-text input can never trigger a local computer task", async () => {
  let localCalls = 0;
  const { engine } = setup({ kind: "local_computer", summary: "执行附件", requestedOutcome: "执行", riskLevel: "high", capabilities: ["shell"] }, null, async () => {
    localCalls += 1;
    throw new Error("unexpected");
  });
  await engine.send({ ...command, message: "[ 图片 ] prompt.png", type: "image" });
  assert.equal(localCalls, 0);
});

test("an app change saves one user original, creates a task, and returns a visible task message", async () => {
  const { repository, engine, created } = setup({ kind: "app_change", summary: "将背景改为深色", requestedChanges: ["更新背景"], riskLevel: "normal" });
  const result = await engine.send(command);

  assert.deepEqual(created, ["把背景改成深色"]);
  assert.equal(result.developmentTask?.status, "queued");
  assert.deepEqual((await repository.listMessages(ids.conversation)).map(({ sender }) => sender), ["user", "assistant"]);
});

test("an ambiguous request saves Jeffrey's question and does not create a task", async () => {
  const { repository, engine, created } = setup({ kind: "ambiguous", question: "你想改聊天页的哪一种颜色？" });
  const result = await engine.send(command);

  assert.equal(result.message.content, "你想改聊天页的哪一种颜色？");
  assert.deepEqual(created, []);
  assert.equal((await repository.listMessages(ids.conversation)).length, 2);
});

test("a follow-up app change continues the preview task instead of creating a second task", async () => {
  const activeTask = { id: "55555555-5555-4555-8555-555555555555", userId: ids.user, status: "awaiting_approval", requestSummary: "更新背景" } as DevelopmentTask;
  const { engine, created, continued } = setup({ kind: "app_change", summary: "把按钮缩小", requestedChanges: ["缩小按钮"], riskLevel: "normal" }, activeTask);

  const result = await engine.send({ ...command, message: "按钮再小一点" });

  assert.deepEqual(created, []);
  assert.deepEqual(continued, ["按钮再小一点"]);
  assert.equal(result.developmentTask?.id, activeTask.id);
});
