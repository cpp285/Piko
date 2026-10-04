import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildConversationGroups, buildGroupEntries, groupRecipient, messageSummary, type ConversationMember } from '../conversation-model';
import type { TeamChatMessage } from '@/store/office-store';

const members: ConversationMember[] = [
  { agentId: 'lead', name: '陈峰', teamId: 'team-a', isTeamLead: true, messages: [
    { id: 'request', role: 'user', text: '@许琳 设计游戏界面', timestamp: 100 },
    { id: 'stream', role: 'agent', text: 'PRIVATE_EXECUTION_LOG', timestamp: 110 },
    { id: 'queued', role: 'system', text: 'Task queued', timestamp: 120 },
    { id: 'plan', role: 'agent', text: '[PLAN] 游戏计划', timestamp: 130, result: {summary: '游戏计划', changedFiles: [], diffStat: '', testResult: 'unknown'} },
    { id: 'done', role: 'agent', text: '游戏交付完成', timestamp: 300, isFinalResult: true },
  ] },
  ...['开发', '设计', '产品', '审查'].map((name, i) => ({agentId: `worker-${i}`, name, teamId: 'team-a', messages: [{ id: 'private', role: 'agent' as const, text: 'WORKER_PRIVATE_LOG', timestamp: 220 }] })),
  { agentId: 'other', name: '其他团队', teamId: 'team-b', isTeamLead: true, messages: [] },
  { agentId: 'solo', name: '独立成员', messages: [] },
];
const activity: TeamChatMessage[] = [
  { id: '1', fromAgentId: 'lead', fromAgentName: '陈峰', toAgentId: 'worker-1', toAgentName: '设计', message: '设计四种游戏状态', messageType: 'delegation', timestamp: 200 },
  { id: '2', fromAgentId: 'worker-1', fromAgentName: '设计', toAgentId: 'lead', toAgentName: '陈峰', message: '设计完成', messageType: 'result', timestamp: 250 },
  { id: '3', fromAgentId: 'other', fromAgentName: '其他团队', message: 'OTHER_TEAM_PRIVATE', messageType: 'status', timestamp: 260 },
  { id: '4', fromAgentId: 'lead', fromAgentName: '陈峰', toAgentId: 'other', message: 'CROSS_TEAM_PRIVATE', messageType: 'delegation', timestamp: 270 },
];

test('five-person team retains every member, other teams and solo chats stay separate', () => {
 const groups = buildConversationGroups(members);
 assert.deepEqual(groups.map(g => g.members.length), [5, 1]);
 assert.equal(groups[0].lead?.name, '陈峰');
 assert.equal(members.length, 7);
});
test('group feed includes requests, plans, delegation, result and final reply in order, without execution logs', () => {
 const feed = buildGroupEntries(buildConversationGroups(members)[0], activity);
 assert.deepEqual(feed.map(e => e.kind), ['user', 'update', 'delegation', 'result', 'update']);
 assert.ok(!JSON.stringify(feed).includes('PRIVATE'));
 assert.equal(feed[2].toName, '设计');
 assert.equal(feed[2].detailAgentId, 'worker-1');
 assert.equal(feed[3].detailAgentId, 'worker-1');
 assert.equal(feed[1].detailAgentId, 'lead');
});
test('the same final update delivered over both channels appears once', () => {
 const duplicate: TeamChatMessage = { id: '5', fromAgentId: 'lead', fromAgentName: '陈峰', message: '游戏交付完成', messageType: 'status', timestamp: 300 };
 assert.equal(buildGroupEntries(buildConversationGroups(members)[0], [...activity, duplicate]).filter(e => e.text === '游戏交付完成').length, 1);
});
test('mentions route through the actual team lead; missing lead never routes to arbitrary worker', () => {
 const group = buildConversationGroups(members)[0];
 assert.equal(groupRecipient(group), 'lead');
 const withoutLead = buildConversationGroups(members.filter(a => a.agentId !== 'lead'))[0];
 assert.equal(groupRecipient(withoutLead), null);
});
test('summaries strip markdown and delivery metadata and cap lengthy execution results', () => {
 assert.equal(messageSummary('ENTRY_FILE: index.html\nPREVIEW_CMD: N/A\nSUMMARY: **已完成** [设计](https://example.com)'), '已完成 设计');
 assert.equal(messageSummary('ENTRY_FILE: index.html PREVIEW_CMD: N/A SUMMARY: 已交付'), '已交付');
 assert.equal(messageSummary('a'.repeat(500)).length, 221);
 assert.ok(!messageSummary('[Attached image: /private/image.png]').includes('/private/'));
});
