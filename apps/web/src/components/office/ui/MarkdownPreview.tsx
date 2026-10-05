'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, FileText, RefreshCw } from 'lucide-react';
import { isMarkdownArtifact, type MarkdownDocument } from '@piko/shared';
import { workroomRequest } from '@/lib/workroom-client';
import { useLocale } from '@/lib/ui-language';
import TermModal from './primitives/TermModal';
import DocumentMarkdown from './DocumentMarkdown';
import s from './MarkdownPreview.module.css';

export default function MarkdownPreview({ conversationId, path, fragment = '', onClose }: {
  conversationId: string; path: string; fragment?: string; onClose: () => void;
}) {
  const locale = useLocale(); const t = (zh: string, en: string) => locale === 'zh' ? zh : en;
  const [history, setHistory] = useState([{ path, fragment }]);
  const target = history[history.length - 1];
  const [document, setDocument] = useState<MarkdownDocument | null>(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [source, setSource] = useState(false); const [revision, setRevision] = useState(0);
  const article = useRef<HTMLElement>(null);
  const anchor = (id: string) => {
    const heading = Array.from(article.current?.querySelectorAll('[id]') || []).find(el => el.id === `piko-document-${id}`);
    heading?.scrollIntoView({ block: 'start' });
  };
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(''); setDocument(null); setSource(false);
    void workroomRequest({ op: 'preview-markdown', conversationId, path: target.path }).then(result => {
      if (cancelled) return;
      if (!result.document) throw new Error(t('文档预览服务尚未就绪，请更新并重新打开 Piko。', 'Please update and reopen Piko to preview documents.'));
      setDocument(result.document);
    }).catch(e => { if (!cancelled) setError(e.message); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [conversationId, target.path, revision]);
  useEffect(() => {
    if (document && !source) {
      article.current?.scrollIntoView({ block: 'start' });
      if (target.fragment) anchor(target.fragment);
    }
  }, [document, target.fragment, source]);
  const openFile = (file: string, nextFragment: string) => {
    if (isMarkdownArtifact(file)) {
      setHistory(previous => [...previous, { path: file, fragment: nextFragment }]);
    } else {
      void workroomRequest({ op: 'open-file', conversationId, path: file }).catch(e => setError(e.message));
    }
  };
  return <TermModal open title={t('文档预览', 'Document preview')} onClose={onClose} maxWidth={1000} zIndex={150} className={s.modal}>
    <div className={s.toolbar}>
      <div className={s.fileInfo}><FileText size={23} /><div><strong>{document?.name || target.path.split(/[/\\]/).pop()}</strong><p title={document?.path || target.path}>{document?.path || target.path}</p></div></div>
      <div className={s.actions}>
        {history.length > 1 && <button onClick={() => setHistory(previous => previous.slice(0, -1))} aria-label={t('返回上一份文档', 'Previous document')}><ArrowLeft size={16} /></button>}
        <button disabled={loading} onClick={() => setRevision(value => value + 1)} aria-label={t('重新读取文档', 'Reload document')}><RefreshCw size={16} /></button>
        <div className={s.tabs} role="group" aria-label={t('阅读方式', 'Reading mode')}><button aria-pressed={!source} onClick={() => setSource(false)}>{t('正文', 'Read')}</button><button aria-pressed={source} onClick={() => setSource(true)}>{t('源码', 'Source')}</button></div>
      </div>
    </div>
    {loading ? <p className={s.state} role="status">{t('正在读取文档…', 'Loading document…')}</p> : error ? <div className={s.state} role="alert"><p>{error}</p><button onClick={() => setRevision(value => value + 1)}>{t('重试', 'Retry')}</button></div> : document && <article ref={article} className={s.article} aria-label={t('文档内容', 'Document content')}>
      {!document.content.trim() ? <p className={s.state}>{t('这份文档还是空的。', 'This document is empty.')}</p> : source ? <pre className={s.source}>{document.content}</pre> : <DocumentMarkdown text={document.content} path={document.path} onFile={openFile} onAnchor={anchor} />}
    </article>}
  </TermModal>;
}
