import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultPersona, CHARACTER_APPEARANCES, CHARACTER_COUNT, DEFAULT_AGENT_DEFS, SaveAgentDefCommand } from '@piko/shared';


test('custom roles include user responsibilities and article editors get a specific editorial workflow', () => {
  const editor = createDefaultPersona({name:'小林',role:'文章编辑',skills:'公众号编辑；保留作者语气',personality:'先给成稿再解释'});
  assert.match(editor.identity,/我是小林/); assert.match(editor.identity,/公众号编辑；保留作者语气/);
  assert.match(editor.soul,/事实与数据标注来源/); assert.match(editor.soul,/先给成稿再解释/);
  const custom = createDefaultPersona({name:'小周',role:'展览策划',skills:'为社区策划每月摄影展'});
  assert.match(custom.identity,/展览策划/); assert.match(custom.identity,/每月摄影展/);
  assert.doesNotMatch(custom.soul,/编写代码|测试通过/);
});
test('the expanded appearance library retains all eight original people and adds distinct asset slots', () => {
  assert.equal(CHARACTER_COUNT,14);
  assert.deepEqual(CHARACTER_APPEARANCES.slice(0,8).map(c=>c.id),['qinghe','molan','yuebai','lichuan','huiqing','zhiheng','xingyao','mingjing']);
  assert.equal(new Set(CHARACTER_APPEARANCES.map(c=>c.asset)).size,14);
  for(const def of DEFAULT_AGENT_DEFS)assert.equal(CHARACTER_APPEARANCES[def.palette].name,def.name);
});
test('creation payload accepts Chinese roles, custom appearance and editable documents while rejecting unsafe ids', () => {
  const command = {type:'SAVE_AGENT_DEF',requestId:'create',agent:{id:'person-editor',name:'文章编辑',role:'文章编辑',skills:'编辑文章',personality:'直接',palette:8,isBuiltin:false,teamRole:'dev'},initialPersona:{identity:'我的身份',soul:'我的工作方式'}};
  assert.equal(SaveAgentDefCommand.safeParse(command).success,true);
  assert.equal(SaveAgentDefCommand.safeParse({...command,agent:{...command.agent,id:'../escape'}}).success,false);
  assert.equal(SaveAgentDefCommand.safeParse({...command,agent:{...command.agent,role:' '}}).success,false);
});
