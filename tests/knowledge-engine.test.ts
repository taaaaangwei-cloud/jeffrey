import assert from "node:assert/strict";
import test from "node:test";
import { createKnowledgeEngine } from "../lib/knowledge/engine.ts";
import { createMemoryKnowledgeRepository } from "../lib/knowledge/memory-repository.ts";

test("Obsidian Markdown import preserves source, parses properties, and is idempotent", async () => {
  const repository = createMemoryKnowledgeRepository();
  const engine = createKnowledgeEngine({
    repository,
    embeddings: { async generate(text) { return [text.length, 1]; } },
    chunkSize: 40,
    chunkOverlap: 8,
  });
  const markdown = `---
title: Jeffrey 人设
tags:
  - jeffrey
---
# Jeffrey

Jeffrey 温柔、成熟而幽默，会自然关心用户。

参见 [[共同经历]]。`;
  const input = {
    userId: "11111111-1111-4111-8111-111111111111",
    files: [{ filename: "Jeffrey.md", path: "角色/Jeffrey.md", content: markdown }],
  };

  await engine.importMarkdown(input);
  await engine.importMarkdown(input);

  const documents = await repository.listDocuments(input.userId);
  assert.equal(documents.length, 1);
  assert.equal(documents[0].content, markdown);
  assert.equal(documents[0].metadata.title, "Jeffrey 人设");
  const chunks = await repository.listChunks(documents[0].id);
  assert.ok(chunks.length >= 2);
  assert.ok(chunks.some((chunk) => chunk.content.includes("[[共同经历]]")));
  assert.deepEqual(chunks.map((chunk) => chunk.chunkIndex), chunks.map((_, index) => index));
});
