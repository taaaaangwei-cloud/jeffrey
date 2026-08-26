import { z } from "zod";

const previewChatRequestSchema = z.object({
  message: z.string().trim().min(1).max(10_000),
  history: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(10_000),
  })).max(30).default([]),
});

export function parsePreviewChatRequest(input: unknown) {
  return previewChatRequestSchema.parse(input);
}
