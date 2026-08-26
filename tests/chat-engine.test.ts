import assert from "node:assert/strict";
import test from "node:test";
import { createChatEngine } from "../lib/chat/engine.ts";
import { createMemoryChatRepository } from "../lib/chat/memory-repository.ts";

const ids = {
  user: "11111111-1111-4111-8111-111111111111",
  character: "22222222-2222-4222-8222-222222222222",
  conversation: "33333333-3333-4333-8333-333333333333",
};

test("sending a message persists both complete originals and returns Jeffrey's reply", async () => {
  const repository = createMemoryChatRepository({
    userId: ids.user,
    character: {
      id: ids.character,
      name: "Jeffrey",
      avatarUrl: "/jeffrey-avatar.jpg",
      systemPrompt: "你是 Jeffrey。",
      personality: "温柔、幽默",
      relationshipSetting: "长期 AI 伴侣",
    },
    conversationId: ids.conversation,
  });
  const engine = createChatEngine({
    repository,
    ai: {
      async chat() {
        return "辛苦了，先靠着我休息一会儿。";
      },
    },
    memories: {
      async retrieve() { return []; },
      async extractAndSave() { return []; },
    },
    knowledge: {
      async retrieve() { return []; },
    },
  });

  const result = await engine.send({
    userId: ids.user,
    characterId: ids.character,
    conversationId: ids.conversation,
    message: "今天好累",
    type: "text",
    mediaUrl: null,
  });

  assert.equal(result.content, "辛苦了，先靠着我休息一会儿。");
  assert.equal(result.sender, "assistant");
  assert.deepEqual(
    (await repository.listMessages(ids.conversation)).map(({ sender, content }) => ({ sender, content })),
    [
      { sender: "user", content: "今天好累" },
      { sender: "assistant", content: "辛苦了，先靠着我休息一会儿。" },
    ],
  );
});

test("an AI failure keeps the user's complete original message", async () => {
  const repository = createMemoryChatRepository({
    userId: ids.user,
    character: { id: ids.character, name: "Jeffrey", avatarUrl: null, systemPrompt: "", personality: "", relationshipSetting: "" },
    conversationId: ids.conversation,
  });
  const engine = createChatEngine({
    repository,
    ai: { async chat() { throw new Error("provider secret must not leak"); } },
    memories: { async retrieve() { return []; }, async extractAndSave() { return []; } },
    knowledge: { async retrieve() { return []; } },
  });

  await assert.rejects(() => engine.send({
    userId: ids.user,
    characterId: ids.character,
    conversationId: ids.conversation,
    message: "这句话必须保留",
    type: "text",
    mediaUrl: null,
  }));

  assert.deepEqual(
    (await repository.listMessages(ids.conversation)).map(({ sender, content }) => ({ sender, content })),
    [{ sender: "user", content: "这句话必须保留" }],
  );
});

test("memory and knowledge retrieval failures degrade to an ordinary reply", async () => {
  const repository = createMemoryChatRepository({
    userId: ids.user,
    character: { id: ids.character, name: "Jeffrey", avatarUrl: null, systemPrompt: "", personality: "", relationshipSetting: "" },
    conversationId: ids.conversation,
  });
  const engine = createChatEngine({
    repository,
    ai: { async chat(params) { assert.equal(params.context, ""); return "我在。"; } },
    memories: { async retrieve() { throw new Error("embedding unavailable"); }, async extractAndSave() { throw new Error("extract unavailable"); } },
    knowledge: { async retrieve() { throw new Error("vector unavailable"); } },
  });

  const result = await engine.send({ userId: ids.user, characterId: ids.character, conversationId: ids.conversation, message: "还在吗", type: "text", mediaUrl: null });
  assert.equal(result.content, "我在。");
});

test("a conversation owned by another user is rejected before saving", async () => {
  const repository = createMemoryChatRepository({
    userId: ids.user,
    character: { id: ids.character, name: "Jeffrey", avatarUrl: null, systemPrompt: "", personality: "", relationshipSetting: "" },
    conversationId: ids.conversation,
  });
  const engine = createChatEngine({
    repository,
    ai: { async chat() { return "不应调用"; } },
    memories: { async retrieve() { return []; }, async extractAndSave() { return []; } },
    knowledge: { async retrieve() { return []; } },
  });

  await assert.rejects(() => engine.send({
    userId: "99999999-9999-4999-8999-999999999999",
    characterId: ids.character,
    conversationId: ids.conversation,
    message: "越权消息",
    type: "text",
    mediaUrl: null,
  }), /CHAT_RESOURCE_NOT_FOUND/);
  assert.equal((await repository.listMessages(ids.conversation)).length, 0);
});
