import type { WorkspaceSnapshot, WorkspaceTask } from "./workspace";

export const TASK_LABELS: Record<WorkspaceTask["status"], string> = {
  queued: "排队中", working: "执行中", waiting_approval: "待审批", done: "已完成",
  failed: "失败", cancelled: "已取消", interrupted: "已中断",
};

export interface AssignableAgent {
  agentId: string;
  name: string;
  status: string;
  isExternal?: boolean;
  isTeamLead?: boolean;
}

export function chooseAssignee(agents: AssignableAgent[], preferred?: string): AssignableAgent | undefined {
  const available = agents.filter(a => !a.isExternal);
  if (preferred) return available.find(a => a.agentId === preferred);
  // Route team-wide intent through a lead, otherwise prefer an available individual.
  return available.find(a => a.isTeamLead && a.status !== "working" && a.status !== "waiting_approval")
    ?? available.find(a => a.isTeamLead)
    ?? available.find(a => a.status !== "working" && a.status !== "waiting_approval")
    ?? available[0];
}

export function scopeWorkspace(snapshot: WorkspaceSnapshot, directory?: string): WorkspaceSnapshot {
  if (!directory) return snapshot;
  return { revision: snapshot.revision,
    tasks: snapshot.tasks.filter(t => isProjectDirectory(t.projectDir, directory)),
    highlights: snapshot.highlights.filter(h => isProjectDirectory(h.projectDir, directory)),
    links: snapshot.links.filter(l => isProjectDirectory(l.projectDir, directory)),
  };
}

/** Recover a running task on reconnect without mistaking a queued or finished task for it. */
export function activeWorkspaceTask(snapshot: WorkspaceSnapshot, agentId: string): WorkspaceTask | undefined {
  return snapshot.tasks
    .filter(task => task.agentId === agentId && (task.status === "working" || task.status === "waiting_approval"))
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];
}

/** Approved team projects may be created in a child directory of the chosen folder. */
export function isProjectDirectory(candidate: string | undefined, directory: string): boolean {
  if (!candidate) return false;
  const normalize = (value: string) => value.replace(/\\/g, "/").replace(/\/+$/, "");
  const root = normalize(directory);
  const target = normalize(candidate);
  return target === root || target.startsWith(root + "/");
}

export function reconcileProjectMembers<P extends { id: string; directory: string; agentIds: string[]; status: string }>(
  projects: Map<string, P>, agents: Iterable<{ agentId: string; workDir?: string; isExternal?: boolean }>,
): Map<string, P> {
  const updated = new Map(projects);
  let changed = false;
  for (const agent of agents) {
    if (agent.isExternal || agent.agentId.startsWith("reviewer-")) continue;
    if ([...updated.values()].some(p => p.agentIds.includes(agent.agentId))) continue;
    const project = [...updated.values()]
      .filter(p => p.status === "active" && isProjectDirectory(agent.workDir, p.directory))
      .sort((a, b) => b.directory.length - a.directory.length)[0];
    if (!project) continue;
    updated.set(project.id, { ...project, agentIds: [...project.agentIds, agent.agentId] });
    changed = true;
  }
  return changed ? updated : projects;
}

export function taskDuration(task: WorkspaceTask, now = Date.now()): number | null {
  if (!task.startedAt) return null;
  return Math.max(0, (task.endedAt ?? now) - task.startedAt);
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds} 秒`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
  return `${Math.floor(seconds / 3600)} 小时 ${Math.floor(seconds % 3600 / 60)} 分`;
}

export function buildRecap(snapshot: WorkspaceSnapshot, name: string, now = Date.now()): string {
  const tasks = [...snapshot.tasks].sort((a, b) => a.createdAt - b.createdAt);
  const counts = Object.entries(TASK_LABELS).map(([status, label]) => `${label} ${tasks.filter(t => t.status === status).length}`).join(" · ");
  const clean = (value: string) => value.replace(/\r\n/g, "\n");
  return [
    `# ${clean(name)} · 工作回顾`, "", `导出时间：${new Date(now).toISOString()}`, "",
    counts, "", "## 任务记录", "",
    ...(tasks.length ? tasks.flatMap(t => [
      `### ${clean(t.prompt.split("\n")[0] || "任务").slice(0, 120)}`, "",
      `成员：${t.agentName} · 状态：${TASK_LABELS[t.status]} · 耗时：${formatDuration(taskDuration(t, now))}`,
      `任务编号：${t.taskId}`, ...(t.projectDir ? [`目录：${t.projectDir}`] : []), "",
      clean(t.summary ?? "尚无执行结果"), "",
      ...(t.changedFiles.length ? ["修改文件：", ...t.changedFiles.map(f => `- ${f}`), ""] : []),
      `测试：${({ passed: "通过", failed: "失败", unknown: "未确认" })[t.testResult ?? "unknown"]}`,
      ...(t.tokenUsage ? [`Token：输入 ${t.tokenUsage.inputTokens} / 输出 ${t.tokenUsage.outputTokens}`] : []), "",
    ]) : ["暂无任务。", ""]),
    "## 协作关系", "",
    ...snapshot.links.map(l => `- ${l.fromName} → ${l.toName}：分派 ${l.delegated} 次，成功回传 ${l.returned} 次，失败回传 ${l.failed} 次`), "",
    "## 关键动态", "",
    ...snapshot.highlights.slice(-30).map(h => `- ${new Date(h.timestamp).toISOString()} · ${h.agentName} · ${h.title}：${clean(h.detail)}`), "",
    "记录范围：当前网关保留的最近 500 个已结束任务及所有进行中的任务；未上报的用量和测试结果不会推算。", "",
  ].join("\n");
}
