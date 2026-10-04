import { nanoid } from "nanoid";
import { translateUI, type Command, type GatewayEvent } from "@piko/shared";
import type { CommandMeta } from "./transport.js";

export interface FeishuMember { id: string; name: string; role: string; status: string }
export interface FeishuMessage {
  sender: { sender_type?: string; sender_id?: { open_id?: string } };
  message: { message_id: string; chat_id: string; chat_type: string; message_type: string; content: string };
}
interface Route { chat: string; user: string; agentId: string; taskId: string }
interface RouterOptions {
  allowedUsers: string[];
  members: () => FeishuMember[];
  command: (command: Command, meta: CommandMeta) => void | Promise<void>;
  send: (chat: string, text: string) => Promise<void>;
}

/** Private-chat routing. Only the sender's own tasks and approvals are returned. */
export class FeishuRouter {
  private seen = new Map<string, number>();
  private selected = new Map<string, string>();
  private tasks = new Map<string, Route>();
  private approvals = new Map<string, Route>();
  private alive = true;
  constructor(private options: RouterOptions) {}

  private send(chat: string, text: string) {
    return this.alive ? this.options.send(chat, text.slice(0, 3500)) : Promise.resolve();
  }

  async receive(event: FeishuMessage) {
    const { message, sender } = event;
    const user = sender.sender_id?.open_id;
    if (!this.alive || !user || sender.sender_type !== "user" || message.chat_type !== "p2p" || message.message_type !== "text") return;
    let text: string;
    try { text = JSON.parse(message.content).text?.trim(); } catch { return; }
    if (!text || !message.message_id || this.seen.has(message.message_id)) return;
    const now = Date.now();
    this.seen.set(message.message_id, now);
    for (const [id, time] of this.seen) if (now - time > 86_400_000 || this.seen.size > 5000) this.seen.delete(id);
    const chat = message.chat_id;
    const session = `${chat}:${user}`;
    const meta: CommandMeta = { role: "owner", clientId: `feishu:${user}` };
    if (text === "我的ID" || text === "/id") {
      await this.send(chat, `你的飞书 Open ID：\n${user}\n请将它填入办公室设置中的“允许使用的用户”。`);
      return;
    }
    if (!this.options.allowedUsers.includes(user)) {
      await this.send(chat, "你尚未获得此办公室的使用权限。发送“我的ID”，由办公室管理员加入允许使用的用户后再试。");
      return;
    }
    const members = this.options.members();
    if (["帮助", "/help", "/start"].includes(text)) {
      await this.send(chat, "欢迎使用Piko。\n成员：查看已加入办公室的成员\n选择 林悦：切换对话成员\n状态：查看成员状态\n取消：停止你发起的当前任务\n同意 审批编号 / 拒绝 审批编号：处理自己的审批\n\n选择成员后，直接发送文字即可派任务。请先在网页中组建团队或添加成员。");
      return;
    }
    if (["成员", "状态", "/members", "/status"].includes(text)) {
      await this.send(chat, members.length ? members.map(m => `${m.name}（${translateUI(m.role, "zh")}） · ${statusName(m.status)}\n选择 ${m.id}`).join("\n\n") : "办公室还没有成员，请先在网页中组建团队或添加成员。");
      return;
    }
    const pick = text.match(/^(?:选择|\/select)\s+(.+)$/);
    if (pick) {
      const matches = members.filter(m => m.id === pick[1] || m.name === pick[1]);
      if (matches.length !== 1) {
        await this.send(chat, "没有找到唯一成员，请发送“成员”并使用列表中的选择指令。");
        return;
      }
      if (this.selected.size >= 1000) this.selected.delete(this.selected.keys().next().value!);
      this.selected.set(session, matches[0].id);
      await this.send(chat, `已选择 ${matches[0].name}，现在可以直接发送任务。`);
      return;
    }
    const approval = text.match(/^(同意|拒绝|\/yes|\/no)\s+(\S+)$/);
    if (approval) {
      const route = this.approvals.get(approval[2]);
      if (!route || route.user !== user || route.chat !== chat) {
        await this.send(chat, "未找到属于你的待处理审批，请使用通知中的完整审批编号。");
        return;
      }
      this.approvals.delete(approval[2]);
      await this.options.command({ type: "APPROVAL_DECISION", approvalId: approval[2], decision: ["同意", "/yes"].includes(approval[1]) ? "yes" : "no" }, meta);
      await this.send(chat, "已提交审批决定。");
      return;
    }
    const agentId = this.selected.get(session);
    const member = members.find(m => m.id === agentId);
    if (!member) {
      await this.send(chat, "请先发送“成员”，再发送“选择 名字”指定一位已加入办公室的成员。");
      return;
    }
    if (["取消", "/cancel"].includes(text)) {
      const route = [...this.tasks.values()].find(r => r.user === user && r.chat === chat && r.agentId === agentId);
      if (!route) { await this.send(chat, "该成员没有由你从飞书发起的当前任务。"); return; }
      await this.options.command({ type: "CANCEL_TASK", agentId: member.id, taskId: route.taskId }, meta);
      this.finish(route);
      await this.send(chat, `已请求停止 ${member.name} 的任务。`);
      return;
    }
    if (text.startsWith("/") || /^(同意|拒绝)(\s|$)/.test(text)) {
      await this.send(chat, "指令不完整或无法识别，发送“帮助”查看用法。");
      return;
    }
    // A shared member has one active task: don't let a second conversation
    // take over that task or gain the ability to cancel another user's work.
    if (member.status === "working" || member.status === "waiting_approval" || [...this.tasks.values()].some(r => r.agentId === member.id)) {
      await this.send(chat, `${member.name} 正在处理任务，请稍后再发，或选择其他空闲成员。`);
      return;
    }
    const route = { chat, user, agentId: member.id, taskId: nanoid() };
    this.tasks.set(`${route.agentId}:${route.taskId}`, route);
    try {
      await this.options.command({ type: "RUN_TASK", agentId: member.id, taskId: route.taskId, prompt: text }, meta);
    } catch {
      this.finish(route);
      await this.send(chat, "任务未能启动，请在办公室查看成员状态后重试。");
    }
  }

