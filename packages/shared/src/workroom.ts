import { z } from "zod";
import { PersonaTargetSchema } from "./persona";
import { ApprovalValuesSchema, type ApprovalField } from "./approval-form";

export const MemberResourceSchema = z.object({
  id: z.string().min(1).max(120), title: z.string().trim().min(1).max(120),
  source: z.enum(["text", "file", "url"]), content: z.string().max(24000), enabled: z.boolean(),
});
export const MemberSettingsSchema = z.object({
  backend: z.string().max(80).default(""), model: z.string().max(120).default(""),
  browserOrigins: z.array(z.string().max(300).refine(value => {
    try { const url = new URL(value); return url.protocol === "https:" && url.origin === value && !url.username && !url.password; } catch { return false; }
  }, "请填写完整的 HTTPS 站点地址，不包含路径")).max(20).default([]),
  skills: z.array(MemberResourceSchema).max(40).default([]),
  knowledge: z.array(MemberResourceSchema).max(40).default([]),
  proactive: z.object({
    enabled: z.boolean().default(false), instruction: z.string().max(8000).default(""),
    cadence: z.enum(["daily", "interval"]).default("daily"),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default("09:00"),
    intervalMinutes: z.number().int().min(15).max(10080).default(1440),
    notifyOnCompletion: z.boolean().default(false),
  }).default({}),
});
export type MemberSettings = z.infer<typeof MemberSettingsSchema>;
export type MemberResource = z.infer<typeof MemberResourceSchema>;
export const RESOURCE_UPLOAD_LIMITS = { files: 500, fileBytes: 20 * 1024 * 1024, totalBytes: 25 * 1024 * 1024 } as const;
export const ResourceUploadSchema = z.object({
  op: z.literal("upload-resource"), memberKey: z.string(), category: z.enum(["skills", "knowledge"]),
  title: z.string().trim().min(1).max(120),
  files: z.array(z.object({ path: z.string().min(1).max(1024), data: z.string().max(Math.ceil(RESOURCE_UPLOAD_LIMITS.fileBytes / 3) * 4) })).min(1).max(RESOURCE_UPLOAD_LIMITS.files),
});
export type ResourceUpload = z.infer<typeof ResourceUploadSchema>;
export const MarkdownDocumentSchema = z.object({ path: z.string(), name: z.string(), content: z.string(), modifiedAt: z.number() });
export type MarkdownDocument = z.infer<typeof MarkdownDocumentSchema>;
export interface WorkroomMember { key: string; target: z.infer<typeof PersonaTargetSchema>; name: string; role: string; palette: number; backend?: string; model?: string }
export interface RoomMessage { id: string; sender: string; text: string; details?: string; timestamp: number; state: "working" | "done" | "error" | "cancelled"; proactive?: boolean; approval?: { id: string; title: string; summary: string; fields?: ApprovalField[] } }
export interface WorkroomConversation { id: string; kind: "direct" | "group"; name: string; memberKeys: string[]; coordinator: string; folder: string | null; contextVersion: number; messages: RoomMessage[]; readAt: number; createdAt: number; updatedAt: number }
export interface WorkroomSnapshot { members: WorkroomMember[]; conversations: WorkroomConversation[]; settings: Record<string, MemberSettings>; schedules: Record<string, { nextRunAt: number; lastRunAt?: number; lastError?: string }>; revision: number; settingsVersions: Record<string, string> }
export const EMPTY_WORKROOM: WorkroomSnapshot = { members: [], conversations: [], settings: {}, schedules: {}, revision: 0, settingsVersions: {} };

export const WorkroomCommand = z.object({
  type: z.literal("WORKROOM"), requestId: z.string().min(1).max(120),
  action: z.discriminatedUnion("op", [
    z.object({ op: z.literal("sync") }),
    z.object({ op: z.literal("settings"), memberKey: z.string(), settings: MemberSettingsSchema, expectedVersion: z.string() }),
    ResourceUploadSchema,
    z.object({ op: z.literal("import-resource-folder"), memberKey: z.string(), category: z.enum(["skills", "knowledge"]), path: z.string().min(1).max(4096) }),
    z.object({ op: z.literal("create"), kind: z.enum(["direct", "group"]), name: z.string().trim().max(120), memberKeys: z.array(z.string()).min(1).max(20), coordinator: z.string().optional(), folder: z.string().max(4096).nullable() }),
    z.object({ op: z.literal("update"), conversationId: z.string(), name: z.string().trim().min(1).max(120), memberKeys: z.array(z.string()).min(1).max(20), coordinator: z.string(), folder: z.string().max(4096).nullable() }),
    z.object({ op: z.literal("send"), conversationId: z.string(), text: z.string().trim().min(1).max(24000), messageId: z.string().min(1).max(120) }),
    z.object({ op: z.literal("read"), conversationId: z.string() }),
    z.object({ op: z.literal("open-file"), conversationId: z.string(), path: z.string().min(1).max(4096) }),
    z.object({ op: z.literal("preview-markdown"), conversationId: z.string(), path: z.string().min(1).max(4096) }),
    z.object({ op: z.literal("cancel"), conversationId: z.string() }),
    z.object({ op: z.literal("approval"), conversationId: z.string(), approvalId: z.string(), decision: z.enum(["yes", "no"]), values: ApprovalValuesSchema.optional() }),
  ]),
});
export type WorkroomAction = z.infer<typeof WorkroomCommand>["action"];
export const WorkroomSyncEvent = z.object({ type: z.literal("WORKROOM_SYNC"), snapshot: z.custom<WorkroomSnapshot>() });
export const WorkroomResultEvent = z.object({ type: z.literal("WORKROOM_RESULT"), requestId: z.string(), success: z.boolean(), message: z.string().optional(), conversationId: z.string().optional(), resource: MemberResourceSchema.optional(), fileCount: z.number().int().optional(), document: MarkdownDocumentSchema.optional() });
