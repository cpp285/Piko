import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

test("workroom authenticated API executes optional-folder chats, saves member settings, and restores conversations", { timeout: 45000 }, async t => {
  const root = mkdtempSync(path.join(tmpdir(), "piko-workroom-api-"));
  const workspace = path.join(root, "projects"); mkdirSync(workspace);
  writeFileSync(path.join(root, "config.json"), JSON.stringify({ defaultBackend: "qwen", worktreeEnabled: false, sandboxMode: "safe" }));
  const instance = path.join(root, "data", "instances", "persona-check"); mkdirSync(instance, { recursive: true });
  writeFileSync(path.join(instance, "session-tokens.json"), JSON.stringify({ "fixture-spectator": "spectator" }));
  const children: ChildProcess[] = [], sockets: WebSocket[] = [];
  const stop = async (child: ChildProcess) => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = new Promise<void>(resolve => child.once("exit", () => resolve()));
    child.kill("SIGTERM"); const timer = setTimeout(() => child.kill("SIGKILL"), 2000);
    await exited; clearTimeout(timer);
  };
  t.after(async () => { sockets.forEach(ws => ws.terminate()); await Promise.all(children.map(stop)); rmSync(root, { recursive: true, force: true }); });
  async function start() {
    const child = spawn(process.execPath, ["--import", "tsx", "src/__tests__/fixtures/workroom-gateway.ts"], {
      cwd: fileURLToPath(new URL("../../", import.meta.url)), stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NODE_ENV: "production", NO_OPEN: "1", WS_PORT: "0", GATEWAY_ID: "persona-check", PIKO_DESKTOP: "1", PIKO_CONFIG_DIR: root, WORKSPACE: workspace, PIKO_SKIP_AGENT_SYNC: "1", PIKO_DISABLE_PROCESS_SCAN: "1", FEISHU_ENABLED: "false", ABLY_API_KEY: "", TELEGRAM_BOT_TOKEN: "", TELEGRAM_BOT_TOKENS: "", TUNNEL_TOKEN: "" },
    });
    children.push(child); let output = "";
    child.stdout!.on("data", data => { output = (output + data).slice(-20000); }); child.stderr!.resume();
    let port = 0;
    for (let i = 0; i < 240; i++) {
      const match = output.match(/^GATEWAY_READY (.+)$/m);
      if (match) { port = JSON.parse(match[1]).port; break; }
      assert.equal(child.exitCode, null, "Gateway exited during startup");
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.ok(port, "Gateway did not become ready");
    const info = await fetch(`http://127.0.0.1:${port}/connect`).then(r => r.json());
    const ws = new WebSocket(`ws://127.0.0.1:${port}`); sockets.push(ws);
    await new Promise<void>((resolve, reject) => { ws.once("open", resolve); ws.once("error", reject); });
    const exchange = (command: Record<string, unknown>, match: (event: any) => boolean) => new Promise<any>((resolve, reject) => {
      const handler = (raw: WebSocket.RawData) => { const event = JSON.parse(String(raw)); if (match(event)) { clearTimeout(timer); ws.off("message", handler); resolve(event); } };
      const timer = setTimeout(() => { ws.off("message", handler); reject(new Error(`No response to ${command.type}`)); }, 3000);
      ws.on("message", handler); ws.send(JSON.stringify(command));
    });
    ws.send(JSON.stringify({ type: "AUTH", sessionToken: info.sessionToken }));
    await exchange({ type: "PING" }, event => event.type === "AGENTS_SYNC");
    let n = 0;
    const persona = async (target: { kind: string; id: string }, change?: any) => {
      const requestId = `r${n++}`;
      return exchange({ type: change ? "SAVE_AGENT_PERSONA" : "GET_AGENT_PERSONA", requestId, target, ...change }, event => event.type === "AGENT_PERSONA" && event.requestId === requestId);
    };
    return { child, ws, exchange, persona, port };
  }
  const first = await start();
  const spectator = new WebSocket(`ws://127.0.0.1:${first.port}`); sockets.push(spectator);
  await new Promise<void>((resolve, reject) => { spectator.once("open", resolve); spectator.once("error", reject); });
  const visibleToSpectator: string[] = [];
  spectator.on("message", raw => visibleToSpectator.push(JSON.parse(String(raw)).type));
  spectator.send(JSON.stringify({ type: "AUTH", sessionToken: "fixture-spectator" }));
  spectator.send(JSON.stringify({ type: "PING" }));
  spectator.send(JSON.stringify({ type: "WORKROOM", requestId: "forbidden", action: { op: "sync" } }));
  let snapshot: any;
  first.ws.on("message", raw => { const event = JSON.parse(String(raw)); if (event.type === "WORKROOM_SYNC") snapshot = event.snapshot; });
  let counter = 0;
  const call = (client: Awaited<ReturnType<typeof start>>, action: any) => {
    const requestId = `workroom-${counter++}`;
    return client.exchange({ type: "WORKROOM", requestId, action }, event => event.type === "WORKROOM_RESULT" && event.requestId === requestId);
  };
  await call(first, { op: "sync" });
  assert.equal(snapshot.members.length, 8);
  const memberKey = "definition:luna";
  const saved = await call(first, { op: "settings", memberKey, expectedVersion: snapshot.settingsVersions[memberKey], settings: { skills: [{ id: "s", title: "测试技能", source: "text", content: "SKILL_MARKER", enabled: true }], knowledge: [{ id: "k", title: "测试资料", source: "text", content: "KNOWLEDGE_MARKER", enabled: true }] } });
  assert.equal(saved.success, true);
  const created = await call(first, { op: "create", kind: "direct", name: "王欣", memberKeys: [memberKey], folder: null });
  assert.equal(created.success, true);
  const roomId = created.conversationId;
  assert.equal((await call(first, { op: "send", conversationId: roomId, text: "你好", messageId: "once" })).success, true);
  for (let i = 0; i < 100; i++) { if (snapshot.conversations[0].messages.some((m: any) => m.sender === memberKey && m.state === "done")) break; await new Promise(resolve => setTimeout(resolve, 50)); }
  assert.match(snapshot.conversations[0].messages.at(-1).text, /技能已读取.*知识资料已读取/);
  assert.equal(snapshot.conversations[0].folder, null);
  const group = await call(first, { op: "create", kind: "group", name: "随便聊聊", memberKeys: [memberKey, "definition:nova"], folder: workspace });
  assert.equal(group.success, true);
  assert.equal((await call(first, { op: "update", conversationId: group.conversationId, name: "随便聊聊", memberKeys: [memberKey, "definition:nova"], coordinator: memberKey, folder: null })).success, true);
  assert.ok(visibleToSpectator.includes("AGENTS_SYNC"));
  assert.ok(!visibleToSpectator.some(type => type.startsWith("WORKROOM")), "Spectators must not receive private conversation or member resource data");
  const editorDef = { id: "custom-editor", name: "小林", role: "文章编辑", skills: "编辑公众号稿件", personality: "简洁", palette: 8, isBuiltin: false, teamRole: "dev" };
  const savedPerson = await first.exchange({ type: "SAVE_AGENT_DEF", requestId: "create-editor", agent: editorDef, initialPersona: { identity: "我是小林，文章编辑", soul: "KNOWLEDGE_MARKER：先核实引用，再交付稿件。" } }, event => event.type === "AGENT_DEF_SAVED" && event.requestId === "create-editor");
  assert.equal(savedPerson.success, true);
  assert.equal((await first.persona({ kind: "definition", id: editorDef.id })).documents.identity, "我是小林，文章编辑");
  const editorChat = await call(first, { op: "create", kind: "direct", name: "小林", memberKeys: ["definition:custom-editor"], folder: null });
  assert.equal((await call(first, { op: "send", conversationId: editorChat.conversationId, text: "编辑一段说明", messageId: "editor-check" })).success, true);
  for (let i = 0; i < 100; i++) { if (snapshot.conversations.find((r: any) => r.id === editorChat.conversationId)?.messages.some((m: any) => m.sender === "definition:custom-editor" && m.state === "done")) break; await new Promise(resolve => setTimeout(resolve, 50)); }
  assert.match(snapshot.conversations.find((r: any) => r.id === editorChat.conversationId).messages.at(-1).text, /知识资料已读取/);
  await first.exchange({ type: "SAVE_AGENT_DEF", requestId: "retry-editor", agent: editorDef, initialPersona: { identity: "不应覆盖", soul: "不应覆盖" } }, event => event.type === "AGENT_DEF_SAVED" && event.requestId === "retry-editor");
  spectator.close(); first.ws.close(); await stop(first.child);
  const second = await start();
  second.ws.on("message", raw => { const event = JSON.parse(String(raw)); if (event.type === "WORKROOM_SYNC") snapshot = event.snapshot; });
  await call(second, { op: "sync" });
  assert.equal(snapshot.conversations.length, 3);
  assert.equal(snapshot.members.find((m: any) => m.key === "definition:custom-editor").palette, 8);
  assert.equal((await second.persona({ kind: "definition", id: "custom-editor" })).documents.soul, "KNOWLEDGE_MARKER：先核实引用，再交付稿件。");
  assert.equal(snapshot.settings[memberKey].knowledge[0].content, "KNOWLEDGE_MARKER");
  assert.match(snapshot.conversations[0].messages.at(-1).text, /测试回复/);
});
