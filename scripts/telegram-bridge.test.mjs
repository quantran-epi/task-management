import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { createTelegramBridge, resolveConfig } from './telegram-bridge.mjs';

const TOKEN = 'test-token';
const ALLOWED = 11;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function scriptedFetch(responses, calls) {
  return async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses.shift();
    if (!next) throw new Error('fetch queue exhausted');
    return typeof next === 'function' ? next(url, init) : next;
  };
}

async function makeTempDir(t) {
  const dir = await mkdtemp(join(tmpdir(), 'telegram-bridge-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

async function makeConfig(dir, chatIds = String(ALLOWED)) {
  return resolveConfig({
    env: {
      TELEGRAM_BRIDGE_BOT_TOKEN: TOKEN,
      TELEGRAM_BRIDGE_ALLOWED_CHAT_IDS: chatIds,
      TELEGRAM_BRIDGE_DIR: dir,
    },
    home: dir,
  });
}

async function readInbox(dir) {
  const names = await readdir(join(dir, 'inbox')).catch(() => []);
  const rows = [];
  for (const name of names.filter((n) => n.endsWith('.json'))) {
    rows.push(JSON.parse(await readFile(join(dir, 'inbox', name), 'utf8')));
  }
  return rows;
}

async function readState(dir) {
  return JSON.parse(await readFile(join(dir, 'state.json'), 'utf8'));
}

function update(id, chatId, text, isBot = false) {
  return {
    update_id: id,
    message: {
      text,
      chat: { id: chatId },
      from: { id: chatId, is_bot: isBot },
    },
  };
}

test('resolveConfig fail-closed khi thiếu token, không gọi fetch', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'telegram-bridge-'));
  try {
    const originalFetch = globalThis.fetch;
    let fetchCount = 0;
    globalThis.fetch = () => {
      fetchCount += 1;
      return jsonResponse({ ok: true });
    };
    try {
      await assert.rejects(
        resolveConfig({ env: { TELEGRAM_BRIDGE_DIR: dir }, home: dir }),
        (error) => {
          assert.match(error.message, /token/i);
          assert.equal(error.message.includes(TOKEN), false);
          return true;
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
    assert.equal(fetchCount, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('resolveConfig đọc token và whitelist từ file config ngoài repo', async (t) => {
  const dir = await makeTempDir(t);
  const configPath = join(dir, 'local-config.json');
  await writeFile(configPath, JSON.stringify({ botToken: 'file-token', allowedChatIds: [22] }));

  const config = await resolveConfig({
    env: { TELEGRAM_BRIDGE_CONFIG: configPath, TELEGRAM_BRIDGE_DIR: dir },
    home: dir,
  });

  assert.equal(config.botToken, 'file-token');
  assert.deepEqual([...config.allowedChatIds], [22]);
  assert.equal(config.dir, dir);
});

test('resolveConfig ép whitelist env thành số nguyên dương, chặn rỗng', async (t) => {
  const dir = await makeTempDir(t);
  const config = await resolveConfig({
    env: {
      TELEGRAM_BRIDGE_BOT_TOKEN: TOKEN,
      TELEGRAM_BRIDGE_ALLOWED_CHAT_IDS: '11, 22, 0, -3, abc',
      TELEGRAM_BRIDGE_DIR: dir,
    },
    home: dir,
  });
  assert.deepEqual([...config.allowedChatIds], [11, 22]);

  await assert.rejects(
    resolveConfig({
      env: {
        TELEGRAM_BRIDGE_BOT_TOKEN: TOKEN,
        TELEGRAM_BRIDGE_ALLOWED_CHAT_IDS: '0, abc',
        TELEGRAM_BRIDGE_DIR: dir,
      },
      home: dir,
    }),
    /whitelist/i,
  );
});

test('chat ngoài whitelist và bot bị bỏ, chat hợp lệ ghi inbox rồi lưu offset', async (t) => {
  const dir = await makeTempDir(t);
  const config = await makeConfig(dir);
  const calls = [];
  const responses = [
    jsonResponse({ result: [{ update_id: 100 }] }),
    jsonResponse({
      result: [
        update(101, 99, '/start'),
        update(102, ALLOWED, '/status now', true),
        update(103, ALLOWED, '/status now'),
      ],
    }),
    jsonResponse({ ok: false }, 409),
  ];
  const logs = [];
  const bridge = createTelegramBridge({
    fetchImpl: scriptedFetch(responses, calls),
    config,
    dir,
    sleep: async () => true,
    log: (line) => logs.push(line),
  });

  await bridge.run();

  const inbox = await readInbox(dir);
  assert.equal(inbox.length, 1);
  assert.equal(inbox[0].id, 103);
  assert.equal(inbox[0].chatId, ALLOWED);
  assert.equal(inbox[0].text, '/status now');
  assert.equal(inbox[0].command, 'status');
  assert.equal(inbox[0].args, 'now');
  assert.match(inbox[0].receivedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(await readState(dir), { offset: 104 });
  assert.match(logs.join('\n'), /409/);
});

test('update_id lặp trong cùng batch chỉ xử lý một lần', async (t) => {
  const dir = await makeTempDir(t);
  const calls = [];
  const responses = [
    jsonResponse({ result: [{ update_id: 10 }] }),
    jsonResponse({
      result: [update(11, ALLOWED, '/a'), update(11, ALLOWED, '/b'), update(12, ALLOWED, '/c')],
    }),
    jsonResponse({ ok: false }, 409),
  ];
  const bridge = createTelegramBridge({
    fetchImpl: scriptedFetch(responses, calls),
    config: await makeConfig(dir),
    dir,
    sleep: async () => true,
    log: () => {},
  });

  await bridge.run();

  const inbox = await readInbox(dir);
  assert.deepEqual(inbox.map((row) => row.command), ['a', 'c']);
  assert.deepEqual(await readState(dir), { offset: 13 });
});

test('bootstrap bỏ backlog cũ, không replay sau khi chạy lại', async (t) => {
  const dir = await makeTempDir(t);
  const calls = [];
  const responses = [
    jsonResponse({ result: [{ update_id: 5 }, { update_id: 7 }, { update_id: 9 }] }),
    jsonResponse({ result: [update(3, ALLOWED, '/old'), update(10, ALLOWED, '/new')] }),
    jsonResponse({ ok: false }, 409),
  ];
  const bridge = createTelegramBridge({
    fetchImpl: scriptedFetch(responses, calls),
    config: await makeConfig(dir),
    dir,
    sleep: async () => true,
    log: () => {},
  });

  await bridge.run();

  const inbox = await readInbox(dir);
  assert.deepEqual(inbox.map((row) => row.id), [10]);
  assert.deepEqual(await readState(dir), { offset: 11 });
  assert.equal(calls[0].url.includes('limit=100'), true);
  assert.equal(calls[0].url.includes('offset='), false);
  assert.equal(calls[1].url.includes('offset=10'), true);
  assert.equal(calls[1].url.includes('timeout=10'), true);

  const calls2 = [];
  const responses2 = [
    jsonResponse({ result: [update(10, ALLOWED, '/replayed')] }),
    jsonResponse({ ok: false }, 409),
  ];
  const bridge2 = createTelegramBridge({
    fetchImpl: scriptedFetch(responses2, calls2),
    config: await makeConfig(dir),
    dir,
    sleep: async () => true,
    log: () => {},
  });
  await bridge2.run();

  assert.deepEqual((await readInbox(dir)).map((row) => row.id), [10]);
  assert.deepEqual(await readState(dir), { offset: 11 });
});

test('HTTP 409 dừng poll ngay, không retry', async (t) => {
  const dir = await makeTempDir(t);
  const calls = [];
  const responses = [jsonResponse({ result: [] }), jsonResponse({ ok: false }, 409)];
  const logs = [];
  const bridge = createTelegramBridge({
    fetchImpl: scriptedFetch(responses, calls),
    config: await makeConfig(dir),
    dir,
    sleep: async () => {
      throw new Error('sleep không được gọi');
    },
    log: (line) => logs.push(line),
  });

  await bridge.run();

  assert.equal(calls.length, 2);
  assert.match(logs.join('\n'), /Bot đang được poll bởi tiến trình khác \(409\)\. Dừng bridge\./);
});

test('stop() abort fetch đang treo và resolve run()', async (t) => {
  const dir = await makeTempDir(t);
  const calls = [];
  let sawAbort = false;
  const responses = [
    jsonResponse({ result: [] }),
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          sawAbort = true;
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      }),
  ];
  const logs = [];
  const bridge = createTelegramBridge({
    fetchImpl: scriptedFetch(responses, calls),
    config: await makeConfig(dir),
    dir,
    sleep: async () => true,
    log: (line) => logs.push(line),
  });

  const running = bridge.run();
  await new Promise((resolve) => setTimeout(resolve, 10));
  bridge.stop();
  await running;

  assert.equal(sawAbort, true);
  assert.match(logs.join('\n'), /Đã dừng bridge\./);
});

test('outbox gửi đúng chat whitelist, cắt 4000 ký tự rồi xoá file', async (t) => {
  const dir = await makeTempDir(t);
  await mkdir(join(dir, 'outbox'), { recursive: true });
  const outboxFile = join(dir, 'outbox', 'report-1.json');
  await writeFile(outboxFile, JSON.stringify({ id: 'report-1', chatId: ALLOWED, text: 'x'.repeat(4100), parse_mode: 'Markdown' }));

  const calls = [];
  const responses = [
    jsonResponse({ result: [] }),
    jsonResponse({ result: [] }),
    jsonResponse({ ok: true }),
    jsonResponse({ ok: false }, 409),
  ];
  const bridge = createTelegramBridge({
    fetchImpl: scriptedFetch(responses, calls),
    config: await makeConfig(dir),
    dir,
    sleep: async () => true,
    log: () => {},
  });

  await bridge.run();

  const send = calls.find((call) => call.init.method === 'POST');
  assert.ok(send);
  assert.match(send.url, /\/sendMessage$/);
  assert.equal(send.init.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(send.init.body), { chat_id: ALLOWED, text: 'x'.repeat(4000) });
  assert.equal((await readdir(join(dir, 'outbox'))).length, 0);
});

test('outbox chat lạ bị bỏ, không gửi sendMessage', async (t) => {
  const dir = await makeTempDir(t);
  await mkdir(join(dir, 'outbox'), { recursive: true });
  const outboxFile = join(dir, 'outbox', 'foreign.json');
  await writeFile(outboxFile, JSON.stringify({ id: 'foreign', chatId: 99, text: 'không được gửi' }));

  const calls = [];
  const responses = [
    jsonResponse({ result: [] }),
    jsonResponse({ result: [] }),
    jsonResponse({ ok: false }, 409),
  ];
  const bridge = createTelegramBridge({
    fetchImpl: scriptedFetch(responses, calls),
    config: await makeConfig(dir),
    dir,
    sleep: async () => true,
    log: () => {},
  });

  await bridge.run();

  assert.equal(calls.some((call) => call.init.method === 'POST'), false);
  assert.equal((await readdir(join(dir, 'outbox'))).includes('foreign.json'), true);
});

test('log không chứa token hay response body', async (t) => {
  const dir = await makeTempDir(t);
  const logs = [];
  const calls = [];
  const responses = [
    jsonResponse({ result: [{ update_id: 1, secret_body: TOKEN }] }),
    jsonResponse({ ok: false, detail: TOKEN }, 409),
  ];
  const bridge = createTelegramBridge({
    fetchImpl: scriptedFetch(responses, calls),
    config: await makeConfig(dir),
    dir,
    sleep: async () => true,
    log: (line) => logs.push(line),
  });

  await bridge.run();
  const joined = logs.join('\n');
  assert.equal(joined.includes(TOKEN), false);
  assert.equal(joined.includes('secret_body'), false);
  assert.equal(joined.includes('409'), true);
});
