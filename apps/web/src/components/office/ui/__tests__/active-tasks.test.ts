import test from 'node:test';
import assert from 'node:assert/strict';
import type { RoomMessage } from '@piko/shared';
import { countActiveTasks } from '../../../../lib/active-tasks';
import { isVisibleChatMessage, chatActivityTime } from '../../../../lib/chat-visibility';

const message = (state: RoomMessage['state']): RoomMessage => ({ id: 'm', sender: 'member', text: '', timestamp: 0, state });

test('desktop quit confirmation covers direct chats, parallel group work and approvals as well as legacy tasks', () => {
  assert.equal(countActiveTasks([], [{ messages: [message('working')] }]), 1);
  assert.equal(countActiveTasks([], [{ messages: [message('working'), message('working'), message('done')] }]), 2);
  const approval = { ...message('working'), approval: { id: 'a', title: '允许操作？', summary: '' } };
  assert.equal(countActiveTasks([{ status: 'working' }, { status: 'idle', awaitingApproval: true }], [{ messages: [approval] }]), 3);
  assert.equal(countActiveTasks([{ status: 'idle' }], [{ messages: ['done', 'error', 'cancelled'].map(state => message(state as RoomMessage['state'])) }]), 0);
});

test('quiet checks stay active but do not create chat previews or unread activity', () => {
  const check = { ...message('working'), proactive: true, timestamp: 20 };
  const room = { id: 'room', kind: 'direct' as const, name: '搭档', memberKeys: ['member'], coordinator: 'member', folder: null, contextVersion: 0, readAt: 10, createdAt: 0, updatedAt: 20, messages: [{ ...message('done'), timestamp: 10 }, check] };
  assert.equal(countActiveTasks([], [room]), 1);
  assert.equal(chatActivityTime(room), 10); assert.equal(room.messages.filter(isVisibleChatMessage).length, 1);
  assert.equal(isVisibleChatMessage({ ...check, approval: { id: 'a', title: '读取后台？', summary: '访问抖音' } }), true);
  assert.equal(isVisibleChatMessage({ ...check, state: 'done' }), true);
  assert.equal(isVisibleChatMessage({ ...check, state: 'error' }), true);
});
