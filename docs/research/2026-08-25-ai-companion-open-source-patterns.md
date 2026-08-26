# 开源 AI 陪伴应用调研：Jeffrey 私人 PWA 可复用方案

日期：2026-08-25
范围：只使用项目官方 GitHub 仓库、README、源码和第一方平台文档。重点观察人格、记忆、主动消息、PWA/手机、语音媒体、隐私，以及让 AI 修改 App 的安全边界。

## 结论先行

没有一个项目适合整体搬进 Jeffrey PWA。最稳妥的组合是：

1. 用 **a16z Companion App** 的“人格常驻段 + 示例对话 + 可检索背景 + 短期会话”作为后端基础思路。
2. 用 **AI Pocket Chat** 的“日程、情绪、关系阶段、开放事项（open loop）和主动消息守卫”塑造活人感，但重新实现，不能直接复制 GPL 代码。
3. 用 **KI-CO、SillyTavern、RisuAI** 的分层记忆、人格核、Lorebook 和召回控制思想，针对单角色 Jeffrey 做减法。
4. 语音和动态形象优先参考 **Amica**；第一版只需要语音输入/回复和静态头像，不必一开始上 3D。
5. “在聊天里让 Jeffrey 修改 App”应是一个独立开发代理流程：可以自动识别修改意图，无需口令；但只能在隔离分支/沙箱中修改、测试并生成预览，必须由客户确认后才能发布。

## 六个项目的可取之处

### 1. AI Pocket Chat：最接近人机恋产品蓝图

