import test from "node:test";
import assert from "node:assert/strict";
import { translateUI } from "@piko/shared";

test("UI translations support both languages, dynamic labels and untouched user data", () => {
  assert.equal(translateUI("Settings", "zh"), "设置");
  assert.equal(translateUI("Solo Agent", "zh"), "单人成员");
  assert.equal(translateUI("execute", "zh"), "开发执行");
  assert.equal(translateUI("Duration: 2 min 8 sec", "zh"), "耗时：2 分 8 秒");
  assert.equal(translateUI("耗时：2 分 8 秒", "en"), "Duration: 2 min 8 sec");
  assert.equal(translateUI("协作工作台", "en"), "Collaboration Workbench");
  assert.equal(translateUI("Input: 120 / Output: 30", "zh"), "输入：120 / 输出：30");
  assert.equal(translateUI("输入：120 / 输出：30", "en"), "Input: 120 / Output: 30");
  assert.equal(translateUI("/Users/me/projects/Settings.ts", "zh"), "/Users/me/projects/Settings.ts");
  assert.equal(translateUI("检查登录流程并修复问题", "en"), "检查登录流程并修复问题");
});
