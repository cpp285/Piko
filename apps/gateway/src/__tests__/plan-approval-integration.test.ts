import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import WebSocket from "ws";
import { GatewayEventSchema, type GatewayEvent } from "@piko/shared";

for (const approval of ["可以，你安排人去做吧，检查完了之后给我说", "你分配下去呀", "button"]) {
test(`gateway executes approved plans via ${approval}, including after restart`, { timeout: 25000 }, async t => {
  const root = mkdtempSync(path.join(tmpdir(), "office-integration-"));
  const workspace = path.join(root, "projects");
  const bin = path.join(root, "bin");
  mkdirSync(workspace); mkdirSync(bin);
  writeFileSync(path.join(root, "config.json"), JSON.stringify({ defaultBackend: "codex", sandboxMode: "safe", worktreeEnabled: false, autoMergeEnabled: false }));
  // A real child process substitutes only the model call; no AI account or network is used.
  const executable = path.join(bin, "codex");
  const promptLog = path.join(root, "prompts.jsonl");
  writeFileSync(executable, `#!${process.execPath}
    const fs = require("node:fs");
    if (process.argv.includes("--version")) { console.log("codex-cli 0.159.2"); process.exit(0); }
    const prompt = process.argv[3] || "";
    fs.appendFileSync(${JSON.stringify(promptLog)}, JSON.stringify(prompt) + "\\n");
    if (prompt.includes("refining the project vision")) {
      console.log("[PLAN]CONCEPT: Snake — revised orange game. ASSIGNMENTS: 张伟 builds, 李敏 reviews.[/PLAN]");
    } else if (prompt.includes("team's Creative Director")) {
      console.log(prompt.includes("Greet the user") ? "你好，请描述项目。" : "[PLAN]CONCEPT: Snake — initial green game. ASSIGNMENTS: 张伟 builds, 李敏 reviews.[/PLAN]");
    } else if (prompt.includes("You CANNOT write code")) {
      console.log("@张伟：实现已批准的贪吃蛇游戏\\n包含橙色界面、移动和碰撞、暂停以及手机操作。");
    } else {
      console.log("开发者已经开始任务");
      setTimeout(() => console.log("SUMMARY: Done"), 18000);
    }
  `);
  chmodSync(executable, 0o755);
  const probe = createServer();
  await new Promise<void>(resolve => probe.listen(0, "127.0.0.1", resolve));
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>(resolve => probe.close(() => resolve()));
  const gatewayDirectory = fileURLToPath(new URL("../../", import.meta.url));
  const startGateway = () => spawn(process.execPath, ["--import", "tsx", "src/index.ts"], { cwd: gatewayDirectory, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NODE_ENV: "production", NO_OPEN: "1", WS_PORT: String(port), GATEWAY_ID: "test",
      PIKO_CONFIG_DIR: root, WORKSPACE: workspace, PIKO_SKIP_AGENT_SYNC: "1", PIKO_DISABLE_PROCESS_SCAN: "1",
      PIKO_CODEX_PATH: executable,
      FEISHU_ENABLED: "false", FEISHU_APP_ID: undefined, FEISHU_APP_SECRET: undefined, FEISHU_ALLOWED_USERS: undefined,
      ABLY_API_KEY: "", TELEGRAM_BOT_TOKEN: "", TELEGRAM_BOT_TOKENS: "", TUNNEL_TOKEN: "",
      PATH: `${bin}${path.delimiter}${process.env.PATH}` },
  });
  let child = startGateway();
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
  send({ type: "CREATE_TEAM", leadId: "marcus", memberIds: ["rex", "sophie"], workDir: workspace,
    backends: { marcus: "codex", rex: "codex", sophie: "codex" } });
  const team = await wait(e => e.type === "TEAM_PHASE" && e.phase === "create");
  assert.equal(team.type, "TEAM_PHASE");
  if (team.type !== "TEAM_PHASE") return;
  const lead = team.leadAgentId;
  await wait(e => e.type === "TASK_DONE" && e.agentId === lead);
  send({ type: "RUN_TASK", agentId: lead, taskId: "plan", prompt: "做一个贪吃蛇小游戏" });
  const plan = await wait(e => e.type === "TASK_DONE" && e.taskId === "plan");
  assert.equal(plan.type === "TASK_DONE" && !!plan.isFinalResult, false);
  await wait(e => e.type === "TEAM_PHASE" && e.phase === "design");
  send({ type: "RUN_TASK", agentId: lead, taskId: "revision", prompt: "把绿色改成橙色" });
  const revised = await wait(e => e.type === "TASK_DONE" && e.taskId === "revision");
  assert.equal(revised.type === "TASK_DONE" && !!revised.isFinalResult, false);
  const statePath = path.join(root, "data/instances/test/team-state.json");
  const readState = () => JSON.parse(readFileSync(statePath, "utf8"));
  assert.equal(readState().team.phase, "design");
  assert.ok(readState().team.originalTask.includes("revised orange game"));
  assert.equal(events.some(e => e.type === "TASK_DELEGATED"), false);

  // Restart really clears in-memory lastFullOutput. The persisted revised plan must survive.
  socket.close();
  await new Promise<void>(resolve => { child.once("exit", () => resolve()); child.kill("SIGTERM"); });
  child = startGateway();
  child.stdout.on("data", chunk => { output = (output + chunk).slice(-10000); });
  child.stderr.on("data", chunk => { output = (output + chunk).slice(-10000); });
  connection = undefined;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/connect`);
      if (response.ok) { connection = await response.json() as { sessionToken: string }; break; }
    } catch { /* restarting */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(connection, output);
  socket = new WebSocket(`ws://127.0.0.1:${port}`);
  socket.on("message", raw => {
    const parsed = GatewayEventSchema.safeParse(JSON.parse(String(raw)));
    if (parsed.success) events.push(parsed.data);
  });
  await new Promise<void>((resolve, reject) => { socket!.once("open", resolve); socket!.once("error", reject); });
  send({ type: "AUTH", sessionToken: connection.sessionToken });
  if (approval === "button") send({ type: "APPROVE_PLAN", agentId: lead });
  else send({ type: "RUN_TASK", agentId: lead, taskId: "approval", prompt: approval });
  await wait(e => e.type === "TEAM_PHASE" && e.phase === "execute");
  const delegated = await wait(e => e.type === "TASK_DELEGATED");
  assert.equal(delegated.type, "TASK_DELEGATED");
  if (delegated.type !== "TASK_DELEGATED") return;
  await wait(e => e.type === "TASK_STARTED" && e.agentId === delegated.toAgentId);
  await wait(e => e.type === "LOG_APPEND" && e.agentId === delegated.toAgentId && e.chunk.includes("开发者已经开始任务"));
  const state = readState();
  assert.equal(state.agents.find((a: { agentId: string }) => a.agentId === delegated.toAgentId).name, "张伟");
  assert.ok(state.team.projectDir.startsWith(workspace + path.sep));
  assert.ok(state.team.originalTask.includes("revised orange game"));
  const prompts = readFileSync(promptLog, "utf8").trim().split("\n").map(line => JSON.parse(line) as string);
  const execution = prompts.find(p => p.includes("The user approved the plan."));
  assert.ok(execution?.includes("revised orange game"));
  assert.ok(execution?.includes("张伟"));
  assert.ok(execution?.includes("李敏"));
  assert.equal(execution?.includes("Do NOT delegate or write code"), false);
  assert.ok(prompts.some(p => p.includes("实现已批准的贪吃蛇游戏") && p.includes("包含橙色界面、移动和碰撞、暂停以及手机操作。")));
  const projectsBefore = readdirSync(workspace);
  const afterDelegation = events.length;
  send({ type: "APPROVE_PLAN", agentId: lead });
  send({ type: "GET_WORKSPACE" });
  await wait(e => events.indexOf(e) >= afterDelegation && e.type === "WORKSPACE_SYNC");
  assert.deepEqual(readdirSync(workspace), projectsBefore);
  assert.equal(events.filter(e => e.type === "TASK_DELEGATED").length, 1);
  send({ type: "STOP_TEAM", teamId: team.teamId });
  await wait(e => e.type === "TASK_FAILED" && e.agentId === delegated.toAgentId);
});
}
