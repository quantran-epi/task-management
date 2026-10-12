import { describe, it, expect } from 'vitest';
import { SmokeEvidenceSchema, validateAndFormatEvidence } from '../src/acceptance/evidence.js';

describe('SmokeEvidenceSchema', () => {
  const validPayload = {
    executedAt: '2026-10-12T10:00:00.000Z',
    environment: 'shb-k8s-internal',
    activeSnapshotId: 'gsnap_0123456789abcdef',
    counts: {
      nodeCount: 42,
      factCount: 85,
      quarantineCount: 2,
      conflictCount: 0,
    },
    cases: [
      {
        caseId: 'SMOKE-01-IDENTIFIER',
        status: 'PASS',
        fastPath: true,
        modalityStatus: {
          fulltext: { status: 'ok', latencyMs: 12, itemCount: 1 },
          vector: { status: 'ok', latencyMs: 45, itemCount: 1 },
          graph: { status: 'ok', latencyMs: 20, itemCount: 1 },
        },
        durationMs: 145,
        citationsCount: 1,
      },
    ],
    restartPersistence: {
      status: 'PASS',
      preRestartSnapshotId: 'gsnap_0123456789abcdef',
      postRestartSnapshotId: 'gsnap_0123456789abcdef',
      indexesOnline: true,
    },
  };

  it('validates a conformant metadata-only payload', () => {
    const parsed = SmokeEvidenceSchema.parse(validPayload);
    expect(parsed.activeSnapshotId).toBe('gsnap_0123456789abcdef');
    expect(parsed.cases).toHaveLength(1);
    expect(parsed.cases[0]?.status).toBe('PASS');
  });

  it('strictly rejects payloads containing document excerpts or snippets (D-23)', () => {
    const invalidWithExcerpt = {
      ...validPayload,
      cases: [
        {
          ...validPayload.cases[0],
          excerpt: 'Snippet of secret markdown text',
        },
      ],
    };

    expect(() => SmokeEvidenceSchema.parse(invalidWithExcerpt)).toThrow();
  });

  it('strictly rejects payloads containing snippet or body fields (D-23)', () => {
    const invalidWithSnippet = {
      ...validPayload,
      cases: [
        {
          ...validPayload.cases[0],
          rawSnippet: 'raw text',
        },
      ],
    };

    expect(() => SmokeEvidenceSchema.parse(invalidWithSnippet)).toThrow();

    const invalidWithBody = {
      ...validPayload,
      body: 'Some document content',
    };

    expect(() => SmokeEvidenceSchema.parse(invalidWithBody)).toThrow();
  });

  it('strictly rejects payloads containing credentials or tokens (D-23)', () => {
    const invalidWithToken = {
      ...validPayload,
      token: 'bearer-secret-token',
    };
    expect(() => SmokeEvidenceSchema.parse(invalidWithToken)).toThrow();

    const invalidWithPassword = {
      ...validPayload,
      password: 'neo4jpassword',
    };
    expect(() => SmokeEvidenceSchema.parse(invalidWithPassword)).toThrow();
  });

  it('validateAndFormatEvidence successfully formats and validates valid input', () => {
    const formatted = validateAndFormatEvidence(validPayload);
    expect(formatted.environment).toBe('shb-k8s-internal');
    expect(formatted.counts.nodeCount).toBe(42);
  });
});
