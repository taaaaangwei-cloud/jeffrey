import { createServerDependencies } from "../../../../../../lib/server/dependencies.ts";
import { resolvePrivateUser } from "../../../../../../lib/http/private-user.ts";
import { apiErrorResponse } from "../../../../../../lib/http/api-error.ts";
import { localApprovalRequestSchema, localComputerTaskIdSchema } from "../../../../../../lib/local-computer/http.ts";
import { toPublicLocalComputerTask } from "../../../../../../lib/local-computer/types.ts";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const dependencies = createServerDependencies();
    const userId = resolvePrivateUser(request, dependencies.config.privateUserId);
    if (!dependencies.localComputerTasks) throw new Error("LOCAL_COMPUTER_AGENT_DISABLED");
    const { id } = await context.params;
    const body = localApprovalRequestSchema.parse(await request.json());
    const task = await dependencies.localComputerTasks.approveTask(localComputerTaskIdSchema.parse(id), userId, body.approvalToken);
    return Response.json({ success: true, task: toPublicLocalComputerTask(task) });
  } catch (error) { return apiErrorResponse(error, "LOCAL_COMPUTER_APPROVAL"); }
}
