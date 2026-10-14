import { describe, expect, it } from 'vitest';
import { readKnowledgeServerOptions } from '../src/main.js';
import { GraphBuildService } from '../src/services/graphBuildService.js';
import { InMemoryGraphRepository } from '../src/graph/graphRepository.js';
import { SnapshotStore } from '../src/indexing/snapshotStore.js';

describe('19.2-04-T1: DI and configuration validation', () => {
  const baseValidEnv: NodeJS.ProcessEnv = {
    KNOWLEDGE_SERVER_TOKEN: 'test-token-12345',
    KNOWLEDGE_ALLOWED_ORIGINS: 'https://taskmate.local',
    HOST: '127.0.0.1',
    PORT: '3001',
  };

  describe('Prose extraction configuration validation', () => {
    it('succeeds when prose extraction is disabled', () => {
      const opts = readKnowledgeServerOptions({
        ...baseValidEnv,
        PROSE_EXTRACTION_ENABLED: 'false',
      });
      expect(opts.proseExtraction.enabled).toBe(false);
      expect(opts.proseExtraction.endpoint).toBeUndefined();
    });

    it('fails fast if prose extraction enabled without endpoint', () => {
      expect(() => {
        readKnowledgeServerOptions({
          ...baseValidEnv,
          PROSE_EXTRACTION_ENABLED: 'true',
          PROSE_EXTRACTION_MODEL: 'gpt-4o-mini',
          PROSE_EXTRACTION_ALLOWED_HOSTS: 'api.openai.com',
        });
      }).toThrow(/PROSE_EXTRACTION_ENDPOINT is required/);
    });

    it('fails fast if prose extraction endpoint is not HTTPS', () => {
      expect(() => {
        readKnowledgeServerOptions({
          ...baseValidEnv,
          PROSE_EXTRACTION_ENABLED: 'true',
          PROSE_EXTRACTION_ENDPOINT: 'http://api.openai.com/v1',
          PROSE_EXTRACTION_MODEL: 'gpt-4o-mini',
          PROSE_EXTRACTION_ALLOWED_HOSTS: 'api.openai.com',
        });
      }).toThrow(/PROSE_EXTRACTION_ENDPOINT must use HTTPS protocol/);
    });

    it('fails fast if prose extraction host is not in allowed hosts', () => {
      expect(() => {
        readKnowledgeServerOptions({
          ...baseValidEnv,
          PROSE_EXTRACTION_ENABLED: 'true',
          PROSE_EXTRACTION_ENDPOINT: 'https://untrusted.host.com/v1',
          PROSE_EXTRACTION_MODEL: 'gpt-4o-mini',
          PROSE_EXTRACTION_ALLOWED_HOSTS: 'api.openai.com',
        });
      }).toThrow(/PROSE_EXTRACTION_ALLOWED_HOSTS/);
    });

    it('fails fast if prose extraction model is missing', () => {
      expect(() => {
        readKnowledgeServerOptions({
          ...baseValidEnv,
          PROSE_EXTRACTION_ENABLED: 'true',
          PROSE_EXTRACTION_ENDPOINT: 'https://api.openai.com/v1',
          PROSE_EXTRACTION_ALLOWED_HOSTS: 'api.openai.com',
        });
      }).toThrow(/PROSE_EXTRACTION_MODEL is required/);
    });

    it('succeeds with valid prose extraction config', () => {
      const opts = readKnowledgeServerOptions({
        ...baseValidEnv,
        PROSE_EXTRACTION_ENABLED: 'true',
        PROSE_EXTRACTION_ENDPOINT: 'https://api.openai.com/v1',
        PROSE_EXTRACTION_MODEL: 'gpt-4o-mini',
        PROSE_EXTRACTION_API_KEY: 'sk-test-123',
        PROSE_EXTRACTION_ALLOWED_HOSTS: 'api.openai.com',
        ROLLBACK_GRACE_PERIOD_MS: '300000',
      });
      expect(opts.proseExtraction.enabled).toBe(true);
      expect(opts.proseExtraction.endpoint).toBe('https://api.openai.com/v1');
      expect(opts.proseExtraction.model).toBe('gpt-4o-mini');
      expect(opts.proseExtraction.apiKey).toBe('sk-test-123');
      expect(opts.proseExtraction.allowedHosts).toEqual(['api.openai.com']);
      expect(opts.rollbackGracePeriodMs).toBe(300000);
    });

    it('fails fast if rollback grace period is invalid', () => {
      expect(() => {
        readKnowledgeServerOptions({
          ...baseValidEnv,
          ROLLBACK_GRACE_PERIOD_MS: 'not-a-number',
        });
      }).toThrow(/ROLLBACK_GRACE_PERIOD_MS/);
    });
  });

  describe('Explicit DI validation for GraphBuildService', () => {
    it('throws in production mode if repository is missing', () => {
      expect(() => {
        new GraphBuildService({
          productionMode: true,
          snapshotStore: new SnapshotStore(),
        });
      }).toThrow(/repository/);
    });

    it('throws in production mode if snapshotStore is missing', () => {
      expect(() => {
        new GraphBuildService({
          productionMode: true,
          repository: new InMemoryGraphRepository(),
        });
      }).toThrow(/snapshotStore/);
    });

    it('instantiates cleanly in production mode with explicit repository and snapshotStore', () => {
      const repo = new InMemoryGraphRepository();
      const store = new SnapshotStore();
      const service = new GraphBuildService({
        productionMode: true,
        repository: repo,
        snapshotStore: store,
      });
      expect(service.repository).toBe(repo);
      expect(service.snapshotStore).toBe(store);
    });
  });

  describe('19.2-04-T2: Two-phase candidate build and atomic CAS activation', () => {
    const SET_ID = '00000000-0000-4000-8000-000000000001';

    function createTestFixture() {
      const repo = new InMemoryGraphRepository();
      const store = new SnapshotStore();
      const service = new GraphBuildService({
        repository: repo,
        snapshotStore: store,
        rollbackGracePeriodMs: 600000,
      });

      // Prepare a dummy projection in SnapshotStore
      store.createCandidate('c-1', 'att-1', SET_ID);
      store.completeCandidate('c-1', {
        snapshotId: '11111111-1111-4000-8000-111111111111',
        setId: SET_ID,
        chunkingPolicyVersion: '2026.10.1',
        documents: [
          {
            documentId: '22222222-2222-4000-8000-222222222222',
            title: 'Sample Document',
            contentHash: 'a'.repeat(64),
            chunks: [
              {
                occurrenceId: '33333333-3333-4000-8000-333333333333',
                contentHash: 'b'.repeat(64),
                chunkIndex: 0,
                headingPath: ['Introduction'],
                startLine: 1,
                endLine: 5,
                startOffset: 0,
                endOffset: 50,
                text: 'System PRC_SAMPLE_1 process definition.',
              },
            ],
          },
        ],
      });
      store.promoteCandidate('c-1');

      return { repo, store, service };
    }

    it('prepareCandidate creates candidate snapshot with status READY while active graph remains unchanged', async () => {
      const { service } = createTestFixture();

      const candidateId = await service.prepareCandidate(SET_ID);
      expect(candidateId).toBeDefined();

      const status = await service.getStatus(SET_ID);
      expect(status.state).toBe('Never built');
      expect(status.activeGraphSnapshotId).toBeUndefined();
      expect(status.candidateSnapshotId).toBe(candidateId);
      expect(status.candidateStatus).toBe('READY');
    });

    it('activateCandidate updates active snapshot and records prior snapshot and rollback expiry', async () => {
      const { service } = createTestFixture();

      const candidate1 = await service.prepareCandidate(SET_ID);
      await service.activateCandidate(SET_ID, candidate1);

      let status = await service.getStatus(SET_ID);
      expect(status.activeGraphSnapshotId).toBe(candidate1);
      expect(status.priorSnapshotId).toBeUndefined();
      expect(status.canRollback).toBe(false);

      // Now prepare second candidate
      const candidate2 = await service.prepareCandidate(SET_ID);
      expect(candidate2).not.toBe(candidate1);

      status = await service.getStatus(SET_ID);
      expect(status.activeGraphSnapshotId).toBe(candidate1);
      expect(status.candidateSnapshotId).toBe(candidate2);
      expect(status.candidateStatus).toBe('READY');

      // Activate candidate2 with CAS precondition on candidate1
      await service.activateCandidate(SET_ID, candidate2, candidate1);

      status = await service.getStatus(SET_ID);
      expect(status.activeGraphSnapshotId).toBe(candidate2);
      expect(status.priorSnapshotId).toBe(candidate1);
      expect(status.canRollback).toBe(true);
      expect(status.rollbackExpiresAt).toBeDefined();
    });

    it('activateCandidate with mismatched expectedPriorSnapshotId throws CAS conflict', async () => {
      const { service } = createTestFixture();

      const candidate1 = await service.prepareCandidate(SET_ID);
      await service.activateCandidate(SET_ID, candidate1);

      const candidate2 = await service.prepareCandidate(SET_ID);

      await expect(
        service.activateCandidate(SET_ID, candidate2, 'wrong-prior-id-0000-0000-000000000000')
      ).rejects.toThrow(/CAS_CONFLICT|does not match/);

      // Active pointer should remain candidate1
      const status = await service.getStatus(SET_ID);
      expect(status.activeGraphSnapshotId).toBe(candidate1);
    });

    it('failed candidate build keeps prior active snapshot intact', async () => {
      const { service, store } = createTestFixture();

      const candidate1 = await service.prepareCandidate(SET_ID);
      await service.activateCandidate(SET_ID, candidate1);

      // Break snapshot store so prepareCandidate fails
      const originalGetActive = store.getActiveSnapshot.bind(store);
      store.getActiveSnapshot = () => null;

      await expect(service.prepareCandidate(SET_ID)).rejects.toThrow();

      store.getActiveSnapshot = originalGetActive;

      const status = await service.getStatus(SET_ID);
      expect(status.activeGraphSnapshotId).toBe(candidate1);
      expect(status.state).toBe('Active');
    });

    it('POST /api/v1/sets/:setId/graph/activate route activates candidate and surfaces status', async () => {
      const { buildKnowledgeServer } = await import('../src/server.js');
      const { repo, store, service } = createTestFixture();
      const server = buildKnowledgeServer({
        token: 'test-token',
        allowedOrigins: ['https://taskmate.local'],
        graphBuildService: service,
        graphRepository: repo,
      });

      const candidate1 = await service.prepareCandidate(SET_ID);

      const res = await server.app.inject({
        method: 'POST',
        url: `/api/v1/sets/${SET_ID}/graph/activate`,
        headers: {
          authorization: 'Bearer test-token',
          origin: 'https://taskmate.local',
        },
        payload: {
          candidateSnapshotId: candidate1,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.activeGraphSnapshotId).toBe(candidate1);
      expect(body.candidateSnapshotId).toBeUndefined();
    });
  });
});
