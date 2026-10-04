import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { WorkspaceSnapshotSchema, type GatewayEvent, type WorkspaceSnapshot, type WorkspaceTask, type WorkspaceHighlight } from "@piko/shared";

export interface WorkspaceAgent {
  name: string;
  role: string;
  teamId?: string;
  projectDir?: string;
}

const ACTIVE = new Set<WorkspaceTask["status"]>(["queued", "working", "waiting_approval"]);
const EMPTY = (): WorkspaceSnapshot => ({ revision: 0, tasks: [], highlights: [], links: [] });

/** Gateway-owned history, shared by all clients and saved atomically per instance. */
export class WorkspaceLedger {
  private state = EMPTY();
  private seen = new Set<string>();

  constructor(private file: string, private now = Date.now) {
    if (!existsSync(file)) return;
    try {
      this.state = WorkspaceSnapshotSchema.parse(JSON.parse(readFileSync(file, "utf8")));
      // A new gateway cannot prove old CLI processes are still executing.
      let interrupted = false;
      for (const task of this.state.tasks) {
        if (ACTIVE.has(task.status)) {
          task.status = "interrupted";
          task.summary = "网关已重启，之前的执行已中断。请检查结果后重新派发。";
          task.updatedAt = task.endedAt = this.now();
          interrupted = true;
        }
      }
      if (interrupted) this.save();
    } catch (error) {
      // Preserve an invalid file for inspection instead of silently overwriting it.
      renameSync(file, `${file}.invalid-${this.now()}`);
      console.warn("[Workspace] Invalid history preserved:", error);
      this.state = EMPTY();
    }
  }

  snapshot(): WorkspaceSnapshot {
    return structuredClone(this.state);
  }

