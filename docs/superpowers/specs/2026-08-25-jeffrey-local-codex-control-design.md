# Jeffrey 调用本地 macOS Codex 设计

日期：2026-08-25  
状态：已批准

## 目标

客户可以在 Jeffrey 私人 PWA 的现有聊天界面中，直接用自然语言要求自己唯一配对的一台 Mac 完成文件、代码、终端、浏览器和常用应用操作。任务由 Mac 上常驻的 Jeffrey Local 转交给客户已经登录的本地 Codex；实际电脑能力、Skill、沙箱、批准和 macOS 系统权限继续由本地 Codex 与 macOS 控制。

客户不需要输入固定口令或进入单独的“电脑模式”。系统只把客户当前亲自发送、通过私人身份验证的消息作为本地电脑任务候选。普通聊天、App 云端修改、长期记忆、Obsidian 知识、Jeffrey 回复、网页正文、回调和主动消息均不能自行触发本地电脑操作。

## 已确认选择

- 首版只支持 macOS，并且只绑定一台私人 Mac。
- 支持接近完整的本地电脑操作，但保留分级确认和永久禁止项。
- Mac 安装并常驻轻量的 Jeffrey Local，登录后自动运行。
- Jeffrey Local 复用客户本地 Codex 的 Computer Use Skill、沙箱、文件权限和 macOS 自动化权限。
- Codex 接入采用 Codex App Server；App Server 只监听回环地址，不暴露到互联网。
- Mac 主动连接 Jeffrey 后端，客户路由器不开放入站端口。
- 客户可以在 iPhone PWA 中批准、拒绝、取消或解除设备配对。
- 功能默认关闭，完成真实 Mac 联调后才启用。

OpenAI 官方将 Codex App Server 定义为用于产品深度集成的接口，提供认证、会话历史、批准和流式代理事件，符合本设计需要。远程接入必须使用认证与 TLS；本设计进一步把 App Server 限制在 Mac 本机，仅由 Jeffrey Local 访问。

参考：

