import { z } from "zod";

export const localComputerTaskIdSchema = z.string().uuid();
export const localApprovalRequestSchema = z.object({ approvalToken: z.string().min(20).max(2000) });

export function localComputerNotFoundResponse() {
  return Response.json({ success: false, error: "Local computer task not found" }, { status: 404 });
}
