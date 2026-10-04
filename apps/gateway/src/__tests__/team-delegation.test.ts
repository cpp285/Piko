import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { AgentSession, setSessionDir, setStorageRoot, parseDelegationLine, type OrchestratorEvent } from "@piko/orchestrator";

test("delegations accept localized names, punctuation and Markdown", () => {
  for (const line of ["@林悦: 开发游戏", "**@林悦:** 开发游戏", "- @林悦：开发游戏", "@Alex: 开发游戏", "@Jean-Luc: 开发游戏"]) {
    assert.equal(parseDelegationLine(line)?.prompt, "开发游戏");
  }
  assert.equal(parseDelegationLine("请联系 name@example.com"), null);
  assert.equal(parseDelegationLine("@林悦: 开发游戏")?.targetName, "林悦");
});

test("stopping twice cancels running and queued tasks once, without empty phantom tasks", { timeout: 10000 }, async t => {
  const root = mkdtempSync(path.join(tmpdir(), "office-cancel-"));
  setSessionDir(root); setStorageRoot(path.join(root, "memory"));
  const events: OrchestratorEvent[] = [];
  const session = new AgentSession({ agentId: "dev", name: "林悦", role: "Developer", workspace: root,
    sandboxMode: "safe", renderPrompt: () => "fixture",
    backend: { id: "fixture", name: "Fixture", command: process.execPath, buildArgs: () => ["-e", "setTimeout(() => {}, 10000)"] },
    onEvent: event => { events.push(event); },
  });
  t.after(() => { session.destroy(); rmSync(root, { recursive: true, force: true }); });
  session.cancelTask();
  assert.equal(events.some(e => e.type === "task:failed"), false);
  await session.runTask("running", "work", undefined, undefined, true);
  await session.runTask("queued", "more work", undefined, undefined, true);
  session.cancelTask(); session.cancelTask();
  assert.deepEqual(events.filter(e => e.type === "task:failed").map(e => e.taskId).sort(), ["queued", "running"]);
});

test("a real plain-text CLI preserves multiline delegation across stdout chunks", { timeout: 10000 }, async t => {
  const root = mkdtempSync(path.join(tmpdir(), "office-delegation-"));
  setSessionDir(root);
  setStorageRoot(path.join(root, "memory"));
  const delegated: { name: string; prompt: string }[] = [];
  let finish!: () => void;
  const done = new Promise<void>(resolve => { finish = resolve; });
  const session = new AgentSession({ agentId: "lead", name: "陈峰", role: "Team Lead", workspace: root,
    isTeamLead: true, sandboxMode: "safe", renderPrompt: () => "fixture",
    backend: { id: "fixture", name: "Fixture", command: process.execPath, buildArgs: () => ["-e", `
      process.stdout.write('@林悦：实现游戏\\n1. 开始和暂停\\n');
      setTimeout(() => process.stdout.write('2. 手机按钮与最高分\\n3. 重新开始'), 60);
    `] },
    onEvent: event => { if (event.type === "task:done") finish(); },
  });
  t.after(() => { session.destroy(); rmSync(root, { recursive: true, force: true }); });
  session.onDelegation = (_id, name, prompt) => delegated.push({ name, prompt });
  await session.runTask("task", "fixture");
  await done;
  assert.deepEqual(delegated, [{ name: "林悦", prompt: "实现游戏\n1. 开始和暂停\n2. 手机按钮与最高分\n3. 重新开始" }]);
});
