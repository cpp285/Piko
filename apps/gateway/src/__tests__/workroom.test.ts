import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MemberSettingsSchema, type WorkroomMember } from '@piko/shared';
import { AgentSession, setSessionDir, setStorageRoot } from '@piko/orchestrator';
import { WorkroomService, nextContactTime, settingsVersion } from '../workroom-service.js';

const people: WorkroomMember[] = [
  { key: 'definition:pm', target: { kind: 'definition', id: 'pm' }, name: '王欣', role: 'Product Manager', palette: 6 },
  { key: 'definition:design', target: { kind: 'definition', id: 'design' }, name: '许琳', role: 'UI Designer', palette: 4 },
];
function setup(t: any, real = false) {
  const root = mkdtempSync(path.join(tmpdir(), 'piko-workroom-'));
  let now = new Date('2026-10-04T01:00:00Z').getTime();
  let hold = false;
  let livePeople = people;
  const calls: Array<{ id: string; taskId: string; prompt: string; workspace: string; options: any }> = [];
  const sessions: any[] = [];
  const options: ConstructorParameters<typeof WorkroomService>[0] = {
    directory: path.join(root, 'rooms'), members: () => livePeople,
    persona: member => `IDENTITY_${member.name}`, defaultBackend: () => 'fixture', defaultModel: () => undefined,
    backend: () => ({ id: 'fixture', name: 'Fixture', command: process.execPath, buildArgs(prompt) {
      calls.push({ id: '', taskId: '', prompt, workspace: '', options: null });
      return ['-e', prompt.includes('你是 王欣') ? 'console.log("@许琳: 请给出配色建议")' : 'console.log("SUMMARY: 建议使用浅绿色")'];
    } }),
    now: () => now, publish: () => {}, sandboxMode: 'safe',
    createSession: real ? undefined : opts => {
      const session = { onDelegation: null as any, runTask: async (taskId: string, task: string, workspace: string) => {
        const prompt = opts.renderPrompt('worker-initial', { prompt: task }) + opts.getPersona!();
        calls.push({ id: opts.agentId, taskId, prompt, workspace, options: opts });
        if (!hold) opts.onEvent({ type: 'task:done', agentId: opts.agentId, taskId, result: { summary: `${opts.name}的回复`, changedFiles: [], diffStat: '', testResult: 'unknown' } });
      }, cancelTask: () => {}, resolveApproval: () => {}, destroy: () => {} };
      sessions.push(session); return session;
    },
  };
  setSessionDir(path.join(root, 'sessions')); setStorageRoot(path.join(root, 'memory'));
  let service = new WorkroomService(options);
  t.after(() => { service.destroy(); rmSync(root, { recursive: true, force: true }); });
  const configure = (key: string, update: any) => {
    const current = service.memberSettings(key);
    service.handle({ op: 'settings', memberKey: key, settings: MemberSettingsSchema.parse({ ...current, ...update }), expectedVersion: settingsVersion(current) });
  };
  const create = (kind: 'group' | 'direct', memberKeys = [people[0].key], folder: string | null = null) => service.handle({ op: 'create', kind, name: '', memberKeys, folder }).conversationId!;
  const send = (id: string, text = '你好', messageId = 'message-'+calls.length) => service.handle({ op: 'send', conversationId: id, text, messageId });
  return { root, get service() { return service; }, calls, sessions, configure, create, send,
    setMembers: (members: WorkroomMember[]) => { livePeople = members; },
    advance: (minutes: number) => { now += minutes * 60000; }, hold: (value: boolean) => { hold = value; },
    restart: () => { service.destroy(); service = new WorkroomService(options); },
  };
}

