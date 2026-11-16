// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TaskPlannerDatabase } from '../../../../src/db/index';
import {
  TEAM_TOOL_DEFINITIONS,
  executeTeamTool,
  type TeamToolContext,
} from '../../../../src/services/ai/office/teamTools';
import { ensureTeamThread } from '../../../../src/db/repositories/teamTranscriptRepo';
import { isMutationTool } from '../../../../src/services/ai/aiTools';
import { SSH_CONFIGS_SETTING_KEY } from '../../../../src/types/ssh';
import { generateId } from '../../../../src/utils/uuid';
import { execRemoteCommand } from '../../../../src/services/sshService';

/**
 * Phase 42 D-08: `execRemoteCommand` is the seam where a command string becomes observable.
 * Only that one export is replaced — `getSshConfigById` stays real so it reads the seeded
 * `db.settings` row, and `getSshSecret` returns null outside Tauri.
 */
vi.mock('../../../../src/services/sshService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/services/sshService')>();
  return { ...actual, execRemoteCommand: vi.fn() };
});

describe('teamTools git_read — definition, repo resolution, mutation class (AIO-READ-04, D-06, D-07, D-09)', () => {
  let db: TaskPlannerDatabase;
  let teamId: string;
  let threadId: string;
  let agentId: string;
  let repoSystemId: string;
  let bareSystemId: string;
  let emptyTeamId: string;

  const ctx = (overrides: Partial<TeamToolContext> = {}): TeamToolContext => ({
    db,
    teamId,
    threadId,
    agentId,
    ...overrides,
  });

  beforeEach(async () => {
    // WR-09: `mockReset`, not `clearAllMocks`. `clearAllMocks` maps to `mockClear`, which keeps
    // implementations and therefore keeps any `mockResolvedValueOnce` a case queued but did not
    // consume — the leftover would be silently consumed by a later case and point the failure
    // at the wrong assertion.
    vi.mocked(execRemoteCommand).mockReset();

    db = new TaskPlannerDatabase('TestGitRead_' + Math.random().toString(36).slice(2));
    await db.open();

    const now = new Date().toISOString();
    teamId = generateId();
    agentId = generateId();
    await db.aiTeams.add({
      id: teamId,
      name: 'Nhóm Review',
      leadId: generateId(),
      budgetTokens: 0,
      createdAt: now,
      updatedAt: now,
    });
    threadId = (await ensureTeamThread(teamId, db)).id;

    const sshConfigId = generateId();
    await db.settings.put({
      key: SSH_CONFIGS_SETTING_KEY,
      value: [
        {
          id: sshConfigId,
          name: 'Dev',
          host: '10.0.0.5',
          port: 22,
          username: 'git',
          authType: 'password',
          createdAt: now,
          updatedAt: now,
        },
      ],
    });

    repoSystemId = generateId();
    await db.systems.add({
      id: repoSystemId,
      name: 'Hệ thống lõi',
      code: 'CORE',
      parentId: null,
      type: 'SERVICE',
      sshConfigId,
      remoteRepoPath: '/srv/repo',
      defaultBaseBranch: 'main',
      createdAt: now,
      updatedAt: now,
    });
    await db.aiTeamLinks.add({
      id: generateId(),
      teamId,
      itemType: 'system',
      itemId: repoSystemId,
      createdAt: now,
    });

    // Linked but with no SSH profile and no repo path — the NO_LINKED_REPO case that must not
    // be misreported as SYSTEM_NOT_LINKED (T-42-02).
    bareSystemId = generateId();
    await db.systems.add({
      id: bareSystemId,
      name: 'Hệ thống chưa cấu hình',
      code: 'BARE',
      parentId: null,
      type: 'SERVICE',
      createdAt: now,
      updatedAt: now,
    });
    await db.aiTeamLinks.add({
      id: generateId(),
      teamId,
      itemType: 'system',
      itemId: bareSystemId,
      createdAt: now,
    });

    // A second team with no linked system at all, so the first team's repo link cannot leak in.
    emptyTeamId = generateId();
    await db.aiTeams.add({
      id: emptyTeamId,
      name: 'Nhóm rỗng',
      leadId: generateId(),
      budgetTokens: 0,
      createdAt: now,
      updatedAt: now,
    });
  });

  afterEach(async () => {
    await db.delete();
  });

  it('advertises git_read with a fixed eight-action enum and no command-string parameter', () => {
    const def = TEAM_TOOL_DEFINITIONS.find((tool) => tool.function.name === 'git_read');
    expect(def).toBeDefined();

    const params = def!.function.parameters;
    expect(params.properties.action.enum).toEqual([
      'branches',
      'status',
      'log',
      'diff_summary',
      'diff_file',
      'read_file',
      'tree',
      'grep',
    ]);
    expect(params.required).toEqual(['action']);
    // No extra key that could carry a command string, `-c`, `--output` or `--ext-diff`.
    expect(Object.keys(params.properties).sort()).toEqual([
      'action',
      'base',
      'branch',
      'caseSensitive',
      'dirPath',
      'filePath',
      'limit',
      'literal',
      'offset',
      'path',
      'pattern',
      'systemId',
      'target',
    ]);
  });

  it('is not mutation-classified, so it never parks an approval card (D-09)', () => {
    expect(isMutationTool('git_read')).toBe(false);
  });

  it('refuses SYSTEM_NOT_LINKED for a systemId outside the team links', async () => {
    const res = JSON.parse(
      await executeTeamTool(
        'git_read',
        { action: 'status', systemId: 'not-a-linked-id' },
        ctx()
      )
    );
    expect(res).toMatchObject({ refused: true, code: 'SYSTEM_NOT_LINKED' });
  });

  it('refuses NO_LINKED_REPO for a team with no linked system at all', async () => {
    const res = JSON.parse(
      await executeTeamTool('git_read', { action: 'status' }, ctx({ teamId: emptyTeamId }))
    );
    expect(res).toMatchObject({ refused: true, code: 'NO_LINKED_REPO' });
  });

  it('refuses NO_LINKED_REPO — not SYSTEM_NOT_LINKED — for a linked but repo-less system', async () => {
    const res = JSON.parse(
      await executeTeamTool('git_read', { action: 'status', systemId: bareSystemId }, ctx())
    );
    expect(res).toMatchObject({ refused: true, code: 'NO_LINKED_REPO' });
  });

  it('refuses INVALID_ARGUMENT for an action outside the enum', async () => {
    const res = JSON.parse(
      await executeTeamTool('git_read', { action: 'not_an_action' }, ctx())
    );
    expect(res).toMatchObject({ refused: true, code: 'INVALID_ARGUMENT' });
  });

  // ---------------------------------------------------------------------------------------
  // Block A — every action wraps its result (AIO-READ-05, D-11)
  // ---------------------------------------------------------------------------------------

  const OPEN = 'DỮ LIỆU KHÔNG ĐÁNG TIN — BẮT ĐẦU';
  const CLOSE = 'KẾT THÚC DỮ LIỆU KHÔNG ĐÁNG TIN';

  /** A full mocked remote result; a bare string means a clean exit-0 stdout. */
  type MockRes = { stdout: string; stderr: string; exitStatus: number };

  /** Queues exactly the responses the case consumes — no more, no fewer. */
  function queue(...responses: Array<string | MockRes>) {
    for (const res of responses) {
      vi.mocked(execRemoteCommand).mockResolvedValueOnce(
        typeof res === 'string' ? { stdout: res, stderr: '', exitStatus: 0 } : res
      );
    }
  }

  /**
   * `read_file` page 1 costs two remote calls: the NUL probe (exit 0 = binary, 1 = text) and
   * then the pager pass that yields both the page and the `###TOTAL` line.
   */
  function queuePage(lines: string[], totalLines: number) {
    queue(
      { stdout: '', stderr: '', exitStatus: 1 },
      {
        stdout: `${lines.join('\n')}${lines.length ? '\n' : ''}###TOTAL ${totalLines}\n`,
        stderr: '',
        exitStatus: 0,
      }
    );
  }

  /** The page-1 probe plus a pager pass whose source failed with `exitStatus`. */
  function queueFailingSource(stderr: string, exitStatus = 128) {
    queue(
      { stdout: '', stderr, exitStatus: 1 },
      { stdout: '###TOTAL 0\n', stderr: `${stderr}\n###EXIT ${exitStatus}`, exitStatus: 0 }
    );
  }

  // The `%x1e`/`%x00` record layout `parseCommitLog` expects.
  const LOG_OUT =
    '\x1e<sha>\0<short>\0Lan\0 2026-11-01 10:00:00 +0700\0sửa lỗi' +
    '\x1e<sha2>\0<s2>\0Bình\0 2026-10-30 09:00:00 +0700\0thêm test';

  const WRAP_CASES: Array<{
    action: string;
    args: Record<string, unknown>;
    outputs: Array<string | MockRes>;
  }> = [
    {
      action: 'branches',
      args: {},
      outputs: ['main\0refs/heads/main\norigin/main\0refs/remotes/origin/main\n'],
    },
    // WR-06: the `-z` shapes the parsers actually consume. A newline/`\t` fixture passed only
    // because the assertion was a substring match, so a parser regression would go unnoticed.
    { action: 'status', args: {}, outputs: [' M src/app.ts\0?? new.txt\0'] },
    { action: 'log', args: {}, outputs: [LOG_OUT] },
    {
      action: 'diff_summary',
      args: { base: 'main', target: 'feature/x' },
      // rev-parse, log, --numstat, --name-status — in that order.
      outputs: ['<sha>\n', LOG_OUT, '3\t1\tsrc/app.ts\0', 'M\0src/app.ts\0'],
    },
    {
      action: 'diff_file',
      args: { base: 'main', target: 'feature/x', filePath: 'src/app.ts' },
      outputs: ['diff --git a/src/app.ts b/src/app.ts\n+const x = 1;\n'],
    },
    {
      action: 'read_file',
      args: { branch: 'main', filePath: 'src/app.ts' },
      // Page 1: binary probe (exit 1 = text), then the pager pass with the `###TOTAL` line.
      outputs: [
        { stdout: '', stderr: '', exitStatus: 1 },
        { stdout: '1: export const x = 1;\n###TOTAL 1\n', stderr: '', exitStatus: 0 },
      ],
    },
    {
      action: 'tree',
      args: { branch: 'main' },
      // WR-03: `ls-tree -z` — NUL-terminated records.
      outputs: [
        '100644 blob abc1234    42\tsrc/app.ts\u0000' +
          '040000 tree def5678    -\tsrc/lib\u0000',
      ],
    },
    {
      action: 'grep',
      args: { pattern: 'export' },
      // `-z` NUL-separates the FIELDS of one record; the newline ends the record.
      outputs: ['main:src/app.ts\u00001\u0000export const x = 1;\n'],
    },
  ];

  /**
   * WR-08: asserts the payload is actually ENCLOSED, not merely that both tag phrases appear
   * somewhere. Every opening tag mints a nonce; the block only closes at a closing tag carrying
   * that SAME nonce. A handler that emitted both tags empty and put the payload outside them
   * would pass a `toContain` check and fail this one.
   */
  function expectEnclosed(raw: string, payload: string) {
    const blocks: Array<{ open: number; close: number }> = [];
    let cursor = 0;
    for (;;) {
      const open = raw.indexOf(OPEN, cursor);
      if (open === -1) break;
      const nonceMatch = /— ([0-9a-f-]{8})\]/.exec(raw.slice(open, open + 200));
      expect(nonceMatch).not.toBeNull();
      const nonce = nonceMatch![1]!;
      const closeTag = `[${CLOSE}`;
      let close = raw.indexOf(closeTag, open);
      // Advance to the closing tag that actually carries this block's nonce.
      while (close !== -1 && !raw.slice(close, close + 200).includes(nonce)) {
        close = raw.indexOf(closeTag, close + 1);
      }
      expect(close).toBeGreaterThan(open);
      blocks.push({ open, close });
      cursor = close + 1;
    }
    expect(blocks.length).toBeGreaterThan(0);

    const payloadIndex = raw.indexOf(payload);
    expect(payloadIndex).toBeGreaterThanOrEqual(0);
    const enclosing = blocks.filter((b) => payloadIndex > b.open && payloadIndex < b.close);
    expect(enclosing).toHaveLength(1);
  }

  for (const testCase of WRAP_CASES) {
    it(`${testCase.action} encloses its payload and labels it GIT ${testCase.action} /srv/repo`, async () => {
      queue(...testCase.outputs);

      const raw = await executeTeamTool(
        'git_read',
        { action: testCase.action, ...testCase.args },
        ctx()
      );

      expect(raw).toContain(OPEN);
      expect(raw).toContain(CLOSE);
      expect(raw).toContain(`GIT ${testCase.action} /srv/repo`);

      const parsed = JSON.parse(raw);
      expect(parsed.systemId).toBe(repoSystemId);
      expect(parsed.repoPath).toBe('/srv/repo');

      // The payload of each action, asserted to sit INSIDE the nonce-matched block. Each entry
      // names the FIRST wrapped field of that action, which is the block `expectEnclosed` reads.
      const payloadByAction: Record<string, string> = {
        branches: 'main',
        status: 'src/app.ts',
        log: 'sửa lỗi',
        diff_summary: 'sửa lỗi',
        diff_file: '+const x = 1;',
        read_file: 'export const x = 1;',
        tree: 'src/app.ts',
        grep: 'export const x = 1;',
      };
      expectEnclosed(raw, payloadByAction[testCase.action]!);

      // WR-06: the parsed fields are asserted exactly (each wrapped field carries the raw value
      // on its own line), so a parser that regressed to garbage fails here instead of sneaking
      // through the substring enclosure check above.
      if (testCase.action === 'status') {
        expect(parsed.uncommittedFiles).toHaveLength(2);
        expect(parsed.uncommittedFiles[0].path).toContain('\nsrc/app.ts\n');
        expect(parsed.uncommittedFiles[1].path).toContain('\nnew.txt\n');
      }
      if (testCase.action === 'diff_summary') {
        expect(parsed.files).toHaveLength(1);
        expect(parsed.files[0].path).toContain('\nsrc/app.ts\n');
        expect(parsed.files[0]).toMatchObject({ status: 'modified', additions: 3, deletions: 1 });
      }
      if (testCase.action === 'tree') {
        const titles = parsed.nodes.map((n: { title: string }) => n.title);
        expect(titles).toHaveLength(2);
        expect(titles[0]).toContain('\nsrc/lib\n');
        expect(titles[1]).toContain('\nsrc/app.ts\n');
      }
    });
  }

  // ---------------------------------------------------------------------------------------
  // Block B — shell payloads are escaped, never interpolated (AIO-READ-04, T-42-01)
  // ---------------------------------------------------------------------------------------

  // The exact adversarial string from src/services/__tests__/gitRemoteService.test.ts:45.
  const EVIL = "'; rm -rf /; echo '";

  it('escapes a filePath payload in diff_file — whole command string, no containment check', async () => {
    queue('diff --git a/x b/x\n');

    await executeTeamTool(
      'git_read',
      { action: 'diff_file', base: 'main', target: 'feature/x', filePath: EVIL },
      ctx()
    );

    const cmd = vi.mocked(execRemoteCommand).mock.calls.at(-1)![1];
    // Pinned to a literal, independent of `escapeShellArg`, so a handler that concatenates a
    // raw value produces a different string and fails.
    expect(cmd).toBe(
      "git -C '/srv/repo' -c core.fsmonitor=false --no-pager --literal-pathspecs diff --no-ext-diff --no-textconv --end-of-options " +
        "'main..feature/x' -- ''\\''; rm -rf /; echo '\\'''"
    );
  });

  it('escapes a branch payload in read_file — the object spec is built from escaped parts', async () => {
    queuePage(['1: export const x = 1;'], 1);

    await executeTeamTool(
      'git_read',
      { action: 'read_file', branch: EVIL, filePath: 'src/app.ts' },
      ctx()
    );

    // The object spec appears in the binary probe, which is the first remote call of page 1.
    const cmd = vi.mocked(execRemoteCommand).mock.calls[0]![1];
    // WR-07: pinned literal, independent of `escapeShellArg`. Building the expectation from the
    // function under test would keep passing if it regressed to identity.
    expect(cmd).toContain(
      "git -C '/srv/repo' -c core.fsmonitor=false --no-pager cat-file -p --end-of-options " +
        "''\\''; rm -rf /; echo '\\'':src/app.ts'"
    );
  });

  it('escapes a branch payload in log', async () => {
    queue(LOG_OUT);

    await executeTeamTool('git_read', { action: 'log', branch: EVIL }, ctx());

    const cmd = vi.mocked(execRemoteCommand).mock.calls.at(-1)![1];
    // WR-07: pinned literal. Options precede `--end-of-options`; the branch follows it.
    expect(cmd).toBe(
      "git -C '/srv/repo' -c core.fsmonitor=false --no-pager log -n 20 --format='%x1e%H%x00%h%x00%an%x00%ad%x00%s' " +
        "--date=iso --end-of-options ''\\''; rm -rf /; echo '\\'''"
    );
  });

  it('escapes a base payload in diff_summary — the range is one escaped argument', async () => {
    queue('<sha>\n', LOG_OUT, '3\t1\tsrc/app.ts\n', 'M\tsrc/app.ts\n');

    await executeTeamTool(
      'git_read',
      { action: 'diff_summary', base: EVIL, target: 'main' },
      ctx()
    );

    const calls = vi.mocked(execRemoteCommand).mock.calls;
    expect(calls).toHaveLength(4);
    // Third call is `diff --numstat <range>`.
    expect(calls.at(-2)![1]).toBe(
      "git -C '/srv/repo' -c core.fsmonitor=false --no-pager diff --numstat -z -M --no-ext-diff --no-textconv " +
        "--end-of-options ''\\''; rm -rf /; echo '\\''..main'"
    );
  });

  it('turns a git failure into a GIT_READ_FAILED refusal with the stderr wrapped, never a throw', async () => {
    vi.mocked(execRemoteCommand).mockResolvedValueOnce({
      stdout: '',
      stderr: 'fatal: bad revision',
      exitStatus: 128,
    });

    // `resolves`, never the rejection matcher: a git throw must become a refusal value.
    const promise = executeTeamTool('git_read', { action: 'status' }, ctx());
    await expect(promise).resolves.toBeTypeOf('string');
    const raw = await promise;
    const parsed = JSON.parse(raw);

    // CR-03: infrastructure failure, not an argument mistake — `INVALID_ARGUMENT` sent the
    // model into an endless retry loop instead of surfacing the failure.
    expect(parsed).toMatchObject({ refused: true, code: 'GIT_READ_FAILED' });
    // AIO-READ-05: remote stderr is repo-controlled text on a `role: 'tool'` channel.
    expect(parsed.message).toContain(OPEN);
    expect(parsed.message).toContain(CLOSE);
    expectEnclosed(parsed.message, 'fatal: bad revision');
  });

  // ---------------------------------------------------------------------------------------
  // Block C — confinement: the inputs a prompt-injected reviewer actually tries (CR-01/CR-02,
  // WR-11). These are the security boundary of the phase; Block B only proves shell escaping.
  // ---------------------------------------------------------------------------------------

  it('uses the default branch for an explicitly empty log branch', async () => {
    queue(LOG_OUT);
    const res = JSON.parse(await executeTeamTool('git_read', { action: 'log', branch: '' }, ctx()));
    expect(res.branch).toBe('main');
    expect(vi.mocked(execRemoteCommand).mock.calls[0]![1]).toContain("--end-of-options 'main'");
  });

  it('refuses a non-string log branch without running git', async () => {
    const res = JSON.parse(await executeTeamTool('git_read', { action: 'log', branch: 42 }, ctx()));
    expect(res).toMatchObject({ refused: true, code: 'INVALID_ARGUMENT' });
    expect(execRemoteCommand).not.toHaveBeenCalled();
  });

  it.each(['read_file', 'diff_file'])('%s preserves filename whitespace instead of selecting a different file', async (action) => {
    vi.mocked(execRemoteCommand).mockImplementation(async (_config, command) => {
      // `read_file` page 1: the binary probe, then the pager pass.
      if (command.includes('od -An -tx1')) return { stdout: '', stderr: '', exitStatus: 1 };
      const exact = command.includes("'main: spaced.txt '") || command.endsWith("-- ' spaced.txt '");
      if (command.includes('###TOTAL')) {
        return {
          stdout: `1: ${exact ? 'EXACT-FILE' : 'OTHER-FILE'}\n###TOTAL 1\n`,
          stderr: '', exitStatus: 0,
        };
      }
      return { stdout: exact ? 'EXACT-FILE' : 'OTHER-FILE', stderr: '', exitStatus: 0 };
    });
    for (const filePath of [' spaced.txt ', 'spaced.txt']) {
      const res = JSON.parse(await executeTeamTool('git_read', {
        action, branch: 'main', base: 'main', target: 'feature/x', filePath,
      }, ctx()));
      expect(res[action === 'read_file' ? 'content' : 'diff'])
        .toContain(filePath === ' spaced.txt ' ? 'EXACT-FILE' : 'OTHER-FILE');
      expect(res.filePath).toContain(`\n${filePath}\n`);
    }
  });

  it('refuses a log branch beginning with "-" and never runs git (CR-01)', async () => {
    const res = JSON.parse(
      await executeTeamTool(
        'git_read',
        { action: 'log', branch: '--output=/home/git/.ssh/authorized_keys' },
        ctx()
      )
    );
    expect(res).toMatchObject({ refused: true, code: 'INVALID_ARGUMENT' });
    // The write vector: git must never be handed the argument at all.
    expect(execRemoteCommand).not.toHaveBeenCalled();
  });

  it('refuses a diff base beginning with "-" and never runs git (CR-01)', async () => {
    const res = JSON.parse(
      await executeTeamTool(
        'git_read',
        { action: 'diff_summary', base: '--output=/tmp/x', target: 'main' },
        ctx()
      )
    );
    expect(res).toMatchObject({ refused: true, code: 'INVALID_ARGUMENT' });
    expect(execRemoteCommand).not.toHaveBeenCalled();
  });

  it('refuses a read_file branch beginning with "-" and never runs git (CR-01)', async () => {
    const res = JSON.parse(
      await executeTeamTool(
        'git_read',
        { action: 'read_file', branch: '--output=/tmp/x', filePath: 'README' },
        ctx()
      )
    );
    expect(res).toMatchObject({ refused: true, code: 'INVALID_ARGUMENT' });
    expect(execRemoteCommand).not.toHaveBeenCalled();
  });

  it('refuses a tree branch beginning with "-" and never runs git (CR-01)', async () => {
    const res = JSON.parse(
      await executeTeamTool('git_read', { action: 'tree', branch: '--output=/tmp/x' }, ctx())
    );
    expect(res).toMatchObject({ refused: true, code: 'INVALID_ARGUMENT' });
    expect(execRemoteCommand).not.toHaveBeenCalled();
  });

  it('refuses a read_file path that escapes the repository (CR-02, WR-05)', async () => {
    const res = JSON.parse(
      await executeTeamTool(
        'git_read',
        { action: 'read_file', branch: 'main', filePath: '../../../home/git/.ssh/id_rsa' },
        ctx()
      )
    );
    // WR-05: the model's argument was rejected — an infrastructure code would make it retry.
    expect(res).toMatchObject({ refused: true, code: 'INVALID_ARGUMENT' });
    // The `cat` fallback is the escape hatch; it must never be reached.
    const commands = vi.mocked(execRemoteCommand).mock.calls.map((call) => call[1]);
    expect(commands.some((cmd) => cmd.includes('cat --'))).toBe(false);
  });

  it('refuses a tree dirPath that escapes the repository (CR-02, WR-05)', async () => {
    const res = JSON.parse(
      await executeTeamTool('git_read', { action: 'tree', branch: 'main', dirPath: '../..' }, ctx())
    );
    expect(res).toMatchObject({ refused: true, code: 'INVALID_ARGUMENT' });
    expect(execRemoteCommand).not.toHaveBeenCalled();
  });

  it('does not fall back to the working copy when the ref itself is bad (WR-01)', async () => {
    // `git cat-file` fails because the branch does not exist — not because the path is untracked.
    queueFailingSource("fatal: invalid object name 'mian'.");

    const res = JSON.parse(
      await executeTeamTool(
        'git_read',
        { action: 'read_file', branch: 'mian', filePath: 'src/app.ts' },
        ctx()
      )
    );
    expect(res).toMatchObject({ refused: true, code: 'GIT_READ_FAILED' });
    // Exactly two commands: the page-1 probe and the failed pager pass. No `cat` of the working
    // copy, which would have returned a different version labelled as branch `mian`.
    const commands = vi.mocked(execRemoteCommand).mock.calls.map((call) => call[1]);
    expect(commands).toHaveLength(2);
    expect(commands.some((cmd) => cmd.includes('cat --'))).toBe(false);
  });

  it('still falls back to the working copy for a path that is genuinely not in the ref', async () => {
    // Ref branch: page-1 probe (text), then the pager pass reporting the missing path.
    queueFailingSource("fatal: path 'untracked.ts' does not exist in 'main'");
    // WR-01: the fallback confirms the path is untracked first; non-zero exit means it is.
    queue(
      { stdout: '', stderr: 'error: pathspec did not match any file(s) known to git', exitStatus: 1 },
      // Working-copy source: its own page-1 probe, then the pager pass.
      { stdout: '', stderr: '', exitStatus: 1 },
      { stdout: '1: export const untracked = 1;\n###TOTAL 1\n', stderr: '', exitStatus: 0 }
    );

    const res = JSON.parse(
      await executeTeamTool(
        'git_read',
        { action: 'read_file', branch: 'main', filePath: 'untracked.ts' },
        ctx()
      )
    );
    expect(res.content).toContain('export const untracked = 1;');
    const commands = vi.mocked(execRemoteCommand).mock.calls.map((call) => call[1]);
    const catSnippet = commands.find((cmd) => cmd.includes('cat --'))!;
    expect(catSnippet).toContain("root=$(realpath -- '/srv/repo' && printf /) || exit 1;");
    expect(catSnippet).toContain("target=$(realpath -- '/srv/repo/untracked.ts' && printf /) || exit 1;");
    expect(catSnippet).toContain('case "$target" in "${root%/}/"*) cat -- "$target" ;; *) exit 77 ;; esac');
  });

  it('does not fall back for a path tracked but deleted in the requested ref (WR-01)', async () => {
    queueFailingSource("fatal: path 'gone.txt' exists on disk, but not in 'feature/x'");
    // Tracked elsewhere → the ref genuinely lacks it, so the working copy must not substitute.
    queue('gone.txt\n');

    const res = JSON.parse(
      await executeTeamTool(
        'git_read',
        { action: 'read_file', branch: 'feature/x', filePath: 'gone.txt' },
        ctx()
      )
    );
    expect(res).toMatchObject({ refused: true, code: 'GIT_READ_FAILED' });
    const commands = vi.mocked(execRemoteCommand).mock.calls.map((call) => call[1]);
    expect(commands.some((cmd) => cmd.includes('cat --'))).toBe(false);
  });

  // ---------------------------------------------------------------------------------------
  // Block D — paging and search (D-01, D-02). `read_file` returns ONE page and says how much
  // is left; `grep` locates code without reading files, and no hits is a success.
  // ---------------------------------------------------------------------------------------

  it('read_file returns one page with a truthful total and a nextOffset', async () => {
    queuePage(['1: line one', '2: line two'], 10);

    const res = JSON.parse(
      await executeTeamTool(
        'git_read',
        { action: 'read_file', branch: 'main', filePath: 'src/app.ts', limit: 2 },
        ctx()
      )
    );

    expect(res).toMatchObject({
      offset: 1,
      limit: 2,
      linesRead: 2,
      totalLines: 10,
      hasMore: true,
      isBinary: false,
      nextOffset: 3,
    });
    expect(res.content).toContain('1: line one');
    // Only the requested page — the whole blob must never come back in one call.
    expect(res.content).not.toContain('3:');
  });

  it('read_file on the last page omits nextOffset', async () => {
    // Page 1 probes for binary content; a later page does not, so this is one remote call.
    queue({ stdout: '9: nine\n10: ten\n###TOTAL 10\n', stderr: '', exitStatus: 0 });

    const res = JSON.parse(
      await executeTeamTool(
        'git_read',
        { action: 'read_file', branch: 'main', filePath: 'src/app.ts', offset: 9, limit: 2 },
        ctx()
      )
    );

    expect(res).toMatchObject({ offset: 9, linesRead: 2, totalLines: 10, hasMore: false });
    expect(res).not.toHaveProperty('nextOffset');
    expect(vi.mocked(execRemoteCommand).mock.calls).toHaveLength(1);
  });

  it('read_file returns empty content for a binary page instead of dumping bytes', async () => {
    // The page-1 probe exits 0 when a NUL byte is present — no pager pass follows.
    queue({ stdout: '', stderr: '', exitStatus: 0 });

    const res = JSON.parse(
      await executeTeamTool(
        'git_read',
        { action: 'read_file', branch: 'main', filePath: 'logo.png' },
        ctx()
      )
    );

    expect(res).toMatchObject({ isBinary: true, content: '', linesRead: 0, hasMore: false });
    expect(vi.mocked(execRemoteCommand).mock.calls).toHaveLength(1);
  });

  it('grep with no matches returns an empty hit list, not a refusal', async () => {
    // `git grep` exits 1 when nothing matches. That is a successful empty result.
    queue({ stdout: '', stderr: '###EXIT 1\n', exitStatus: 0 });

    const res = JSON.parse(
      await executeTeamTool('git_read', { action: 'grep', pattern: 'nothingMatchesMe' }, ctx())
    );

    expect(res.refused).toBeUndefined();
    expect(res.hits).toEqual([]);
    expect(res.truncated).toBe(false);
    expect(vi.mocked(execRemoteCommand).mock.calls[0]![1]).toContain('--end-of-options');
  });

  it('grep refuses a missing pattern without running git', async () => {
    const res = JSON.parse(await executeTeamTool('git_read', { action: 'grep' }, ctx()));
    expect(res).toMatchObject({ refused: true, code: 'INVALID_ARGUMENT' });
    expect(execRemoteCommand).not.toHaveBeenCalled();
  });

  it('grep refuses a branch beginning with "-" and never runs git (CR-01)', async () => {
    const res = JSON.parse(
      await executeTeamTool(
        'git_read',
        { action: 'grep', pattern: 'x', branch: '--output=/tmp/x' },
        ctx()
      )
    );
    expect(res).toMatchObject({ refused: true, code: 'INVALID_ARGUMENT' });
    expect(execRemoteCommand).not.toHaveBeenCalled();
  });
});
