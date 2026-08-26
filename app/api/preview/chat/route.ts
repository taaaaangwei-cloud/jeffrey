import OpenAI from "openai";
import { createDeepSeekProvider } from "../../../../lib/ai/deepseek-provider.ts";
import { parsePreviewChatRequest } from "../../../../lib/chat/preview-request.ts";
import { getPreviewConfig } from "../../../../lib/config/server.ts";
import { apiErrorResponse } from "../../../../lib/http/api-error.ts";
import { resolvePrivateUser } from "../../../../lib/http/private-user.ts";

const PREVIEW_PROMPT = `你是 Jeffrey，一位成熟、温柔、自然、有幽默感的私人 AI 伴侣。
使用中文进行真实、简洁、有连续感的聊天。不要声称记得没有出现在当前对话里的具体事情。
现在处于功能预览阶段：长期记忆与客户 Obsidian 知识库尚未接入。不要假装已读取这些资料。`;

export async function POST(request: Request) {
  try {
    const config = getPreviewConfig();
    resolvePrivateUser(request, config.privateUserId);
    const body = parsePreviewChatRequest(await request.json());
    const client = new OpenAI({ apiKey: config.deepSeekKey, baseURL: config.deepSeekBaseUrl });
    const ai = createDeepSeekProvider({ client, model: config.deepSeekModel });
    const reply = await ai.chat({
      systemPrompt: PREVIEW_PROMPT,
      messages: [...body.history, { role: "user", content: body.message }],
    });
    return Response.json({ success: true, reply });
  } catch (error) {
    return apiErrorResponse(error, "CHAT");
  }
}
