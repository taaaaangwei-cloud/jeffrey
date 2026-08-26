import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryEngine } from "../lib/memory/engine.ts";
import { createMemoryMemoryRepository } from "../lib/memory/memory-repository.ts";

const userId = "11111111-1111-4111-8111-111111111111";
const characterId = "22222222-2222-4222-8222-222222222222";

test("one user message can create multiple traceable memories without duplicate growth", async () => {
  const repository = createMemoryMemoryRepository();
  const engine = createMemoryEngine({
    repository,
    embeddings: { async generate(text) { return text.includes("小明") ? [1, 0, 0] : [0, 1, 0]; } },
    extractor: {
      async extract() {
        return [
          { type: "profile", content: "用户叫小明", importance: 0.9 },
          { type: "preference", content: "用户不喜欢香菜", importance: 0.7 },
        ];
      },
    },
  });
  const sourceMessage = {
    id: "44444444-4444-4444-8444-444444444444",
    conversationId: "33333333-3333-4333-8333-333333333333",
    sender: "user" as const,
    type: "text" as const,
    content: "我叫小明，而且我不喜欢香菜。",
    mediaUrl: null,
    duration: null,
    createdAt: "2026-08-25T00:00:00.000Z",
  };

  await engine.extractAndSave({ userId, characterId, sourceMessage });
  await engine.extractAndSave({ userId, characterId, sourceMessage });

  const saved = await repository.list({ userId, characterId });
  assert.equal(saved.length, 2);
  assert.deepEqual(saved.map(({ type, content }) => ({ type, content })), [
    { type: "profile", content: "用户叫小明" },
    { type: "preference", content: "用户不喜欢香菜" },
  ]);
  assert.ok(saved.every((memory) => memory.sourceMessageId === sourceMessage.id));
});
