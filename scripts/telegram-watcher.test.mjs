import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { archiveInbox, createWatcher, readOneInbox } from './telegram-watcher.mjs';
import { createControlSupervisor } from './telegram-control.mjs';

const SECRET_PAYLOAD = 'SECRET_PAYLOAD';
const SECRET_TOKEN = 'super-secret-token';
const SECRET_CHAT = '987654';

async function makeTempDir(t) {
  const dir = await mkdtemp(join(tmpdir(), 'telegram-watcher-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, 'inbox'), { recursive: true });
  await mkdir(join(dir, 'outbox'), { recursive: true });
  return dir;
}

async function seedInbox(dir, name, payload = {}) {
  await writeFile(join(dir, 'inbox', name), `${JSON.stringify({
    id: Number(name.replace('.json', '')),
    chatId: Number(SECRET_CHAT),
    text: `/cmd ${SECRET_PAYLOAD}`,
    command: 'cmd',
    args: SECRET_PAYLOAD,
    receivedAt: '2026-11-28T00:00:00.000Z',
    ...payload,
  })}\n`);
}

test('watch báo tín hiệu theo thứ tự, dedupe, không lộ nội dung lệnh', async (t) => {
  const dir = await makeTempDir(t);
  await seedInbox(dir, '101.json');
  await seedInbox(dir, '102.json');
  const signals = [];
  const logs = [];
  const controller = new AbortController();
  let tick = 0;
  const watcher = createWatcher({
    dir,
    signal: controller.signal,
    sleep: async () => {
      tick += 1;
      if (tick >= 2) controller.abort();
    },
    log: (line) => logs.push(line),
    onSignal: (name) => signals.push(name),
  });

  await watcher.run();
  assert.deepEqual(signals, ['101.json', '102.json']);
  assert.equal(new Set(signals).size, 2);
  const joined = `${signals.join('\n')}\n${logs.join('\n')}`;
  for (const secret of [SECRET_PAYLOAD, SECRET_TOKEN, SECRET_CHAT]) {
    assert.equal(joined.includes(secret), false);
  }
});

test('abort trong sleep resolve run(), không signal thêm', async (t) => {
  const dir = await makeTempDir(t);
  const controller = new AbortController();
  const signals = [];
  const watcher = createWatcher({
    dir,
    signal: controller.signal,
    sleep: async () => controller.abort(),
    log: () => {},
    onSignal: (name) => signals.push(name),
  });
  await watcher.run();
  assert.deepEqual(signals, []);
});

test('restart báo lại file inbox còn tồn tại', async (t) => {
  const dir = await makeTempDir(t);
  await seedInbox(dir, '103.json');
  const first = [];
  const second = [];
  for (const sink of [first, second]) {
    const controller = new AbortController();
    let tick = 0;
    await createWatcher({
      dir,
      signal: controller.signal,
      sleep: async () => {
        tick += 1;
        if (tick >= 2) controller.abort();
      },
      log: () => {},
      onSignal: (name) => sink.push(name),
    }).run();
  }
  assert.deepEqual(first, ['103.json']);
  assert.deepEqual(second, ['103.json']);
});

test('readOneInbox trả object đúng, không move file; rỗng -> null', async (t) => {
  const dir = await makeTempDir(t);
  await seedInbox(dir, '101.json');
  const expected = {
    id: 101,
    chatId: Number(SECRET_CHAT),
    text: `/cmd ${SECRET_PAYLOAD}`,
    command: 'cmd',
    args: SECRET_PAYLOAD,
    receivedAt: '2026-11-28T00:00:00.000Z',
  };
  assert.deepEqual(await readOneInbox({ dir }), expected);
  assert.deepEqual(await readdir(join(dir, 'inbox')), ['101.json']);

  await writeFile(join(dir, 'inbox', '100.json'), JSON.stringify({ id: 100 }));
  assert.deepEqual(await readOneInbox({ dir }), { id: 100 });

  await rm(join(dir, 'inbox'), { recursive: true });
  assert.equal(await readOneInbox({ dir }), null);
});

test('archive chặn khi thiếu outbox, Sau đó move và idempotent', async (t) => {
  const dir = await makeTempDir(t);
  await seedInbox(dir, '101.json');
  await assert.rejects(archiveInbox({ dir, id: '101', log: () => {} }), /Chưa có outbox cho 101/);
  assert.equal((await readdir(join(dir, 'inbox'))).includes('101.json'), true);

  const report = { id: 101, chatId: Number(SECRET_CHAT), text: 'done' };
  await writeFile(join(dir, 'outbox', '101.json'), JSON.stringify(report));
  const logs = [];
  await archiveInbox({ dir, id: '101', log: (line) => logs.push(line) });
  assert.equal((await readdir(join(dir, 'archive'))).includes('101.json'), true);
  assert.equal((await readdir(join(dir, 'inbox'))).includes('101.json'), false);
  assert.deepEqual(JSON.parse(await readFile(join(dir, 'outbox', '101.json'), 'utf8')), report);
  await archiveInbox({ dir, id: '101', log: (line) => logs.push(line) });
  assert.match(logs.join('\n'), /archive 101 ok/);
});

test('archive chặn traversal và tên lạ, không đụng filesystem ngoài temp dir', async (t) => {
  const dir = await makeTempDir(t);
  for (const id of ['../../etc/passwd', '1.json', '', '../1']) {
    await assert.rejects(archiveInbox({ dir, id, log: () => {} }), /ID inbox không hợp lệ/);
  }
  assert.deepEqual(await readdir(join(dir, 'archive')).catch(() => []), []);
});

test('archive --force bỏ qua outbox khi session không phản hồi', async (t) => {
  const dir = await makeTempDir(t);
  await seedInbox(dir, '104.json');
  await archiveInbox({ dir, id: '104', force: true, log: () => {} });
  assert.equal((await readdir(join(dir, 'archive'))).includes('104.json'), true);
});

test('watcher không tự cắt/sửa outbox >4000 ký tự', async (t) => {
  const dir = await makeTempDir(t);
  const longText = 'x'.repeat(4100);
  await seedInbox(dir, '105.json');
  await writeFile(join(dir, 'outbox', '105.json'), JSON.stringify({ id: 105, chatId: 11, text: longText }));
  await archiveInbox({ dir, id: '105', log: () => {} });
  assert.equal(JSON.parse(await readFile(join(dir, 'outbox', '105.json'), 'utf8')).text, longText);
  assert.equal((await readdir(join(dir, 'archive'))).includes('105.json'), true);
});

function fakeChild() {
  const child = new EventEmitter();
  child.stdin = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  const kills = [];
  child.kill = (signal) => { kills.push(signal); return true; };
  child.kills = kills;
  return child;
}

test('supervisor spawn 2 con, shell:false, argv đúng; stop() kill cả 2', () => {
  const calls = [];
  const children = [fakeChild(), fakeChild()];
  const supervisor = createControlSupervisor({
    spawnImpl: (command, args, options) => {
      calls.push({ command, args, options });
      return children[calls.length - 1];
    },
    scriptDir: '/tmp/telegram-control-test',
    log: () => {},
  });
  const handle = supervisor.start();
  assert.equal(calls.length, 2);
  assert.equal(calls[0].command, process.execPath);
  assert.equal(calls[0].options.shell, false);
  assert.equal(calls[0].options.stdio, 'inherit');
  assert.ok(calls[0].args[0].endsWith('telegram-bridge.mjs'));
  assert.ok(calls[1].args[0].endsWith('telegram-watcher.mjs'));
  assert.deepEqual(calls[1].args.slice(1), ['watch']);
  handle.stop();
  assert.deepEqual(children[0].kills, ['SIGTERM']);
  assert.deepEqual(children[1].kills, ['SIGTERM']);
  handle.stop();
  assert.equal(children[0].kills.length, 1);
});

test('supervisor: một con exit code 1 -> kill con kia, exitCode = 1', () => {
  const children = [fakeChild(), fakeChild()];
  const supervisor = createControlSupervisor({
    spawnImpl: () => children[supervisorCallCount++],
    scriptDir: '/tmp/telegram-control-test',
    log: () => {},
  });
  let supervisorCallCount = 0;
  supervisor.start();
  children[0].emit('exit', 1);
  assert.equal(supervisor.exitCode, 1);
  assert.equal(process.exitCode, 1);
  assert.deepEqual(children[1].kills, ['SIGTERM']);
  process.exitCode = 0;
});
