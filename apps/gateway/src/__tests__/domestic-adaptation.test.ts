import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSkillName, isSafeSkillName, translateUI, CommandSchema } from "@piko/shared";
import { getBackend } from "../backends.js";
import { PromptEngine } from "@piko/orchestrator";

test("Chinese skill names survive normalization while filesystem paths are rejected", () => {
  assert.equal(normalizeSkillName("  小红书 图文策划  "), "小红书-图文策划");
  assert.equal(normalizeSkillName("React 测试"), "react-测试");
  assert.equal(isSafeSkillName("小红书-图文策划"), true);
  for (const name of ["../secret", "/tmp/x", "..", "", "a\\b", "a.b", "a/../b"]) assert.equal(isSafeSkillName(name), false);
});

test("Feishu configuration validates allowed users and retains request correlation", () => {
  const data = CommandSchema.parse({ type: "SAVE_CONFIG", requestId: "feishu-1", feishuAllowedUsers: ["ou_me"], feishuEnabled: false });
  assert.equal(data.type, "SAVE_CONFIG");
  assert.equal(CommandSchema.safeParse({ type: "SAVE_CONFIG", feishuAllowedUsers: ["anyone"] }).success, false);
  assert.equal(translateUI("Feishu bot", "zh"), "飞书机器人");
  assert.equal(translateUI("飞书机器人", "en"), "Feishu bot");
});

test("Qwen adapter preserves the prompt argument, model choice and sandbox mode", () => {
  const qwen = getBackend("qwen")!;
  assert.ok(qwen); assert.equal(qwen.instructionPath, "QWEN.md");
  const prompt = "检查文件；$(不要执行这段)";
  const args = qwen.buildArgs(prompt, { model: "chosen-model", fullAccess: false });
  assert.equal(args[1], prompt);
  assert.ok(args.includes("--sandbox"));
  assert.ok(args.includes("chosen-model"));
  assert.ok(!args.includes("yolo"));
  assert.ok(qwen.buildArgs(prompt, { fullAccess: true }).includes("yolo"));
});

test("task reports default to Chinese without translating the machine-readable protocol", () => {
  const prompt = new PromptEngine().render("worker-initial", { name: "林悦", prompt: "修复页面" });
  assert.ok(prompt.includes("SUMMARY:"));
  assert.ok(prompt.includes("Simplified Chinese"));
  assert.ok(!prompt.includes("MUST be in English"));
});
