import type { KnowledgeProvider, RetrievedContext } from "../chat/types.ts";
import { chunkMarkdown, KNOWLEDGE_CHUNK_OVERLAP, KNOWLEDGE_CHUNK_SIZE } from "./chunk.ts";
import { parseObsidianMarkdown } from "./markdown.ts";
import type { KnowledgeEngineDependencies } from "./types.ts";

async function sha256(text: string) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safePath(path: string, filename: string) {
  const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..")) return filename;
  return normalized;
}

export function createKnowledgeEngine(dependencies: KnowledgeEngineDependencies): KnowledgeProvider & {
  importMarkdown(params: {
    userId: string;
    files: Array<{ filename: string; path: string; content: string }>;
  }): Promise<{ documents: number; chunks: number; imported: import("./types.ts").KnowledgeDocument[] }>;
} {
  return {
    async retrieve(params): Promise<RetrievedContext[]> {
      const embedding = await dependencies.embeddings.generate(params.query);
      const rows = await dependencies.repository.match({
        userId: params.userId,
        embedding,
        limit: params.limit,
        minimumSimilarity: 0.3,
      });
      return rows.map((row) => ({ content: row.content, type: "knowledge" }));
    },
    async importMarkdown(params) {
      let chunkCount = 0;
      const imported = [];
      for (const file of params.files) {
        const parsed = parseObsidianMarkdown(file.content);
        const document = await dependencies.repository.upsertDocument({
          userId: params.userId,
          filename: file.filename,
          path: safePath(file.path, file.filename),
          content: file.content,
          contentHash: await sha256(file.content),
          metadata: parsed.metadata,
        });
        const texts = chunkMarkdown(
          parsed.content,
          dependencies.chunkSize ?? KNOWLEDGE_CHUNK_SIZE,
          dependencies.chunkOverlap ?? KNOWLEDGE_CHUNK_OVERLAP,
        );
        const chunks = [];
        for (const [chunkIndex, content] of texts.entries()) {
          chunks.push({
            content,
            embedding: await dependencies.embeddings.generate(content),
            chunkIndex,
            metadata: { filename: file.filename, path: document.path },
          });
        }
        await dependencies.repository.replaceChunks(document.id, chunks);
        imported.push(document);
        if (dependencies.migrateDocument) {
          await dependencies.migrateDocument(document).catch((error) => {
            console.error("KNOWLEDGE_MIGRATION_ERROR", { documentId: document.id, error: error instanceof Error ? error.name : "unknown" });
          });
        }
        chunkCount += chunks.length;
      }
      return { documents: params.files.length, chunks: chunkCount, imported };
    },
  };
}
