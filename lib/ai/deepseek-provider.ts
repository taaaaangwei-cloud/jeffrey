import OpenAI from "openai";
import type { AIProvider } from "../chat/types.ts";

export function createDeepSeekProvider(params: { client: OpenAI; model: string }): AIProvider {
  return {
    async chat(request) {
      const response = await params.client.chat.completions.create({
        model: params.model,
        messages: [
          {
            role: "system",
            content: [request.systemPrompt, request.context].filter(Boolean).join("\n\n"),
          },
          ...request.messages,
        ],
      });
      const text = response.choices[0]?.message.content?.trim();
      if (!text) throw new Error("DEEPSEEK_EMPTY_RESPONSE");
      return text;
    },
  };
}
