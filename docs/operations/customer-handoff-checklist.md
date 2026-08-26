# Jeffrey 私人 PWA 客户交付清单

## 当前已经由交付方完成

- 已创建并初始化 Supabase 项目，执行全部 Migration、Seed 与最小权限修复。
- 已在本机安全配置 Supabase、Web Push、主动联系调度和本地助手随机 Secret；Secret 不进入源码包。
- 已准备无 OpenAI API Key 的正式运行方式、数据库结构、PWA 与 Jeffrey Local 源码。
- 已准备自动测试、无密钥源码打包和未签名 Jeffrey Local 打包流程。

## 客户只需要提供或亲自完成的内容

- 决定正式 Supabase 是继续由交付方托管，还是转到客户账号；如需客户所有权，仅邀请客户加入项目，不通过聊天传 Service Role Key。
- 一个客户自己的私有 GitHub 仓库，或邀请交付方进入仓库。
- 正式 HTTPS 域名与 Cloudflare/Sites 部署权限。
- 一台长期在线的 macOS 电脑，已安装并登录客户自己的 Codex。
- 客户 Obsidian Vault 的本地文件夹路径；知识正文不需要上传到云端。
- 客户首次打开未签名 Jeffrey Local 时，在 macOS“隐私与安全性”中手动确认允许；不需要 Apple 开发者账号。

## 交付方可以代劳的内容

- 创建或配置 Supabase 表、权限、Migration、Seed 与运行时 Secrets。
- 部署 PWA 与后端、配置 HTTPS、Web Push VAPID 密钥和每小时主动联系调度。
- 把源码交付到客户的私有 GitHub 仓库并启用无 API Key 的代码检查。
- 构建 Jeffrey Local、协助输入后端地址、选择 Obsidian Vault 并完成手机与 Mac 配对。
- 在测试环境完成聊天、记忆、主动消息、iPhone 通知、电脑任务审批、取消和解除配对验收。
- 构建并交付只供该客户私人 Mac 使用的未签名 Jeffrey Local；签名、公证仅作为以后减少安装提示的可选升级。

## 上线顺序

1. 已完成当前 Supabase、Migration、Seed 与本机 Secret；若将来换到客户自己的新项目，再运行 `./scripts/setup-jeffrey.sh`。
2. 把相同的非本地配置安全写入部署平台 Secret，部署 HTTPS PWA/后端。
3. 配置每小时 Cron，验证 `/api/proactive/tick` 只能用正确 Secret 调用。
4. 在客户 Mac 安装 Jeffrey Local，选择 Obsidian Vault，与 iPhone PWA 一次性配对。
5. iPhone 用 Safari 打开正式 HTTPS 地址，添加到主屏幕，进入设置开启通知与 Jeffrey 主动联系。
6. 按 `jeffrey-local-macos-setup.md` 完成必做验收；通过后才正式交付。

## 不能在源码包内交付的内容

- Supabase Service Role Key、VAPID Private Key、设备配对/审批 Secret。
- 客户 Codex 登录状态与 GitHub Token。
- 客户 Obsidian 私密正文、聊天数据库导出或任何 `.env` 文件。

完成代码并不等于已经上线。只有客户账号权限、正式部署、Mac 配对、iPhone 通知和真实端到端验收都完成后，才能称为可正式使用的客户版本。
