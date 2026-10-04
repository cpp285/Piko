"use client"
import { tr, trNode, useLocale } from "@/lib/ui-language";


import { useState, useEffect } from 'react'
import { cn } from "@/lib/utils"
import type { OfficeLayout } from '../types'
import { sendCommand } from '@/lib/connection'
import { useOfficeStore } from '@/store/office-store'
import { APP_VERSION, APP_BUILD_TIME } from '@/lib/appMeta'
import TermModal from './primitives/TermModal'
import TermButton from './primitives/TermButton'
import TermInput from './primitives/TermInput'
import FeishuSettings from './FeishuSettings'
import { BACKEND_OPTIONS } from './office-constants'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  layout?: OfficeLayout
  onImportLayout: (layout: OfficeLayout) => void
  onImportRoomZip?: (layout: OfficeLayout, backgroundImage: HTMLImageElement | null) => void
  soundEnabled: boolean
  onSoundEnabledChange: (enabled: boolean) => void
  consoleCols?: number
  consoleRows?: number
  onConsoleColsChange?: (v: number) => void
  onConsoleRowsChange?: (v: number) => void
}

/** Horizontal form row: label on left, input on right */
function FormRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  useLocale();
  return (
    <div className="flex items-center gap-3 mb-2">
      <label className="text-term text-muted-foreground shrink-0 w-[100px] text-right">
        {trNode(label)}
        {hint && <span className="block text-[10px] opacity-50 mt-0.5">{trNode(hint)}</span>}
      </label>
      <div className="flex-1 min-w-0">{trNode(children)}</div>
    </div>
  )
}

