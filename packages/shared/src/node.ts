/** Node-only runtime paths. Keep this entry separate from the browser exports. */
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

type Environment = Record<string, string | undefined>;

/** New names take precedence; old launch scripts remain usable during upgrades. */
export function readRuntimeEnv(name: string, env: Environment = process.env): string | undefined {
  return env[`PIKO_${name}`] ?? env[`CREWLOOM_${name}`] ?? env[`OPEN_OFFICE_${name}`] ?? env[`BIT_OFFICE_${name}`];
}

/** Keep existing data/worktree paths intact, including Git's absolute references. */
export function resolveHomeDataDir(home = homedir(), development = process.env.NODE_ENV === "development"): string {
  const suffix = development ? "-dev" : "";
  const current = resolve(home, `.piko${suffix}`);
  const candidates = [current, resolve(home, `.crewloom${suffix}`), resolve(home, `.open-office${suffix}`)];
  return candidates.find(candidate => existsSync(candidate)) ?? current;
}

export function resolveConfigDir(env: Environment = process.env, home = homedir()): string {
  return resolve(readRuntimeEnv("CONFIG_DIR", env) || resolveHomeDataDir(home, env.NODE_ENV === "development"));
}
