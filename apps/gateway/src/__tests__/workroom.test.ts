import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MemberSettingsSchema, type WorkroomMember } from '@piko/shared';
import { AgentSession, setSessionDir, setStorageRoot } from '@piko/orchestrator';
import { WorkroomService, nextContactTime, settingsVersion } from '../workroom-service.js';

const people: WorkroomMember[] = [
  { key: 'definition:pm', target: { kind: 'definition', id: 'pm' }, name: '王欣', role: 'Product Manager', palette: 6 },
  { key: 'definition:design', target: { kind: 'definition', id: 'design' }, name: '许琳', role: 'UI Designer', palette: 4 },
];

test('chat artifacts open only real documents inside their own folder, including scratch chats', t => {
  const f=setup(t); const folder=path.join(f.root,'文章'); mkdirSync(folder);
  const article=path.join(folder,'中文 稿件.md'); writeFileSync(article,'正文');
  const outside=path.join(f.root,'private.md'); writeFileSync(outside,'PRIVATE');
  const room=f.create('group',people.map(p=>p.key),folder);
  const open=(file:string)=>f.service.handle({op:'open-file',conversationId:room,path:file});
  assert.equal(open('中文 稿件.md').openFilePath,realpathSync(article));
  assert.equal(open(article).openFilePath,realpathSync(article));
  assert.throws(()=>open('../private.md'),/本会话/);
  symlinkSync(outside,path.join(folder,'shortcut.md')); assert.throws(()=>open('shortcut.md'),/本会话/);
  assert.throws(()=>open('missing.md'),/不存在/);
  assert.throws(()=>open('script.command'),/文档或图片/);
  const direct=f.create('direct'); f.send(direct);
  const scratch=f.calls.at(-1)!.workspace; const draft=path.join(scratch,'draft.txt'); writeFileSync(draft,'draft');
  assert.equal(f.service.handle({op:'open-file',conversationId:direct,path:'draft.txt'}).openFilePath,realpathSync(draft));
  assert.throws(()=>f.service.handle({op:'open-file',conversationId:direct,path:article}),/本会话/);
});
test('Markdown previews return current text without opening an application and stay within the chat folder', t => {
  const f = setup(t), folder = path.join(f.root, '文档'); mkdirSync(folder);
  const content = '# 中文长文\n\n' + '可以在应用内阅读。'.repeat(1500);
  const file = path.join(folder, '测试 稿件.md'); writeFileSync(file, content);
  const room = f.create('group', people.map(p => p.key), folder);
  const preview = (file: string) => f.service.handle({ op: 'preview-markdown', conversationId: room, path: file });
  assert.equal(preview('测试 稿件.md').document?.content, content);
  assert.equal(preview(file).document?.name, '测试 稿件.md');
  assert.equal(preview(file).openFilePath, undefined);
  writeFileSync(file, '修改后的内容'); assert.equal(preview(file).document?.content, '修改后的内容');
  const outside = path.join(f.root, 'private.md'); writeFileSync(outside, 'PRIVATE');
  assert.throws(() => preview('../private.md'), /本会话/);
  symlinkSync(outside, path.join(folder, 'shortcut.md')); assert.throws(() => preview('shortcut.md'), /本会话/);
  assert.throws(() => preview('missing.md'), /不存在/);
  assert.throws(() => preview('page.html'), /Markdown/);
  writeFileSync(path.join(folder, 'large.md'), Buffer.alloc(1024 * 1024 + 1)); assert.throws(() => preview('large.md'), /1 MB/);
  writeFileSync(path.join(folder, 'binary.md'), Buffer.from([0xff, 0xfe])); assert.throws(() => preview('binary.md'), /UTF-8/);
  mkdirSync(path.join(folder, 'directory.md')); assert.throws(() => preview('directory.md'), /不是文档/);
  writeFileSync(file, ''); assert.equal(preview(file).document?.content, '');
  const direct = f.create('direct'); f.send(direct);
  writeFileSync(path.join(f.calls.at(-1)!.workspace, 'draft.md'), '# 私聊交付');
  assert.equal(f.service.handle({ op: 'preview-markdown', conversationId: direct, path: 'draft.md' }).document?.content, '# 私聊交付');
  assert.throws(() => f.service.handle({ op: 'preview-markdown', conversationId: direct, path: file }), /本会话/);
});
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
      if (prompt.includes('WAIT_FOR_CANCEL')) return ['-e', `setTimeout(() => { require('node:fs').writeFileSync(${JSON.stringify(path.join(root, 'late-output.txt'))}, 'late'); console.log('@许琳: 不应派发'); }, 1000)`];
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

test('natural chat style reaches direct chats, groups and proactive messages without replacing identities', t => {
  const f = setup(t);
  f.send(f.create('direct'), '这条视频开头怎么改？');
  f.send(f.create('group', people.map(p => p.key)), '用表格比较两个方案');
  f.configure(people[0].key, { proactive: { enabled: true, instruction: '提醒我复盘', cadence: 'interval', intervalMinutes: 15 } });
  f.advance(16); f.service.tick();
  assert.equal(f.calls.length, 3);
  for (const call of f.calls) {
    assert.match(call.prompt, /默认用普通文字和自然段/);
    assert.match(call.prompt, /用户明确要求表格、清单、代码或文章排版时/);
    assert.match(call.prompt, /IDENTITY_王欣/);
  }
  assert.match(f.calls[1].prompt, /只能在独立一行使用 @成员姓名/);
  assert.match(f.calls[1].prompt, /用表格比较两个方案/);
  assert.match(f.calls[2].prompt, /主动联系/);
});

