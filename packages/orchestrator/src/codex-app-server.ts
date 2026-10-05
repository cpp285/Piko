import { approvalFields, type ApprovalField, type ApprovalValues } from "@piko/shared";

type Json = Record<string, any>;
export interface CodexApproval { decision: "yes" | "no"; values: ApprovalValues }
interface Options {
  send: (message: Json) => void;
  emit: (event: Json) => void;
  finish: (code: number) => void;
  approve: (title: string, summary: string, fields?: ApprovalField[]) => Promise<CodexApproval>;
  approvedBrowserOrigins?: () => string[];
}

/** Recognize only the browser's site-connection prompt, never clicks, uploads or tool execution. */
export function authorizedBrowserOrigin(request: Json, approved: string[]): string | undefined {
  if (request.serverName !== "cua_repl" || !["form", "openai/form", "openaiForm"].includes(request.mode)) return;
  const schema = request.requestedSchema;
  if (schema?.type !== "object" || !schema.properties || Object.keys(schema.properties).length || schema.required?.length) return;
  const match = /^Allow Browser use to access (https:\/\/[^\s]+)\?$/.exec(request.message || "");
  if (!match) return;
  try {
    const url = new URL(match[1]);
    if (url.origin === match[1] && approved.includes(url.origin)) return url.origin;
  } catch { /* not a plain HTTPS origin */ }
}

/** Stdio JSON-RPC adapter. Keeps the existing public-only Codex event parser. */
export class CodexAppServer {
  private sequence = 0;
  private pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private threadId?: string;
  private ended = false;
  private usage: Json = {};
  private approvalQueue: Promise<unknown> = Promise.resolve();
  exitCode: number | undefined;
  constructor(private options: Options) {}
  private approve(title: string, summary: string, fields?: ApprovalField[]): Promise<CodexApproval> {
    const next = this.approvalQueue.then(() => this.ended
      ? { decision: "no" as const, values: {} }
      : this.options.approve(title, summary, fields));
    this.approvalQueue = next.catch(() => {});
    return next;
  }

