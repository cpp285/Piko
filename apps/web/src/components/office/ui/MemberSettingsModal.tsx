"use client";
import { useRef, useState } from "react";
import { BookOpen, Bell, Fingerprint, Puzzle, Plus, Trash2, Upload, FolderUp } from "lucide-react";
import { nanoid } from "nanoid";
import { MemberSettingsSchema, type MemberResource, type WorkroomMember } from "@piko/shared";
import { useOfficeStore } from "@/store/office-store";
import { workroomRequest } from "@/lib/workroom-client";
import { prepareResourceUpload } from "@/lib/resource-upload";
import AgentIdentityModal from "./AgentIdentityModal";
import TermModal from "./primitives/TermModal";
import styles from "./PersonalWorkspace.module.css";

export default function MemberSettingsModal({ member, onClose }: { member: WorkroomMember; onClose: () => void }) {
  const snapshot = useOfficeStore(s => s.workroom);
  const connected = useOfficeStore(s => s.connected);
  const backends = useOfficeStore(s => s.detectedBackends);
  const [draft, setDraft] = useState(() => structuredClone(snapshot.settings[member.key] ?? MemberSettingsSchema.parse({})));
  const [browserOriginsText, setBrowserOriginsText] = useState(() => (snapshot.settings[member.key]?.browserOrigins || []).join("\n"));
  const [version, setVersion] = useState(snapshot.settingsVersions[member.key]);
  const [tab, setTab] = useState("identity");
  const [identity, setIdentity] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false); const [uploadStatus, setUploadStatus] = useState("");
  const fileInput = useRef<HTMLInputElement>(null); const folderInput = useRef<HTMLInputElement>(null);
  const [original, setOriginal] = useState(JSON.stringify(draft)); const [closing, setClosing] = useState(false);
  const dirty = JSON.stringify(draft) !== original;
  const change = (next: typeof draft) => { setDraft(next); setSaved(false); };
  const close = () => { if (busy || uploading) return; if (dirty) setClosing(true); else onClose(); };
  const save = async () => {
    const checked = MemberSettingsSchema.safeParse(draft);
    if (!checked.success) {
      if (checked.error.issues[0]?.path[0] === "browserOrigins") { setError("最多填写 20 个 HTTPS 站点，每行一个，例如 https://x.com，不包含路径。"); return; }
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
  const upload = async (files: File[], folder: boolean) => {
    if (!files.length || !resourceTab || uploading || busy) return;
    if (resources.length >= 40) { setError("每类最多 40 项，请先移除不需要的条目。一次上传的多个文件会合并成一项。"); return; }
    const category = resourceTab;
    setUploading(true); setError(""); setSaved(false); setClosing(false); setUploadStatus(`正在读取 0 / ${files.length} 个文件…`);
    try {
      const payload = await prepareResourceUpload(files, folder, done => setUploadStatus(`正在读取 ${done} / ${files.length} 个文件…`));
      setUploadStatus("正在保存到 Piko…");
      const result = await workroomRequest({ op: "upload-resource", memberKey: member.key, category, ...payload });
      if (!result.resource) throw new Error("上传服务尚未就绪，请重新打开 Piko 后重试。");
      setDraft(previous => ({ ...previous, [category]: [...previous[category], result.resource!] }));
      setUploadStatus(`已上传 ${result.fileCount ?? files.length} 个文件。点击「保存设置」后，这位成员即可使用。`);
    } catch (e) { setError((e as Error).message); setUploadStatus(""); }
    finally { setUploading(false); }
  };
  const chooseFolder = async () => {
    if (!(window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) { folderInput.current?.click(); return; }
    if (!resourceTab || uploading || busy || resources.length >= 40) return;
    const category = resourceTab;
    setUploading(true); setError(""); setUploadStatus("请选择文件夹…"); setClosing(false);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const folder = await invoke<string | null>("pick_resource_folder");
      if (!folder) { setUploadStatus(""); return; }
      setSaved(false); setUploadStatus("正在复制文件夹到 Piko…");
      const result = await workroomRequest({ op: "import-resource-folder", memberKey: member.key, category, path: folder });
      if (!result.resource) throw new Error("上传服务尚未就绪，请重新打开 Piko 后重试。");
      setDraft(previous => ({ ...previous, [category]: [...previous[category], result.resource!] }));
      setUploadStatus(`已上传 ${result.fileCount} 个文件。点击「保存设置」后，这位成员即可使用。`);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setUploadStatus(""); }
    finally { setUploading(false); }
  };
  return <TermModal open onClose={close} title={`${member.name} · 成员设置`} maxWidth={960} zIndex={130} className={styles.modal} footer={<div className={styles.modalFooter}>
    <span role="status">{closing ? "还有未保存的设置" : saved ? "已保存，下次执行时使用新设置" : "每位成员独立配置"}</span>
    <div>{closing ? <><button onClick={() => setClosing(false)}>继续编辑</button><button onClick={onClose}>放弃并关闭</button></> : <><button onClick={close} disabled={busy || uploading}>关闭</button><button className={styles.primary} onClick={() => void save()} disabled={!dirty || busy || uploading || !connected}>{uploading ? "上传中…" : busy ? "保存中…" : "保存设置"}</button></>}</div>
  </div>}>
    <fieldset className={styles.settingsFieldset} disabled={busy || uploading}><div className={styles.settingsLayout}>
      <nav className={styles.settingsNav} aria-label="成员设置分类">{[{ id: "identity", label: "身份设定", icon: Fingerprint }, { id: "skills", label: "技能", icon: Puzzle }, { id: "knowledge", label: "知识库", icon: BookOpen }, { id: "proactive", label: "主动联系", icon: Bell }].map(item => <button key={item.id} aria-current={tab === item.id ? "page" : undefined} onClick={() => setTab(item.id)}><item.icon size={19} />{item.label}{item.id === "skills" && <small>{draft.skills.length}</small>}{item.id === "knowledge" && <small>{draft.knowledge.length}</small>}</button>)}</nav>
      <div className={styles.settingsContent}>
        {error && <p className={styles.error} role="alert">{error}</p>}
        {!connected && <p className={styles.error}>连接已断开，恢复后可以保存。草稿仍在。</p>}
        {tab === "identity" && <><h3>我是谁，我怎么做事</h3><p>为这位成员设置职责、工作方式与沟通习惯。</p><button onClick={() => setIdentity(true)}>查看与编辑 IDENTITY / SOUL</button><h3>执行引擎与模型</h3><label className={styles.field}>Agent<select value={draft.backend} onChange={e => change({ ...draft, backend: e.target.value, model: "" })}><option value="">沿用当前设置</option>{[...new Set([...backends, member.backend, draft.backend].filter((x): x is string => !!x))].map(id => <option key={id} value={id}>{id}</option>)}</select></label><label className={styles.field}>模型<input value={draft.model} onChange={e => change({ ...draft, model: e.target.value })} placeholder="留空使用此引擎的默认模型" /></label></>}
        {resourceTab && <><div className={styles.sectionHeading}><div><h3>{tab === "skills" ? "技能" : "知识库"}</h3><p>{tab === "skills" ? "添加这位成员的做事方法，例如社媒采集或营销分析。" : "添加这位成员需要参考的资料，例如品牌介绍、营销手册或项目文档。"}</p></div></div>
          <div className={styles.uploadPanel}>
            <div className={styles.uploadActions}>
              <button className={styles.primary} disabled={!connected || resources.length >= 40} onClick={() => fileInput.current?.click()}><Upload size={16} />上传文件</button>
              <button disabled={!connected || resources.length >= 40} onClick={() => void chooseFolder()}><FolderUp size={16} />上传文件夹</button>
              <button disabled={resources.length >= 40} onClick={() => change({ ...draft, [resourceTab]: [...resources, { id: nanoid(), title: "", source: "text", content: "", enabled: true }] })}><Plus size={16} />手动添加</button>
            </div>
            <input hidden type="file" multiple ref={fileInput} aria-label="选择上传文件" onChange={e => { const files = Array.from(e.currentTarget.files ?? []); e.currentTarget.value = ""; void upload(files, false); }} />
            <input hidden type="file" multiple {...{ webkitdirectory: "" }} ref={folderInput} aria-label="选择上传文件夹" onChange={e => { const files = Array.from(e.currentTarget.files ?? []); e.currentTarget.value = ""; void upload(files, true); }} />
            <p>{tab === "skills" ? "可选择 SKILL.md，或上传整个技能文件夹，保留脚本与参考资料。" : "支持多选文件或整个资料文件夹，自动整理目录，按任务需要读取。"}<br />文件会复制到 Piko 本地，移动原文件不影响使用。每次最多 500 个文件，单个 20 MB，总计 25 MB。</p>
            {uploadStatus && !saved && <div className={styles.uploadStatus} role="status" aria-live="polite">{uploadStatus}</div>}
          </div>
          {!resources.length && <div className={styles.resourceEmpty}>{tab === "skills" ? <Puzzle size={28} /> : <BookOpen size={28} />}<strong>还没有配置{tab === "skills" ? "技能" : "资料"}</strong><p>从电脑上传文件，或手动添加内容与链接。</p></div>}
          {resources.map((resource, index) => <section className={styles.resourceCard} key={resource.id}><div className={styles.sectionHeading}><strong>{tab === "skills" ? "技能" : "资料"} {index + 1}</strong><div><label><input type="checkbox" checked={resource.enabled} onChange={e => editResource(resource.id, { enabled: e.target.checked })} />启用</label><button aria-label={`移除${resource.title || index + 1}`} onClick={() => change({ ...draft, [resourceTab]: resources.filter(r => r.id !== resource.id) })}><Trash2 size={15} /></button></div></div>
            <label className={styles.field}>名称<input value={resource.title} maxLength={120} placeholder={tab === "skills" ? "例如：社媒内容分析" : "例如：品牌营销手册"} onChange={e => editResource(resource.id, { title: e.target.value })} /></label>
            <label className={styles.field}>来源<select value={resource.source} onChange={e => editResource(resource.id, { source: e.target.value as MemberResource["source"] })}><option value="text">直接填写内容</option><option value="file">本地文件或文件夹</option><option value="url">网页链接</option></select></label>
            <label className={styles.field}>{resource.source === "text" ? "内容" : resource.source === "file" ? "完整路径" : "链接"}<textarea rows={resource.source === "text" ? 6 : 2} value={resource.content} maxLength={24000} onChange={e => editResource(resource.id, { content: e.target.value })} placeholder={resource.source === "file" ? "/Users/你的名字/Documents/资料" : resource.source === "url" ? "https://…" : "可以粘贴 Markdown 内容"} /></label>
          </section>)}<p className={styles.help}>保存后，启用的内容会提供给这位成员。链接及较大的文件按任务需要读取；添加技能不会自动安装它依赖的软件或连接账号。</p>
        </>}
        {tab === "proactive" && <><h3>让成员主动来找你</h3><p>应用运行时按频率检查，有新发现或建议再私聊你。默认不重复群聊内容，没新情况就保持安静。</p><label className={styles.switchRow}><input type="checkbox" checked={draft.proactive.enabled} onChange={e => change({ ...draft, proactive: { ...draft.proactive, enabled: e.target.checked } })} />定时主动联系</label><label className={styles.field}>工作要求<textarea rows={5} value={draft.proactive.instruction} maxLength={8000} placeholder="例如：查看账号最近的作品，有新观察或选题再找我。别重复催更，晚上 23 点到早上 8 点不要打扰。" onChange={e => change({ ...draft, proactive: { ...draft.proactive, instruction: e.target.value } })} /></label>
          <label className={styles.field}>频率<select value={draft.proactive.cadence} onChange={e => change({ ...draft, proactive: { ...draft.proactive, cadence: e.target.value as "daily" | "interval" } })}><option value="daily">每天固定时间</option><option value="interval">每隔一段时间</option></select></label>
          {draft.proactive.cadence === "daily" ? <label className={styles.field}>联系时间（本机时区）<input type="time" value={draft.proactive.time} onChange={e => change({ ...draft, proactive: { ...draft.proactive, time: e.target.value } })} /></label> : <label className={styles.field}>间隔分钟<input type="number" min={15} max={10080} value={draft.proactive.intervalMinutes} onChange={e => change({ ...draft, proactive: { ...draft.proactive, intervalMinutes: Number(e.target.value) } })} /></label>}
          <label className={styles.switchRow}><input type="checkbox" checked={draft.proactive.notifyOnCompletion} onChange={e => change({ ...draft, proactive: { ...draft.proactive, notifyOnCompletion: e.target.checked } })} />群内工作完成或遇到问题时，主动私聊汇报</label>
          <section className={styles.resourceCard}><h4>持续允许访问的站点</h4><p className={styles.help}>只对这位成员生效，访问这些站点时不再重复确认。不会自动批准发布、上传、下载、私信或其他操作。移除后保存即可撤回。</p>
            <label className={styles.field}>站点地址（每行一个，不包含具体页面路径）<textarea rows={4} value={browserOriginsText} placeholder={"https://creator.douyin.com\nhttps://x.com\nhttps://www.reddit.com"} onChange={e => { setBrowserOriginsText(e.target.value); change({ ...draft, browserOrigins: [...new Set(e.target.value.split("\n").map(line => line.trim()).filter(Boolean))] }); }} /></label>
          </section>
          <p className={styles.help}>应用保持运行时会按时执行，可能使用模型额度。退出期间不会运行，重新打开后会补一次到期任务。结果和未读提示都会保留。</p>
          {snapshot.schedules[member.key] && <p className={styles.help}>{draft.proactive.enabled ? `下次联系：${new Date(snapshot.schedules[member.key].nextRunAt).toLocaleString()}` : "定时联系已关闭"}</p>}
        </>}
      </div>
    </div></fieldset>
    {identity && <AgentIdentityModal target={member.target} name={member.name} onClose={() => setIdentity(false)} />}
  </TermModal>;
}
