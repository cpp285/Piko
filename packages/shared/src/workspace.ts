import { z } from "zod";

export const WorkspaceTaskSchema = z.object({
  taskId: z.string(),
  agentId: z.string(),
  agentName: z.string(),
  role: z.string(),
  teamId: z.string().optional(),
  projectDir: z.string().optional(),
  fromAgentId: z.string().optional(),
  prompt: z.string(),
  status: z.enum(["queued", "working", "waiting_approval", "done", "failed", "cancelled", "interrupted"]),
  createdAt: z.number(),
  updatedAt: z.number(),
  startedAt: z.number().optional(),
  endedAt: z.number().optional(),
  summary: z.string().optional(),
  changedFiles: z.array(z.string()).default([]),
  testResult: z.enum(["passed", "failed", "unknown"]).optional(),
  tokenUsage: z.object({ inputTokens: z.number(), outputTokens: z.number() }).optional(),
});

export const WorkspaceHighlightSchema = z.object({
  id: z.string(),
  kind: z.enum(["delegation", "approval", "completion", "failure", "phase"]),
  agentId: z.string(),
  agentName: z.string(),
  taskId: z.string().optional(),
  projectDir: z.string().optional(),
  title: z.string(),
  detail: z.string(),
  timestamp: z.number(),
});

export const WorkspaceLinkSchema = z.object({
  fromAgentId: z.string(),
  toAgentId: z.string(),
  fromName: z.string(),
  toName: z.string(),
  projectDir: z.string().optional(),
  delegated: z.number(),
  returned: z.number(),
  failed: z.number(),
  updatedAt: z.number(),
});

export const WorkspaceSnapshotSchema = z.object({
  revision: z.number(),
  tasks: z.array(WorkspaceTaskSchema),
  highlights: z.array(WorkspaceHighlightSchema),
  links: z.array(WorkspaceLinkSchema),
});

export type WorkspaceTask = z.infer<typeof WorkspaceTaskSchema>;
export type WorkspaceHighlight = z.infer<typeof WorkspaceHighlightSchema>;
export type WorkspaceLink = z.infer<typeof WorkspaceLinkSchema>;
export type WorkspaceSnapshot = z.infer<typeof WorkspaceSnapshotSchema>;
