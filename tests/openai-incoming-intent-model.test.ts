import assert from "node:assert/strict";
import test from "node:test";
import { createOpenAIIncomingIntentModel } from "../lib/chat/openai-incoming-intent-model.ts";

test("the unified model accepts a structured local computer intent", async () => {
  let request: { text?: { format?: { type?: string } } } | undefined;
  const model = createOpenAIIncomingIntentModel({
    model: "gpt-test",
    client: { responses: { async create(input) { request = input as typeof request; return { output_text: JSON.stringify({ kind: "local_computer", summary: "删除旧文件", requestedOutcome: "释放空间", riskLevel: "high", capabilities: ["files"] }) }; } } },
  });
  const result = await model.classify("删除下载目录的旧文件");
  assert.equal(result.kind, "local_computer");
  assert.equal(result.kind === "local_computer" ? result.riskLevel : null, "high");
  assert.equal(request?.text?.format?.type, "json_schema");
});

test("invalid classifier output safely degrades to companion chat", async () => {
  const model = createOpenAIIncomingIntentModel({
    model: "gpt-test",
    client: { responses: { async create() { return { output_text: "not-json" }; } } },
  });
  assert.deepEqual(await model.classify("今天好累"), { kind: "chat" });
});
