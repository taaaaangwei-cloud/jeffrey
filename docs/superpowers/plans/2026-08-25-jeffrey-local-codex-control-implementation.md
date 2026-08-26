# Jeffrey 调用本地 macOS Codex 实施计划

日期：2026-08-25

设计依据：[Jeffrey 调用本地 macOS Codex 设计](../specs/2026-08-25-jeffrey-local-codex-control-design.md)

## 结论与范围

本计划实现客户在 Jeffrey 私人 PWA 的普通聊天输入框中提出本地电脑要求，由唯一配对的一台 Mac 上的 Jeffrey Local 调用客户已经登录的 Codex App Server，并把任务状态、批准请求和脱敏结果返回原聊天。

实施包含四条纵向链路：

1. 统一消息意图路由，把普通聊天、App 云端修改、本地电脑任务和追问分开；
2. Supabase 中的设备配对、任务、事件、批准、租约和状态机；
3. PWA 的 Mac 设置、任务卡、分级确认、取消和紧急撤销；
4. macOS Jeffrey Local、Keychain、出站连接、Codex App Server Adapter、登录启动和安装包。

本计划不实现多 Mac、Windows/Linux、绕过 Codex批准、绕过 macOS权限、无确认高风险操作、主动消息触发电脑任务或 DeepSeek 预览控制 Mac。

## 当前基线与工作树保护

仓库已经包含 Jeffrey 正式聊天、DeepSeek 预览、Supabase/pgvector/Obsidian 记忆链和 App 云端修改链。当前工作树存在尚未整体提交的历史实现改动；实施不能还原、覆盖或顺带提交这些改动。

执行规则：

- 任务 0 重新运行 lint、typecheck、unit tests、build 和 rendered HTML，记录真实基线；
- 每个任务只暂存计划明确列出的文件，提交前运行 `git diff --cached --name-only`；
- 修改现有文件前先查看未提交差异并做语义合并；
- 不使用 `git reset --hard`、`git checkout --` 或其他破坏性恢复；
- 正式 Supabase/真实 Mac 联调缺少客户权限时，使用 Adapter 和假实现完成可验证部分，并把外部联调明确标为未完成；不需要 OpenAI API Key。

## 已批准的测试 seam

实施采用纵向 TDD。测试只跨公开 interface seam：

1. `IncomingMessageEngine.send`：验证一条客户消息只保存一次，并路由到聊天、App 修改、追问或本地任务；
2. `IncomingIntentModel.classify`：验证严格结构化四路结果；OpenAI Adapter 使用契约测试；
3. `LocalComputerTaskService`：验证创建、批准、领取、事件、动作确认、完成、取消、过期和撤销；
4. `LocalDevicePairingService`：验证单设备、一次性配对、会话轮换、心跳和撤销；
5. `LocalAgentChannel`：验证签名、nonce、事件序号、租约和幂等；
6. Route Handler：验证私人用户或设备身份、输入校验、稳定错误和脱敏输出；
7. PWA 任务卡与设备设置：通过可访问文本、按钮状态和用户动作验证；
8. `CodexAppServerAdapter`：使用假 WebSocket/App Server 做协议契约测试；真实 Codex 只用于受控 macOS 验收；
9. Jeffrey Local：Swift 单元测试覆盖 Keychain Adapter 之外的状态、签名、长轮询、事件转换和取消；系统能力使用可替换 Adapter。

不测试私有函数，不依赖实现内部变量，不用只匹配 SQL 字符串的脆弱测试证明数据库安全。

## 实施顺序

### 任务 0：保护工作树并记录基线

操作：

