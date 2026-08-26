import assert from "node:assert/strict";
import test from "node:test";
import { createOpenAIDevelopmentIntentModel } from "../lib/development/openai-intent-model.ts";

test("the intent adapter sends only the current message and accepts structured app changes", async () => {
  let captured: unknown;
  const model = createOpenAIDevelopmentIntentModel({
    model: "gpt-test",
    client: {
      responses: {
        async create(request: unknown) {
          captured = request;
          return { output_text: JSON.stringify({ kind: "app_change", summary: "更换背景", requestedChanges: ["更新背景色"], riskLevel: "normal" }) };
        },
      },
    },
  });

  assert.equal((await model.classify("把背景换成深色")).kind, "app_change");
  const serialized = JSON.stringify(captured);
  assert.equal(serialized.includes("把背景换成深色"), true);
  assert.equal(serialized.includes("memory"), false);
  assert.equal(serialized.includes("knowledge"), false);
});

test("invalid model output is rejected so the router can fall back to chat", async () => {
  const model = createOpenAIDevelopmentIntentModel({
    model: "gpt-test",
    client: { responses: { async create() { return { output_text: "not json" }; } } },
  });
  await assert.rejects(() => model.classify("你好"), /INVALID_DEVELOPMENT_INTENT/);
});
