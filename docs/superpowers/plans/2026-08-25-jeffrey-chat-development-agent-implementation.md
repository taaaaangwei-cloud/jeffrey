# Jeffrey 聊天内云端修改 App 实施计划

日期：2026-08-25

设计依据：[Jeffrey 聊天内云端修改 App 设计](../specs/2026-08-25-jeffrey-chat-development-agent-design.md)

## 结论与范围

本计划实现客户在 Jeffrey 私人 PWA 聊天界面中用自然语言提出 App 修改要求，系统在客户自己的 GitHub 私有仓库中隔离修改、测试并部署预览，客户确认后才发布正式版本。

它不重写现有 PWA，不改变 Jeffrey 名称与狐狸头像，不删除 DeepSeek 临时聊天预览，不改变 OpenAI + Supabase + pgvector + Obsidian 的正式聊天链，也不会让普通 `/api/chat` 请求直接执行 Shell。

AI 主动联系、Web Push 发送、STT、TTS、Realtime Voice 和图片多模态仍是独立后续功能。本计划只复用现有 `lib/proactive/` 与 `push_subscriptions` 预留，不在本次顺带实现。

## 原始客户要求回顾

| 客户要求 | 当前状态 | 本计划影响 |
|---|---|---|
| 私人单用户 PWA，打开即进入 Jeffrey 聊天 | 已实现 | 保持不变 |
| 不重写聊天、图片、表情、录音和 PWA UI | 已实现 | 只增加任务卡，不替换原界面 |
| Jeffrey 名称与狐狸头像 | 已实现 | 保持不变 |
| OpenAI 正式聊天后端 | 已实现，待客户正式凭证联调 | 普通聊天链保持不变 |
| DeepSeek 只用于开发预览 | 已实现 | 云端编码只使用 OpenAI API |
| 完整保存用户与 AI 原文 | 已实现 | 开发意图分流仍保证用户原文只保存一次 |
| 长期记忆、pgvector、来源追溯和去重 | 已实现 | 知识与记忆不得触发开发任务 |
| Obsidian Markdown 导入与角色迁移 | 已实现 | Runner 不接收客户知识库正文 |
| 图片、Sticker、Audio 消息结构 | 已保留 | 不修改消息类型 |
| 主动联系与 Web Push | 后续独立功能 | 本计划不宣称完成 |
| 普通聊天不得直接执行任意 Shell | 已实现 | 继续使用空工具注册表 |
| 客户从 Jeffrey 聊天中要求修改 App | 已批准、待实现 | 本计划完整实现 |
| 云端运行、GitHub 私有仓库、先预览后发布 | 已批准、待实现 | 使用 GitHub Actions + Codex Action |
| 不要求“开发模式”固定口令 | 已批准、待实现 | 使用服务端结构化意图分类 |

## 当前基线

在编写本计划前已验证当前工作树代码：

- lint：通过
- typecheck：通过
- unit tests：16/16 通过
- build：通过

工作树中仍有此前 DeepSeek 预览和知识迁移相关的未提交修改。实施时只编辑或暂存本计划列出的文件；每个提交前执行 `git diff --cached --name-only`，不得意外提交其他现有改动。

## 已确认的测试接缝

实施采用纵向 TDD：每个任务先写一个通过公共接口观察行为的失败测试，再写最小实现使其通过。

测试只跨以下已批准接口接缝：

1. `IncomingMessageEngine.send(command)`：观察一条客户消息如何变成普通回复、追问或开发任务，验证用户原文只保存一次。
2. `DevelopmentTaskService`：观察任务创建、继续调整、回调、批准、取消和状态迁移。
3. `DevelopmentIntentModel.classify(message)`：观察结构化分类结果；OpenAI Adapter 用独立契约测试。
4. `DevelopmentRunner.start/continue(task)`：观察 Runner 引用和 dispatch 请求；生产使用 GitHub Adapter，测试使用 Recording Adapter。
5. Route Handler HTTP 接缝：观察私人身份、参数校验、稳定错误与脱敏任务视图。
6. PWA 任务卡：通过可访问文本、按钮可用状态和用户动作验证，不断言内部 React state。
7. GitHub workflow：通过测试仓库或受控测试分支的真实 workflow dispatch 验证分支、检查、预览和回调。

