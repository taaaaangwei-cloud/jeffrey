import { createServerDependencies } from "../../../../../../lib/server/dependencies.ts";
import { resolvePrivateUser } from "../../../../../../lib/http/private-user.ts";
import { apiErrorResponse } from "../../../../../../lib/http/api-error.ts";
import { developmentTaskIdSchema } from "../../../../../../lib/development/http.ts";
import { toPublicDevelopmentTask } from "../../../../../../lib/development/types.ts";
import { verifyReleaseApprovalToken } from "../../../../../../lib/development/approval.ts";
import { z } from "zod";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const dependencies = createServerDependencies();
    const userId = resolvePrivateUser(request, dependencies.config.privateUserId);
    const { id } = await context.params;
    const taskId = developmentTaskIdSchema.parse(id);
    const body = z.object({ approvalToken: z.string().min(20).max(1000) }).parse(await request.json());
    const current = await dependencies.developmentTasks.get(taskId, userId);
    if (!current?.previewSha || !dependencies.developmentConfig.approvalSecret || !await verifyReleaseApprovalToken(dependencies.developmentConfig.approvalSecret, body.approvalToken, taskId, current.previewSha)) {
      return Response.json({ success: false, error: "Invalid release approval" }, { status: 409 });
    }
    const task = await dependencies.developmentTasks.approveRelease(taskId, userId);
    return Response.json({ success: true, developmentTask: toPublicDevelopmentTask(task) });
  } catch (error) {
    return apiErrorResponse(error, "DEVELOPMENT_APPROVAL");
  }
}
