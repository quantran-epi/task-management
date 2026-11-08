import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ResearchFindingSchema,
  ResearchPayloadSchema,
  escapeShellArg,
  parseResearchOutput,
  checkResearchAvailability,
  buildResearchCommand,
  buildResearchPrompt,
  renderResearchMarkdown,
  executeMultiSystemResearch,
  ResearchRunError,
} from '../researchService';
import * as sshService from '../../sshService';
import * as artifactRepo from '../../wizard/artifactRepo';
import type { TaskPlannerDatabase } from '../../../db';
import type { System } from '../../../types/models';
import type { SshConfig } from '../../../types/ssh';

vi.mock('../../sshService', () => ({
  getSshConfigById: vi.fn(),
  testSshConnection: vi.fn(),
  execRemoteCommandStream: vi.fn(),
}));

vi.mock('../../wizard/artifactRepo', () => ({
  saveResearchArtifact: vi.fn(),
}));

vi.mock('../../wizard/workflowCoordinator', () => ({
  defaultSha256: vi.fn(async () => 'hash'),
}));

const mockedGetSshConfigById = vi.mocked(sshService.getSshConfigById);
const mockedTestSshConnection = vi.mocked(sshService.testSshConnection);
const mockedExecRemoteCommandStream = vi.mocked(sshService.execRemoteCommandStream);
const mockedSaveResearchArtifact = vi.mocked(artifactRepo.saveResearchArtifact);

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const CHANGE_REQUEST_ID = '22222222-2222-4222-8222-222222222222';
const THREAD_ID = '33333333-3333-4333-8333-333333333333';

