import type { MemoryProvider } from "../chat/types.ts";

export async function retrieveRelevantMemories(
  provider: MemoryProvider,
  params: { userId: string; characterId: string; query: string; limit: number },
) {
  return provider.retrieve(params);
}
