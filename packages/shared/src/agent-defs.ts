export interface AgentDefinition {
  id: string;             // Unique identifier (e.g. "alex", "my-python-bot")
  name: string;           // Display name (e.g. "Alex", "小明")
  role: string;           // Short role title — used for --agent resolution against bundled agents
  skills: string;         // Specialty description (e.g. "React/Next.js/CSS")
  personality: string;    // Personality text, injected into prompt
  palette: number;        // Stable appearance slot in CHARACTER_APPEARANCES
  isBuiltin: boolean;     // true = shipped with app, editable but not deletable
  teamRole: "dev" | "reviewer" | "leader";  // "dev" is the legacy worker slot, including product/design specialists
  skillFiles?: string[];  // Skill file names in ~/.piko/skills/ (e.g. ["tdd", "react-patterns"])
}

/** Keep user edits to builtins while preserving their stable identity and system role. */
export function mergeAgentDefinitions(saved: AgentDefinition[]): AgentDefinition[] {
  const builtinIds = new Set(DEFAULT_AGENT_DEFS.map(def => def.id));
  return [
    ...DEFAULT_AGENT_DEFS.map(def => ({ ...def, ...saved.find(item => item.id === def.id), isBuiltin: true, teamRole: def.teamRole })),
    ...saved.filter(def => !builtinIds.has(def.id) && !def.isBuiltin),
  ];
}

/** Metadata for a skill stored in ~/.piko[-dev]/skills/ */
export interface SkillMeta {
  name: string;           // Directory or file name (without .md extension)
  title: string;          // Display title (first heading or name)
  isFolder: boolean;      // true = folder with skill.md, false = single .md file
}

export const DEFAULT_AGENT_DEFS: AgentDefinition[] = [
  // ── Hire list (6 presets) ──
  { id: "rex",    name: "张伟",    role: "Senior Developer",    skills: "General-purpose dev, any language/framework",               personality: "", palette: 3, isBuiltin: true, teamRole: "dev" },
  { id: "alex",   name: "林悦",   role: "Frontend Developer",  skills: "UI, React/Vue/Next.js, CSS, accessibility",                personality: "", palette: 0, isBuiltin: true, teamRole: "dev" },
  { id: "mia",    name: "周宁",    role: "Backend Architect",   skills: "APIs, databases, system design, cloud",                    personality: "", palette: 1, isBuiltin: true, teamRole: "dev" },
  { id: "leo",    name: "赵凯",    role: "Rapid Prototyper",    skills: "MVP, proof-of-concept, fast iteration",                    personality: "", palette: 2, isBuiltin: true, teamRole: "dev" },
  { id: "nova",   name: "许琳",   role: "UI Designer",         skills: "Design systems, spacing, color, accessibility",            personality: "", palette: 4, isBuiltin: true, teamRole: "dev" },
  { id: "luna",   name: "王欣",   role: "Product Manager",     skills: "PRD, prioritization, user stories, outcomes",              personality: "", palette: 6, isBuiltin: true, teamRole: "dev" },
  // ── Hidden (auto-assigned, not in hire list) ──
  { id: "marcus", name: "陈峰", role: "Team Lead",           skills: "Creative direction, planning, delegation",                 personality: "", palette: 5, isBuiltin: true, teamRole: "leader" },
  { id: "sophie", name: "李敏", role: "Code Reviewer",       skills: "Code review, bugs, security, quality",                    personality: "", palette: 7, isBuiltin: true, teamRole: "reviewer" },
];
