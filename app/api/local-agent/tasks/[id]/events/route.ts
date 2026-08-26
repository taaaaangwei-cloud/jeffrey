import { z } from "zod";
import { createServerDependencies } from "../../../../../../lib/server/dependencies.ts";
import { authenticateLocalAgentRequest } from "../../../../../../lib/local-computer/agent-auth.ts";
import { apiErrorResponse } from "../../../../../../lib/http/api-error.ts";
import { localComputerTaskIdSchema } from "../../../../../../lib/local-computer/http.ts";

const schema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("started"), leaseToken: z.string().min(20).max(1000) }),
  z.object({ type: z.literal("progress"), leaseToken: z.string().min(20).max(1000), sequence: z.number().int().positive(), eventId: z.string().min(1).max(200), publicMessage: z.string().min(1).max(500) }),
  z.object({ type: z.literal("approval_request"), leaseToken: z.string().min(20).max(1000), actionId: z.string().min(1).max(200), actionSummary: z.string().min(1).max(500), riskLevel: z.enum(["medium", "high", "blocked"]) }),
]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const bodyText = await request.text();
  try {
    const dependencies = createServerDependencies(); const device = await authenticateLocalAgentRequest(request, bodyText, dependencies);
    if (!dependencies.localAgentChannel) throw new Error("LOCAL_COMPUTER_AGENT_DISABLED");
    const { id } = await context.params; const taskId = localComputerTaskIdSchema.parse(id); const body = schema.parse(JSON.parse(bodyText));
    const task = body.type === "started"
      ? await dependencies.localAgentChannel.start({ deviceId: device.id, taskId, leaseToken: body.leaseToken })
      : body.type === "progress"
        ? await dependencies.localAgentChannel.progress({ deviceId: device.id, taskId, leaseToken: body.leaseToken, sequence: body.sequence, eventId: body.eventId, publicMessage: body.publicMessage })
        : await dependencies.localAgentChannel.requestActionApproval({ deviceId: device.id, taskId, leaseToken: body.leaseToken, actionId: body.actionId, actionSummary: body.actionSummary, riskLevel: body.riskLevel });
    return Response.json({ success: true, status: task.status });
  } catch (error) { return apiErrorResponse(error, "LOCAL_AGENT_EVENT"); }
}
