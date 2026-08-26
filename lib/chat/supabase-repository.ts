import type { SupabaseClient } from "@supabase/supabase-js";
import type { Character, ChatMessage, ChatRepository, MessageSender, MessageType } from "./types.ts";

interface MessageRow {
  id: string;
  conversation_id: string;
  sender: MessageSender;
  type: MessageType;
  content: string;
  media_url: string | null;
  duration: number | null;
  created_at: string;
}

function mapMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    sender: row.sender,
    type: row.type,
    content: row.content,
    mediaUrl: row.media_url,
    duration: row.duration,
    createdAt: row.created_at,
  };
}

export function createSupabaseChatRepository(client: SupabaseClient): ChatRepository & {
  listMessages(params: {
    userId: string;
    conversationId: string;
    limit: number;
    before?: string;
  }): Promise<{ messages: ChatMessage[]; nextCursor: string | null }>;
} {
  async function verifyConversation(userId: string, conversationId: string) {
    const { data, error } = await client
      .from("conversations")
      .select("id, character_id")
      .eq("id", conversationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return data as { id: string; character_id: string } | null;
  }

  return {
    async getCharacterForConversation(params) {
      const conversation = await verifyConversation(params.userId, params.conversationId);
      if (!conversation || conversation.character_id !== params.characterId) return null;
      const { data, error } = await client
        .from("characters")
        .select("id, name, avatar_url, system_prompt, personality, relationship_setting")
        .eq("id", params.characterId)
        .eq("user_id", params.userId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: data.id,
        name: data.name,
        avatarUrl: data.avatar_url,
        systemPrompt: data.system_prompt,
        personality: data.personality,
        relationshipSetting: data.relationship_setting,
      } satisfies Character;
    },
    async saveMessage(message) {
      const { data, error } = await client
        .from("messages")
        .insert({
          conversation_id: message.conversationId,
          sender: message.sender,
          type: message.type,
          content: message.content,
          media_url: message.mediaUrl,
          duration: message.duration,
        })
        .select("id, conversation_id, sender, type, content, media_url, duration, created_at")
        .single();
      if (error) throw error;
      return mapMessage(data as MessageRow);
    },
    async listRecentMessages(conversationId, limit) {
      const { data, error } = await client
        .from("messages")
        .select("id, conversation_id, sender, type, content, media_url, duration, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data as MessageRow[]).reverse().map(mapMessage);
    },
    async listMessages(params) {
      const conversation = await verifyConversation(params.userId, params.conversationId);
      if (!conversation) return { messages: [], nextCursor: null };
      let query = client
        .from("messages")
        .select("id, conversation_id, sender, type, content, media_url, duration, created_at")
        .eq("conversation_id", params.conversationId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(params.limit + 1);
      if (params.before) query = query.lt("created_at", params.before);
      const { data, error } = await query;
      if (error) throw error;
      const rows = data as MessageRow[];
      const hasMore = rows.length > params.limit;
      const page = rows.slice(0, params.limit);
      return {
        messages: page.reverse().map(mapMessage),
        nextCursor: hasMore ? page.at(-1)?.created_at ?? null : null,
      };
    },
  };
}