test('member skills and knowledge persist, affect the right person, and honor disabled resources', async t => {
  const f = setup(t); const file = path.join(f.root, 'marketing.md'); writeFileSync(file, 'BRAND_REFERENCE');
  f.configure(people[0].key, { skills: [{ id: 's', title: '社媒分析', source: 'text', content: 'MARKETING_SKILL', enabled: true }], knowledge: [{ id: 'k', title: '品牌', source: 'file', content: file, enabled: true }, { id: 'off', title: '停用', source: 'text', content: 'DISABLED_RESOURCE', enabled: false }] });
  const privateChat = f.create('direct'); f.send(privateChat);
  assert.match(f.calls[0].prompt, /MARKETING_SKILL/); assert.match(f.calls[0].prompt, /BRAND_REFERENCE/); assert.doesNotMatch(f.calls[0].prompt, /DISABLED_RESOURCE/);
  const designerChat = f.create('direct', [people[1].key]); f.send(designerChat);
  assert.doesNotMatch(f.calls[1].prompt, /MARKETING_SKILL|BRAND_REFERENCE/);
  f.restart(); assert.equal(f.service.memberSettings(people[0].key).skills[0].title, '社媒分析');
  const before = f.service.memberSettings(people[0].key);
  f.configure(people[0].key, { model: 'changed' });
  assert.throws(() => f.service.handle({ op: 'settings', memberKey: people[0].key, settings: before, expectedVersion: settingsVersion(before) }), /其他窗口/);
});

test('direct and group chats both work without folders, attach/detach folders and isolate execution contexts', t => {
  const f = setup(t); const direct = f.create('direct');
  assert.equal(f.create('direct'), direct, 'Starting a private chat twice must not duplicate it');
  const groupA = f.create('group', people.map(p => p.key)); const groupB = f.create('group', people.map(p => p.key));
  f.send(direct, 'PRIVATE_ONLY'); f.send(groupA, 'GROUP_A_ONLY'); f.send(groupB, 'GROUP_B_ONLY');
  assert.equal(new Set(f.calls.map(c => c.id)).size, 3);
  assert.ok(f.calls[0].workspace.includes('/scratch/')); assert.doesNotMatch(f.calls[1].prompt, /PRIVATE_ONLY|GROUP_B_ONLY/);
  const folder = path.join(f.root, 'project'); mkdirSync(folder);
  f.service.handle({ op: 'update', conversationId: groupA, name: '工作组', memberKeys: people.map(p => p.key), coordinator: people[0].key, folder }); f.send(groupA);
  assert.equal(f.calls.at(-1)!.workspace, folder); assert.notEqual(f.calls[1].id, f.calls.at(-1)!.id);
  f.service.handle({ op: 'update', conversationId: groupA, name: '工作组', memberKeys: people.map(p => p.key), coordinator: people[0].key, folder: null }); f.send(groupA);
  assert.ok(f.calls.at(-1)!.workspace.includes('/scratch/'));
  assert.throws(() => f.create('group', [people[0].key], '/missing-folder-no-create'), /文件夹路径/);
  f.restart(); assert.equal(f.service.snapshot().conversations.length, 3);
  assert.ok(f.service.snapshot().conversations.find(r => r.id === direct)!.messages.some(m => m.text === 'PRIVATE_ONLY'));
});

test('mentions route only to selected members; repeated message IDs are idempotent; cancel stops a whole round', t => {
  const f = setup(t); const group = f.create('group', people.map(p => p.key));
  f.send(group, '@许琳 看看这个界面', 'stable-id'); assert.match(f.calls[0].prompt, /你是 许琳/);
  f.send(group, '@许琳 看看这个界面', 'stable-id'); assert.equal(f.calls.length, 1);
  f.hold(true); f.send(group, '请组织讨论');
  assert.throws(() => f.service.handle({ op: 'update', conversationId: group, name: 'x', memberKeys: [people[0].key], coordinator: people[0].key, folder: null }), /正在|运行/);
  f.service.handle({ op: 'cancel', conversationId: group }); assert.ok(f.service.snapshot().conversations[0].messages.every(m => m.state !== 'working'));
  f.hold(false); f.send(group, '继续'); assert.equal(f.calls.length, 3);
});