官方仓库：[Marlon0066/AI-Pocket-Chat](https://github.com/Marlon0066/AI-Pocket-Chat)

它是原生 Android 应用，不是 PWA。官方 README 明确包含角色日程、情绪、长期/近期记忆、关系成长、朋友圈、日记、礼物、语音通话，以及角色主动发动态和发起联系；数据和通知均在本机，模型使用用户填写的 OpenAI-compatible API。[README](https://github.com/Marlon0066/AI-Pocket-Chat/blob/main/README.md)

最值得借鉴的是主动消息并非“定时随机说一句”。例如“惦记的事”到期消息会检查通知开关、事项状态、两小时新鲜窗口、当前是否处于线下见面模式，再把人物设定、真实时间和之前提到的事项送入模型；输出还要通过长度和内容校验，之后才写入会话并通知。[OpenLoopDueMessenger.kt](https://github.com/Marlon0066/AI-Pocket-Chat/blob/main/app/src/main/java/com/situ/aichat/openloop/OpenLoopDueMessenger.kt) 通知层还处理锁屏隐私、对话式通知、直接回复、消息物化和去重标识。[Notifier.kt](https://github.com/Marlon0066/AI-Pocket-Chat/blob/main/app/src/main/java/com/situ/aichat/notification/Notifier.kt)

记忆层也很有价值：一边提取昵称、共同梗、重要约定、安慰方式等结构化关系记忆，另一边使用端侧中文 embedding 对历史消息做语义召回。[StructuredMemoryService.kt](https://github.com/Marlon0066/AI-Pocket-Chat/blob/main/app/src/main/java/com/situ/aichat/prompt/memory/StructuredMemoryService.kt) [VectorMemoryService.kt](https://github.com/Marlon0066/AI-Pocket-Chat/blob/main/app/src/main/java/com/situ/aichat/prompt/memory/VectorMemoryService.kt)

**给 Jeffrey 的取法：**重做“开放事项 + 主动消息守卫 + 关系记忆字段”，不要照搬商城、货币和复杂小世界。主动消息应来自记忆中的具体事情，例如“今天要面试”“这周睡不好”，而不是通用的“我想你了”。

**许可注意：**GPL-3.0。若复制代码并分发修改版，会产生相应的开源义务。[LICENSE](https://github.com/Marlon0066/AI-Pocket-Chat/blob/main/LICENSE)

### 2. a16z Companion App：最清楚的陪伴型后端起点

官方仓库：[a16z-infra/companion-app](https://github.com/a16z-infra/companion-app)

该项目明确覆盖恋爱、友情、娱乐和教练等陪伴场景。人物文件被拆成三部分：每轮都带上的短人格前言、用于固定说话方式的示例对话、仅在相关时通过向量检索召回的长背景；近期聊天则单独保存在队列中。[README：How does this work / Adding characters](https://github.com/a16z-infra/companion-app/blob/main/README.md)

它也展示了浏览器聊天与 SMS 共用人物和历史的思路，并支持 Pinecone 或 Supabase pgvector。虽然技术栈较旧且 README 明确称其为教程/起步模板，但“稳定人格前缀 + 示例语气 + 短期历史 + 长期语义召回”依然是很干净的基础模型。

**给 Jeffrey 的取法：**把客户的 Obsidian 内容分为：人格核（每轮常驻）、Jeffrey 说话示例（少量常驻）、可检索事实和事件（pgvector）、最近消息（数据库窗口）。避免把整个知识库每轮全部塞给模型。

**直接使用潜力：**MIT 许可，商业项目可在保留版权和许可声明的前提下复用代码；但建议只借结构、使用当前 OpenAI API 和现有项目栈重写。[LICENSE](https://github.com/a16z-infra/companion-app/blob/main/LICENSE)

### 3. KI-CO：分层记忆、时间连续性与 Obsidian 接入最贴近当前需求

官方仓库：[Kisera001/KI-CO](https://github.com/Kisera001/KI-CO)

KI-CO 把陪伴连续性拆成不同权重的层：当前用户输入、当前事实、窗口状态卡、近期消息、生活线、相关记忆、人格核、旧日记。官方原则强调“记忆是背景而不是剧本”，旧记忆冲突时应以当前表达为准；记忆候选也不应未经确认就自动成为永久事实。[COTTAGE_PRINCIPLES.md](https://github.com/Kisera001/KI-CO/blob/main/COTTAGE_PRINCIPLES.md)

其 Topic Memory Set 会在 `reuse / supplement / refresh` 之间选择，避免每句话都重新检索；对撒娇、晚安、拥抱等低语义连续对话可以不触发 RAG，对“还记得、上次、当初”等明确回忆请求则积极召回。[topicMemoryGate.ts](https://github.com/Kisera001/KI-CO/blob/main/src/utils/topicMemoryGate.ts) Time Bridge 会加入设备时区、当前时段、距离上一条用户消息多久、上一段长对话锚点和材料新鲜度，减少模型把旧事当成刚刚发生。[timeAwareness.ts](https://github.com/Kisera001/KI-CO/blob/main/src/utils/timeAwareness.ts)

仓库还提供本地 Obsidian bridge：扫描 Markdown、解析 frontmatter、切块并生成稳定 ID，这与当前客户知识库迁移非常接近。[obsidian-bridge.mjs](https://github.com/Kisera001/KI-CO/blob/main/scripts/obsidian-bridge.mjs)

**给 Jeffrey 的取法：**采用“人格核、当前状态、近期消息、相关长期记忆、日记/旧档案”五层上下文，并加时间桥；检索策略先用规则判断是否需要召回，再在不确定时调用轻量模型。

**许可注意：**CC BY-NC-SA 4.0 明确限定非商业使用，因此客户交付项目不能直接复制其代码或资源；只能独立重做思想，或另行取得作者授权。[LICENSE](https://github.com/Kisera001/KI-CO/blob/main/LICENSE)

### 4. SillyTavern：角色卡与 Lorebook 的事实标准参考

官方仓库：[SillyTavern/SillyTavern](https://github.com/SillyTavern/SillyTavern)；[官方文档仓库](https://github.com/SillyTavern/SillyTavern-Docs)

SillyTavern 的核心优势不是 UI，而是角色资产格式。Character Card 把姓名、描述、人格、场景、首句、示例对话、系统提示和角色 Lorebook 作为可导入导出的独立对象；World Info/Lorebook 会按关键词和上下文动态把相关条目插入提示，而不是永久塞满上下文。[Characters](https://github.com/SillyTavern/SillyTavern-Docs/blob/main/Usage/Characters/index.md) [World Info](https://github.com/SillyTavern/SillyTavern-Docs/blob/main/Usage/worldinfo.md)

**给 Jeffrey 的取法：**定义一个简化版 `jeffrey-profile` 数据结构，将身份、边界、语气示例、关系称呼和知识库引用分开保存，并支持完整导入/导出。这样客户以后用自己的 Codex 修改时，不必在散落的提示词里找人物设定。

**许可注意：**AGPL-3.0 对网络服务有强开源要求；商业闭源 PWA 不应直接嵌入或修改其代码。[LICENSE](https://github.com/SillyTavern/SillyTavern/blob/release/LICENSE)

### 5. RisuAI：跨平台角色聊天、媒体素材和长期记忆组合

官方仓库：[kwaroran/Risuai](https://github.com/kwaroran/Risuai)

RisuAI 是 Web + Tauri 的跨平台角色聊天应用，支持多模型供应商、表情图、Lorebook、TTS、图片/音频/视频素材、插件和强提示编排；长期记忆包括 HypaMemory 和 SupaMemory。[README](https://github.com/kwaroran/Risuai/blob/main/README.md) 其源码将 embedding 缓存、批量相似度检索和记忆压缩组合起来，说明长期聊天不能只靠“把历史越塞越长”。[hypamemoryv2.ts](https://github.com/kwaroran/Risuai/blob/main/src/ts/process/memory/hypamemoryv2.ts)

**给 Jeffrey 的取法：**采用“短期摘要/压缩 + 长期向量召回”双层设计；让 Jeffrey 的情绪状态映射到头像小变化、贴纸或消息样式，而不是只在文字里声称情绪。媒体应作为角色资产包管理，并记录用途、版权和可见条件。

**许可注意：**GPL-3.0，适合参考设计，闭源交付不宜直接复制。[LICENSE](https://github.com/kwaroran/Risuai/blob/main/LICENSE)

### 6. Amica：语音、视觉与情绪表达的模块参考

官方仓库：[semperai/amica](https://github.com/semperai/amica)

Amica 支持手机、平板和桌面浏览器中的 3D VRM 角色，组合语音活动检测、语音识别、LLM、TTS、视觉输入和情绪引擎；同时兼容云模型和本地模型。[README](https://github.com/semperai/amica/blob/master/README.md) 它最值得借的是模块边界：语音检测、转写、生成、情绪标签、声音合成、角色动作相互独立，可以逐步替换供应商。

**给 Jeffrey 的取法：**第一阶段只做按住录音、服务端转写、文字流式回复和可选 TTS；第二阶段再做“情绪标签 → 表情/头像状态”；3D 角色只作为远期可选模块，避免拖慢手机体验。

**直接使用潜力：**主要代码为 MIT，但 README 明确提醒模型和图片等资产可能各有许可，必须逐项核对。[LICENSE](https://github.com/semperai/amica/blob/master/LICENSE)

## 推荐给 Jeffrey PWA 的组合方案

### 人格与记忆

每次回复按以下顺序组装上下文：

1. 安全规则与当前用户输入；
2. Jeffrey 人格核与边界（稳定、短、每轮常驻）；
3. 当前窗口状态卡和最近消息；
4. Topic Gate 判断出的相关 Obsidian/pgvector 记忆；
5. 旧日记或历史聊天摘要（只在明确相关时加入）；
6. 当前时间、距上次联系多久、记忆材料发生时间。

永久记忆写入应保存证据来源、发生时间、置信度和可编辑状态。称呼、约定、偏好、冲突、安慰方式可以作为结构化关系字段；模型抽取出的新事实先作为候选，避免误记直接固化。

### 主动联系

云端调度器定期生成候选，但只有通过以下守卫才发送：

- 客户已经授权通知，且当前不在免打扰时段；
- 最近没有未读主动消息，连续未回复次数未超限；
- 候选来自具体记忆、开放事项、纪念日或真实时间场景；
- 相关记忆仍新鲜，没有被客户后续消息推翻；
- 生成期间若客户刚发来新消息，则取消旧候选；
- 文案通过长度、重复、敏感内容和角色一致性校验；
- 每次投递有唯一 ID，保证数据库写入和 Web Push 不重复。

AI Pocket Chat 使用 Android 本地调度；Jeffrey 是 PWA，应改成后端定时任务 + 数据库 + Web Push。iPhone/iPad 从 16.4 起支持主屏幕 Web App 接收 Web Push，但授权必须由用户点击等直接交互触发。[WebKit 官方说明](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)

### 在聊天里让 Jeffrey 修改 App

本次调研的六个陪伴项目都没有可直接投入生产的“角色自己修改并发布 App”方案。Risu 的插件和模型适配、SillyTavern 的扩展只是扩展点，不等于安全的代码修改系统。

推荐自然识别、无需“进入开发模式”，但必须经过受控状态机：

```text
普通聊天
  └─识别为 App 修改请求
      └─创建开发任务（记录原话、身份、范围）
          └─私有仓库隔离分支 / 沙箱内修改
              └─自动测试与安全检查
                  └─生成预览和修改说明
                      ├─客户拒绝：关闭任务，不影响线上
                      └─客户确认发布：由部署服务发布
```

可直接参考的相邻项目是 [OpenTrip](https://github.com/stvlynn/OpenTrip)：它的 PWA 内 AI 会先生成建议，用户审批后才执行写操作，技术说明也明确采用带人工批准的 scoped tools。[README](https://github.com/stvlynn/OpenTrip/blob/main/README.md) Jeffrey 应把这个模式提升到代码层：聊天代理只负责创建变更任务和展示结果；编码沙箱没有生产密钥；发布服务只接受已测试、客户确认的特定版本。

“确认发布”不能省略，因为代码修改可能被普通对话、知识库内容或模型误判触发。客户不需要说固定口令，但真正更新线上 App 必须是独立、清晰、可审计的一次确认。

## 许可与可直接使用判断

| 项目 | 许可 | 对商业闭源 Jeffrey PWA 的建议 |
|---|---|---|
| AI Pocket Chat | GPL-3.0 | 只借产品机制，独立重写 |
| a16z Companion App | MIT | 可复用结构或代码，保留声明；技术栈需现代化 |
| KI-CO | CC BY-NC-SA 4.0 | 不直接复制；商业使用需另行授权 |
| SillyTavern | AGPL-3.0 | 只借格式和机制，独立重写 |
| RisuAI | GPL-3.0 | 只借架构和交互，独立重写 |
| Amica | MIT（资产另计） | 可选择性复用模块；逐项检查 3D/声音资产许可 |
| OpenTrip（相邻参考） | Apache-2.0 | 可参考或复用“建议 → 审批 → 写入”工作流 |

以上是工程选型提示，不是法律意见；正式商业交付前仍应做一次依赖和资产许可清单审查。

## 建议实施顺序

1. 先完成单角色人格核、Obsidian 分层导入、短期历史和 pgvector 召回。
2. 再完成关系记忆抽取、时间桥、记忆候选审核和可编辑记忆页。
3. 加入主动联系调度、Web Push、免打扰、未读限制、取消竞态和投递去重。
4. 加入语音输入和 TTS；情绪头像与贴纸随后补充。
5. 最后接入“聊天提出修改 → 沙箱改动 → 自动测试 → 预览 → 确认发布”的云端开发代理。

这样优先保证 Jeffrey “记得准、联系得自然、不会乱发”，再扩展表情、语音和自修改能力。
