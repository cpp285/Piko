import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkReadableEmphasis from '../../../../lib/remark-readable-emphasis';

const render = (text: string) => renderToStaticMarkup(createElement(ReactMarkdown, {
  remarkPlugins: [remarkGfm, remarkReadableEmphasis], children: text,
}));

test('historical Chinese chat labels do not leak emphasis delimiters around punctuation and spaces', () => {
  const text = '- **开头流失明显： **优先测试前 3 秒直接展示 AI 实测结果，再解释原理。\n'
    + '- **观看表现尚可、收藏偏少： **测试加入可照做的步骤或核验清单。\n'
    + '- **某类选题连续表现更好： **围绕同一需求连拍。';
  const html = render(text);
  assert.doesNotMatch(html, /\*\*/);
  assert.equal((html.match(/<strong>/g) || []).length, 3);
  assert.match(html, /开头流失明显： <\/strong>优先测试前 3 秒/);
  assert.doesNotMatch(render('**你可以这样借鉴：**一条视频只解释一个问题。'), /\*\*/);
  assert.match(render('**前 3 秒**直接展示结果。'), /<strong>前 3 秒<\/strong>直接/);
});

test('code, explicit literal Markdown, mathematics and unfinished markers retain their content', () => {
  const html = render('`**中文： **`\n\n```js\nconst text = "**原文： **";\nconst power = 2 ** 3;\n```\n\n\\*\\*示例： \\*\\*\n\n2 ** 3\n\n**尚未完成');
  assert.match(html, /<code>\*\*中文： \*\*<\/code>/);
  assert.match(html, /const text = &quot;\*\*原文： \*\*&quot;/);
  assert.match(html, /<p>\*\*示例： \*\*<\/p>/);
  assert.match(html, /<p>2 \*\* 3<\/p>/);
  assert.match(html, /<p>\*\*尚未完成<\/p>/);
});

test('requested tables, links and unsafe URL filtering still work with readable emphasis', () => {
  const html = render('| 项目 | 说明 |\n|---|---|\n| **候选时段： ** | [资料](https://example.com/a?q=1) |\n\n[危险链接](javascript:alert%281%29)');
  assert.match(html, /<table>/);
  assert.equal((html.match(/<th>/g) || []).length, 2);
  assert.match(html, /<td><strong>候选时段： <\/strong><\/td>/);
  assert.match(html, /href="https:\/\/example.com\/a\?q=1"/);
  assert.doesNotMatch(html, /href="javascript:/);
});
