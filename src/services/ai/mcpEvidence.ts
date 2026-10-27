import { sha256Hex } from '../../../knowledge-server/src/indexing/chunkHashPolicy';
import type { McpRetrievedItem } from './mcpRetrievalRunner';

/**
 * Atomic, faithfully-normalized MCP evidence. One record per fact/entity/attribute.
 * Nothing is dropped for relevance or size: only structural noise keys are removed,
 * and identical records are merged by identity (provenance kept).
 */

export interface McpEvidenceProvenance {
  serverId: string;
  serverName: string;
  toolName: string;
  args: Record<string, unknown>;
  page: number;
}

export interface McpEvidenceRecord {
  recordId: string;
  kind: 'entity' | 'fact' | 'attribute';
  subject?: string;
  relation?: string;
  object?: string;
  text: string;
  attributes: Record<string, unknown>;
  provenance: McpEvidenceProvenance[];
}

export interface McpNormalizationStats {
  items: number;
  records: number;
  deduped: number;
  noiseKeysStripped: number;
  nonJsonPayloads: number;
  entities: number;
  facts: number;
  attributes: number;
}

const NOISE_KEYS = new Set([
  'embedding',
  'name_embedding',
  'fact_embedding',
  'has_name_embedding',
  'vector',
  'buffer',
  'raw_chunks',
  'visualCoordinates',
]);

const FACT_RELATION_KEYS = ['edge_type', 'edge_name', 'relation_type', 'relationType'];
const ENTITY_KEY_FIELDS = ['graph_key', 'urn', 'name_raw', 'canonicalName', 'canonical_name'];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stripNoise(value: unknown, counter: { n: number }): unknown {
  if (Array.isArray(value)) return value.map((child) => stripNoise(child, counter));
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (NOISE_KEYS.has(key)) {
      counter.n += 1;
      continue;
    }
    out[key] = stripNoise(child, counter);
  }
  return out;
}

function asText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function factIdentity(obj: Record<string, unknown>): string | null {
  const relation = FACT_RELATION_KEYS.map((key) => obj[key]).find(
    (value) => typeof value === 'string' && value.length > 0
  ) as string | undefined;
  if (!relation) return null;
  if (typeof obj.fact !== 'string' || !obj.fact.trim()) return null;
  if (typeof obj.edge_key === 'string' && obj.edge_key.trim()) return `fact:${obj.edge_key}`;
  const subject = asText(obj.source_graph_key ?? obj.source_node_uuid ?? obj.subject ?? '');
  const object = asText(obj.target_graph_key ?? obj.target_node_uuid ?? obj.object ?? '');
  return `fact:${relation}|${subject}|${object}|${obj.fact}`;
}

function entityIdentity(obj: Record<string, unknown>): string | null {
  const keyField = ENTITY_KEY_FIELDS.find(
    (field) => typeof obj[field] === 'string' && (obj[field] as string).trim().length > 0
  );
  if (keyField) return `entity:${keyField}:${obj[keyField]}`;
  if (typeof obj.name === 'string' && obj.name.trim()) return `entity:name:${obj.name}`;
  return null;
}

function renderFact(obj: Record<string, unknown>): string {
  const relation = FACT_RELATION_KEYS.map((key) => obj[key]).find(
    (value) => typeof value === 'string'
  ) as string | undefined;
  const source = asText(
    obj.source_graph_key ?? obj.source_node_uuid ?? obj.source ?? ''
  );
  const target = asText(
    obj.target_graph_key ?? obj.target_node_uuid ?? obj.target ?? ''
  );
  const fact = asText(obj.fact);
  const parts = [fact || [source, relation, target].filter(Boolean).join(' ')];
  if (typeof obj.evidence === 'string' && obj.evidence.trim()) {
    parts.push(`evidence: ${obj.evidence}`);
  }
  if (typeof obj.confidence === 'number') parts.push(`confidence: ${obj.confidence}`);
  return parts.filter(Boolean).join(' | ');
}

function renderEntity(obj: Record<string, unknown>): string {
  const type =
    asText(obj.entity_type ?? obj.type ?? '') ||
    (Array.isArray(obj.labels) ? obj.labels.join('/') : '');
  const name = asText(
    obj.canonicalName ?? obj.canonical_name ?? obj.name_raw ?? obj.name ?? obj.graph_key ?? obj.urn
  );
  const summary = asText(obj.summary ?? obj.description ?? '');
  const prefix = type ? `[${type}] ` : '';
  return `${prefix}${name}${summary ? `: ${summary}` : ''}`;
}

/**
 * Splits a stripped payload into atomic records. Objects that look like a graph
 * fact or entity become their own record; everything else is preserved as-is in
 * a single attribute record so no server payload is lost.
 */
