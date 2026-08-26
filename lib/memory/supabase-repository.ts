import type { SupabaseClient } from "@supabase/supabase-js";
import type { MemoryRepository, MemoryType, StoredMemory } from "./types.ts";

interface MemoryRow {
  id: string;
  user_id?: string;
  character_id?: string;
  content: string;
  memory_type: MemoryType;
  importance: number;
  embedding?: number[];
  source_message_id: string | null;
  source_document_id: string | null;
  similarity?: number;
}

function mapRow(row: MemoryRow, fallback?: { userId: string; characterId: string; embedding: number[] }): StoredMemory {
  return {
    id: row.id,
    userId: row.user_id ?? fallback?.userId ?? "",
    characterId: row.character_id ?? fallback?.characterId ?? "",
    content: row.content,
    type: row.memory_type,
    importance: row.importance,
    embedding: row.embedding ?? fallback?.embedding ?? [],
    sourceMessageId: row.source_message_id,
    sourceDocumentId: row.source_document_id,
    similarity: row.similarity,
  };
}

export function createSupabaseMemoryRepository(client: SupabaseClient): MemoryRepository {
  return {
    async match(params) {
      const { data, error } = await client.rpc("match_memories", {
        query_embedding: params.embedding,
        match_user_id: params.userId,
        match_character_id: params.characterId,
        match_count: params.limit,
        minimum_similarity: params.minimumSimilarity,
      });
      if (error) throw error;
      return (data as MemoryRow[]).map((row) => mapRow(row, params));
    },
    async insert(memory) {
      const { data, error } = await client.from("memories").insert({
        user_id: memory.userId,
        character_id: memory.characterId,
        content: memory.content,
        memory_type: memory.type,
        importance: memory.importance,
        embedding: memory.embedding,
        source_message_id: memory.sourceMessageId,
        source_document_id: memory.sourceDocumentId,
      }).select("id, user_id, character_id, content, memory_type, importance, embedding, source_message_id, source_document_id").single();
      if (error) throw error;
      return mapRow(data as MemoryRow);
    },
    async update(id, changes) {
      const { data, error } = await client.from("memories").update({
        content: changes.content,
        importance: changes.importance,
        embedding: changes.embedding,
        last_accessed_at: new Date().toISOString(),
      }).eq("id", id).select("id, user_id, character_id, content, memory_type, importance, embedding, source_message_id, source_document_id").single();
      if (error) throw error;
      return mapRow(data as MemoryRow);
    },
  };
}
