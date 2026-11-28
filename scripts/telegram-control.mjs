#!/usr/bin/env node
/**
 * Telegram control supervisor — chạy bridge + watcher dưới session điều phối.
 * Forward SIGINT/SIGTERM, kill sibling khi một con thoát bất thường. Không spawn Claude.
 */

import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const defaultLog = (line) => console.log(`[telegram-control] ${line}`);

export function createControlSupervisor({
  spawnImpl = spawn,
  scriptDir = dirname(fileURLToPath(import.meta.url)),
  log = defaultLog,
} = {}) {
  const bridgePath = join(scriptDir, 'telegram-bridge.mjs');
  const watcherPath = join(scriptDir, 'telegram-watcher.mjs');
  const children = [];
  const listeners = [];
  let stopping = false;
  let exitCode = null;

  function killAll(signal) {
    for (const child of children) {
      if (typeof child.kill === 'function') child.kill(signal);
    }
  }

  function stop(signal = 'SIGTERM') {
    if (stopping) return;
    stopping = true;
    for (const [event, handler] of listeners) process.off(event, handler);
    listeners.length = 0;
    killAll(signal);
    log('stopped');
  }

  function onChildExit(code) {
    if (stopping) return;
    exitCode = Number.isInteger(code) && code === 0 ? 0 : 1;
    if (exitCode !== 0) process.exitCode = exitCode;
    stop();
  }

  function onProcessSignal(signal) {
    stop(signal);
  }

  function start() {
    for (const [name, args] of [
      ['bridge', [bridgePath]],
      ['watcher', [watcherPath, 'watch']],
    ]) {
      const child = spawnImpl(process.execPath, args, { stdio: 'inherit', shell: false });
      children.push(child);
      child.on?.('exit', (code) => onChildExit(code));
      log(`${name} started`);
    }
    for (const signal of ['SIGINT', 'SIGTERM']) {
      const handler = () => onProcessSignal(signal);
      process.on(signal, handler);
      listeners.push([signal, handler]);
    }
    return { children, stop };
  }

  return {
    start,
    stop,
    get exitCode() { return exitCode; },
    get children() { return children; },
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  createControlSupervisor().start();
}
