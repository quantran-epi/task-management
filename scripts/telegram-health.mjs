#!/usr/bin/env node
/**
 * Lightweight health check cho Telegram control bridge — zero dependencies, Node 24+.
 * Chỉ quan sát process, không spawn/restart bridge hay watcher.
 */

import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chmod, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const DEFAULT_DIR_NAME = join('.taskmate', 'telegram-bridge');
const ALERT_NAME = 'health-alert.json';
const WATCH_INTERVAL_MS = 60_000;
const BRIDGE_MARKER = 'telegram-bridge.mjs';
const WATCHER_MARKER = 'telegram-watcher.mjs watch';
const SELF_MARKERS = ['telegram-health.mjs', 'telegram-health.test.mjs'];
const PS_ARGS = process.platform === 'darwin' ? ['-axo', 'pid=,command='] : ['-eo', 'pid=,args='];

export function resolveHealthDir({ env = process.env, home = homedir() } = {}) {
  const raw = env.TELEGRAM_BRIDGE_DIR;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : join(home, DEFAULT_DIR_NAME);
}

export async function defaultPsImpl(command, args) {
  const { stdout } = await execFileAsync(command, args, { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });
  return stdout;
}

function psText(output) {
  if (typeof output === 'string') return output;
  if (output && typeof output.stdout === 'string') return output.stdout;
  return '';
}

export function classifyProcesses(output, selfPid = process.pid) {
  const found = { bridge: false, watcher: false };
  for (const line of psText(output).split('\n')) {
    const isBridge = line.includes(BRIDGE_MARKER);
    const isWatcher = line.includes(WATCHER_MARKER);
    if (!isBridge && !isWatcher) continue;
    const [pid] = line.trim().split(/\s+/);
    if (Number(pid) === selfPid) continue;
    if (SELF_MARKERS.some((marker) => line.includes(marker))) continue;
    if (isBridge) found.bridge = true;
    if (isWatcher) found.watcher = true;
  }
  return found;
}

async function writeAlert(path, checkedAt) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = join(dirname(path), `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    await writeFile(temp, `${JSON.stringify({ status: 'unhealthy', checkedAt })}\n`, { mode: 0o600 });
    if (process.platform !== 'win32') await chmod(temp, 0o600);
    await rename(temp, path);
  } catch (error) {
    await rm(temp, { force: true }).catch(() => {});
    throw error;
  }
}

export async function checkHealth({
  psImpl = defaultPsImpl,
  dir,
  env = process.env,
  home = homedir(),
  now = () => new Date().toISOString(),
} = {}) {
  const targetDir = dir ?? resolveHealthDir({ env, home });
  let output = '';
  try {
    output = await psImpl('ps', PS_ARGS);
  } catch {
    output = '';
  }
  const { bridge, watcher } = classifyProcesses(output);
  const result = { bridge, watcher, healthy: bridge && watcher };
  const alertPath = join(targetDir, ALERT_NAME);
  if (result.healthy) await rm(alertPath, { force: true });
  else await writeAlert(alertPath, now());
  return result;
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

const defaultEmit = (value) => console.log(JSON.stringify(value));

export function createHealthWatcher({
  psImpl = defaultPsImpl,
  dir,
  env = process.env,
  home = homedir(),
  sleep = defaultSleep,
  emit = defaultEmit,
  log = () => {},
  intervalMs = WATCH_INTERVAL_MS,
  signal,
} = {}) {
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', onExternalAbort, { once: true });
  let stopped = false;

  function stop() {
    if (stopped) return;
    stopped = true;
    controller.abort();
    signal?.removeEventListener('abort', onExternalAbort);
    log('Đã dừng health watch.');
  }

  async function run() {
    try {
      while (!controller.signal.aborted) {
        const result = await checkHealth({ psImpl, dir, env, home });
        await emit(result);
        if (controller.signal.aborted) break;
        await sleep(intervalMs, controller.signal);
      }
    } finally {
      signal?.removeEventListener('abort', onExternalAbort);
    }
  }

  return { run, stop };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const mode = process.argv[2] ?? 'check';
  try {
    if (mode === 'check') {
      defaultEmit(await checkHealth());
    } else if (mode === 'watch') {
      const controller = new AbortController();
      const onSignal = () => controller.abort();
      process.once('SIGINT', onSignal);
      process.once('SIGTERM', onSignal);
      try {
        const watcher = createHealthWatcher({ signal: controller.signal });
        await watcher.run();
      } finally {
        process.off('SIGINT', onSignal);
        process.off('SIGTERM', onSignal);
      }
    } else {
      throw new Error('Mode không hợp lệ; dùng check hoặc watch.');
    }
  } catch (error) {
    console.error(`[telegram-health] ${error instanceof Error ? error.message : 'Lỗi health check.'}`);
    process.exitCode = 1;
  }
}
