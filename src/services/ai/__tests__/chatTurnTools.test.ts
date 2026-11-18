import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import * as chatTurnTools from '../chatTurnTools';
import { TaskPlannerDatabase } from '../../../db';
import { AI_DATABASE_TOOLS, normalizeToolName } from '../aiTools';
import { TEAM_TOOL_DEFINITIONS } from '../office/teamTools';
import { discoverAllMcpTools } from '../mcpClient';
import { getGraphitiMcpToolDefinitions } from '../graphitiMcpClient';

vi.mock('../mcpClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../mcpClient')>();
  return { ...actual, discoverAllMcpTools: vi.fn() };
});

vi.mock('../graphitiMcpClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../graphitiMcpClient')>();
  return { ...actual, getGraphitiMcpToolDefinitions: vi.fn() };
});

const mockDiscover = vi.mocked(discoverAllMcpTools);
const mockGraphiti = vi.mocked(getGraphitiMcpToolDefinitions);

interface CatalogEntryShape {
  tool: { function: { name: string; description: string; parameters: unknown } };
  source: 'builtin' | 'team' | 'mcp' | 'graphiti';
  isMutationTool: boolean;
  usage: { labels: string[]; references: string[] };
}

/**
 * Namespace access keeps the RED phase a genuine assertion failure instead of an
 * ESM named-export load error when getAllAvailableToolDefinitions does not exist yet.
 */
async function catalog(db: TaskPlannerDatabase): Promise<CatalogEntryShape[]> {
  const fn = (chatTurnTools as unknown as Record<string, unknown>)[
    'getAllAvailableToolDefinitions'
  ];
  expect(typeof fn).toBe('function');
  return (fn as (database: TaskPlannerDatabase) => Promise<CatalogEntryShape[]>)(db);
}

describe('getAllAvailableToolDefinitions (tool catalog aggregate)', () => {
  let db: TaskPlannerDatabase;

  beforeEach(() => {
    db = new TaskPlannerDatabase(`TestToolCatalog_${Date.now()}_${Math.random()}`);
    mockDiscover.mockResolvedValue([]);
    mockGraphiti.mockResolvedValue([]);
  });

  afterEach(async () => {
    await db.delete();
    vi.clearAllMocks();
  });

  it('includes every builtin and team tool exactly once after name normalization', async () => {
    const entries = await catalog(db);
    const names = entries.map((entry) => normalizeToolName(entry.tool.function.name));
    const builtinNames = AI_DATABASE_TOOLS.map((tool) => normalizeToolName(tool.function.name));
    const teamNames = TEAM_TOOL_DEFINITIONS.map((tool) => normalizeToolName(tool.function.name));

    for (const name of [...builtinNames, ...teamNames]) {
      expect(names).toContain(name);
    }
    expect(new Set(names).size).toBe(names.length);
    for (const entry of entries) {
      expect(['builtin', 'team', 'mcp', 'graphiti']).toContain(entry.source);
      expect(typeof entry.isMutationTool).toBe('boolean');
      expect(Array.isArray(entry.usage.labels)).toBe(true);
      expect(Array.isArray(entry.usage.references)).toBe(true);
    }
  });

  it('annotates query_tasks with builtin source and verified chat + team usage references', async () => {
    const entries = await catalog(db);
    const queryTasks = entries.find(
      (entry) => normalizeToolName(entry.tool.function.name) === 'query_tasks'
    );
    expect(queryTasks).toBeDefined();
    expect(queryTasks?.source).toBe('builtin');
    expect(queryTasks?.isMutationTool).toBe(false);
    expect(queryTasks?.usage.labels).toEqual(expect.arrayContaining(['Chat thường', 'Agent nhóm']));
    expect(queryTasks?.usage.references).toEqual(
      expect.arrayContaining(['AIChatDrawer.tsx:1802', 'teamRunCoordinator.ts:1311'])
    );
  });

  it('points SSH/Oracle tool usage at the gated dispatch sites (quick cz2)', async () => {
    const entries = await catalog(db);
    const find = (name: string) =>
      entries.find((entry) => normalizeToolName(entry.tool.function.name) === name);
    for (const name of ['ssh_read_file_page', 'ssh_list_dir', 'ssh_grep_files', 'oracle_query', 'oracle_describe']) {
      const entry = find(name);
      expect(entry).toBeDefined();
      expect(entry?.usage.labels.join(' ')).toContain('gated');
      const refs = entry?.usage.references.join(' ') ?? '';
      expect(refs).toContain('teamRunCoordinator.ts');
      expect(refs).toContain('AIChatDrawer.tsx');
      expect(refs).toContain('telegramHeadlessWorker.ts');
      expect(refs).toContain('telegramMutationSession.ts');
      expect(refs).not.toContain(':1311');
      expect(refs).not.toContain(':1802');
    }
  });

  it('annotates team tools, mutation tools, and argument-independent mutation detection', async () => {
    const entries = await catalog(db);
    const find = (name: string) =>
      entries.find((entry) => normalizeToolName(entry.tool.function.name) === name);

    expect(find('search_team_history')?.source).toBe('team');
    expect(find('search_team_history')?.usage.references).toEqual(
      expect.arrayContaining(['teamRunCoordinator.ts:1323'])
    );
    expect(find('create_task')?.isMutationTool).toBe(true);
    expect(find('manage_reminders')?.isMutationTool).toBe(true);
  });

  it('degrades gracefully when MCP discovery rejects and Graphiti returns no tools', async () => {
    mockDiscover.mockRejectedValue(new Error('offline'));
    mockGraphiti.mockResolvedValue([]);
    const entries = await catalog(db);
    const names = entries.map((entry) => normalizeToolName(entry.tool.function.name));
    expect(names).toContain('query_tasks');
    expect(names).toContain('search_team_history');
    expect(entries.some((entry) => entry.source === 'builtin')).toBe(true);
    expect(entries.some((entry) => entry.source === 'team')).toBe(true);
  });

  it('includes MCP and Graphiti tools with their own source labels when discovery succeeds', async () => {
    mockDiscover.mockResolvedValue([
      {
        type: 'function',
        function: {
          name: 'mcp_custom_lookup',
          description: '[Docs] custom lookup',
          parameters: { type: 'object', properties: {} },
        },
      },
    ]);
    mockGraphiti.mockResolvedValue([
      {
        type: 'function',
        function: {
          name: 'graphiti_search',
          description: 'Graphiti local search',
          parameters: { type: 'object', properties: {} },
        },
      },
    ]);
    const entries = await catalog(db);
    const mcp = entries.find((entry) => entry.tool.function.name === 'mcp_custom_lookup');
    const graphiti = entries.find((entry) => entry.tool.function.name === 'graphiti_search');
    expect(mcp?.source).toBe('mcp');
    expect(mcp?.usage.references.join(' ')).toContain('mcpClient.ts:402');
    expect(graphiti?.source).toBe('graphiti');
    expect(graphiti?.usage.references.join(' ')).toContain('graphitiMcpClient.ts:240');
  });

  it('keeps getToolsForTurn filtering unchanged', () => {
    const tools = chatTurnTools.getToolsForTurn(false);
    const artifactTools = ['get_artifact', 'patch_artifact_section'];
    const expected = AI_DATABASE_TOOLS.filter(
      (tool) => !artifactTools.includes(normalizeToolName(tool.function.name))
    ).map((tool) => normalizeToolName(tool.function.name));
    expect(tools.map((tool) => normalizeToolName(tool.function.name))).toEqual(expected);
  });
});
