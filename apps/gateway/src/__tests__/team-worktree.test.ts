import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { Orchestrator, setSessionDir, setStorageRoot } from "@piko/orchestrator";

test("team delivery respects manual merge, targets the task repository and preserves previews", t => {
  const root = mkdtempSync(path.join(tmpdir(), "office-team-worktree-"));
  const workspace = path.join(root, "workspace"), project = path.join(workspace, "game"), worktree = path.join(root, "worker");
  mkdirSync(project, { recursive: true });
  const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  for (const dir of [workspace, project]) {
    git(dir, "init");
    git(dir, "config", "user.name", "Test"); git(dir, "config", "user.email", "test@example.invalid");
    git(dir, "commit", "--allow-empty", "-m", "init");
  }
  writeFileSync(path.join(workspace, "keep.txt"), "user changes");
  const parentBefore = git(workspace, "status", "--porcelain");
  git(project, "worktree", "add", "-b", "agent/test", worktree);
  writeFileSync(path.join(worktree, "index.html"), "<h1>Game</h1>");
  setSessionDir(path.join(root, "sessions")); setStorageRoot(path.join(root, "memory"));
  const orc = new Orchestrator({ workspace, sandboxMode: "safe", retry: false, promptsDir: path.join(root, "prompts"),
    worktree: { mergeOnComplete: true },
    backends: [{ id: "fixture", name: "fixture", command: process.execPath, buildArgs: () => [] }],
  });
  t.after(() => { orc.destroy(); rmSync(root, { recursive: true, force: true }); });
  orc.createAgent({ agentId: "lead", name: "陈峰", role: "Team Lead", teamId: "team", workDir: workspace });
  orc.createAgent({ agentId: "dev", name: "林悦", role: "Developer", teamId: "team", workDir: workspace });
  const soloWorktree = path.join(root, "solo");
  git(project, "worktree", "add", "-b", "agent/solo", soloWorktree);
  orc.createAgent({ agentId: "solo", name: "Solo", role: "Developer", workDir: workspace });
  orc.restoreAgentWorktree("solo", soloWorktree, "agent/solo");
  orc.setAgentAutoMerge("solo", false);
  orc.restoreAgentWorktree("dev", worktree, "agent/test");
  orc.setAgentAutoMerge("dev", false);
  (orc as unknown as { mergeAllWorkerWorktrees(id: string): void }).mergeAllWorkerWorktrees("lead");
  assert.equal(existsSync(path.join(project, "index.html")), false);
  assert.equal(orc.getAllAgents().find(a => a.agentId === "dev")?.pendingMerge, true);
  assert.equal(orc.getAllAgents().find(a => a.agentId === "solo")?.pendingMerge, false);
  assert.equal(orc.mergeAgentWorktree("dev").success, true);
  assert.equal(readFileSync(path.join(project, "index.html"), "utf8"), "<h1>Game</h1>");
  assert.equal(existsSync(path.join(worktree, "index.html")), true);
  assert.equal(orc.getAllAgents().find(a => a.agentId === "dev")?.pendingMerge, false);
  assert.equal(readFileSync(path.join(workspace, "keep.txt"), "utf8"), "user changes");
  assert.equal(git(workspace, "status", "--porcelain"), parentBefore);
  assert.equal(git(workspace, "stash", "list"), "");
});
