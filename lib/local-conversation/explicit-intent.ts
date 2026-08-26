export interface ExplicitLocalIntent {
  summary: string;
  requestedOutcome: string;
  riskLevel: "low" | "medium" | "high";
  capabilities: Array<"files" | "shell" | "browser" | "applications">;
}

const explicitPrefix = /^(?:请|帮我|替我|麻烦你|用\s*codex|让\s*codex)/iu;
const readAction = /(查找|搜索|看看|查看|读取|打开).{0,24}(文件|文件夹|网页|浏览器|应用|电脑|桌面|项目)/iu;
const writeAction = /(修改|编辑|创建|新建|整理|重命名|移动|删除|安装|更新|运行|执行|提交|发布).{0,32}(文件|文件夹|代码|项目|app|应用|网页|电脑|命令|副本)/iu;
const highAction = /(删除|发送|上传|付款|购买|发布|提交)/iu;
const appChange = /(修改|编辑|更新|创建|新建).{0,32}(代码|项目|app|应用|网页)/iu;

function requestedOutcomeFor(text: string): string {
  if (!appChange.test(text)) return text.slice(0, 500);
  return [
    "在当前 Jeffrey 项目的隔离分支完成这项修改，并保持正式版本不变。",
    "完成后运行 lint、typecheck、单元测试和构建，返回修改摘要与本地预览方式。",
    "不得自行提交、推送或发布；这些动作必须再次获得客户明确确认。",
    `客户原始要求：${text}`,
  ].join("\n").slice(0, 500);
}

export function routeExplicitLocalIntent(message: string): ExplicitLocalIntent | null {
  const text = message.trim();
  if (!explicitPrefix.test(text) || (!readAction.test(text) && !writeAction.test(text))) return null;
  const write = writeAction.test(text);
  const high = highAction.test(text);
  return {
    summary: text.slice(0, 120), requestedOutcome: requestedOutcomeFor(text), riskLevel: high ? "high" : write ? "medium" : "low",
    capabilities: write ? ["files", "shell", "browser", "applications"] : ["files", "browser", "applications"],
  };
}
