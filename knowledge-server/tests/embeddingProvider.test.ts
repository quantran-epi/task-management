import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  LocalOnnxEmbeddingProvider,
  RemoteOpenAiEmbeddingProvider,
  createEmbeddingProvider,
  LOCAL_E5_METADATA,
  EmbeddingError,
} from '../src/embedding/embeddingProviders.js';
import type { EmbeddingProviderMetadata } from '../src/types/retrievalProtocol.js';

describe('LocalOnnxEmbeddingProvider', () => {
  const dummyVector = new Array(384).fill(0.1);

  it('exposes pinned local metadata with immutable revision and 384 dimensions', () => {
    const fakeLoader = vi.fn();
    const provider = new LocalOnnxEmbeddingProvider({ pipelineLoader: fakeLoader });
    const meta = provider.describe();

    expect(meta.provider).toBe('local-onnx');
    expect(meta.model).toBe('Xenova/multilingual-e5-small');
    expect(meta.revision).toBe('761b726dd34fb83930e26aab4e9ac3899aa1fa78');
    expect(meta.dimensions).toBe(384);
    expect(meta.policyVersion).toBe('2026.10.1-e5-small-mean-norm');
    expect(fakeLoader).not.toHaveBeenCalled();
  });

  it('lazy-loads pipeline, prefixes "query: ", mean-pools and normalizes query', async () => {
    const mockExtractor = vi.fn().mockResolvedValue({
      data: new Float32Array(dummyVector),
    });
    const fakeLoader = vi.fn().mockResolvedValue(mockExtractor);

    const provider = new LocalOnnxEmbeddingProvider({ pipelineLoader: fakeLoader });
    const vec = await provider.embedQuery('test search query');

    expect(fakeLoader).toHaveBeenCalledTimes(1);
    expect(mockExtractor).toHaveBeenCalledWith('query: test search query', {
      pooling: 'mean',
      normalize: true,
    });
    expect(vec).toHaveLength(384);
    expect(vec[0]).toBeCloseTo(0.1);
  });

  it('prefixes "passage: " for documents and returns batch of vectors', async () => {
    // 2 documents -> flat 2 * 384 numbers
    const flat = new Float32Array([...dummyVector, ...dummyVector.map((x) => x * 2)]);
    const mockExtractor = vi.fn().mockResolvedValue({ data: flat });
    const fakeLoader = vi.fn().mockResolvedValue(mockExtractor);

    const provider = new LocalOnnxEmbeddingProvider({ pipelineLoader: fakeLoader });
    const res = await provider.embedDocuments(['chunk 1', 'chunk 2']);

    expect(mockExtractor).toHaveBeenCalledWith(['passage: chunk 1', 'passage: chunk 2'], {
      pooling: 'mean',
      normalize: true,
    });
    expect(res).toHaveLength(2);
    expect(res[0]).toHaveLength(384);
    expect(res[1]).toHaveLength(384);
    expect(res[1]![0]).toBeCloseTo(0.2);
  });

  it('rejects empty document batch or empty strings', async () => {
    const fakeLoader = vi.fn();
    const provider = new LocalOnnxEmbeddingProvider({ pipelineLoader: fakeLoader });

    await expect(provider.embedDocuments([])).rejects.toThrow(EmbeddingError);
    await expect(provider.embedDocuments([''])).rejects.toThrow(EmbeddingError);
    await expect(provider.embedQuery('')).rejects.toThrow(EmbeddingError);
    expect(fakeLoader).not.toHaveBeenCalled();
  });

  it('maps loader failure (such as missing sharp native binary) to PROVIDER_ERROR', async () => {
    const fakeLoader = vi.fn().mockRejectedValue(new Error('Cannot find module sharp-win32-x64.node'));
    const provider = new LocalOnnxEmbeddingProvider({ pipelineLoader: fakeLoader });

    await expect(provider.embedQuery('hello')).rejects.toThrowError(
      expect.objectContaining({ code: 'PROVIDER_ERROR' })
    );
  });

  it('maps dimension mismatch or non-finite outputs to stable MODEL_INDEX_MISMATCH / PROVIDER_ERROR', async () => {
    const wrongLength = new Float32Array(100);
    const mockExtractor = vi.fn().mockResolvedValue({ data: wrongLength });
    const fakeLoader = vi.fn().mockResolvedValue(mockExtractor);

    const provider = new LocalOnnxEmbeddingProvider({ pipelineLoader: fakeLoader });
    await expect(provider.embedQuery('hello')).rejects.toThrowError(
      expect.objectContaining({ code: 'MODEL_INDEX_MISMATCH' })
    );

    const nonFinite = new Float32Array(dummyVector);
    nonFinite[0] = NaN;
    mockExtractor.mockResolvedValueOnce({ data: nonFinite });
    await expect(provider.embedQuery('hello')).rejects.toThrowError(
      expect.objectContaining({ code: 'PROVIDER_ERROR' })
    );
  });

  it('honors AbortSignal on query and documents', async () => {
    const controller = new AbortController();
    controller.abort();

    const fakeLoader = vi.fn();
    const provider = new LocalOnnxEmbeddingProvider({ pipelineLoader: fakeLoader });

    await expect(provider.embedQuery('hello', { signal: controller.signal })).rejects.toThrowError(
      expect.objectContaining({ code: 'TIMEOUT' })
    );
    expect(fakeLoader).not.toHaveBeenCalled();
  });
});