1. 记录当前 HEAD 和 `git status --short`。
2. 保存将修改的现有文件差异：`app/page.tsx`、`app/globals.css`、`app/api/chat/route.ts`、`lib/chat/incoming-message-engine.ts`、`lib/server/dependencies.ts`、`lib/config/server.ts`、`.env.example`、`README.md` 和 `package.json`。
3. 运行：

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run build
node --test tests/rendered-html.test.mjs
```

4. 如果基线失败，只记录和诊断，不把无关修复混入本功能。

验收：现有改动未丢失，基线结果有明确记录。

### 任务 1：建立本地任务领域类型与状态机

新增：

- `lib/local-computer/types.ts`
- `lib/local-computer/state-machine.ts`
- `tests/local-computer-state-machine.test.ts`

先写失败测试：

- 低风险 `draft → queued`；
- 中高风险 `draft → awaiting_task_approval → queued`；
- `queued → leased → running → completed`；
- `running → awaiting_action_approval → running`；
- 各未完成状态到 `canceled`、`expired` 或 `failed`；
- 拒绝越级、终态恢复、无确认继续和未知状态。

实现：

- `LocalComputerTaskStatus`、`LocalRiskLevel`、`LocalCapabilityHint`；
- `LocalComputerTask`、`LocalComputerTaskEvent`、`LocalComputerApproval`、`LocalDevice`；
- `assertLocalComputerTransition(from, to)`；
- 只包含脱敏字段的 `PublicLocalComputerTask` 和 `PublicLocalDevice`。

验证：

```bash
npm run test:unit -- tests/local-computer-state-machine.test.ts
```

提交建议：`Add local computer task state machine`

### 任务 2：建立 Repository 和 Supabase Migration

新增：

- `lib/local-computer/repository.ts`
- `lib/local-computer/memory-repository.ts`
- `lib/local-computer/supabase-repository.ts`
- `supabase/migrations/20260825230000_local_computer_agent.sql`
- `tests/local-computer-repository.test.ts`

先写失败测试：

- 用户查询必须同时匹配任务 ID 与私人用户 ID；
- 单用户最多一台未撤销设备；
- 创建任务和首个事件原子写入；
- 状态、事件序号和租约原子更新；
- 重复外部事件 ID 不重复追加；
- 同一设备同时最多一个有效领取租约；
- 撤销设备原子取消其全部非终态任务；
- 确认 nonce 只保存哈希并且只能消费一次。

Migration：

- 创建 `local_devices`、`local_computer_tasks`、`local_computer_task_events`、`local_computer_approvals`；
- 添加状态、风险、序号、过期时间和单设备约束；
- 建立领取任务、原子迁移、追加事件、消费确认和撤销设备 RPC；
- 开启 RLS，撤销 Anon/Authenticated 直接表权限；
- Service Role仍需显式传入固定私人用户 ID；设备不直接连接数据库。

外部验证：在隔离 Supabase 测试项目执行全部 Migration；Anon/Auth 不能直接读取表，Service Role 的跨用户查询返回空。

提交建议：`Persist local devices and computer tasks`

### 任务 3：实现风险策略和批准令牌

新增：

- `lib/local-computer/risk-policy.ts`
- `lib/local-computer/approval.ts`
- `tests/local-computer-risk-policy.test.ts`
- `tests/local-computer-approval.test.ts`

先写失败测试：

- 读取、搜索、打开等低风险任务不需要额外任务确认；
- 修改文件、运行普通命令需要任务级确认；
- 删除、发送、上传、安装、提交和付款需要任务级与动作级确认；
- 密码管理器、恢复密钥、磁盘抹除、关闭安全防护、建立隐蔽远程入口返回 `blocked`；
- App Server 请求范围大于已批准范围时升级到动作级确认；
- token 绑定 user/task/device/action/risk/expiry，过期、篡改、重复消费均失败。

实现：

- 集中式风险规则，不把安全逻辑散落在 Route 或 UI；
- HMAC Secret 与 Development Agent 确认 Secret 分离；
- 恒定时间比较、Web Crypto 和稳定错误码；
- 公开确认视图只显示目标、动作、影响和脱敏外发摘要。

提交建议：`Enforce local computer approval policy`

### 任务 4：实现设备签名、配对和会话

新增：

- `lib/local-computer/device-auth.ts`
- `lib/local-computer/pairing-service.ts`
- `lib/local-computer/device-session.ts`
- `tests/local-device-auth.test.ts`
- `tests/local-device-pairing.test.ts`

先写失败测试：

- P-256 设备公钥签名验证；
- 请求时间戳过旧、nonce 重放、签名错误和已撤销设备被拒绝；
- 配对码十分钟过期且只能完成一次；
- 完成新配对会撤销旧设备；
- 短期设备会话可以轮换，旧会话失效；
- 心跳只能更新自己的设备，不接受客户端伪造用户 ID。

实现：

- P-256 ECDSA 作为 CryptoKit 与 Web Crypto 共同支持的设备签名算法；
- 服务端配对 HMAC、设备会话签发和 token 哈希；
- `LocalDevicePairingService` 隐藏 Repository、签名和会话细节；
- 设备私钥从不进入后端接口。

提交建议：`Pair one signed local Mac device`

### 任务 5：建立本地任务深模块与 Agent 通道

新增：

- `lib/local-computer/service.ts`
- `lib/local-computer/agent-channel.ts`
- `lib/local-computer/recording-agent-channel.ts`
- `tests/local-computer-task-service.test.ts`
- `tests/local-agent-channel.test.ts`

先写失败测试：

- 创建低风险任务直接排队；中高风险任务等待确认；
- Mac 离线时任务不伪造派发成功；
- 一个设备一次领取一个任务并获得短租约；
- 租约过期可以安全恢复，但已消费动作不能重复；
- 事件严格按序、幂等追加；
- 高风险 App Server 批准请求暂停任务；
- PWA 批准后只继续相同任务和相同动作；
- 取消传播给 Agent；解除设备取消全部未完成任务；
- 公开结果经过脱敏，内部日志不返回前端。

实现：

- `LocalComputerTaskService` 作为统一外部 interface；
- `LocalAgentChannel` 仅暴露领取、事件、完成、失败、取消确认所需操作；
- Recording Adapter 用于测试；生产 Adapter 使用 Repository 长轮询语义；
- TTL、租约和事件序号集中处理。

提交建议：`Orchestrate local computer tasks`

### 任务 6：把消息意图升级为统一四路路由

新增：

- `lib/chat/incoming-intent-model.ts`
- `lib/chat/openai-incoming-intent-model.ts`
- `tests/openai-incoming-intent-model.test.ts`

修改：

- `app/api/chat/route.ts`
- `lib/chat/incoming-message-engine.ts`
- `lib/development/intent-model.ts`
- `lib/development/openai-intent-model.ts`
- `lib/development/intent-router.ts`
- `tests/incoming-message-engine.test.ts`
- `tests/development-intent-router.test.ts`
- `tests/openai-development-intent.test.ts`

先写失败测试：

- “今天好累”只进入普通聊天；
- “把聊天背景改成深色”进入 App 云端修改；
- “找一下桌面上的合同”进入低风险本地任务；
- “删除下载目录的旧文件”进入高风险本地任务；
- “帮我处理一下电脑”返回追问；
- 文件、图片、音频、assistant/system、Memory、Knowledge、网页内容不能触发；
- 分类失败降级普通聊天；
- 无本地设备或功能关闭时保存明确 Jeffrey 提示，不模拟成功；
- 每条客户原文只保存一次。

实现：

- 用一个 `IncomingIntentModel` 完成四路分类，避免串行调用两个模型；
- 保留 Development Intent 兼容 Adapter，逐步迁移现有测试和调用方；
- 当前私人用户文本是唯一有触发资格的来源；
- `IncomingMessageEngine` 只负责编排，执行由两个 TaskService 分开承担。

提交建议：`Route chat to cloud or local Codex safely`

### 任务 7：增加后端配置和依赖装配

修改：

- `.env.example`
- `lib/config/server.ts`
- `lib/server/dependencies.ts`
- `app/api/config/status/route.ts`
- `tests/server-config.test.ts`

先写失败测试：

- 默认 `LOCAL_COMPUTER_AGENT_ENABLED=false`；
- 启用但缺少三个独立 Secret 时配置无效；
- Secret 不能等于 Development Agent Secret；
- TTL、租约和最低版本边界校验；
- DeepSeek 预览始终返回本地控制禁用；
- 配置状态只返回 enabled/configured/deviceStatus，不返回 Secret。

实现：

- 解析批准规格中的全部环境变量；
- 装配 Supabase Repository、TaskService、PairingService 与统一 Intent Model；
- 功能关闭时使用拒绝派发 Adapter，而不是空引用或模拟成功。

提交建议：`Configure local Codex control safely`

### 任务 8：实现私人 PWA Route Handlers

新增：

- `app/api/local-devices/pairing/complete/route.ts`
- `app/api/local-devices/current/route.ts`
- `app/api/local-devices/current/revoke/route.ts`
- `app/api/local-computer/tasks/active/route.ts`
- `app/api/local-computer/tasks/[id]/route.ts`
- `app/api/local-computer/tasks/[id]/approve/route.ts`
- `app/api/local-computer/tasks/[id]/reject/route.ts`
- `app/api/local-computer/tasks/[id]/cancel/route.ts`
- `tests/local-computer-private-routes.test.ts`

先写失败测试：

- 未认证、错误私人用户和跨用户任务均被拒绝；
- 配对完成不接受客户端提供 user ID；
- 批准不接受客户端提供状态、设备或风险等级；
- 确认过期、错误任务和重复确认返回稳定错误；
- 解除配对取消活跃任务；
- 响应不包含 token 哈希、公钥内部字段、原始日志或私密内容。

实现：

- 复用现有私人身份 helper 和 `ApiError`；
- Zod 校验最小输入；
- 所有逻辑委托给深模块，Route 不实现状态机。

提交建议：`Expose private local computer task routes`

### 任务 9：实现设备 Route Handlers

新增：

- `app/api/local-agent/pairing/start/route.ts`
- `app/api/local-agent/session/refresh/route.ts`
- `app/api/local-agent/heartbeat/route.ts`
- `app/api/local-agent/tasks/claim/route.ts`
- `app/api/local-agent/tasks/[id]/events/route.ts`
- `app/api/local-agent/tasks/[id]/complete/route.ts`
- `tests/local-agent-routes.test.ts`

先写失败测试：

- 除初始配对外的设备请求必须通过短期会话、签名、时间戳和 nonce；
- 领取只返回该设备、已批准、未过期的最小任务；
- 重放、乱序、跨设备、过期租约和伪造完成被拒绝；
- 设备不能设置任意公开状态或直接标记高风险动作已批准；
- 完成/失败结果先脱敏再保存。

实现：

- 统一 `authenticateLocalAgentRequest`；
- 初始配对端点限流并只签发短时、未绑定配对挑战；
- Agent 回调不复用 GitHub HMAC 通道。

提交建议：`Add authenticated local agent channel`

### 任务 10：在 PWA 增加本地任务卡

新增：

- `app/components/local-computer-task-card.tsx`
- `tests/local-computer-public-view.test.ts`

修改：

- `app/page.tsx`
- `app/globals.css`

先写失败测试：

- 每种任务状态映射为明确中文；
- 只有允许时显示批准、拒绝、停止按钮；
- 高风险动作显示目标、动作、影响和脱敏摘要；
- Mac 离线、锁屏等待、Codex未登录和权限不足可区分；
- 页面恢复后能加载活跃任务；
- 本地任务卡与 App 修改任务卡不会互相覆盖；
- 任务卡在 iPhone 小屏、safe area 和独立 PWA 中可用。

实现：

- 公共 presentation 函数集中状态文案；
- 活跃任务有限轮询并在终态停止；
- 客户动作调用私人 Route；
- 不在前端保存设备 Secret、确认 Secret 或完整任务日志。

提交建议：`Show local Codex tasks in Jeffrey chat`

### 任务 11：在设置页增加“我的 Mac”

新增：

- `app/components/local-device-settings.tsx`

修改：

- `app/page.tsx`
- `app/globals.css`

先写失败测试：

- 显示未配对、在线、离线、暂停和版本不兼容；
- 配对码输入有过期、格式和重复使用反馈；
- 一键测试连接；
- 暂停不解除配对；解除配对要求确认；
- 紧急停止会取消任务并撤销设备；
- DeepSeek 预览只显示“正式后端配置后可用”，不能配对。

实现：

- 设置页只消费公开设备视图；
- 配对成功后刷新状态并清空配对码；
- 风险等级说明与批准规则一致。

提交建议：`Manage the paired Mac from settings`

### 任务 12：建立 Jeffrey Local Swift 包和可替换 seam

新增：

- `apps/jeffrey-local/Package.swift`
- `apps/jeffrey-local/Sources/JeffreyLocal/App/JeffreyLocalApp.swift`
- `apps/jeffrey-local/Sources/JeffreyLocal/Domain/AgentState.swift`
- `apps/jeffrey-local/Sources/JeffreyLocal/Domain/TaskModels.swift`
- `apps/jeffrey-local/Sources/JeffreyLocal/Interfaces/BackendClient.swift`
- `apps/jeffrey-local/Sources/JeffreyLocal/Interfaces/CodexClient.swift`
- `apps/jeffrey-local/Sources/JeffreyLocal/Interfaces/SecureStore.swift`
- `apps/jeffrey-local/Tests/JeffreyLocalTests/AgentStateTests.swift`
- `apps/jeffrey-local/Tests/JeffreyLocalTests/TaskCoordinatorTests.swift`

先写失败测试：

- 未配对、离线、就绪、运行、等待批准、暂停和错误状态；
- 一个时刻只运行一个任务；
- 取消传播给 CodexClient；
- 后端断开后不领取新任务；
- 重启只能恢复同一租约，不重复已完成动作；
- 退出时停止当前 Codex turn。

实现：

- SwiftUI `MenuBarExtra` 与后台协调器；
- 依赖通过 interface 注入；
- 生产 Adapter 在后续任务接入；
- Swift 包不依赖 PWA Node 运行时。

验证：

```bash
cd apps/jeffrey-local
swift test
```

提交建议：`Add the Jeffrey Local macOS helper`

### 任务 13：实现 Keychain、设备签名和后端长轮询

新增：

- `apps/jeffrey-local/Sources/JeffreyLocal/Adapters/KeychainSecureStore.swift`
- `apps/jeffrey-local/Sources/JeffreyLocal/Adapters/P256DeviceIdentity.swift`
- `apps/jeffrey-local/Sources/JeffreyLocal/Adapters/HTTPBackendClient.swift`
- `apps/jeffrey-local/Sources/JeffreyLocal/Transport/SignedRequest.swift`
- `apps/jeffrey-local/Tests/JeffreyLocalTests/DeviceIdentityTests.swift`
- `apps/jeffrey-local/Tests/JeffreyLocalTests/SignedRequestTests.swift`
- `apps/jeffrey-local/Tests/JeffreyLocalTests/BackendClientTests.swift`

先写失败测试：

- 私钥生成后只通过 SecureStore读取；
- 签名规范与服务端测试向量一致；
- 每次请求使用新 nonce 和当前时间戳；
- 会话过期自动刷新一次，失败后停止领取；
- 长轮询取消、退避、离线恢复和服务端 TTL；
- 响应任务字段严格解码，未知能力不执行。

实现：

- Security.framework Keychain Adapter；
- CryptoKit P-256 签名；
- URLSession HTTPS 客户端和可取消长轮询；
- 配对、心跳、领取、事件、完成和会话刷新。

提交建议：`Connect Jeffrey Local to the private backend`

### 任务 14：实现 Codex App Server Adapter

新增：

- `apps/jeffrey-local/Sources/JeffreyLocal/Adapters/CodexAppServerClient.swift`
- `apps/jeffrey-local/Sources/JeffreyLocal/Codex/AppServerProcess.swift`
- `apps/jeffrey-local/Sources/JeffreyLocal/Codex/AppServerProtocol.swift`
- `apps/jeffrey-local/Sources/JeffreyLocal/Codex/EventRedactor.swift`
- `apps/jeffrey-local/Tests/JeffreyLocalTests/CodexAppServerClientTests.swift`
- `apps/jeffrey-local/Tests/JeffreyLocalTests/EventRedactorTests.swift`

先写失败测试：

- 只启动回环 WebSocket监听并使用随机本地认证；
- Codex 未安装、未登录、版本过低和启动失败映射稳定状态；
- 每个任务创建或恢复正确 thread/turn；
- streamed events 转为公开进度；
- command/file/computer 批准请求映射为动作级确认；
- 取消调用 turn interrupt；
- 凭证、完整路径、私密正文、截图和完整终端日志被脱敏；
- App Server 断开不会自动重做最后动作。

实现：

- `Process` 管理 `codex app-server` 生命周期；
- 监听地址强制 `127.0.0.1`，禁止 `0.0.0.0`、局域网地址和公网地址；
- 使用 App Server initialize、thread、turn、approval 和 interrupt 协议；
- 按官方协议版本做初始化协商并拒绝不兼容版本；
- 不自动同意超出 PWA 已批准能力的请求。

验证：

- Fake App Server 契约测试；
- 开发 Mac 上使用临时目录运行真实 Codex，只执行读取和无副作用命令；
- 不在自动测试中操作真实邮件、付款或生产文件。

提交建议：`Bridge Jeffrey Local to Codex App Server`

### 任务 15：串联任务协调、批准和结果回传

新增：

- `apps/jeffrey-local/Sources/JeffreyLocal/Domain/TaskCoordinator.swift`
- `apps/jeffrey-local/Sources/JeffreyLocal/Domain/ApprovalCoordinator.swift`
- `apps/jeffrey-local/Tests/JeffreyLocalTests/EndToEndCoordinatorTests.swift`

先写失败测试：

- 领取 → Codex turn → 进度 → 完成；
- App Server 批准 → PWA 动作卡 → 允许 → 继续；
- 拒绝、超时、取消和解除配对会中断；
- 锁屏 GUI 任务进入等待状态；
- 文件/终端任务是否继续完全尊重 Codex 与 macOS返回；
- 设备网络重连不重复动作；
- 后端拒绝事件时本地停止并显示安全错误。

实现：

- 协调器不包含网络、Keychain 或 App Server 细节；
- 用任务和动作 nonce 保证批准对应准确动作；
- 只回传脱敏事件与结果摘要。

提交建议：`Complete local Codex task coordination`

### 任务 16：登录启动、私人安装、卸载和可选签名流水线

新增：

- `apps/jeffrey-local/Resources/Info.plist`
- `apps/jeffrey-local/Sources/JeffreyLocal/App/LoginItemManager.swift`
- `scripts/local-agent/build-app.sh`
- `scripts/local-agent/install-test-build.sh`
- `scripts/local-agent/uninstall.sh`
- `scripts/local-agent/notarize-release.sh`
- `docs/operations/jeffrey-local-installation.md`

修改：

- `package.json`
- `.gitignore`

先验证：

- 测试安装只允许明确的构建目录和当前用户 Applications 目标；
- 卸载删除登录项和应用状态，但不删除 Codex、项目或 Obsidian；
- 登录启动可由菜单显式开关；
- 私人未签名构建可以安装到指定客户 Mac，并记录构建校验值；
- 首次打开由客户在 macOS 中手动允许，不要求关闭 Gatekeeper；
- 不做静默自动更新。

实现：

- Swift release build 组装 `.app` bundle；
- ServiceManagement 登录项；
- 可选的 Developer ID 签名、notarytool 提交和 staple，不作为私人交付阻塞项；
- 安全问题旧版本通过后端最低版本停止领取任务。

提交建议：`Package Jeffrey Local for private installation`

### 任务 17：完整安全回归与真实 macOS 验收

新增：

- `tests/local-computer-security.test.ts`
- `tests/local-computer-e2e.test.ts`
- `docs/operations/jeffrey-local-security-runbook.md`
- `docs/operations/jeffrey-local-acceptance-checklist.md`

自动验证：

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run build
node --test tests/rendered-html.test.mjs
cd apps/jeffrey-local && swift test
```

