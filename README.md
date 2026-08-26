# 回声 · Jeffrey 私人 PWA

这是一个私人单用户 AI 伴侣聊天应用。打开 PWA 后直接进入 Jeffrey 对话；双方完整消息保存在 Supabase PostgreSQL，客户 Obsidian 正文保留在其 Mac，回复由客户已登录的本地 Codex 生成。正式交付不需要 OpenAI API Key。

没有 Supabase/本地 Mac 配置时首页仍会正常显示，并明确提示配置缺失；生产环境不会偷偷使用假 AI。

仅调试聊天时可启用 `PREVIEW_MODE=true` 并配置服务端 `DEEPSEEK_API_KEY`。此模式通过 DeepSeek Chat Completions 生成回复，聊天历史只保存在当前浏览器，不读取或上传私密 Obsidian 正文，也不宣称已经拥有长期记忆。

DeepSeek 只允许用于开发预览。客户交付使用 `./scripts/setup-jeffrey.sh` 配置 Supabase、本地 Codex 与设备配对，并关闭 `PREVIEW_MODE`。

## 本地启动

需要 Node.js 22.13 或更高版本。

```bash
npm install
cp .env.example .env.local
./scripts/setup-jeffrey.sh
npm run dev
```

配置向导会引导创建 Supabase、连接客户 Mac，并把本地值写入 `.env.local`；不会索取 OpenAI API Key 或 Codex 登录凭证。

## Supabase 初始化

1. 在 Supabase 创建项目并打开 SQL Editor。
2. 完整执行 `supabase/migrations/20260825070000_jeffrey_chat_backend.sql`。
3. 获取当前私人 Sites 用户 ID：登录部署后的站点，再访问 `/api/whoami`。
4. 将 `supabase/seed.sql` 中两处 `11111111-1111-4111-8111-111111111111` 替换为该用户 ID，然后执行 Seed。
5. 环境中的 `PRIVATE_USER_ID` 使用同一 ID；角色和会话 ID 保持 Seed 中的默认值，除非三处一起修改。

Migration 会实际建立 `characters`、`conversations`、`messages`、`memories`、`knowledge_documents`、`knowledge_chunks` 与 `push_subscriptions`，启用 `vector`/`pgcrypto`、HNSW 索引、RLS、权限收紧，以及三个向量检索/事务替换函数。运行时只在服务端使用 Service Role；浏览器不能导入该 Client。

## 环境变量

- `PRIVATE_AUTH_USER_ID`：`/api/whoami` 返回的原始私人 Sites 用户 ID，可以不是 UUID。
- `PRIVATE_USER_ID`：由配置向导从上述身份稳定派生的 Supabase owner UUID；Seed 使用同一值。
- `DEFAULT_CHARACTER_ID` / `DEFAULT_CONVERSATION_ID`：Seed 中 Jeffrey 与默认会话 ID。
- `AI_RUNTIME=local_codex`：正式交付模式，云端不初始化 OpenAI Client。
- `OPENAI_*`：只供明确启用的旧云端兼容模式使用，正式交付保持为空。
- `PREVIEW_MODE`、`DEEPSEEK_API_KEY`、`DEEPSEEK_MODEL`：无 Supabase 时的临时聊天预览；Key 仍只允许放在服务端。
- `NEXT_PUBLIC_SUPABASE_URL`：Supabase 项目 URL。
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`：当前前端不读取，保留未来 Supabase Auth。
- `SUPABASE_SERVICE_ROLE_KEY`：仅服务端使用。
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`：iPhone Web Push；私钥仅放在后端。
- `PROACTIVE_CRON_SECRET`：保护每小时主动联系调度入口。

不要创建 `NEXT_PUBLIC_OPENAI_API_KEY`，也不要把 OpenAI、Service Role 或 VAPID 私钥写入客户端代码。

## 聊天请求流程

`POST /api/chat` 校验身份和消息后保存原文，并创建独立的本地对话任务。已配对 Mac 通过设备签名领取任务，在本机检索 Obsidian、调用 Codex App Server，再由事务接口保存 Jeffrey 回复。PWA 在等待期间轮询历史消息；Mac 离线时不会生成伪回复。

本地 Codex 或知识检索失败时会记录稳定错误码；错误响应不包含密钥、连接信息、完整私人消息或堆栈。

历史接口 `GET /api/conversations/[id]/messages?limit=50&before=<ISO时间>` 只读取私人用户的会话，并预留向上分页游标。

## Messages、Memories 与知识库

