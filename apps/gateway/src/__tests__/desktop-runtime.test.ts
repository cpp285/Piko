import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir, networkInterfaces } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createConnection } from "node:net";
import { request as httpRequest } from "node:http";
import WebSocket from "ws";

test("desktop gateways use distinct OS ports, isolated profiles and authenticated loopback connections", { timeout: 30000 }, async t => {
  const root = mkdtempSync(path.join(tmpdir(), "piko-desktop-"));
  const children: ChildProcess[] = [];
  const sockets: WebSocket[] = [];
  t.after(async () => {
    sockets.forEach(socket => socket.terminate());
    await Promise.all(children.map(async child => {
      if (child.exitCode !== null) return;
      const exited = new Promise<void>(resolve => child.once("exit", () => resolve()));
      child.kill("SIGTERM");
      const timer = setTimeout(() => child.kill("SIGKILL"), 2000);
      await exited;
      clearTimeout(timer);
    }));
    rmSync(root, { recursive: true, force: true });
  });
  const start = async (name: string) => {
    const profile = path.join(root, name);
    const workspace = path.join(profile, "projects");
    mkdirSync(workspace, { recursive: true });
    writeFileSync(path.join(profile, "config.json"), JSON.stringify({ defaultBackend: "codex", sandboxMode: "safe", worktreeEnabled: false }));
    const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
      cwd: fileURLToPath(new URL("../../", import.meta.url)),
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NODE_ENV: "production", NO_OPEN: "1", WS_PORT: "0", GATEWAY_ID: "desktop",
        PIKO_DESKTOP: "1", PIKO_CONFIG_DIR: profile, WORKSPACE: workspace,
        PIKO_SKIP_AGENT_SYNC: "1", PIKO_DISABLE_PROCESS_SCAN: "1",
        FEISHU_ENABLED: "false", ABLY_API_KEY: "", TELEGRAM_BOT_TOKEN: "", TELEGRAM_BOT_TOKENS: "", TUNNEL_TOKEN: "" },
    });
    children.push(child);
    let output = "";
    child.stdout!.on("data", chunk => { output = (output + chunk).slice(-20000); });
    child.stderr!.resume();
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      const ready = output.match(/^GATEWAY_READY (.+)$/m);
      if (ready) return { child, port: JSON.parse(ready[1]).port as number };
      assert.equal(child.exitCode, null, "Desktop service exited before becoming ready");
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.fail("Desktop service did not report its assigned port");
  };
  const first = await start("first");
  const second = await start("second");
  assert.ok(first.port > 0 && second.port > 0);
  assert.notEqual(first.port, second.port);
  assert.equal(first.child.exitCode, null, "Second profile must not terminate the first");

  const connection = await fetch(`http://127.0.0.1:${first.port}/connect`).then(r => r.json());
  assert.equal(connection.gatewayId, "desktop");
  assert.ok(connection.sessionToken);
  assert.ok(connection.wsUrl.endsWith(`:${first.port}`));
  for (const origin of ["https://untrusted.example", "https://localhost.untrusted.example", "null"]) {
    const response = await fetch(`http://127.0.0.1:${first.port}/connect`, { headers: { origin } });
    assert.equal(response.status, 403, `Untrusted origin ${origin} must not receive an owner token`);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    assert.equal((await response.json()).sessionToken, undefined);
  }
  const reboundStatus = await new Promise<number | undefined>((resolve, reject) => {
    const request = httpRequest(`http://127.0.0.1:${first.port}/connect`, { headers: { host: "untrusted.example" } }, response => {
      response.resume(); resolve(response.statusCode);
    });
    request.on("error", reject); request.end();
  });
  assert.equal(reboundStatus, 403, "A rebound Host must not bootstrap a local owner session");
  for (const origin of ["tauri://localhost", "http://tauri.localhost", "http://localhost:3000", `http://127.0.0.1:${first.port}`]) {
    const response = await fetch(`http://127.0.0.1:${first.port}/connect`, { headers: { origin } });
    assert.equal(response.status, 200, `Local app origin ${origin} must still connect`);
    assert.equal(response.headers.get("access-control-allow-origin"), origin);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  const open = async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${first.port}`);
    sockets.push(ws);
    await new Promise<void>((resolve, reject) => { ws.once("open", resolve); ws.once("error", reject); });
    return ws;
  };
  const rejected = await open();
  const rejection = new Promise<any>(resolve => rejected.once("message", raw => resolve(JSON.parse(String(raw)))));
  rejected.send(JSON.stringify({ type: "AUTH", sessionToken: "invalid" }));
  assert.equal((await rejection).type, "AUTH_FAILED");
  const accepted = await open();
  const sync = new Promise<any>(resolve => accepted.on("message", raw => {
    const event = JSON.parse(String(raw));
    if (event.type === "AGENTS_SYNC") resolve(event);
  }));
  accepted.send(JSON.stringify({ type: "AUTH", sessionToken: connection.sessionToken }));
  accepted.send(JSON.stringify({ type: "PING" }));
  assert.deepEqual((await sync).agentIds, []);

  const lan = Object.values(networkInterfaces()).flat().find(address => address?.family === "IPv4" && !address.internal);
  if (lan) {
    const reachable = await new Promise<boolean>(resolve => {
      const socket = createConnection({ host: lan.address, port: first.port });
      const finish = (value: boolean) => { socket.destroy(); resolve(value); };
      socket.once("connect", () => finish(true));
      socket.once("error", () => finish(false));
      socket.setTimeout(1000, () => finish(false));
    });
    assert.equal(reachable, false, "Desktop service must not listen on the LAN interface");
  }
});
