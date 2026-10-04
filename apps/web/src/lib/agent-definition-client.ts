import { nanoid } from 'nanoid';
import type { AgentDefinition, GatewayEvent, PersonaDocuments } from '@piko/shared';
import { sendCommand } from './connection';
type Result = Extract<GatewayEvent, { type: 'AGENT_DEF_SAVED' }>;
const pending = new Map<string, { resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
export function saveAgentDefinition(agent: AgentDefinition, initialPersona?: PersonaDocuments): Promise<void> {
  const requestId = nanoid();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('未收到保存结果，草稿已保留。请检查连接后重试。')); }, 15000);
    pending.set(requestId, { resolve, reject, timer });
    sendCommand({ type: 'SAVE_AGENT_DEF', requestId, agent, initialPersona });
  });
}
export function receiveAgentDefinitionResult(result: Result) {
  const request = pending.get(result.requestId); if (!request) return;
  clearTimeout(request.timer); pending.delete(result.requestId);
  if (result.success) request.resolve(); else request.reject(new Error(result.message || '人物保存失败，请重试。'));
}
