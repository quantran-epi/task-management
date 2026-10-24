import { describe, expect, it } from 'vitest';
import {
  ChatMessageGroundingSchema,
  GroundedAnswerJsonSchema,
  GroundedAnswerSchema,
  PersistedCitationSchema,
} from '../../src/services/ai/groundedAnswerSchemas';
import { generateId } from '../../src/utils/uuid';

const validAnswer = {
  schemaVersion: 1,
  language: 'en',
  conclusion: 'Procedure A calls procedure B.',
  claims: [
    {
      id: 'C1',
      text: 'Procedure A calls procedure B.',
      classification: 'DIRECT',
      citationIds: ['S1'],
      pathId: null,
    },
  ],
  unsupportedParts: [],
};

const validModalityDiagnostics = {
  fulltext: { status: 'ok', latencyMs: 3, itemCount: 1 },
  vector: { status: 'unavailable', latencyMs: 0, itemCount: 0 },
  graph: { status: 'ok', latencyMs: 4, itemCount: 1 },
};

const localCitation = {
  citationId: 'L1',
  documentId: generateId(),
  documentTitle: 'Local procedure notes',
  sectionAnchor: 'flow',
  lineStart: 2,
  lineEnd: 4,
  authority: 'local',
  evidenceClass: 'LOCAL',
  snapshotId: null,
  publishedContentHash: null,
  citedExcerpt: 'Procedure A calls procedure B.',
};

const serverCitation = {
  citationId: 'S1',
  documentId: generateId(),
  documentTitle: 'Published procedure notes',
  sectionAnchor: 'flow',
  lineStart: 2,
  lineEnd: 4,
  authority: 'server',
  evidenceClass: 'OBSERVED',
  snapshotId: 'gsnap_1234abcd',
  publishedContentHash: 'a'.repeat(64),
  citedExcerpt: 'Procedure A calls procedure B.',
};