- `messages` 是不可替代的完整聊天原文库，保存 user/assistant、text/image/sticker/audio/system、媒体 URL、时长和时间。
- `memories` 是从原文或知识文档提取的结构化长期记忆，可多条提取、向量去重，并通过 `source_message_id` 或 `source_document_id` 追溯来源；它不会替代或删除 Messages。
- Markdown 导入接口 `POST /api/knowledge/import` 支持一次 1–20 个 `.md`，单个不超过 3 MB、总计不超过 10 MB。它解析 frontmatter、保存原文、统一切块、生成 Embedding，并提取 Jeffrey 人设/关系记忆。相同路径重复导入会更新文档并事务替换 Chunk。
- 客户 Obsidian 原始资料保存在 Git 忽略的 `private-data/`，绝不提交或打包到前端。运行 `npm run prepare:jeffrey-migration` 会建立 `import-ready/knowledge`、必要媒体副本和带哈希的本地清单；旧程序、逐日微信原文与 Hook 提示词只归档，不直接进入模型检索。
- 设置页支持选择整理后的知识文件夹，保留 Obsidian 相对路径，并自动按每批 20 个文件上传。导入接口单文件上限为 3 MB、每批总计 10 MB。

## 当前媒体与通知边界

- 图片、Sticker、语音的数据结构和历史渲染已保留；首版只把安全文本描述放入模型上下文，不做图片理解。
- 录音权限与消息类型仍可用，但首版没有上传音频二进制、STT、TTS 或 Realtime Voice。
- PWA 安装、Service Worker、真实 Web Push 订阅与投递已接通。每小时调度只在系统选择的白天时段创建一次本地 Codex 主动消息；静默期、最小间隔、连续未回复限制和关闭开关均在数据库强制执行。
- 互联网聊天请求绝不会直接执行 Shell。本地电脑任务只通过客户 Mac 上的 Jeffrey Local 领取，并受到设备签名、短租约、任务确认、具体动作确认和 Codex/macOS 自身权限的共同约束。

## 从 Jeffrey 聊天中调用本地 Codex

正式本地模式由 Mac 上的 Codex 生成聊天；电脑操作仍进入独立审批状态机。Memory、Obsidian、附件、网页和模型回复只能作为数据，不能扩大权限。

本地控制启用前必须：

1. 依次执行 `20260825230000_local_computer_agent.sql`、`20260825235900_local_conversation_agent.sql`、`20260826002000_proactive_messages.sql` 与 `20260826010000_service_role_privileges.sql`；
2. 独立生成 `.env.example` 中三条 `LOCAL_AGENT_*_SECRET`，不得与 GitHub 修改功能复用；
3. 在客户 Mac 构建并安装 `apps/jeffrey-local`，输入正式 PWA HTTPS 地址并完成一次性配对；
4. 先在测试环境验证读取、修改、动作二次确认、取消、离线和解除配对，再设置 `LOCAL_COMPUTER_AGENT_ENABLED=true`。

Jeffrey Local 的设备私钥与会话只保存在 macOS Keychain；Mac 主动连接后端，Codex App Server 只监听 `127.0.0.1` 并使用随机 capability token。本地结果回传前会遮盖个人 Home 路径和常见凭证。完整配置与验收清单见 `docs/operations/jeffrey-local-macos-setup.md`。

本项目按“一位客户、一台私人 Mac”交付，可直接使用未签名的本地构建，不要求 Apple Developer ID 或公证。客户首次打开时需在 macOS 中手动允许该应用；不关闭 Gatekeeper。Apple 签名与公证只作为减少首次打开提示的可选升级，不影响核心功能。

## 从 Jeffrey 聊天中修改 App

零 API Key 模式下，云端 GitHub Codex Action 默认关闭。App 修改后续由客户 Mac 的本地 Codex 在隔离分支处理；普通聊天和知识库内容不能直接触发代码执行。

客户使用时需要：

1. 保持 `DEVELOPMENT_AGENT_ENABLED=false`，不配置 `OPENAI_API_KEY` 或 GitHub Codex Action。
2. 客户 Mac 上的 Jeffrey Local 与 Codex 保持在线，并把 Jeffrey 源码仓库作为允许修改的工作区。
3. 客户在聊天中明确说“请修改这个 app……”，PWA 才会创建本地电脑任务；普通聊天、记忆与知识文件不能触发修改。
4. 客户先确认任务范围；本地 Codex 只在隔离分支修改并执行检查，返回摘要和本地预览方式。
5. 提交、推送和正式发布属于新的高风险动作，必须再次确认；GitHub 的普通 CI 仅检查代码，不调用任何 AI API。

工作流是：自然语言要求 → 私有任务 → 隔离分支 → 本地 Codex → lint/typecheck/tests/build → 本地预览 → 再次确认提交/推送/发布。云端不会持有 OpenAI API Key。

## 验证

```bash
npm run lint
npm run typecheck
npm test
```

真实端到端联调还需要客户自己的 Supabase 项目、已执行的 Migration/Seed、部署平台 Secrets，以及一台已登录 Codex 的在线 Mac；不需要 OpenAI API Key。

正式交付时逐项完成 `docs/operations/customer-handoff-checklist.md`，不要把源码构建通过误当成客户环境已经上线。
