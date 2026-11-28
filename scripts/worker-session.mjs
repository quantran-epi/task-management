#!/usr/bin/env node
/**
 * Telegram control bridge — worker session plan/close/open.
 * Node 24, zero dependency. Không gọi mạng, không đụng src/.
 * Mọi thao tác Terminal.app chỉ chạy khi --apply; execImpl inject cho test.
 *
 * close CHỈ đóng session có trong danh sách worker realtime do điều phối truyền
 * ngay trước khi quyết định (ListAgents). Không hardcode whitelist.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const DEFAULT_COORDINATOR_SESSION = 'task-management-85';

const DEFAULT_EXEC = (args, options) =>
  execFileSync('osascript', args, { encoding: 'utf8', shell: false, ...options });

function parseBool(value, fallback, flag) {
  if (value === undefined) return fallback;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  throw new Error(`--${flag} requires true|false`);
}

export function parseArgs(argv = process.argv.slice(2)) {
  const [mode, ...rest] = argv;
  if (mode !== 'plan' && mode !== 'close' && mode !== 'open') {
    throw new Error(`Unknown mode: ${String(mode)} (expected plan|close|open)`);
  }
  const options = { mode };
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (!token.startsWith('--')) throw new Error(`Unexpected arg: ${token}`);
    const key = token.slice(2);
    if (key === 'confirmed' || key === 'apply') {
      options[key] = true;
      continue;
    }
    const value = rest[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`--${key} requires a value`);
    }
    const camel = key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    options[camel] = value;
    i += 1;
  }
  return options;
}

function requireSession(session) {
  if (typeof session !== 'string' || session.length === 0) {
    throw new Error('Missing --session');
  }
  // Chặn injection vào AppleScript / shell.
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(session)) {
    throw new Error(`Invalid session name: ${session}`);
  }
  return session;
}

function asAppleScriptString(value) {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Parse danh sách worker realtime. Chấp nhận:
 *   ["task-management-f1", ...]
 *   [{ "name": "task-management-f1" }, ...]   (kiểu ListAgents)
 *   { "workers": [...] }
 * Không có input → trả null → close từ chối.
 */
export function parseWorkers({ workersFile, workersJson, workers } = {}) {
  if (workersFile && workersJson) {
    throw new Error('Use either --workers or --workers-json, not both');
  }
  let raw = workers;
  if (workersFile) {
    raw = JSON.parse(readFileSync(workersFile, 'utf8'));
  } else if (workersJson) {
    raw = JSON.parse(workersJson);
  }
  if (raw === undefined || raw === null) return null;

  const list = Array.isArray(raw) ? raw : Array.isArray(raw.workers) ? raw.workers : null;
  if (!list) throw new Error('workers payload must be an array or { workers: [...] }');

  const names = list.map((entry) => {
    const name = typeof entry === 'string' ? entry : entry?.name;
    if (typeof name !== 'string') throw new Error('Invalid worker entry: missing name');
    return requireSession(name);
  });
  return new Set(names);
}

/** Chỉ KEEP khi context hữu ích HOẶC worker busy. Không gọi execImpl. */
export function planWorkerSession({
  session,
  task,
  contextUseful,
  busy,
} = {}) {
  requireSession(session);
  const useful = parseBool(contextUseful, true, 'context-useful');
  const isBusy = parseBool(busy, true, 'busy');
  const replace = !useful && !isBusy;
  return {
    action: replace ? 'REPLACE' : 'KEEP',
    reason: replace
      ? `context not useful and worker idle; task: ${task ?? '(none)'}`
      : isBusy
        ? 'worker busy; keep context'
        : 'context still useful; keep worker',
    session,
  };
}