  private save(): void {
    this.state.revision++;
    const finished = this.state.tasks.filter(t => !ACTIVE.has(t.status)).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 500);
    this.state.tasks = [...this.state.tasks.filter(t => ACTIVE.has(t.status)), ...finished];
    this.state.highlights = this.state.highlights.slice(-150);
    this.state.links = this.state.links.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 300);
    mkdirSync(path.dirname(this.file), { recursive: true });
    writeFileSync(`${this.file}.tmp`, JSON.stringify(this.state), "utf8");
    renameSync(`${this.file}.tmp`, this.file);
  }

  prepare(taskId: string, agentId: string, prompt: string, agent: WorkspaceAgent): void {
    if (this.state.tasks.some(t => t.taskId === taskId)) return;
    const timestamp = this.now();
    this.state.tasks.push({ taskId, agentId, agentName: agent.name, role: agent.role, teamId: agent.teamId,
      projectDir: agent.projectDir, prompt, status: "queued", createdAt: timestamp, updatedAt: timestamp, changedFiles: [] });
    this.save();
  }

  /** Returns true only for meaningful changes; stdout/token streams never write to disk. */
  apply(event: GatewayEvent, resolve: (id: string) => WorkspaceAgent): boolean {
    const timestamp = this.now();
    const taskId = "taskId" in event ? event.taskId : undefined;
    if (taskId === "") return false;
    let task = taskId ? this.state.tasks.find(t => t.taskId === taskId) : undefined;
    const ensure = (id: string, prompt = "") => {
      if (!task) {
        const agent = resolve(id);
        task = { taskId: taskId!, agentId: id, agentName: agent.name, role: agent.role, teamId: agent.teamId,
          projectDir: agent.projectDir, prompt, status: "queued", createdAt: timestamp, updatedAt: timestamp, changedFiles: [] };
        this.state.tasks.push(task);
      }
      return task;
    };
    const highlight = (kind: WorkspaceHighlight["kind"], id: string, title: string, detail: string) => {
      const agent = resolve(id);
      this.state.highlights.push({ id: `${this.state.revision + 1}-${this.state.highlights.length}`, kind, agentId: id,
        agentName: agent.name, taskId, projectDir: task?.projectDir ?? agent.projectDir, title, detail: detail.slice(0, 2000), timestamp });
    };
    const link = (from: string, to: string, kind: "delegated" | "returned" | "failed") => {
      const projectDir = task?.projectDir;
      let edge = this.state.links.find(l => l.fromAgentId === from && l.toAgentId === to && l.projectDir === projectDir);
      if (!edge) {
        edge = { fromAgentId: from, toAgentId: to, fromName: resolve(from).name, toName: resolve(to).name,
          projectDir, delegated: 0, returned: 0, failed: 0, updatedAt: timestamp };
        this.state.links.push(edge);
      }
      edge[kind]++;
      edge.updatedAt = timestamp;
    };
    switch (event.type) {
      case "TASK_QUEUED":
      case "TASK_STARTED": {
        const nextStatus = event.type === "TASK_STARTED" ? "working" : "queued";
        if (task?.status === nextStatus) return false;
        const t = ensure(event.agentId, event.prompt);
        t.prompt = event.prompt;
        t.status = nextStatus;
        t.updatedAt = timestamp;
        if (nextStatus === "working") { t.startedAt = timestamp; delete t.endedAt; delete t.summary; }
        break;
      }
      case "TASK_DELEGATED": {
        const key = `delegate:${event.taskId}:${event.fromAgentId}:${event.toAgentId}`;
        if (this.seen.has(key) || task?.fromAgentId === event.fromAgentId) return false;
        this.seen.add(key);
        const t = ensure(event.toAgentId, event.prompt);
        t.fromAgentId = event.fromAgentId;
        link(event.fromAgentId, event.toAgentId, "delegated");
        highlight("delegation", event.fromAgentId, "任务已分派", `${resolve(event.toAgentId).name} · ${event.prompt}`);
        break;
      }
      case "APPROVAL_NEEDED": {
        if (task?.status === "waiting_approval") return false;
        const t = ensure(event.agentId);
        t.status = "waiting_approval";
        t.updatedAt = timestamp;
        highlight("approval", event.agentId, "等待审批", `${event.title} · ${event.summary}`);
        break;
      }
      case "AGENT_STATUS": {
        if (event.status !== "working") return false;
        const waiting = this.state.tasks.filter(t => t.agentId === event.agentId && t.status === "waiting_approval");
        if (!waiting.length) return false;
        waiting.forEach(t => { t.status = "working"; t.updatedAt = timestamp; });
        break;
      }
      case "TASK_DONE": {
        if (task?.status === "done") return false;
        const t = ensure(event.agentId);
        t.status = "done";
        t.summary = event.result.summary;
        t.changedFiles = event.result.changedFiles;
        t.testResult = event.result.testResult;
        t.tokenUsage = event.result.tokenUsage;
        t.projectDir ??= event.result.projectDir;
        t.updatedAt = t.endedAt = timestamp;
        highlight("completion", event.agentId, "任务已完成", event.result.summary);
        break;
      }
      case "TASK_FAILED": {
        const status = event.error === "Task cancelled by user" ? "cancelled" : "failed";
        if (task?.status === status && task.summary === event.error) return false;
        const t = ensure(event.agentId);
        t.status = status;
        t.summary = event.error;
        t.updatedAt = t.endedAt = timestamp;
        highlight("failure", event.agentId, status === "cancelled" ? "任务已取消" : "任务执行失败", event.error);
        break;
      }
      case "TASK_RESULT_RETURNED": {
        const key = `return:${event.taskId}:${event.fromAgentId}:${event.toAgentId}`;
        if (this.seen.has(key)) return false;
        this.seen.add(key);
        link(event.toAgentId, event.fromAgentId, event.success ? "returned" : "failed");
        break;
      }
      case "TEAM_PHASE": {
        if (event.phase !== "complete" && event.phase !== "execute") return false;
        const last = this.state.highlights.at(-1);
        if (last?.kind === "phase" && last.agentId === event.leadAgentId && last.detail === event.phase) return false;
        highlight("phase", event.leadAgentId, event.phase === "complete" ? "团队交付完成" : "团队开始执行", event.phase);
        break;
      }
      case "AGENT_FIRED": {
        const active = this.state.tasks.filter(t => t.agentId === event.agentId && ACTIVE.has(t.status));
        if (!active.length) return false;
        active.forEach(t => { t.status = "cancelled"; t.summary = "成员已移除"; t.updatedAt = t.endedAt = timestamp; });
        break;
      }
      default: return false;
    }
    if (this.seen.size > 3000) this.seen = new Set([...this.seen].slice(-1500));
    this.save();
    return true;
  }
}
