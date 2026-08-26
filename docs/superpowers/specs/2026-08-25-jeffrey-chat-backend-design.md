# Jeffrey 私人 PWA 聊天后端设计

日期：2026-08-25  
状态：已获用户口头批准，等待书面规格复核

## 目标

在不重写现有 PWA 与聊天界面的前提下，为客户建立同域、可持久化的私人单用户聊天后端。默认 AI 伴侣名为 Jeffrey，使用客户提供的狐狸照片作为头像。系统保存双方完整聊天原文，按需召回近期聊天、长期记忆与客户上传的 Markdown 知识库，并通过服务端 OpenAI Responses API 生成回复。

旧微信 Clawbot 的聊天原文不迁移。客户原有知识库是迁移来源：保留 Markdown 原文，从中提取 Jeffrey 人设、关系记忆与普通知识。新应用启用后的消息全部持久化。

## 架构选择

保留现有 Sites/Vinext/Cloudflare Worker 项目。Next Route Handlers 与前端同域运行，使用 Supabase JavaScript Client 通过 HTTPS 访问 Supabase PostgreSQL/pgvector，使用 OpenAI SDK 在服务端调用 Responses API。

未选择独立 Supabase Edge Functions，因为首版会增加第二套部署、跨域和配置面；未迁移到 Vercel，因为这会扩大现有 PWA 的变更范围。

```text
PWA 聊天界面
  → 同域 Route Handler
    → ChatEngine
      → Supabase Adapter → PostgreSQL + pgvector
      → OpenAI Adapter → Responses API / Embeddings API
```

## 身份与权限

首版是私人单用户应用。真实用户 ID 从服务端 `PRIVATE_USER_ID` 读取，不接受浏览器传入的身份。请求中的 conversation 和 character ID 必须与该固定用户匹配。

所有查询同时约束 `user_id` 与资源 ID。数据库开启 RLS；运行时服务端使用 Service Role，公开 Anon Key 不具备读取私人数据的策略。该结构保留未来迁移到 Supabase Auth 的空间。

## 深模块与接口

### ChatEngine

外部接口只接收已验证的聊天命令并返回统一消息结果。实现内部完成原文保存、上下文组装、模型调用、回复保存和记忆提取调度。Route Handler 不包含模型或数据库业务逻辑。

### ChatRepository

接口覆盖聊天流程真正需要的行为：保存消息、读取角色、验证会话、读取近期消息、保存回复。Supabase Adapter 用于生产，内存 Adapter 用于测试。

### AIProvider

接口提供 `chat` 与结构化提取能力。OpenAI Adapter 使用环境变量中的模型；测试 Adapter 返回确定结果。Embedding 独立成小接口，因为其失败允许降级，而聊天生成失败需要返回可重试错误。

### MemoryEngine

接口提供相关记忆检索与用户消息记忆提取。内部实现多条提取、Embedding、相似度去重、新增或更新、来源追溯。聊天调用者不需要了解 pgvector 或去重阈值。

### KnowledgeEngine

接口提供 Markdown 导入和相关知识检索。内部实现文件校验、frontmatter 解析、统一切块、Embedding、文档/Chunk 持久化，以及 Jeffrey 人设与历史记忆候选提取。

## 数据库

Supabase SQL Migration 创建 `vector` 扩展、表、约束、索引、RLS 和向量检索函数。

### characters

保存 `user_id`、名称、头像、system prompt、personality、relationship setting 和时间戳。初始化脚本为私人用户创建 Jeffrey，头像指向项目内狐狸图片。

### conversations

保存用户与角色的会话。首版初始化一个 Jeffrey 默认会话。

### messages

保存完整原文；字段覆盖 `sender`、`type`、`content`、`media_url`、`duration` 与时间戳。类型支持 text、image、sticker、audio、system。消息不会因生成 Memory 而删除或改写。

### memories

保存 `content`、`memory_type`、`importance`、`embedding vector(1536)`、`source_message_id`、可选来源文档和访问时间。类型覆盖 profile、preference、relationship、event、person、place、habit、promise、emotion、goal、other。

### knowledge_documents / knowledge_chunks

Documents 保存 Markdown 原文、文件名、逻辑路径、frontmatter metadata 与时间戳。Chunks 保存统一切分后的文本、序号、metadata 与 `vector(1536)`。

### push_subscriptions

保存 endpoint、p256dh、auth 与用户归属，为后续主动消息和 Web Push 使用。本阶段不实现调度器。

## 聊天数据流

`POST /api/chat` 接受 conversationId、characterId、message、type、mediaUrl 与可选 duration。服务端执行：

1. 校验类型、长度和 ID；绑定 `PRIVATE_USER_ID`。
2. 验证会话与 Jeffrey 属于私人用户。
3. 立即保存用户完整原文。
4. 读取 Jeffrey 角色设定与按时间升序排列的最近 30 条消息。
5. 对当前消息生成一次 Embedding；并行检索当前用户/角色的相关 Memory 与当前用户知识 Chunk。
6. 任一检索失败时写入分类日志并使用空上下文继续。
7. 组织 SYSTEM、CHARACTER、LONG TERM MEMORY、KNOWLEDGE CONTEXT、RECENT CHAT、CURRENT USER MESSAGE。
8. 调用 OpenAI Responses API。
9. 先保存 Jeffrey 完整回复，再返回统一成功结构。
10. 首版在回复保存后、HTTP 成功返回前执行 best-effort 记忆分析；所有错误被捕获，因此失败不改变已保存消息或成功回复。未来接入可靠任务队列后再移出请求路径。

