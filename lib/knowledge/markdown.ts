function parseScalar(raw: string): unknown {
  const value = raw.trim();
  if (!value) return "";
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null" || value === "~") return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  if (value.startsWith("[") && value.endsWith("]")) {
    return value.slice(1, -1).split(",").map((item) => parseScalar(item)).filter((item) => item !== "");
  }
  return value;
}

export function parseObsidianMarkdown(source: string): {
  content: string;
  metadata: Record<string, unknown>;
} {
  if (!source.startsWith("---\n") && !source.startsWith("---\r\n")) {
    return { content: source, metadata: {} };
  }
  const normalized = source.replace(/\r\n/g, "\n");
  const end = normalized.indexOf("\n---\n", 4);
  if (end < 0) return { content: source, metadata: {} };

  const metadata: Record<string, unknown> = {};
  let activeListKey: string | null = null;
  for (const line of normalized.slice(4, end).split("\n")) {
    const listItem = line.match(/^\s*-\s+(.+)$/);
    if (listItem && activeListKey) {
      const current = metadata[activeListKey];
      metadata[activeListKey] = [...(Array.isArray(current) ? current : []), parseScalar(listItem[1])];
      continue;
    }
    const property = line.match(/^([A-Za-z0-9_\-\u4e00-\u9fff]+):\s*(.*)$/);
    if (!property) continue;
    const [, key, value] = property;
    activeListKey = value ? null : key;
    metadata[key] = value ? parseScalar(value) : [];
  }
  return { content: normalized.slice(end + 5), metadata };
}
