// Run the packaged runtime outside the repository with no tasks, accounts or shared profile.
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const sidecar = path.resolve(process.argv[2]);
const profile = mkdtempSync(path.join(tmpdir(), 'piko-package-check-'));
const projects = path.join(profile, 'projects');
mkdirSync(projects);
writeFileSync(path.join(profile, 'config.json'), JSON.stringify({ defaultBackend: 'codex', sandboxMode: 'safe', worktreeEnabled: false }));
const child = spawn(path.join(sidecar, 'node'), [path.join(sidecar, 'gateway.js')], {
  cwd: projects, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, NODE_ENV: 'production', NO_OPEN: '1', WS_PORT: '0', GATEWAY_ID: 'package-test',
    WEB_DIR: path.join(sidecar, 'web'), WORKSPACE: projects, PIKO_CONFIG_DIR: profile,
    PIKO_DESKTOP: '1', PIKO_SKIP_AGENT_SYNC: '1', PIKO_DISABLE_PROCESS_SCAN: '1',
    FEISHU_ENABLED: 'false', ABLY_API_KEY: '', TELEGRAM_BOT_TOKEN: '', TELEGRAM_BOT_TOKENS: '', TUNNEL_TOKEN: '',
  },
});
// Subscribe before checking readiness: a signal can end the process before cleanup.
const closed = new Promise(resolve => child.once('close', resolve));
let output = '', errors = '';
child.stdout.on('data', data => { output = (output + data).slice(-20000); });
child.stderr.on('data', data => { errors = (errors + data).slice(-3000); });
let spawnError;
child.once('error', error => { spawnError = error; });
try {
  const deadline = Date.now() + 20000;
  let port;
  while (Date.now() < deadline) {
    if (spawnError) throw spawnError;
    assert.equal(child.exitCode, null, `Bundled service exited: ${errors}`);
    assert.equal(child.signalCode, null, `Bundled service terminated by ${child.signalCode}: ${errors}`);
    const match = output.match(/^GATEWAY_READY (.+)$/m);
    if (match) { port = JSON.parse(match[1]).port; break; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(port > 0, `Bundled service did not start: ${errors}`);
  const connection = await fetch(`http://127.0.0.1:${port}/connect`, { signal: AbortSignal.timeout(3000) }).then(r => r.json());
  assert.equal(connection.gatewayId, 'package-test');
  assert.ok(connection.sessionToken);
  const response = await fetch(`http://127.0.0.1:${port}/pair/`, { signal: AbortSignal.timeout(3000) });
  assert.equal(response.status, 200);
  assert.ok((await response.text()).includes('Piko'));
  console.log('安装包启动检查通过：运行环境、本地连接、界面资源。');
} finally {
  if (child.pid && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
    await closed;
    clearTimeout(timer);
  }
  rmSync(profile, { recursive: true, force: true });
}
