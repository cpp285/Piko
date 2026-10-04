import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import WebSocket from "ws";
import { GatewayEventSchema, type GatewayEvent } from "@piko/shared";

test("real gateway executes CLI tasks, queues, cancels and synchronizes persistent workspace history", { timeout: 20000 }, async t => {
  const root = mkdtempSync(path.join(tmpdir(), "office-integration-"));
  const workspace = path.join(root, "projects");
  const bin = path.join(root, "bin");
  mkdirSync(workspace); mkdirSync(bin);
  writeFileSync(path.join(root, "config.json"), JSON.stringify({ defaultBackend: "codex", sandboxMode: "safe", worktreeEnabled: false, autoMergeEnabled: false }));
  // A real child process substitutes only the model call; no AI account or network is used.
  const executable = path.join(bin, "codex");
  writeFileSync(executable, `#!${process.execPath}\nconst args = process.argv.join(" ");
    if (args.includes("--version")) { console.log("codex-cli 0.159.2"); process.exit(0); }
    console.log("Local integration execution");
    setTimeout(() => console.log("SUMMARY: Integration complete\\nFILES_CHANGED: none"), args.includes("slow-task") ? 12000 : 400);`);
  chmodSync(executable, 0o755);
  const probe = createServer();
  await new Promise<void>(resolve => probe.listen(0, "127.0.0.1", resolve));
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>(resolve => probe.close(() => resolve()));
  const gatewayDirectory = fileURLToPath(new URL("../../", import.meta.url));
  const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], { cwd: gatewayDirectory, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NODE_ENV: "production", NO_OPEN: "1", WS_PORT: String(port), GATEWAY_ID: "test",
      PIKO_CONFIG_DIR: root, WORKSPACE: workspace, PIKO_SKIP_AGENT_SYNC: "1", PIKO_DISABLE_PROCESS_SCAN: "1",
      PIKO_CODEX_PATH: executable,
      FEISHU_ENABLED: "false", FEISHU_APP_ID: undefined, FEISHU_APP_SECRET: undefined, FEISHU_ALLOWED_USERS: undefined,
      ABLY_API_KEY: "", TELEGRAM_BOT_TOKEN: "", TELEGRAM_BOT_TOKENS: "", TUNNEL_TOKEN: "",
      PATH: `${bin}${path.delimiter}${process.env.PATH}` },
  });
  let output = "";
  child.stdout.on("data", chunk => { output = (output + chunk).slice(-10000); });
  child.stderr.on("data", chunk => { output = (output + chunk).slice(-10000); });
  let socket: WebSocket | undefined;
  t.after(async () => {
    socket?.close();
    if (child.exitCode === null) {
      const closed = new Promise<void>(resolve => child.once("exit", () => resolve()));
      child.kill("SIGTERM");
      const timer = setTimeout(() => child.kill("SIGKILL"), 2000);
      await closed; clearTimeout(timer);
    }
    rmSync(root, { recursive: true, force: true });
  });
  let connection: { sessionToken: string } | undefined;
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/connect`);
      if (response.ok) { connection = await response.json() as { sessionToken: string }; break; }
    } catch { /* wait for startup */ }
    assert.equal(child.exitCode, null, output);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(connection, output);
  socket = new WebSocket(`ws://127.0.0.1:${port}`);
  const events: GatewayEvent[] = [];
  socket.on("message", raw => {
    const parsed = GatewayEventSchema.safeParse(JSON.parse(String(raw)));
    if (parsed.success) events.push(parsed.data);
  });
  await new Promise<void>((resolve, reject) => { socket!.once("open", resolve); socket!.once("error", reject); });
  const send = (command: Record<string, unknown>) => socket!.send(JSON.stringify(command));
  const wait = async (predicate: (e: GatewayEvent) => boolean) => {
    const deadline = Date.now() + 6000;
    while (Date.now() < deadline) {
      const event = events.find(predicate);
      if (event) return event;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.fail(`Expected event was not received. ${output}`);
  };
  send({ type: "AUTH", sessionToken: connection.sessionToken });
  send({ type: "GET_CONFIG" });
  const initial = await wait(e => e.type === "CONFIG_LOADED");
  assert.equal(initial.type, "CONFIG_LOADED");
  if (initial.type === "CONFIG_LOADED") {
    assert.equal(initial.feishuConnected, false);
    assert.equal(initial.feishuSecretConfigured, false);
    assert.equal("feishuAppSecret" in initial, false);
  }
  send({ type: "SAVE_CONFIG", requestId: "local-save", feishuEnabled: false, feishuAppSecret: "test-secret-not-live", feishuAllowedUsers: ["ou_example"] });
  const savedConfig = await wait(e => e.type === "CONFIG_SAVED" && e.requestId === "local-save");
  assert.equal(savedConfig.type === "CONFIG_SAVED" && savedConfig.success, true);
  const configOnDisk = JSON.parse(readFileSync(path.join(root, "config.json"), "utf8"));
  assert.equal(configOnDisk.feishuAppSecret, "test-secret-not-live");
  assert.deepEqual(configOnDisk.feishuAllowedUsers, ["ou_example"]);
  const configStart = events.length;
  send({ type: "GET_CONFIG" });
  const masked = await wait(e => events.indexOf(e) >= configStart && e.type === "CONFIG_LOADED");
  assert.equal(masked.type === "CONFIG_LOADED" && masked.feishuSecretConfigured, true);
  assert.ok(!JSON.stringify(events).includes("test-secret-not-live"));
  send({ type: "SAVE_CONFIG", requestId: "bad-feishu", feishuEnabled: true, feishuAppId: "invalid" });
  const rejectedConfig = await wait(e => e.type === "CONFIG_SAVED" && e.requestId === "bad-feishu");
  assert.equal(rejectedConfig.type === "CONFIG_SAVED" && rejectedConfig.success, false);
  send({ type: "SAVE_CONFIG", requestId: "clear-feishu", feishuEnabled: false, feishuAppSecret: "" });
  const clearedConfig = await wait(e => e.type === "CONFIG_SAVED" && e.requestId === "clear-feishu");
  assert.equal(clearedConfig.type === "CONFIG_SAVED" && clearedConfig.success, true);
  send({ type: "CREATE_AGENT", agentId: "dev", name: "Integration Developer", role: "Developer", backend: "codex", workDir: workspace });
  await wait(e => e.type === "AGENT_CREATED" && e.agentId === "dev");
  send({ type: "RUN_TASK", agentId: "dev", taskId: "first", prompt: "first task", repoPath: workspace });
  await wait(e => e.type === "TASK_STARTED" && e.taskId === "first");
  send({ type: "RUN_TASK", agentId: "dev", taskId: "second", prompt: "second task", repoPath: workspace });
  await wait(e => e.type === "TASK_QUEUED" && e.taskId === "second");
  await wait(e => e.type === "WORKSPACE_SYNC" && e.snapshot.tasks.filter(t => t.status === "done").length === 2);
  send({ type: "RUN_TASK", agentId: "dev", taskId: "cancel", prompt: "slow-task", repoPath: workspace });
  await wait(e => e.type === "TASK_STARTED" && e.taskId === "cancel");
  send({ type: "CANCEL_TASK", agentId: "dev", taskId: "cancel" });
  await wait(e => e.type === "WORKSPACE_SYNC" && e.snapshot.tasks.some(t => t.taskId === "cancel" && t.status === "cancelled"));
  send({ type: "RUN_TASK", agentId: "missing", taskId: "rejected", prompt: "must fail" });
  await wait(e => e.type === "WORKSPACE_SYNC" && e.snapshot.tasks.some(t => t.taskId === "rejected" && t.status === "failed"));
  const saved = JSON.parse(readFileSync(path.join(root, "data/instances/test/workspace-history.json"), "utf8"));
  assert.equal(saved.tasks.length, 4);
  assert.equal(saved.tasks.find((task: { taskId: string }) => task.taskId === "first").summary, "Integration complete");
  const start = events.length;
  send({ type: "GET_WORKSPACE" });
  await wait(e => events.indexOf(e) >= start && e.type === "WORKSPACE_SYNC" && e.snapshot.revision === saved.revision);

  const teamDirectory = path.join(workspace, "chosen-game-folder");
  mkdirSync(teamDirectory);
  const teamStart = events.length;
  send({ type: "CREATE_TEAM", leadId: "marcus", memberIds: ["alex", "luna", "nova", "sophie", "nova"], workDir: teamDirectory,
    backends: { marcus: "codex", alex: "codex", luna: "codex", nova: "codex", sophie: "codex" } });
  const teamReady = await wait(e => events.indexOf(e) >= teamStart && e.type === "TEAM_PHASE" && e.phase === "create");
  assert.equal(teamReady.type, "TEAM_PHASE");
  const teamMembers = events.slice(teamStart).filter(e => e.type === "AGENT_CREATED" && e.teamId);
  assert.equal(teamMembers.length, 5);
  assert.ok(teamMembers.some(e => e.type === "AGENT_CREATED" && e.role.startsWith("Product Manager")));
  assert.ok(teamMembers.some(e => e.type === "AGENT_CREATED" && e.role.startsWith("UI Designer")));
  for (const member of teamMembers) {
    if (member.type !== "AGENT_CREATED") continue;
    assert.equal(member.workDir, teamDirectory);
    assert.ok(events.some(e => e.type === "AUTO_MERGE_UPDATED" && e.agentId === member.agentId && e.autoMerge === false));
  }
  const persistedTeam = JSON.parse(readFileSync(path.join(root, "data/instances/test/team-state.json"), "utf8"));
  assert.equal(persistedTeam.agents.filter((a: { teamId?: string; workDir?: string }) => a.teamId && a.workDir === teamDirectory).length, 5);
  const duplicateStart = events.length;
  send({ type: "CREATE_TEAM", leadId: "marcus", memberIds: ["alex", "sophie"], workDir: workspace });
  await wait(e => events.indexOf(e) >= duplicateStart && e.type === "TEAM_CHAT" && e.messageType === "warning");
  assert.equal(events.slice(duplicateStart).some(e => e.type === "AGENT_FIRED" || e.type === "AGENT_CREATED"), false);
  const retainedTeam = JSON.parse(readFileSync(path.join(root, "data/instances/test/team-state.json"), "utf8"));
  assert.deepEqual(retainedTeam.agents.map((a: { agentId: string }) => a.agentId), persistedTeam.agents.map((a: { agentId: string }) => a.agentId));
});
