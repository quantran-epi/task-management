import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  applyPaginationArg,
  extractPaginationHint,
  normalizeMcpEvidence,
} from '../../src/services/ai/mcpEvidence';
import type { McpRetrievedItem } from '../../src/services/ai/mcpRetrievalRunner';

const ITEM = (rawResult: string, page = 0): McpRetrievedItem => ({
  serverId: 'graphiti-banking',
  serverName: 'Graphiti Banking MCP',
  toolName: 'get_catalog_object_context',
  args: { request: { graph_key: 'TABLE::BO::SHB.MAIN1.EVT_EVENT' } },
  rawResult,
  timestamp: '2026-10-26T00:00:00.000Z',
  page,
});

describe('mcpEvidence normalization', () => {
  it('parses the recorded 90 KB catalog response in full and keeps the writer fact', () => {
    // Recorded from docs/tauri.localhost_graph-fix-success.har (tool result text).
    const raw = readFileSync(
      resolve(__dirname, 'fixtures/mcpCatalogObjectContext.json'),
      'utf8'
    );
    expect(raw.length).toBeGreaterThan(80_000);

    const { records, stats } = normalizeMcpEvidence([ITEM(raw)]);

    const writerFacts = records.filter((record) => /WritesTo/.test(record.text));
    expect(writerFacts.length).toBeGreaterThan(0);
    expect(records.some((record) => record.text.includes('MAIN1.EVT_EVENT_TRG'))).toBe(true);
    // The whole neighbor set is preserved — the old 20k/2.5k slices cut this off.
    expect(stats.records).toBeGreaterThan(20);
    expect(records.some((record) => record.text.includes('EVT_EVENT'))).toBe(true);
  });

  it('merges identical records across calls while keeping both provenance entries', () => {
    const raw = JSON.stringify({
      neighbors: {
        edges: [
          {
            edge_type: 'WritesTo',
            edge_key: 'WritesTo|TRIGGER::BO::SHB.MAIN1.EVT_EVENT_TRG|TABLE::BO::SHB.MAIN1.EVT_EVENT',
            fact: 'TRIGGER::BO::SHB.MAIN1.EVT_EVENT_TRG WritesTo TABLE::BO::SHB.MAIN1.EVT_EVENT',
          },
        ],
      },
    });

    const { records, stats } = normalizeMcpEvidence([ITEM(raw, 0), ITEM(raw, 1)]);
    const fact = records.find((record) => record.kind === 'fact');
    expect(fact?.provenance.map((entry) => entry.page)).toEqual([0, 1]);
    expect(stats.deduped).toBe(1);
  });

  it('strips embeddings but keeps every real attribute', () => {
    const raw = JSON.stringify({
      nodes: [
        { name: 'COLUMN::BO::SHB.MAIN1.EVT_EVENT.ID', name_embedding: [0.1, 0.2], summary: 'id column' },
      ],
    });
    const { records, stats } = normalizeMcpEvidence([ITEM(raw)]);
    expect(stats.noiseKeysStripped).toBe(1);
    expect(records.some((record) => record.text.includes('COLUMN::BO::SHB.MAIN1.EVT_EVENT.ID'))).toBe(
      true
    );
    expect(JSON.stringify(records)).not.toContain('0.1');
  });

  it('keeps non-JSON payloads verbatim instead of slicing them', () => {
    const raw = 'Columns for EVT_EVENT: ' + 'x'.repeat(30_000);
    const { records, stats } = normalizeMcpEvidence([ITEM(raw)]);
    expect(stats.nonJsonPayloads).toBe(1);
    expect(records[0]?.text).toBe(raw);
  });

  it('detects catalog neighbor pagination and applies it inside the request wrapper', () => {
    const payload = { neighbors: { offset: 0, limit: 100, total: 249, truncated: true } };
    const hint = extractPaginationHint(payload);
    expect(hint).toMatchObject({ offsetField: 'neighbor_offset', nextOffset: 100, hasMore: true });

    const args = { request: { graph_key: 'TABLE::BO::SHB.MAIN1.EVT_EVENT' } };
    expect(applyPaginationArg(args, hint!.offsetField, hint!.nextOffset!)).toEqual({
      request: { graph_key: 'TABLE::BO::SHB.MAIN1.EVT_EVENT', neighbor_offset: 100 },
    });
  });

  it('reports no further page when the catalog already returned everything', () => {
    expect(extractPaginationHint({ neighbors: { offset: 0, limit: 100, total: 49 } })).toBeNull();
  });

  it('extracts structural cursor continuations', () => {
    expect(extractPaginationHint({ nextCursor: 'abc' })).toMatchObject({
      offsetField: 'cursor',
      nextCursor: 'abc',
      hasMore: true,
    });
    expect(extractPaginationHint({ neighbors: { next_cursor: 'n2', has_more: true } })).toMatchObject({
      offsetField: 'cursor',
      nextCursor: 'n2',
    });
    expect(extractPaginationHint({ cursor: 'c', has_more: true })).toMatchObject({
      offsetField: 'cursor',
      nextCursor: 'c',
    });
    // Bare cursor is likely the echo of the current request.
    expect(extractPaginationHint({ cursor: 'c' })).toBeNull();
    expect(extractPaginationHint({ nextCursor: null })).toBeNull();
  });

  it('applies a string cursor inside the request wrapper', () => {
    expect(
      applyPaginationArg({ request: { graph_key: 'KEY' } }, 'cursor', 'abc')
    ).toEqual({ request: { graph_key: 'KEY', cursor: 'abc' } });
  });
});
