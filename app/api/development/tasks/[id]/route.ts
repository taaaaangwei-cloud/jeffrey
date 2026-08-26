import { createServerDependencies } from "../../../../../lib/server/dependencies.ts";
import { resolvePrivateUser } from "../../../../../lib/http/private-user.ts";
import { apiErrorResponse } from "../../../../../lib/http/api-error.ts";
import { developmentNotFoundResponse, developmentTaskIdSchema } from "../../../../../lib/development/http.ts";
import { toServerPublicDevelopmentTask } from "../../../../../lib/development/server-view.ts";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const dependencies = createServerDependencies();
    const userId = resolvePrivateUser(request, dependencies.config.privateUserId);
    const { id } = await context.params;
    const task = await dependencies.developmentTasks.get(developmentTaskIdSchema.parse(id), userId);
    if (!task) return developmentNotFoundResponse();
    return Response.json({ success: true, developmentTask: await toServerPublicDevelopmentTask(task, dependencies.developmentConfig.approvalSecret) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error, "DEVELOPMENT_TASK");
  }
}
