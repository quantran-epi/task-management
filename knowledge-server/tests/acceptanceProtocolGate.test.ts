import { describe, expect, it } from 'vitest';
import {
  assertMetadataOnlyEvidence,
  validateAcceptanceEvidence,
  ProtocolGateViolationError,
} from '../src/acceptance/protocolGate.js';

describe('Acceptance Protocol Gate: Privacy & Metadata-Only Invariants', () => {
  const validPayload = {
    timestamp: '2026-10-14T08:00:00.000Z',
    gitCommit: '471320fa1234567890abcdef',
    environment: 'canary' as const,
    totalCases: 2,
    passedCases: 2,
    failedCases: 0,
    blockedCases: 0,
    results: [
      {
        caseId: 'T1',
        intent: 'query_knowledge' as const,
        outcome: 'READY' as const,
        fastPath: true,
        latencyMs: 145,
        chunkCount: 2,
        pathCount: 0,
        snapshotId: 'gsnap_0123456789abcdef',
        citationsVerified: true,
        errorCodes: [],
      },
      {
        caseId: 'T2',
        intent: 'query_knowledge' as const,
        outcome: 'READY' as const,
        fastPath: false,
        latencyMs: 320,
        chunkCount: 3,
        pathCount: 1,
        snapshotId: 'gsnap_0123456789abcdef',
        citationsVerified: true,
        errorCodes: [],
      },
    ],
  };

  it('accepts clean metadata-only evidence payloads', () => {
    expect(() => assertMetadataOnlyEvidence(validPayload)).not.toThrow();
    const validated = validateAcceptanceEvidence(validPayload);
    expect(validated.passedCases).toBe(2);
    expect(validated.results[0].caseId).toBe('T1');
  });

  it('rejects payloads containing blacklisted property names (query, excerpt, prompt)', () => {
    const dirty1 = {
      ...validPayload,
      results: [
        {
          ...validPayload.results[0],
          query: 'MAIN1.FCL_CYCLE_COUNTER',
        },
      ],
    };
    expect(() => assertMetadataOnlyEvidence(dirty1)).toThrow(
      ProtocolGateViolationError
    );

    const dirty2 = {
      ...validPayload,
      promptText: 'System prompt instructions',
    };
    expect(() => assertMetadataOnlyEvidence(dirty2)).toThrow(
      /Disallowed sensitive field/
    );
  });

  it('rejects payloads containing credit card PAN patterns in strings', () => {
    const dirtyWithPan = {
      ...validPayload,
      results: [
        {
          ...validPayload.results[0],
          errorCodes: ['CARD_FAIL_4111111111111111'],
        },
      ],
    };
    expect(() => assertMetadataOnlyEvidence(dirtyWithPan)).toThrow(
      /Sensitive string pattern matched/
    );
  });

  it('rejects payloads containing long API keys or bearer tokens in strings', () => {
    const dirtyWithKey = {
      ...validPayload,
      results: [
        {
          ...validPayload.results[0],
          errorCodes: ['Bearer sk-live-9router-secret-key-1234567890abcdef'],
        },
      ],
    };
    expect(() => assertMetadataOnlyEvidence(dirtyWithKey)).toThrow(
      /Sensitive string pattern matched/
    );
  });
});
