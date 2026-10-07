import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../../db';
import {
  getMcpServers,
  saveMcpServers,
  upsertMcpServer,
  deleteMcpServer,
  toggleMcpServer,
  getEnabledMcpInstructions,
  resetMcpClientForTests,
  DEFAULT_MCP_SERVERS,
  DEFAULT_GRAPHITI_INSTRUCTION,
  type McpServerConfig,
} from '../mcpClient';

describe('mcpClient service', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    db = new TaskPlannerDatabase(`TestMcpDb_${Date.now()}_${Math.random()}`);
    resetMcpClientForTests();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('seeds default Graphiti Banking MCP when settings are empty', async () => {
    const servers = await getMcpServers(db);
    expect(servers.length).toBe(1);
    expect(servers[0]?.id).toBe('graphiti-banking');
    expect(servers[0]?.name).toBe('Graphiti Banking MCP');
    expect(servers[0]?.url).toBe(DEFAULT_MCP_SERVERS[0]?.url);
    expect(servers[0]?.enabled).toBe(true);
    expect(servers[0]?.instruction).toBe(DEFAULT_GRAPHITI_INSTRUCTION);
  });

  it('supports saving and retrieving custom MCP servers', async () => {
    const customList: McpServerConfig[] = [
      {
        id: 'server-1',
        name: 'Custom Docs MCP',
        url: 'http://localhost:8000/mcp',
        enabled: true,
        instruction: 'Use for internal docs',
      },
    ];
    await saveMcpServers(customList, db);
    const retrieved = await getMcpServers(db);
    expect(retrieved).toEqual(customList);
  });

  it('upserts a new server and updates an existing server', async () => {
    await getMcpServers(db); // Seed
    const newServer: McpServerConfig = {
      id: 'jira-mcp',
      name: 'Jira Integration',
      url: 'https://jira.corp.internal/mcp',
      enabled: true,
      instruction: 'Query Jira tickets',
    };
    const updated = await upsertMcpServer(newServer, db);
    expect(updated.length).toBe(2);
    expect(updated.find((s) => s.id === 'jira-mcp')?.name).toBe('Jira Integration');

    // Update existing server
    const modified = await upsertMcpServer(
      {
        ...newServer,
        name: 'Jira Enterprise',
        url: 'https://jira.corp.internal/mcp/',
      },
      db
    );
    expect(modified.length).toBe(2);
    const found = modified.find((s) => s.id === 'jira-mcp');
    expect(found?.name).toBe('Jira Enterprise');
    expect(found?.url).toBe('https://jira.corp.internal/mcp'); // sanitized trailing slash
  });

  it('deletes an MCP server by ID', async () => {
    await getMcpServers(db); // Seed
    const next = await deleteMcpServer('graphiti-banking', db);
    expect(next.length).toBe(0);
    const fresh = await getMcpServers(db);
    expect(fresh.length).toBe(0);
  });

  it('toggles server enabled status', async () => {
    await getMcpServers(db);
    const toggled = await toggleMcpServer('graphiti-banking', false, db);
    expect(toggled[0]?.enabled).toBe(false);
    const reloaded = await getMcpServers(db);
    expect(reloaded[0]?.enabled).toBe(false);
  });

  it('concatenates enabled MCP instructions and ignores disabled ones', async () => {
    const servers: McpServerConfig[] = [
      {
        id: 's1',
        name: 'Server One',
        url: 'http://localhost:3001/mcp',
        enabled: true,
        instruction: 'Rules for server one',
      },
      {
        id: 's2',
        name: 'Server Two',
        url: 'http://localhost:3002/mcp',
        enabled: false,
        instruction: 'Rules for server two',
      },
      {
        id: 's3',
        name: 'Server Three',
        url: 'http://localhost:3003/mcp',
        enabled: true,
        instruction: 'Rules for server three',
      },
    ];
    await saveMcpServers(servers, db);

    const instructions = await getEnabledMcpInstructions(db);
    expect(instructions).toContain('Rules for server one');
    expect(instructions).toContain('Rules for server three');
    expect(instructions).not.toContain('Rules for server two');
  });

  it('rejects invalid URL schemes during upsert', async () => {
    await expect(
      upsertMcpServer(
        {
          id: 'bad-server',
          name: 'Bad',
          url: 'ftp://fileserver/mcp',
          enabled: true,
          instruction: '',
        },
        db
      )
    ).rejects.toThrow(/Địa chỉ máy chủ MCP không hợp lệ/);
  });
});
