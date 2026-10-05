'use client';
import React from 'react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { workroomArtifactPath } from '@piko/shared';
import remarkReadableEmphasis from '../../../lib/remark-readable-emphasis';
import { documentFragment, documentFileLink, remarkDocumentHeadings } from '../../../lib/document-links';

export default function DocumentMarkdown({ text, path, onFile, onAnchor }: {
  text: string; path: string; onFile: (path: string, fragment: string) => void; onAnchor: (fragment: string) => void;
}) {
  return <ReactMarkdown remarkPlugins={[remarkGfm, remarkReadableEmphasis, remarkDocumentHeadings]} skipHtml
    urlTransform={url => workroomArtifactPath(url) ? url : defaultUrlTransform(url)}
    components={{
      table: ({ node, ...props }) => <div style={{ overflowX: 'auto' }} tabIndex={0} role="region" aria-label="文档表格"><table {...props} /></div>,
      img: ({ alt }) => <span className="document-image-description">{alt || '图片'}</span>,
      a: ({ href, children }) => {
        if (!href) return <span>{children}</span>;
        const file = documentFileLink(href, path);
        if (href.startsWith('#') || file) return <a href={href} onClick={event => {
          event.preventDefault();
          if (file) onFile(file, documentFragment(href)); else onAnchor(documentFragment(href));
        }}>{children}</a>;
        return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
      },
    }}>{text}</ReactMarkdown>;
}