export default function SettingsModal({
  isOpen,
  onClose,
  soundEnabled,
  onSoundEnabledChange,
  consoleCols = 3,
  consoleRows = 1,
  onConsoleColsChange,
  onConsoleRowsChange,
}: SettingsModalProps) {
  useLocale();
  const [tgToken, setTgToken] = useState('')
  const [tgUsers, setTgUsers] = useState('')
  const [tgSaving, setTgSaving] = useState(false)
  const [tgMessage, setTgMessage] = useState<string | null>(null)
  const [tgConnected, setTgConnected] = useState(false)
  const [showToken, setShowToken] = useState(false)
  const [worktreeOn, setWorktreeOn] = useState(true)
  const [autoMergeOn, setAutoMergeOn] = useState(true)
  const [tunnelToken, setTunnelToken] = useState('')
  const [tunnelBaseUrl, setTunnelBaseUrl] = useState('')
  const [tunnelRunning, setTunnelRunning] = useState(false)
  const [tunnelSaving, setTunnelSaving] = useState(false)
  const [tunnelMessage, setTunnelMessage] = useState<string | null>(null)
  const [showTunnelToken, setShowTunnelToken] = useState(false)
  const defaultBackend = useOfficeStore(s => s.defaultBackend)
  const detectedBackends = useOfficeStore(s => s.detectedBackends)
  const configData = useOfficeStore((s) => s.configData)
  const configResult = useOfficeStore((s) => s.configResult)

  useEffect(() => {
    if (isOpen) {
      sendCommand({ type: "GET_CONFIG" })
    }
  }, [isOpen])

  useEffect(() => {
    if (configData) {
      setTgToken(configData.telegramBotToken ?? '')
      setTgUsers(configData.telegramAllowedUsers?.join(', ') ?? '')
      setTgConnected(configData.telegramConnected ?? false)
      setWorktreeOn(configData.worktreeEnabled ?? true)
      setAutoMergeOn(configData.autoMergeEnabled ?? true)
      setTunnelToken(configData.tunnelToken ?? '')
      setTunnelBaseUrl(configData.tunnelBaseUrl ?? '')
      setTunnelRunning(configData.tunnelRunning ?? false)
    }
  }, [configData])

  useEffect(() => {
    if (configResult && tgSaving && configResult.requestId === 'legacy-telegram') {
      setTgSaving(false)
      setTgMessage(configResult.message)
      if (configResult.telegramConnected !== undefined) {
        setTgConnected(configResult.telegramConnected)
      }
      const t = setTimeout(() => setTgMessage(null), 5000)
      return () => clearTimeout(t)
    }
    if (configResult && tunnelSaving && configResult.requestId === 'legacy-tunnel') {
      setTunnelSaving(false)
      if (configResult.tunnelRunning !== undefined) {
        setTunnelRunning(configResult.tunnelRunning)
      }
      setTunnelMessage(configResult.tunnelRunning ? 'Tunnel started' : 'Tunnel not running')
      const t = setTimeout(() => setTunnelMessage(null), 5000)
      return () => clearTimeout(t)
    }
  }, [configResult])

  const toggleSound = () => {
    const next = !soundEnabled
    onSoundEnabledChange(next)
    localStorage.setItem('piko-sound-enabled', JSON.stringify(next))
  }

  const toggleWorktree = () => {
    const next = !worktreeOn
    setWorktreeOn(next)
    sendCommand({ type: "SAVE_CONFIG", worktreeEnabled: next })
  }

  const toggleAutoMerge = () => {
    const next = !autoMergeOn
    setAutoMergeOn(next)
    sendCommand({ type: "SAVE_CONFIG", autoMergeEnabled: next })
  }

  const handleSaveTelegram = () => {
    setTgSaving(true)
    setTgMessage(null)
    const allowedUsers = tgUsers
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
    sendCommand({
      type: "SAVE_CONFIG",
      requestId: "legacy-telegram",
      telegramBotToken: tgToken.includes('...') ? undefined : tgToken,
      telegramAllowedUsers: allowedUsers,
    })
  }

  const handleSaveTunnel = () => {
    setTunnelSaving(true)
    setTunnelMessage(null)
    sendCommand({
      type: "SAVE_CONFIG",
      requestId: "legacy-tunnel",
      tunnelToken: tunnelToken.includes('...') ? undefined : tunnelToken,
      tunnelBaseUrl: tunnelBaseUrl,
    })
  }

  const checkboxCls = (checked: boolean) => cn(
    "w-3.5 h-3.5 border-2 border-muted-foreground rounded-sm shrink-0",
    "flex items-center justify-center text-[11px] leading-none",
    checked ? "bg-accent text-background" : "bg-transparent",
  )

  const toggleCls = "flex items-center justify-between w-full px-3 py-2 text-term text-foreground bg-transparent border-none cursor-pointer text-left font-mono transition-colors duration-fast hover:bg-white/5"

  return (
    <TermModal
      open={isOpen}
      onClose={onClose}
      maxWidth={520}
      zIndex={100}
      title={tr("Settings")}
    >
      <FeishuSettings />
      <section className="border-b border-term-border-dim pb-3 mb-3">
        <h3 className="text-[13px] text-foreground font-medium mb-2">{tr("AI coding tools")}</h3>
        <p className="text-xs text-muted-foreground mb-2">{tr("Default tool")}: {tr(BACKEND_OPTIONS.find(b => b.id === defaultBackend)?.name ?? defaultBackend)}</p>
        <p className="text-xs text-muted-foreground mb-2">{tr("Installed tools")}: {detectedBackends.map(id => tr(BACKEND_OPTIONS.find(b => b.id === id)?.name ?? id)).join('、') || tr("None detected")}</p>
        <p className="text-xs text-muted-foreground leading-relaxed">{tr("Qwen Code supports a mainland China endpoint. Install and sign in to the CLI first, then choose it when adding a member. Existing tools remain available.")}</p>
        <a href="https://qwenlm.github.io/qwen-code-docs/zh/users/configuration/auth/" target="_blank" rel="noreferrer" className="text-xs text-accent underline inline-block mt-2">{tr("Qwen Code setup guide")}</a>
      </section>
      <section className="border-b border-term-border-dim pb-3 mb-3">
        <h3 className="text-[13px] text-foreground font-medium mb-2">{tr("Local and remote access")}</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">{tr("The web app connects directly to your local gateway. Feishu works independently of browser remote access. To open the web app outside your LAN, configure your own HTTPS reverse proxy or FRP service.")}</p>
      </section>
      <details className="border-b border-term-border-dim pb-3 mb-3">
        <summary className="text-xs text-muted-foreground cursor-pointer mb-3">{tr("Existing overseas integrations (optional)")}</summary>
        <p className="text-xs text-muted-foreground mb-3">{tr("Telegram and Cloudflare are kept for existing configurations. They are not required for Feishu or local access.")}</p>
      {/* ---- Telegram Section ---- */}
      <div className="border-b border-term-border-dim pb-3 mb-3">
        <div className="flex items-center gap-1.5 mb-3">
          <span className={cn("inline-block w-2 h-2 rounded-full shrink-0", tgConnected ? "bg-sem-green" : "bg-muted-foreground")} />
          <span className="text-[13px] text-foreground font-medium">
            {tr("Telegram")}{trNode(tgConnected ? '(connected)' : '(disconnected)')}
          </span>
        </div>
        <FormRow label={tr("Bot Token")}>
          <div className="flex gap-1">
            <TermInput
              type={showToken ? 'text' : 'password'}
              value={tgToken}
              onChange={e => setTgToken(e.target.value)}
              placeholder={tr("123456:ABC-DEF...")}
              className="flex-1"
              onFocus={() => { if (tgToken.includes('...')) setTgToken('') }}
            />
            <TermButton
              variant="dim"
              size="sm"
              onClick={() => setShowToken(!showToken)}
              title={tr(showToken ? 'Hide' : 'Show')}
            >{trNode(showToken ? '\u{1F648}' : '\u{1F441}')}</TermButton>
          </div>
        </FormRow>
        <FormRow label={tr("Allowed IDs")} hint="comma-sep, empty=all">
          <TermInput
            type="text"
            value={tgUsers}
            onChange={e => setTgUsers(e.target.value)}
            placeholder={tr("123456789, 987654321")}
          />
        </FormRow>
        <div className="flex items-center gap-2 pl-[112px]">
          <TermButton variant="primary" onClick={handleSaveTelegram} disabled={tgSaving}>
            {trNode(tgSaving ? 'Saving...' : 'Save & Connect')}
          </TermButton>
          {tgMessage && (
            <span className={cn("text-term", tgMessage.includes('Failed') || tgMessage.includes('not') ? "text-sem-red" : "text-sem-green")}>
              {trNode(tgMessage)}
            </span>
          )}
        </div>
      </div>

      {/* ---- Tunnel Section ---- */}
      <div className="border-b border-term-border-dim pb-3 mb-3">
        <div className="flex items-center gap-1.5 mb-3">
          <span className={cn("inline-block w-2 h-2 rounded-full shrink-0", tunnelRunning ? "bg-sem-green" : "bg-muted-foreground")} />
          <span className="text-[13px] text-foreground font-medium">
            {tr("Cloudflare Tunnel")}{trNode(tunnelRunning ? '(running)' : '(stopped)')}
          </span>
        </div>
        <FormRow label={tr("Token")}>
          <div className="flex gap-1">
            <TermInput
              type={showTunnelToken ? 'text' : 'password'}
              value={tunnelToken}
              onChange={e => setTunnelToken(e.target.value)}
              placeholder={tr("eyJ...")}
              className="flex-1"
              onFocus={() => { if (tunnelToken.includes('...')) setTunnelToken('') }}
            />
            <TermButton
              variant="dim"
              size="sm"
              onClick={() => setShowTunnelToken(!showTunnelToken)}
              title={tr(showTunnelToken ? 'Hide' : 'Show')}
            >{trNode(showTunnelToken ? '\u{1F648}' : '\u{1F441}')}</TermButton>
          </div>
        </FormRow>
        <FormRow label={tr("Public URL")}>
          <TermInput
            type="text"
            value={tunnelBaseUrl}
            onChange={e => setTunnelBaseUrl(e.target.value)}
            placeholder={tr("https://office.example.com")}
          />
        </FormRow>
        <div className="flex items-center gap-2 pl-[112px]">
          <TermButton variant="primary" onClick={handleSaveTunnel} disabled={tunnelSaving}>
            {trNode(tunnelSaving ? 'Saving...' : 'Save & Start')}
          </TermButton>
          {tunnelMessage && (
            <span className={cn("text-term", tunnelMessage.includes('not') || tunnelMessage.includes('Failed') ? "text-sem-red" : "text-sem-green")}>
              {trNode(tunnelMessage)}
            </span>
          )}
        </div>
      </div>

      </details>

      {/* ---- Toggles ---- */}
      <div className="mb-1">
        <button onClick={toggleWorktree} className={toggleCls} title={tr("Each agent works in its own git worktree branch, merged on completion")}>
          <span>{tr("Agent Isolation")}</span>
          <span className={checkboxCls(worktreeOn)}>{trNode(worktreeOn ? '\u2713' : '')}</span>
        </button>
        <button onClick={toggleAutoMerge} className={toggleCls} title={tr("Auto-merge agent changes to main on task completion. Turn off to review before merging.")}>
          <span>{tr("Auto-merge")}</span>
          <span className={checkboxCls(autoMergeOn)}>{trNode(autoMergeOn ? '\u2713' : '')}</span>
        </button>
        <button onClick={toggleSound} className={toggleCls}>
          <span>{tr("Sound Notifications")}</span>
          <span className={checkboxCls(soundEnabled)}>{trNode(soundEnabled ? '\u2713' : '')}</span>
        </button>
      </div>

      {/* Grid settings are only available for consumers that render a grid. */}
      {onConsoleColsChange && onConsoleRowsChange && <div className="border-b border-term-border-dim pb-3 mb-2">
        <span className="text-[13px] text-foreground font-medium block mb-2">{tr("Console Grid")}</span>
        <div className="flex items-center gap-4">
          <FormRow label={tr("Columns")}>
            <div className="flex items-center gap-1.5">
              {[1, 2, 3, 4].map(v => (
                <button
                  key={v}
                  onClick={() => onConsoleColsChange?.(v)}
                  className={cn(
                    "w-8 h-7 text-term font-mono border rounded cursor-pointer transition-colors duration-150",
                    consoleCols === v
                      ? "border-accent bg-accent/20 text-accent"
                      : "border-muted-foreground/30 bg-transparent text-muted-foreground hover:border-muted-foreground"
                  )}
                >{trNode(v)}</button>
              ))}
            </div>
          </FormRow>
          <FormRow label={tr("Rows")}>
            <div className="flex items-center gap-1.5">
              {[1, 2, 3].map(v => (
                <button
                  key={v}
                  onClick={() => onConsoleRowsChange?.(v)}
                  className={cn(
                    "w-8 h-7 text-term font-mono border rounded cursor-pointer transition-colors duration-150",
                    consoleRows === v
                      ? "border-accent bg-accent/20 text-accent"
                      : "border-muted-foreground/30 bg-transparent text-muted-foreground hover:border-muted-foreground"
                  )}
                >{trNode(v)}</button>
              ))}
            </div>
          </FormRow>
        </div>
        <div className="text-[10px] text-muted-foreground mt-1 pl-[112px]">
          {trNode(consoleCols)} × {trNode(consoleRows)} = {trNode(consoleCols * consoleRows)} {tr("agents per page")}</div>
      </div>}

      {/* ---- Version ---- */}
      <div className="border-t border-term-border-dim mt-1 pt-2 text-[11px] text-muted-foreground font-mono leading-snug select-text" title={tr("From monorepo root package.json at build time")}>
        <div>
          <span className="opacity-75">{tr("Web UI")}</span>{trNode(' ')}
          <span className="text-foreground">{tr("v")}{trNode(APP_VERSION)}</span>
        </div>
        {APP_BUILD_TIME ? (
          <div className="mt-0.5 text-[10px] opacity-90">
            {tr("build")}{trNode(new Date(APP_BUILD_TIME).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }))} {tr("Beijing time")}
          </div>
        ) : null}
      </div>
    </TermModal>
  )
}
