import { createServerDependencies } from "../../../../../../lib/server/dependencies.ts";
import { authenticateLocalAgentRequest } from "../../../../../../lib/local-computer/agent-auth.ts";
import { apiErrorResponse } from "../../../../../../lib/http/api-error.ts";
import { localComputerTaskIdSchema } from "../../../../../../lib/local-computer/http.ts";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const body = await request.text();
  try {
    const dependencies = createServerDependencies(); const device = await authenticateLocalAgentRequest(request, body, dependencies);
    const { id } = await context.params; const task = await dependencies.localComputerRepository.getTaskByDevice(localComputerTaskIdSchema.parse(id), device.id);
    if (!task) return Response.json({ success: false, error: "Task not found" }, { status: 404 });
    return Response.json({ success: true, status: task.status }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return apiErrorResponse(error, "LOCAL_AGENT_TASK_STATUS"); }
}
