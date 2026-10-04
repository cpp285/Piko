"use client";
import { tr, trNode, useLocale } from "@/lib/ui-language";


import { useState } from "react";
import { nanoid } from "nanoid";
import { getDefaultTeamMemberIds, type AgentDefinition } from "@piko/shared";
import { sendCommand } from "@/lib/connection";
import { useOfficeStore, folderPickCallbacks } from "@/store/office-store";
import { BACKEND_OPTIONS } from "./office-constants";
import { TERM_PANEL, TERM_SURFACE, TERM_DIM, TERM_TEXT_BRIGHT, TERM_BORDER, TERM_BG, TERM_GREEN, TERM_SEM_YELLOW } from "./termTheme";
import SpriteAvatar from "./SpriteAvatar";
import TermModal from "./primitives/TermModal";
import TermButton from "./primitives/TermButton";
import TermInput from "./primitives/TermInput";
import AgentIdentityModal from "./AgentIdentityModal";

function HireTeamModal({ agentDefs, onCreateTeam, onAddMembers, onClose, assetsReady, detectedBackends, projectDir }: {
  agentDefs: AgentDefinition[];
  onCreateTeam: (leadId: string, memberIds: string[], backends: Record<string, string>, workDir?: string) => void;
  onAddMembers?: (memberIds: string[], backends: Record<string, string>) => void;
  onClose: () => void;
  assetsReady?: boolean;
  detectedBackends?: string[];
  /** When set, directory is locked to project directory (project-centric mode) */
  projectDir?: string;
}) {
  const locale = useLocale();
  const [identityDef, setIdentityDef] = useState<AgentDefinition | null>(null);
  const identityButton = (def: AgentDefinition) => <button type="button" aria-label={`${def.name} ${locale === "zh" ? "身份设定" : "identity settings"}`} onClick={() => setIdentityDef(def)} style={{ padding: "4px 7px", marginTop: 5, border: `1px solid ${TERM_BORDER}`, borderRadius: 5, background: TERM_BG, color: TERM_GREEN, fontSize: 11, cursor: "pointer" }}>{locale === "zh" ? "身份设定" : "Identity settings"}</button>;
  const defaultBackend = useOfficeStore(s => s.defaultBackend);
  const agents = useOfficeStore(s => s.agents);
  const existingMembers = [...agents.values()].filter(agent => !!agent.teamId);
  const hasTeam = existingMembers.length > 0;
  const adding = hasTeam && !!onAddMembers;
  const leader = agentDefs.find((a) => a.teamRole === "leader");
  const reviewer = agentDefs.find((a) => a.teamRole === "reviewer");
  const memberAgents = agentDefs.filter((a) => a.teamRole === "dev");
  const isExisting = (def: AgentDefinition) => adding && existingMembers.some(agent => agent.name === def.name && agent.role.split(/\s*[—–]\s*/)[0] === def.role);

  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>(() => getDefaultTeamMemberIds(agentDefs).filter(id => !isExisting(agentDefs.find(def => def.id === id)!)));
  const [backends, setBackends] = useState<Record<string, string>>({});
  const [workDir, setWorkDir] = useState<string>(projectDir ?? "");
  const dirLocked = !!projectDir;
  const selectedMembers = memberAgents.filter(def => selectedMemberIds.includes(def.id) && !isExisting(def));
  const canSubmit = selectedMembers.length > 0 && (adding || (!!leader && !hasTeam));
  const memberCount = adding ? existingMembers.length + selectedMembers.length : selectedMembers.length + Number(!!leader) + Number(!!reviewer);
  const toggleMember = (id: string) => setSelectedMemberIds(previous => previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id]);

  const handleCreate = () => {
    if (!canSubmit) return;
    const memberIds = selectedMembers.map(def => def.id);
    if (adding) {
      onAddMembers!(memberIds, Object.fromEntries(memberIds.map(id => [id, backends[id] ?? defaultBackend])));
      return;
    }
    if (!leader) return;
    if (reviewer) memberIds.push(reviewer.id);
    onCreateTeam(leader.id, memberIds, Object.fromEntries([leader.id, ...memberIds].map(id => [id, backends[id] ?? defaultBackend])), workDir || undefined);
  };

  const fixedRows: { def: AgentDefinition; label: string }[] = [];
  if (leader) fixedRows.push({ def: leader, label: "LEAD" });
  if (reviewer) fixedRows.push({ def: reviewer, label: "REVIEWER" });

  return (
    <TermModal
      open={true}
      onClose={onClose}
      maxWidth={540}
      zIndex={100}
      title={tr(adding ? "Add Team Members" : "Hire Team")}
      footer={
        <>
          <TermButton variant="primary" onClick={handleCreate} disabled={!canSubmit} style={{ flex: 1, fontWeight: 700 }}>{tr(adding ? "Add Team Members" : "Create Team")}</TermButton>
          <TermButton variant="dim" onClick={onClose}>{tr("Cancel")}</TermButton>
        </>
      }
    >
      {hasTeam && !adding && <p>{tr("This office already has a team. Use it or explicitly remove it before creating another.")}</p>}
      {/* Working directory picker */}
      {!adding && <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: TERM_DIM, marginBottom: 5, fontFamily: "var(--font-mono)", letterSpacing: "0.05em" }}>
          {tr("PROJECT DIRECTORY")}{dirLocked && <span style={{ opacity: 0.5, marginLeft: 6 }}>{tr("(project)")}</span>}
        </div>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <TermInput
            type="text"
            value={workDir}
            onChange={(e) => !dirLocked && setWorkDir(e.target.value)}
            placeholder={tr("Paste path or click Browse")}
            style={{ flex: 1, minWidth: 0, opacity: dirLocked ? 0.6 : 1 }}
            readOnly={dirLocked}
          />
          {!dirLocked && (
            <TermButton
              variant="dim"
              onClick={() => {
                const rid = nanoid(6);
                folderPickCallbacks.set(rid, (p) => setWorkDir(p));
                sendCommand({ type: "PICK_FOLDER", requestId: rid });
              }}
            >{tr("Browse")}</TermButton>
          )}
        </div>
        {!dirLocked && (
          <div style={{ fontSize: 10, color: TERM_DIM, marginTop: 3, fontFamily: "var(--font-mono)", opacity: 0.7 }}>
            {tr("Empty = default workspace")}</div>
        )}
      </div>}

      <div style={{ fontSize: 12, color: TERM_DIM, marginBottom: 6, fontFamily: "var(--font-mono)", letterSpacing: "0.05em" }}>{tr("SELECT TEAM MEMBERS")}</div>
      <p style={{ color: TERM_DIM, fontSize: 12, marginBottom: 10 }}>{tr(adding ? "New members join the current team and share its project directory." : "Start with product, design and development. Select more roles as needed.")}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
        {/* Fixed rows: leader and reviewer */}
        {!adding && fixedRows.map(({ def, label }) => (
          <div
            key={def.id}
            title={tr(def.skills ? `Skills: ${def.skills}` : undefined)}
            style={{
              display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", minWidth: 0,
              border: `1px solid ${TERM_SEM_YELLOW}70`,
              backgroundColor: TERM_SURFACE,
              textAlign: "left",
            }}
          >
            <SpriteAvatar palette={def.palette} zoom={2} ready={assetsReady} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: TERM_TEXT_BRIGHT }}>
                {trNode(def.name)} <span style={{ color: TERM_SEM_YELLOW, fontSize: 11, fontFamily: "var(--font-mono)" }}>{trNode(label)}</span>
              </div>
              <div style={{ fontSize: 13, color: TERM_DIM }}>{trNode(def.role)}</div>
              {identityButton(def)}
            </div>
            <select
              aria-label={`${def.name} ${tr("AI backend")}`}
              value={backends[def.id] ?? defaultBackend}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setBackends((prev) => ({ ...prev, [def.id]: e.target.value }))}
              style={{
                width: 128, maxWidth: "40%", minWidth: 0, flexShrink: 0,
                padding: "3px 6px", border: `1px solid ${TERM_BORDER}`,
                backgroundColor: TERM_BG, color: TERM_DIM, fontSize: 12, cursor: "pointer", fontFamily: "var(--font-mono)",
              }}
            >
              {BACKEND_OPTIONS.map((b) => (
                <option key={b.id} value={b.id}>{trNode(b.name)}{trNode(detectedBackends && detectedBackends.length > 0 && !detectedBackends.includes(b.id) ? " (?)" : "")}</option>
              ))}
            </select>
          </div>
        ))}

        {/* Members can be selected together, regardless of specialty. */}
        <div style={{ fontSize: 12, color: TERM_DIM, marginTop: 4, marginBottom: 4, fontFamily: "var(--font-mono)", letterSpacing: "0.05em" }}>{tr("TEAM MEMBERS (multiple selection)")}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 135px), 1fr))", gap: 5 }}>
          {memberAgents.map((def) => {
            const existing = isExisting(def);
            const selected = existing || selectedMemberIds.includes(def.id);
            return (
              <div
                key={def.id}
                title={tr(def.skills ? `Skills: ${def.skills}` : undefined)}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center", minWidth: 0,
                  padding: "12px 6px 10px",
                  border: selected ? `1px solid ${TERM_GREEN}60` : `1px solid ${TERM_BORDER}`,
                  backgroundColor: selected ? `${TERM_GREEN}0a` : "transparent",
                  textAlign: "center",
                  opacity: 1,
                  transition: "opacity 0.15s, border-color 0.15s, background-color 0.15s",
                }}
              >
                <label style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", cursor: existing ? "default" : "pointer" }}>
                  <input type="checkbox" checked={selected} disabled={existing} onChange={() => toggleMember(def.id)} aria-label={`${def.name} · ${tr(def.role)}`} style={{ alignSelf: "flex-start", accentColor: TERM_GREEN }} />
                  <SpriteAvatar palette={def.palette} zoom={2} ready={assetsReady} />
                  <div style={{ fontSize: 14, fontWeight: 700, color: TERM_TEXT_BRIGHT, marginTop: 6, width: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{trNode(def.name)}</div>
                  <div style={{ fontSize: 12, color: TERM_DIM, marginTop: 2 }}>{trNode(def.role)}</div>
                </label>
                {existing ? <span style={{ marginTop: 6, color: TERM_DIM, fontSize: 12 }}>{tr("Already in team")}</span> :
                <select
                  aria-label={`${def.name} ${tr("AI backend")}`}
                  value={backends[def.id] ?? defaultBackend}
                  onChange={(e) => setBackends((prev) => ({ ...prev, [def.id]: e.target.value }))}
                  style={{
                    width: "100%", minWidth: 0, maxWidth: "100%", boxSizing: "border-box",
                    marginTop: 6, padding: "3px 6px", border: `1px solid ${TERM_BORDER}`,
                    backgroundColor: TERM_BG, color: TERM_DIM, fontSize: 12, cursor: "pointer", fontFamily: "var(--font-mono)",
                  }}
                >
                  {BACKEND_OPTIONS.map((b) => (
                    <option key={b.id} value={b.id}>{trNode(b.name)}{trNode(detectedBackends && detectedBackends.length > 0 && !detectedBackends.includes(b.id) ? " (?)" : "")}</option>
                  ))}
                </select>}
                {identityButton(def)}
              </div>
            );
          })}
        </div>
        <div role="status" style={{ color: TERM_DIM, fontSize: 12, marginTop: 8 }}>{tr("Team size:")} {memberCount} {tr("members")}</div>
        {selectedMembers.length === 0 && <div style={{ color: TERM_SEM_YELLOW, fontSize: 12 }}>{tr("Select at least one member.")}</div>}
      </div>
      {identityDef && <AgentIdentityModal target={{ kind: "definition", id: identityDef.id }} name={identityDef.name} onClose={() => setIdentityDef(null)} />}
    </TermModal>
  );
}

export default HireTeamModal;
