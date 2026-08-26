import type { EmbeddingProvider } from "../memory/types.ts";

export interface KnowledgeDocument {
  id: string;
  userId: string;
  filename: string;
  path: string;
  content: string;
  contentHash: string;
  metadata: Record<string, unknown>;
}

export interface KnowledgeChunk {
  id: string;
  documentId: string;
  content: string;
  embedding: number[];
  chunkIndex: number;
  metadata: Record<string, unknown>;
  similarity?: number;
}

export interface KnowledgeRepository {
  upsertDocument(document: Omit<KnowledgeDocument, "id">): Promise<KnowledgeDocument>;
  replaceChunks(documentId: string, chunks: Array<Omit<KnowledgeChunk, "id" | "documentId">>): Promise<KnowledgeChunk[]>;
  match(params: { userId: string; embedding: number[]; limit: number; minimumSimilarity: number }): Promise<KnowledgeChunk[]>;
}

export interface KnowledgeEngineDependencies {
  repository: KnowledgeRepository;
  embeddings: EmbeddingProvider;
  chunkSize?: number;
  chunkOverlap?: number;
  migrateDocument?: (document: KnowledgeDocument) => Promise<void>;
}
