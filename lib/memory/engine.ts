import type { MemoryProvider, RetrievedContext } from "../chat/types.ts";
import type { EmbeddingProvider, ExtractAndSaveParams, MemoryExtractor, MemoryRepository, StoredMemory } from "./types.ts";

const DEDUPLICATION_SIMILARITY = 0.9;

export function createMemoryEngine(dependencies: {
  repository: MemoryRepository;
  embeddings: EmbeddingProvider;
  extractor: MemoryExtractor;
}): MemoryProvider {
  return {
    async retrieve(params): Promise<RetrievedContext[]> {
      const embedding = await dependencies.embeddings.generate(params.query);
      const rows = await dependencies.repository.match({
        userId: params.userId,
        characterId: params.characterId,
        embedding,
        limit: params.limit,
        minimumSimilarity: 0.35,
      });
      return rows.map((row) => ({
        content: row.content,
        type: row.type,
        importance: row.importance,
        sourceMessageId: row.sourceMessageId,
        sourceDocumentId: row.sourceDocumentId,
      }));
    },
    async extractAndSave(params: ExtractAndSaveParams): Promise<RetrievedContext[]> {
      if (params.sourceMessage.type !== "text" || !params.sourceMessage.content.trim()) return [];
      const candidates = await dependencies.extractor.extract(params.sourceMessage.content);
      const saved: StoredMemory[] = [];
      for (const candidate of candidates) {
        const embedding = await dependencies.embeddings.generate(candidate.content);
        const [duplicate] = await dependencies.repository.match({
          userId: params.userId,
          characterId: params.characterId,
          embedding,
          limit: 1,
          minimumSimilarity: DEDUPLICATION_SIMILARITY,
        });
        if (duplicate) {
          saved.push(await dependencies.repository.update(duplicate.id, {
            content: candidate.content,
            importance: Math.max(duplicate.importance, candidate.importance),
            embedding,
          }));
        } else {
          saved.push(await dependencies.repository.insert({
            ...candidate,
            userId: params.userId,
            characterId: params.characterId,
            embedding,
            sourceMessageId: params.sourceMessage.id,
            sourceDocumentId: null,
          }));
        }
      }
      return saved.map((row) => ({
        content: row.content,
        type: row.type,
        importance: row.importance,
        sourceMessageId: row.sourceMessageId,
        sourceDocumentId: row.sourceDocumentId,
      }));
    },
  };
}
