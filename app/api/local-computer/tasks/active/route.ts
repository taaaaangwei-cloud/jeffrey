import { createServerDependencies } from "../../../../../lib/server/dependencies.ts";
import { resolvePrivateUser } from "../../../../../lib/http/private-user.ts";
import { apiErrorResponse } from "../../../../../lib/http/api-error.ts";
import { toServerPublicLocalComputerTask } from "../../../../../lib/local-computer/server-view.ts";

export async function GET(request: Request) {
  try {
    const dependencies = createServerDependencies();
    const userId = resolvePrivateUser(request, dependencies.config.privateUserId);
    const task = await dependencies.localComputerRepository.getActiveTaskByOwner(userId);
    const view = task ? await toServerPublicLocalComputerTask(task, dependencies.localComputerConfig.approvalSecret) : null;
    return Response.json({ success: true, task: view?.task ?? null, approvalToken: view?.approvalToken }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return apiErrorResponse(error, "LOCAL_COMPUTER_TASK"); }
}