不测试私有函数，不通过读取内部变量证明行为，也不为 SQL 文本编写只匹配字符串的脆弱测试。

## 实施顺序

### 任务 0：保护当前工作树并记录基线

目标：确保云端修改功能不会覆盖或误提交现有 DeepSeek、Obsidian 和用户 UI 改动。

操作：

1. 记录 `git status --short` 和当前 HEAD。
2. 逐个检查本计划将编辑的现有文件；若与未提交改动重叠，先做语义合并，不还原用户改动。
3. 运行现有 lint、typecheck、unit tests 和 build，保存基线结果。
4. 后续每个提交只暂存当前任务明确列出的文件。

验收：基线仍为 lint/typecheck/build 通过、16 项单元测试通过；无现有改动被删除。

### 任务 1：建立任务领域类型与状态机

新增：

- `lib/development/types.ts`
- `lib/development/state-machine.ts`
- `tests/development-state-machine.test.ts`

先写失败测试：

- 允许 `queued → running → testing → previewing → awaiting_approval`。
- 允许失败、取消、发布和回滚路径。
- 拒绝 `running → published` 等越级迁移。
- 拒绝终态回到执行态。
- 继续调整只允许从 `awaiting_approval` 返回 `queued`。

实现：

- 定义 `DevelopmentTaskStatus`、`DevelopmentTask`、`DevelopmentTaskEvent`、`PublicDevelopmentTask`。
- 将合法迁移表集中在 `assertDevelopmentTransition(from, to)`。
- 定义公开测试摘要结构，避免向前端返回完整 Runner 日志。

验证：

```bash
npm run test:unit -- tests/development-state-machine.test.ts
```

提交建议：`Add development task state machine`

### 任务 2：建立任务仓库与数据库 Migration

新增：

- `lib/development/repository.ts`
- `lib/development/memory-repository.ts`
- `lib/development/supabase-repository.ts`
- `supabase/migrations/20260825190000_development_agent.sql`
- `tests/development-task-repository.test.ts`

先写失败测试：

- 创建任务自动写入 `created` 事件。
- 查询必须同时匹配任务 ID 与私人用户 ID。
- 状态与事件在一个仓库操作内更新。
- 重复 Runner 事件 ID 不重复追加事件。
- 同一用户最多存在一个活跃任务。

实现：

- `DevelopmentTaskRepository` 只暴露创建、按所有者读取、原子迁移、追加幂等事件和更新安全结果所需的方法。
- 内存 Adapter 用于单元测试。
- Supabase Adapter 使用 RPC 或单事务语义保证状态与事件一致。
- 新 Migration 创建 `development_tasks`、`development_task_events`、唯一/部分索引、约束、RLS、权限收紧和所需事务函数。
- 不修改已经交付的基础 Migration，避免客户已执行环境发生漂移。

外部验证：在独立 Supabase 测试项目执行全部 Migration，验证 Service Role 可用、Anon/Auth 无直接表权限、跨用户查询为空。

提交建议：`Persist development tasks and audit events`

### 任务 3：实现任务深模块

新增：

- `lib/development/service.ts`
- `lib/development/runner.ts`
- `lib/development/recording-runner.ts`
- `lib/development/approval.ts`
- `tests/development-task-service.test.ts`

先写失败测试：

- `create` 持久化任务后只 dispatch 一次。
- dispatch 失败将任务标为 `failed`，不影响普通聊天。
- `continue` 复用任务与分支并使旧批准失效。
- 检查未通过时 `approveRelease` 被拒绝。
- 批准值只绑定一个 `preview_sha`，过期或重复使用被拒绝。
- `cancel` 不删除审计记录。

实现：

