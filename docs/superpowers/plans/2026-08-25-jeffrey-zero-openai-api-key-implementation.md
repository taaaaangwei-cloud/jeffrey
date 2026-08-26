# Jeffrey 零 OpenAI API Key 实施计划

依据：[零 OpenAI API Key 设计](../specs/2026-08-25-jeffrey-zero-openai-api-key-design.md)

1. [x] 调整正式环境配置，使 OpenAI Key、模型和 embedding 配置不再是启动条件。
2. [x] 新增本地对话任务领域模型、存储接口、Supabase 迁移和幂等状态转换。
3. [x] 改造 `/api/chat`：保存用户消息、创建待处理任务并立即返回等待状态，不调用云端模型。
4. [x] 为已签名的 Jeffrey Local 增加领取对话、完成回复和失败回报接口。
5. [x] 扩展 macOS 助手，通过 Codex App Server 完成本地对话任务；保留电脑操作审批链路。
6. [x] 更新 PWA 的等待/离线提示和消息刷新行为。
7. [x] 正式模式移除 OpenAI/DeepSeek/embedding 初始化；DeepSeek 只保留显式预览入口。
8. [x] 更新环境样例、配置脚本、交付文档和安全说明。
9. [x] 添加配置、任务状态、接口、重复回传和无模型网络调用测试；运行 TypeScript、Node 与 Swift 测试。
10. [x] 实现主动联系时间选择、静默期、间隔、未回复守卫、本地记忆生成和 iPhone Web Push。

实施按上述顺序完成；每一层通过接口隔离，现有客户数据与本地电脑审批状态机不做破坏性迁移。
