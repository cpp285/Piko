import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const state = path.join(root, ".review-runtime", "local");
const workspace = path.join(state, "projects");
const configFile = path.join(state, "config.json");
mkdirSync(workspace, { recursive: true });
if (!existsSync(configFile)) {
  writeFileSync(configFile, JSON.stringify({ defaultBackend: "codex", sandboxMode: "safe", worktreeEnabled: true, autoMergeEnabled: false }, null, 2));
}
if (!existsSync(path.join(root, "apps/gateway/dist/web/index.html"))) {
  console.error("请先运行 pnpm build:release，再运行 pnpm review。");
  process.exit(1);
}
const port = process.env.WS_PORT || "9096";
console.log(`本地检查页面：http://localhost:${port}/office/`);
console.log(`本地数据目录：${state}`);
const child = spawn(process.execPath, ["apps/gateway/dist/index.js"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: "production", NO_OPEN: "1", WS_PORT: port, GATEWAY_ID: "local-review",
    PIKO_CONFIG_DIR: state, WORKSPACE: workspace,
    PIKO_SKIP_AGENT_SYNC: "1", PIKO_DISABLE_PROCESS_SCAN: "1" },
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", code => process.exit(code ?? 0));