describe('grounded answer trust boundary', () => {
  it('parses a valid grounded answer', () => {
    expect(GroundedAnswerSchema.safeParse(validAnswer).success).toBe(true);
  });

  it('rejects INFERRED claims without a pathId', () => {
    const result = GroundedAnswerSchema.safeParse({
      ...validAnswer,
      claims: [{ ...validAnswer.claims[0], classification: 'INFERRED', pathId: null }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects DIRECT claims with a pathId', () => {
    const result = GroundedAnswerSchema.safeParse({
      ...validAnswer,
      claims: [{ ...validAnswer.claims[0], pathId: 'P1' }],
    });
    expect(result.success).toBe(false);
  });

  it.each(['[1]', 'S0', 's1', 'L'])('rejects malformed citation ID %s', (citationId) => {
    const result = GroundedAnswerSchema.safeParse({
      ...validAnswer,
      claims: [{ ...validAnswer.claims[0], citationIds: [citationId] }],
    });
    expect(result.success).toBe(false);
  });

  it('enforces local and server citation provenance correlation', () => {
    expect(
      PersistedCitationSchema.safeParse({ ...localCitation, snapshotId: 'gsnap_1234abcd' })
        .success
    ).toBe(false);
    expect(
      PersistedCitationSchema.safeParse({ ...serverCitation, snapshotId: null }).success
    ).toBe(false);
  });

  it('allows fallback diagnostics locally but rejects incomplete server provenance', () => {
    // Local diagnostics describe attempted modalities only; fallback authority never gains graph paths.
    const localGrounding = {
      schemaVersion: 1,
      authority: 'local',
      outcome: 'LOCAL_FALLBACK_SYNTHESIS',
      answer: validAnswer,
      citations: [localCitation],
      paths: null,
      conflicts: null,
      scope: null,
      modalityDiagnostics: validModalityDiagnostics,
      coverageWarnings: [],
      fallbackReason: 'NETWORK_ERROR',
      routerVersion: null,
      promptVersion: 'grounded-v1',
      modelId: 'model-1',
      createdAt: '2026-10-11T00:00:00.000Z',
    };
    expect(ChatMessageGroundingSchema.safeParse(localGrounding).success).toBe(true);

    expect(
      ChatMessageGroundingSchema.safeParse({
        ...localGrounding,
        authority: 'server',
        outcome: 'READY',
        citations: [{ ...serverCitation, snapshotId: null }],
        paths: [],
        conflicts: [],
        scope: {
          setIds: [generateId()],
          routedScope: {
            domain: null,
            environment: null,
            version: null,
            comparisonMode: 'single',
          },
        },
        routerVersion: 'router-v1',
        fallbackReason: 'NONE',
      }).success
    ).toBe(false);
  });

  it('accepts valid live MCP citation with snapshotId mcp_live and publishedContentHash null', () => {
    const validMcpCitation = {
      citationId: 'M1',
      documentId: 'mcp:graphiti-banking:search_nodes',
      documentTitle: '[MCP] Graphiti Banking - search_nodes',
      sectionAnchor: '{"query":"iss_card"}',
      lineStart: 1,
      lineEnd: 1,
      authority: 'server' as const,
      evidenceClass: 'OBSERVED' as const,
      snapshotId: 'mcp_live',
      publishedContentHash: null,
      citedExcerpt: 'ISS_CARD table definition',
      evidenceKind: 'mcp_tool' as const,
      mcpMetadata: {
        serverId: 'graphiti-banking',
        serverName: 'Graphiti Banking',
        toolName: 'search_nodes',
      },
    };

    expect(PersistedCitationSchema.safeParse(validMcpCitation).success).toBe(true);

    const mcpGrounding = {
      schemaVersion: 1,
      authority: 'server',
      outcome: 'READY',
      answer: {
        ...validAnswer,
        claims: [
          {
            id: 'C1',
            text: 'Bảng ISS_CARD lưu thông tin phát hành thẻ.',
            classification: 'DIRECT',
            citationIds: ['M1'],
            pathId: null,
          },
        ],
      },
      citations: [validMcpCitation],
      paths: [],
      conflicts: [],
      scope: {
        setIds: [generateId()],
        routedScope: {
          domain: null,
          environment: null,
          version: null,
          comparisonMode: 'single',
        },
      },
      modalityDiagnostics: validModalityDiagnostics,
      coverageWarnings: [],
      fallbackReason: 'NONE',
      routerVersion: 'router-v1',
      promptVersion: 'grounded-v1',
      modelId: 'model-1',
      createdAt: '2026-10-21T00:00:00.000Z',
    };

    expect(ChatMessageGroundingSchema.safeParse(mcpGrounding).success).toBe(true);
  });

  it('rejects invalid live MCP citation combinations', () => {
    const validMcpCitation = {
      citationId: 'M1',
      documentId: 'mcp:graphiti-banking:search_nodes',
      documentTitle: '[MCP] Graphiti Banking - search_nodes',
      sectionAnchor: '{"query":"iss_card"}',
      lineStart: 1,
      lineEnd: 1,
      authority: 'server' as const,
      evidenceClass: 'OBSERVED' as const,
      snapshotId: 'mcp_live',
      publishedContentHash: null,
      citedExcerpt: 'ISS_CARD table definition',
      evidenceKind: 'mcp_tool' as const,
      mcpMetadata: {
        serverId: 'graphiti-banking',
        serverName: 'Graphiti Banking',
        toolName: 'search_nodes',
      },
    };

    // MCP citation cannot have LOCAL evidence class
    expect(
      PersistedCitationSchema.safeParse({ ...validMcpCitation, evidenceClass: 'LOCAL' }).success
    ).toBe(false);

    // MCP citation requires mcpMetadata
    const { mcpMetadata: _, ...withoutMetadata } = validMcpCitation;
    expect(PersistedCitationSchema.safeParse(withoutMetadata).success).toBe(false);

    // MCP citation cannot use static snapshot or null snapshot
    expect(
      PersistedCitationSchema.safeParse({ ...validMcpCitation, snapshotId: 'gsnap_1234abcd' }).success
    ).toBe(false);
    expect(
      PersistedCitationSchema.safeParse({ ...validMcpCitation, snapshotId: null }).success
    ).toBe(false);

    // Normal server citation cannot use mcp_live or null publishedContentHash
    expect(
      PersistedCitationSchema.safeParse({ ...serverCitation, snapshotId: 'mcp_live' }).success
    ).toBe(false);

    // Local citation cannot pose as mcp_tool
    expect(
      PersistedCitationSchema.safeParse({
        ...localCitation,
        evidenceKind: 'mcp_tool',
        mcpMetadata: validMcpCitation.mcpMetadata,
      }).success
    ).toBe(false);
  });

  it('supports up to 100 citations (e.g. 32 chunk items when graph is empty) without schema rejection', () => {
    const thirtyTwoCitations = Array.from({ length: 32 }, (_, i) => ({
      ...serverCitation,
      citationId: `S${i + 1}`,
      documentId: generateId(),
      documentTitle: `Doc ${i + 1}`,
      snapshotId: 'gsnap_00000001',
      publishedContentHash: 'a'.repeat(64),
      citedExcerpt: `Excerpt ${i + 1}`,
    }));

    const serverGrounding = {
      schemaVersion: 1,
      authority: 'server',
      outcome: 'DEGRADED',
      answer: validAnswer,
      citations: thirtyTwoCitations,
      paths: [],
      conflicts: [],
      scope: {
        setIds: [generateId()],
        routedScope: {
          domain: null,
          environment: null,
          version: null,
          comparisonMode: 'single',
        },
      },
      modalityDiagnostics: validModalityDiagnostics,
      coverageWarnings: [],
      fallbackReason: 'NONE',
      routerVersion: 'router-v1',
      promptVersion: 'grounded-v1',
      modelId: 'model-1',
      createdAt: '2026-10-17T00:00:00.000Z',
    };

    const parseResult = ChatMessageGroundingSchema.safeParse(serverGrounding);
    expect(parseResult.success).toBe(true);
  });

  describe('Phase 24 seed-only grounding persistence', () => {
    const snapshotId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    const seedUrn = 'urn:plannermate:oracle:DatabaseObject:MAIN1.EVT_EVENT';
    const seedEntity = {
      urn: seedUrn,
      canonicalName: 'EVT_EVENT',
      kind: 'DatabaseObject' as const,
      snapshotId,
    };

    const serverBase = {
      schemaVersion: 1 as const,
      authority: 'server' as const,
      outcome: 'READY' as const,
      answer: validAnswer,
      citations: [serverCitation],
      paths: [],
      conflicts: [],
      scope: {
        setIds: [generateId()],
        routedScope: {
          domain: null,
          environment: null,
          version: null,
          comparisonMode: 'single' as const,
        },
      },
      modalityDiagnostics: validModalityDiagnostics,
      coverageWarnings: [],
      fallbackReason: 'NONE' as const,
      routerVersion: 'router-v1',
      promptVersion: 'grounded-v1',
      modelId: 'model-1',
      createdAt: '2026-10-24T00:00:00.000Z',
    };

    const seedOnly = {
      ...serverBase,
      outcome: 'SEED_ONLY' as const,
      answer: null,
      citations: [],
      entities: [seedEntity],
      graphCounts: { entity: 1, edge: 0, path: 0 },
      stageDiagnostics: [
        {
          stage: 'neo4j_traversal',
          status: 'ok',
          latencyMs: 7,
          accepted: 1,
          rejected: 0,
          truncated: false,
          fallback: false,
          reasonCodes: ['SEED_FOUND_NO_RELATION'],
        },
      ],
      failedSeeds: [],
    };

    it('parses a historical record without any Phase 24 field', () => {
      const parsed = ChatMessageGroundingSchema.safeParse(serverBase);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.entities).toBeUndefined();
        expect(parsed.data.graphCounts).toBeUndefined();
        expect(parsed.data.stageDiagnostics).toBeUndefined();
        expect(parsed.data.failedSeeds).toBeUndefined();
      }
    });

    it('parses a seed-only record and preserves new fields with schemaVersion 1', () => {
      const parsed = ChatMessageGroundingSchema.safeParse(seedOnly);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.schemaVersion).toBe(1);
        expect(parsed.data.outcome).toBe('SEED_ONLY');
        expect(parsed.data.entities).toEqual([seedEntity]);
        expect(parsed.data.graphCounts).toEqual({ entity: 1, edge: 0, path: 0 });
        expect(parsed.data.stageDiagnostics?.[0]?.reasonCodes).toEqual([
          'SEED_FOUND_NO_RELATION',
        ]);
        expect(parsed.data.failedSeeds).toEqual([]);
      }
    });

    it('caps entities at 50 and rejects unknown kinds', () => {
      expect(
        ChatMessageGroundingSchema.safeParse({
          ...seedOnly,
          entities: Array.from({ length: 50 }, (_, i) => ({
            ...seedEntity,
            urn: `urn:plannermate:oracle:DatabaseObject:OBJ_${i}`,
          })),
        }).success
      ).toBe(true);
      expect(
        ChatMessageGroundingSchema.safeParse({
          ...seedOnly,
          entities: Array.from({ length: 51 }, (_, i) => ({
            ...seedEntity,
            urn: `urn:plannermate:oracle:DatabaseObject:OBJ_${i}`,
          })),
        }).success
      ).toBe(false);
      expect(
        ChatMessageGroundingSchema.safeParse({
          ...seedOnly,
          entities: [{ ...seedEntity, kind: 'MadeUpKind' }],
        }).success
      ).toBe(false);
    });

    it('rejects negative or incomplete graphCounts', () => {
      expect(
        ChatMessageGroundingSchema.safeParse({
          ...seedOnly,
          graphCounts: { entity: -1, edge: 0, path: 0 },
        }).success
      ).toBe(false);
      expect(
        ChatMessageGroundingSchema.safeParse({
          ...seedOnly,
          graphCounts: { entity: 1, edge: 0 },
        }).success
      ).toBe(false);
    });

    it('caps failedSeeds at 5 and rejects unknown reason codes', () => {
      const failedSeed = {
        urn: 'urn:plannermate:oracle:DatabaseObject:MISSING',
        reasonCode: 'SEED_NOT_FOUND' as const,
      };
      expect(
        ChatMessageGroundingSchema.safeParse({
          ...seedOnly,
          failedSeeds: Array.from({ length: 5 }, (_, i) => ({
            ...failedSeed,
            urn: `urn:plannermate:oracle:DatabaseObject:MISSING_${i}`,
          })),
        }).success
      ).toBe(true);
      expect(
        ChatMessageGroundingSchema.safeParse({
          ...seedOnly,
          failedSeeds: Array.from({ length: 6 }, (_, i) => ({
            ...failedSeed,
            urn: `urn:plannermate:oracle:DatabaseObject:MISSING_${i}`,
          })),
        }).success
      ).toBe(false);
      expect(
        ChatMessageGroundingSchema.safeParse({
          ...seedOnly,
          failedSeeds: [{ ...failedSeed, reasonCode: 'NOT_A_CODE' }],
        }).success
      ).toBe(false);
    });

    it('still enforces server-authority provenance when new fields are present', () => {
      for (const field of [
        'paths',
        'conflicts',
        'scope',
        'modalityDiagnostics',
        'routerVersion',
        'modelId',
      ] as const) {
        expect(
          ChatMessageGroundingSchema.safeParse({ ...seedOnly, [field]: null }).success
        ).toBe(false);
      }
    });
  });

  it('exports strict top-level and claim JSON Schema objects', () => {
    expect(GroundedAnswerJsonSchema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      properties: {
        claims: {
          type: 'array',
          items: { type: 'object', additionalProperties: false },
        },
      },
    });
  });
});
