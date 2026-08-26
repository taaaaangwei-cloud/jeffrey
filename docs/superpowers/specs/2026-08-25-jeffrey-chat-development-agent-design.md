# Jeffrey 聊天内云端修改 App 设计

日期：2026-08-25
状态：已批准

## 目标

客户可以在 Jeffrey 的现有私人 PWA 聊天界面中，用自然语言提出 App 修改要求。系统不要求客户输入“进入开发模式”等固定口令，而是只对客户当下亲自发送的消息进行修改意图判断。

明确的修改要求会创建云端开发任务。任务在客户自己的 GitHub 私有仓库中建立隔离分支，由无人值守编码代理修改、检查和构建，并部署独立预览。Jeffrey 在原聊天界面展示修改说明、测试结果和预览链接。只有客户明确点击“确认发布”后，系统才允许合并并更新正式 PWA。

本设计不允许普通互联网聊天直接执行 Shell，也不允许知识库、历史消息、Jeffrey 回复或外部网页触发开发任务。

## 已确认选择

- 源码放在客户自己的 GitHub 私有仓库。
- 云端执行使用 GitHub Actions 作为首选任务运行器。
- 无人值守编码使用客户自己的 OpenAI API Key；ChatGPT Pro 订阅不能替代 API 计费和 API 凭证。
- 不设置“开发模式”或固定触发短语。
- 每次修改先产生独立预览，客户确认后才发布。
- 普通聊天、长期记忆和 Obsidian 知识库继续沿用现有 ChatEngine，不获得代码执行权限。
- 当前单用户身份继续绑定服务端 `PRIVATE_USER_ID`。

## 为什么选择 GitHub Actions

GitHub Actions 天然具备私有仓库检出、独立分支、提交记录、状态检查、审计和回滚能力。它比新建常驻编码服务器减少一套基础设施，同时可以用仓库 Secrets 隔离 OpenAI、GitHub 和预览部署凭证。

专用云端编码服务器保留为以后替换的 Runner Adapter，但首版不建设。Workspace Agents API 也不作为首版执行器：OpenAI 官方文档目前说明它能创建任务并轮询状态，但不能通过 API 取回代理完整回复，因此无法独立完成本设计要求的差异摘要、测试结果和预览回传。

参考：

