import { createServerDependencies } from "../../../../../lib/server/dependencies.ts";
import { resolvePrivateUser } from "../../../../../lib/http/private-user.ts";
import { apiErrorResponse } from "../../../../../lib/http/api-error.ts";
import { localComputerNotFoundResponse, localComputerTaskIdSchema } from "../../../../../lib/local-computer/http.ts";
import { toServerPublicLocalComputerTask } from "../../../../../lib/local-computer/server-view.ts";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const dependencies = createServerDependencies();
    const userId = resolvePrivateUser(request, dependencies.config.privateUserId);
    const { id } = await context.params;
    const task = await dependencies.localComputerRepository.getTaskByOwner(localComputerTaskIdSchema.parse(id), userId);
    if (!task) return localComputerNotFoundResponse();
    const view = await toServerPublicLocalComputerTask(task, dependencies.localComputerConfig.approvalSecret);
    return Response.json({ success: true, ...view }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return apiErrorResponse(error, "LOCAL_COMPUTER_TASK"); }
}
