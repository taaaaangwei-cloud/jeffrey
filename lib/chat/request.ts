import { z } from "zod";

const chatRequestSchema = z.object({
  characterId: z.uuid(),
  conversationId: z.uuid(),
  message: z.string().trim().max(10_000),
  type: z.enum(["text", "image", "sticker", "audio"]).default("text"),
  mediaUrl: z.url().nullable().optional(),
  duration: z.number().int().min(0).max(3_600_000).nullable().optional(),
}).superRefine((value, context) => {
  if (!value.message && !value.mediaUrl) {
    context.addIssue({
      code: "custom",
      path: ["message"],
      message: "Message or media URL is required",
    });
  }
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export function parseChatRequest(input: unknown): ChatRequest {
  return chatRequestSchema.parse(input);
}
