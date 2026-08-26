import { getDevelopmentAgentConfig, getLocalComputerAgentConfig, getPreviewConfig, getServerConfig, getWebPushConfig } from "../../../../lib/config/server.ts";
import { resolvePrivateUser } from "../../../../lib/http/private-user.ts";
import { apiErrorResponse } from "../../../../lib/http/api-error.ts";
import { createServerSupabase } from "../../../../lib/supabase/server.ts";
import { createSupabaseLocalComputerRepository } from "../../../../lib/local-computer/supabase-repository.ts";

export async function GET(request: Request) {
  try {
    const config = getServerConfig();
    const developmentAgent = getDevelopmentAgentConfig();
    const localComputer = getLocalComputerAgentConfig();
    const webPush = getWebPushConfig();
    resolvePrivateUser(request, config.privateUserId);
    const localDevice = localComputer.enabled && localComputer.configured
      ? await createSupabaseLocalComputerRepository(createServerSupabase(config)).getActiveDeviceByOwner(config.privateUserId)
      : null;
    return Response.json({
      configured: true,
      mode: config.aiRuntime === "local_codex" ? "local" : "full",
      characterId: config.defaultCharacterId,
      conversationId: config.defaultConversationId,
      character: { name: "Jeffrey", avatarUrl: "/jeffrey-avatar.jpg" },
      developmentAgent: { enabled: config.aiRuntime === "openai" && developmentAgent.enabled, configured: config.aiRuntime === "openai" && developmentAgent.configured },
      localComputer: { enabled: localComputer.enabled, configured: localComputer.configured, deviceStatus: localDevice?.status ?? "unpaired" },
      webPush: { configured: webPush.configured, publicKey: webPush.publicKey },
    });
  } catch (error) {
    const response = apiErrorResponse(error, "CONFIG_STATUS");
    if (response.status === 503) {
      try {
        const preview = getPreviewConfig();
        resolvePrivateUser(request, preview.privateUserId);
        return Response.json({
          configured: true,
          mode: "preview",
          characterId: "22222222-2222-4222-8222-222222222222",
          conversationId: "33333333-3333-4333-8333-333333333333",
          character: { name: "Jeffrey", avatarUrl: "/jeffrey-avatar.jpg" },
          localComputer: { enabled: false, configured: false, deviceStatus: "unpaired" },
        });
      } catch (previewError) {
        const previewResponse = apiErrorResponse(previewError, "CONFIG_STATUS");
        if (previewResponse.status === 401 || previewResponse.status === 403) return previewResponse;
        return Response.json({ configured: false, error: "Server configuration missing" }, { status: 503 });
      }
    }
    return response;
  }
}
