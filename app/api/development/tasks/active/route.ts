import { createServerDependencies } from "../../../../../lib/server/dependencies.ts";
import { resolvePrivateUser } from "../../../../../lib/http/private-user.ts";
import { apiErrorResponse } from "../../../../../lib/http/api-error.ts";
import { toServerPublicDevelopmentTask } from "../../../../../lib/development/server-view.ts";

export async function GET(request: Request) {
  try {
    const dependencies = createServerDependencies();
    const userId = resolvePrivateUser(request, dependencies.config.privateUserId);
    const task = await dependencies.developmentTasks.getLatest(userId);
    return Response.json({ success: true, developmentTask: task ? await toServerPublicDevelopmentTask(task, dependencies.developmentConfig.approvalSecret) : null }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error, "DEVELOPMENT_TASK");
  }
}
