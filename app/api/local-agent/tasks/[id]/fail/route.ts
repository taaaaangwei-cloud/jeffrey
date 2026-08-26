import { z } from "zod";
import { createServerDependencies } from "../../../../../../lib/server/dependencies.ts";
import { authenticateLocalAgentRequest } from "../../../../../../lib/local-computer/agent-auth.ts";
import { apiErrorResponse } from "../../../../../../lib/http/api-error.ts";
import { localComputerTaskIdSchema } from "../../../../../../lib/local-computer/http.ts";

const schema = z.object({ leaseToken: z.string().min(20).max(1000), errorCode: z.string().min(1).max(100) });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const bodyText = await request.text();
  try {
    const dependencies = createServerDependencies(); const device = await authenticateLocalAgentRequest(request, bodyText, dependencies);
    if (!dependencies.localAgentChannel) throw new Error("LOCAL_COMPUTER_AGENT_DISABLED");
    const { id } = await context.params; const body = schema.parse(JSON.parse(bodyText));
    const task = await dependencies.localAgentChannel.fail({ deviceId: device.id, taskId: localComputerTaskIdSchema.parse(id), ...body });
    return Response.json({ success: true, status: task.status });
  } catch (error) { return apiErrorResponse(error, "LOCAL_AGENT_FAILURE"); }
}
