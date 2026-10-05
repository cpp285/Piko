import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { isMarkdownArtifact, workroomArtifactPath } from '@piko/shared';
import { documentFileLink, documentFragment } from '../../../../lib/document-links';
import DocumentMarkdown from '../DocumentMarkdown';

test('document links keep Chinese paths, relative documents and fragments without mistaking websites for files', () => {
  assert.equal(workroomArtifactPath('file:///Users/me/中文%20稿件.MD#第一章'), '/Users/me/中文 稿件.MD');
  assert.equal(workroomArtifactPath('文章.markdown:42'), '文章.markdown');
  assert.equal(documentFileLink('../附录/来源.md#资料', '/Users/me/文章/正文.md'), '/Users/me/文章/../附录/来源.md');
  assert.equal(documentFragment('正文.md#%E7%AC%AC%E4%B8%80%E7%AB%A0'), '第一章');
  assert.equal(documentFileLink('https://example.com/a.md', '/tmp/main.md'), undefined);
  assert.equal(documentFileLink('javascript:alert(1)', '/tmp/main.md'), undefined);
  assert.equal(isMarkdownArtifact('/tmp/REPORT.MD'), true);
  assert.equal(isMarkdownArtifact('/tmp/report.html'), false);
});

test('document reader renders article structures and inert untrusted content', () => {
  const html = renderToStaticMarkup(createElement(DocumentMarkdown, {
    path: '/tmp/正文.md', onFile: () => {}, onAnchor: () => {},
    text: '# 第一章\n\n[目录](#第一章)\n\n## 重复标题\n\n## 重复标题\n\n| 项目 | 结果 |\n| --- | --- |\n| A | 通过 |\n\n- 列表\n\n```js\nconst a = 1;\n```\n\n[来源](https://example.com) [附录](./附录.md) [坏链接](javascript:alert%281%29)\n\n<script>window.hacked = true</script>\n\n![追踪图](https://example.com/tracker.png)',
  }));
  assert.match(html, /id="piko-document-第一章"/);
  assert.match(html, /id="piko-document-重复标题-1"/);
  assert.match(html, /<table>/); assert.match(html, /<ul>/); assert.match(html, /language-js/);
  assert.match(html, /href="\.\/%E9%99%84%E5%BD%95.md"/);
  assert.doesNotMatch(html, /<script|<img|href="javascript:|window.hacked/);
});
