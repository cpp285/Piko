import type { AgentDefinition } from "./agent-defs";

export type TeamSpecialty = "lead" | "product" | "design" | "development" | "review" | "general";

/** Classify the job title, not keywords in the trailing skills description. */
export function getTeamSpecialty(role: string): TeamSpecialty {
  const title = role.split(/\s*[—–]\s*/)[0];
  if (/review|审查|审阅/i.test(title)) return "review";
  if (/team lead|负责人/i.test(title)) return "lead";
  if (/product manager|产品经理|产品策划/i.test(title)) return "product";
  if (/design|设计/i.test(title)) return "design";
  if (/developer|engineer|architect|prototyper|coder|开发|工程师|架构/i.test(title)) return "development";
  return "general";
}

/** Leader and reviewer are fixed separately; start with product, design and development. */
export function getDefaultTeamMemberIds(definitions: AgentDefinition[]): string[] {
  const workers = definitions.filter(def => def.teamRole === "dev");
  const selected = (["product", "design", "development"] as const)
    .map(specialty => workers.find(def => getTeamSpecialty(def.role) === specialty)?.id)
    .filter((id): id is string => !!id);
  return selected.length ? selected : workers.slice(0, 1).map(def => def.id);
}
