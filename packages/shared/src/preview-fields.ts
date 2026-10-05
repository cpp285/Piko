/** Model-generated explanations such as “无需命令” are not executable commands. */
export function normalizePreviewCommand(value?: string): string | undefined {
  const command = value?.replace(/\*\*/g, "").replace(/`/g, "").replace(/^_+|_+$/g, "").trim();
  if (!command || /^[\[(].*[\])]$/.test(command)
    || /^(?:none|null|n\/?a|not (?:required|needed|applicable|provided))(?:\b|$)/i.test(command)
    || /^(?:无[需须]|不需要|不适用|直接打开|直接用浏览器|无$)/.test(command)) return undefined;
  return command;
}

/** Recognize local artifact links without treating website-relative links as local files. */
export function localArtifactPath(href?: string): string | undefined {
  if (!href) return undefined;
  let value: string;
  try { value = decodeURIComponent(href); } catch { return undefined; }
  if (value.startsWith("file:///")) value = value.slice(7);
  return /^(?:\/(?:Users|home|tmp|var|private|Volumes)\/|[A-Za-z]:[\\/])/.test(value) ? value : undefined;
}

/** Local chat deliverables may use relative paths in the conversation folder. */
export function workroomArtifactPath(href?: string): string | undefined {
  if (!href || href.startsWith("#") || href.startsWith("//")) return undefined;
  let value: string;
  try { value = decodeURIComponent(href.split("#")[0]); } catch { return undefined; }
  if (value.startsWith("file:///")) value = value.slice(7);
  else if (/^[a-z][a-z\d+.-]*:/i.test(value) && !/^[A-Za-z]:[\\/]/.test(value)) return undefined;
  value = value.replace(/:\d+(?::\d+)?$/, "");
  return /\.(?:md|markdown|txt|html?|pdf|csv|docx|xlsx|pptx|png|jpe?g|gif|webp|svg)$/i.test(value) ? value : undefined;
}

export function isMarkdownArtifact(filePath: string): boolean {
  return /\.(?:md|markdown)$/i.test(filePath);
}
