import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { checkPublicIndex, publicFileIssues } from './check-public-files.mjs';

test('personal exports and skills are blocked while product code and examples are allowed', () => {
  for (const name of ['runtime/data/a.md', 'knowledge/brief.md', '资料/SKILL.md', 'agent/SOUL.md', '.review-runtime/report.json', 'backup/conversations.json', 'secret.env/.env.production', 'Piko.app/a']) {
    assert.ok(publicFileIssues(name, Buffer.from('example')).length, name);
  }
  for (const name of ['apps/web/src/lib/resource-upload.ts', 'apps/gateway/.env.example', 'packages/orchestrator/agents/product-manager.md', 'README.md']) {
    assert.deepEqual(publicFileIssues(name, Buffer.from('example')), [], name);
  }
  assert.ok(publicFileIssues('export.json', Buffer.from(JSON.stringify({ conversations: [], settings: {}, schedules: {} }))).length);
  assert.ok(publicFileIssues('notes.txt', Buffer.from('ghp_' + 'a'.repeat(36))).length);
});

test('inspection reads staged content even if the working copy was sanitized afterwards', t => {
  const cwd = mkdtempSync(path.join(tmpdir(), 'piko-public-index-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, stdio: 'pipe' });
  git('init', '-q');
  writeFileSync(path.join(cwd, 'notes.txt'), 'ghp_' + 'b'.repeat(36)); git('add', 'notes.txt');
  writeFileSync(path.join(cwd, 'notes.txt'), 'safe working copy');
  assert.equal(checkPublicIndex(cwd).issues.length, 1);
  git('add', 'notes.txt'); assert.equal(checkPublicIndex(cwd).issues.length, 0);
});