- `DevelopmentTaskService` 隐藏状态机、仓库、Runner、批准 nonce 和事件追加细节。
- `DevelopmentRunner` 只有 `start` 与 `continue` 两个方法。
- Recording Adapter 捕获调用，生产 Adapter 在后续任务接入。
- 批准 nonce 只存哈希，使用 Web Crypto HMAC/恒定时间比较；客户端不提供目标 SHA。

提交建议：`Add development task orchestration`

### 任务 4：重构单次消息入口，保证原文只保存一次

修改：

- `lib/chat/types.ts`
- `lib/chat/engine.ts`
- `lib/server/dependencies.ts`
- `app/api/chat/route.ts`
- `tests/chat-engine.test.ts`

新增：

- `lib/chat/incoming-message-engine.ts`
- `tests/incoming-message-engine.test.ts`

先写失败测试：

- 普通聊天仍保存一条用户原文和一条 Jeffrey 完整回复。
- AI 失败仍保留用户原文。
- 开发修改消息只保存一次用户原文，不再进入普通 AI 回复链。
- 含糊修改保存 Jeffrey 追问，不创建开发任务。
- 分类模型失败时进入现有普通聊天，不创建任务。

实现：

- 新建深模块 `IncomingMessageEngine.send(command)` 作为 Route Handler 唯一调用点。
- 它先验证会话/角色并保存用户消息一次，再调用开发意图模块。
- 将现有 `ChatEngine` 收窄为“对已保存的用户消息生成并保存伴侣回复”，不再自行重复保存用户原文。
- 开发任务和追问也通过现有 ChatRepository 保存 assistant 消息，刷新后仍可见。
- `/api/chat` 响应向后兼容 `{ success, message }`，仅在开发任务分支附加可选 `developmentTask`。

回归验证：现有聊天、Memory、Knowledge 降级测试全部继续通过。

提交建议：`Route incoming messages without duplicate persistence`

### 任务 5：实现自然语言开发意图分类

新增：

- `lib/development/intent-model.ts`
- `lib/development/openai-intent-model.ts`
- `lib/development/intent-router.ts`
- `tests/development-intent-router.test.ts`
- `tests/openai-development-intent.test.ts`

修改：

- `lib/ai/client.ts`
- `lib/server/dependencies.ts`

先写失败测试：

- “今天好累”返回 `chat`。
- “把聊天背景换成深色”返回 `app_change`。
- “这个颜色不好看”返回 `ambiguous` 和自然追问。
- “删除全部记忆”返回 `app_change` + `sensitive`，但不立即 dispatch。
- Knowledge、Memory、assistant、system 和 callback 内容没有调用分类接口的入口。
- OpenAI 输出不符合 schema 时进入普通聊天。

实现：

- `DevelopmentIntentModel` 为真实接缝；OpenAI 与确定性测试 Adapter 各一套。
- 使用 OpenAI Responses API 结构化输出，schema 固定为 `chat | ambiguous | app_change`。
- 分类 prompt 只包含当前私人用户消息、允许的上一轮追问状态和可选活跃任务 ID。
- 不向分类模型传递最近聊天、Memory、Knowledge、文件或网页正文。
- `sensitive` 结果先返回范围确认；确认消息仍需重新经过当前用户身份验证。

提交建议：`Classify app change requests safely`

### 任务 6：加入配置闸门与服务器依赖

修改：

- `.env.example`
- `lib/config/server.ts`
- `lib/server/dependencies.ts`
- `app/api/config/status/route.ts`
- `scripts/setup-jeffrey.sh`
- `tests/server-config.test.ts`

新增配置：

- `DEVELOPMENT_AGENT_ENABLED=false`
- `GITHUB_REPOSITORY`
- `GITHUB_APP_ID`
- `GITHUB_APP_INSTALLATION_ID`
- `GITHUB_APP_PRIVATE_KEY`
- `DEVELOPMENT_CALLBACK_SECRET`
- `DEVELOPMENT_APPROVAL_SECRET`
- `DEVELOPMENT_TASK_MAX_MINUTES`

