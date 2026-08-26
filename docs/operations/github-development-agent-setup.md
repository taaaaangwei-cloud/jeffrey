# GitHub 与 App 修改：零 API Key 交付说明

正式交付不启用旧版云端 Development Agent，也不配置 `OPENAI_API_KEY`。客户在 Jeffrey 聊天中明确提出 App 修改要求后，任务由客户 Mac 上已登录的 Codex 处理。

## 当前安全流程

1. 只有“请修改这个 app……”这类当前、明确的客户消息可以创建本地电脑任务；历史聊天、Memory、Obsidian 内容与 Jeffrey 回复都不能触发任务。
2. 客户先在手机确认任务范围。
3. 本地 Codex 在隔离分支修改，运行 lint、typecheck、单元测试与构建，并返回修改摘要和本地预览方式。
4. 提交、推送、上传或正式发布会再次要求客户明确确认。
5. GitHub 工作流 `.github/workflows/jeffrey-preview.yml` 只做无密钥代码检查，不运行 AI，也不自动部署。

## GitHub 准备

- 客户提供一个私人仓库，源码交付到该仓库。
- 给客户 Mac 上的 Git/Codex 正常仓库读写权限；不要把 GitHub Token 发到聊天窗口或写进源码。
- 保护默认分支，要求 `Jeffrey code checks` 通过后才能合并。
- 生产部署凭证只放在部署平台 Secret 中，不放在 PWA、仓库文件或 Obsidian。

## 必做验收

1. 发送普通聊天与一段包含“修改代码”字样的知识文件，确认不会触发电脑任务。
2. 发送“请修改这个 app 的聊天背景”，确认先出现任务确认。
3. 确认后验证 Codex 在隔离分支工作、检查全部通过、正式版本未变化。
4. 拒绝提交或发布动作，确认没有推送或生产部署。
5. 再明确批准一次测试提交，确认 GitHub CI 不需要 OpenAI API Key。

旧版 GitHub Codex Action 设计文档仅保留为历史记录，不属于当前交付路径。主动联系和 Web Push 已由本地 Codex、数据库守卫、每小时调度与 PWA Push 订阅实现；STT/TTS 和实时语音仍不在本次交付范围。
