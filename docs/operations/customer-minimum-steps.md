# Jeffrey 客户最少操作说明

交付方已经准备数据库、PWA、后端、安全密钥、主动联系、通知、本地助手和测试。客户不需要购买 Apple 开发者账号，也不需要提供 OpenAI API Key。

## 客户只做这 6 步

1. 在 Mac 安装并登录客户自己的 Codex。
2. 解压 `Jeffrey-Local-private-macOS-universal.zip`，把 **Jeffrey Local.app** 放进“应用程序”。若首次打开被拦截，到“系统设置 → 隐私与安全性”点击允许；不要关闭 Gatekeeper。
3. 打开 Jeffrey Local，在菜单栏填写正式 PWA 的 HTTPS 地址，并选择客户自己的 Obsidian Vault 文件夹。
4. 点击“生成配对码”，在 iPhone PWA 的“设置 → 我的 Mac”输入该配对码。
5. iPhone 用 Safari 打开正式地址，选择“添加到主屏幕”，再在 Jeffrey 设置中允许通知和主动联系。
6. 完成一次聊天、一次记忆提问和一次低风险电脑任务测试。需要写入、删除、发布或扩大权限时，仍由客户在手机上确认。

## 客户不用发送给交付方

- OpenAI API Key、Codex 登录密码或 GitHub Token；
- Obsidian 知识库正文；
- Mac 登录密码；
- Supabase Service Role Key 或本地设备密钥。

## 仍需交付方上线时完成

- 把已经生成的服务器配置写入正式 HTTPS 部署平台；
- 配置每小时主动联系调度；
- 与客户现场完成 Mac 配对、iPhone 通知和端到端验收；
- 验收通过后再开启电脑控制总开关。
