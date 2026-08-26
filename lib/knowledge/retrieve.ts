import type { KnowledgeProvider } from "../chat/types.ts";

export async function retrieveRelevantKnowledge(
  provider: KnowledgeProvider,
  params: { userId: string; query: string; limit: number },
) {
  return provider.retrieve(params);
}
