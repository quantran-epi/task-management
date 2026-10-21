import { describe, it, expect } from 'vitest';
import { FederatedRetrievalBudgetsSchema } from '../../src/services/knowledge/retrievalProtocol';

describe('FederatedRetrievalBudgetsSchema validation', () => {
  it('accepts elapsedMs up to 300,000 ms (5 minutes)', () => {
    const valid = FederatedRetrievalBudgetsSchema.safeParse({
      concurrency: 4,
      elapsedMs: 300_000,
      maxSets: 10,
      maxItems: 50,
      maxEvidenceChars: 30_000,
    });
    expect(valid.success).toBe(true);
  });

  it('rejects elapsedMs exceeding 300,000 ms', () => {
    const invalid = FederatedRetrievalBudgetsSchema.safeParse({
      concurrency: 4,
      elapsedMs: 300_001,
      maxSets: 10,
      maxItems: 50,
      maxEvidenceChars: 30_000,
    });
    expect(invalid.success).toBe(false);
  });

  it('rejects elapsedMs below 100 ms', () => {
    const invalid = FederatedRetrievalBudgetsSchema.safeParse({
      concurrency: 4,
      elapsedMs: 99,
      maxSets: 10,
      maxItems: 50,
      maxEvidenceChars: 30_000,
    });
    expect(invalid.success).toBe(false);
  });
});
