import type { RoomMessage, WorkroomConversation } from '@piko/shared';

/** Background check progress is not a new private message. Approval requests still surface. */
export const isVisibleChatMessage = (message: RoomMessage) => !message.proactive || message.state !== 'working' || !!message.approval;
export const chatActivityTime = (room: WorkroomConversation) => room.messages.filter(isVisibleChatMessage).at(-1)?.timestamp ?? room.createdAt;
