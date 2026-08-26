import type OpenAI from "openai";
import type { EmbeddingProvider } from "./types.ts";

export function createOpenAIEmbeddingProvider(params: { client: OpenAI; model: string }): EmbeddingProvider {
  const cache = new Map<string, Promise<number[]>>();
  return {
    async generate(text) {
      const normalized = text.trim();
      const cached = cache.get(normalized);
      if (cached) return cached;
      const pending = params.client.embeddings.create({ model: params.model, input: normalized }).then((response) => {
        const embedding = response.data[0]?.embedding;
        if (!embedding) throw new Error("OPENAI_EMPTY_EMBEDDING");
        return embedding;
      });
      cache.set(normalized, pending);
      try {
        return await pending;
      } catch (error) {
        cache.delete(normalized);
        throw error;
      }
    },
  };
}

export async function generateEmbedding(provider: EmbeddingProvider, text: string) {
  return provider.generate(text);
}
