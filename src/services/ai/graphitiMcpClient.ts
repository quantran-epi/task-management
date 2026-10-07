import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import type { AiToolDefinition } from './aiTools';
import {
  DEFAULT_GRAPHITI_INSTRUCTION,
  DEFAULT_MCP_SERVERS,
  getMcpServers,
  upsertMcpServer,
  toggleMcpServer,
  discoverAllMcpTools,
  executeDynamicMcpTool,
  testMcpServerConnection,
  resetMcpClientForTests,
} from './mcpClient';

export const DEFAULT_GRAPHITI_MCP_ENDPOINT = DEFAULT_MCP_SERVERS[0]!.url;
export const GRAPHITI_ENABLED_SETTINGS_KEY = 'graphiti_mcp_enabled';

const GRAPHITI_TOOL_NAMES = [
  'list_advertised_groups',
  'search_nodes',
  'search_memory_facts',
  'get_catalog_object_context',
] as const;
const GRAPHITI_TOOL_NAME_SET = new Set<string>(GRAPHITI_TOOL_NAMES);

export function isGraphitiMcpTool(name: string): boolean {
  return GRAPHITI_TOOL_NAME_SET.has(name);
}

export async function getGraphitiMcpEndpoint(
  db: TaskPlannerDatabase = defaultDb
): Promise<string> {
  const servers = await getMcpServers(db);
  const graphiti = servers.find((s) => s.id === 'graphiti-banking') || servers[0];
  return graphiti ? graphiti.url : DEFAULT_GRAPHITI_MCP_ENDPOINT;
}

export async function setGraphitiMcpEndpoint(
  endpoint: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  const servers = await getMcpServers(db);
  const existing = servers.find((s) => s.id === 'graphiti-banking') || servers[0];
  if (existing) {
    await upsertMcpServer({ ...existing, url: endpoint }, db);
  }
}

export async function isGraphitiMcpEnabled(
  db: TaskPlannerDatabase = defaultDb
): Promise<boolean> {
  const servers = await getMcpServers(db);
  const graphiti = servers.find((s) => s.id === 'graphiti-banking') || servers[0];
  return graphiti ? graphiti.enabled : true;
}

export async function setGraphitiMcpEnabled(
  enabled: boolean,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  const servers = await getMcpServers(db);
  const graphiti = servers.find((s) => s.id === 'graphiti-banking') || servers[0];
  if (graphiti) {
    await toggleMcpServer(graphiti.id, enabled, db);
  }
}

export function getGraphitiMcpToolDefinitions(
  db: TaskPlannerDatabase = defaultDb
): Promise<AiToolDefinition[]> {
  return discoverAllMcpTools(db);
}

export async function testGraphitiMcpConnection(
  customEndpoint?: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<{ ok: boolean; message: string; toolsCount?: number }> {
  const servers = await getMcpServers(db);
  const target = servers.find((s) => s.id === 'graphiti-banking') || servers[0] || {
    id: 'graphiti-banking',
    name: 'Graphiti Banking MCP',
    url: customEndpoint || DEFAULT_GRAPHITI_MCP_ENDPOINT,
    enabled: true,
    instruction: DEFAULT_GRAPHITI_INSTRUCTION,
    desktopOnly: true,
  };
  return testMcpServerConnection({
    ...target,
    url: customEndpoint || target.url,
  });
}

export async function executeGraphitiMcpTool(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  return executeDynamicMcpTool(name, args, defaultDb);
}

export function resetGraphitiMcpClientForTests(): void {
  resetMcpClientForTests();
}