安全场景：

- assistant/system、Memory、Knowledge、网页、文件、图片和主动消息不能触发；
- 跨用户、跨设备、重放、乱序、过期、伪造完成和越级状态全部拒绝；
- 高风险动作没有精确动作确认不能继续；
- App Server 不能监听非回环地址；
- Mac 离线、Codex未登录、权限不足和版本不兼容不模拟成功；
- 日志、错误、数据库、PWA 和 Agent 事件不泄露凭证或私密正文；
- App 云端修改与本地电脑任务互不串路；
- DeepSeek 预览不能配对或控制 Mac。

真实 Mac 验收：

1. 配对唯一设备；
2. 搜索和整理隔离测试目录；
3. 修改测试项目并运行检查；
4. 打开 Obsidian 与浏览器；
5. 填写测试表单并在提交前暂停；
6. 准备测试邮件并在发送前暂停；
7. 验证允许、拒绝、过期、取消、锁屏、离线和紧急解除；
8. 验证本地 Computer Use Skill、Codex批准和 macOS权限继续有效。

只有自动验证全部通过、私人安装包校验完成、真实 Mac 验收完成，才把功能开关设置为 true；Apple 签名与公证不是前置条件。

提交建议：`Verify Jeffrey local Codex control end to end`

### 任务 18：更新交付文档和客户材料

