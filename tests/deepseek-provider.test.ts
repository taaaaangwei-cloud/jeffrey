import assert from "node:assert/strict";
import test from "node:test";
import type OpenAI from "openai";
import { createDeepSeekProvider } from "../lib/ai/deepseek-provider.ts";

test("DeepSeek provider maps the system prompt, history, and current message", async () => {
  let captured: unknown;
  const client = {
    chat: { completions: { async create(input: unknown) {
      captured = input;
      return { choices: [{ message: { content: " Jeffrey 回复 " } }] };
    } } },
  } as unknown as OpenAI;
  const provider = createDeepSeekProvider({ client, model: "deepseek-v4-pro" });
  const reply = await provider.chat({
    systemPrompt: "你是 Jeffrey",
    context: "预览模式",
    messages: [{ role: "user", content: "你好" }],
  });
  assert.equal(reply, "Jeffrey 回复");
  assert.deepEqual(captured, {
    model: "deepseek-v4-pro",
    messages: [
      { role: "system", content: "你是 Jeffrey\n\n预览模式" },
      { role: "user", content: "你好" },
    ],
  });
});
