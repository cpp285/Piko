import test from "node:test";
import assert from "node:assert/strict";
import { activeWorkspaceTask, isProjectDirectory, reconcileProjectMembers, scopeWorkspace, type WorkspaceTask } from "@piko/shared";

test("reconnecting restores the active task, not a newer queued or finished task", () => {
  const task = (taskId: string, status: WorkspaceTask["status"], updatedAt: number): WorkspaceTask => ({
    taskId, status, updatedAt, createdAt: 1, agentId: "dev", agentName: "林悦", role: "dev", prompt: taskId, changedFiles: [],
  });
  const snapshot = { revision: 3, tasks: [task("next", "queued", 4), task("running", "working", 2), task("previous", "done", 3)], highlights: [], links: [] };
  assert.equal(activeWorkspaceTask(snapshot, "dev")?.taskId, "running");
  assert.equal(activeWorkspaceTask(snapshot, "reviewer"), undefined);
  snapshot.tasks[1] = task("running", "waiting_approval", 5);
  assert.equal(activeWorkspaceTask(snapshot, "dev")?.status, "waiting_approval");
  snapshot.tasks[1] = task("running", "cancelled", 6);
  assert.equal(activeWorkspaceTask(snapshot, "dev"), undefined);
});

test("project team members are recovered by directory, without stealing other projects' members", () => {
  const projects = new Map([
    ["parent", { id: "parent", directory: "/projects", agentIds: ["existing"], status: "active" }],
    ["game", { id: "game", directory: "/projects/game", agentIds: [] as string[], status: "active" }],
  ]);
  const result = reconcileProjectMembers(projects, [
    { agentId: "lead", workDir: "/projects/game" },
    { agentId: "dev", workDir: "/projects/game/pixel-snake" },
    { agentId: "review", workDir: "/projects/game" },
    { agentId: "existing", workDir: "/projects/game" },
    { agentId: "external", workDir: "/projects/game", isExternal: true },
  ]);
  assert.deepEqual(result.get("game")?.agentIds, ["lead", "dev", "review"]);
  assert.deepEqual(projects.get("game")?.agentIds, []);
  assert.equal(reconcileProjectMembers(result, [{ agentId: "dev", workDir: "/projects/game" }]), result);
});

test("project task scope includes generated child directories, excludes sibling prefixes", () => {
  assert.equal(isProjectDirectory("/projects/game/pixel-snake", "/projects/game/"), true);
  assert.equal(isProjectDirectory("/projects/game-two", "/projects/game"), false);
  assert.equal(isProjectDirectory(undefined, "/projects/game"), false);
  const snapshot = { revision: 1, tasks: [{ projectDir: "/projects/game/child" }, { projectDir: "/projects/game-two" }], highlights: [], links: [] };
  assert.equal(scopeWorkspace(snapshot as never, "/projects/game").tasks.length, 1);
});
