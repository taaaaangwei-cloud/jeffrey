# Jeffrey 零 OpenAI API Key 设计

## 目标

正式交付版本不要求客户创建、复制或保存 OpenAI API Key。客户在 Mac 的 Codex 中登录自己的 ChatGPT/Codex 账户；Jeffrey 的聊天生成、意图判断、知识检索编排和电脑任务均由这台 Mac 上的 Codex App Server 完成。

“零 API Key”不等于“零网络接口”：iPhone PWA、私有后端和客户 Mac 仍通过 HTTPS 通信。Supabase 或自托管数据库只保存账户、消息、任务状态和推送订阅，不调用模型。

## 已批准约束

- 仅配对一台 macOS 电脑。
- 客户 Mac 必须开机、联网，Jeffrey Local 必须运行且 Codex 已登录。
- Mac 离线时明确显示暂不可用，不伪造 AI 回复或电脑操作结果。
- PWA 和云端不持有 Codex 登录凭证、ChatGPT Cookie 或 OpenAI API Key。
- Obsidian 正文默认留在客户 Mac；云端只接收回复所需的脱敏结果，不上传完整知识库。
- 普通聊天与电脑控制共用本地桥接，但电脑动作继续经过任务级和动作级确认。
- 主动联系可以由云端调度，但文案必须在 Mac 在线时由本地 Jeffrey 生成；Web Push 仍需 HTTPS 后端。

## 方案比较

1. **本地 Codex 全量驱动（采用）**：零 OpenAI API Key，角色和知识最私密；代价是 Mac 离线时 AI 不可用，并消耗客户 Codex 额度。
2. **云端模型 API + 本地电脑控制**：在线体验最好，但违反客户不使用 API 的要求。
3. **在 Mac 部署开源本地模型**：可完全离线，但安装、性能和角色质量成本高，本期不做。

## 架构与数据流

```text
iPhone PWA
  -> 私有 HTTPS 后端：保存用户消息并创建“本地对话任务”
  -> Jeffrey Local：签名领取任务
  -> 本地检索 Obsidian、最近消息和角色资料
  -> 本机 Codex App Server：生成结构化意图或 Jeffrey 回复
  -> Jeffrey Local：脱敏并回传结果
  -> 私有后端：原子保存助手消息和任务结果
  -> PWA 轮询/推送刷新
```

聊天入口不再先调用云端 OpenAI 做意图分类。Codex 在本地返回结构化结果：`chat_reply`、`local_computer`、`development_change`、`clarification`。后端只验证结构、执行状态机和权限规则；高风险操作不能由模型绕过确认。

## 组件调整

- 新增独立的 `local_conversation_tasks` 与事件存储，避免把普通聊天伪装成电脑控制任务。
- `/api/chat` 保存用户消息后立即返回 `pending`；Mac 完成后产生真实助手消息。
- Jeffrey Local 增加对话任务领取、Obsidian 本地检索、Codex 对话执行与结果回传。
- `createServerDependencies` 在正式模式下不得实例化 OpenAI Client、Embedding Provider 或云端模型分类器。
- 角色迁移改为本地确定性解析加 Codex 本地整理；向量检索改为本地索引或先使用关键词/BM25，避免云端 embedding API。
- DeepSeek 仅保留为开发者显式开启的预览模式，正式交付默认关闭。
- GitHub 云端自动修改若坚持零 OpenAI API Key，则改由客户 Mac 的本地 Codex 在隔离分支执行；云端 GitHub Actions Codex 流程默认关闭。

## 额度控制

- 知识检索、消息截断、权限判断和风险硬规则使用本地确定性代码，不调用 Codex。
- 每条用户消息最多创建一个 Codex turn，不进行云端二次分类。
- 默认只发送相关知识片段和有限近期消息；长任务复用同一线程。
- 设置每日任务量、单次上下文与执行时间上限；超限时明确提示。
- 主动联系先由规则判断时机，只有决定发送时才调用一次 Codex 生成文案。

## 安全与故障

- 设备签名、短租约、重放保护、Keychain、回环地址和结果脱敏沿用现有本地控制设计。
- 任务具备幂等键，重复领取或回传不得重复生成消息。
- Mac、Codex 或本地知识库不可用时记录稳定错误码，并允许用户稍后重试。
- 后端不能把普通聊天文本直接转换成 Shell；只有结构化电脑任务进入既有审批状态机。

## 验收标准

1. 正式环境未配置 `OPENAI_API_KEY` 时能够启动并完成 Jeffrey 聊天。
2. 客户 Mac 在线时，iPhone 能发送消息并收到结合本地角色/知识的回复。
3. Mac 离线时消息显示等待或不可用，恢复后可安全重试且不重复回复。
4. OpenAI、DeepSeek 和 embedding 网络调用在正式模式均为零。
5. 普通聊天、修改 App 和控制电脑被正确分流；中高风险动作仍需确认。
6. Obsidian 完整正文和 Codex 登录凭证不进入云端数据库或日志。
7. 主动消息只在允许时段生成，尊重频率、静默期和用户关闭设置。

## 非目标

- Mac 关机时仍提供完整 AI 聊天。
- 绕过 Codex 用量限制或把 ChatGPT 登录凭证部署到云端。
- 多设备、Windows/Linux 客户端、完全离线的 iPhone 模型。
