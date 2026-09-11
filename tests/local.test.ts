import { spawn, ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { once } from 'node:events';
import { expect, test } from 'vitest';
const entry = resolve('server/local.ts');
async function start(directory: string) {
  const child = spawn(process.execPath, ['--import', import.meta.resolve('tsx'), entry], {
    cwd: directory,
    env: { ...process.env, DIME_ENV: 'local', NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise<void>((ready, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('Local server startup timeout'));
    }, 5000);
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', () => {
      clearTimeout(timeout);
      reject(new Error('Local server exited before readiness'));
    });
    child.stdout.on('data', (chunk) => {
      if (String(chunk).includes('local-only API')) {
        clearTimeout(timeout);
        ready();
      }
    });
  });
  return child;
}
async function stop(child: ChildProcess) {
  if (child.exitCode !== null) return;
  const exited = once(child, 'exit');
  child.kill();
  await exited;
}
test('file-backed local API preserves state and retry receipts across process restart', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'dime-local-test-'));
  let child: ChildProcess | undefined;
  try {
    child = await start(directory);
    const state = await fetch('http://127.0.0.1:8787/state').then((r) => r.json());
    expect(state.state.wallet).toBe(0);
    const request = {
      requestId: crypto.randomUUID(),
      expectedRevision: 0,
      action: { type: 'travel', ship: 'Nomad', destination: 'Lyria', loadRoc: false },
    };
    const send = () =>
      fetch('http://127.0.0.1:8787/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:5173' },
        body: JSON.stringify(request),
      }).then((r) => r.json());
    const first = await send();
    expect(first.state.revision).toBe(1);
    await stop(child);
    child = await start(directory);
    const replay = await send();
    expect(replay.replayed).toBe(true);
    expect(replay.state).toEqual(first.state);
    const rejected = await fetch('http://127.0.0.1:8787/state', {
      headers: { Origin: 'https://untrusted.example' },
    });
    expect(rejected.status).toBe(403);
  } finally {
    if (child) await stop(child);
    await rm(directory, { recursive: true, force: true });
  }
}, 15000);
test('local server refuses production mode before opening a listener', async () => {
  const child = spawn(process.execPath, ['--import', import.meta.resolve('tsx'), entry], {
    env: { ...process.env, DIME_ENV: 'local', NODE_ENV: 'production' },
    stdio: 'ignore',
  });
  const [code] = await once(child, 'exit');
  expect(code).not.toBe(0);
});
