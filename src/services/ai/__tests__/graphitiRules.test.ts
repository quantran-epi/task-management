import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase, type TaskPlannerDatabase as TaskPlannerDatabaseType } from '../../../db';
import { loadVerifiedRules, applyGraphitiRules } from '../graphitiRules';
import { getMcpServers, saveMcpServers } from '../mcpClient';

const RULE_BODY_A = 'Quy tac Graphiti khong duoc viet thanh literal trong TypeScript.';
const RULE_BODY_B = 'Quy tac SQL agent memory duoc kiem tra bang SHA-256.';

function digest(text: string): string {
  // Same digest as the service's Web Crypto path, computed in Node for the test fixture.
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function manifestFor(a: string, b: string): string {
  return `${digest(a)}  graphiti/graphiti-mcp-rules.md\n${digest(b)}  graphiti-sql/sql-agent-memory-prompt.md\n`;
}

describe('graphitiRules service', () => {
  let db: TaskPlannerDatabaseType;
  const fetchMock = vi.fn();

  beforeEach(async () => {
    db = new TaskPlannerDatabase(`TestGraphitiRules_${Date.now()}_${Math.random()}`);
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await db.delete();
  });

  function mockBundle(a: string, b: string, manifest = manifestFor(a, b)) {
    fetchMock.mockImplementation(async (url: string) => {
      const suffix = String(url);
      if (suffix.endsWith('SHA256SUMS')) return { ok: true, text: async () => manifest };
      if (suffix.endsWith('graphiti/graphiti-mcp-rules.md')) return { ok: true, text: async () => a };
      if (suffix.endsWith('graphiti-sql/sql-agent-memory-prompt.md')) return { ok: true, text: async () => b };
      throw new Error(`Unexpected fetch: ${suffix}`);
    });
  }

  it('returns both verified texts and applies them to the two MCP configs', async () => {
    mockBundle(RULE_BODY_A, RULE_BODY_B);
    expect(await loadVerifiedRules()).toEqual({ graphitiRules: RULE_BODY_A, sqlRules: RULE_BODY_B });

    await getMcpServers(db); // seed graphiti-banking
    const next = await applyGraphitiRules(db);
    const graphiti = next.find((s) => s.id === 'graphiti-banking');
    const svng = next.find((s) => s.id === 'svng-source');
    expect(graphiti?.instruction).toBe(RULE_BODY_A);
    expect(svng?.instruction).toBe(`${RULE_BODY_A}\n\n${RULE_BODY_B}`);
    expect(svng?.enabled).toBe(true);
    expect(svng?.desktopOnly).toBe(true);
    expect(svng?.name).toBe('SVNG Source MCP');
    expect(svng?.url).toBe('');
    expect((await getMcpServers(db)).find((s) => s.id === 'svng-source')?.instruction).toBe(
      `${RULE_BODY_A}\n\n${RULE_BODY_B}`
    );
  });

  it('preserves an existing graphiti-banking row and an existing svng-source URL', async () => {
    mockBundle(RULE_BODY_A, RULE_BODY_B);
    await saveMcpServers(
      [
        {
          id: 'graphiti-banking',
          name: 'Renamed Graphiti',
          url: 'http://localhost:9999/mcp',
          enabled: false,
          instruction: 'old rule',
          desktopOnly: false,
          description: 'keep me',
        },
        {
          id: 'svng-source',
          name: 'Old SVNG',
          url: 'http://localhost:7777/mcp',
          enabled: false,
          instruction: 'old sql rule',
        },
      ],
      db
    );
    const next = await applyGraphitiRules(db);
    expect(next.find((s) => s.id === 'graphiti-banking')).toMatchObject({
      name: 'Renamed Graphiti',
      url: 'http://localhost:9999/mcp',
      enabled: false,
      desktopOnly: false,
      description: 'keep me',
      instruction: RULE_BODY_A,
    });
    expect(next.find((s) => s.id === 'svng-source')).toMatchObject({
      url: 'http://localhost:7777/mcp',
      enabled: true,
      desktopOnly: true,
      name: 'SVNG Source MCP',
      instruction: `${RULE_BODY_A}\n\n${RULE_BODY_B}`,
    });
  });

  it('throws on a tampered rule body and leaves mcp_servers byte-identical', async () => {
    mockBundle(RULE_BODY_A, RULE_BODY_B);
    await getMcpServers(db);
    const before = await db.settings.get('mcp_servers');
    fetchMock.mockImplementation(async (url: string) => {
      const suffix = String(url);
      if (suffix.endsWith('SHA256SUMS')) return { ok: true, text: async () => manifestFor(RULE_BODY_A, RULE_BODY_B) };
      if (suffix.endsWith('graphiti/graphiti-mcp-rules.md')) return { ok: true, text: async () => RULE_BODY_A };
      if (suffix.endsWith('graphiti-sql/sql-agent-memory-prompt.md')) return { ok: true, text: async () => RULE_BODY_B + '\nTAMPERED' };
      throw new Error(`Unexpected fetch: ${suffix}`);
    });
    await expect(applyGraphitiRules(db)).rejects.toThrow(/SHA-256|khớp/i);
    expect(await db.settings.get('mcp_servers')).toEqual(before);
  });

  it('throws on a bad manifest hash and leaves mcp_servers byte-identical', async () => {
    await getMcpServers(db);
    const before = await db.settings.get('mcp_servers');
    const badManifest = `${'0'.repeat(64)}  graphiti/graphiti-mcp-rules.md\n${digest(RULE_BODY_B)}  graphiti-sql/sql-agent-memory-prompt.md\n`;
    mockBundle(RULE_BODY_A, RULE_BODY_B, badManifest);
    await expect(applyGraphitiRules(db)).rejects.toThrow(/SHA-256|khớp/i);
    expect(await db.settings.get('mcp_servers')).toEqual(before);
  });

  it('honors the configured BASE_URL when fetching bundled files', async () => {
    mockBundle(RULE_BODY_A, RULE_BODY_B);
    await loadVerifiedRules();
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls).toContain(`${import.meta.env.BASE_URL}ai-rules/SHA256SUMS`);
    expect(urls).toContain(`${import.meta.env.BASE_URL}ai-rules/graphiti/graphiti-mcp-rules.md`);
    expect(urls).toContain(`${import.meta.env.BASE_URL}ai-rules/graphiti-sql/sql-agent-memory-prompt.md`);
  });
});
