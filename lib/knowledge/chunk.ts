export const KNOWLEDGE_CHUNK_SIZE = 1200;
export const KNOWLEDGE_CHUNK_OVERLAP = 180;

export function chunkMarkdown(text: string, size = KNOWLEDGE_CHUNK_SIZE, overlap = KNOWLEDGE_CHUNK_OVERLAP) {
  if (size < 1 || overlap < 0 || overlap >= size) throw new Error("INVALID_CHUNK_CONFIGURATION");
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(start + size, normalized.length);
    if (end < normalized.length) {
      const paragraphBreak = normalized.lastIndexOf("\n\n", end);
      if (paragraphBreak > start + Math.floor(size * 0.5)) end = paragraphBreak;
    }
    chunks.push(normalized.slice(start, end).trim());
    if (end >= normalized.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return chunks.filter(Boolean);
}
