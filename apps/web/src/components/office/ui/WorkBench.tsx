"use client";
import { tr, trNode, useLocale } from "@/lib/ui-language";


import { useEffect, useMemo, useState } from "react";
import { useOfficeStore } from "@/store/office-store";
import { sendCommand } from "@/lib/connection";
import { buildRecap, chooseAssignee, formatDuration, scopeWorkspace, taskDuration, TASK_LABELS } from "@piko/shared";
import type { WorkspaceTask } from "@piko/shared";
import TermModal from "./primitives/TermModal";
import styles from "./WorkBench.module.css";

type Tab = "tasks" | "pulse" | "links" | "recap";
const TABS: Array<[Tab, string]> = [["tasks", "任务看板"], ["pulse", "成员状态"], ["links", "协作关系"], ["recap", "工作回顾"]];
const COLUMNS: Array<{ key: string; title: string; statuses: WorkspaceTask["status"][] }> = [
  { key: "queued", title: "待执行", statuses: ["queued"] },
  { key: "working", title: "执行中", statuses: ["working"] },
  { key: "attention", title: "需要关注", statuses: ["waiting_approval", "failed", "interrupted", "cancelled"] },
  { key: "done", title: "已完成", statuses: ["done"] },
];
const STATUS_TEXT: Record<string, string> = { idle: "待命", working: "执行中", waiting_approval: "待审批", done: "已完成", error: "出错" };

