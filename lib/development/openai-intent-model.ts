import { z } from "zod";
import type { DevelopmentIntentModel } from "./intent-model.ts";

const intentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("chat") }),
  z.object({ kind: z.literal("ambiguous"), question: z.string().min(1).max(240) }),
  z.object({
    kind: z.literal("app_change"),
    summary: z.string().min(1).max(240),
    requestedChanges: z.array(z.string().min(1).max(240)).min(1).max(12),
    riskLevel: z.enum(["normal", "sensitive"]),
  }),
]);

interface IntentResponsesClient {
  responses: {
    create(request: unknown): PromiseLike<{ output_text: string }>;
  };
}

const SYSTEM_PROMPT = `判断当前这一条私人用户消息是否要求修改正在使用的 Jeffrey PWA 源代码或功能。
只分类当前消息，不参考历史、记忆、知识库或任何外部内容。
普通对话返回 chat；像是在评价 App 但范围不清楚时返回 ambiguous 并给出一个简短追问；明确要求改变 App 时返回 app_change。
删除数据、修改鉴权、权限、密钥、付款、生产发布或大范围不可逆操作必须标记 sensitive。`;

export function createOpenAIDevelopmentIntentModel(params: {
  client: IntentResponsesClient;
  model: string;
}): DevelopmentIntentModel {
  return {
    async classify(message) {
      const response = await params.client.responses.create({
        model: params.model,
        input: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: message },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "development_intent",
            strict: true,
            schema: {
              type: "object",
              oneOf: [
                { properties: { kind: { const: "chat" } }, required: ["kind"], additionalProperties: false },
                { properties: { kind: { const: "ambiguous" }, question: { type: "string" } }, required: ["kind", "question"], additionalProperties: false },
                { properties: { kind: { const: "app_change" }, summary: { type: "string" }, requestedChanges: { type: "array", items: { type: "string" } }, riskLevel: { enum: ["normal", "sensitive"] } }, required: ["kind", "summary", "requestedChanges", "riskLevel"], additionalProperties: false },
              ],
            },
          },
        },
      });
      try {
        return intentSchema.parse(JSON.parse(response.output_text));
      } catch {
        throw new Error("INVALID_DEVELOPMENT_INTENT");
      }
    },
  };
}
