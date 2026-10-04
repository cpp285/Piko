"use client";

import { useEffect, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { useOfficeStore } from "@/store/office-store";
import { sendCommand } from "@/lib/connection";
import { tr, useLocale } from "@/lib/ui-language";
import TermInput from "./primitives/TermInput";
import TermButton from "./primitives/TermButton";

export default function FeishuSettings() {
  useLocale();
  const config = useOfficeStore(s => s.configData);
  const result = useOfficeStore(s => s.configResult);
  const [enabled, setEnabled] = useState(false);
  const [appId, setAppId] = useState("");
  const [secret, setSecret] = useState("");
  const [users, setUsers] = useState("");
  const [connected, setConnected] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const pending = useRef<string | null>(null);
  useEffect(() => {
    if (!config) return;
    setEnabled(config.feishuEnabled ?? false);
    setAppId(config.feishuAppId ?? "");
    setUsers(config.feishuAllowedUsers?.join("，") ?? "");
    setConnected(config.feishuConnected ?? false);
    setSecret("");
    setMessage(config.feishuError ?? "");
    setFailed(!!config.feishuError);
  }, [config]);
  useEffect(() => {
    if (!result || result.requestId !== pending.current) return;
    pending.current = null;
    setSaving(false);
    setMessage(result.message);
    setFailed(!result.success);
    setConnected(result.feishuConnected ?? false);
    if (result.success) sendCommand({ type: "GET_CONFIG" });
  }, [result]);
  const save = (clear = false) => {
    const allowed = [...new Set(users.split(/[,，\s]+/).filter(Boolean))];
    if (!clear && (allowed.length > 100 || allowed.some(id => !/^ou_[a-zA-Z0-9_-]+$/.test(id)))) {
      setFailed(true); setMessage(tr("Use Open IDs starting with ou_, separated by commas (up to 100).")); return;
    }
    if (!clear && enabled && (!/^cli_[0-9a-fA-F]{16}$/.test(appId.trim()) || (!secret.trim() && !config?.feishuSecretConfigured))) {
      setFailed(true); setMessage(tr("Enter a valid App ID and App Secret before enabling Feishu.")); return;
    }
    pending.current = nanoid(); setSaving(true); setMessage("");
    sendCommand({
      type: "SAVE_CONFIG", requestId: pending.current,
      feishuEnabled: clear ? false : enabled,
      feishuAppId: clear ? "" : appId.trim(),
      feishuAppSecret: clear ? "" : secret.trim() || undefined,
      feishuAllowedUsers: clear ? [] : allowed,
    });
  };
  return <section className="border-b border-term-border-dim pb-4 mb-4" aria-label={tr("Feishu bot")}>
    <div className="flex items-center justify-between gap-3 mb-2">
      <h3 className="text-[14px] text-foreground font-semibold">{tr("Feishu bot")}</h3>
      <span className={connected ? "text-sem-green text-xs" : "text-muted-foreground text-xs"}>{tr(connected ? "Connected" : "Not connected")}</span>
    </div>
    <p className="text-xs text-muted-foreground leading-relaxed mb-3">{tr("Assign tasks and receive results in a private chat with your Feishu bot. No public server or tunnel required.")}</p>
    <label className="flex gap-2 items-center text-term mb-3"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} disabled={saving} />{tr("Enable Feishu")}</label>
    <div className="grid gap-3">
      <label className="grid gap-1 text-xs text-muted-foreground">App ID<TermInput aria-label="Feishu App ID" value={appId} onChange={e => setAppId(e.target.value)} placeholder="cli_xxxxxxxxxxxxxxxx" disabled={saving} /></label>
      <label className="grid gap-1 text-xs text-muted-foreground">App Secret<TermInput aria-label="Feishu App Secret" type="password" autoComplete="new-password" value={secret} onChange={e => setSecret(e.target.value)} placeholder={tr(config?.feishuSecretConfigured ? "Secret saved; leave blank to keep it" : "Paste your app secret")} disabled={saving} /></label>
      <label className="grid gap-1 text-xs text-muted-foreground">{tr("Allowed users")}<TermInput aria-label={tr("Allowed users")} value={users} onChange={e => setUsers(e.target.value)} placeholder="ou_xxx，ou_yyy" disabled={saving} /></label>
      <p className="text-[11px] text-muted-foreground leading-relaxed">{tr("Leave users empty to allow ID lookup only. After connecting, send 我的ID to the bot, then add your Open ID here to enable task commands.")}</p>
    </div>
    <div className="flex flex-wrap gap-2 mt-3">
      <TermButton variant="primary" disabled={saving} onClick={() => save()}>{tr(saving ? "Connecting..." : "Save Feishu settings")}</TermButton>
      <TermButton variant="dim" disabled={saving} onClick={() => save(true)}>{tr("Disable and clear credentials")}</TermButton>
    </div>
    {message && <p role="status" className={`text-xs mt-2 ${failed ? "text-sem-red" : "text-sem-green"}`}>{tr(message)}</p>}
    <details className="mt-3 text-xs text-muted-foreground leading-relaxed">
      <summary className="cursor-pointer text-accent">{tr("How to connect Feishu")}</summary>
      <ol className="list-decimal pl-5 space-y-2 mt-2">
        <li>{tr("Create a self-built app in the Feishu developer console and enable its bot.")}</li>
        <li>{tr("Add im:message.p2p_msg:readonly and im:message:send_as_bot permissions.")}</li>
        <li>{tr("Save credentials here, then select long connection for event subscription and add im.message.receive_v1 in Feishu.")}</li>
        <li>{tr("Publish the app, add yourself to its availability range, and start a private chat. Send 帮助 for Chinese commands.")}</li>
      </ol>
      <a href="https://open.feishu.cn/app" target="_blank" rel="noreferrer" className="text-accent underline inline-block mt-2">{tr("Open Feishu developer console")}</a>
    </details>
  </section>;
}
