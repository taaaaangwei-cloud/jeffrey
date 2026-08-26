import { createServerDependencies } from "../../../../../../lib/server/dependencies.ts";
import { resolvePrivateUser } from "../../../../../../lib/http/private-user.ts";
import { apiErrorResponse } from "../../../../../../lib/http/api-error.ts";
import { localComputerTaskIdSchema } from "../../../../../../lib/local-computer/http.ts";
import { toPublicLocalComputerTask } from "../../../../../../lib/local-computer/types.ts";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const dependencies = createServerDependencies(); const userId = resolvePrivateUser(request, dependencies.config.privateUserId);
    if (!dependencies.localComputerTasks) throw new Error("LOCAL_COMPUTER_AGENT_DISABLED");
    const { id } = await context.params; const task = await dependencies.localComputerTasks.cancel(localComputerTaskIdSchema.parse(id), userId);
    return Response.json({ success: true, task: toPublicLocalComputerTask(task) });
  } catch (error) { return apiErrorResponse(error, "LOCAL_COMPUTER_TASK"); }
}
