import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { WorkspaceLedger } from "../workspace-ledger.js";
import { GatewayEventSchema, CommandSchema } from "@piko/shared";
import { buildRecap, chooseAssignee, scopeWorkspace } from "@piko/shared";

function fixture(t: TestContext) {
  const directory = mkdtempSync(path.join(tmpdir(), "workspace-ledger-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  let timestamp = 10000;
  const file = path.join(directory, "history.json");
  const ledger = new WorkspaceLedger(file, () => timestamp++);
  const resolve = (id: string) => ({ name: id === "lead" ? "负责人" : "开发者", role: "Developer", projectDir: "/projects/site", teamId: "team" });
  const apply = (event: Parameters<typeof ledger.apply>[0]) => ledger.apply(event, resolve);
  return { directory, file, ledger, resolve, apply };
}

test("task board captures queue, execution, approval and structured completion without duplicate cards", t => {
  const { ledger, apply } = fixture(t);
  apply({ type: "TASK_QUEUED", agentId: "dev", taskId: "a", prompt: "开发登录页", position: 1 });
  assert.equal(ledger.snapshot().tasks[0].status, "queued");
  apply({ type: "TASK_STARTED", agentId: "dev", taskId: "a", prompt: "开发登录页" });
  apply({ type: "APPROVAL_NEEDED", agentId: "dev", taskId: "a", approvalId: "approval", title: "确认", summary: "执行操作", riskLevel: "low" });
  assert.equal(ledger.snapshot().tasks[0].status, "waiting_approval");
  apply({ type: "AGENT_STATUS", agentId: "dev", status: "working" });
  assert.equal(ledger.snapshot().tasks[0].status, "working");
  const done = { type: "TASK_DONE" as const, agentId: "dev", taskId: "a", result: { summary: "登录页完成", changedFiles: ["login.tsx"], diffStat: "+1", testResult: "passed" as const, tokenUsage: { inputTokens: 20, outputTokens: 10 } } };
  apply(done);
  assert.equal(apply(done), false);
  const snapshot = ledger.snapshot();
  assert.equal(snapshot.tasks.length, 1);
  assert.equal(snapshot.tasks[0].status, "done");
  assert.deepEqual(snapshot.tasks[0].changedFiles, ["login.tsx"]);
  assert.equal(snapshot.highlights.filter(h => h.kind === "completion").length, 1);
  assert.ok(snapshot.tasks[0].endedAt! > snapshot.tasks[0].startedAt!);
  assert.equal(GatewayEventSchema.parse({ type: "WORKSPACE_SYNC", snapshot }).type, "WORKSPACE_SYNC");
});

test("delegation and result-return edges track actual pairs and deduplicate repeated events", t => {
  const { ledger, apply } = fixture(t);
  const delegated = { type: "TASK_DELEGATED" as const, fromAgentId: "lead", toAgentId: "dev", taskId: "a", prompt: "实现功能" };
  apply(delegated); apply(delegated);
  const returned = { type: "TASK_RESULT_RETURNED" as const, fromAgentId: "dev", toAgentId: "lead", taskId: "a", summary: "完成", success: true };
  apply(returned); apply(returned);
  const link = ledger.snapshot().links[0];
  assert.deepEqual([link.fromAgentId, link.toAgentId, link.delegated, link.returned], ["lead", "dev", 1, 1]);
  assert.equal(ledger.snapshot().tasks[0].fromAgentId, "lead");
  assert.equal(ledger.snapshot().highlights.length, 1);
});

test("restart restores completed history and marks unfinished work interrupted", t => {
  const { ledger, file, apply } = fixture(t);
  apply({ type: "TASK_STARTED", agentId: "dev", taskId: "a", prompt: "完成的任务" });
  apply({ type: "TASK_DONE", agentId: "dev", taskId: "a", result: { summary: "完成", changedFiles: [], diffStat: "", testResult: "unknown" } });
  apply({ type: "TASK_QUEUED", agentId: "dev", taskId: "b", prompt: "排队任务", position: 1 });
  apply({ type: "TASK_STARTED", agentId: "dev", taskId: "c", prompt: "执行任务" });
  const restarted = new WorkspaceLedger(file, () => 20000);
  const tasks = restarted.snapshot().tasks;
  assert.equal(tasks.find(t => t.taskId === "a")?.status, "done");
  assert.equal(tasks.find(t => t.taskId === "b")?.status, "interrupted");
  assert.equal(tasks.find(t => t.taskId === "c")?.status, "interrupted");
  assert.equal(JSON.parse(readFileSync(file, "utf8")).revision, restarted.snapshot().revision);
  assert.ok(restarted.snapshot().revision > ledger.snapshot().revision);
});

test("cancellation, failure and member removal do not masquerade as completed tasks", t => {
  const { ledger, apply } = fixture(t);
  assert.equal(apply({ type: "TASK_FAILED", agentId: "idle", taskId: "", error: "Task cancelled by user" }), false);
  apply({ type: "TASK_FAILED", agentId: "dev", taskId: "a", error: "Task cancelled by user" });
  apply({ type: "TASK_FAILED", agentId: "dev", taskId: "b", error: "执行失败" });
  apply({ type: "TASK_STARTED", agentId: "dev", taskId: "c", prompt: "进行中" });
  apply({ type: "AGENT_FIRED", agentId: "dev" });
  assert.equal(ledger.snapshot().tasks.find(t => t.taskId === "a")?.status, "cancelled");
  assert.equal(ledger.snapshot().tasks.find(t => t.taskId === "b")?.status, "failed");
  assert.equal(ledger.snapshot().tasks.find(t => t.taskId === "c")?.status, "cancelled");
});

test("streaming noise does not write history and returned snapshots cannot mutate state", t => {
  const { ledger, apply } = fixture(t);
  assert.equal(apply({ type: "LOG_APPEND", agentId: "dev", taskId: "a", stream: "stdout", chunk: "输出" }), false);
  assert.equal(apply({ type: "TOKEN_UPDATE", agentId: "dev", inputTokens: 1, outputTokens: 2 }), false);
  ledger.snapshot().tasks.push({} as never);
  assert.equal(ledger.snapshot().tasks.length, 0);
  assert.equal(ledger.snapshot().revision, 0);
});

test("invalid history is preserved instead of overwritten", t => {
  const { file, directory } = fixture(t);
  writeFileSync(file, "invalid-json");
  const fresh = new WorkspaceLedger(file, () => 10);
  assert.equal(fresh.snapshot().tasks.length, 0);
  assert.ok(readdirSync(directory).includes("history.json.invalid-10"));
});

test("retention trims finished tasks while preserving all active work", t => {
  const { file, resolve } = fixture(t);
  const tasks = Array.from({ length: 520 }, (_, i) => ({ taskId: `done-${i}`, agentId: "dev", agentName: "开发者", role: "Developer", prompt: "历史任务", status: "done", createdAt: i, updatedAt: i, changedFiles: [] }));
  writeFileSync(file, JSON.stringify({ revision: 1, tasks, highlights: [], links: [] }));
  const ledger = new WorkspaceLedger(file, () => 10000);
  ledger.prepare("active", "dev", "不能丢弃的执行任务", resolve("dev"));
  assert.equal(ledger.snapshot().tasks.length, 501);
  assert.equal(ledger.snapshot().tasks.filter(t => t.status === "queued").length, 1);
  assert.equal(ledger.snapshot().tasks.some(t => t.taskId === "done-0"), false);
  assert.equal(ledger.snapshot().tasks.some(t => t.taskId === "done-519"), true);
});

test("project scoping and recap exports include only selected project with truthful results", t => {
  const { ledger, resolve, apply } = fixture(t);
  ledger.prepare("other", "dev", "其他项目", { ...resolve("dev"), projectDir: "/projects/other" });
  apply({ type: "TASK_STARTED", agentId: "dev", taskId: "a", prompt: "当前项目" });
  apply({ type: "TASK_DONE", agentId: "dev", taskId: "a", result: { summary: "完成报告", changedFiles: ["index.html"], diffStat: "", testResult: "unknown" } });
  const scoped = scopeWorkspace(ledger.snapshot(), "/projects/site/");
  assert.equal(scoped.tasks.length, 1);
  const markdown = buildRecap(scoped, "项目", 20000);
  assert.match(markdown, /完成报告/);
  assert.match(markdown, /index.html/);
  assert.match(markdown, /测试：未确认/);
  assert.doesNotMatch(markdown, /其他项目/);
});

test("automatic assignment prefers leads and excludes external processes; explicit assignment is exact", () => {
  const agents = [
    { agentId: "external", name: "外部", status: "idle", isExternal: true },
    { agentId: "dev", name: "开发", status: "idle" },
    { agentId: "lead", name: "负责人", status: "working", isTeamLead: true },
  ];
  assert.equal(chooseAssignee(agents)?.agentId, "lead");
  assert.equal(chooseAssignee(agents, "dev")?.agentId, "dev");
  assert.equal(chooseAssignee(agents, "external"), undefined);
  assert.equal(chooseAssignee(agents, "missing"), undefined);
  assert.equal(chooseAssignee([]), undefined);
  assert.equal(CommandSchema.parse({ type: "GET_WORKSPACE" }).type, "GET_WORKSPACE");
});
