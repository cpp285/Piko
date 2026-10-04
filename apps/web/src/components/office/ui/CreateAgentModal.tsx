"use client";
import { useState, useEffect, useMemo } from "react";
import { nanoid } from "nanoid";
import ReactMarkdown from "react-markdown";
import { RefreshCw, FilePenLine, Check } from "lucide-react";
import { CHARACTER_APPEARANCES, createDefaultPersona, PERSONA_MAX_LENGTH, normalizeSkillName, type AgentDefinition, type PersonaDocuments } from "@piko/shared";
import { tr, trNode, useLocale } from "@/lib/ui-language";
import { useOfficeStore } from "@/store/office-store";
import { saveAgentDefinition } from "@/lib/agent-definition-client";
import { ROLE_CATALOG, ROLE_DESC_MAP, PERSONALITY_PRESETS } from "./office-constants";
import { TERM_BORDER, TERM_DIM } from "./termTheme";
import SpriteAvatar from "./SpriteAvatar";
import TermModal from "./primitives/TermModal";
import TermButton from "./primitives/TermButton";
import TermInput from "./primitives/TermInput";
import AgentIdentityModal from "./AgentIdentityModal";
import styles from "./CreateAgentModal.module.css";
const TERM_YELLOW = "#987044";
/** Inline modal for creating a new skill file */
function CreateSkillInline({ onSave, onCancel }: {
  onSave: (name: string, content: string) => void;
  onCancel: () => void;
}) {
  useLocale();
  const [skillName, setSkillName] = useState("");
  const [skillContent, setSkillContent] = useState("");

  const handleSave = () => {
    const name = normalizeSkillName(skillName);
    if (!name || !skillContent.trim()) return;
    onSave(name, skillContent);
  };

  return (
    <div style={{
      border: `1px solid ${TERM_YELLOW}40`,
      backgroundColor: `${TERM_YELLOW}08`,
      padding: 10,
      marginTop: 6,
    }}>
      <div style={{ fontSize: 11, color: TERM_YELLOW, marginBottom: 6, fontFamily: "var(--font-mono)", letterSpacing: "0.05em" }}>
        {tr("NEW SKILL FILE")}</div>
      <TermInput
        value={skillName}
        onChange={(e) => setSkillName(e.target.value)}
        placeholder={tr("Skill name (e.g. tdd, react-patterns)")}
        style={{ marginBottom: 6 }}
      />
      <textarea
        className="ti ti-textarea"
        value={skillContent}
        onChange={(e) => setSkillContent(e.target.value)}
        placeholder={tr("# Skill Title\n\nPaste or type skill content in Markdown...")}
        rows={5}
        style={{ resize: "vertical", marginBottom: 6, width: "100%", boxSizing: "border-box" }}
      />
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <TermButton variant="dim" onClick={onCancel} style={{ padding: "4px 10px", fontSize: 12 }}>
          {tr("Cancel")}</TermButton>
        <TermButton
          variant="primary"
          onClick={handleSave}
          disabled={!skillName.trim() || !skillContent.trim()}
          style={{ padding: "4px 10px", fontSize: 12 }}
        >
          {tr("Save Skill")}</TermButton>
      </div>
    </div>
  );
}


