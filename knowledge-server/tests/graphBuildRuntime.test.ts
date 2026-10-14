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
});
