import { nanoid } from "nanoid";
import type { GatewayEvent, WorkroomAction } from "@piko/shared";
import { sendCommand } from "./connection";
type Result = Extract<GatewayEvent, { type: "WORKROOM_RESULT" }>;
const pending = new Map<string, { resolve: (result: Result) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
export function workroomRequest(action: WorkroomAction): Promise<Result> {
  const requestId = nanoid();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(requestId); reject(new Error("未收到回复。请检查连接后重试，你填写的内容已保留。")); }, action.op === "upload-resource" || action.op === "import-resource-folder" ? 60000 : 15000);
    pending.set(requestId, { resolve, reject, timer }); sendCommand({ type: "WORKROOM", requestId, action });
  });
}
export function receiveWorkroomResult(result: Result) {
  const request = pending.get(result.requestId); if (!request) return;
  clearTimeout(request.timer); pending.delete(result.requestId);
  if (result.success) request.resolve(result); else request.reject(new Error(result.message || "操作失败，请重试。"));
}
