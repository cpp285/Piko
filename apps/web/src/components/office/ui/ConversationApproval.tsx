'use client';
import { useState } from 'react';
import { validateApprovalValues, type ApprovalValues, type RoomMessage } from '@piko/shared';
import s from './PersonalWorkspace.module.css';

export default function ConversationApproval({ approval, onAnswer }: {
  approval: NonNullable<RoomMessage['approval']>;
  onAnswer: (decision: 'yes' | 'no', values: ApprovalValues) => Promise<unknown>;
}) {
  const [values, setValues] = useState<ApprovalValues>({});
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(decision: 'yes' | 'no') {
    try {
      const content = decision === 'yes' ? validateApprovalValues(approval.fields || [], values) : {};
      setBusy(true); setError(''); await onAnswer(decision, content);
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }
  return <div className={s.approval} role="group" aria-label="操作确认">
    <strong>{approval.title}</strong><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{approval.summary}</p>
    {(approval.fields || []).map(field => <label className={s.field} key={field.key}>{field.label}{field.required ? '（必填）' : ''}
      {field.description && <small>{field.description}</small>}
      {field.choices ? <select value={String(values[field.key] ?? '')} onChange={e => setValues(v => ({ ...v, [field.key]: e.target.value }))} disabled={busy}>
        <option value="">请选择</option>{field.choices.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
      </select> : field.type === 'boolean' ? <select value={values[field.key] === undefined ? '' : String(values[field.key])} onChange={e => setValues(v => ({ ...v, [field.key]: e.target.value === '' ? '' : e.target.value === 'true' }))} disabled={busy}><option value="">请选择</option><option value="true">是</option><option value="false">否</option></select>
      : <input type={field.type === 'string' ? 'text' : 'number'} value={String(values[field.key] ?? '')} min={field.min} max={field.max} maxLength={field.maxLength} step={field.type === 'integer' ? 1 : 'any'} disabled={busy} onChange={e => setValues(v => ({ ...v, [field.key]: field.type === 'string' || e.target.value === '' ? e.target.value : Number(e.target.value) }))} />}
    </label>)}
    {error && <p role="alert">{error}</p>}
    <button disabled={busy} onClick={() => void submit('no')}>拒绝</button><button disabled={busy} onClick={() => void submit('yes')}>{busy ? '正在提交…' : '确认并继续'}</button>
  </div>;
}