function assertCloseAllowed(session, workers, coordinator) {
  requireSession(session);
  requireSession(coordinator);
  if (session === coordinator) {
    throw new Error(`Refusing to close coordinator session ${coordinator}`);
  }
  if (!workers) {
    throw new Error('No realtime workers supplied — refusing close');
  }
  if (workers.has(coordinator)) {
    throw new Error(`Realtime worker list contains coordinator ${coordinator} — refusing close`);
  }
  if (!workers.has(session)) {
    throw new Error(`Session not in realtime worker list: ${session}`);
  }
}

/**
 * Đóng tab Terminal.app chứa session name. Không quit app.
 * dry-run trả script để review; chỉ --apply mới gọi execImpl.
 */
export function closeWorkerSession({
  session,
  confirmed = false,
  apply = false,
  contextUseful = true,
  busy = true,
  decision,
  workers,
  coordinator = DEFAULT_COORDINATOR_SESSION,
  execImpl = DEFAULT_EXEC,
} = {}) {
  requireSession(session);
  if (confirmed !== true) throw new Error('close requires --confirmed');

  const plan = decision ?? planWorkerSession({ session, contextUseful, busy });
  if (plan.action !== 'REPLACE') {
    return { session, action: 'KEEP', applied: false, reason: plan.reason ?? 'plan returned KEEP' };
  }

  assertCloseAllowed(session, workers, coordinator);

  const needle = asAppleScriptString(session);
  const script = [
    'tell application "Terminal"',
    '  repeat with t in tabs of front window',
    `    if (custom title of t) contains ${needle} or (contents of t) contains ${needle} then`,
    '      close t',
    '      exit repeat',
    '    end if',
    '  end repeat',
    'end tell',
  ].join('\n');

  if (!apply) {
    return { session, action: 'REPLACE', applied: false, script };
  }

  execImpl(['-e', script]);
  return { session, action: 'REPLACE', applied: true };
}

/**
 * Mở Terminal.app tab/window mới chạy `claude --name <session>` trong cwd.
 * execImpl nhận mảng args, shell:false — không log secret.
 */
export function openWorkerSession({
  session,
  cwd = process.cwd(),
  task,
  apply = false,
  execImpl = DEFAULT_EXEC,
} = {}) {
  requireSession(session);
  if (typeof cwd !== 'string' || cwd.length === 0) throw new Error('Missing cwd');

  const command = asAppleScriptString(`cd ${cwd} && claude --name ${session}`);
  const script = [
    'tell application "Terminal"',
    `  do script ${command}`,
    'end tell',
  ].join('\n');

  if (!apply) {
    return { session, action: 'OPEN', applied: false, script, cwd, task: task ?? null };
  }

  execImpl(['-e', script], { shell: false });
  return { session, action: 'OPEN', applied: true, cwd };
}

/** CLI: trả object kết quả để in JSON; lỗi in ra stderr, exitCode=1. */
export function run(argv = process.argv.slice(2), deps = {}) {
  const options = parseArgs(argv);
  const execImpl = deps.execImpl ?? DEFAULT_EXEC;
  const session = requireSession(options.session);

  if (options.mode === 'plan') {
    return planWorkerSession({
      session,
      task: options.task,
      contextUseful: parseBool(options.contextUseful, true, 'context-useful'),
      busy: parseBool(options.busy, true, 'busy'),
    });
  }

  if (options.mode === 'close') {
    return closeWorkerSession({
      session,
      confirmed: options.confirmed === true,
      apply: options.apply === true,
      contextUseful: parseBool(options.contextUseful, true, 'context-useful'),
      busy: parseBool(options.busy, true, 'busy'),
      decision: deps.decision,
      workers: deps.workers ?? parseWorkers(options),
      coordinator: options.coordinator ?? DEFAULT_COORDINATOR_SESSION,
      execImpl,
    });
  }

  return openWorkerSession({
    session,
    cwd: options.cwd ?? process.cwd(),
    task: options.task,
    apply: options.apply === true,
    execImpl,
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    console.log(JSON.stringify(run()));
  } catch (error) {
    console.error(`[worker-session] ${error.message}`);
    process.exitCode = 1;
  }
}
