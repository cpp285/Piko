import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { approvalFields, validateApprovalValues } from '@piko/shared';
import { AgentSession, setSessionDir, setStorageRoot, type OrchestratorEvent } from '@piko/orchestrator';
import { CodexAppServer, authorizedBrowserOrigin, type CodexApproval } from '@piko/orchestrator';

test('approval forms require explicit choices and reject invented or unsupported values', () => {
  const fields = approvalFields({ type: 'object', properties: { duration: { type: 'string', enum: ['once', 'session'] }, consent: { type: 'boolean' } }, required: ['duration', 'consent'] });
  assert.throws(() => validateApprovalValues(fields, {}), /填写/);
  assert.throws(() => validateApprovalValues(fields, { duration: 'forever', consent: true }), /选择/);
  assert.deepEqual(validateApprovalValues(fields, { duration: 'once', consent: false, hiddenGrant: true }), { duration: 'once', consent: false });
  assert.throws(() => approvalFields({ type: 'object', properties: { secret: { type: 'string', format: 'password' } } }));
});

test('ongoing grants apply only to exact authorized site connections, and can be revoked live', async () => {
  let approved = ['https://creator.douyin.com']; const sent: any[] = []; let prompted = 0;
  const request = { serverName: 'cua_repl', mode: 'form', message: 'Allow Browser use to access https://creator.douyin.com?', requestedSchema: { type: 'object', properties: {} } };
  assert.equal(authorizedBrowserOrigin(request, approved), approved[0]);
  for (const changed of [
    { serverName: 'other' }, { mode: 'url' },
    { message: 'Allow Browser use to access https://creator.douyin.com.evil.test?' },
    { message: 'Allow Browser use to access https://creator.douyin.com/private?' },
    { message: 'Allow Browser use to upload to https://creator.douyin.com?' },
    { message: 'Allow Browser use to access https://x.com?' },
    { requestedSchema: { type: 'object', properties: { extra: { type: 'boolean' } } } },
  ]) assert.equal(authorizedBrowserOrigin({ ...request, ...changed }, approved), undefined);
  const server = new CodexAppServer({ send: m => sent.push(m), emit: () => {}, finish: () => {}, approvedBrowserOrigins: () => approved,
    approve: async () => { prompted++; return { decision: 'no', values: {} }; } });
  server.handle({ id: 1, method: 'mcpServer/elicitation/request', params: request });
  assert.equal(sent[0].result.action, 'accept'); assert.equal(prompted, 0);
  approved = []; server.handle({ id: 2, method: 'mcpServer/elicitation/request', params: request });
  await new Promise(r => setImmediate(r)); assert.equal(prompted, 1); assert.equal(sent[1].result.action, 'decline');
  server.dispose();
});

test('app-server blocks until a real approval answer and propagates rejection without granting permissions', async () => {
  const sent: any[] = []; let answer!: (value: CodexApproval) => void;
  const server = new CodexAppServer({ send: m => sent.push(m), emit: () => {}, finish: () => {}, approve: () => new Promise(resolve => { answer = resolve; }) });
  server.handle({ id: 101, method: 'mcpServer/elicitation/request', params: { mode: 'form', message: 'Visit creator.douyin.com?', serverName: 'browser', requestedSchema: { type: 'object', properties: {} } } });
  assert.equal(sent.length, 0);
  await new Promise(r => setImmediate(r));
  answer({ decision: 'no', values: {} }); await new Promise(r => setImmediate(r));
  assert.deepEqual(sent, [{ id: 101, result: { action: 'decline', content: null, _meta: null } }]);
  server.dispose();
});

test('unsupported verification cannot be accepted and late answers do not revive a cancelled request', async () => {
  const sent: any[] = []; let count = 0; let answer!: (value: CodexApproval) => void;
  const server = new CodexAppServer({ send: m => sent.push(m), emit: () => {}, finish: () => {}, approve: () => { count++; return new Promise(resolve => { answer = resolve; }); } });
  server.handle({ id: 2, method: 'mcpServer/elicitation/request', params: { mode: 'openai/userVerification', challenge: 'do-not-solve' } });
  assert.equal(sent[0].result.action, 'decline'); assert.equal(count, 0);
  server.handle({ id: 3, method: 'mcpServer/elicitation/request', params: { mode: 'form', requestedSchema: { type: 'object', properties: {} } } });
  await new Promise(r => setImmediate(r));
  server.dispose(); answer({ decision: 'yes', values: {} }); await new Promise(r => setImmediate(r));
  assert.equal(sent.length, 1);
});