- [Codex cloud](https://learn.chatgpt.com/docs/cloud)
- [Trigger workspace agent runs](https://learn.chatgpt.com/workspace-agents/trigger-runs)
- [Workspace Agent access tokens](https://learn.chatgpt.com/workspace-agents/authentication)

## 总体架构

```text
Jeffrey PWA 聊天界面
  → POST /api/chat
    → DevelopmentIntentClassifier
      ├─ chat：进入现有 ChatEngine
      ├─ ambiguous：Jeffrey 追问，不创建任务
      └─ app_change：DevelopmentTaskService 创建任务
        → GitHubDispatcher 触发 repository_dispatch
          → GitHub Actions 检出私有仓库
            → 建立 jeffrey/task-<id> 分支
            → 云端编码代理修改
            → lint / typecheck / test / build
            → 部署隔离预览
            → 签名回调 Jeffrey 后端
              → 聊天任务卡展示预览
                → 客户确认发布
                  → ReleaseDispatcher 触发发布工作流
                    → 合并已测试提交
                    → 部署正式 PWA
                    → 健康检查
                    → 成功或自动回滚
```

普通聊天与开发任务共用一个聊天入口，但从意图判断之后分流。开发任务不进入 Jeffrey 人格模型的工具调用循环；它由独立服务和状态机处理。

## 深模块与接口

### DevelopmentIntentClassifier

输入只包含：当前经过身份校验的客户消息、该消息是否为上一轮修改追问的回答，以及可选的当前开发任务 ID。它不能读取检索到的知识库片段作为指令来源。

输出为严格结构化结果：

```ts
type DevelopmentIntent =
  | { kind: "chat" }
  | { kind: "ambiguous"; question: string }
  | {
      kind: "app_change";
      summary: string;
      requestedChanges: string[];
      risk: "normal" | "sensitive";
      continuationTaskId?: string;
    };
```

分类器只判断路由和整理范围，不拥有任何执行工具。模型调用失败、超时或输出解析失败时一律进入现有普通聊天流程；模型成功但修改意图置信度不足时返回 `ambiguous` 并追问。两种降级都不得创建任务。

以下内容不具备触发资格：assistant/system 消息、历史消息、Memory、Knowledge Chunk、文件正文、网页内容、GitHub issue 正文、回调内容和主动消息。

### DevelopmentTaskService

负责创建任务、验证状态迁移、追加事件、生成一次性发布确认、接受签名回调，以及向聊天接口返回统一任务视图。调用方不需要理解 GitHub Actions 或部署平台。

关键接口：

```ts
interface DevelopmentTaskService {
  create(command: CreateDevelopmentTask): Promise<DevelopmentTask>;
  appendInstruction(taskId: string, instruction: string): Promise<DevelopmentTask>;
  get(taskId: string): Promise<DevelopmentTask>;
  acceptRunnerCallback(input: SignedRunnerCallback): Promise<DevelopmentTask>;
  approveRelease(taskId: string, userId: string): Promise<DevelopmentTask>;
  cancel(taskId: string, userId: string): Promise<DevelopmentTask>;
}
```

### DevelopmentTaskRepository

封装 `development_tasks` 和 `development_task_events`。生产实现使用 Supabase，测试实现使用内存 Adapter。所有查询必须同时约束 `task_id` 与固定私人 `user_id`。

### DevelopmentRunner

把任务交给执行平台，首版实现为 `GitHubActionsRunner`。接口只接受已持久化任务 ID、结构化修改范围和允许修改的仓库标识，不接收任意密钥或客户端提供的命令。

```ts
interface DevelopmentRunner {
  start(task: DevelopmentTask): Promise<RunnerReference>;
  continue(task: DevelopmentTask, instruction: string): Promise<RunnerReference>;
}
```

GitHub 实现通过安装在客户指定私有仓库上的 GitHub App 触发 `repository_dispatch`，并使用任务 ID 作为幂等键。GitHub App 只申请该仓库所需的 Contents、Actions 和 Metadata 最小权限；浏览器不能接触 GitHub 凭证。

### ReleaseDispatcher

只接受满足全部发布前置条件的任务：状态为 `awaiting_approval`、测试与构建全部通过、预览提交 SHA 与批准 SHA 完全一致、当前用户匹配、一次性确认未被使用。

它不接受自由文本、分支名或客户端传入的提交 SHA。发布目标全部从服务端任务记录读取。

## 状态机

`development_tasks.status` 只允许以下状态：

```text
queued
    → running
      → testing
        → previewing
          → awaiting_approval
            → publishing
              → published

任一执行态 → failed
任一未发布态 → canceled
publishing → rollback_running → rolled_back
published → rollback_requested → rollback_running → rolled_back
```

状态只能按服务端规则迁移。Runner 回调不能从 `running` 直接写成 `published`；客户端也不能直接提交状态值。

“正在理解要求”是聊天请求尚未返回时的前端临时状态，不写入数据库。只有分类器明确返回 `app_change` 并成功创建记录后，持久化状态才从 `queued` 开始。

对同一个预览提出“按钮再小一点”等继续调整时，系统复用原任务和分支，将状态从 `awaiting_approval` 重新变为 `queued`。旧的发布确认立即失效，必须等待新提交重新通过测试。

## 数据库

### development_tasks

主要字段：

- `id`、`user_id`、`conversation_id`、`source_message_id`
- `request_text`：客户原话
- `request_summary`、`requested_changes jsonb`
- `risk_level`
- `status`
- `repository_full_name`
- `branch_name`、`base_sha`、`preview_sha`
- `runner_run_id`、`runner_url`
- `preview_url`
- `test_summary jsonb`、`change_summary`
- `approval_nonce_hash`、`approval_expires_at`、`approved_at`
- `published_sha`、`previous_production_sha`、`published_at`
- `error_code`、`created_at`、`updated_at`

不保存 OpenAI Key、GitHub token、部署 token、完整 Runner 日志或生产数据库凭证。

### development_task_events

追加写入的审计台账：

- `id`、`task_id`、`user_id`
- `event_type`
- `public_message`：可安全展示给客户的简短说明
- `metadata jsonb`：只保存非敏感 ID、SHA 和测试状态
- `created_at`

事件不可由浏览器更新或删除。完整云端日志留在 GitHub Actions，PWA 只保存脱敏摘要。

### RLS 与权限

两张表都开启 RLS。浏览器不直接访问表；Route Handler 使用 Service Role，同时显式约束 `PRIVATE_USER_ID`。GitHub 回调使用独立 HMAC 密钥并执行时间戳、新鲜窗口和重放检查。

## API

### 聊天入口

`POST /api/chat` 在保存当前用户消息后调用分类器：

- `chat`：保持现有聊天流程。
- `ambiguous`：保存 Jeffrey 的追问消息并返回普通消息结果，不创建任务。
- `app_change`：创建任务、保存 Jeffrey 的确认消息并返回带 `developmentTask` 的统一响应。

### 任务读取

`GET /api/development/tasks/[id]` 返回任务卡所需的脱敏视图。首版前端可在任务活跃期间有限轮询；未来可替换为 Supabase Realtime 或服务端事件。

### 继续调整

`POST /api/development/tasks/[id]/instructions` 只接受当前私人用户的新自然语言指令。只有未发布、未取消任务可以继续调整。

### 发布确认

`POST /api/development/tasks/[id]/approve` 接受服务端生成的一次性确认值。确认值与当前 `preview_sha` 绑定；新修改、超时或已使用都会使其失效。

### 取消

`POST /api/development/tasks/[id]/cancel` 取消未发布任务，并请求 Runner 终止仍在运行的任务。取消不会删除分支或审计记录。

### Runner 回调

`POST /api/development/callbacks/github` 只接受 GitHub 工作流签名回调。校验 HMAC、时间戳、事件 ID、任务 ID、允许的状态迁移和提交 SHA。

## GitHub 工作流

### 修改与预览工作流

1. 接收包含 `task_id` 的 `repository_dispatch`。
2. 从 Jeffrey 后端用短时、任务绑定的读取令牌获取结构化任务，不把客户全部聊天或知识库发送到 GitHub。
3. 检出锁定的正式分支 SHA。
4. 创建 `jeffrey/task-<task_id>` 分支；继续调整时检出同一分支。
5. 在隔离 Runner 中调用编码代理。
6. 编码代理可在一次性容器内使用仓库级只读检查和代码编辑命令；验收只认仓库预配置的安装、lint、类型检查、测试和构建脚本，部署命令不能由模型自由生成。
7. 扫描差异，拒绝提交 `.env*`、私钥、构建产物中的密钥和禁止路径。
8. 提交并推送分支。
9. 将该提交部署到与生产隔离的预览环境。
10. 用签名回调传回 SHA、变更摘要、测试摘要、预览 URL 和 Runner URL。

Runner 中的编码代理可以在沙箱内编辑仓库并执行测试，但不能取得生产 Supabase Service Role、客户 Obsidian 原文、正式发布 token 或 Jeffrey 聊天数据库访问权。

### 正式发布工作流

1. 只接受服务端 ReleaseDispatcher 发送的任务 ID 和批准事件。
2. 再次取得任务并确认批准 SHA。
3. 验证 GitHub 分支头与批准 SHA 一致。
4. 重跑关键测试和构建。
5. 记录当前生产 SHA。
6. 合并或快进已批准提交。
7. 部署生产环境。
8. 检查首页、静态资源和聊天配置状态接口。
9. 成功后回调 `published`；失败则部署旧 SHA 并回调 `rolled_back`。

## PWA 交互

现有单聊天页布局保持不变，不增加联系人页或强制开发后台。开发任务作为 Jeffrey 消息下方的结构化任务卡显示。

任务卡展示：

- 客户修改要求的简短摘要
- 当前状态
- 安全的阶段说明
- 测试、类型检查和构建是否通过
- 变更摘要
- 预览链接
- `查看预览`、`确认发布`、`继续调整`、`取消本次修改`

只有状态为 `awaiting_approval` 且全部必需检查通过时显示 `确认发布`。失败卡明确说明正式版本未受影响。发布卡显示正式版本号或提交短 SHA。

预览在手机浏览器新页面打开，不共享生产 Service Worker 缓存和生产写入凭证。预览聊天使用静态演示数据或独立预览数据库，不能读取或写入客户的生产消息、记忆与知识库。

## 自然语言与高风险操作

普通 UI、文案、样式和非破坏性功能修改可直接进入预览制作。

以下要求标为 `sensitive`，创建 Runner 任务前先向客户确认范围：

- 删除或重置消息、记忆、知识库或用户资料
- 修改身份鉴权、RLS 或生产数据库迁移
- 更换或暴露 API、GitHub、Supabase、Push 密钥
- 放宽工具权限、网络权限或发布确认
- 删除回滚、审计或安全检查
- 引入付费外部服务或显著增加运行成本

无论风险等级，正式发布都必须再次确认。

## 密钥与信任边界

### Jeffrey 后端 Secrets

- GitHub App ID、Installation ID 与私钥
- Runner callback HMAC secret
- 发布确认签名 secret
- 现有 Supabase Service Role

### GitHub Actions Secrets

- `OPENAI_API_KEY`
- 预览部署专用凭证
- 生产部署凭证（只对受保护的 release environment 可见）
- callback HMAC secret

修改工作流不能读取生产部署 environment 的 Secrets。GitHub 正式环境启用 branch/environment protection；只有发布工作流能够请求生产凭证。

浏览器永远不能获得上述 Secret。`.env.local`、客户知识库和生产数据库导出不能进入 Git。

## 幂等、并发与限制

- 每个触发请求携带稳定 `task_id` 与幂等事件 ID。
- 同一任务同一时间最多一个 Runner 执行；新的继续调整排队等待当前执行完成或先取消当前执行。
- 回调事件 ID 存入事件台账，重复回调返回成功但不重复迁移状态。
- 发布确认只对一个 `preview_sha` 有效且只能使用一次。
- 首版每个用户同时最多一个活跃开发任务，避免分支和预览冲突。
- 配置任务最长时间、最大重试次数和 API 费用上限；超过限制进入 `failed`，不会自动扩权继续。

## 失败与恢复

- 分类模型调用、超时或解析失败：不创建任务，进入现有普通聊天；只有分类成功但置信度不足时才追问。
- GitHub dispatch 失败：任务标记 `failed`，提示稍后重试。
- 编码或测试失败：保留分支和日志，任务卡显示脱敏原因，可继续调整或取消。
- 预览部署失败：不能发布；已通过的代码分支仍保留。
- 回调超时：定时核对 GitHub run 状态；无法确认完成时不推进状态。
- 发布前检查失败：不变更生产。
- 发布后健康检查失败：自动部署 `previous_production_sha` 并标记 `rolled_back`。
- 人工回滚：客户提出回滚要求后生成目标版本说明，确认后走同一受保护发布流程。

## 日志与隐私

新增稳定日志事件：

- `DEVELOPMENT_INTENT_ERROR`
- `DEVELOPMENT_TASK_CREATED`
- `DEVELOPMENT_DISPATCH_ERROR`
- `DEVELOPMENT_CALLBACK_REJECTED`
- `DEVELOPMENT_PREVIEW_READY`
- `DEVELOPMENT_RELEASE_APPROVED`
- `DEVELOPMENT_RELEASE_FAILED`
- `DEVELOPMENT_ROLLBACK_COMPLETED`

日志只记录任务 ID、状态、非敏感错误码、提交短 SHA 和耗时。不记录客户完整消息、知识库正文、Authorization Header、HMAC、API Key 或数据库连接信息。

## 验证

### 单元测试

- 普通恋爱聊天判定为 `chat`。
- 明确 App 修改判定为 `app_change`。
- 含糊评价判定为 `ambiguous` 并产生追问。
- assistant、Memory、Knowledge 和外部内容没有触发资格。
- 状态机拒绝越级和倒退迁移。
- 新提交使旧批准失效。
- 一次性批准不能重复使用。
- HMAC 错误、过期和重放回调被拒绝。

### 集成测试

- 创建任务后只发送一次 GitHub dispatch。
- GitHub 回调正确写入事件、SHA、测试摘要和预览 URL。
- 未通过检查的任务无法批准。
- 客户只能读取和操作自己的任务。
- 继续调整复用分支并使状态重新进入排队。
- 发布使用服务端记录的 SHA，不信任客户端 SHA。

### 工作流与端到端测试

- 云端任务能建立分支、修改、运行 lint/typecheck/test/build 并推送提交。
- 禁止文件和疑似 Secret 不能提交。
- 手机聊天页能显示状态变化和预览。
- 重复点击不会重复发布。
- 发布失败能够恢复旧版本。
- 正常聊天、记忆召回、知识导入和 DeepSeek 预览模式不受影响。

## 配置

应用服务端新增：

- `DEVELOPMENT_AGENT_ENABLED=false`：默认关闭，全部配置和真实联调通过后才开启。
- `GITHUB_REPOSITORY`
- `GITHUB_APP_ID`、`GITHUB_APP_INSTALLATION_ID`、`GITHUB_APP_PRIVATE_KEY`
- `DEVELOPMENT_CALLBACK_SECRET`
- `DEVELOPMENT_APPROVAL_SECRET`
- `DEVELOPMENT_TASK_MAX_MINUTES`

GitHub Actions 使用仓库或 Environment Secrets 保存 OpenAI 和部署凭证。任何配置缺失时，普通聊天仍可用；修改请求由 Jeffrey 明确提示“云端修改功能尚未配置”，不得悄悄模拟成功。

## 分阶段交付

### 阶段一：任务骨架与安全状态机

数据库、Repository、任务 API、回调签名、一次性确认、任务卡和内存测试 Adapter。使用假 Runner 验证完整 UI 流程，不执行真实代码。

### 阶段二：GitHub 私有仓库预览

接入 GitHub App/Actions、真实编码代理、分支、测试、差异扫描和预览部署。仍不开放正式发布。

### 阶段三：受保护发布与回滚

接入生产 Environment、确认发布、健康检查、自动回滚和审计。通过真实端到端演练后才将 `DEVELOPMENT_AGENT_ENABLED` 打开。

分阶段不是降低最终功能，而是保证在生产发布凭证进入系统之前，身份、状态机、回调和预览链已经验证。

## 本规格不包含

- 让 Jeffrey 普通聊天模型直接获得 Shell 或 GitHub 工具。
- 从知识库自动生成开发任务。
- 无客户确认的生产发布。
- 修改客户手机或电脑中其他应用。
- 多用户协作审批、团队角色和计费系统。
- 自动购买云服务、域名或第三方订阅。

这些能力若以后需要，必须单独设计和批准，不能通过放宽本规格的安全边界顺带实现。