先写失败测试：

- 默认关闭云端修改。
- 缺少任一必需配置时普通聊天仍可用。
- 修改请求得到“尚未配置”的稳定提示，不模拟成功。
- 配置状态接口不返回 Secret 或 GitHub 私钥片段。
- DeepSeek 预览配置和正式 OpenAI 配置行为不回归。

实现：配置解析、生产 Adapter 选择和安全的公开状态字段。

提交建议：`Configure development agent safely`

### 任务 7：实现任务 HTTP 接口、签名回调与重放保护

新增：

- `app/api/development/tasks/[id]/route.ts`
- `app/api/development/tasks/[id]/instructions/route.ts`
- `app/api/development/tasks/[id]/approve/route.ts`
- `app/api/development/tasks/[id]/cancel/route.ts`
- `app/api/development/callbacks/github/route.ts`
- `lib/development/callback-signature.ts`
- `lib/development/http.ts`
- `tests/development-api.test.ts`
- `tests/development-callback.test.ts`

先写失败测试：

- 非私人用户读取、继续、批准和取消均被拒绝。
- 请求 ID、正文长度和状态不合法时返回稳定 4xx。
- 错误 HMAC、过期时间戳和重复事件 ID 被拒绝或幂等处理。
- 回调不能越级状态，也不能替换为其他提交 SHA。
- 发布批准不信任客户端传入的 SHA、分支或仓库。

实现：

- 复用 `resolvePrivateUser` 与稳定错误响应。
- 回调签名覆盖原始请求体、时间戳和事件 ID。
- 任务读取只返回 `PublicDevelopmentTask`。
- 活跃任务采用有限轮询所需的缓存禁用和最小数据响应。

提交建议：`Expose secure development task routes`

### 任务 8：实现聊天任务卡

新增：

- `app/components/development-task-card.tsx`
- `lib/development/public-view.ts`
- `tests/development-public-view.test.ts`

修改：

- `app/page.tsx`
- `app/globals.css`
- `tests/rendered-html.test.mjs`

先写失败测试：

- `awaiting_approval` 且检查全部通过时才显示“确认发布”。
- `failed` 显示“正式版本未受影响”。
- `publishing` 禁用重复点击。
- 预览、继续调整、取消和发布调用正确 Route Handler。
- 普通消息渲染、Jeffrey 头像、设置页、图片/Sticker/Audio 结构不回归。

实现：

- `/api/chat` 返回任务时在对应 Jeffrey 消息下渲染任务卡。
- 活跃任务采用带退避的有限轮询；进入终态后停止。
- 预览使用新标签页并加 `noopener noreferrer`。
- 操作失败只更新任务卡提示，不删除聊天消息。
- 保持单聊天页，不新增联系人或复杂开发后台。

人工验证：用手机尺寸检查 queued、running、preview ready、failed、published 五种状态。

提交建议：`Show development previews in Jeffrey chat`

### 任务 9：接入 GitHub App 与 repository_dispatch

新增：

- `lib/development/github-app-auth.ts`
- `lib/development/github-actions-runner.ts`
- `tests/github-actions-runner.test.ts`

修改：

- `package.json`
- `package-lock.json`
- `lib/server/dependencies.ts`

先写失败测试：

- GitHub App JWT 只使用配置中的 App ID 和私钥。
- Installation token 请求限定目标 Installation。
- dispatch 只发送任务 ID、短时取数令牌和幂等事件 ID，不发送完整聊天或知识库。
- GitHub 401/403/404/5xx 映射为稳定内部错误且不泄露响应中的敏感内容。
- 重试同一任务复用幂等事件，不重复启动。

实现：

- 使用支持 Web Crypto 的 JWT 库生成 GitHub App JWT。
- 换取短时 Installation token 后触发固定事件类型 `jeffrey_development_task`。
- 仓库名称来自服务器配置，不能由浏览器覆盖。
- GitHub token 只存在当前请求内存，不写数据库和日志。

