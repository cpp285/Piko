"use client";

import { useEffect, useRef, useState } from "react";
import { Check, FilePenLine, Maximize2, Minimize2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { nanoid } from "nanoid";
import { PERSONA_MAX_LENGTH, type PersonaDocuments, type PersonaTarget } from "@piko/shared";
import { useOfficeStore } from "@/store/office-store";
import { sendCommand } from "@/lib/connection";
import { useLocale } from "@/lib/ui-language";
import TermModal from "./primitives/TermModal";
import styles from "./AgentIdentityModal.module.css";

type Documents = PersonaDocuments & { version: string };
export default function AgentIdentityModal({ target, name, onClose }: { target: PersonaTarget; name: string; onClose: () => void }) {
  const locale = useLocale();
  const t = (zh: string, en: string) => locale === "zh" ? zh : en;
  const connected = useOfficeStore(s => s.connected);
  const result = useOfficeStore(s => s.personaResult);
  const [original, setOriginal] = useState<Documents | null>(null);
  const [draft, setDraft] = useState<PersonaDocuments>({ identity: "", soul: "" });
  const [editing, setEditing] = useState({ identity: false, soul: false });
  const [request, setRequest] = useState<string | null>(null);
  const requestRef = useRef<string | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [closing, setClosing] = useState(false);
  const dirty = !!original && (original.identity !== draft.identity || original.soul !== draft.soul);
  const startRequest = (command: Record<string, unknown>) => {
    const id = nanoid(); requestRef.current = id; setRequest(id); setError(""); setSaved(false);
    sendCommand({ ...command, target, requestId: id });
  };
  const reload = () => startRequest({ type: "GET_AGENT_PERSONA" });
  useEffect(() => {
    if (connected) reload();
    // The modal is mounted for one target. Reconnect preserves unsaved drafts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.kind, target.id]);
  useEffect(() => {
    if (connected && !original && !requestRef.current) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);
  useEffect(() => {
    if (!result || result.requestId !== requestRef.current) return;
    requestRef.current = null; setRequest(null);
    if (!result.success || !result.documents) { setError(result.message || t("读取或保存失败，请重试。", "Could not read or save. Try again.")); return; }
    setOriginal(result.documents); setDraft(result.documents); setSaved(!!result.saved); setClosing(false);
    if (result.saved) setEditing({ identity: false, soul: false });
  }, [result]);
  useEffect(() => {
    if (!request) return;
    const timer = setTimeout(() => {
      if (requestRef.current !== request) return;
      requestRef.current = null; setRequest(null);
      setError(t("未收到服务回复，草稿已保留。请检查连接后重试或重新加载。", "No reply received. Your draft is kept. Check the connection, retry or reload."));
    }, 12000);
    return () => clearTimeout(timer);
  }, [request]);
  const close = () => { if (request) return; if (dirty) setClosing(true); else onClose(); };
  const save = () => original && startRequest({ type: "SAVE_AGENT_PERSONA", ...draft, expectedVersion: original.version });
  const cards = [
    { field: "identity" as const, title: t("我是谁", "Who I am"), file: "IDENTITY.md" },
    { field: "soul" as const, title: t("我怎么做事", "How I work"), file: "SOUL.md" },
  ];
  return <TermModal open onClose={close} maxWidth={expanded ? 1120 : 820} zIndex={150} title={t("身份设定", "Identity settings")} className={styles.modal}
    footer={<div className={styles.footer}>
      {closing ? <><span>{t("还有未保存的更改。", "You have unsaved changes.")}</span><div className={styles.actions}><button onClick={() => setClosing(false)}>{t("继续编辑", "Keep editing")}</button><button onClick={onClose}>{t("放弃更改并关闭", "Discard and close")}</button></div></> : <>
        <span role="status">{saved ? <><Check size={15} />{t("已保存，下次任务生效", "Saved. Applies to the next task")}</> : dirty ? t("有未保存的更改", "Unsaved changes") : t("你的修改会保留，重启后仍然有效", "Your changes persist across restarts")}</span>
        <div className={styles.actions}><button disabled={!!request} onClick={close}>{t("关闭", "Close")}</button><button className={styles.primary} disabled={!connected || !dirty || !!request} onClick={save}>{request && original ? t("保存中…", "Saving…") : t("保存更改", "Save changes")}</button></div>
      </>}
    </div>}>
    <div className={styles.intro}><div><strong>{name}</strong><p>{target.kind === "agent" ? t("只修改这位成员的身份与做事方式。", "Edit this person's identity and working style.") : t("作为新成员的默认设定，已创建的成员保持各自的设定。", "Defaults for new people. Existing people keep their own settings.")}</p></div><button onClick={() => setExpanded(v => !v)} aria-label={expanded ? t("收起窗口", "Compact view") : t("展开窗口", "Expand view")}>{expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button></div>
    {!connected && <p className={styles.error} role="status">{t("连接已断开，恢复后可以读取和保存。", "Disconnected. Reconnect to load or save.")}</p>}
    {error && <div className={styles.error} role="alert"><p>{error}</p><button disabled={!connected || !!request} onClick={reload}>{dirty ? t("放弃草稿并重新加载", "Discard draft and reload") : t("重新加载", "Reload")}</button></div>}
    {!original ? <p className={styles.loading}>{request ? t("正在读取身份文件…", "Loading identity files…") : t("等待读取身份文件", "Waiting to load identity files")}</p> : cards.map(({ field, title, file }) => <section key={field} className={styles.card}>
      <div className={styles.cardHeader}><div><h3>{title}</h3><code>agent/{file}</code></div><button disabled={!!request} onClick={() => setEditing(v => ({ ...v, [field]: !v[field] }))}><FilePenLine size={16} />{editing[field] ? t("预览内容", "Preview") : t("查看与编辑", "View and edit")}</button></div>
      {editing[field] ? <div className={styles.editor}><textarea aria-label={file} autoFocus value={draft[field]} maxLength={PERSONA_MAX_LENGTH} disabled={!!request} spellCheck={false} onChange={e => { setDraft(v => ({ ...v, [field]: e.target.value })); setSaved(false); }} /><span>{draft[field].length} / {PERSONA_MAX_LENGTH} · Markdown</span></div> : <div className={styles.preview}>{draft[field] ? <ReactMarkdown components={{ img: ({ alt }) => <span>{alt}</span>, a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer">{children}</a> }}>{draft[field]}</ReactMarkdown> : <p>{t("这份文件是空的，点击“查看与编辑”添加内容。", "This file is empty. Choose View and edit to add content.")}</p>}</div>}
    </section>)}
  </TermModal>;
}
