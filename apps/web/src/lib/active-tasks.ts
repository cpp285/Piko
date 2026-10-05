import type { WorkroomConversation } from "@piko/shared";

/** Include personal conversations when deciding whether a desktop quit needs confirmation. */
export function countActiveTasks(
  agents: Iterable<{ status: string; awaitingApproval?: boolean }>,
  conversations: Pick<WorkroomConversation, "messages">[],
): number {
  const teamTasks = [...agents].filter(agent => agent.status === "working" || agent.status === "waiting_approval" || agent.awaitingApproval).length;
  const chatTasks = conversations.reduce((count, room) => count + room.messages.filter(message => message.state === "working").length, 0);
  return teamTasks + chatTasks;
}
