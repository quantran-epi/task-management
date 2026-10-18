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
