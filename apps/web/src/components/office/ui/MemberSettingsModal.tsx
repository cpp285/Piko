"use client";
import { useState } from "react";
import { BookOpen, Bell, Fingerprint, Puzzle, Plus, Trash2 } from "lucide-react";
import { nanoid } from "nanoid";
import { MemberSettingsSchema, type MemberResource, type WorkroomMember } from "@piko/shared";
import { useOfficeStore } from "@/store/office-store";
import { workroomRequest } from "@/lib/workroom-client";
import AgentIdentityModal from "./AgentIdentityModal";
import TermModal from "./primitives/TermModal";
import styles from "./PersonalWorkspace.module.css";

export default function MemberSettingsModal({ member, onClose }: { member: WorkroomMember; onClose: () => void }) {
  const snapshot = useOfficeStore(s => s.workroom);
  const connected = useOfficeStore(s => s.connected);
  const backends = useOfficeStore(s => s.detectedBackends);
  const [draft, setDraft] = useState(() => structuredClone(snapshot.settings[member.key] ?? MemberSettingsSchema.parse({})));
  const [version, setVersion] = useState(snapshot.settingsVersions[member.key]);
  const [tab, setTab] = useState("identity");
  const [identity, setIdentity] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [saved, setSaved] = useState(false);
  const [original, setOriginal] = useState(JSON.stringify(draft)); const [closing, setClosing] = useState(false);
  const dirty = JSON.stringify(draft) !== original;
  const change = (next: typeof draft) => { setDraft(next); setSaved(false); };
  const close = () => { if (busy) return; if (dirty) setClosing(true); else onClose(); };
  const save = async () => {
    const checked = MemberSettingsSchema.safeParse(draft);
    if (!checked.success) {
      const field = checked.error.issues[0]?.path.at(-1);
      setError(field === "title" ? "请为每一项技能和资料填写名称。" : field === "intervalMinutes" ? "联系间隔需要是 15 到 10080 之间的整数分钟。" : field === "time" ? "请填写有效的联系时间。" : "请检查填写的内容，每类最多 40 项，每项内容最多 24000 字。");
      return;
    }
    setBusy(true); setError("");
    try { await workroomRequest({ op: "settings", memberKey: member.key, settings: draft, expectedVersion: version }); setVersion(useOfficeStore.getState().workroom.settingsVersions[member.key]); setOriginal(JSON.stringify(draft)); setSaved(true); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const resourceTab = tab === "skills" || tab === "knowledge" ? tab : null;
  const resources = resourceTab ? draft[resourceTab] : [];
  const editResource = (id: string, update: Partial<MemberResource>) => resourceTab && change({ ...draft, [resourceTab]: resources.map(r => r.id === id ? { ...r, ...update } : r) });
  return <TermModal open onClose={close} title={`${member.name} · 成员设置`} maxWidth={960} zIndex={130} className={styles.modal} footer={<div className={styles.modalFooter}>
    <span role="status">{closing ? "还有未保存的设置" : saved ? "已保存，下次执行时使用新设置" : "每位成员独立配置"}</span>
    <div>{closing ? <><button onClick={() => setClosing(false)}>继续编辑</button><button onClick={onClose}>放弃并关闭</button></> : <><button onClick={close} disabled={busy}>关闭</button><button className={styles.primary} onClick={() => void save()} disabled={!dirty || busy || !connected}>{busy ? "保存中…" : "保存设置"}</button></>}</div>
  </div>}>
    <div className={styles.settingsLayout}>
      <nav className={styles.settingsNav} aria-label="成员设置分类">{[{ id: "identity", label: "身份设定", icon: Fingerprint }, { id: "skills", label: "技能", icon: Puzzle }, { id: "knowledge", label: "知识库", icon: BookOpen }, { id: "proactive", label: "主动联系", icon: Bell }].map(item => <button key={item.id} aria-current={tab === item.id ? "page" : undefined} onClick={() => setTab(item.id)}><item.icon size={19} />{item.label}{item.id === "skills" && <small>{draft.skills.length}</small>}{item.id === "knowledge" && <small>{draft.knowledge.length}</small>}</button>)}</nav>
      <div className={styles.settingsContent}>
        {error && <p className={styles.error} role="alert">{error}</p>}
        {!connected && <p className={styles.error}>连接已断开，恢复后可以保存。草稿仍在。</p>}
        {tab === "identity" && <><h3>我是谁，我怎么做事</h3><p>为这位成员设置职责、工作方式与沟通习惯。</p><button onClick={() => setIdentity(true)}>查看与编辑 IDENTITY / SOUL</button><h3>执行引擎与模型</h3><label className={styles.field}>Agent<select value={draft.backend} onChange={e => change({ ...draft, backend: e.target.value, model: "" })}><option value="">沿用当前设置</option>{[...new Set([...backends, member.backend, draft.backend].filter((x): x is string => !!x))].map(id => <option key={id} value={id}>{id}</option>)}</select></label><label className={styles.field}>模型<input value={draft.model} onChange={e => change({ ...draft, model: e.target.value })} placeholder="留空使用此引擎的默认模型" /></label></>}
        {resourceTab && <><div className={styles.sectionHeading}><div><h3>{tab === "skills" ? "技能" : "知识库"}</h3><p>{tab === "skills" ? "添加这位成员的做事方法，例如社媒采集或营销分析。" : "添加这位成员需要参考的资料，例如品牌介绍、营销手册或项目文档。"}</p></div><button onClick={() => change({ ...draft, [resourceTab]: [...resources, { id: nanoid(), title: "", source: "text", content: "", enabled: true }] })}><Plus size={16} />添加{tab === "skills" ? "技能" : "资料"}</button></div>
          {!resources.length && <div className={styles.resourceEmpty}>{tab === "skills" ? <Puzzle size={28} /> : <BookOpen size={28} />}<strong>还没有配置{tab === "skills" ? "技能" : "资料"}</strong><p>入口已经准备好，你可以之后再添加。</p></div>}
          {resources.map((resource, index) => <section className={styles.resourceCard} key={resource.id}><div className={styles.sectionHeading}><strong>{tab === "skills" ? "技能" : "资料"} {index + 1}</strong><div><label><input type="checkbox" checked={resource.enabled} onChange={e => editResource(resource.id, { enabled: e.target.checked })} />启用</label><button aria-label={`移除${resource.title || index + 1}`} onClick={() => change({ ...draft, [resourceTab]: resources.filter(r => r.id !== resource.id) })}><Trash2 size={15} /></button></div></div>
            <label className={styles.field}>名称<input value={resource.title} maxLength={120} placeholder={tab === "skills" ? "例如：社媒内容分析" : "例如：品牌营销手册"} onChange={e => editResource(resource.id, { title: e.target.value })} /></label>
            <label className={styles.field}>来源<select value={resource.source} onChange={e => editResource(resource.id, { source: e.target.value as MemberResource["source"] })}><option value="text">直接填写内容</option><option value="file">本地文件或文件夹</option><option value="url">网页链接</option></select></label>
            <label className={styles.field}>{resource.source === "text" ? "内容" : resource.source === "file" ? "完整路径" : "链接"}<textarea rows={resource.source === "text" ? 6 : 2} value={resource.content} maxLength={24000} onChange={e => editResource(resource.id, { content: e.target.value })} placeholder={resource.source === "file" ? "/Users/你的名字/Documents/资料" : resource.source === "url" ? "https://…" : "可以粘贴 Markdown 内容"} /></label>
          </section>)}<p className={styles.help}>保存后，启用的内容会提供给这位成员。链接及较大的文件按任务需要读取；添加技能不会自动安装它依赖的软件或连接账号。</p>
        </>}
        {tab === "proactive" && <><h3>让成员主动来找你</h3><p>按你设置的要求发起工作，结果会出现在与这位成员的私聊中。</p><label className={styles.switchRow}><input type="checkbox" checked={draft.proactive.enabled} onChange={e => change({ ...draft, proactive: { ...draft.proactive, enabled: e.target.checked } })} />定时主动联系</label><label className={styles.field}>工作要求<textarea rows={5} value={draft.proactive.instruction} maxLength={8000} placeholder="例如：查看我参与项目的实际进展，汇报完成、阻塞和今天需要我决定的事。没有新进展时简短说明。" onChange={e => change({ ...draft, proactive: { ...draft.proactive, instruction: e.target.value } })} /></label>
          <label className={styles.field}>频率<select value={draft.proactive.cadence} onChange={e => change({ ...draft, proactive: { ...draft.proactive, cadence: e.target.value as "daily" | "interval" } })}><option value="daily">每天固定时间</option><option value="interval">每隔一段时间</option></select></label>
          {draft.proactive.cadence === "daily" ? <label className={styles.field}>联系时间（本机时区）<input type="time" value={draft.proactive.time} onChange={e => change({ ...draft, proactive: { ...draft.proactive, time: e.target.value } })} /></label> : <label className={styles.field}>间隔分钟<input type="number" min={15} max={10080} value={draft.proactive.intervalMinutes} onChange={e => change({ ...draft, proactive: { ...draft.proactive, intervalMinutes: Number(e.target.value) } })} /></label>}
          <label className={styles.switchRow}><input type="checkbox" checked={draft.proactive.notifyOnCompletion} onChange={e => change({ ...draft, proactive: { ...draft.proactive, notifyOnCompletion: e.target.checked } })} />群内工作完成或遇到问题时，主动私聊汇报</label>
          <p className={styles.help}>应用保持运行时会按时执行，可能使用模型额度。退出期间不会运行，重新打开后会补一次到期任务。结果和未读提示都会保留。</p>
          {snapshot.schedules[member.key] && <p className={styles.help}>{draft.proactive.enabled ? `下次联系：${new Date(snapshot.schedules[member.key].nextRunAt).toLocaleString()}` : "定时联系已关闭"}</p>}
        </>}
      </div>
    </div>
    {identity && <AgentIdentityModal target={member.target} name={member.name} onClose={() => setIdentity(false)} />}
  </TermModal>;
}
