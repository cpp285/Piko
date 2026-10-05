import { closeSync, constants, existsSync, fstatSync, openSync, readSync, realpathSync } from "node:fs";
import path from "node:path";
import { isMarkdownArtifact, type MarkdownDocument } from "@piko/shared";

const MAX_BYTES = 1024 * 1024;

/** Read a bounded text document from this conversation's existing workspace. */
export function readMarkdownPreview(workspace: string, requestedPath: string): MarkdownDocument {
  const target = path.resolve(workspace, requestedPath);
  if (!isMarkdownArtifact(target)) throw new Error("目前只能预览 Markdown 文档（.md 或 .markdown）。");
  if (!existsSync(workspace) || !existsSync(target)) throw new Error("这份文档不存在或已移动，请让成员检查文件路径。");
  const root = realpathSync(workspace), file = realpathSync(target);
  if (!file.startsWith(root + path.sep) || !isMarkdownArtifact(file)) throw new Error("只能预览本会话文件夹内的 Markdown 文档。");
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = fstatSync(fd);
    if (!info.isFile()) throw new Error("这个路径不是文档文件。");
    if (info.size > MAX_BYTES) throw new Error("这份文档超过 1 MB，请拆分成较小的文档后预览。");
    const buffer = Buffer.alloc(MAX_BYTES + 1);
    let size = 0, count = 0;
    do { count = readSync(fd, buffer, size, buffer.length - size, null); size += count; } while (count && size < buffer.length);
    if (size > MAX_BYTES) throw new Error("这份文档超过 1 MB，请拆分成较小的文档后预览。");
    let content: string;
    try { content = new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, size)); }
    catch { throw new Error("文档编码暂不支持，请保存为 UTF-8 后重试。"); }
    if (content.includes("\0")) throw new Error("这份文件不是可预览的文本，请检查文件格式。");
    return { path: file, name: path.basename(file), content, modifiedAt: info.mtimeMs };
  } finally { closeSync(fd); }
}