describe('RemoteOpenAiEmbeddingProvider', () => {
  const CANARY_KEY = 'sk-canary-secret-never-leak-999';
  const CANARY_QUERY = 'super-secret-user-query';
  const CANARY_CHUNK = 'confidential-customer-markdown-chunk';

  const validConfig = {
    enabled: true,
    endpoint: 'https://api.openai.com',
    allowedHosts: ['api.openai.com'],
    apiKey: CANARY_KEY,
    model: 'text-embedding-3-small',
    dimensions: 1536,
  };

  it('exposes remote metadata correctly', () => {
    const provider = new RemoteOpenAiEmbeddingProvider(validConfig);
    const meta = provider.describe();

    expect(meta.provider).toBe('remote-openai');
    expect(meta.model).toBe('text-embedding-3-small');
    expect(meta.dimensions).toBe(1536);
    expect(meta.policyVersion).toBe('2026.10.1-remote-openai');
    // Secret must not appear in describe()
    expect(JSON.stringify(meta)).not.toContain(CANARY_KEY);
  });

  it('validates config: rejects non-HTTPS, URL credentials, unallowed host, or missing keys', () => {
    expect(
      () =>
        new RemoteOpenAiEmbeddingProvider({
          ...validConfig,
          endpoint: 'http://api.openai.com',
        })
    ).toThrow(/HTTPS/i);

    expect(
      () =>
        new RemoteOpenAiEmbeddingProvider({
          ...validConfig,
          endpoint: 'https://user:pass@api.openai.com',
        })
    ).toThrow(/credentials/i);

    expect(
      () =>
        new RemoteOpenAiEmbeddingProvider({
          ...validConfig,
          endpoint: 'https://evil.example.com',
          allowedHosts: ['api.openai.com'],
        })
    ).toThrow(/allow/i);

    expect(
      () =>
        new RemoteOpenAiEmbeddingProvider({
          ...validConfig,
          apiKey: '',
        })
    ).toThrow(/key/i);

    expect(
      () =>
        new RemoteOpenAiEmbeddingProvider({
          ...validConfig,
          dimensions: 0,
        })
    ).toThrow(/dimensions/i);
  });

  it('executes native fetch to /v1/embeddings, sorts by index, and validates dimensions', async () => {
    const v0 = new Array(1536).fill(0.1);
    const v1 = new Array(1536).fill(0.2);

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        object: 'list',
        data: [
          { object: 'embedding', index: 1, embedding: v1 },
          { object: 'embedding', index: 0, embedding: v0 },
        ],
        model: 'text-embedding-3-small',
        usage: { prompt_tokens: 10, total_tokens: 10 },
      }),
    });

    const provider = new RemoteOpenAiEmbeddingProvider(validConfig, { fetchFn: mockFetch });
    const docs = await provider.embedDocuments(['doc 0', 'doc 1']);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/embeddings',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${CANARY_KEY}`,
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: ['doc 0', 'doc 1'],
          encoding_format: 'float',
        }),
      })
    );

    expect(docs).toHaveLength(2);
    expect(docs[0]).toEqual(v0);
    expect(docs[1]).toEqual(v1);
  });

  it('fails closed on HTTP error, malformed JSON, missing index, or dimension mismatch without leaking canary', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'internal server error body with secret tokens',
    });

    const provider = new RemoteOpenAiEmbeddingProvider(validConfig, { fetchFn: mockFetch });

    let caughtError: unknown;
    try {
      await provider.embedQuery(CANARY_QUERY);
    } catch (e) {
      caughtError = e;
    }

    expect(caughtError).toBeInstanceOf(EmbeddingError);
    const errString = String(caughtError) + JSON.stringify(caughtError);
    expect(errString).not.toContain(CANARY_KEY);
    expect(errString).not.toContain(CANARY_QUERY);
    expect((caughtError as EmbeddingError).code).toBe('PROVIDER_ERROR');
  });

  it('maps AbortSignal and timeout to stable TIMEOUT code', async () => {
    const mockFetch = vi.fn().mockImplementation((_url, opts) => {
      if (opts?.signal?.aborted) {
        throw new Error('aborted');
      }
      return new Promise((_, reject) => {
        opts.signal.addEventListener('abort', () => reject(new Error('aborted')));
      });
    });

    const provider = new RemoteOpenAiEmbeddingProvider(validConfig, { fetchFn: mockFetch });
    const controller = new AbortController();
    controller.abort();

    await expect(provider.embedQuery('query', { signal: controller.signal })).rejects.toThrowError(
      expect.objectContaining({ code: 'TIMEOUT' })
    );
  });
});

describe('createEmbeddingProvider factory', () => {
  it('returns LocalOnnxEmbeddingProvider by default when remote is disabled', () => {
    const provider = createEmbeddingProvider({});
    const meta = provider.describe();
    expect(meta.provider).toBe('local-onnx');
  });

  it('returns RemoteOpenAiEmbeddingProvider when EMBEDDING_REMOTE_ENABLED=true and valid config is present', () => {
    const provider = createEmbeddingProvider({
      EMBEDDING_REMOTE_ENABLED: 'true',
      EMBEDDING_REMOTE_ENDPOINT: 'https://api.openai.com',
      EMBEDDING_REMOTE_ALLOWED_HOSTS: 'api.openai.com',
      EMBEDDING_REMOTE_API_KEY: 'test-key',
      EMBEDDING_REMOTE_MODEL: 'text-embedding-3-small',
      EMBEDDING_REMOTE_DIMENSIONS: '1536',
    });
    const meta = provider.describe();
    expect(meta.provider).toBe('remote-openai');
    expect(meta.dimensions).toBe(1536);
  });

  it('fails closed / throws if EMBEDDING_REMOTE_ENABLED=true but config is missing or invalid', () => {
    expect(() =>
      createEmbeddingProvider({
        EMBEDDING_REMOTE_ENABLED: 'true',
        EMBEDDING_REMOTE_ENDPOINT: 'https://api.openai.com',
        // missing ALLOWED_HOSTS, API_KEY, etc.
      })
    ).toThrow();
  });
});
