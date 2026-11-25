import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import {
  DEFAULT_MCP_SERVERS,
  getMcpServers,
  saveMcpServers,
  type McpServerConfig,
} from './mcpClient';

const BASE = import.meta.env.BASE_URL.endsWith('/')
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;

export const RULES_BASE_URL = `${BASE}ai-rules/`;

export interface VerifiedRules {
  graphitiRules: string;
  sqlRules: string;
}

const RULE_PATHS = {
  graphiti: 'graphiti/graphiti-mcp-rules.md',
  sql: 'graphiti-sql/sql-agent-memory-prompt.md',
} as const;

function webCrypto(): Pick<Crypto, 'subtle'> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('Không tìm thấy Web Crypto để kiểm tra SHA-256.');
  return { subtle };
}

async function fetchText(url: string, fetchImpl: typeof fetch): Promise<string> {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`Không tải được ${url}: HTTP ${res.status}`);
  return res.text();
}

function parseManifest(text: string): Map<string, string> {
  const entries = new Map<string, string>();
  for (const raw of text.split(/\r?\n/)) {
    const match = raw.match(/^\s*([0-9a-fA-F]{64})\s+\**\s*(.+?)\s*$/);
    if (!match) continue;
    const [, hash, rawPath] = match;
    const path = rawPath!.replace(/^\.\//, '').replace(/\\/g, '/');
    if (entries.has(path)) throw new Error(`SHA256SUMS có mục trùng lặp: ${path}`);
    entries.set(path, hash!.toLowerCase());
  }
  return entries;
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await webCrypto().subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Fetch the manifest and both rule files, verifying every byte before any settings write. */
export async function loadVerifiedRules(fetchImpl: typeof fetch = fetch): Promise<VerifiedRules> {
  const manifest = parseManifest(await fetchText(`${RULES_BASE_URL}SHA256SUMS`, fetchImpl));
  if (!manifest.has(RULE_PATHS.graphiti) || !manifest.has(RULE_PATHS.sql)) {
    throw new Error('SHA256SUMS thiếu một trong hai tệp luật Graphiti/SQL.');
  }
  const [graphitiResponse, sqlResponse] = await Promise.all([
    fetchText(`${RULES_BASE_URL}${RULE_PATHS.graphiti}`, fetchImpl),
    fetchText(`${RULES_BASE_URL}${RULE_PATHS.sql}`, fetchImpl),
  ]);
  const [graphitiHash, sqlHash] = await Promise.all([
    sha256Hex(graphitiResponse),
    sha256Hex(sqlResponse),
  ]);
  if (graphitiHash !== manifest.get(RULE_PATHS.graphiti) || sqlHash !== manifest.get(RULE_PATHS.sql)) {
    throw new Error('SHA-256 của tệp luật không khớp SHA256SUMS; không áp dụng luật.');
  }
  return { graphitiRules: graphitiResponse, sqlRules: sqlResponse };
}

/**
 * Verify the bundled rule bytes, then write both rows in ONE read-modify-write so the second
 * update cannot clobber the first. `svng-source` keeps its existing URL (possibly empty) — no
 * endpoint is embedded here; the user fills it in through the edit form.
 */
export async function applyGraphitiRules(
  db: TaskPlannerDatabase = defaultDb
): Promise<McpServerConfig[]> {
  const { graphitiRules, sqlRules } = await loadVerifiedRules();
  const servers = await getMcpServers(db);
  const next = servers.map((server) =>
    server.id === 'graphiti-banking' ? { ...server, instruction: graphitiRules } : server
  );
  if (!next.some((server) => server.id === 'graphiti-banking')) {
    next.unshift({ ...DEFAULT_MCP_SERVERS[0]!, instruction: graphitiRules });
  }
  const svngIndex = next.findIndex((server) => server.id === 'svng-source');
  const svng: McpServerConfig = {
    ...(svngIndex >= 0 ? next[svngIndex]! : {}),
    id: 'svng-source',
    name: 'SVNG Source MCP',
    url: svngIndex >= 0 ? next[svngIndex]!.url : '',
    enabled: true,
    desktopOnly: true,
    // graphiti-sql loads both files: the shared Graphiti rules first, then its SQL memory
    // prompt. graphiti-banking above keeps only the shared text.
    instruction: `${graphitiRules}\n\n${sqlRules}`,
  };
  if (svngIndex >= 0) next[svngIndex] = svng;
  else next.push(svng);
  await saveMcpServers(next, db);
  return next;
}