提交建议：`Dispatch development tasks to GitHub Actions`

### 任务 10：建立 Codex 预览工作流

新增：

- `.github/workflows/jeffrey-preview.yml`
- `.github/prompts/jeffrey-development-agent.md`
- `scripts/development/fetch-task.mjs`
- `scripts/development/validate-diff.mjs`
- `scripts/development/sign-callback.mjs`
- `scripts/development/deploy-preview.mjs`
- `tests/development-diff-policy.test.ts`

工作流固定使用官方 `openai/codex-action@v1`。根据 OpenAI 官方文档，该 Action 会安装 Codex CLI，在提供 API Key 时启动 Responses API 代理，并按工作流指定权限运行 `codex exec`。

先写失败测试：

- 差异策略拒绝 `.env*`、私钥、客户知识库、生产导出和禁止工作流改动。
- 安全源码与测试文件可以提交。
- 回调摘要不包含环境值、完整日志或 Authorization Header。
- 任务 prompt 只包含结构化修改范围、仓库规则和验收命令。

工作流步骤：

1. `repository_dispatch` 接收任务 ID。
2. 使用任务绑定短时令牌取得结构化要求。
3. 检出记录的 `base_sha`。
4. 创建或检出 `jeffrey/task-<id>`。
5. 调用 `openai/codex-action@v1`，权限限制在当前工作区。
6. 执行 lint、typecheck、unit tests 和 build。
7. 验证差异与 Secret 扫描。
8. 提交并推送任务分支。
9. 部署独立预览。
10. 签名回传状态、提交 SHA、测试摘要、变更摘要和预览 URL。

预览部署：

- 使用当前 Vinext 构建产物和 Cloudflare Wrangler，将每个任务部署为独立 Worker 名称。
- 预览不注入生产 Supabase、生产聊天、客户知识库或生产部署 Secret。
- 首版预览为 UI/静态演示环境；需要真实后端行为时依靠自动测试，不能连接生产数据。
- 工作流结束或任务取消后设置预览清理期限；删除预览 Worker 不删除任务分支与审计。

