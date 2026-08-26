import type { KnowledgeChunk, KnowledgeDocument, KnowledgeRepository } from "./types.ts";

function cosineSimilarity(left: number[], right: number[]) {
  const length = Math.min(left.length, right.length);
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] ** 2;
    rightMagnitude += right[index] ** 2;
  }
  return leftMagnitude && rightMagnitude ? dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude)) : 0;
}

export function createMemoryKnowledgeRepository() {
  const documents: KnowledgeDocument[] = [];
  const chunks: KnowledgeChunk[] = [];
  const repository: KnowledgeRepository & {
    listDocuments(userId: string): Promise<KnowledgeDocument[]>;
    listChunks(documentId: string): Promise<KnowledgeChunk[]>;
  } = {
    async upsertDocument(document) {
      const index = documents.findIndex((row) => row.userId === document.userId && row.path === document.path);
      if (index >= 0) {
        documents[index] = { ...documents[index], ...document };
        return documents[index];
      }
      const saved = { ...document, id: crypto.randomUUID() };
      documents.push(saved);
      return saved;
    },
    async replaceChunks(documentId, replacements) {
      for (let index = chunks.length - 1; index >= 0; index -= 1) {
        if (chunks[index].documentId === documentId) chunks.splice(index, 1);
      }
      const saved = replacements.map((chunk) => ({ ...chunk, documentId, id: crypto.randomUUID() }));
      chunks.push(...saved);
      return saved;
    },
    async match(params) {
      const ownedDocuments = new Set(documents.filter((row) => row.userId === params.userId).map((row) => row.id));
      return chunks
        .filter((row) => ownedDocuments.has(row.documentId))
        .map((row) => ({ ...row, similarity: cosineSimilarity(row.embedding, params.embedding) }))
        .filter((row) => (row.similarity ?? 0) >= params.minimumSimilarity)
        .sort((left, right) => (right.similarity ?? 0) - (left.similarity ?? 0))
        .slice(0, params.limit);
    },
    async listDocuments(userId) {
      return documents.filter((row) => row.userId === userId);
    },
    async listChunks(documentId) {
      return chunks.filter((row) => row.documentId === documentId).sort((a, b) => a.chunkIndex - b.chunkIndex);
    },
  };
  return repository;
}