  private request(method: string, params: Json): Promise<any> {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Codex ${method} 响应超时`)); }, 180000);
      this.pending.set(id, { resolve, reject, timer });
      this.options.send({ id, method, params });
    });
  }
  async start(prompt: string, cwd: string, sandbox: "read-only" | "workspace-write" | "danger-full-access", model?: string) {
    try {
      await this.request("initialize", { clientInfo: { name: "piko", title: "Piko", version: "0.1.101" }, capabilities: { experimentalApi: true, requestAttestation: false, mcpServerOpenaiFormElicitation: true } });
      if (this.ended) return;
      this.options.send({ method: "initialized", params: {} });
      const result = await this.request("thread/start", { cwd, sandbox, approvalPolicy: "on-request", ...(model ? { model } : {}) });
      if (this.ended) return;
      if (!result.thread?.id) throw new Error("Codex 未返回会话编号");
      this.threadId = result.thread.id;
      this.options.emit({ type: "thread.started", thread_id: this.threadId });
      await this.request("turn/start", { threadId: this.threadId, input: [{ type: "text", text: prompt, text_elements: [] }] });
    } catch (error) {
      if (!this.ended) this.complete(1, error instanceof Error ? error.message : String(error));
    }
  }
  handle(message: Json) {
    if (this.ended) return;
    if (message.method && message.id != null) { void this.serverRequest(message); return; }
    if (message.id != null) {
      const request = this.pending.get(message.id);
      if (request) {
        clearTimeout(request.timer); this.pending.delete(message.id);
        if (message.error) request.reject(new Error(message.error.message || "Codex 请求失败"));
        else request.resolve(message.result);
      }
      return;
    }
    const p = message.params || {};
    if (p.threadId && this.threadId && p.threadId !== this.threadId) return;
    if (message.method === "turn/started") this.options.emit({ type: "turn.started" });
    else if (message.method === "thread/tokenUsage/updated") {
      this.usage = { input_tokens: p.tokenUsage?.total?.inputTokens || 0, output_tokens: p.tokenUsage?.total?.outputTokens || 0 };
    } else if (message.method === "item/started" || message.method === "item/completed") {
      const item = p.item;
      if (!item) return;
      const types: Record<string, string> = { agentMessage: "agent_message", commandExecution: "command_execution", fileChange: "file_change", mcpToolCall: "mcp_tool_call", webSearch: "web_search" };
      if (!types[item.type]) return; // Never expose reasoning, raw tool output, or input as chat text.
      this.options.emit({ type: message.method.replace("/", "."), item: {
        type: types[item.type], text: item.type === "agentMessage" ? item.text : undefined,
        tool: item.tool, status: item.status === "declined" ? "failed" : item.status,
        changes: item.type === "fileChange" ? item.changes?.map((change: any) => ({ path: change.path })) : undefined,
      } });
    } else if (message.method === "turn/completed") {
      const status = p.turn?.status;
      this.complete(status === "completed" ? 0 : 1, p.turn?.error?.message || (status === "completed" ? undefined : "Codex 本轮未完成"));
    } else if (message.method === "error" && !p.willRetry) {
      this.complete(1, p.error?.message || "Codex 连接失败");
    }
  }
  private async serverRequest(message: Json) {
    const p = message.params || {};
    const reply = (result: Json) => { if (!this.ended) this.options.send({ id: message.id, result }); };
    if (p.threadId && this.threadId && p.threadId !== this.threadId) {
      this.options.send({ id: message.id, error: { code: -32602, message: "Request belongs to another thread" } }); return;
    }
    try {
      if (message.method === "mcpServer/elicitation/request") {
        const origin = authorizedBrowserOrigin(p, this.options.approvedBrowserOrigins?.() || []);
        if (origin) {
          // The user granted this member ongoing access in settings. This does
          // not create a global browser grant or approve any separate action.
          reply({ action: "accept", content: {}, _meta: null });
          return;
        }
        if (!["form", "openai/form", "openaiForm"].includes(p.mode)) {
          reply({ action: "decline", content: null, _meta: null }); return;
        }
        let fields: ApprovalField[];
        try { fields = approvalFields(p.requestedSchema); } catch {
          reply({ action: "decline", content: null, _meta: null });
          this.options.emit({ type: "item.completed", item: { type: "agent_message", text: "这项授权需要的表单暂不受支持，已拒绝执行。请在原应用中完成授权后再试。" } }); return;
        }
        const answer = await this.approve("浏览器或工具需要你的确认", `${p.message || "请确认本次操作"}\n\n来源：${p.serverName || "Codex"}。请核对访问对象与权限范围。`, fields);
        reply({ action: answer.decision === "yes" ? "accept" : "decline", content: answer.decision === "yes" ? answer.values : null, _meta: null });
      } else if (["item/commandExecution/requestApproval", "item/fileChange/requestApproval"].includes(message.method)) {
        const summary = [p.reason, p.command, p.cwd && `工作目录：${p.cwd}`, p.grantRoot && `访问路径：${p.grantRoot}`].filter(Boolean).join("\n");
        const answer = await this.approve("需要允许本次操作", summary || "Codex 请求执行工作区外的操作。", []);
        reply({ decision: answer.decision === "yes" ? "accept" : "decline" });
      } else if (message.method === "item/permissions/requestApproval") {
        const answer = await this.approve("需要额外访问权限", `${p.reason || "请核对这次请求的权限"}\n${JSON.stringify(p.permissions, null, 2)}\n仅对本轮生效。`, []);
        reply({ permissions: answer.decision === "yes" ? p.permissions : {}, scope: "turn" });
      } else if (["item/tool/requestUserInput", "tool/requestUserInput"].includes(message.method)) {
        const questions = p.questions || [];
        if (questions.some((q: any) => q.isSecret)) { reply({ answers: {} }); return; }
        const fields = questions.map((q: any): ApprovalField => ({ key: q.id, label: q.question, type: "string", required: true,
          choices: q.options?.map((o: any) => ({ value: o.label, label: `${o.label}${o.description ? ` — ${o.description}` : ""}` })) }));
        const answer = await this.approve("需要你的选择", "选择后继续当前任务；拒绝则不提交回答。", fields);
        reply({ answers: answer.decision === "yes" ? Object.fromEntries(Object.entries(answer.values).map(([id, value]) => [id, { answers: [String(value)] }])) : {} });
      } else {
        this.options.send({ id: message.id, error: { code: -32601, message: "Piko does not support this request" } });
      }
    } catch {
      if (!this.ended) this.options.send({ id: message.id, error: { code: -32603, message: "Approval could not be completed" } });
    }
  }
  private complete(code: number, error?: string) {
    if (this.ended) return;
    this.exitCode = code;
    this.options.emit(code === 0 ? { type: "turn.completed", usage: this.usage } : { type: "turn.failed", error: { message: error } });
    this.dispose(); this.options.finish(code);
  }
  dispose() {
    this.ended = true;
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(new Error("Codex connection closed")); }
    this.pending.clear();
  }
}
