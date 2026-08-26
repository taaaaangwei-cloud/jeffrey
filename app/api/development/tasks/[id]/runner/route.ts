import { getDevelopmentAgentConfig, getServerConfig, ServerConfigurationError } from "../../../../../../lib/config/server.ts";
import { developmentNotFoundResponse, developmentTaskIdSchema } from "../../../../../../lib/development/http.ts";
import { createServerDependencies } from "../../../../../../lib/server/dependencies.ts";
import { apiErrorResponse } from "../../../../../../lib/http/api-error.ts";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const developmentConfig = getDevelopmentAgentConfig();
    if (!developmentConfig.configured || !developmentConfig.callbackSecret) throw new ServerConfigurationError();
    if (request.headers.get("authorization") !== `Bearer ${developmentConfig.callbackSecret}`) {
      return Response.json({ success: false, error: "Unauthorized runner" }, { status: 401 });
    }
    const { id } = await context.params;
    const config = getServerConfig();
    const dependencies = createServerDependencies();
    const task = await dependencies.developmentTasks.get(developmentTaskIdSchema.parse(id), config.privateUserId);
    if (!task) return developmentNotFoundResponse();
    return Response.json({
      task: {
        id: task.id,
        request: task.requestText,
        summary: task.requestSummary,
        requestedChanges: task.requestedChanges,
        riskLevel: task.riskLevel,
        branchName: task.branchName,
        baseSha: task.baseSha,
        previewSha: task.previewSha,
        previousProductionSha: task.previousProductionSha,
      },
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error, "DEVELOPMENT_RUNNER_TASK");
  }
}
