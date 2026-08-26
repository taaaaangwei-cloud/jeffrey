import { z } from "zod";

export const developmentTaskIdSchema = z.string().uuid();
export const developmentInstructionsSchema = z.object({
  instructions: z.string().trim().min(2).max(4000),
});

export function developmentNotFoundResponse() {
  return Response.json({ success: false, error: "Development task not found" }, { status: 404 });
}
