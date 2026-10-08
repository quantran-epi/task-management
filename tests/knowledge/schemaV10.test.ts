// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  PublishPrimaryStateSchema,
  DocumentSetSchema,
  PublishedDocumentMetadataSchema,
  PublishAttemptCacheSchema,
  DlpAuditRecordSchema,
} from '../../src/validation/knowledgeSchemas';

describe('Phase 16 Knowledge Validation Schemas (D-01, D-08, D-18, D-27, D-29, T-16-02)', () => {
  describe('PublishPrimaryStateSchema (D-27)', () => {
    it('accepts exactly the six D-27 primary states', () => {
      const allowedStates = [
        'Never published',
        'In sync',
        'Local changes',
        'Publishing',
        'Warning',
        'Failed',
      ] as const;

      for (const state of allowedStates) {
        expect(PublishPrimaryStateSchema.parse(state)).toBe(state);
      }
    });

    it('rejects connectivity pseudo-states and arbitrary strings', () => {
      expect(() => PublishPrimaryStateSchema.parse('Offline')).toThrow();
      expect(() => PublishPrimaryStateSchema.parse('Disconnected')).toThrow();
      expect(() => PublishPrimaryStateSchema.parse('Syncing')).toThrow();
      expect(() => PublishPrimaryStateSchema.parse('Success')).toThrow();
      expect(() => PublishPrimaryStateSchema.parse('')).toThrow();
    });
  });

  describe('DocumentSetSchema (D-01)', () => {
    const validUuid1 = '11111111-1111-4111-8111-111111111111';
    const validUuid2 = '22222222-2222-4222-8222-222222222222';
    const validSetId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    it('validates a valid document set preserving ordered UUID membership', () => {
      const valid = {
        id: validSetId,
        name: 'Process 60000006 Set',
        description: 'Core banking calculation docs',
        documentIds: [validUuid2, validUuid1], // preserved order
        createdAt: '2026-10-08T00:00:00.000Z',
        updatedAt: '2026-10-08T00:00:00.000Z',
      };

      const parsed = DocumentSetSchema.parse(valid);
      expect(parsed.name).toBe('Process 60000006 Set');
      expect(parsed.documentIds).toEqual([validUuid2, validUuid1]);
    });

    it('trims name and enforces 1 to 120 character limit', () => {
      expect(() =>
        DocumentSetSchema.parse({
          id: validSetId,
          name: '   ',
          documentIds: [],
          createdAt: '2026-10-08T00:00:00.000Z',
          updatedAt: '2026-10-08T00:00:00.000Z',
        })
      ).toThrow();

      expect(() =>
        DocumentSetSchema.parse({
          id: validSetId,
          name: 'a'.repeat(121),
          documentIds: [],
          createdAt: '2026-10-08T00:00:00.000Z',
          updatedAt: '2026-10-08T00:00:00.000Z',
        })
      ).toThrow();
    });

    it('rejects duplicate documentIds and non-UUID values', () => {
      expect(() =>
        DocumentSetSchema.parse({
          id: validSetId,
          name: 'Set with duplicates',
          documentIds: [validUuid1, validUuid1],
          createdAt: '2026-10-08T00:00:00.000Z',
          updatedAt: '2026-10-08T00:00:00.000Z',
        })
      ).toThrow();

      expect(() =>
        DocumentSetSchema.parse({
          id: validSetId,
          name: 'Set with bad id',
          documentIds: ['not-a-uuid'],
          createdAt: '2026-10-08T00:00:00.000Z',
          updatedAt: '2026-10-08T00:00:00.000Z',
        })
      ).toThrow();
    });
  });

  describe('PublishedDocumentMetadataSchema (D-08, T-16-02)', () => {
    const validSetId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const validDocId = '11111111-1111-4111-8111-111111111111';

    it('validates content-free remote metadata', () => {
      const valid = {
        setId: validSetId,
        documentId: validDocId,
        lastKnownRemoteAt: '2026-10-08T01:00:00.000Z',
        publishedContentHash: 'a'.repeat(64),
        activeSnapshotId: 'snap-123',
        activeAttemptId: 'attempt-456',
        lastPrimaryState: 'In sync',
      };

      const parsed = PublishedDocumentMetadataSchema.parse(valid);
      expect(parsed.documentId).toBe(validDocId);
      expect(parsed.publishedContentHash).toHaveLength(64);
    });

    it('rejects bodies, excerpts, or token fields (T-16-02)', () => {
      const forbidden = {
        setId: validSetId,
        documentId: validDocId,
        lastKnownRemoteAt: '2026-10-08T01:00:00.000Z',
        publishedContentHash: 'a'.repeat(64),
        body: '# Leaked markdown',
      };
      expect(() => PublishedDocumentMetadataSchema.parse(forbidden)).toThrow();

      const tokenForbidden = {
        setId: validSetId,
        documentId: validDocId,
        lastKnownRemoteAt: '2026-10-08T01:00:00.000Z',
        publishedContentHash: 'a'.repeat(64),
        token: 'secret-token',
      };
      expect(() => PublishedDocumentMetadataSchema.parse(tokenForbidden)).toThrow();
    });
  });

  describe('PublishAttemptCacheSchema (D-29, T-16-02)', () => {
    const validSetId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const validAttemptId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

    it('validates content-free attempt metrics and error summary', () => {
      const valid = {
        id: validAttemptId,
        setId: validSetId,
        attemptKey: 'key-12345',
        startedAt: '2026-10-08T01:00:00.000Z',
        completedAt: '2026-10-08T01:00:05.000Z',
        durationMs: 5000,
        status: 'Failed',
        addedCount: 1,
        changedCount: 2,
        removedCount: 0,
        unchangedCount: 5,
        warningCount: 1,
        errorCode: 'SET_PUBLISH_IN_PROGRESS',
        errorMessage: 'Publish already in progress for set',
      };

      const parsed = PublishAttemptCacheSchema.parse(valid);
      expect(parsed.durationMs).toBe(5000);
      expect(parsed.status).toBe('Failed');
    });

    it('rejects negative counters and malformed timestamps', () => {
      expect(() =>
        PublishAttemptCacheSchema.parse({
          id: validAttemptId,
          setId: validSetId,
          startedAt: 'not-a-timestamp',
          status: 'Failed',
          addedCount: -1,
          changedCount: 0,
          removedCount: 0,
          unchangedCount: 0,
          warningCount: 0,
        })
      ).toThrow();
    });

    it('rejects markdown body, payload, findings, tokens, or retrieval data (T-16-02)', () => {
      const withPayload = {
        id: validAttemptId,
        setId: validSetId,
        startedAt: '2026-10-08T01:00:00.000Z',
        status: 'Publishing',
        addedCount: 0,
        changedCount: 0,
        removedCount: 0,
        unchangedCount: 0,
        warningCount: 0,
        payload: { text: 'content' },
      };
      expect(() => PublishAttemptCacheSchema.parse(withPayload)).toThrow();

      const withDlpFinding = {
        id: validAttemptId,
        setId: validSetId,
        startedAt: '2026-10-08T01:00:00.000Z',
        status: 'Warning',
        addedCount: 0,
        changedCount: 0,
        removedCount: 0,
        unchangedCount: 0,
        warningCount: 1,
        matchedExcerpt: 'PAN 4111...',
      };
      expect(() => PublishAttemptCacheSchema.parse(withDlpFinding)).toThrow();
    });
  });

  describe('DlpAuditRecordSchema (D-18, T-16-02)', () => {
    const validAuditId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const validSetId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const validDocId = '11111111-1111-4111-8111-111111111111';

    it('validates content-free audit records with category counts and content hashes', () => {
      const valid = {
        id: validAuditId,
        setId: validSetId,
        attemptId: 'attempt-123',
        ruleSetVersion: '1.0.0',
        timestamp: '2026-10-08T01:00:00.000Z',
        documentIds: [validDocId],
        contentHashes: ['a'.repeat(64)],
        findingCountsByCategory: {
          PAN: 2,
          CVV: 1,
        },
        userAction: 'confirmed',
      };

      const parsed = DlpAuditRecordSchema.parse(valid);
      expect(parsed.ruleSetVersion).toBe('1.0.0');
      expect(parsed.findingCountsByCategory.PAN).toBe(2);
    });

    it('rejects matched values, source excerpts, or raw secrets (T-16-02)', () => {
      const withSecret = {
        id: validAuditId,
        setId: validSetId,
        ruleSetVersion: '1.0.0',
        timestamp: '2026-10-08T01:00:00.000Z',
        documentIds: [validDocId],
        contentHashes: ['a'.repeat(64)],
        findingCountsByCategory: { PAN: 1 },
        userAction: 'confirmed',
        matchedValue: '4111111111111111',
      };
      expect(() => DlpAuditRecordSchema.parse(withSecret)).toThrow();
    });
  });
});
