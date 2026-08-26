import type { SupabaseClient } from "@supabase/supabase-js";
import type { KnowledgeChunk, KnowledgeDocument, KnowledgeRepository } from "./types.ts";

interface DocumentRow {
  id: string;
  user_id: string;
  filename: string;
  path: string;
  content: string;
  content_hash: string;
  metadata: Record<string, unknown>;
}

interface ChunkRow {
  id: string;
  document_id: string;
  content: string;
  chunk_index: number;
  metadata: Record<string, unknown>;
  similarity?: number;
}

function mapDocument(row: DocumentRow): KnowledgeDocument {
  return {
    id: row.id,
    userId: row.user_id,
    filename: row.filename,
    path: row.path,
    content: row.content,
    contentHash: row.content_hash,
    metadata: row.metadata,
  };
}

export function createSupabaseKnowledgeRepository(client: SupabaseClient): KnowledgeRepository {
  return {
    async upsertDocument(document) {
      const { data, error } = await client.from("knowledge_documents").upsert({
        user_id: document.userId,
        filename: document.filename,
        path: document.path,
        content: document.content,
        content_hash: document.contentHash,
        metadata: document.metadata,
      }, { onConflict: "user_id,path" }).select("id, user_id, filename, path, content, content_hash, metadata").single();
      if (error) throw error;
      return mapDocument(data as DocumentRow);
    },
    async replaceChunks(documentId, chunks) {
      const { error } = await client.rpc("replace_knowledge_chunks", {
        target_document_id: documentId,
        new_chunks: chunks.map((chunk) => ({
          content: chunk.content,
          embedding: chunk.embedding,
          chunk_index: chunk.chunkIndex,
          metadata: chunk.metadata,
        })),
      });
      if (error) throw error;
      return chunks.map((chunk) => ({ ...chunk, id: crypto.randomUUID(), documentId }));
    },
    async match(params) {
      const { data, error } = await client.rpc("match_knowledge_chunks", {
        query_embedding: params.embedding,
        match_user_id: params.userId,
        match_count: params.limit,
        minimum_similarity: params.minimumSimilarity,
      });
      if (error) throw error;
      return (data as ChunkRow[]).map((row) => ({
        id: row.id,
        documentId: row.document_id,
        content: row.content,
        embedding: [],
        chunkIndex: row.chunk_index,
        metadata: row.metadata,
        similarity: row.similarity,
      } satisfies KnowledgeChunk));
    },
  };
}
