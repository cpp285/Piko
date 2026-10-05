import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Check the Git index (what will be committed), not just the working tree.
// This catches forced additions that bypass .gitignore. It is a focused guard,
// not a replacement for reviewing the diff or a general-purpose secret scanner.
export function publicFileIssues(name, content, mode = '100644') {
  const issues = [];
  if (mode === '120000') issues.push('symbolic link: inspect its target before publishing');
  if (/(^|\/)(?:\.review-runtime|\.piko(?:-dev)?|node_modules|runtime|knowledge|skills|知识库|技能)(\/|$)/i.test(name)
      || /^(?:data\/|QA_.*\.md$|config\.json$)/i.test(name)
      || /(^|\/)(?:conversations|session-tokens|agent-sessions|chat-history)\.json$/i.test(name)
      || /(^|\/)(?:SKILL|IDENTITY|SOUL)\.md$/i.test(name)
      || /\.(?:jsonl|log|dmg|p12|pfx|key)$/i.test(name) || /\.app\//i.test(name)
      || /(^|\/)\.env(?:\.(?!example$)[^/]+)?$/i.test(name)) {
    issues.push('private resource, runtime data or local build artifact');
  }
  const text = content.toString('utf8');
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)
      || /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|sk-(?:proj-|ant-)?[A-Za-z0-9_-]{35,})\b/.test(text)) {
    issues.push('possible credential');
  }
  if (/\.json$/i.test(name)) {
    try {
      const data = JSON.parse(text);
      if (data && Array.isArray(data.conversations) && data.settings && data.schedules) issues.push('exported personal workspace');
    } catch { /* non-JSON or binary content is reviewed separately */ }
  }
  return issues;
}

export function checkPublicIndex(cwd = process.cwd()) {
  const entries = execFileSync('git', ['ls-files', '--stage', '-z'], { cwd }).toString().split('\0').filter(Boolean).map(row => {
    const match = /^(\d+) ([a-f0-9]+) (\d)\t([\s\S]+)$/.exec(row);
    if (!match) throw new Error('Cannot parse Git index');
    return { mode: match[1], oid: match[2], stage: match[3], name: match[4] };
  });
  const issues = [];
  const blobs = new Map();
  for (const entry of entries) {
    if (entry.stage !== '0' || entry.mode === '160000') { issues.push({ file: entry.name, reason: 'unmerged entry or submodule requires review' }); continue; }
    if (!blobs.has(entry.oid)) blobs.set(entry.oid, execFileSync('git', ['cat-file', 'blob', entry.oid], { cwd, maxBuffer: 64 * 1024 * 1024 }));
    for (const reason of publicFileIssues(entry.name, blobs.get(entry.oid), entry.mode)) issues.push({ file: entry.name, reason });
  }
  return { files: entries.length, issues };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = checkPublicIndex();
    if (result.issues.length) {
      for (const item of result.issues) console.error(`${item.file}: ${item.reason}`);
      console.error('Public-file check failed. Keep private files locally and remove them from the index.');
      process.exitCode = 1;
    } else console.log(`Public-file check passed for ${result.files} staged source files.`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