OpenAI 失败时，用户原文仍保留，响应返回统一、可重试的 `Chat request failed`，不泄漏内部错误。

## Memory 流程

结构化提取一次允许返回多条 Memory。仅保存稳定资料、偏好、关系、人物、重要事件、习惯、承诺、目标或有长期关系意义的信息。

每条候选生成 Embedding，并只在当前用户与 Jeffrey 范围内检索近似 Memory。高相似候选更新现有内容、importance 与访问时间；其他候选新增。聊天来源必须记录 `source_message_id`，知识迁移来源记录 document ID。Embedding 失败时跳过本次 Memory 写入，保留原文。

## 知识库迁移

`POST /api/knowledge/import` 接收一个或多个 `.md` 文件。限制扩展名、MIME、单文件大小、文件数和总大小；清理逻辑路径，解析 YAML frontmatter，保存原文后按统一配置切块。

导入分两层：

- 所有 Markdown 都作为可检索知识保存。
- 服务端从与 Jeffrey、客户资料、共同经历和承诺相关的内容中提取角色与 Memory 候选。抽取结果必须引用来源文档；抽取失败不影响知识原文入库。

设置页增加知识库上传与处理状态，不新增独立 UI 架构。客户可以重复导入；文档内容哈希和路径用于幂等更新，Chunk 在同一事务语义下替换。

## 历史与前端接入

`GET /api/conversations/[id]/messages` 返回最近 50 条，按时间正确排序，提供 `before` 游标用于以后向上加载。

现有聊天 UI 保持布局、PWA、附件、表情和录音交互。启动时加载 Jeffrey 默认会话历史；发送时禁用重复提交并显示发送状态。成功后渲染服务端消息；失败时保留用户气泡并显示可重试状态。

Jeffrey 的狐狸头像保存为项目静态资源，替换现有文字头像与“小满”名称。图片、Sticker 和 Audio 消息可保存并重新加载；首版只把安全的文本描述纳入模型上下文，不实现图片理解、STT 或 TTS。

## 配置与无配置行为

`.env.example` 包含：

- `PRIVATE_USER_ID`
- `DEFAULT_CHARACTER_ID`
- `DEFAULT_CONVERSATION_ID`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_EMBEDDING_MODEL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`

OpenAI Key、Service Role 与 VAPID 私钥只在服务端读取。缺少 Supabase/OpenAI 配置时，首页仍可渲染，聊天接口返回明确的 `Server configuration missing`；生产环境不自动切换假 AI。

## 日志与错误

使用稳定事件名：`CHAT_ERROR`、`MEMORY_RETRIEVAL_ERROR`、`MEMORY_EXTRACTION_ERROR`、`KNOWLEDGE_RETRIEVAL_ERROR`、`KNOWLEDGE_IMPORT_ERROR`。日志记录请求相关 ID 和错误类别，不记录密钥、Authorization Header、数据库连接信息或完整私人内容。

## Tool Calling 与主动消息

建立无执行 Adapter 的 ToolDefinition 类型和空工具注册表，为未来 Desktop Agent 预留 seam。聊天 Route Handler 不执行 Shell、文件系统或任意外部命令。

建立 `lib/proactive/` 的消息生成接口和 no-op Adapter，明确未来 scheduler → 上下文 → 消息保存 → Web Push 流程。本阶段不在客户端使用定时器模拟主动消息。

## 验证

自动测试使用内存 Adapter 覆盖：

- 用户与 Jeffrey 完整原文保存顺序。
- 最近消息排序与数量上限。
- 多条 Memory 提取与来源追溯。
- 相同 Memory 去重更新。
- Memory/Knowledge Embedding 或检索失败时聊天继续。
- OpenAI 失败时用户原文保留且内部错误不泄漏。
- conversation/character 跨用户拒绝。
- Markdown 类型、大小、frontmatter、切块与重复导入。
- 历史消息分页接口。

执行 lint、TypeScript 类型检查、build 和 tests。真实 OpenAI/Supabase 场景需要客户创建账户、执行 Migration、初始化 Jeffrey/会话并配置 Sites Secrets 后进行最终联调。

## 交付与外部依赖

本次代码交付包含后端模块、Route Handlers、Migration、初始化 SQL、前端接入、测试、`.env.example` 与 README。客户仍需提供或创建 Supabase 项目、OpenAI API Key，以及首次上传的 Markdown 知识库。

## 本阶段不包含

- 旧微信聊天原文与媒体迁移。
- 图片多模态理解。
- STT、TTS、Realtime Voice。
- AI 主动消息调度器与完整 Web Push 发送。
- 客户电脑自动同步 Obsidian Vault。
- Local Desktop Agent、Codex 或电脑工具执行。
- 多用户注册与 Supabase Auth。

这些能力通过现有数据结构与模块 seam 后续增加，不要求重写聊天 UI、消息库或 Memory 系统。
