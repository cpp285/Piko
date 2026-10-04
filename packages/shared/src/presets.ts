import { DEFAULT_AGENT_DEFS } from "./agent-defs";

export interface AgentPreset {
  palette: number;
  name: string;
  role: string;
  description: string;
  personality: string;
  isLeader?: boolean;
  /** Hidden from hire list — auto-used by review system */
  isReviewer?: boolean;
}

/** Presets and saved agent definitions share names, roles and avatar slots. */
export const AGENT_PRESETS: AgentPreset[] = DEFAULT_AGENT_DEFS.map(def => ({
  palette: def.palette,
  name: def.name,
  role: def.role,
  description: def.skills,
  personality: def.personality,
  ...(def.teamRole === "leader" ? { isLeader: true } : {}),
  ...(def.teamRole === "reviewer" ? { isReviewer: true } : {}),
}));

/** Index of the default (and mandatory) team leader preset. */
export const LEADER_PRESET_INDEX = AGENT_PRESETS.findIndex(p => p.isLeader);