test('uploads become usable only after saving, persist after restart, and preserve existing member settings', t => {
  const f = setup(t); const key = people[0].key;
  f.configure(key, { model: 'chosen-model', knowledge: [{ id: 'old', title: '旧资料', source: 'text', content: 'ORIGINAL_REFERENCE', enabled: true }] });
  const upload = { op: 'upload-resource' as const, memberKey: key, category: 'skills' as const, title: '文章编辑', files: [{ path: '文章编辑/SKILL.md', data: Buffer.from('UPLOADED_SKILL_METHOD').toString('base64') }] };
  assert.throws(() => f.service.handle({ ...upload, memberKey: 'missing' }), /找不到/);
  const result = f.service.handle(upload);
  assert.equal(result.fileCount, 1); assert.equal(f.service.memberSettings(key).skills.length, 0);
  assert.doesNotMatch(f.service.contextFor(key), /UPLOADED_SKILL_METHOD/);
  f.configure(key, { skills: [result.resource!] }); f.restart();
  assert.equal(f.service.memberSettings(key).model, 'chosen-model');
  assert.match(f.service.contextFor(key), /UPLOADED_SKILL_METHOD/);
  assert.match(f.service.contextFor(key), /ORIGINAL_REFERENCE/);
  assert.doesNotMatch(f.service.contextFor(people[1].key), /UPLOADED_SKILL_METHOD/);
  f.send(f.create('direct'));
  assert.match(f.calls[0].prompt, /UPLOADED_SKILL_METHOD/);
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

test('group replies stay in their room and proactive checks can stay quiet without unread duplicates', t => {
  const f = setup(t); const group = f.create('group'); const direct = f.create('direct');
  f.send(group, '请在群里回答');
  assert.equal(f.service.snapshot().conversations.find(r => r.id === direct)!.messages.length, 0);
  f.service.report(people[0].key, '项目', '不应重复汇报', true);
  assert.equal(f.service.snapshot().conversations.find(r => r.id === direct)!.messages.length, 0);
  f.configure(people[0].key, { proactive: { enabled: true, instruction: '有新观察再找我', cadence: 'interval', intervalMinutes: 15 } });
  f.hold(true); f.advance(16); f.service.tick();
  const call = f.calls.at(-1)!;
  assert.match(call.prompt, /独立的私聊检查/); assert.match(call.prompt, /不要复制群聊交付/);
  call.options.onEvent({ type: 'task:done', agentId: call.id, taskId: call.taskId, result: { summary: '[PIKO_NO_MESSAGE]', changedFiles: [], diffStat: '', testResult: 'unknown' } });
  const room = f.service.snapshot().conversations.find(r => r.id === direct)!;
  assert.equal(room.messages.length, 0); assert.ok(room.updatedAt <= room.readAt);
  f.service.tick(); assert.equal(f.calls.length, 2, 'silent checks do not rerun immediately');
  f.send(direct, '普通回复不能被吞掉');
  const normal = f.calls.at(-1)!;
  normal.options.onEvent({ type: 'task:done', agentId: normal.id, taskId: normal.taskId, result: { summary: '[PIKO_NO_MESSAGE]', changedFiles: [], diffStat: '', testResult: 'unknown' } });
  assert.equal(room.messages.at(-1)!.text, '[PIKO_NO_MESSAGE]');
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

test('a missing reference can be disabled without deleting the saved entry', t => {
  const f = setup(t); const file = path.join(f.root, 'reference.md'); writeFileSync(file, 'REFERENCE_CONTENT');
  const resource = { id: 'file', title: '参考资料', source: 'file', content: file, enabled: true };
  f.configure(people[0].key, { knowledge: [resource] }); rmSync(file);
  assert.doesNotThrow(() => f.configure(people[0].key, { knowledge: [{ ...resource, enabled: false }] }));
  f.send(f.create('direct'));
  assert.equal(f.service.snapshot().conversations[0].messages.at(-1)!.state, 'done');
  assert.doesNotMatch(f.calls.at(-1)!.prompt, /REFERENCE_CONTENT/);
  assert.equal(f.service.memberSettings(people[0].key).knowledge[0].content, file);
  assert.throws(() => f.configure(people[0].key, { knowledge: [resource] }), /找不到/);
});

test('mentions use full names rather than matching prefixes or email addresses', t => {
  const f = setup(t);
  const short = { ...people[1], key: 'definition:short', target: { kind: 'definition' as const, id: 'short' }, name: '王' };
  const email = { ...people[1], key: 'definition:mail', target: { kind: 'definition' as const, id: 'mail' }, name: 'example' };
  f.setMembers([...people, short, email]);
  const room = f.create('group', [people[0].key, people[1].key, short.key, email.key]);
  f.send(room, '@王欣，请整理需求');
  assert.deepEqual(f.calls.map(call => call.options.name), ['王欣']);
  f.send(room, '@许琳 看看联系邮箱 user@example.com');
  assert.equal(f.calls.length, 2); assert.equal(f.calls.at(-1)!.options.name, '许琳');
  f.send(room, '@王 与 @许琳 一起核对');
  assert.deepEqual(f.calls.slice(-2).map(call => call.options.name).sort(), ['王', '许琳'].sort());
});

test('cancelling a real subprocess prevents later writes and delegation', { timeout: 10000 }, async t => {
  const f = setup(t, true); const group = f.create('group', people.map(p => p.key));
  f.send(group, 'WAIT_FOR_CANCEL');
  f.service.handle({ op: 'cancel', conversationId: group });
  await new Promise(resolve => setTimeout(resolve, 1200));
  assert.equal(existsSync(path.join(f.root, 'late-output.txt')), false);
  const messages = f.service.snapshot().conversations[0].messages;
  assert.equal(messages.length, 2, 'Cancellation must not start the delegated member');
  assert.equal(messages[1].state, 'cancelled');
  assert.equal(f.calls.length, 1);
});