  private finish(route: Route) {
    this.tasks.delete(`${route.agentId}:${route.taskId}`);
    for (const [id, pending] of this.approvals) if (pending === route) this.approvals.delete(id);
  }

  async broadcast(event: GatewayEvent) {
    if (!this.alive || !("agentId" in event) || !("taskId" in event)) return;
    const route = this.tasks.get(`${event.agentId}:${event.taskId}`);
    if (!route) return;
    const name = this.options.members().find(m => m.id === event.agentId)?.name ?? "成员";
    switch (event.type) {
      case "TASK_STARTED": await this.send(route.chat, `${name} 已开始处理任务。`); break;
      case "TASK_DONE":
        this.finish(route);
        await this.send(route.chat, `${name} 已完成：\n${event.result.summary}\n\n变更文件：${event.result.changedFiles.length} 个。可在办公室查看完整结果。`);
        break;
      case "TASK_FAILED":
        this.finish(route);
        await this.send(route.chat, `${name} 的任务未完成：\n${event.error}`);
        break;
      case "APPROVAL_NEEDED":
        this.approvals.set(event.approvalId, route);
        await this.send(route.chat, `${name} 需要确认：${event.title}\n${event.summary}\n\n同意 ${event.approvalId}\n或：拒绝 ${event.approvalId}`);
        break;
    }
  }

  destroy() { this.alive = false; this.selected.clear(); this.tasks.clear(); this.approvals.clear(); this.seen.clear(); }
}

function statusName(status: string) {
  return ({ idle: "空闲", working: "工作中", waiting_approval: "等待确认", done: "已完成", error: "异常" } as Record<string, string>)[status] ?? status;
}
