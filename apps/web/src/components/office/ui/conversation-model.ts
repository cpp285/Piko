import type { ChatMessage, TeamChatMessage } from '@/store/office-store';

export interface ConversationMember {
  agentId: string;
  name: string;
  teamId?: string;
  isTeamLead?: boolean;
  messages: ChatMessage[];
}
export interface ConversationGroup {
  id: string;
  members: ConversationMember[];
  lead?: ConversationMember;
}
export interface GroupEntry {
  id: string;
  kind: TeamChatMessage['messageType'] | 'user' | 'update';
  agentId: string;
  name: string;
  toAgentId?: string;
  toName?: string;
  text: string;
  timestamp: number;
  detailAgentId: string;
}

export function buildConversationGroups(members: ConversationMember[]): ConversationGroup[] {
  const groups = new Map<string, ConversationGroup>();
  for (const member of members) {
    if (!member.teamId) continue;
    const group = groups.get(member.teamId) ?? { id: member.teamId, members: [] };
    group.members.push(member);
    if (member.isTeamLead) group.lead = member;
    groups.set(member.teamId, group);
  }
  return [...groups.values()];
}

/** A group is a coordination feed. Execution logs remain in the individual chat. */
export function buildGroupEntries(group: ConversationGroup, activity: TeamChatMessage[]): GroupEntry[] {
  const memberIds = new Set(group.members.map(m => m.agentId));
  const entries: GroupEntry[] = activity
    .filter(m => memberIds.has(m.fromAgentId) && (!m.toAgentId || memberIds.has(m.toAgentId)))
    .map(m => ({
      id: `activity:${m.id}`, kind: m.messageType, agentId: m.fromAgentId,
      name: m.fromAgentName, toAgentId: m.toAgentId, toName: m.toAgentName,
      text: m.message, timestamp: m.timestamp,
      detailAgentId: m.messageType === 'delegation' ? m.toAgentId ?? m.fromAgentId : m.fromAgentId,
    }));
  // Only user requests and completed lead replies belong in the group. No stdout/tool logs.
  for (const m of group.lead?.messages ?? []) {
    if (m.role !== 'user' && !(m.role === 'agent' && (m.isFinalResult || m.result))) continue;
    if (!m.text.trim()) continue;
    // A lead reply may also arrive as a team status event; keep it once.
    if (m.role !== 'user' && entries.some(e => e.agentId === group.lead!.agentId && e.text.trim() === m.text.trim())) continue;
    entries.push({
      id: `lead:${m.id}`, kind: m.role === 'user' ? 'user' : 'update',
      agentId: group.lead!.agentId, name: group.lead!.name,
      text: m.text, timestamp: m.timestamp, detailAgentId: group.lead!.agentId,
    });
  }
  return entries.sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
}

export function messageSummary(text: string, limit = 220): string {
  const summary = /^\s*(?:ENTRY_FILE|PREVIEW_CMD|PROJECT_DIR):/.test(text) && /\bSUMMARY:/.test(text) ? text.slice(text.indexOf('SUMMARY:') + 8) : text;
  const content = summary.replace(/^\s*(?:ENTRY_FILE|PREVIEW_CMD|PREVIEW_PORT|PROJECT_DIR):[^\n]*(?:\n|$)/gm, '').replace(/^\s*(?:SUMMARY|\[PLAN\]):?\s*/gm, '');
  const plain = content.replace(/\[Attached image:[^\]]+\]/g, '[图片]')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/(?:^|\n)\s*#{1,6}\s*/g, ' ').replace(/[*`]/g, '').replace(/\s+/g, ' ').trim();
  return plain.length > limit ? `${plain.slice(0, limit)}…` : plain;
}

/** Mentions are instructions to the lead, never a bypass of team orchestration. */
export function groupRecipient(group: ConversationGroup): string | null {
  return group.lead?.agentId ?? null;
}
