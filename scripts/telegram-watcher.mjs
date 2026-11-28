#!/usr/bin/env node
/**
 * Lightweight Telegram inbox watcher — zero dependencies, Node 24+.
 * Chỉ báo tín hiệu `INBOX <name>`; session điều phối đọc/ghi file bằng công cụ của nó.
 * Không spawn Claude, không đọc nội dung lệnh trong chế độ watch.
 */

import { access, mkdir, readFile, readdir, rename } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_DIR_NAME = join('.taskmate', 'telegram-bridge');

const defaultLog = (line) => console.log(`[telegram-watcher] ${line}`);
const defaultOnSignal = (name) => console.log(`INBOX ${name}`);

export function resolveWatcherDir({ env = process.env, home = homedir() } = {}) {
  const raw = env.TELEGRAM_BRIDGE_DIR;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : join(home, DEFAULT_DIR_NAME);
}

function parsePollMs(raw) {
  if (raw === undefined) return 1000;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error('TELEGRAM_WATCHER_POLL_MS phải là số nguyên dương.');
  }
  return value;
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

async function ensureDirs(dir) {
  for (const path of [join(dir, 'inbox'), join(dir, 'outbox'), join(dir, 'archive')]) {
    await mkdir(path, { recursive: true, mode: 0o700 });
  }
}

async function inboxNames(dir) {
  const names = await readdir(join(dir, 'inbox')).catch(() => []);
  return names.filter((name) => name.endsWith('.json')).sort();
}

export function createWatcher({
  dir,
  signal,
  sleep = defaultSleep,
  log = defaultLog,
  onSignal = defaultOnSignal,
  pollMs = 1000,
} = {}) {
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', onExternalAbort, { once: true });

  function stop() {
    if (controller.signal.aborted) return;
    controller.abort();
    signal?.removeEventListener('abort', onExternalAbort);
    log('Đã dừng watcher.');
  }

  async function run() {
    await ensureDirs(dir);
    const seen = new Set();
    while (!controller.signal.aborted) {
      for (const name of await inboxNames(dir)) {
        if (controller.signal.aborted) break;
        if (seen.has(name)) continue;
        seen.add(name);
        await onSignal(name);
      }
      if (controller.signal.aborted) break;
      await sleep(pollMs, controller.signal);
    }
    signal?.removeEventListener('abort', onExternalAbort);
  }

  return { run, stop };
}

export async function readOneInbox({ dir }) {
  const [name] = await inboxNames(dir);
  if (!name) return null;
  return JSON.parse(await readFile(join(dir, 'inbox', name), 'utf8'));
}

export async function archiveInbox({ dir, id, force = false, log = defaultLog }) {
  if (typeof id !== 'string' || !/^\d+$/.test(id)) {
    throw new Error('ID inbox không hợp lệ; chỉ chấp nhận update_id là chữ số.');
  }
  await ensureDirs(dir);
  if (!force) {
    try {
      await access(join(dir, 'outbox', `${id}.json`));
    } catch {
      throw new Error(`Chưa có outbox cho ${id}; ghi báo cáo trước khi archive.`);
    }
  }
  await rename(join(dir, 'inbox', `${id}.json`), join(dir, 'archive', `${id}.json`)).catch((error) => {
    if (error?.code !== 'ENOENT') throw error;
  });
  log(`archive ${id} ok`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const mode = process.argv[2] ?? 'watch';
  try {
    const dir = resolveWatcherDir();
    if (mode === 'watch') {
      const controller = new AbortController();
      const onSignal = () => controller.abort();
      process.once('SIGINT', onSignal);
      process.once('SIGTERM', onSignal);
      try {
        const watcher = createWatcher({
          dir,
          signal: controller.signal,
          pollMs: parsePollMs(process.env.TELEGRAM_WATCHER_POLL_MS),
        });
        await watcher.run();
      } finally {
        process.off('SIGINT', onSignal);
        process.off('SIGTERM', onSignal);
      }
    } else if (mode === 'inbox-once') {
      const row = await readOneInbox({ dir });
      console.log(row ? JSON.stringify(row) : 'NO_INBOX');
    } else if (mode === 'archive') {
      await archiveInbox({ dir, id: process.argv[3], force: process.argv[4] === '--force' });
    } else {
      throw new Error('Mode không hợp lệ; dùng watch, inbox-once hoặc archive <id>.');
    }
  } catch (error) {
    console.error(`[telegram-watcher] ${error instanceof Error ? error.message : 'Lỗi watcher.'}`);
    process.exitCode = 1;
  }
}