test('a saved proactive rule initiates real execution and an unread private conversation; restart does not replay old intervals', t => {
  const f = setup(t); f.configure(people[0].key, { proactive: { enabled: true, instruction: 'REPORT_ON_PROGRESS', cadence: 'interval', intervalMinutes: 15 } });
  f.service.tick(); assert.equal(f.calls.length, 0);
  f.advance(16); f.service.tick(); assert.equal(f.calls.length, 1); assert.match(f.calls[0].prompt, /REPORT_ON_PROGRESS/);
  const room = f.service.snapshot().conversations[0]; assert.equal(room.kind, 'direct'); assert.ok(room.messages[0].proactive); assert.ok(room.messages[0].timestamp > room.readAt);
  f.service.tick(); assert.equal(f.calls.length, 1);
  f.restart(); f.service.tick(); assert.equal(f.calls.length, 1);
  f.advance(120); f.service.tick(); f.service.tick(); assert.equal(f.calls.length, 2, 'Missed intervals coalesce into one run');
  f.configure(people[0].key, { proactive: { ...f.service.memberSettings(people[0].key).proactive, enabled: false } }); f.advance(20); f.service.tick(); assert.equal(f.calls.length, 2);
});

test('proactive checks wait for busy people, and completion reports use existing evidence without a second AI call', t => {
  const f = setup(t); f.configure(people[0].key, { proactive: { enabled: true, instruction: '汇报', cadence: 'interval', intervalMinutes: 15, notifyOnCompletion: true } });
  f.hold(true); const group = f.create('group'); f.send(group); f.advance(16); f.service.tick(); assert.equal(f.calls.length, 1);
  const call = f.calls[0]; call.options.onEvent({ type: 'task:done', agentId: call.id, taskId: call.taskId, result: { summary: '真实交付', changedFiles: [], diffStat: '', testResult: 'unknown' } });
  const direct = f.service.snapshot().conversations.find(r => r.kind === 'direct')!;
  assert.match(direct.messages[0].text, /真实交付/); assert.equal(f.calls.length, 1); assert.ok(direct.messages[0].timestamp > direct.readAt);
  f.service.report(people[0].key, '旧团队', '旧团队故障', false); assert.match(direct.messages.at(-1)!.text, /旧团队故障/);
  f.hold(false); f.service.tick(); assert.equal(f.calls.length, 2);
});

test('daily contact time rolls forward and rejects invalid setup', t => {
  const f = setup(t); const settings = MemberSettingsSchema.parse({ proactive: { time: '09:00' } });
  const before = new Date(2026, 9, 4, 8, 0).getTime(); const after = new Date(2026, 9, 4, 10, 0).getTime();
  assert.equal(nextContactTime(settings, before), new Date(2026, 9, 4, 9, 0).getTime()); assert.equal(nextContactTime(settings, after), new Date(2026, 9, 5, 9, 0).getTime());
  assert.throws(() => f.configure(people[0].key, { proactive: { enabled: true, instruction: '' } }), /工作|希望/);
  assert.throws(() => MemberSettingsSchema.parse({ proactive: { intervalMinutes: 1 } }));
});

test('actual AgentSession dispatch parses group delegation and runs another person without a team/project gate', { timeout: 15000 }, async t => {
  const f = setup(t, true); const group = f.create('group', people.map(p => p.key)); f.send(group, '讨论配色');
  for (let i = 0; i < 100; i++) { const messages = f.service.snapshot().conversations[0].messages; if (messages.length === 3 && messages.every(m => m.state === 'done')) break; await new Promise(resolve => setTimeout(resolve, 50)); }
  const messages = f.service.snapshot().conversations[0].messages;
  assert.equal(messages.length, 3); assert.equal(messages[2].sender, people[1].key); assert.equal(messages[2].state, 'done'); assert.match(messages[2].text, /浅绿色/);
});


test('referenced people keep their identity and settings when a legacy team roster changes', t => {
  const f = setup(t); const chat = f.create('direct'); f.send(chat);
  f.configure(people[0].key, { skills: [{ id: 's', title: '专长', source: 'text', content: 'RETAINED_SKILL', enabled: true }] });
  f.setMembers([people[1]]); f.restart();
  assert.equal(f.service.snapshot().members.length, 2);
  assert.equal(f.service.findMember(people[0].target)?.name, '王欣');
  f.send(chat, '继续工作'); assert.match(f.calls.at(-1)!.prompt, /RETAINED_SKILL/);
});