function CreateAgentModal({ onSave, onClose, assetsReady, editAgent, sendCommand }: {
  onSave: (agent: AgentDefinition) => void; onClose: () => void; assetsReady?: boolean;
  editAgent?: AgentDefinition | null; sendCommand?: (cmd: any) => void;
}) {
  const language = useLocale(); const t = (zh: string, en: string) => language === "zh" ? zh : en;
  const connected = useOfficeStore(s => s.connected);
  const availableSkills = useOfficeStore(s => s.availableSkills);
  const [id] = useState(() => editAgent?.id || `person-${nanoid(12)}`);
  const [name, setName] = useState(editAgent?.name || "");
  const [role, setRole] = useState(editAgent ? tr(editAgent.role) : "");
  const [responsibilities, setResponsibilities] = useState(editAgent?.skills || "");
  const [palette, setPalette] = useState(() => editAgent?.palette ?? 8);
  const [personality, setPersonality] = useState(editAgent?.personality || PERSONALITY_PRESETS[0].value);
  const [selectedSkillFiles, setSelectedSkillFiles] = useState(new Set(editAgent?.skillFiles || []));
  const [showCreateSkill, setShowCreateSkill] = useState(false);
  const [identityOpen, setIdentityOpen] = useState(false);
  const [draftDocs, setDraftDocs] = useState<PersonaDocuments | null>(null);
  const [editing, setEditing] = useState({ identity: false, soul: false });
  const [resetDocs, setResetDocs] = useState(false);
  const [dirty, setDirty] = useState(false); const [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const choices = useMemo(() => [{ name: "文章编辑", desc: "选题、写稿、事实核查与编辑润色" }, { name: "营销运营", desc: "内容规划、渠道运营与效果复盘" }, { name: "研究助理", desc: "资料收集、来源核查与研究摘要" }, ...ROLE_CATALOG.flatMap(c => c.agents)], []);
  // Use the canonical preset for unchanged existing roles; free text is always accepted.
  const canonicalRole = choices.find(item => tr(item.name) === role.trim() || item.name === role.trim())?.name || role.trim();
  const generated = useMemo(() => createDefaultPersona({ name: name.trim() || role.trim().slice(0,80), role: canonicalRole, skills: responsibilities, personality }), [name, role, canonicalRole, responsibilities, personality]);
  const docs = draftDocs || generated;
  const touch = () => { setDirty(true); setError(""); };
  useEffect(() => { sendCommand?.({ type: "LIST_SKILLS" }); }, [sendCommand]);
  const close = () => { if (busy) return; if (dirty) setClosing(true); else onClose(); };
  const regenerate = () => { if (draftDocs) setResetDocs(true); else { setDraftDocs(null); setEditing({ identity: false, soul: false }); } };
  const save = async () => {
    if (!canonicalRole) { setError(t("请填写岗位名称，例如文章编辑。", "Enter a role, such as article editor.")); return; }
    if (!connected) { setError(t("连接已断开，恢复后可以保存。", "Reconnect before saving.")); return; }
    const def: AgentDefinition = { id, name: name.trim() || role.trim().slice(0,80), role: canonicalRole, skills: responsibilities.trim(), personality, palette, isBuiltin: editAgent?.isBuiltin || false, teamRole: editAgent?.teamRole || "dev", skillFiles: [...selectedSkillFiles] };
    setBusy(true); setError("");
    try { await saveAgentDefinition(def, editAgent ? undefined : docs); onSave(def); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const toggleSkill = (skill: string) => { touch(); setSelectedSkillFiles(prev => { const next = new Set(prev); if(next.has(skill)) next.delete(skill); else next.add(skill); return next; }); };
  return <TermModal open onClose={close} maxWidth={840} zIndex={140} title={t(editAgent ? "编辑人物" : "新建人物", editAgent ? "Edit person" : "New person")} className={styles.modal} footer={<div className={styles.footer}>
    <span role="status">{closing ? t("还有未保存的内容", "Unsaved changes") : t("创建后也能随时修改", "You can edit this later")}</span>
    <div>{closing ? <><button onClick={() => setClosing(false)}>{t("继续编辑", "Keep editing")}</button><button onClick={onClose}>{t("放弃并关闭", "Discard and close")}</button></> : <><button onClick={close} disabled={busy}>{t("取消", "Cancel")}</button><button className={styles.primary} onClick={() => void save()} disabled={busy || !canonicalRole || !connected}>{busy ? t("保存中…", "Saving…") : t(editAgent ? "保存人物" : "创建人物", editAgent ? "Save person" : "Create person")}</button></>}</div>
  </div>}>
    <p className={styles.intro}>{t("写下岗位和职责，为自己添加一位新搭档。", "Describe a role and add a new teammate.")}</p>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {!connected && <p className={styles.error}>{t("连接已断开，填写的内容会保留。", "Disconnected. Your draft is kept.")}</p>}
    <div className={styles.setup}>
      <section className={styles.appearance} aria-label={t("成员形象", "Appearance")}>
        <div className={styles.portrait}><SpriteAvatar palette={palette} zoom={4} ready={assetsReady} /></div>
        <strong>{name.trim() || role.trim() || t("你的新搭档", "Your new teammate")}</strong>
        <p>{CHARACTER_APPEARANCES[palette]?.name || t("成员形象", "Appearance")}</p>
        <small>{t("14 个形象，点击即可选用", "14 ready-to-use appearances")}</small>
        {[{label:t("新增形象", "New appearances"),start:8,end:14},{label:t("原有形象", "Original appearances"),start:0,end:8}].map(group=><div key={group.start} className={styles.appearanceGroup}><span>{group.label}</span><div className={styles.avatarChoices} data-new={group.start===8} aria-label={group.label}>{CHARACTER_APPEARANCES.slice(group.start,group.end).map((look,index)=>{const p=group.start+index;return <button key={look.id} title={look.name} aria-label={`${t("形象", "Appearance")}：${look.name}`} aria-pressed={palette===p} onClick={()=>{setPalette(p);touch();}}><SpriteAvatar palette={p} zoom={1.6} ready={assetsReady}/></button>;})}</div></div>)}
      </section>
      <section className={styles.brief}>
        <label className={styles.field}>{t("称呼（可选）", "Name (optional)")}<input value={name} maxLength={80} onChange={e=>{setName(e.target.value);touch();}} placeholder={t("例如：小林；留空则使用岗位名称", "Leave blank to use the role name")} /></label>
        <label className={styles.field}>{t("岗位名称", "Role")}<input value={role} maxLength={120} onChange={e=>{setRole(e.target.value);touch();}} placeholder={t("直接填写，例如：文章编辑", "Type any role, e.g. article editor")} /></label>
        <label className={styles.presetLabel}>{t("或从常用岗位开始", "Or start from a preset")}<select aria-label={t("常用岗位", "Role presets")} value="" onChange={e=>{const choice=choices.find(c=>c.name===e.target.value);if(!choice)return;setRole(tr(choice.name));if(!responsibilities.trim() || [...ROLE_DESC_MAP.values(), ...choices.map(c=>tr(c.desc))].includes(responsibilities))setResponsibilities(tr(choice.desc));touch();}}><option value="">{t("选择常用岗位…", "Choose a role…")}</option>{choices.map(c=><option value={c.name} key={c.name}>{tr(c.name)}</option>)}</select></label>
        <label className={styles.field}>{t("主要职责", "Responsibilities")}<textarea rows={4} value={responsibilities} maxLength={4000} onChange={e=>{setResponsibilities(e.target.value);touch();}} placeholder={t("例如：帮我编辑公众号文章，保留作者语气，核对数据来源，给出标题和修改理由。", "Describe what this person should do and deliver.")} /></label>
        <label className={styles.field}>{t("沟通习惯", "Communication style")}<select value={PERSONALITY_PRESETS.some(p=>p.value===personality)?personality:"custom"} onChange={e=>{setPersonality(e.target.value==='custom'?'':e.target.value);touch();}}>{PERSONALITY_PRESETS.map(p=><option key={p.value} value={p.value}>{tr(p.label)}</option>)}<option value="custom">{t("自己填写", "Custom")}</option></select>{!PERSONALITY_PRESETS.some(p=>p.value===personality)&&<textarea rows={2} value={personality} maxLength={8000} onChange={e=>{setPersonality(e.target.value);touch();}} placeholder={t("例如：先给修改后的稿件，再说明关键改动。", "Describe how this person should communicate.")} />}</label>
      </section>
    </div>
    {editAgent ? <section className={styles.documents}><h3>{t("身份与做事方式", "Identity and working style")}</h3><p>{t("已有文档会保留。调整岗位后，可以在这里同步修改。", "Existing documents are preserved. Update them here when changing roles.")}</p><button onClick={()=>setIdentityOpen(true)}><FilePenLine size={16}/>{t("查看与编辑 IDENTITY / SOUL", "View and edit IDENTITY / SOUL")}</button></section> : <section className={styles.documents}>
      <div className={styles.documentHeading}><div><h3>{t("身份与做事方式", "Identity and working style")}</h3><p>{t("根据岗位与职责即时生成，内容可以直接修改。", "Generated from this role and its responsibilities. Edit either document.")}</p></div>{draftDocs&&<button onClick={regenerate}><RefreshCw size={14}/>{t("按当前职责重新生成", "Regenerate from brief")}</button>}</div>
      {!canonicalRole ? <div className={styles.empty}>{t("填写岗位名称后，这里会出现两份文档初稿。", "Enter a role to preview both documents.")}</div> : <>
        {draftDocs&&<p className={styles.hint}>{t("当前保留你手动修改的文档；调整岗位或职责后，可选择重新生成。", "Your document edits are kept. Regenerate if you want to use the updated brief.")}</p>}
        {resetDocs&&<div className={styles.reset}><span>{t("重新生成会替换这里手动修改的初稿。", "Regenerating replaces your document edits.")}</span><button onClick={()=>setResetDocs(false)}>{t("保留修改", "Keep edits")}</button><button onClick={()=>{setDraftDocs(null);setEditing({identity:false,soul:false});setResetDocs(false);touch();}}>{t("替换为新初稿", "Replace draft")}</button></div>}
        {(['identity','soul'] as const).map(field=><section key={field} className={styles.documentCard}><header><div><strong>{field==='identity'?t("我是谁", "Who I am"):t("我怎么做事", "How I work")}</strong><code>agent/{field.toUpperCase()}.md</code></div><button onClick={()=>setEditing(e=>({...e,[field]:!e[field]}))}>{editing[field]?<Check size={14}/>:<FilePenLine size={14}/>} {editing[field]?t("预览", "Preview"):t("查看与编辑", "View and edit")}</button></header>{editing[field]?<textarea aria-label={`agent/${field.toUpperCase()}.md`} rows={12} maxLength={PERSONA_MAX_LENGTH} value={docs[field]} onChange={e=>{setDraftDocs({...docs,[field]:e.target.value});touch();}}/>:<div className={styles.markdown}><ReactMarkdown>{docs[field]}</ReactMarkdown></div>}</section>)}
      </>}
    </section>}
    <details className={styles.skills}><summary>{t("技能文件（可选）", "Skill files (optional)")}{selectedSkillFiles.size>0&&` · ${selectedSkillFiles.size}`}</summary><p>{t("也可以先创建人物，再到成员设置中添加技能和知识资料。", "You can add skills and knowledge after creating this person.")}</p>{availableSkills.map(skill=><label key={skill.name}><input type="checkbox" checked={selectedSkillFiles.has(skill.name)} onChange={()=>toggleSkill(skill.name)}/>{skill.title}</label>)}{[...selectedSkillFiles].filter(n=>!availableSkills.some(s=>s.name===n)).map(n=><label key={n}><input type="checkbox" checked onChange={()=>toggleSkill(n)}/>{n}</label>)}{showCreateSkill?<CreateSkillInline onSave={(skill,content)=>{sendCommand?.({type:'SAVE_SKILL',name:skill,content});setSelectedSkillFiles(prev=>new Set(prev).add(skill));setShowCreateSkill(false);touch();}} onCancel={()=>setShowCreateSkill(false)}/>:<button onClick={()=>setShowCreateSkill(true)}>{t("新建技能文件", "New skill file")}</button>}</details>
    {identityOpen&&editAgent&&<AgentIdentityModal target={{kind:'definition',id:editAgent.id}} name={editAgent.name} onClose={()=>setIdentityOpen(false)}/>}
  </TermModal>;
}
export default CreateAgentModal;
