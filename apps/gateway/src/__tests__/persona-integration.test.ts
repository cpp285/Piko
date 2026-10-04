import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

test("authenticated persona editing seeds hired people and persists through a gateway restart", { timeout: 45000 }, async t => {
  const root = mkdtempSync(path.join(tmpdir(), "piko-persona-api-"));
  const workspace = path.join(root, "projects"); mkdirSync(workspace);
  writeFileSync(path.join(root, "config.json"), JSON.stringify({ defaultBackend: "codex", worktreeEnabled: false, sandboxMode: "safe" }));
  const children: ChildProcess[] = [], sockets: WebSocket[] = [];
  const stop = async (child: ChildProcess) => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = new Promise<void>(resolve => child.once("exit", () => resolve()));
    child.kill("SIGTERM"); const timer = setTimeout(() => child.kill("SIGKILL"), 2000);
    await exited; clearTimeout(timer);
  };
  t.after(async () => { sockets.forEach(ws => ws.terminate()); await Promise.all(children.map(stop)); rmSync(root, { recursive: true, force: true }); });
  async function start() {
    const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
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
    return { child, ws, exchange, persona };
  }
  const first = await start();
  const target = { kind: "definition", id: "luna" };
  const defaults = await first.persona(target); assert.equal(defaults.success, true);
  const updated = await first.persona(target, { ...defaults.documents, soul: "自定义产品经理工作方式", expectedVersion: defaults.documents.version });
  assert.equal(updated.saved, true);
  await first.exchange({ type: "CREATE_AGENT", agentId: "alice", agentDefId: "luna", name: "小王", role: "Product Manager", backend: "codex" }, event => event.type === "AGENT_CREATED" && event.agentId === "alice");
  const aliceTarget = { kind: "agent", id: "alice" };
  const alice = await first.persona(aliceTarget);
  assert.equal(alice.documents.soul, "自定义产品经理工作方式");
  assert.ok(alice.documents.identity.includes("小王"));
  const changed = await first.persona(aliceTarget, { ...alice.documents, soul: "仅小王使用的独立设定", expectedVersion: alice.documents.version });
  assert.equal(changed.success, true);
  const conflict = await first.persona(aliceTarget, { ...alice.documents, soul: "过时草稿", expectedVersion: alice.documents.version });
  assert.equal(conflict.success, false);
  assert.match(conflict.message, /草稿/);
  first.ws.close(); await stop(first.child);
  const second = await start();
  assert.equal((await second.persona(aliceTarget)).documents.soul, "仅小王使用的独立设定");
  assert.equal((await second.persona(target)).documents.soul, "自定义产品经理工作方式");
});
