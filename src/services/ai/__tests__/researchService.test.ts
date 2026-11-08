import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ResearchFindingSchema,
  ResearchPayloadSchema,
  escapeShellArg,
  parseResearchOutput,
  checkResearchAvailability,
  ResearchRunError,
} from '../researchService';
import * as sshService from '../../sshService';
import type { TaskPlannerDatabase } from '../../../db';
import type { System } from '../../../types/models';
import type { SshConfig } from '../../../types/ssh';

vi.mock('../../sshService', () => ({
  getSshConfigById: vi.fn(),
  testSshConnection: vi.fn(),
}));

const mockedGetSshConfigById = vi.mocked(sshService.getSshConfigById);
const mockedTestSshConnection = vi.mocked(sshService.testSshConnection);

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

function makeDb(systems: System[]): TaskPlannerDatabase {
  return {
    systems: {
      get: vi.fn(async (id: string) => systems.find((s) => s.id === id)),
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
      expect(escaped.replace(/'\\''/g, '')).not.toContain("'");
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
});
