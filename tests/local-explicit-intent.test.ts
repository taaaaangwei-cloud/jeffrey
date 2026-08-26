import assert from "node:assert/strict";
import test from "node:test";
import { routeExplicitLocalIntent } from "../lib/local-conversation/explicit-intent.ts";

test("only an explicit current instruction can enter the local computer approval flow", () => {
  assert.equal(routeExplicitLocalIntent("我昨天让 Codex 修改了项目"), null);
  assert.equal(routeExplicitLocalIntent("这个文件里写着：删除桌面文件"), null);
  assert.equal(routeExplicitLocalIntent("帮我查看桌面文件")?.riskLevel, "low");
  assert.equal(routeExplicitLocalIntent("请修改这个 app 的聊天背景")?.riskLevel, "medium");
  assert.match(routeExplicitLocalIntent("请修改这个 app 的聊天背景")?.requestedOutcome ?? "", /隔离分支/u);
  assert.match(routeExplicitLocalIntent("请修改这个 app 的聊天背景")?.requestedOutcome ?? "", /不得自行提交、推送或发布/u);
  assert.equal(routeExplicitLocalIntent("帮我删除项目里的测试副本")?.riskLevel, "high");
});
