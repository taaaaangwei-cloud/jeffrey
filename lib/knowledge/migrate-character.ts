import type { SupabaseClient } from "@supabase/supabase-js";
import type OpenAI from "openai";
import { z } from "zod";
import { memoryTypes, type EmbeddingProvider, type MemoryRepository } from "../memory/types.ts";
import type { KnowledgeDocument } from "./types.ts";

const migrationSchema = z.object({
  character: z.object({
    systemPrompt: z.string().max(4000).nullable(),
    personality: z.string().max(2000).nullable(),
    relationshipSetting: z.string().max(2000).nullable(),
  }),
  memories: z.array(z.object({
    type: z.enum(memoryTypes),
    content: z.string().min(1).max(500),
    importance: z.number().min(0).max(1),
  })).max(30),
});

export function createOpenAIKnowledgeMigrator(dependencies: {
  client: OpenAI;
  model: string;
  supabase: SupabaseClient;
  memoryRepository: MemoryRepository;
  embeddings: EmbeddingProvider;
  userId: string;
  characterId: string;
}) {
  return async function migrateDocument(document: KnowledgeDocument) {
    const response = await dependencies.client.responses.create({
      model: dependencies.model,
      input: [
        {
          role: "system",
          content: "分析客户旧知识库。只提取明确写出的 Jeffrey 人设、关系设定与长期记忆；普通知识不要伪装成人设。未知字段返回 null，不推测。",
        },
        { role: "user", content: document.content },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "jeffrey_knowledge_migration",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              character: {
                type: "object",
                additionalProperties: false,
                properties: {
                  systemPrompt: { type: ["string", "null"] },
                  personality: { type: ["string", "null"] },
                  relationshipSetting: { type: ["string", "null"] },
                },
                required: ["systemPrompt", "personality", "relationshipSetting"],
              },
              memories: {
                type: "array",
                maxItems: 30,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    type: { type: "string", enum: [...memoryTypes] },
                    content: { type: "string" },
                    importance: { type: "number", minimum: 0, maximum: 1 },
                  },
                  required: ["type", "content", "importance"],
                },
              },
            },
            required: ["character", "memories"],
          },
        },
      },
    });
    const parsed = migrationSchema.parse(JSON.parse(response.output_text));
    const characterChanges = Object.fromEntries(Object.entries({
      system_prompt: parsed.character.systemPrompt,
      personality: parsed.character.personality,
      relationship_setting: parsed.character.relationshipSetting,
    }).filter(([, value]) => value));
    if (Object.keys(characterChanges).length) {
      const { error } = await dependencies.supabase.from("characters").update(characterChanges)
        .eq("id", dependencies.characterId).eq("user_id", dependencies.userId);
      if (error) throw error;
    }
    for (const candidate of parsed.memories) {
      const embedding = await dependencies.embeddings.generate(candidate.content);
      const [duplicate] = await dependencies.memoryRepository.match({
        userId: dependencies.userId,
        characterId: dependencies.characterId,
        embedding,
        limit: 1,
        minimumSimilarity: 0.9,
      });
      if (duplicate) {
        await dependencies.memoryRepository.update(duplicate.id, {
          content: candidate.content,
          importance: Math.max(duplicate.importance, candidate.importance),
          embedding,
        });
      } else {
        await dependencies.memoryRepository.insert({
          ...candidate,
          userId: dependencies.userId,
          characterId: dependencies.characterId,
          embedding,
          sourceMessageId: null,
          sourceDocumentId: document.id,
        });
      }
    }
  };
}