修改：

- `README.md`
- `.env.example`
- `scripts/setup-jeffrey.sh`

新增：

- `docs/operations/jeffrey-local-customer-handoff.md`

文档必须明确：

- 客户需要一台 Mac、已登录 Codex、正式 Supabase/HTTPS 后端和一次 iPhone 配对；不需要 OpenAI API Key；
- 客户不提供 Mac 密码、Codex登录凭证或 Keychain 内容；
- DeepSeek 预览和 Fake App Server 不属于正式交付；指定客户真实验收通过的未签名本地构建可以正式交付；
- 如何暂停、取消、解除配对、卸载和轮换服务器 Secret；
- 如何检查审计、升级最低版本和应对设备丢失；
- App 云端修改、主动联系、Web Push、语音与本地电脑控制的完成状态分别说明，不能混为一谈。

最终验证：从干净依赖安装开始按文档完成一次测试部署和 Mac 测试安装。

提交建议：`Document Jeffrey Local operations and handoff`

## 实施里程碑

### 里程碑 A：后端可测试

完成任务 0–9。使用 Memory Repository 与 Recording/Fake Agent证明配对、任务、批准、租约、事件和私人接口正确；不需要真实 Mac 控制。

### 里程碑 B：PWA 可预览

完成任务 10–11。聊天界面可展示模拟本地任务、Mac 状态和确认卡；功能开关仍关闭，不宣称已经控制电脑。

### 里程碑 C：开发 Mac 可联调

完成任务 12–15。在隔离目录使用真实 Codex App Server完成低风险与中风险任务；高风险只走到确认，不执行真实外发或付款。

### 里程碑 D：客户可验收

完成任务 16–18。具备可校验的私人安装包、安全文档、真实 Mac 验收和紧急撤销，之后才允许生产启用；签名公证为可选升级。

## 外部依赖与阻塞条件

可以不等待客户先完成：

- 所有 TypeScript 领域模块、Migration、内存 Adapter、Route、PWA 与测试；
- Swift Jeffrey Local、Fake App Server、Keychain/签名/长轮询和本地安装测试；
- 开发 Mac 上使用开发者自己的 Codex做隔离联调。

正式交付前必须具备：

- 客户正式 Supabase 项目和已执行 Migration；
- 客户正式 Supabase 项目和唯一私人用户身份；
- 客户 Mac 已安装并登录 Codex；
- HTTPS 正式 Jeffrey 后端；
- 客户本人完成 macOS 权限、iPhone 配对和真实验收。

缺少任一正式依赖时，功能保持 `LOCAL_COMPUTER_AGENT_ENABLED=false`，相应里程碑明确标记为测试或待客户联调，不能声称正式完成。
