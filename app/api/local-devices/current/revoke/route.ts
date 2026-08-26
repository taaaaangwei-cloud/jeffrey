import { createServerDependencies } from "../../../../../lib/server/dependencies.ts";
import { resolvePrivateUser } from "../../../../../lib/http/private-user.ts";
import { apiErrorResponse } from "../../../../../lib/http/api-error.ts";
import { toPublicLocalDevice } from "../../../../../lib/local-computer/types.ts";

export async function POST(request: Request) {
  try {
    const dependencies = createServerDependencies(); const userId = resolvePrivateUser(request, dependencies.config.privateUserId);
    const current = await dependencies.localComputerRepository.getActiveDeviceByOwner(userId);
    if (!current) return Response.json({ success: false, error: "Local device not found" }, { status: 404 });
    const device = await dependencies.localComputerRepository.revokeDevice(current.id, userId);
    return Response.json({ success: true, device: toPublicLocalDevice(device) });
  } catch (error) { return apiErrorResponse(error, "LOCAL_DEVICE"); }
}
