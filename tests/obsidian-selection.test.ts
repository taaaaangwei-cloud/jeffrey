import assert from "node:assert/strict";
import test from "node:test";
import { classifyObsidianMigrationPath } from "../lib/knowledge/obsidian-selection.ts";

test("selects curated Jeffrey knowledge while archiving raw and executable material", () => {
  assert.equal(classifyObsidianMigrationPath("character", "00_Jeffrey总档.md"), "knowledge");
  assert.equal(classifyObsidianMigrationPath("character", "日常连续性/2026-08-24_Jeffrey日常.md"), "knowledge");
  assert.equal(classifyObsidianMigrationPath("character", "参考素材/成人内容参考索引.md"), "knowledge");
  assert.equal(classifyObsidianMigrationPath("character", "微信聊天原始记录/逐日原文/2026-08-24.md"), "archive");
  assert.equal(classifyObsidianMigrationPath("character", "Hook提示词/01_提示词原文.txt"), "archive");
  assert.equal(classifyObsidianMigrationPath("character", "Jeff私人通讯软件/app/page.tsx"), "excluded");
  assert.equal(classifyObsidianMigrationPath("character", "Jeffrey_微信头像.jpg"), "media");
});

test("selects only top-level user profile markdown", () => {
  assert.equal(classifyObsidianMigrationPath("user-profile", "00_私人档案.md"), "knowledge");
  assert.equal(classifyObsidianMigrationPath("user-profile", "附件/照片.jpg"), "archive");
  assert.equal(classifyObsidianMigrationPath("user-profile", "../escape.md"), "excluded");
});