test('a real AgentSession carries approvals over stdio, preserves the sandbox and returns only public final text', { timeout: 10000 }, async t => {
  const root = mkdtempSync(path.join(tmpdir(), 'piko-app-server-'));
  setSessionDir(root); setStorageRoot(path.join(root, 'memory'));
  const script = path.join(root, 'server.cjs');
  writeFileSync(script, `
    const readline = require('node:readline');
    const send = m => process.stdout.write(JSON.stringify(m) + '\\n');
    readline.createInterface({ input: process.stdin }).on('line', line => {
      const m = JSON.parse(line);
      if(m.method==='initialize') send({id:m.id,result:{}});
      if(m.method==='thread/start') {
        if(m.params.sandbox!=='workspace-write'||m.params.approvalPolicy!=='on-request') process.exit(4);
        send({id:m.id,result:{thread:{id:'fixture-thread'}}});
      }
      if(m.method==='turn/start') {
        send({id:m.id,result:{turn:{id:'turn'}}});
        send({method:'turn/started',params:{threadId:'fixture-thread'}});
        send({method:'item/completed',params:{item:{type:'reasoning',content:['PRIVATE_REASONING']}}});
        send({id:900,method:'mcpServer/elicitation/request',params:{threadId:'fixture-thread',mode:'form',serverName:'browser',message:'Allow creator.douyin.com this time?',requestedSchema:{type:'object',properties:{scope:{type:'string',enum:['once','session']}},required:['scope']}}});
      }
      if(m.id===900&&m.result) {
        if(m.result.action!=='accept'||m.result.content.scope!=='once') process.exit(5);
        send({method:'item/completed',params:{item:{type:'mcpToolCall',tool:'read',result:{text:'TOOL_PRIVATE'},status:'completed'}}});
        send({method:'item/completed',params:{item:{type:'agentMessage',phase:'final_answer',text:'已读取本次账号数据。'}}});
        send({method:'thread/tokenUsage/updated',params:{tokenUsage:{total:{inputTokens:12,outputTokens:8}}}});
        send({method:'turn/completed',params:{turn:{status:'completed',error:null}}});
      }
    });
  `);
  const events: OrchestratorEvent[] = []; let finish!: (e: OrchestratorEvent) => void;
  const done = new Promise<OrchestratorEvent>(r => { finish = r; });
  // The wrapper ignores the standard app-server arguments and starts the fixture.
  const command = path.join(root, 'codex');
  writeFileSync(command, `#!/bin/sh\nexec '${process.execPath.replaceAll("'", "'\\''")}' '${script.replaceAll("'", "'\\''")}'\n`, { mode: 0o755 });
  const session = new AgentSession({ agentId: 'marketing', name: '示例运营员', role: '运营', workspace: root, sandboxMode: 'safe', renderPrompt: () => 'read account',
    backend: { id: 'codex', name: 'Codex fixture', command, transport: 'codex-app-server', buildArgs: () => [] },
    onEvent: e => {
      events.push(e);
      if(e.type==='approval:needed') {
        assert.match(e.summary,/creator.douyin.com/);
        assert.throws(() => session.resolveApproval(e.approvalId,'yes',{}),/填写/);
        session.resolveApproval(e.approvalId,'yes',{scope:'once'});
      }
      if(e.type==='task:done'||e.type==='task:failed') finish(e);
    },
  });
  t.after(() => { session.destroy(); rmSync(root,{recursive:true,force:true}); });
  await session.runTask('read', 'read account'); const result=await done;
  assert.equal(result.type,'task:done'); if(result.type==='task:done') assert.equal(result.result.fullOutput,'已读取本次账号数据。');
  assert.doesNotMatch(JSON.stringify(events),/PRIVATE_REASONING|TOOL_PRIVATE/);
  assert.ok(events.some(e=>e.type==='token:update'&&e.inputTokens===12&&e.outputTokens===8));
});
