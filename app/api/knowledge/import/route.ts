import { apiErrorResponse } from "../../../../lib/http/api-error.ts";
import { resolvePrivateUser } from "../../../../lib/http/private-user.ts";
import { createServerDependencies } from "../../../../lib/server/dependencies.ts";

const MAX_FILES = 20;
const MAX_FILE_BYTES = 3 * 1024 * 1024;
const MAX_TOTAL_BYTES = 10 * 1024 * 1024;

function validateFiles(values: FormDataEntryValue[]): File[] {
  const files = values.filter((value): value is File => value instanceof File);
  if (!files.length || files.length > MAX_FILES) throw new Error("KNOWLEDGE_FILE_COUNT");
  const allowedMimeTypes = new Set(["", "text/markdown", "text/plain", "text/x-markdown"]);
  if (files.some((file) => !file.name.toLowerCase().endsWith(".md") || !allowedMimeTypes.has(file.type) || file.size > MAX_FILE_BYTES)) {
    throw new Error("KNOWLEDGE_FILE_INVALID");
  }
  if (files.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_BYTES) {
    throw new Error("KNOWLEDGE_TOTAL_TOO_LARGE");
  }
  return files;
}

export async function POST(request: Request) {
  try {
    const dependencies = createServerDependencies();
    if (!dependencies.knowledge) throw new Error("KNOWLEDGE_LOCAL_ONLY");
    const userId = resolvePrivateUser(request, dependencies.config.privateUserId);
    const form = await request.formData();
    const files = validateFiles(form.getAll("files"));
    const requestedPaths = form.getAll("paths").filter((value): value is string => typeof value === "string");
    if (requestedPaths.length && requestedPaths.length !== files.length) throw new Error("KNOWLEDGE_PATH_COUNT");
    const result = await dependencies.knowledge.importMarkdown({
      userId,
      files: await Promise.all(files.map(async (file, index) => ({
        filename: file.name,
        path: requestedPaths[index] || file.name,
        content: await file.text(),
      }))),
    });
    return Response.json({ success: true, documents: result.documents, chunks: result.chunks });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("KNOWLEDGE_")) {
      return Response.json({ success: false, error: "Only 1–20 Markdown files up to 3 MB each are supported" }, { status: 400 });
    }
    return apiErrorResponse(error, "KNOWLEDGE_IMPORT");
  }
}
