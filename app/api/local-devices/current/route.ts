import { createServerDependencies } from "../../../../lib/server/dependencies.ts";
import { resolvePrivateUser } from "../../../../lib/http/private-user.ts";
import { apiErrorResponse } from "../../../../lib/http/api-error.ts";
import { toPublicLocalDevice } from "../../../../lib/local-computer/types.ts";

export async function GET(request: Request) {
  try {
    const dependencies = createServerDependencies(); const userId = resolvePrivateUser(request, dependencies.config.privateUserId);
    const device = await dependencies.localComputerRepository.getActiveDeviceByOwner(userId);
    return Response.json({ success: true, device: device ? toPublicLocalDevice(device) : null }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return apiErrorResponse(error, "LOCAL_DEVICE"); }
}
