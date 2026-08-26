import { createServerDependencies } from "../../../../../../lib/server/dependencies.ts";
import { resolvePrivateUser } from "../../../../../../lib/http/private-user.ts";
import { apiErrorResponse } from "../../../../../../lib/http/api-error.ts";
import { developmentTaskIdSchema } from "../../../../../../lib/development/http.ts";
import { toPublicDevelopmentTask } from "../../../../../../lib/development/types.ts";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const dependencies = createServerDependencies();
    const userId = resolvePrivateUser(request, dependencies.config.privateUserId);
    const { id } = await context.params;
    const task = await dependencies.developmentTasks.cancel(developmentTaskIdSchema.parse(id), userId);
    return Response.json({ success: true, developmentTask: toPublicDevelopmentTask(task) });
  } catch (error) {
    return apiErrorResponse(error, "DEVELOPMENT_TASK");
  }
}