function collectAtoms(
  value: unknown,
  atoms: Array<{ kind: McpEvidenceRecord['kind']; identity: string; text: string; attributes: Record<string, unknown> }>
): void {
  if (Array.isArray(value)) {
    for (const child of value) collectAtoms(child, atoms);
    return;
  }
  if (!isPlainObject(value)) return;

  const factId = factIdentity(value);
  if (factId) {
    const attributes: Record<string, unknown> = {};
    if (isPlainObject(value.attributes)) attributes.attributes = value.attributes;
    if (value.evidence !== undefined) attributes.evidence = value.evidence;
    if (value.confidence !== undefined) attributes.confidence = value.confidence;
    atoms.push({
      kind: 'fact',
      identity: factId,
      text: renderFact(value),
      attributes,
    });
    return;
  }

  const entityId = entityIdentity(value);
  if (entityId) {
    const attributes: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (Array.isArray(child) || isPlainObject(child)) continue;
      if (key === 'summary' || key === 'description') continue;
      attributes[key] = child;
    }
    const extra = isPlainObject(value.attributes) ? value.attributes : {};
    atoms.push({
      kind: 'entity',
      identity: entityId,
      text: renderEntity(value),
      attributes: { ...attributes, ...extra },
    });
    // Entities can carry nested collections (neighbors, evidence, columns) — keep walking.
    for (const child of Object.values(value)) {
      if (Array.isArray(child) || isPlainObject(child)) collectAtoms(child, atoms);
    }
    return;
  }

  for (const child of Object.values(value)) collectAtoms(child, atoms);
}

function recordIdFor(serverId: string, toolName: string, identity: string): string {
  return sha256Hex(`${serverId}|${toolName}|${identity}`);
}

export interface NormalizedMcpEvidence {
  records: McpEvidenceRecord[];
  stats: McpNormalizationStats;
}

export function normalizeMcpEvidence(
  items: readonly McpRetrievedItem[],
  pageByItem?: readonly number[]
): NormalizedMcpEvidence {
  const byId = new Map<string, McpEvidenceRecord>();
  const stats: McpNormalizationStats = {
    items: items.length,
    records: 0,
    deduped: 0,
    noiseKeysStripped: 0,
    nonJsonPayloads: 0,
    entities: 0,
    facts: 0,
    attributes: 0,
  };
  const noiseCounter = { n: 0 };

  items.forEach((item, index) => {
    const provenance: McpEvidenceProvenance = {
      serverId: item.serverId,
      serverName: item.serverName,
      toolName: item.toolName,
      args: item.args,
      page: pageByItem?.[index] ?? item.page ?? 0,
    };

    let parsed: unknown;
    try {
      parsed = JSON.parse(item.rawResult);
    } catch {
      stats.nonJsonPayloads += 1;
      const recordId = recordIdFor(item.serverId, item.toolName, `text:${item.rawResult}`);
      const existing = byId.get(recordId);
      if (existing) existing.provenance.push(provenance);
      else {
        byId.set(recordId, {
          recordId,
          kind: 'attribute',
          text: item.rawResult,
          attributes: {},
          provenance: [provenance],
        });
      }
      return;
    }

    const stripped = stripNoise(parsed, noiseCounter);
    const atoms: Array<{
      kind: McpEvidenceRecord['kind'];
      identity: string;
      text: string;
      attributes: Record<string, unknown>;
    }> = [];
    collectAtoms(stripped, atoms);

    if (atoms.length === 0) {
      // Non-graph payload (e.g. group listing): keep the whole thing verbatim.
      atoms.push({
        kind: 'attribute',
        identity: `payload:${JSON.stringify(stripped)}`,
        text: JSON.stringify(stripped),
        attributes: {},
      });
    }

    for (const atom of atoms) {
      const recordId = recordIdFor(item.serverId, item.toolName, atom.identity);
      const existing = byId.get(recordId);
      if (existing) {
        stats.deduped += 1;
        existing.provenance.push(provenance);
        continue;
      }
      byId.set(recordId, {
        recordId,
        kind: atom.kind,
        text: atom.text,
        attributes: atom.attributes,
        provenance: [provenance],
      });
    }
  });

  const records = [...byId.values()];
  stats.records = records.length;
  stats.noiseKeysStripped = noiseCounter.n;
  for (const record of records) {
    if (record.kind === 'fact') stats.facts += 1;
    else if (record.kind === 'entity') stats.entities += 1;
    else stats.attributes += 1;
  }
  return { records, stats };
}

