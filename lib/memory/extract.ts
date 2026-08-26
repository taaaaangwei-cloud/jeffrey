import type OpenAI from "openai";
import { z } from "zod";
import { memoryTypes, type MemoryExtractor } from "./types.ts";

const extractionSchema = z.object({
  memories: z.array(z.object({
    type: z.enum(memoryTypes),
    content: z.string().min(1).max(500),
    importance: z.number().min(0).max(1),
  })).max(8),
});

export function createOpenAIMemoryExtractor(params: { client: OpenAI; model: string }): MemoryExtractor {
  return {
    async extract(text) {
      const response = await params.client.responses.create({
        model: params.model,
        input: [
          {
            role: "system",
            content: "从用户原话提取值得长期保存的稳定信息。可返回多条；寒暄、临时无意义内容返回空数组。content 使用第三人称简洁中文，不添加原文没有的信息。",
          },
          { role: "user", content: text },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "memory_candidates",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                memories: {
                  type: "array",
                  maxItems: 8,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      type: { type: "string", enum: [...memoryTypes] },
                      content: { type: "string" },
                      importance: { type: "number", minimum: 0, maximum: 1 },
                    },
                    required: ["type", "content", "importance"],
                  },
                },
              },
              required: ["memories"],
            },
          },
        },
      });
      return extractionSchema.parse(JSON.parse(response.output_text)).memories;
    },
  };
}

export async function extractMemories(extractor: MemoryExtractor, text: string) {
  return extractor.extract(text);
}
