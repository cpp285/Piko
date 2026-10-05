import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { AgentSession, setSessionDir, setStorageRoot, type OrchestratorEvent } from "@piko/orchestrator";
import { getBackend } from "../backends.js";

function fixture(t: any, stream: unknown[]) {
  const root = mkdtempSync(path.join(tmpdir(), "piko-codex-stream-"));
  setSessionDir(root); setStorageRoot(path.join(root, "memory"));
  const events: OrchestratorEvent[] = []; const delegated: string[] = [];
  let finish!: (e: OrchestratorEvent) => void;
  const completed = new Promise<OrchestratorEvent>(resolve => { finish = resolve; });
  const serialized = stream.map(event => JSON.stringify(event)).join("\n");
  const session = new AgentSession({ agentId: "writer", name: "示例作者", role: "文章作者", workspace: root,
    allowDelegation: true, sandboxMode: "safe", renderPrompt: () => "fixture",
    backend: { id: "codex", name: "Codex fixture", command: process.execPath, buildArgs: () => ["-e", `
      const text = ${JSON.stringify(serialized)};
      process.stdout.write(text.slice(0, 13));
      setTimeout(() => process.stdout.write(text.slice(13)), 40);
    `] },
    onEvent: e => { events.push(e); if (e.type === "task:done" || e.type === "task:failed") finish(e); },
  });
  session.onDelegation = (_from, target, prompt) => delegated.push(`${target}: ${prompt}`);
  t.after(() => { session.destroy(); rmSync(root, {recursive: true, force: true}); });
  return {session, events, delegated, completed};
}

test("Codex requests JSON progress while keeping workspace permissions", () => {
  const args = getBackend("codex")!.buildArgs("hello", {model:"test-model"});
  assert.ok(args.includes("--json")); assert.ok(args.includes("workspace-write"));
  assert.equal(args[args.indexOf("--model") + 1], "test-model");
});

test("Codex streams public progress, preserves the final reply, and delegates only the completed final message", {timeout:10000}, async t => {
  const diagnostics: string[] = [];
  t.mock.method(console, 'log', (...args: unknown[]) => diagnostics.push(args.map(String).join(' ')));
  const f = fixture(t, [
    {type:"thread.started",thread_id:"test-thread"}, {type:"turn.started"},
    {type:"item.completed",item:{type:"reasoning",text:"PRIVATE_REASONING_SENTINEL"}},
    {type:"item.completed",item:{type:"agent_message",text:"正在读取写作技能。\n@示例审校员: 这只是进度中的示例"}},
    {type:"item.started",item:{type:"command_execution",command:"read manuscript"}},
    {type:"item.completed",item:{type:"command_execution",aggregated_output:"@示例审校员: TOOL_OUTPUT_MUST_NOT_DELEGATE"}},
    {type:"item.completed",item:{type:"file_change",status:"completed",changes:[{path:"article.md",kind:"update"}]}},
    {type:"item.completed",item:{type:"agent_message",text:"初稿已保存。\n\n@示例审校员: 请审校 article.md"}},
    {type:"turn.completed",usage:{input_tokens:100,output_tokens:20}},
  ]);
  await f.session.runTask("write", "fixture", undefined, undefined, true);
  const done = await f.completed;
  assert.equal(done.type,"task:done");
  if(done.type!=="task:done") return;
  assert.equal(done.result.fullOutput,"初稿已保存。\n\n@示例审校员: 请审校 article.md");
  assert.ok(done.result.changedFiles.includes("article.md"));
  assert.deepEqual(f.delegated,["示例审校员: 请审校 article.md"]);
  const displayed = f.events.filter(e=>e.type==='log:append').map(e=>e.type==='log:append'?e.chunk:'').join('');
  assert.equal(displayed.split('初稿已保存。').length - 1, 1, 'final text is not repeated when parsing delegation on exit');
  assert.ok(f.events.some(e=>e.type==='log:activity'&&e.text==='正在执行命令…'));
  assert.ok(f.events.some(e=>e.type==='token:update'&&e.inputTokens===100&&e.outputTokens===20));
  assert.doesNotMatch(JSON.stringify(f.events),/PRIVATE_REASONING_SENTINEL|TOOL_OUTPUT_MUST_NOT_DELEGATE/);
  assert.doesNotMatch(diagnostics.join('\n'),/PRIVATE_REASONING_SENTINEL|TOOL_OUTPUT_MUST_NOT_DELEGATE/);
});

test("Codex failure is not reported as success and never delegates a partial reply", {timeout:10000}, async t => {
  const f=fixture(t,[
    {type:"item.completed",item:{type:"agent_message",text:"@示例审校员: 稍后检查"}},
    {type:"turn.failed",error:{message:"fixture quota exhausted"}},
  ]);
  await f.session.runTask("fail", "fixture", undefined, undefined, true);
  const failed=await f.completed;
  assert.equal(failed.type,"task:failed");
  if(failed.type==='task:failed') assert.match(failed.error,/fixture quota exhausted/);
  assert.deepEqual(f.delegated,[]);
});