export interface PaginationHint {
  /** Request field to advance, for either offset or cursor style. */
  offsetField: string;
  limitField?: string;
  /** Exactly one of nextOffset / nextCursor is set. */
  nextOffset?: number;
  nextCursor?: string | number;
  total?: number;
  hasMore: boolean;
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Continuation key -> request field to set. No semantics beyond the prefix strip. */
const CURSOR_FIELDS: Record<string, string> = {
  nextCursor: 'cursor',
  next_cursor: 'cursor',
  cursor: 'cursor',
  nextPageToken: 'page_token',
  next_page_token: 'page_token',
  page_token: 'page_token',
};

const EXPLICIT_CURSOR_KEYS = ['nextCursor', 'next_cursor', 'nextPageToken', 'next_page_token'];

function readCursorHint(node: unknown): PaginationHint | null {
  if (!isPlainObject(node)) return null;

  let key: string | undefined = EXPLICIT_CURSOR_KEYS.find((k) => node[k] !== undefined);
  if (!key) {
    const ambiguous = ['cursor', 'page_token'].find((k) => node[k] !== undefined);
    // A bare cursor is likely the echo of the current request unless flagged as more.
    if (ambiguous && (node.has_more === true || node.truncated === true)) key = ambiguous;
  }
  if (!key) return null;

  const value = node[key];
  const valid =
    (typeof value === 'string' && value.length > 0) ||
    (typeof value === 'number' && Number.isFinite(value));
  if (!valid) return null;
  return {
    offsetField: CURSOR_FIELDS[key]!,
    nextCursor: value as string | number,
    hasMore: true,
  };
}

/**
 * Detects a deterministic continuation from a full parsed page. Generic shapes:
 * `{offset, limit, total}` / `{has_more}` offset pagination, and cursor pagination
 * via `nextCursor` / `next_cursor` / `nextPageToken` / `next_page_token`, or
 * `cursor` / `page_token` when accompanied by `has_more`/`truncated` true.
 * Nothing semantic — purely structural.
 */
export function extractPaginationHint(payload: unknown): PaginationHint | null {
  if (!isPlainObject(payload)) return null;

  const readContainer = (
    node: unknown,
    offsetField: string,
    limitField: string
  ): PaginationHint | null => {
    if (!isPlainObject(node)) return null;
    const offset = numberOrUndefined(node.offset);
    const limit = numberOrUndefined(node.limit);
    const total = numberOrUndefined(node.total);
    if (offset === undefined || limit === undefined) return null;
    if (total !== undefined && offset + limit >= total) return null;
    if (total === undefined && node.truncated !== true && node.has_more !== true) return null;
    return { offsetField, limitField, nextOffset: offset + limit, ...(total !== undefined ? { total } : {}), hasMore: true };
  };

  const neighbors = readContainer(payload.neighbors, 'neighbor_offset', 'neighbor_limit');
  const direct =
    neighbors ??
    readContainer(payload.evidence, 'evidence_offset', 'evidence_limit') ??
    readContainer(payload, 'offset', 'limit');
  if (direct) return direct;

  const nextOffset = numberOrUndefined(payload.next_offset);
  if (nextOffset !== undefined) {
    return { offsetField: 'offset', nextOffset, ...(numberOrUndefined(payload.total) !== undefined ? { total: numberOrUndefined(payload.total)! } : {}), hasMore: true };
  }

  // Cursor check runs last so offset pagination is unchanged. Root first,
  // then one level of plain-object children (neighbors/evidence/data/result).
  const rootHint = readCursorHint(payload);
  if (rootHint) return rootHint;
  for (const child of Object.values(payload)) {
    if (!isPlainObject(child)) continue;
    const hint = readCursorHint(child);
    if (hint) return hint;
  }
  return null;
}

/** Applies an offset/cursor to flat args or to a single wrapper object (e.g. `request`). */
export function applyPaginationArg(
  args: Record<string, unknown>,
  offsetField: string,
  nextOffset: string | number
): Record<string, unknown> {
  if (offsetField in args) return { ...args, [offsetField]: nextOffset };
  const wrapperKeys = Object.keys(args).filter((key) => isPlainObject(args[key]));
  if (wrapperKeys.length === 1) {
    const key = wrapperKeys[0]!;
    return { ...args, [key]: { ...(args[key] as Record<string, unknown>), [offsetField]: nextOffset } };
  }
  return { ...args, [offsetField]: nextOffset };
}

/** Compact record text for the planner's conversation history (never final evidence). */
export function formatRecordsForPlanner(
  records: readonly McpEvidenceRecord[],
  maxChars = 1500
): string {
  const lines: string[] = [];
  let used = 0;
  for (const record of records) {
    const line = `- ${record.text}`;
    if (used + line.length > maxChars) break;
    lines.push(line);
    used += line.length;
  }
  const omitted = records.length - lines.length;
  if (omitted > 0) lines.push(`(${omitted} more records retained for synthesis)`);
  return lines.join('\n');
}
