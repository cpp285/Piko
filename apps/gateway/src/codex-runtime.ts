import { readRuntimeEnv } from "@piko/shared/node";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";

interface CodexRuntime { command: string; version: string }
type VersionProbe = (command: string) => string | undefined;

function readVersion(command: string): string | undefined {
  try {
    const output = execFileSync(command, ["--version"], {
      encoding: "utf8", timeout: 3000, stdio: ["ignore", "pipe", "pipe"],
    });
    return /^codex-cli\s+(\d+\.\d+\.\d+(?:-[\w.-]+)?)/m.exec(output)?.[1];
  } catch { return undefined; }
}

function newer(left: string, right: string): boolean {
  const a = left.split(/[.-]/), b = right.split(/[.-]/);
  for (let i = 0; i < 3; i++) {
    if (Number(a[i]) !== Number(b[i])) return Number(a[i]) > Number(b[i]);
  }
  // Prefer a stable release when the numeric versions match; otherwise keep discovery order.
  return a.length === 3 && b.length > 3;
}

export function selectCodexRuntime(candidates: string[], override?: string, probe: VersionProbe = readVersion): CodexRuntime | undefined {
  if (override) {
    if (!path.isAbsolute(override)) throw new Error("PIKO_CODEX_PATH 必须是 Codex 可执行文件的绝对路径");
    const version = probe(override);
    if (!version) throw new Error("PIKO_CODEX_PATH 指向的 Codex 无法运行，请检查文件路径");
    return { command: override, version };
  }
  let best: CodexRuntime | undefined;
  for (const command of new Set(candidates)) {
    const version = probe(command);
    if (version && (!best || newer(version, best.version))) best = { command, version };
  }
  return best;
}

/** Use the newest installed macOS CLI without changing global symlinks or login files. */
export function resolveCodexRuntime(): CodexRuntime | undefined {
  const override = readRuntimeEnv("CODEX_PATH")?.trim();
  if (override) return selectCodexRuntime([], override);
  // Keep the existing PATH resolution on other platforms (including Windows npm shims).
  if (process.platform !== "darwin") return undefined;
  const candidates: string[] = [];
  try {
    candidates.push(execFileSync("which", ["codex"], { encoding: "utf8", timeout: 3000 }).trim());
  } catch { /* Desktop app may be installed without a PATH entry. */ }
  for (const apps of ["/Applications", path.join(homedir(), "Applications")]) {
    candidates.push(
      path.join(apps, "ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex"),
      path.join(apps, "Codex.app/Contents/Resources/codex"),
    );
  }
  return selectCodexRuntime(candidates.filter(Boolean));
}