const sshConfig: SshConfig = {
  id: 'ssh-1',
  name: 'Test Server',
  host: '192.168.1.100',
  port: 22,
  username: 'root',
  authType: 'password',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function makeSystem(overrides: Partial<System> & { id: string; code: string }): System {
  return {
    name: overrides.code,
    parentId: null,
    type: 'SERVICE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeDb(systems: System[], targetIds: string[] = systems.map((s) => s.id)): TaskPlannerDatabase {
  return {
    systems: {
      get: vi.fn(async (id: string) => systems.find((s) => s.id === id)),
    },
    changeRequests: {
      get: vi.fn(async () => ({ id: CHANGE_REQUEST_ID, targets: targetIds.map((systemId) => ({ systemId })) })),
    },
  } as unknown as TaskPlannerDatabase;
}

describe('ResearchService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('escapeShellArg', () => {
    it('wraps plain text in single quotes', () => {
      expect(escapeShellArg('hello world')).toBe("'hello world'");
    });

    it('neutralizes single-quote breakout and shell metacharacters', () => {
      const escaped = escapeShellArg("test'; rm -rf /; echo 'pwned");

      expect(escaped).toBe("'test'\\''; rm -rf /; echo '\\''pwned'");
      // Every literal quote must be part of an escape sequence, so the payload
      // stays one inert argument and `; rm -rf /` is never executed.
      expect(escaped.slice(1, -1).replace(/'\\''/g, '')).not.toContain("'");
      expect(escaped).toContain('; rm -rf /');
    });
  });

  describe('schemas', () => {
    it('accepts a web finding and a repo finding', () => {
      const payload = ResearchPayloadSchema.parse({
        summary: 'Findings',
        findings: [
          { claim: 'Rate limit is 100/s', scope: 'web', source: 'https://example.com' },
          { claim: 'Retry uses backoff', scope: 'repo', systemCode: 'CORE', source: 'src/retry.ts', confidence: 0.8 },
        ],
      });

      expect(payload.findings).toHaveLength(2);
      expect(payload.findings[0]?.confidence).toBe(1);
      expect(payload.findings[1]?.systemCode).toBe('CORE');
    });

    it('rejects an unknown scope', () => {
      expect(
        ResearchFindingSchema.safeParse({ claim: 'x', scope: 'internal', source: 'y' }).success,
      ).toBe(false);
    });

    it('rejects an empty claim', () => {
      expect(
        ResearchFindingSchema.safeParse({ claim: '', scope: 'web', source: 'y' }).success,
      ).toBe(false);
    });
  });

  describe('parseResearchOutput', () => {
    it('parses bare JSON', () => {
      const payload = parseResearchOutput(
        JSON.stringify({
          summary: 'Bare',
          findings: [{ claim: 'c', scope: 'web', source: 's' }],
        }),
      );

      expect(payload.summary).toBe('Bare');
      expect(payload.findings).toHaveLength(1);
    });

    it('parses fenced JSON surrounded by prose', () => {
      const payload = parseResearchOutput(
        'Here you go:\n```json\n{"summary":"Fenced","findings":[{"claim":"c","scope":"repo","source":"s"}]}\n```\nDone.',
      );

      expect(payload.summary).toBe('Fenced');
      expect(payload.findings[0]?.scope).toBe('repo');
    });

    it('degrades to raw text instead of throwing', () => {
      const raw = 'No JSON here { not valid';
      const payload = parseResearchOutput(raw);

      expect(payload.findings).toEqual([]);
      expect(payload.rawOutput).toBe(raw);
      expect(payload.summary).toBe(raw);
    });

    it('never throws on empty input', () => {
      expect(() => parseResearchOutput('')).not.toThrow();
    });

    it('unwraps the claude CLI result envelope and keeps findings', () => {
      const payload = parseResearchOutput(
        JSON.stringify({
          type: 'result',
          subtype: 'success',
          is_error: false,
          result: JSON.stringify({
            summary: 'From envelope',
            findings: [{ claim: 'c', scope: 'web', source: 'https://example.com' }],
          }),
        }),
      );

      expect(payload.summary).toBe('From envelope');
      expect(payload.findings).toHaveLength(1);
      expect(payload.rawOutput).toBeUndefined();
    });

    it('unwraps an envelope whose result carries fenced JSON', () => {
      const payload = parseResearchOutput(
        JSON.stringify({
          type: 'result',
          is_error: false,
          result: 'Here:\n```json\n{"summary":"Fenced inside","findings":[{"claim":"c","scope":"repo","source":"a.ts"}]}\n```',
        }),
      );

      expect(payload.summary).toBe('Fenced inside');
      expect(payload.findings[0]?.scope).toBe('repo');
    });

    it('does not treat an is_error envelope as a payload', () => {
      const raw = JSON.stringify({ type: 'result', is_error: true, result: 'API error' });
      const payload = parseResearchOutput(raw);

      expect(payload.findings).toEqual([]);
      expect(payload.rawOutput).toBe(raw);
    });
  });

  describe('checkResearchAvailability', () => {
    it('reports NO_SSH_CONFIG for a system without sshConfigId', async () => {
      const db = makeDb([makeSystem({ id: 'sys-1', code: 'CORE' })]);

      const result = await checkResearchAvailability(['sys-1'], db);

      expect(result).toEqual([
        { systemId: 'sys-1', code: 'CORE', available: false, reason: 'NO_SSH_CONFIG' },
      ]);
      expect(mockedTestSshConnection).not.toHaveBeenCalled();
    });

    it('reports NO_SSH_CONFIG for an unknown system', async () => {
      const db = makeDb([]);

      const result = await checkResearchAvailability(['missing'], db);

      expect(result[0]?.available).toBe(false);
      expect(result[0]?.reason).toBe('NO_SSH_CONFIG');
    });

    it('reports UNREACHABLE when the SSH connection fails', async () => {
      const db = makeDb([makeSystem({ id: 'sys-2', code: 'CREDIT', sshConfigId: 'ssh-1' })]);
      mockedGetSshConfigById.mockResolvedValue(sshConfig);
      mockedTestSshConnection.mockRejectedValue(new Error('timeout'));

      const result = await checkResearchAvailability(['sys-2'], db);

      expect(result).toEqual([
        { systemId: 'sys-2', code: 'CREDIT', available: false, reason: 'UNREACHABLE' },
      ]);
    });

    it('marks a reachable system available and keeps per-system isolation', async () => {
      const db = makeDb([
        makeSystem({ id: 'sys-3', code: 'OK', sshConfigId: 'ssh-1' }),
        makeSystem({ id: 'sys-4', code: 'DOWN', sshConfigId: 'ssh-2' }),
      ]);
      mockedGetSshConfigById.mockImplementation(async (id: string) =>
        id === 'ssh-1' ? sshConfig : { ...sshConfig, id: 'ssh-2' },
      );
      mockedTestSshConnection.mockImplementation(async (config: SshConfig) => {
        if (config.id === 'ssh-2') throw new Error('unreachable');
        return 'ok';
      });

      const result = await checkResearchAvailability(['sys-3', 'sys-4'], db);

      expect(result[0]).toEqual({ systemId: 'sys-3', code: 'OK', available: true });
      expect(result[1]).toEqual({
        systemId: 'sys-4',
        code: 'DOWN',
        available: false,
        reason: 'UNREACHABLE',
      });
    });
  });

  describe('ResearchRunError', () => {
    it('carries a stable code', () => {
      const err = new ResearchRunError('RESEARCH_TIMEOUT', 'timed out');

      expect(err).toBeInstanceOf(Error);
      expect(err.code).toBe('RESEARCH_TIMEOUT');
      expect(err.message).toBe('timed out');
    });
  });

  describe('buildResearchCommand', () => {
    it('emits the exact remote command with exec on claude and no sh -c wrapper', () => {
      const cmd = buildResearchCommand('/srv/repo', "Fix the 'auth' flow", true);

      expect(cmd).toBe(
        "cd '/srv/repo' && exec claude -p 'Fix the '\\''auth'\\'' flow' --output-format json --permission-mode plan --allowedTools WebSearch,WebFetch,Glob,Grep,Read --disallowedTools Bash,Edit,Write,MultiEdit,NotebookEdit",
      );
      expect(cmd).not.toContain('sh -c');
      expect(cmd).not.toMatch(/exec cd /);
    });

    it('pins plan mode and denies mutating tools so read-only does not depend on remote config', () => {
      const cmd = buildResearchCommand('/srv/repo', 'q', true);

      expect(cmd).toContain('--permission-mode plan');
      expect(cmd).toContain('--disallowedTools Bash,Edit,Write,MultiEdit,NotebookEdit');
    });

    it('drops web tools when includeWeb is false', () => {
      const cmd = buildResearchCommand('/srv/repo', 'q', false);

      expect(cmd).toContain('--allowedTools Glob,Grep,Read');
      expect(cmd).not.toContain('WebSearch');
    });

    it('falls back to . for an empty repo path', () => {
      expect(buildResearchCommand('', 'q', false)).toContain("cd '.' && exec claude -p");
    });
  });

  describe('buildResearchPrompt', () => {
    it('names the system code, lists questions, and forbids edits', () => {
      const prompt = buildResearchPrompt(['Q1?', 'Q2?'], 'CORE');

      expect(prompt).toContain('CORE');
      expect(prompt).toContain('Q1?');
      expect(prompt).toContain('Q2?');
      expect(prompt).toContain('summary');
      expect(prompt).toContain('findings');
      expect(prompt).toContain('KHÔNG');
    });
  });

  describe('renderResearchMarkdown', () => {
    it('tags web and repo findings with their external scope', () => {
      const md = renderResearchMarkdown({
        summary: 'Sum',
        findings: [
          { claim: 'Web claim', scope: 'web', source: 'https://x', confidence: 0.9 },
          { claim: 'Repo claim', scope: 'repo', systemCode: 'CORE', source: 'src/x.ts', confidence: 1 },
        ],
      });

      expect(md).toContain('Sum');
      expect(md).toContain('[EXTERNAL:WEB] Web claim');
      expect(md).toContain('[EXTERNAL:REPO:CORE] Repo claim');
      expect(md).toContain('src/x.ts');
    });
  });

  describe('executeMultiSystemResearch', () => {
    function baseOptions(overrides: Partial<Parameters<typeof executeMultiSystemResearch>[0]> = {}) {
      return {
        changeRequestId: CHANGE_REQUEST_ID,
        threadId: THREAD_ID,
        sessionId: SESSION_ID,
        targetSystemIds: ['sys-1'],
        questions: ['Q1?'],
        onLog: vi.fn(),
        ...overrides,
      };
    }

    it('rejects RESEARCH_UNAVAILABLE when no target is available', async () => {
      const db = makeDb([
        makeSystem({ id: 'sys-1', code: 'CORE' }),
        makeSystem({ id: 'sys-2', code: 'CREDIT' }),
      ]);

      const { promise } = executeMultiSystemResearch(baseOptions({ db, targetSystemIds: ['sys-1', 'sys-2'] }));

      await expect(promise).rejects.toMatchObject({ code: 'RESEARCH_UNAVAILABLE' });
      expect(mockedExecRemoteCommandStream).not.toHaveBeenCalled();
      expect(mockedSaveResearchArtifact).not.toHaveBeenCalled();
    });

    it('reports an unavailable system in skippedSystems and onLog', async () => {
      const db = makeDb([
        makeSystem({ id: 'sys-1', code: 'CORE', sshConfigId: 'ssh-1', remoteRepoPath: '/srv/core' }),
        makeSystem({ id: 'sys-2', code: 'CREDIT' }),
      ]);
      mockedGetSshConfigById.mockResolvedValue(sshConfig);
      mockedTestSshConnection.mockResolvedValue('ok');
      mockedExecRemoteCommandStream.mockImplementation(async (_c, _cmd, _sid, onData, onExit) => {
        setTimeout(() => {
          onData({
            sessionId: SESSION_ID,
            stream: 'stdout',
            line: JSON.stringify({ summary: 'S', findings: [{ claim: 'c', scope: 'repo', source: 'src/x.ts' }] }),
          });
          onExit({ sessionId: SESSION_ID, exitStatus: 0, error: null });
        }, 0);
        return async () => {};
      });
      mockedSaveResearchArtifact.mockResolvedValue({ note: {} as never, created: true });

      const onLog = vi.fn();
      const { promise } = executeMultiSystemResearch(
        baseOptions({ db, targetSystemIds: ['sys-1', 'sys-2'], onLog }),
      );

      const payload = await promise;

      expect(payload.skippedSystems).toEqual([
        { systemId: 'sys-2', code: 'CREDIT', reason: 'NO_SSH_CONFIG' },
      ]);
      expect(onLog.mock.calls.flat().join('\n')).toContain('CREDIT');
    });

    it('rejects RESEARCH_TIMEOUT and cancels the remote process', async () => {
      const db = makeDb([makeSystem({ id: 'sys-1', code: 'CORE', sshConfigId: 'ssh-1' })]);
      mockedGetSshConfigById.mockResolvedValue(sshConfig);
      mockedTestSshConnection.mockResolvedValue('ok');
      const cancelHandle = vi.fn(async () => {});
      mockedExecRemoteCommandStream.mockImplementation(async () => cancelHandle);

      const { promise } = executeMultiSystemResearch(baseOptions({ db, timeoutMs: 10 }));

      await expect(promise).rejects.toMatchObject({ code: 'RESEARCH_TIMEOUT' });
      expect(cancelHandle).toHaveBeenCalled();
      expect(mockedSaveResearchArtifact).not.toHaveBeenCalled();
    });

    it('maps an SSH stream throw to RESEARCH_SSH_ERROR', async () => {
      const db = makeDb([makeSystem({ id: 'sys-1', code: 'CORE', sshConfigId: 'ssh-1' })]);
      mockedGetSshConfigById.mockResolvedValue(sshConfig);
      mockedTestSshConnection.mockResolvedValue('ok');
      mockedExecRemoteCommandStream.mockRejectedValue(new Error('channel open failed'));

      const { promise } = executeMultiSystemResearch(baseOptions({ db }));

      await expect(promise).rejects.toMatchObject({ code: 'RESEARCH_SSH_ERROR' });
      expect(mockedSaveResearchArtifact).not.toHaveBeenCalled();
    });

    it('maps a non-null exit-event error to RESEARCH_SSH_ERROR instead of resolving partial data', async () => {
      const db = makeDb([makeSystem({ id: 'sys-1', code: 'CORE', sshConfigId: 'ssh-1' })]);
      mockedGetSshConfigById.mockResolvedValue(sshConfig);
      mockedTestSshConnection.mockResolvedValue('ok');
      mockedExecRemoteCommandStream.mockImplementation(async (_c, _cmd, _sid, onData, onExit) => {
        setTimeout(() => {
          onData({
            sessionId: SESSION_ID,
            stream: 'stdout',
            line: JSON.stringify({ summary: 'partial', findings: [] }),
          });
          onExit({ sessionId: SESSION_ID, exitStatus: 1, error: 'connection reset' });
        }, 0);
        return async () => {};
      });

      const { promise } = executeMultiSystemResearch(baseOptions({ db }));

      await expect(promise).rejects.toMatchObject({ code: 'RESEARCH_SSH_ERROR' });
      expect(mockedSaveResearchArtifact).not.toHaveBeenCalled();
    });

    it('maps a non-zero exit status to RESEARCH_SSH_ERROR', async () => {
      const db = makeDb([makeSystem({ id: 'sys-1', code: 'CORE', sshConfigId: 'ssh-1' })]);
      mockedGetSshConfigById.mockResolvedValue(sshConfig);
      mockedTestSshConnection.mockResolvedValue('ok');
      mockedExecRemoteCommandStream.mockImplementation(async (_c, _cmd, _sid, onData, onExit) => {
        setTimeout(() => {
          onData({
            sessionId: SESSION_ID,
            stream: 'stdout',
            line: JSON.stringify({ summary: 'partial', findings: [] }),
          });
          onExit({ sessionId: SESSION_ID, exitStatus: 127, error: null });
        }, 0);
        return async () => {};
      });

      const { promise } = executeMultiSystemResearch(baseOptions({ db }));

      await expect(promise).rejects.toMatchObject({ code: 'RESEARCH_SSH_ERROR' });
      expect(mockedSaveResearchArtifact).not.toHaveBeenCalled();
    });

    it('resolves with tagged findings and persists one artifact on success', async () => {
      const db = makeDb([
        makeSystem({ id: 'sys-1', code: 'CORE', sshConfigId: 'ssh-1', remoteRepoPath: '/srv/core' }),
      ]);
      mockedGetSshConfigById.mockResolvedValue(sshConfig);
      mockedTestSshConnection.mockResolvedValue('ok');
      mockedExecRemoteCommandStream.mockImplementation(async (_c, _cmd, _sid, onData, onExit) => {
        setTimeout(() => {
          onData({
            sessionId: SESSION_ID,
            stream: 'stdout',
            line: JSON.stringify({
              summary: 'Findings',
              findings: [{ claim: 'Retry uses backoff', scope: 'repo', source: 'src/retry.ts' }],
            }),
          });
          onExit({ sessionId: SESSION_ID, exitStatus: 0, error: null });
        }, 0);
        return async () => {};
      });
      mockedSaveResearchArtifact.mockResolvedValue({ note: {} as never, created: true });

      const { promise } = executeMultiSystemResearch(baseOptions({ db }));

      const payload = await promise;

      expect(payload.summary).toBe('Findings');
      expect(payload.findings).toHaveLength(1);
      expect(payload.findings[0]?.systemCode).toBe('CORE');
      expect(mockedSaveResearchArtifact).toHaveBeenCalledTimes(1);
      expect(mockedSaveResearchArtifact.mock.calls[0]?.[0]).toMatchObject({
        changeRequestId: CHANGE_REQUEST_ID,
        threadId: THREAD_ID,
        sessionId: SESSION_ID,
      });
    });

    it('cancel() settles the run with RESEARCH_CANCELLED and stops the stream', async () => {
      const db = makeDb([makeSystem({ id: 'sys-1', code: 'CORE', sshConfigId: 'ssh-1' })]);
      mockedGetSshConfigById.mockResolvedValue(sshConfig);
      mockedTestSshConnection.mockResolvedValue('ok');
      const cancelHandle = vi.fn(async () => {});
      mockedExecRemoteCommandStream.mockImplementation(async () => cancelHandle);

      const { promise, cancel } = executeMultiSystemResearch(baseOptions({ db }));

      // Let the stream start so the closure-local cancel handle is registered.
      await new Promise((resolve) => setTimeout(resolve, 0));
      await cancel();

      await expect(promise).rejects.toMatchObject({ code: 'RESEARCH_CANCELLED' });
      expect(cancelHandle).toHaveBeenCalledTimes(1);
      // Idempotent: a second cancel must not double-signal the remote process.
      await cancel();
      expect(cancelHandle).toHaveBeenCalledTimes(1);
    });
  });
});
