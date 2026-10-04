"use client"

import { useState, useEffect, useCallback } from 'react'
import type { OfficeLayout } from '../types'
import { loadRoomZipFromUrl } from '../layout/roomZipLoader'
import { tr, useLocale } from '@/lib/ui-language'
import TermModal from './primitives/TermModal'

interface OfficeEntry {
  id: string
  name: string
  theme: string
  description?: string
  file: string
  thumbnail: string
}

interface OfficeSwitcherProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (layout: OfficeLayout, backgroundImage: HTMLImageElement | null) => void
  currentOfficeId?: string | null
}

const OFFICES_BASE = '/offices'
const DEFAULT_OFFICE_ID = 'Modern'

export default function OfficeSwitcher({ isOpen, onClose, onSelect, currentOfficeId }: OfficeSwitcherProps) {
  useLocale()
  const [offices, setOffices] = useState<OfficeEntry[]>([])
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isOpen) return
    const controller = new AbortController()
    setError('')
    fetch(`${OFFICES_BASE}/index.json`, { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error('index'); return response.json() })
      .then(setOffices)
      .catch(() => { if (!controller.signal.aborted) setError('场景加载失败，请重新打开后重试。') })
    return () => controller.abort()
  }, [isOpen])

  const handleSelect = useCallback(async (entry: OfficeEntry) => {
    if (loadingId) return
    setLoadingId(entry.id)
    setError('')
    try {
      const result = await loadRoomZipFromUrl(`${OFFICES_BASE}/${entry.file}`)
      if (!result) throw new Error('room')
      try { localStorage.setItem('piko-selected-id', entry.id) } catch {}
      onSelect(result.layout, result.backgroundImage)
      onClose()
    } catch {
      setError('场景加载失败，请重新打开后重试。')
    } finally {
      setLoadingId(null)
    }
  }, [loadingId, onSelect, onClose])

  return <TermModal open={isOpen} onClose={onClose} title={tr('Switch Office')} maxWidth={1000}>
    <p style={{ margin: '0 0 16px', color: 'var(--term-dim)', lineHeight: 1.8 }}>{tr('Twelve themes, twelve new places to work. Your team stays with you.')}</p>
    {error && <p role="alert" style={{ color: 'var(--term-sem-red)' }}>{tr(error)}</p>}
    {!offices.length && !error && <p>{tr('Loading...')}</p>}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 16 }}>
      {offices.map(entry => <button key={entry.id} disabled={loadingId !== null} onClick={() => handleSelect(entry)} aria-pressed={currentOfficeId === entry.id} style={{ padding: 0, border: `2px solid ${currentOfficeId === entry.id ? 'var(--term-accent)' : 'var(--term-border)'}`, borderRadius: 12, overflow: 'hidden', background: 'var(--term-panel)', color: 'var(--term-text)', textAlign: 'left', cursor: loadingId ? 'wait' : 'pointer' }}>
        <img src={`${OFFICES_BASE}/${entry.thumbnail}`} alt={tr(entry.name)} loading="lazy" decoding="async" style={{ display: 'block', width: '100%', aspectRatio: '1', objectFit: 'contain', imageRendering: 'pixelated', background: 'var(--term-bg)' }} />
        <div style={{ padding: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--term-dim)', marginBottom: 7 }}>{tr(entry.theme)}</div>
          <strong style={{ fontSize: 15 }}>{tr(entry.name)}</strong><span style={{ float: 'right', color: 'var(--term-accent)', fontSize: 12 }}>{tr(loadingId === entry.id ? 'Loading...' : currentOfficeId === entry.id ? '当前场景' : '使用场景')}</span>
          {entry.description && <p style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--term-dim)', margin: '7px 0 0' }}>{tr(entry.description)}</p>}
        </div>
      </button>)}
    </div>
  </TermModal>
}

/** Keep the original twelve theme IDs and migrate the interim garden-only choice. */
export async function loadDefaultOffice(): Promise<{ layout: OfficeLayout; backgroundImage: HTMLImageElement | null; officeId: string } | null> {
  try {
    const response = await fetch(`${OFFICES_BASE}/index.json`)
    if (!response.ok) return null
    const offices: OfficeEntry[] = await response.json()
    let selectedId: string | null = null
    try { selectedId = localStorage.getItem('piko-selected-id') } catch {}
    if (selectedId === 'garden-studio') selectedId = DEFAULT_OFFICE_ID
    const entry = offices.find(office => office.id === selectedId) || offices.find(office => office.id === DEFAULT_OFFICE_ID) || offices[0]
    if (!entry) return null
    const result = await loadRoomZipFromUrl(`${OFFICES_BASE}/${entry.file}`)
    if (!result) return null
    try { localStorage.setItem('piko-selected-id', entry.id) } catch {}
    return { ...result, officeId: entry.id }
  } catch (error) {
    console.error('[loadDefaultOffice] Failed:', error)
    return null
  }
}
