import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  closeWorkerSession,
  openWorkerSession,
  parseWorkers,
  planWorkerSession,
  run,
} from './worker-session.mjs';

const REPLACE = { action: 'REPLACE' };

test('plan: context hữu ích → KEEP (dù idle)', () => {
  const result = planWorkerSession({
    session: 'task-management-f1',
    task: 'review docs',
    contextUseful: true,
    busy: false,
  });
  assert.equal(result.action, 'KEEP');
  assert.equal(result.session, 'task-management-f1');
});

test('plan: worker busy → KEEP (dù context không hữu ích)', () => {
  assert.equal(planWorkerSession({
    session: 'task-management-f1',
    contextUseful: false,
    busy: true,
  }).action, 'KEEP');
});

test('plan: context không hữu ích + idle → REPLACE, mặc định an toàn busy/context=true', () => {
  const result = planWorkerSession({
    session: 'task-management-f1',
    task: 'new task',
    contextUseful: false,
    busy: false,
  });
  assert.equal(result.action, 'REPLACE');
  assert.match(result.reason, /new task/);
  assert.equal(planWorkerSession({ session: 'task-management-f1' }).action, 'KEEP');
});

test('plan không gọi execImpl', () => {
  let called = false;
  planWorkerSession({ session: 'task-management-f1', contextUseful: false, busy: false });
  assert.equal(called, false);
});

test('parseWorkers: nhận list realtime dạng array / object / ListAgents entries', () => {
  const fromJson = parseWorkers({ workersJson: '["task-management-new"]' });
  assert.equal(fromJson.has('task-management-new'), true);

  const fromListAgents = parseWorkers({
    workersJson: '[{"name":"task-management-f1"},{"name":"task-management-49"}]',
  });
  assert.equal(fromListAgents.has('task-management-f1'), true);
  assert.equal(fromListAgents.has('task-management-49'), true);

  const fromObject = parseWorkers({ workersJson: '{"workers":["task-management-2d"]}' });
  assert.equal(fromObject.has('task-management-2d'), true);

  assert.equal(parseWorkers({}), null);
  assert.throws(() => parseWorkers({ workersJson: '{"nope": []}' }), /must be an array/);
});

test('close: không có danh sách realtime → từ chối (không fallback hardcode)', () => {
  assert.throws(
    () => closeWorkerSession({
      session: 'task-management-f1',
      confirmed: true,
      decision: REPLACE,
    }),
    /No realtime workers supplied/,
  );
});

test('close: session điều phối bị loại dù có trong danh sách realtime', () => {
  for (const list of [
    ['task-management-85'],
    ['task-management-f1', 'task-management-85'],
  ]) {
    assert.throws(
      () => closeWorkerSession({
        session: 'task-management-85',
        confirmed: true,
        decision: REPLACE,
        workers: new Set(list),
        execImpl: () => { throw new Error('must not exec'); },
      }),
      /Refusing to close coordinator/,
    );
  }
});

test('close: --coordinator tùy biến cũng bị loại', () => {
  assert.throws(
    () => closeWorkerSession({
      session: 'task-management-custom-lead',
      confirmed: true,
      decision: REPLACE,
      coordinator: 'task-management-custom-lead',
      workers: new Set(['task-management-custom-lead']),
    }),
    /Refusing to close coordinator/,
  );
});

test('close: worker cũ không còn trong danh sách realtime bị từ chối', () => {
  const stale = new Set(['task-management-f1', 'task-management-49']);
  assert.throws(
    () => closeWorkerSession({
      session: 'task-management-6a',
      confirmed: true,
      decision: REPLACE,
      workers: stale,
    }),
    /not in realtime worker list/,
  );
});

test('close: worker mới trong danh sách realtime được phép đóng', () => {
  const calls = [];
  const result = closeWorkerSession({
    session: 'task-management-new',
    confirmed: true,
    apply: true,
    decision: REPLACE,
    workers: new Set(['task-management-new']),
    execImpl: (args) => calls.push(args),
  });
  assert.equal(result.applied, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0][1], /task-management-new/);
});

test('close: dry-run không gọi exec, apply gọi đúng AppleScript, không quit app', () => {
  const calls = [];
  const execImpl = (args, options) => calls.push({ args, options });
  const workers = new Set(['task-management-f1']);
  const base = {
    session: 'task-management-f1',
    confirmed: true,
    decision: REPLACE,
    workers,
    execImpl,
  };

  const dry = closeWorkerSession(base);
  assert.equal(dry.applied, false);
  assert.match(dry.script, /close t/);
  assert.equal(calls.length, 0);

  const applied = closeWorkerSession({ ...base, apply: true });
  assert.equal(applied.applied, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, ['-e', dry.script]);
  assert.equal(calls[0].args[1].includes('task-management-f1'), true);
  assert.equal(/quit|terminate/i.test(calls[0].args[1]), false);
});

test('close: plan KEEP thì không đóng dù có realtime worker', () => {
  const calls = [];
  const result = closeWorkerSession({
    session: 'task-management-f1',
    confirmed: true,
    apply: true,
    decision: { action: 'KEEP', reason: 'worker busy' },
    workers: new Set(['task-management-f1']),
    execImpl: (args) => calls.push(args),
  });
  assert.equal(result.action, 'KEEP');
  assert.equal(calls.length, 0);
});

test('close: thiếu --confirmed không làm gì', () => {
  assert.throws(
    () => closeWorkerSession({
      session: 'task-management-f1',
      decision: REPLACE,
      workers: new Set(['task-management-f1']),
    }),
    /requires --confirmed/,
  );
});

test('open: dry-run không gọi exec; apply spawn argv array, shell:false', () => {
  const calls = [];
  const execImpl = (args, options) => calls.push({ args, options });
  const base = {
    session: 'task-management-f1',
    cwd: '/Users/demo/project',
    task: 'ship bridge',
    execImpl,
  };

  const dry = openWorkerSession(base);
  assert.equal(dry.applied, false);
  assert.match(dry.script, /claude --name task-management-f1/);
  assert.equal(calls.length, 0);

  const applied = openWorkerSession({ ...base, apply: true });
  assert.equal(applied.applied, true);
  assert.equal(calls.length, 1);
  assert.equal(Array.isArray(calls[0].args), true);
  assert.deepEqual(calls[0].args, ['-e', dry.script]);
  assert.equal(calls[0].options.shell, false);
});

test('CLI run: plan JSON, close realtime whitelist, coordinator chặn, open dry-run', () => {
  let execCount = 0;
  const execImpl = () => { execCount += 1; };

  assert.deepEqual(
    run(['plan', '--session', 'task-management-f1', '--context-useful', 'false', '--busy', 'false'], { execImpl }),
    {
      action: 'REPLACE',
      reason: 'context not useful and worker idle; task: (none)',
      session: 'task-management-f1',
    },
  );
  assert.throws(
    () => run([
      'close', '--session', 'task-management-85', '--confirmed', '--apply',
      '--context-useful', 'false', '--busy', 'false',
      '--workers-json', '["task-management-85"]',
    ], { execImpl }),
    /Refusing to close coordinator/,
  );
  assert.equal(run([
    'close', '--session', 'task-management-f1', '--confirmed',
    '--workers-json', '["task-management-f1"]',
  ], { execImpl }).applied, false);
  assert.equal(run(['open', '--session', 'task-management-f1'], { execImpl }).applied, false);
  assert.equal(execCount, 0);
});