官方参考：[Codex GitHub Action](https://learn.chatgpt.com/docs/github-action)

真实联调：用无敏感数据的测试修改验证分支、提交、四类检查、预览 URL 和签名回调。

提交建议：`Run Codex preview tasks in GitHub Actions`

### 任务 11：实现受保护发布与自动回滚

新增：

- `lib/development/release-dispatcher.ts`
- `.github/workflows/jeffrey-release.yml`
- `scripts/development/health-check.mjs`
- `tests/development-release.test.ts`

修改：

- `lib/development/service.ts`
- `lib/server/dependencies.ts`

先写失败测试：

- 只有已批准且 SHA 未变化的任务可发布。
- 新修改立即使旧批准失效。
- 同一批准不能发布两次。
- 生产部署前记录旧 SHA。
- 健康检查失败触发旧 SHA 回滚并进入 `rolled_back`。

工作流：

1. 使用 GitHub protected Environment `production`。
2. 再次验证批准 SHA 和分支头。
3. 重跑 lint、typecheck、unit tests、build。
4. 记录生产旧 SHA。
5. 合并或快进已批准分支。
6. 通过 Sites/Cloudflare 正式发布流程部署。
7. 检查首页、静态资源和 `/api/config/status`。
8. 失败则重新部署旧 SHA。
9. 签名回调 `published` 或 `rolled_back`。

生产 Secret 只配置在 GitHub `production` Environment；预览工作流不可读取。

真实联调必须先在测试站点演练一次成功发布和一次故意失败回滚，再开放正式发布按钮。

提交建议：`Publish approved previews with rollback`

### 任务 12：补齐文档、设置向导与运维说明

修改：

- `README.md`
- `.env.example`
- `scripts/setup-jeffrey.sh`
- `docs/superpowers/specs/2026-08-25-jeffrey-chat-development-agent-design.md`（只在实现事实与规格有偏差时更新并重新批准）

新增：

- `docs/operations/github-development-agent-setup.md`
- `docs/operations/development-agent-runbook.md`

内容：

- 客户如何建立/转移 GitHub 私有仓库。
- 如何创建并安装最小权限 GitHub App。
- 如何配置 OpenAI、预览部署和生产 Environment Secrets。
- 如何执行新 Supabase Migration。
- 如何保持 `DEVELOPMENT_AGENT_ENABLED=false` 完成联调。
- 如何查任务、停止任务、撤销 GitHub App、轮换密钥、清理预览和人工回滚。
- 明确 ChatGPT Pro 与 OpenAI API 计费分离。
- 明确主动联系、Web Push 和语音仍未在本计划实现。

提交建议：`Document Jeffrey development agent operations`

### 任务 13：完整验证与最终需求回读

自动验证：

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

安全验证：

- 搜索客户端 bundle，确认没有 OpenAI、GitHub、Supabase Service Role、HMAC 或部署 Secret。
- 验证知识库中的“修改 App”文本不会创建任务。
- 验证伪造、过期和重放回调被拒绝。
- 验证测试失败无“确认发布”按钮。
- 验证重复点击不会重复发布。
- 验证生产发布失败自动回滚。

手动端到端场景：

1. “今天好累”只触发普通 Jeffrey 回复。
2. “这个颜色不好看”只追问，不创建任务。
3. “把聊天背景改成深色”创建任务、显示进度并返回预览。
4. “按钮再小一点”继续同一分支并使旧批准失效。
5. 客户查看预览后确认发布，正式 PWA 更新。
6. 故意制造构建失败，正式 PWA 不受影响。
7. 故意制造健康检查失败，系统恢复旧版本。
8. 刷新聊天页面，任务消息和最终状态仍存在。

最后重新逐行阅读原始 39 项后端要求和本设计规格，建立最终对照表。任何标为本阶段“已实现”的项目若未通过验证，继续修复后重新运行全部检查。

提交建议：`Verify Jeffrey development agent end to end`

## 分阶段开关

### 阶段一完成条件

任务 1–8 完成。使用 Recording/Disabled Runner 验证状态机、聊天卡、身份、回调和批准；`DEVELOPMENT_AGENT_ENABLED` 仍为 `false`，不执行真实代码。

### 阶段二完成条件

任务 9–10 完成。客户 GitHub 私有仓库可以产生真实分支、检查和预览；正式发布仍关闭。

### 阶段三完成条件

任务 11–13 完成。成功发布与失败回滚都经过测试站点演练，生产 Secrets 已隔离，才允许将正式环境 `DEVELOPMENT_AGENT_ENABLED=true`。

## 客户需要提供的外部配置

- GitHub 私有仓库及管理员权限
- 安装 GitHub App 的授权
- 用于无人值守 Codex Action 的 OpenAI API Key
- GitHub Actions/Environment Secrets 配置权限
- 预览与生产 Cloudflare/Sites 部署凭证
- 已执行基础 Migration 的 Supabase 项目，以及执行新增 Migration 的权限

这些配置在阶段一不需要真实值；阶段二开始前需要 GitHub、OpenAI 和预览部署配置；阶段三开始前才需要生产部署凭证。

## 完成定义

只有以下条件全部满足，才能向客户声明云端修改功能已完成：

- 普通聊天、历史、Memory、Knowledge 和 DeepSeek 预览全部回归通过。
- 开发意图只来自当前私人用户消息。
- 客户消息无重复保存。
- 云端修改发生在客户 GitHub 私有仓库的独立分支。
- 自动检查全部通过后才产生可批准预览。
- 客户确认绑定准确提交且只能使用一次。
- 生产发布失败能够恢复旧版本。
- PWA 和客户端 bundle 不含任何服务器 Secret。
- lint、typecheck、tests、build 和真实端到端演练都有明确结果。
- README 与运维文档只声称真正完成的能力。
