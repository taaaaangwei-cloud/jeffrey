# Jeffrey Local macOS 配置与验收

## 交付组成

- 手机端 Jeffrey PWA：聊天、任务卡、任务/动作确认、停止与解除配对；
- 正式后端：Supabase 消息/任务与审计、设备签名、一次性配对和短租约，不调用模型；
- 客户 Mac：`apps/jeffrey-local` 菜单栏助手、本机 Keychain、HTTPS 客户端和 Codex App Server Adapter。

DeepSeek 预览始终关闭本地控制。正式交付的 Jeffrey 聊天由客户 Mac 上已登录的 Codex 完成，不需要 OpenAI API Key。

## 后端准备

按顺序执行基础 Migration、Development Agent Migration（如启用聊天内修改 App），再执行：

`supabase/migrations/20260825230000_local_computer_agent.sql`

`supabase/migrations/20260825235900_local_conversation_agent.sql`

`supabase/migrations/20260826002000_proactive_messages.sql`

`supabase/migrations/20260826010000_service_role_privileges.sql`

为正式后端配置：

```text
LOCAL_COMPUTER_AGENT_ENABLED=false
LOCAL_AGENT_PAIRING_SECRET=<至少 32 字符随机值>
LOCAL_AGENT_DEVICE_TOKEN_SECRET=<另一条至少 32 字符随机值>
LOCAL_AGENT_APPROVAL_SECRET=<第三条至少 32 字符随机值>
LOCAL_AGENT_TASK_TTL_MINUTES=15
LOCAL_AGENT_LEASE_SECONDS=60
LOCAL_AGENT_MIN_VERSION=0.1.0
```

三条 Secret 必须各不相同，也不能等于 Development Agent Secret。完成验收前保持功能关闭。

## 构建测试版助手

在开发 Mac 运行：

```bash
cd apps/jeffrey-local
swift test
swift build -c release --arch arm64 --arch x86_64
```

该命令生成同时兼容 Apple 芯片与 Intel 的通用构建，只交付给指定客户的一台私人 Mac，可以不使用 Apple Developer ID 签名或公证。首次打开若被 macOS 拦截，由客户在“系统设置 → 隐私与安全性”中确认允许；不要关闭 Gatekeeper，也不要运行来源不明的副本。签名与公证仅是减少安装提示的可选升级。

## 配对

1. 客户确认本机 Codex 已安装并登录；
2. 在 Jeffrey Local 输入正式 PWA 的 HTTPS 根地址；
3. 填写客户 Obsidian Vault 的本地文件夹路径；
4. 点击“生成配对码”；
5. 在 iPhone PWA 的“设置 → 我的 Mac”输入 6 位码；
6. Mac 持有专属领取令牌并完成配对，手机不会收到设备私钥或会话密钥；
7. 新 Mac 配对会自动撤销旧 Mac，并停止旧设备的未完成任务。

## 必做验收

- “找一下桌面的合同”：低风险任务直接执行，结果遮盖私人 Home 用户名；
- “修改某个测试文件”：手机先显示任务确认；
- “删除测试副本”：任务确认后，删除前再次显示具体动作确认；
- 拒绝具体动作：Codex 不执行该动作；
- 停止任务：本地 turn 被中断；
- Mac 离线或 Codex 未登录：PWA 不显示伪成功；
- 重放签名、过期配对码、错误租约和乱序事件均被拒绝；
- 解除配对：会话撤销，所有未完成本地任务取消；
- iPhone Safari 添加到主屏幕后，任务卡与设置页无横向溢出。

验收通过后才设置 `LOCAL_COMPUTER_AGENT_ENABLED=true`。正式交付可使用已经验收的未签名本地构建；若将来希望减少首次打开提示，再选择签名和公证。

## 紧急停止

手机设置页点击“解除配对”会撤销设备并取消所有未完成任务。服务端还可以立即把 `LOCAL_COMPUTER_AGENT_ENABLED` 改为 `false`；随后轮换三条 Local Agent Secret。该流程不删除客户的 Codex、Obsidian 或项目文件。
