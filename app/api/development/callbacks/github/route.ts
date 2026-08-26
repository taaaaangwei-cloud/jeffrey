import { z } from "zod";
import { getDevelopmentAgentConfig, getServerConfig, ServerConfigurationError } from "../../../../../lib/config/server.ts";
import { verifyDevelopmentCallback } from "../../../../../lib/development/callback-signature.ts";
import { createServerDependencies } from "../../../../../lib/server/dependencies.ts";
import { apiErrorResponse } from "../../../../../lib/http/api-error.ts";

const callbackSchema = z.object({
  taskId: z.string().uuid(),
  status: z.enum(["running", "testing", "previewing", "awaiting_approval", "publishing", "published", "failed", "rollback_running", "rolled_back"]),
  publicMessage: z.string().min(1).max(500),
  previewSha: z.string().regex(/^[a-f0-9]{7,64}$/i).optional(),
  publishedSha: z.string().regex(/^[a-f0-9]{7,64}$/i).optional(),
  previousProductionSha: z.string().regex(/^[a-f0-9]{7,64}$/i).optional(),
  previewUrl: z.string().url().optional(),
  runnerUrl: z.string().url().optional(),
  changeSummary: z.string().max(2000).optional(),
  checks: z.object({
    lint: z.enum(["pending", "passed", "failed", "skipped"]),
    typecheck: z.enum(["pending", "passed", "failed", "skipped"]),
    tests: z.enum(["pending", "passed", "failed", "skipped"]),
    build: z.enum(["pending", "passed", "failed", "skipped"]),
  }).optional(),
  errorCode: z.string().max(100).optional(),
});

export async function POST(request: Request) {
  try {
    const developmentConfig = getDevelopmentAgentConfig();
    if (!developmentConfig.configured || !developmentConfig.callbackSecret) throw new ServerConfigurationError();
    const body = await request.text();
    const timestamp = request.headers.get("x-jeffrey-timestamp") ?? "";
    const eventId = request.headers.get("x-jeffrey-event-id") ?? "";
    const signature = request.headers.get("x-jeffrey-signature") ?? "";
    if (!eventId || !await verifyDevelopmentCallback({ secret: developmentConfig.callbackSecret, body, timestamp, eventId, signature })) {
      return Response.json({ success: false, error: "Invalid callback signature" }, { status: 401 });
    }
    const callback = callbackSchema.parse(JSON.parse(body));
    const config = getServerConfig();
    const dependencies = createServerDependencies();
    const task = await dependencies.developmentTasks.applyRunnerEvent({
      taskId: callback.taskId,
      userId: config.privateUserId,
      eventId,
      status: callback.status,
      publicMessage: callback.publicMessage,
      patch: {
        ...(callback.previewSha ? { previewSha: callback.previewSha } : {}),
        ...(callback.publishedSha ? { publishedSha: callback.publishedSha, publishedAt: new Date().toISOString() } : {}),
        ...(callback.previousProductionSha ? { previousProductionSha: callback.previousProductionSha } : {}),
        ...(callback.previewUrl ? { previewUrl: callback.previewUrl } : {}),
        ...(callback.runnerUrl ? { runnerUrl: callback.runnerUrl } : {}),
        ...(callback.changeSummary ? { changeSummary: callback.changeSummary } : {}),
        ...(callback.checks ? { checks: callback.checks } : {}),
        ...(callback.errorCode ? { errorCode: callback.errorCode } : {}),
      },
    });
    return Response.json({ success: true, taskId: task.id, status: task.status });
  } catch (error) {
    return apiErrorResponse(error, "DEVELOPMENT_CALLBACK");
  }
}
