import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test('Pi detection accepts numeric version output but rejects unrelated commands named pi', { skip: process.platform === 'win32', timeout: 30000 }, t => {
  const bin = mkdtempSync(path.join(tmpdir(), 'piko-pi-probe-'));
  t.after(() => rmSync(bin, { recursive: true, force: true }));
  const probe = () => execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', 'import {detectBackends} from "./src/backends.ts"; console.log("PI_RESULT=" + detectBackends().includes("pi"))'], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)), encoding: 'utf8', timeout: 12000,
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH || ''}` },
  });
  writeFileSync(path.join(bin, 'pi'), '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "0.84.2"; else echo "pi - AI coding assistant with read, bash, edit, write tools"; fi\n', { mode: 0o755 });
  assert.match(probe(), /PI_RESULT=true/);
  writeFileSync(path.join(bin, 'pi'), '#!/bin/sh\necho "pi mathematical constant calculator"\n', { mode: 0o755 });
  assert.match(probe(), /PI_RESULT=false/);
});