export default function WorkBench({ open, onClose, onAssign, onInspect, onCancel }: {
  open: boolean;
  onClose: () => void;
  onAssign: (agentId: string, prompt: string) => void;
  onInspect: (agentId: string) => void;
  onCancel: (agentId: string, taskId: string) => void;
}) {
  useLocale();
  const workspace = useOfficeStore(s => s.workspace);
  const loaded = useOfficeStore(s => s.workspaceLoaded);
  const connected = useOfficeStore(s => s.connected);
  const role = useOfficeStore(s => s.role);
  const agents = useOfficeStore(s => s.agents);
  const projects = useOfficeStore(s => s.projects);
  const activeProjectId = useOfficeStore(s => s.activeProjectId);
  const logLines = useOfficeStore(s => s.agentLogLines);
  const [tab, setTab] = useState<Tab>("tasks");
  const [scope, setScope] = useState("all");
  const [prompt, setPrompt] = useState("");
  const [assignee, setAssignee] = useState("auto");
  const [filter, setFilter] = useState("");
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const [limits, setLimits] = useState<Record<string, number>>({});
  const activeProject = activeProjectId ? projects.get(activeProjectId) : undefined;
  const directory = scope === "project" ? activeProject?.directory : undefined;
  const data = useMemo(() => scopeWorkspace(workspace, directory), [workspace, directory]);
  const members = useMemo(() => [...agents.values()].filter(a => scope !== "project" || activeProject?.agentIds.includes(a.agentId)), [agents, scope, activeProject]);
  const available = members.filter(a => !a.isExternal);
  const canWrite = role === "owner" && connected && loaded;

  useEffect(() => {
    if (!open) return;
    if (connected) sendCommand({ type: "GET_WORKSPACE" });
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [open, connected]);

  useEffect(() => { if (!activeProject) setScope("all"); }, [activeProject]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canWrite || !prompt.trim()) return;
    const target = chooseAssignee(available, assignee === "auto" ? undefined : assignee);
    if (!target) { setError("请先雇用成员，或重新选择接收任务的成员。"); return; }
    onAssign(target.agentId, prompt.trim());
    setPrompt("");
    setError("");
  };

  const exportFile = (format: "md" | "json") => {
    const name = directory ? activeProject?.name ?? "项目" : "办公室";
    const text = format === "md" ? buildRecap(data, name, now) : JSON.stringify({ exportedAt: new Date(now).toISOString(), name, ...data }, null, 2);
    const url = URL.createObjectURL(new Blob([text], { type: format === "md" ? "text/markdown;charset=utf-8" : "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `office-recap-${new Date(now).toISOString().slice(0, 10)}.${format}`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const completed = data.tasks.filter(t => t.status === "done");
  const attention = data.tasks.filter(t => ["failed", "cancelled", "interrupted", "waiting_approval"].includes(t.status));
  const working = data.tasks.filter(t => t.status === "working");
  const visibleTasks = data.tasks.filter(t => `${t.prompt} ${t.agentName} ${t.summary ?? ""}`.toLowerCase().includes(filter.toLowerCase())).sort((a, b) => b.updatedAt - a.updatedAt);
  const inspect = (agentId: string) => { onInspect(agentId); onClose(); };

  return <TermModal open={open} onClose={onClose} title={tr("协作工作台")} maxWidth={1120} className={styles.modal}>
    <div className={styles.root}>
      <div className={styles.intro}>
        <div><span className={styles.eyebrow}>{tr("OFFICE / WORKBENCH")}</span><p>{tr("任务、成员与交付，放在同一张桌面上。")}</p></div>
        <div className={styles.scope}>
          <span className={connected ? styles.online : styles.offline}>{trNode(connected ? loaded ? "● 实时同步" : "● 同步中" : "● 离线记录")}</span>
          <select aria-label={tr("工作台范围")} value={scope} onChange={e => { setScope(e.target.value); setAssignee("auto"); }}>
            <option value="all">{tr("整个办公室")}</option>
            {activeProject && <option value="project">{tr("当前项目 ·")}{activeProject.name}</option>}
          </select>
        </div>
      </div>
      <div className={styles.metrics}>
        {[["任务", data.tasks.length], ["执行中", working.length], ["待关注", attention.length], ["已完成", completed.length]].map(([label, value]) => <div key={label}><strong>{trNode(value)}</strong><span>{trNode(label)}</span></div>)}
      </div>
      <div className={styles.tabs} role="tablist" aria-label={tr("工作台视图")}>
        {TABS.map(([key, label]) => <button key={key} id={`workbench-tab-${key}`} role="tab" aria-selected={tab === key} aria-controls={`workbench-panel-${key}`} onClick={() => setTab(key)}>{trNode(label)}</button>)}
      </div>
      <div role="tabpanel" id={`workbench-panel-${tab}`} aria-labelledby={`workbench-tab-${tab}`}>
        {tab === "tasks" && <>
          {role === "owner" && <form className={styles.assign} onSubmit={submit}>
            <textarea aria-label={tr("任务描述")} placeholder={tr("写下任务，例如：检查登录流程并修复问题…")} value={prompt} onChange={e => setPrompt(e.target.value)} rows={2} maxLength={20000} />
            <div><select aria-label={tr("接收任务的成员")} value={assignee} onChange={e => setAssignee(e.target.value)}>
              <option value="auto">{tr("自动选择 · 优先负责人")}</option>
              {available.map(a => <option key={a.agentId} value={a.agentId}>{a.name} · {trNode(a.role.split(" — ")[0])}</option>)}
            </select><button className={styles.primary} disabled={!canWrite || !prompt.trim() || !available.length}>{tr("派发任务 ↗")}</button></div>
            <small>{trNode(!connected ? "连接恢复后可派发任务。" : !available.length ? "请先雇用 AI 成员。" : "忙碌成员收到的任务会进入队列；团队任务优先交给负责人。")}</small>
            {error && <small role="alert" className={styles.offline}>{trNode(error)}</small>}
          </form>}
          <input className={styles.search} aria-label={tr("搜索任务")} placeholder={tr("搜索任务、成员或结果…")} value={filter} onChange={e => setFilter(e.target.value)} />
          <div className={styles.board}>
            {COLUMNS.map(column => {
              const tasks = visibleTasks.filter(t => column.statuses.includes(t.status));
              const limit = limits[column.key] ?? 20;
              return <section key={column.key} className={styles.column} data-state={column.key}>
                <h3>{trNode(column.title)}<span>{trNode(tasks.length)}</span></h3>
                {!tasks.length && <p className={styles.empty}>{tr("暂无任务")}</p>}
                {tasks.slice(0, limit).map(task => {
                  const agent = agents.get(task.agentId);
                  return <article key={task.taskId} className={styles.task}>
                    <span className={styles.taskStatus}>{trNode(TASK_LABELS[task.status])}</span>
                    <h4>{task.prompt.split("\n")[0].slice(0, 160) || "任务"}</h4>
                    <div className={styles.taskMeta}><span>{task.agentName}</span><span>{trNode(formatDuration(taskDuration(task, now)))}</span></div>
                    <details><summary>{tr("任务与结果")}</summary><p>{task.prompt}</p>{task.summary && <p>{task.summary}</p>}
                      {task.testResult && <p>{tr("测试：")}{trNode(({ passed: "通过", failed: "失败", unknown: "未确认" })[task.testResult])}</p>}
                      {!!task.changedFiles.length && <ul>{task.changedFiles.map(f => <li key={f}>{f}</li>)}</ul>}
                    </details>
                    <div className={styles.taskActions}>
                      {agent && <button onClick={() => inspect(task.agentId)}>{trNode(task.status === "waiting_approval" ? "查看审批" : "查看成员")}</button>}
                      {canWrite && agent && !agent.isExternal && ["failed", "cancelled", "interrupted"].includes(task.status) && !!task.prompt && <button onClick={() => onAssign(task.agentId, task.prompt)}>{tr("重新派发")}</button>}
                      {canWrite && agent?.currentTaskId === task.taskId && ["working", "waiting_approval"].includes(task.status) && <button onClick={() => onCancel(task.agentId, task.taskId)}>{tr("取消执行")}</button>}
                    </div>
                  </article>;
                })}
                {tasks.length > limit && <button className={styles.more} onClick={() => setLimits(l => ({ ...l, [column.key]: limit + 20 }))}>{tr("加载更多（")}{trNode(tasks.length - limit)}）</button>}
              </section>;
            })}
          </div>
        </>}
        {tab === "pulse" && <div className={styles.members}>
          {!members.length && <p className={styles.empty}>{tr("雇用成员后，这里会显示实际工作状态。")}</p>}
          {members.map(agent => {
            const tasks = data.tasks.filter(t => t.agentId === agent.agentId);
            const current = tasks.find(t => t.taskId === agent.currentTaskId);
            return <article className={styles.member} key={agent.agentId}>
              <div className={styles.memberTop}><span>{trNode(agent.isTeamLead ? "负责人" : agent.role.split(" — ")[0])}</span><span data-status={agent.status}>{trNode(STATUS_TEXT[agent.status])}</span></div>
              <h3>{agent.name}</h3><small>{trNode(agent.backend ?? "默认后端")}{trNode(agent.isExternal ? " · 外部进程" : "")}</small>
              <p>{current?.prompt ?? (["working", "waiting_approval"].includes(agent.status) ? agent.currentPrompt : undefined) ?? tr("等待下一项任务")}</p>
              <div className={styles.memberStats}><span>{tr("完成")}<b>{trNode(tasks.filter(t => t.status === "done").length)}</b></span><span>{tr("排队")}<b>{trNode(tasks.filter(t => t.status === "queued").length)}</b></span><span>{tr("失败")}<b>{trNode(tasks.filter(t => t.status === "failed").length)}</b></span></div>
              <div className={styles.activity}>{logLines.get(agent.agentId) || agent.lastLogLine || "暂无新的工具活动"}</div>
              <button onClick={() => inspect(agent.agentId)}>{tr("打开成员对话 ↗")}</button>
            </article>;
          })}
        </div>}
        {tab === "links" && <div className={styles.relationships}>
          <p className={styles.note}>{tr("箭头表示谁向谁分派任务，计数来自任务分派与结果回传事件。")}</p>
          {!data.links.length && <p className={styles.empty}>{tr("团队开始分派任务后，协作关系会出现在这里。")}</p>}
          {data.links.map((link, i) => <article key={`${link.fromAgentId}-${link.toAgentId}-${i}`}>
            <div className={styles.linkNames}><span>{link.fromName}</span><span className={styles.arrow}>→</span><span>{link.toName}</span></div>
            <div className={styles.linkCounts}><span>{tr("分派")}<b>{trNode(link.delegated)}</b></span><span>{tr("成功回传")}<b>{trNode(link.returned)}</b></span><span>{tr("失败回传")}<b>{trNode(link.failed)}</b></span></div>
            <small>{tr("最近协作")}{trNode(new Date(link.updatedAt).toLocaleString())}</small>
          </article>)}
        </div>}
        {tab === "recap" && <>
          <div className={styles.recapHeader}><div><h3>{tr("关键动态与交付记录")}</h3><p>{tr("保留最近 150 条关键动态，导出包含当前范围的完整任务记录。")}</p></div>
            <div><button disabled={!loaded || !data.tasks.length} onClick={() => exportFile("md")}>{tr("导出 Markdown")}</button><button disabled={!loaded || !data.tasks.length} onClick={() => exportFile("json")}>{tr("导出 JSON")}</button></div>
          </div>
          <ol className={styles.timeline}>
            {[...data.highlights].reverse().map(h => <li key={h.id} data-kind={h.kind}>
              <time>{trNode(new Date(h.timestamp).toLocaleTimeString())}</time><div><strong>{trNode(h.title)}</strong><span>{h.agentName}</span><p>{h.detail}</p></div>
            </li>)}
          </ol>
          {!data.highlights.length && <p className={styles.empty}>{tr("派发任务后，这里会记录分工、审批、完成和失败等关键动态。")}</p>}
        </>}
      </div>
      <p className={styles.footer}>{tr("记录保存在当前网关，刷新后可恢复。已结束任务保留最近 500 条。")}</p>
    </div>
  </TermModal>;
}
