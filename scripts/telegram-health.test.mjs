import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  checkHealth,
  classifyProcesses,
  createHealthWatcher,
  resolveHealthDir,
} from './telegram-health.mjs';

const SECRET_TOKEN = 'super-secret-token';
const SECRET_CHAT = '987654';

async function makeTempDir(t) {
  const dir = await mkdtemp(join(tmpdir(), 'telegram-health-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

const psBoth = () => [
  ' 100 /usr/bin/node /repo/scripts/telegram-bridge.mjs',
  ' 101 /usr/bin/node /repo/scripts/telegram-watcher.mjs watch',
].join('\n');

const psNoSecrets = (text) => text
  .split('\n')
  .filter((line) => !line.includes('telegram-health.mjs') && !line.includes('telegram-health.test.mjs'))
  .join('\n');

test('classifyProcesses nhận diện bridge + watcher, bỏ chính process health', () => {
  const output = [
    `${process.pid} /usr/bin/node /repo/scripts/telegram-health.mjs check`,
    ' 100 /usr/bin/node /repo/scripts/telegram-bridge.mjs',
    ' 101 /usr/bin/node /repo/scripts/telegram-watcher.mjs watch',
  ].join('\n');
  assert.deepEqual(classifyProcesses(output), { bridge: true, watcher: true });
});

test('checkHealth đủ 2 process -> healthy, xoá alert cũ', async (t) => {
  const dir = await makeTempDir(t);
  const alertPath = join(dir, 'health-alert.json');
  await writeFile(alertPath, '{"status":"unhealthy"}');
  const result = await checkHealth({ psImpl: psBoth, dir });
  assert.deepEqual(result, { bridge: true, watcher: true, healthy: true });
  assert.deepEqual(await readdir(dir), []);
});

test('checkHealth thiếu watcher -> unhealthy + alert atomic', async (t) => {
  const dir = await makeTempDir(t);
  const result = await checkHealth({
    psImpl: () => ' 100 /usr/bin/node /repo/scripts/telegram-bridge.mjs',
    dir,
    now: () => '2026-11-28T00:00:00.000Z',
  });
  assert.deepEqual(result, { bridge: true, watcher: false, healthy: false });
  const alert = JSON.parse(await readFile(join(dir, 'health-alert.json'), 'utf8'));
  assert.deepEqual(alert, { status: 'unhealthy', checkedAt: '2026-11-28T00:00:00.000Z' });
  assert.deepEqual(await readdir(dir), ['health-alert.json']);
});

test('checkHealth thiếu bridge -> unhealthy + alert', async (t) => {
  const dir = await makeTempDir(t);
  const result = await checkHealth({
    psImpl: () => ' 101 /usr/bin/node /repo/scripts/telegram-watcher.mjs watch',
    dir,
  });
  assert.deepEqual(result, { bridge: false, watcher: true, healthy: false });
  assert.deepEqual(Object.keys(JSON.parse(await readFile(join(dir, 'health-alert.json'), 'utf8'))).sort(), [
    'checkedAt',
    'status',
  ]);
});

test('checkHealth psImpl lỗi/đầu ra lạ -> unhealthy, không token/chat ID lộ vào alert', async (t) => {
  const dir = await makeTempDir(t);
  const result = await checkHealth({
    psImpl: () => { throw new Error('ps unavailable'); },
    dir,
    now: () => '2026-11-28T00:00:00.000Z',
  });
  assert.deepEqual(result, { bridge: false, watcher: false, healthy: false });
  const alertText = await readFile(join(dir, 'health-alert.json'), 'utf8');
  const output = psNoSecrets(psBoth());
  assert.equal(output.includes(SECRET_TOKEN), false);
  assert.equal(output.includes(SECRET_CHAT), false);
  for (const secret of [SECRET_TOKEN, SECRET_CHAT, 'token', 'chat']) {
    assert.equal(alertText.includes(secret), false);
  }
});

test('watch mode chạy nhiều tick rồi dừng graceful qua signal, không spawn process', async (t) => {
  const dir = await makeTempDir(t);
  const controller = new AbortController();
  const results = [];
  let ticks = 0;
  let spawned = 0;
  const watcher = createHealthWatcher({
    psImpl: (command) => {
      spawned += 1;
      assert.equal(command, 'ps');
      return psBoth();
    },
    dir,
    signal: controller.signal,
    intervalMs: 1,
    sleep: async () => {
      ticks += 1;
      if (ticks >= 3) controller.abort();
    },
    emit: (value) => results.push(value),
    log: () => {},
  });

  await watcher.run();
  assert.equal(spawned, 3);
  assert.equal(results.length, 3);
  assert.deepEqual(results.at(-1), { bridge: true, watcher: true, healthy: true });
  assert.deepEqual(await readdir(dir), []);
  watcher.stop();
  assert.equal(spawned, 3);
});

test('resolveHealthDir ưu tiên TELEGRAM_BRIDGE_DIR', () => {
  assert.equal(resolveHealthDir({ env: { TELEGRAM_BRIDGE_DIR: ' /tmp/custom-health ' }, home: '/home/test' }), '/tmp/custom-health');
  assert.equal(resolveHealthDir({ env: {}, home: '/home/test' }), join('/home/test', '.taskmate', 'telegram-bridge'));
});
