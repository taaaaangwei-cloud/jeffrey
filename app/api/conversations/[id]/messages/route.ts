import { z } from "zod";
import { apiErrorResponse } from "../../../../../lib/http/api-error.ts";
import { resolvePrivateUser } from "../../../../../lib/http/private-user.ts";
import { createServerDependencies } from "../../../../../lib/server/dependencies.ts";

const querySchema = z.object({
  id: z.uuid(),
  limit: z.coerce.number().int().min(1).max(50).default(50),
  before: z.iso.datetime().optional(),
});

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const dependencies = createServerDependencies();
    const userId = resolvePrivateUser(request, dependencies.config.privateUserId);
    const { id } = await context.params;
    const url = new URL(request.url);
    const query = querySchema.parse({
      id,
      limit: url.searchParams.get("limit") ?? undefined,
      before: url.searchParams.get("before") ?? undefined,
    });
    const page = await dependencies.chatRepository.listMessages({
      userId,
      conversationId: query.id,
      limit: query.limit,
      before: query.before,
    });
    return Response.json(page);
  } catch (error) {
    return apiErrorResponse(error, "MESSAGE_HISTORY");
  }
}
