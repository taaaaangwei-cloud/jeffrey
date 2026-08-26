import OpenAI from "openai";
import type { AIProvider } from "../chat/types.ts";

export function createOpenAIProvider(params: { client: OpenAI; model: string }): AIProvider {
  return {
    async chat(request) {
      const response = await params.client.responses.create({
        model: params.model,
        input: [
          {
            role: "system",
            content: [
              `SYSTEM\n${request.systemPrompt}`,
              request.context,
              "RECENT CHAT\n下面按时间顺序提供最近聊天；最后一条 user 消息是 CURRENT USER MESSAGE。",
            ].filter(Boolean).join("\n\n"),
          },
          ...request.messages.map((message) => ({ role: message.role, content: message.content })),
        ],
      });
      const text = response.output_text.trim();
      if (!text) throw new Error("OPENAI_EMPTY_RESPONSE");
      return text;
    },
  };
}
