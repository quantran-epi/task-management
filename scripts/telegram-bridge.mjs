#!/usr/bin/env node
/**
 * Telegram control bridge — zero dependencies, Node 24+.
 * Long-polling getUpdates, whitelist, file inbox/outbox. Not part of TaskMate runtime.
 */

import { randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, readdir, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_DIR_NAME = join('.taskmate', 'telegram-bridge');
const POLL_TIMEOUT = 10;
const BOOTSTRAP_LIMIT = 100;
const MAX_TEXT = 4000;
const MAX_OUTBOX_FAILURES = 3;
const BACKOFF_MIN = 2000;
const BACKOFF_MAX = 30000;

function positiveIds(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => Number(value)).filter((id) => Number.isSafeInteger(id) && id > 0))];
}

function idsFromEnv(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  return positiveIds(raw.split(','));
}

async function readConfigFile(path) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(path, 'utf8'));
  } catch {
    throw new Error(`Không đọc được file cấu hình bridge tại ${path}.`);
  }
  return {
    botToken: typeof parsed?.botToken === 'string' ? parsed.botToken.trim() : '',
    allowedChatIds: positiveIds(parsed?.allowedChatIds),
  };
}

export async function resolveConfig({ env = process.env, home = homedir() } = {}) {
  const dir = (typeof env.TELEGRAM_BRIDGE_DIR === 'string' && env.TELEGRAM_BRIDGE_DIR.trim())
    ? env.TELEGRAM_BRIDGE_DIR.trim()
    : join(home, DEFAULT_DIR_NAME);
  const configPath = (typeof env.TELEGRAM_BRIDGE_CONFIG === 'string' && env.TELEGRAM_BRIDGE_CONFIG.trim())
    ? env.TELEGRAM_BRIDGE_CONFIG.trim()
    : join(dir, 'config.json');

  let fileConfig = { botToken: '', allowedChatIds: [] };
  try {
    fileConfig = await readConfigFile(configPath);
  } catch (error) {
    if (env.TELEGRAM_BRIDGE_CONFIG?.trim()) throw error;
  }

  const botToken = (typeof env.TELEGRAM_BRIDGE_BOT_TOKEN === 'string' ? env.TELEGRAM_BRIDGE_BOT_TOKEN.trim() : '') || fileConfig.botToken;
  if (!botToken) {
    throw new Error('Thiếu bot token Telegram. Cấp TELEGRAM_BRIDGE_BOT_TOKEN hoặc file cấu hình ngoài repo.');
  }

  const envIds = idsFromEnv(env.TELEGRAM_BRIDGE_ALLOWED_CHAT_IDS);
  const allowedChatIds = new Set(envIds ?? fileConfig.allowedChatIds);
  if (allowedChatIds.size === 0) {
    throw new Error('Whitelist chat ID rỗng hoặc không hợp lệ. Cấp TELEGRAM_BRIDGE_ALLOWED_CHAT_IDS hoặc file cấu hình.');
  }

  for (const path of [dir, join(dir, 'inbox'), join(dir, 'outbox')]) {
    await mkdir(path, { recursive: true, mode: 0o700 });
  }
  return { botToken, allowedChatIds, dir };
}

