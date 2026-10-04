import test from "node:test";
import assert from "node:assert/strict";
import type { Command } from "@piko/shared";
import { FeishuRouter, type FeishuMessage } from "../feishu-router.js";

function fixture(allowedUsers = ["ou_one", "ou_two"]) {
  let serial = 0;
  const messages: { chat: string; text: string }[] = [];
  const commands: Command[] = [];
  const members = [{ id: "a", name: "林悦", role: "Frontend Developer", status: "idle" }, { id: "b", name: "周宁", role: "Backend Architect", status: "idle" }];
  const router = new FeishuRouter({ allowedUsers, members: () => members,
    command: cmd => { commands.push(cmd); }, send: async (chat, text) => { messages.push({ chat, text }); },
  });
  const event = (text: string, user = "ou_one", chat = "chat_one"): FeishuMessage => ({
    sender: { sender_type: "user", sender_id: { open_id: user } },
    message: { message_id: String(++serial), chat_id: chat, chat_type: "p2p", message_type: "text", content: JSON.stringify({ text }) },
  });
  return { router, event, commands, messages, members };
}

test("empty whitelist only allows sender ID lookup; groups, bots and malformed events cannot run tasks", async () => {
  const f = fixture([]);
  await f.router.receive(f.event("我的ID"));
  assert.match(f.messages.at(-1)!.text, /ou_one/);
  await f.router.receive(f.event("选择 林悦"));
  await f.router.receive(f.event("删除文件"));
  assert.equal(f.commands.length, 0);
  const group = f.event("我的ID"); group.message.chat_type = "group";
  const bot = f.event("我的ID"); bot.sender.sender_type = "app";
  const broken = f.event("我的ID"); broken.message.content = "bad json";
  const count = f.messages.length;
  for (const event of [group, bot, broken]) await f.router.receive(event);
  assert.equal(f.messages.length, count);
});

test("Chinese selection sends one task despite duplicate delivery; only matching task results return", async () => {
  const f = fixture();
  await f.router.receive(f.event("成员"));
  assert.match(f.messages.at(-1)!.text, /前端开发者/);
  await f.router.receive(f.event("选择 林悦"));
  const input = f.event("制作中文页面");
  await f.router.receive(input); await f.router.receive(input);
  const run = f.commands[0]; assert.equal(run.type, "RUN_TASK");
  if (run.type !== "RUN_TASK") return;
  assert.equal(run.prompt, "制作中文页面");
  assert.equal(f.commands.length, 1);
  const before = f.messages.length;
  await f.router.broadcast({ type: "TASK_FAILED", agentId: "a", taskId: "another-task", error: "private" });
  assert.equal(f.messages.length, before);
  await f.router.broadcast({ type: "TASK_STARTED", agentId: "a", taskId: run.taskId, prompt: run.prompt });
  assert.equal(f.messages.at(-1)!.chat, "chat_one");
  await f.router.broadcast({ type: "TASK_DONE", agentId: "a", taskId: run.taskId, result: { summary: "页面完成", changedFiles: ["index.html"], diffStat: "", testResult: "passed" } });
  assert.match(f.messages.at(-1)!.text, /页面完成/);
  await f.router.receive(f.event("下一项任务"));
  assert.equal(f.commands.length, 2);
});

test("users cannot approve or cancel one another's tasks, even with a copied approval ID", async () => {
  const f = fixture();
  await f.router.receive(f.event("选择 林悦"));
  await f.router.receive(f.event("第一项任务"));
  const run = f.commands[0]; if (run.type !== "RUN_TASK") assert.fail();
  await f.router.broadcast({ type: "APPROVAL_NEEDED", agentId: "a", taskId: run.taskId, approvalId: "approve-one", title: "确认", summary: "变更", riskLevel: "med" });
  await f.router.receive(f.event("选择 林悦", "ou_two", "chat_two"));
  await f.router.receive(f.event("同意 approve-one", "ou_two", "chat_two"));
  await f.router.receive(f.event("取消", "ou_two", "chat_two"));
  await f.router.receive(f.event("抢占任务", "ou_two", "chat_two"));
  assert.equal(f.commands.length, 1);
  await f.router.receive(f.event("同意 approve-one"));
  assert.deepEqual(f.commands[1], { type: "APPROVAL_DECISION", approvalId: "approve-one", decision: "yes" });
  await f.router.receive(f.event("取消"));
  assert.deepEqual(f.commands[2], { type: "CANCEL_TASK", agentId: "a", taskId: run.taskId });
  await f.router.receive(f.event("同意 approve-one"));
  assert.equal(f.commands.length, 3);
});

test("a second chat gets only its own member's results; destroyed channels cannot dispatch", async () => {
  const f = fixture();
  await f.router.receive(f.event("选择 林悦")); await f.router.receive(f.event("任务一"));
  await f.router.receive(f.event("选择 周宁", "ou_two", "chat_two")); await f.router.receive(f.event("任务二", "ou_two", "chat_two"));
  const run = f.commands[1]; if (run.type !== "RUN_TASK") assert.fail();
  await f.router.broadcast({ type: "TASK_FAILED", agentId: "b", taskId: run.taskId, error: "任务二错误" });
  assert.equal(f.messages.at(-1)!.chat, "chat_two");
  assert.equal(f.messages.filter(m => m.chat === "chat_one" && m.text.includes("任务二错误")).length, 0);
  f.router.destroy(); const count = f.messages.length;
  await f.router.receive(f.event("我的ID"));
  assert.equal(f.messages.length, count);
});

test("busy and removed members do not accept work; ambiguous names require a stable ID", async () => {
  const f = fixture();
  f.members[1].name = "林悦";
  await f.router.receive(f.event("选择 林悦"));
  assert.match(f.messages.at(-1)!.text, /唯一成员/);
  await f.router.receive(f.event("选择 a"));
  f.members[0].status = "working";
  await f.router.receive(f.event("任务"));
  assert.equal(f.commands.length, 0);
  f.members.splice(0, 1);
  await f.router.receive(f.event("任务"));
  assert.equal(f.commands.length, 0);
});
