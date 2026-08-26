import type { MemoryRepository, StoredMemory } from "./types.ts";

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
  if (!leftMagnitude || !rightMagnitude) return 0;
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

export function createMemoryMemoryRepository() {
  const rows: StoredMemory[] = [];
  const repository: MemoryRepository & { list(params: { userId: string; characterId: string }): Promise<StoredMemory[]> } = {
    async match(params) {
      return rows
        .filter((row) => row.userId === params.userId && row.characterId === params.characterId)
        .map((row) => ({ ...row, similarity: cosineSimilarity(row.embedding, params.embedding) }))
        .filter((row) => (row.similarity ?? 0) >= params.minimumSimilarity)
        .sort((left, right) => (right.similarity ?? 0) - (left.similarity ?? 0))
        .slice(0, params.limit);
    },
    async insert(memory) {
      const saved = { ...memory, id: crypto.randomUUID() };
      rows.push(saved);
      return saved;
    },
    async update(id, changes) {
      const index = rows.findIndex((row) => row.id === id);
      if (index < 0) throw new Error("MEMORY_NOT_FOUND");
      rows[index] = { ...rows[index], ...changes };
      return rows[index];
    },
    async list(params) {
      return rows.filter((row) => row.userId === params.userId && row.characterId === params.characterId);
    },
  };
  return repository;
}