async function writeJsonAtomic(path, value) {
  const temp = join(dirname(path), `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    await writeFile(temp, `${JSON.stringify(value)}\n`, { mode: 0o600 });
    if (process.platform !== 'win32') await chmod(temp, 0o600);
    await rename(temp, path);
  } catch (error) {
    await rm(temp, { force: true }).catch(() => {});
    throw error;
  }
}

function defaultSleep(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function parseCommand(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) return { command: '', args: trimmed };
  const [head, ...rest] = trimmed.slice(1).split(/\s+/);
  const command = (head ?? '').split('@')[0] ?? '';
  return { command, args: rest.join(' ').trim() };
}

export function createTelegramBridge({
  fetchImpl = fetch,
  config,
  dir = config.dir,
  signal,
  sleep = defaultSleep,
  log = (line) => console.log(`[telegram-bridge] ${line}`),
} = {}) {
  const inboxDir = join(dir, 'inbox');
  const outboxDir = join(dir, 'outbox');
  const statePath = join(dir, 'state.json');
  const controller = new AbortController();
  const outboxFailures = new Map();
  let stopped = false;
  let backoffMs = BACKOFF_MIN;

  const onExternalAbort = () => stop();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', onExternalAbort, { once: true });

  function stop() {
    if (stopped) return;
    stopped = true;
    controller.abort();
    signal?.removeEventListener('abort', onExternalAbort);
    log('Đã dừng bridge.');
  }

  function apiUrl(method, params = {}) {
    const url = new URL(`https://api.telegram.org/bot${config.botToken}/${method}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    return url;
  }

  async function waitBackoff() {
    await sleep(backoffMs, controller.signal);
    backoffMs = Math.min(backoffMs * 2, BACKOFF_MAX);
  }

  async function requestUpdates(params) {
    try {
      return await fetchImpl(apiUrl('getUpdates', params), { signal: controller.signal });
    } catch {
      if (!stopped) {
        log('getUpdates lỗi mạng.');
        await waitBackoff();
      }
      return null;
    }
  }

  async function readBody(response) {
    try {
      return await response.json();
    } catch {
      log('getUpdates trả phản hồi không đọc được.');
      await waitBackoff();
      return null;
    }
  }

  async function readOffset() {
    try {
      const state = JSON.parse(await readFile(statePath, 'utf8'));
      if (Number.isSafeInteger(state?.offset) && state.offset >= 0) return state.offset;
    } catch {
      return null;
    }
    throw new Error('State bridge không hợp lệ; không xử lý update để tránh replay.');
  }

  async function handleUpdates(updates, offset) {
    const seen = new Set();
    let nextOffset = offset;
    for (const update of updates) {
      if (stopped) break;
      const id = Number(update?.update_id);
      if (!Number.isSafeInteger(id) || id < nextOffset || seen.has(id)) continue;
      seen.add(id);

      const message = update.message;
      if (!message || typeof message.text !== 'string' || message.text.trim() === '') continue;
      if (message.from?.is_bot === true) continue;
      const chatId = Number(message.chat?.id);
      if (!config.allowedChatIds.has(chatId)) continue;

      const { command, args } = parseCommand(message.text);
      await writeJsonAtomic(join(inboxDir, `${id}.json`), {
        id,
        chatId,
        text: message.text,
        command,
        args,
        receivedAt: new Date().toISOString(),
      });
      nextOffset = Math.max(nextOffset, id + 1);
      await writeJsonAtomic(statePath, { offset: nextOffset });
    }
    return nextOffset;
  }

  async function noteOutboxFailure(name, path) {
    const count = (outboxFailures.get(name) ?? 0) + 1;
    outboxFailures.set(name, count);
    if (count >= MAX_OUTBOX_FAILURES) {
      await unlink(path).catch(() => {});
      outboxFailures.delete(name);
      log(`Bỏ file outbox ${name} sau ${count} lần gửi hỏng.`);
    }
  }

  async function flushOutbox() {
    const names = (await readdir(outboxDir)).filter((name) => name.endsWith('.json')).sort();
    for (const name of names) {
      if (stopped) return;
      const path = join(outboxDir, name);
      let payload;
      try {
        payload = JSON.parse(await readFile(path, 'utf8'));
      } catch {
        await unlink(path).catch(() => {});
        continue;
      }
      const chatId = Number(payload?.chatId);
      if (!config.allowedChatIds.has(chatId)) continue;
      if (typeof payload?.text !== 'string' || payload.text.length === 0) {
        await unlink(path).catch(() => {});
        continue;
      }
      const body = JSON.stringify({ chat_id: chatId, text: payload.text.slice(0, MAX_TEXT) });
      try {
        const response = await fetchImpl(apiUrl('sendMessage'), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
          signal: controller.signal,
        });
        if (response.ok) {
          await unlink(path).catch(() => {});
          outboxFailures.delete(name);
        } else {
          log(`sendMessage lỗi HTTP ${response.status}.`);
          await noteOutboxFailure(name, path);
        }
      } catch {
        if (stopped) return;
        log('sendMessage lỗi mạng.');
        await noteOutboxFailure(name, path);
      }
    }
  }

  async function run() {
    let offset = await readOffset();
    if (offset === null) {
      while (!stopped) {
        const response = await requestUpdates({ limit: BOOTSTRAP_LIMIT, timeout: POLL_TIMEOUT, allowed_updates: ['message'] });
        if (!response || stopped) continue;
        if (response.status === 409) {
          log('Bot đang được poll bởi tiến trình khác (409). Dừng bridge.');
          return;
        }
        if (!response.ok) {
          log(`getUpdates lỗi HTTP ${response.status}.`);
          await waitBackoff();
          continue;
        }
        const body = await readBody(response);
        if (!body || stopped) continue;
        const updates = Array.isArray(body.result) ? body.result : [];
        offset = updates.reduce((max, update) => Math.max(max, Number(update?.update_id) + 1 || 0), 0);
        await writeJsonAtomic(statePath, { offset });
        break;
      }
    }

    while (!stopped) {
      const response = await requestUpdates({ offset, timeout: POLL_TIMEOUT, allowed_updates: ['message'] });
      if (!response || stopped) continue;
      if (response.status === 409) {
        log('Bot đang được poll bởi tiến trình khác (409). Dừng bridge.');
        return;
      }
      if (!response.ok) {
        log(`getUpdates lỗi HTTP ${response.status}.`);
        await waitBackoff();
        continue;
      }
      const body = await readBody(response);
      if (!body || stopped) continue;
      backoffMs = BACKOFF_MIN;
      const updates = Array.isArray(body.result) ? body.result : [];
      offset = await handleUpdates(updates, offset);
      await flushOutbox();
    }
  }

  return { run, stop };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const controller = new AbortController();
  const onSignal = () => controller.abort();
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  try {
    const config = await resolveConfig({ env: process.env, home: homedir() });
    const bridge = createTelegramBridge({ config, signal: controller.signal });
    await bridge.run();
  } catch (error) {
    console.error(`[telegram-bridge] ${error instanceof Error ? error.message : 'Lỗi khởi động bridge.'}`);
    process.exitCode = 1;
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  }
}