- [Codex App Server](https://developers.openai.com/codex/app-server)
- [Codex cloud](https://developers.openai.com/codex/cloud)
- [OpenAI 模型授权边界建议](https://developers.openai.com/api/docs/guides/latest-model)

## 非目标

- 不允许互联网直接访问客户 Mac 上的 Codex App Server。
- 不让 Jeffrey 的普通人格模型获得原始 Shell、AppleScript 或 Computer Use 工具。
- 不允许知识库、Memory、AI 回复、主动消息、网页提示或文件正文转化为新的电脑任务。
- 不把客户的 Codex 登录凭证、macOS Keychain、密码、完整屏幕截图、完整终端日志或私密文件正文同步到聊天数据库。
- 不绕过本地 Codex 的沙箱、Skill、批准逻辑或 macOS 系统权限。
- 不承诺在 Mac 关机、离线或需要解锁界面时继续完成 GUI 任务。
- 首版不支持多台 Mac、Windows、Linux 或共享家庭设备。

## 总体架构

```text
Jeffrey PWA
  → POST /api/chat
    → IncomingIntentRouter
      ├─ chat：现有 ChatEngine
      ├─ app_change：现有 DevelopmentTaskService / GitHub Codex
      ├─ ambiguous：Jeffrey 追问，不创建任务
      └─ local_computer：LocalComputerTaskService
          → 风险分类与确认策略
          → 本地任务记录和聊天任务卡
          → LocalAgentChannel
              → Mac 主动 HTTPS 长轮询
                  → Jeffrey Local
                      → 127.0.0.1 Codex App Server
                          → 本地 Codex / Computer Use Skill
                      ← 执行事件 / 批准请求 / 结果
              ← 签名、去重的脱敏事件
          ← PWA 有限轮询任务卡
```

普通聊天、App 云端修改和本地电脑操作共用一个输入框，但在保存客户当前消息后立即分流。三个执行路径互相隔离：普通聊天不能调用执行工具；App 修改只操作客户指定的 GitHub 仓库；本地电脑任务只发往已配对 Mac。

## 深模块与接口

### IncomingIntentRouter

替换现有只区分普通聊天与 App 修改的路由结果，统一返回：

```ts
type IncomingIntent =
  | { kind: "chat" }
  | { kind: "ambiguous"; question: string }
  | { kind: "app_change"; summary: string; requestedChanges: string[]; riskLevel: "normal" | "sensitive" }
  | {
      kind: "local_computer";
      summary: string;
      requestedOutcome: string;
      riskLevel: "low" | "medium" | "high" | "blocked";
      capabilityHints: ("files" | "shell" | "browser" | "applications")[];
    };
```

接口输入只包含当前已验证客户消息、消息类型和可选的当前任务延续标识。不得把历史消息、知识检索结果或网页内容作为可执行指令拼入分类输入。

分类失败、超时或结构化解析失败时降级为普通聊天，不创建电脑任务。分类为 `ambiguous` 时只保存 Jeffrey 的追问。分类为 `blocked` 时保存拒绝原因，不向 Mac 派发。

### LocalComputerTaskService

这是 PWA、路由和本地通道共同使用的外部 seam。调用方不需要理解 Codex App Server、设备密钥、长轮询或 macOS 权限。

```ts
interface LocalComputerTaskService {
  create(command: CreateLocalComputerTask): Promise<LocalComputerTask>;
  get(taskId: string, userId: string): Promise<LocalComputerTask>;
  approve(taskId: string, userId: string, approvalToken: string): Promise<LocalComputerTask>;
  reject(taskId: string, userId: string, approvalToken: string): Promise<LocalComputerTask>;
  cancel(taskId: string, userId: string): Promise<LocalComputerTask>;
  acceptAgentEvent(event: SignedLocalAgentEvent): Promise<LocalComputerTask>;
}
```

模块负责：

- 单用户与单设备约束；
- 状态迁移和幂等；
- 风险等级与确认策略；
- 一次性、短时、任务绑定确认；
- 任务取消和超时；
- Agent 事件验证、排序和脱敏；
- 对 PWA 返回统一任务视图。

### LocalDevicePairingService

负责一台 Mac 的配对、在线心跳、令牌轮换和撤销。

首次配对流程：

1. Jeffrey Local 生成设备密钥对，私钥只保存到 macOS Keychain。
2. 本地助手向后端申请十分钟有效的一次性配对码。
3. 客户在已登录私人 PWA 中输入或扫描配对码。
4. 后端将当前 `PRIVATE_USER_ID`、设备公钥与随机设备 ID 绑定。
5. 后端签发可轮换的短期设备会话，服务端只保存令牌哈希和公钥。
6. 新配对会自动撤销旧设备；首版始终最多一台活跃 Mac。

解除配对会撤销设备会话、取消未完成任务并记录审计事件。恢复连接必须重新配对，不能仅凭旧设备 ID 恢复。

### LocalAgentChannel

首版 Adapter 使用 Mac 主动发起的认证 HTTPS 长轮询：

- `claimNextTask` 一次最多领取一个满足条件的任务；
- 领取记录包含租约和幂等键；
- 任务事件使用单调序号，后端拒绝乱序、重复和跳跃事件；
- Mac 定期发送脱敏心跳，PWA 只显示在线、离线、锁屏等待或 Codex 未就绪；
- 网络断开后只能继续已领取的相同任务，不能自行领取新任务；
- 未来可增加 WebSocket Adapter，但不改变 TaskService 接口。

所有请求使用 TLS、短期设备会话、请求时间戳、随机 nonce 和设备签名。服务端校验新鲜窗口并拒绝重放。

### Jeffrey Local

Jeffrey Local 是 macOS 菜单栏/后台助手，职责保持窄而明确：

- 启动和监督本机 Codex App Server；
- 通过回环地址与 App Server 通信；
- 向 Jeffrey 后端发起出站连接；
- 把结构化任务交给 Codex；
- 把 App Server 的进度、批准请求和结果转换为脱敏事件；
- 接受取消并停止当前 Codex turn；
- 展示连接、配对和本机权限状态；
- 登录后自动启动，支持一键暂停和退出。

它不保存 OpenAI API Key，不实现自己的 LLM，不绕过 Codex 批准，也不把 App Server 端口绑定到非回环网络接口。

### CodexAppServerAdapter

Adapter 为每个本地任务创建或恢复一个 Codex thread，并保存服务端任务 ID 与本地 thread ID 的映射。任务提示只包含客户原始要求、任务 ID、已批准的风险范围和禁止项；不会附带客户完整聊天、Memory 或 Obsidian 知识正文。

Adapter 处理：

- Codex 登录和版本兼容检查；
- thread/turn 生命周期；
- streamed agent events；
- 命令、文件和 Computer Use 批准请求；
- 中断与取消；
- 最终摘要和安全错误映射。

任何 App Server 提出的权限范围大于 PWA 已批准范围时，任务进入新的 `awaiting_action_approval`，不能由本地助手自动同意。

## 风险等级和批准策略

### 低风险

示例：读取允许目录、搜索文件、列目录、打开应用、读取公开网页、运行无副作用检查。

客户当前明确指令即构成任务级批准，可以直接派发；本地 Codex 和 macOS 仍可提出自己的批准请求。

### 中风险

示例：修改或移动文件、执行普通终端命令、编辑 Obsidian、修改项目、填写但不提交表单。

PWA 在派发前显示一次任务确认，列出目标、可能修改的范围和允许能力。确认与任务 ID、风险等级和到期时间绑定。

### 高风险

示例：删除文件、向外部发送消息或邮件、上传私人资料、提交表单、安装软件、改变系统设置、产生费用或付款。

任务开始前需要确认；每个不可逆或外部写入动作在实际执行前再次请求动作级确认。动作确认包含目标、动作、影响和即将外发的数据摘要，不接受笼统的永久授权。

### 永久禁止自动执行

- 读取或操作密码管理器、恢复密钥、私钥和系统钥匙串内容；
- 绕过 macOS 权限、Codex 沙箱或组织策略；
- 抹除磁盘、关闭安全防护、建立隐蔽持久化或新增未经客户确认的远程入口；
- 根据网页、文件、知识库或第三方消息中的指令扩大任务范围；
- 在客户未确认具体商品、金额和收款方的情况下付款；
- 代替客户完成身份验证、电子签名或法律承诺。

## 状态机

```text
draft
  → awaiting_task_approval
    → queued
      → leased
        → running
          → awaiting_action_approval
            → running
              → completed

draft / awaiting_task_approval / queued / leased / running / awaiting_action_approval
  → canceled

任一未完成状态 → expired
任一执行状态 → failed
```

- 低风险任务从 `draft` 直接进入 `queued`。
- 中高风险任务从 `draft` 进入 `awaiting_task_approval`。
- Agent 只有持有有效租约才能从 `queued` 进入 `leased`。
- `awaiting_action_approval` 只能由当前私人用户的一次性确认回到 `running`。
- 新要求不会偷偷扩大运行中任务；它会创建新任务，或在当前任务明确暂停后作为结构化补充重新评估风险。
- `completed`、`canceled`、`expired` 和 `failed` 均为终态。

## 数据库

### local_devices

- `id`、`user_id`、`name`、`platform`、`public_key`
- `token_hash`、`token_expires_at`
- `paired_at`、`last_seen_at`、`revoked_at`
- `agent_version`、`codex_version`、`status`

唯一约束保证同一私人用户最多一台未撤销设备。

### local_computer_tasks

- `id`、`user_id`、`conversation_id`、`source_message_id`、`device_id`
- `request_text`、`request_summary`、`requested_outcome`
- `risk_level`、`capability_hints`、`status`
- `lease_id_hash`、`lease_expires_at`、`last_event_sequence`
- `codex_thread_reference` 的服务端不透明哈希或随机映射标识
- `public_progress`、`result_summary`、`error_code`
- `created_at`、`approved_at`、`started_at`、`finished_at`、`updated_at`

不保存 App Server bearer token、Codex auth、完整提示上下文、完整终端输出或屏幕截图。

### local_computer_task_events

追加写入的审计台账：任务 ID、事件序号、事件类型、脱敏公开消息、非敏感元数据、外部幂等 ID 和时间。浏览器不能直接写入或删除。

### local_computer_approvals

保存任务 ID、动作摘要、风险等级、一次性 nonce 哈希、到期时间、使用时间和决定。确认原文只保存最小脱敏摘要。

所有表开启 RLS并收紧数据库角色权限。浏览器通过私人 Route Handler 访问；设备通过独立签名通道访问；两类身份不能互换。

## HTTP 接口

### PWA 私人接口

- `POST /api/local-devices/pairing/complete`
- `GET /api/local-devices/current`
- `POST /api/local-devices/current/revoke`
- `GET /api/local-computer/tasks/active`
- `GET /api/local-computer/tasks/[id]`
- `POST /api/local-computer/tasks/[id]/approve`
- `POST /api/local-computer/tasks/[id]/reject`
- `POST /api/local-computer/tasks/[id]/cancel`

所有接口绑定 `PRIVATE_USER_ID`，任务 ID 与用户 ID 同时约束。批准接口只接受后端生成的一次性确认值，不接受客户端提供的风险等级、设备 ID或状态。

### 本地设备接口

- `POST /api/local-agent/pairing/start`
- `POST /api/local-agent/session/refresh`
- `POST /api/local-agent/heartbeat`
- `POST /api/local-agent/tasks/claim`
- `POST /api/local-agent/tasks/[id]/events`
- `POST /api/local-agent/tasks/[id]/complete`

设备接口使用设备签名、时间戳和 nonce；服务端响应只返回该设备已获批准且可领取的最小任务内容。

## PWA 体验

聊天输入框不增加模式开关。本地任务显示为 Jeffrey 消息下方的任务卡：

```text
正在理解
→ 等待确认
→ 正在连接 Mac
→ Codex 执行中
→ 等待关键操作确认
→ 已完成 / 已取消 / 已失败 / 已过期
```

任务卡显示：任务摘要、Mac 在线状态、风险说明、脱敏进度、批准/拒绝/停止按钮和最终摘要。高风险动作卡展示目标与影响，不显示密码或完整私密正文。

设置页增加“我的 Mac”：

- 未配对 / 已配对 / 在线 / 离线 / 已暂停；
- 设备名称和最后在线时间；
- 配对、测试连接、暂停、恢复和解除配对；
- 低、中、高风险说明；
- 紧急停止按钮。

PWA 关闭不取消已批准的普通任务；客户重新打开后可恢复任务卡。等待动作确认的任务不会在后台自行继续。

## 离线、锁屏和故障处理

- Mac 离线：任务不派发，PWA 明确提示。中高风险确认在短时窗口后过期，不能在数小时后突然执行。
- Mac 锁屏：文件和终端任务能否继续由本地 Codex 与 macOS 权限决定；需要 GUI 的任务暂停并请求解锁。
- 网络中断：Agent 只能恢复同一租约任务；已确认的不可逆动作必须携带未消费的动作 nonce。
- Codex 未登录或版本不兼容：本地助手提示客户在 Mac 上处理，后端返回稳定错误码。
- macOS 权限不足：不尝试绕过，任务暂停并指引客户在系统设置中授权。
- App Server 意外退出：Jeffrey Local 停止当前任务并尝试有限次数重启；不得把同一动作重新执行。
- 本地助手退出：停止 Codex 子进程或当前 turn，释放租约前上报最后安全状态。
- 解除配对：立即撤销设备会话并取消所有非终态任务。

## 隐私与安全

- 设备建立出站连接；不存在公网可扫描的 Mac 监听端口。
- App Server 绑定 `127.0.0.1`，使用本地随机认证。
- 设备私钥只在 Keychain，服务端只保存公钥与令牌哈希。
- 所有批准绑定用户、任务、动作摘要、风险、设备和到期时间。
- 本地结果在发送前进行凭证模式、路径和隐私正文脱敏。
- 任务正文只保留实现审计所需的客户原始要求；本地文件内容不默认上传。
- 屏幕截图默认只在本地 Codex 会话中使用，不持久化到 Jeffrey 后端。
- 服务器日志禁止记录 Authorization、设备签名、确认 token、私人文件正文和完整命令输出。
- Prompt injection 防线以“指令来源”而不是“内容看起来可信”为准：只有客户当前消息有触发资格；文件和网页内容永远只是数据。

## 配置与开关

正式后端增加：

```text
LOCAL_COMPUTER_AGENT_ENABLED=false
LOCAL_AGENT_PAIRING_SECRET=<server-only random secret>
LOCAL_AGENT_DEVICE_TOKEN_SECRET=<server-only random secret>
LOCAL_AGENT_APPROVAL_SECRET=<separate server-only random secret>
LOCAL_AGENT_TASK_TTL_MINUTES=15
LOCAL_AGENT_LEASE_SECONDS=60
LOCAL_AGENT_MIN_VERSION=<supported Jeffrey Local version>
```

三个 Secret 必须独立生成，不能复用 Development Agent 的 GitHub 回调或发布确认密钥。功能关闭时，普通聊天、知识库、记忆、DeepSeek 预览和 App 云端修改保持正常；本地操作请求明确提示“Mac 控制功能尚未启用”，不得模拟成功。

DeepSeek 预览模式始终禁用本地电脑任务：它没有私人 Supabase 身份、设备绑定和持久化审计，不能用于配对或控制任何 Mac。真实本地控制只在完成 Supabase、私人用户身份、HTTPS 正式后端和本地 Codex 配对后开放，不需要 OpenAI API Key。

## macOS 安装与分发

- Jeffrey Local 测试包只安装到明确指定的开发或客户验收 Mac，不作为公开下载发布。
- 本项目是一位客户、一台私人 Mac 的定向交付，允许使用客户已验收的未签名本地构建，不要求 Apple Developer ID 或公证。
- 首次打开由客户在 macOS“隐私与安全性”中手动确认允许，不关闭 Gatekeeper；签名与公证仅作为减少安装提示的可选升级。
- 安装向导负责安装应用、注册登录启动项、检查 Codex、打开所需的 macOS 权限页面并完成配对。
- 卸载流程会删除登录启动项、撤销设备配对并移除本地运行状态；客户的 Codex、项目文件和 Obsidian 数据不删除。
- 首版不做静默自动更新。新版本先展示版本说明并由客户确认安装；服务端可以通过 `LOCAL_AGENT_MIN_VERSION` 拒绝存在安全问题的旧版本继续领取新任务。
- 是否完成正式交付以真实 Mac 验收、配对和安全检查为准，不以 Apple 签名或公证为前置条件。

## 测试

### 单元测试

- 四路意图分流与失败降级；
- 风险分类、永久禁止项与确认策略；
- 状态机允许/拒绝的每条迁移；
- 配对码一次性和单设备约束；
- 确认 token 绑定、过期与消费；
- 设备签名、nonce、新鲜窗口和重放防护；
- 租约、事件序号、幂等与取消；
- 结果脱敏和稳定错误映射。

### 集成测试

- 使用内存 Repository 和 Fake CodexAppServerAdapter 完成端到端任务；
- Mac 离线、恢复、租约过期和重复领取；
- 中途权限升级进入动作级确认；
- 取消传播到本地 Codex；
- 本地助手和 App Server异常退出；
- PWA 恢复活跃任务卡；
- App 修改任务与本地任务互不串路。

### 安全测试

- 知识库、Memory、assistant/system 消息、网页和文件正文不能触发；
- 伪造设备、跨用户任务 ID、过期 token、乱序事件和重放被拒绝；
- App Server 非回环绑定启动失败；
- 高风险动作没有动作 nonce 时不能继续；
- 数据库、HTTP 错误和日志不泄露私密内容或凭证。

### 真实 macOS 验收

- 搜索和整理隔离测试目录；
- 修改测试项目并执行检查；
- 打开 Obsidian 与浏览器；
- 填写测试表单并在提交前暂停；
- 准备测试邮件并在发送前暂停；
- 测试允许、拒绝、过期、取消、锁屏、离线和解除配对；
- 验证客户现有 Computer Use Skill、Codex 批准和 macOS 权限仍生效。

## 分阶段启用

1. 数据库 Migration 和后端接口上线，但保持开关关闭。
2. 构建 Jeffrey Local 与 Fake App Server 联调。
3. 在开发 Mac 上连接真实 Codex App Server，只测试隔离目录。
4. 验证单设备配对、离线、锁屏、取消和紧急撤销。
5. 依次启用低风险、中风险和高风险测试任务。
6. 客户在自己的 Mac 登录 Codex、安装 Jeffrey Local，并亲自授予系统权限。
7. 客户用 iPhone 配对并完成验收清单。
8. 验收通过后才设置 `LOCAL_COMPUTER_AGENT_ENABLED=true` 和登录自启动。

## 客户交付要求

客户只需要：

- 一台受支持的 Mac；
- 已安装并登录的 Codex；
- 安装 Jeffrey Local；
- 按需授予 macOS 文件、辅助功能、屏幕录制和自动化权限；
- 用 iPhone PWA 完成一次配对；
- 对中高风险任务和关键动作亲自确认。

客户不需要开放路由器端口、把 Codex 登录凭证交给开发者、把 Mac 密码上传到服务器或自行配置 App Server 网络服务。

## 验收标准

- 客户能在 Jeffrey 普通聊天输入框发出本地电脑要求，无需固定口令。
- 唯一配对 Mac 在线时，任务能调用本地 Codex并把脱敏进度返回原聊天。
- 低、中、高风险任务严格遵循已批准的分级确认规则。
- 普通聊天、App 云端修改、知识库、记忆、AI 回复和网页内容不能越权触发。
- Mac 离线、锁屏、Codex未登录或权限不足时不会伪造成功或绕过限制。
- 客户可以从 iPhone 停止任务、拒绝动作、暂停本地控制并紧急解除配对。
- 本地 Codex 的 Computer Use Skill、沙箱、批准和 macOS 权限保持最终执行控制权。
- 所有自动测试通过，真实 macOS 验收清单完成后功能才允许正式启用。
