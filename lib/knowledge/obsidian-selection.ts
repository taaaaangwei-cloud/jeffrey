export type ObsidianMigrationGroup = "character" | "user-profile";
export type ObsidianMigrationDisposition = "knowledge" | "media" | "archive" | "excluded";

function normalize(path: string) {
  return path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

export function classifyObsidianMigrationPath(
  group: ObsidianMigrationGroup,
  sourcePath: string,
): ObsidianMigrationDisposition {
  const path = normalize(sourcePath);
  if (!path || path.split("/").includes("..") || path.includes("__MACOSX")) return "excluded";

  const parts = path.split("/");
  const filename = parts.at(-1)?.toLowerCase() ?? "";
  const isMarkdown = filename.endsWith(".md");
  const isImage = /\.(jpe?g|png|webp)$/i.test(filename);

  if (group === "user-profile") {
    return parts.length === 1 && isMarkdown ? "knowledge" : "archive";
  }

  if (parts[0] === "Jeff私人通讯软件") return "excluded";
  if (parts.length === 1 && isMarkdown) return "knowledge";
  if (parts.length === 1 && isImage) return "media";
  if (parts.length === 2 && parts[0] === "日常连续性" && isMarkdown) return "knowledge";
  if (parts.length === 2 && parts[0] === "参考素材" && isMarkdown) return "knowledge";
  return "archive";
}
