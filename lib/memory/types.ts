import type { ChatMessage } from "../chat/types.ts";

export const memoryTypes = [
  "profile", "preference", "relationship", "event", "person", "place",
  "habit", "promise", "emotion", "goal", "other",
] as const;

export type MemoryType = (typeof memoryTypes)[number];

export interface MemoryCandidate {
  type: MemoryType;
  content: string;
  importance: number;
}

export interface StoredMemory extends MemoryCandidate {
  id: string;
  userId: string;
  characterId: string;
  embedding: number[];
  sourceMessageId: string | null;
  sourceDocumentId: string | null;
  similarity?: number;
}

export interface EmbeddingProvider {
  generate(text: string): Promise<number[]>;
}

export interface MemoryExtractor {
  extract(text: string): Promise<MemoryCandidate[]>;
}

export interface MemoryRepository {
  match(params: {
    userId: string;
    characterId: string;
    embedding: number[];
    limit: number;
    minimumSimilarity: number;
  }): Promise<StoredMemory[]>;
  insert(memory: Omit<StoredMemory, "id" | "similarity">): Promise<StoredMemory>;
  update(id: string, changes: Pick<StoredMemory, "content" | "importance" | "embedding">): Promise<StoredMemory>;
}

export interface ExtractAndSaveParams {
  userId: string;
  characterId: string;
  sourceMessage: ChatMessage;
}
