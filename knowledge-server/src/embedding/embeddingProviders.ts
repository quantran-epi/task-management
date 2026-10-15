import { z } from 'zod';
import type { EmbeddingProvider, OperationOptions } from '../retrieval/contracts.js';
import type { EmbeddingProviderMetadata, ReasonCode } from '../types/retrievalProtocol.js';

export const LOCAL_E5_METADATA: EmbeddingProviderMetadata = {
  provider: 'local-onnx',
  model: 'Xenova/multilingual-e5-small',
  revision: '761b726dd34fb83930e26aab4e9ac3899aa1fa78',
  dimensions: 384,
  policyVersion: '2026.10.1-e5-small-mean-norm',
};

export class EmbeddingError extends Error {
  constructor(
    public readonly code: ReasonCode,
    message: string
  ) {
    super(`[${code}] ${message}`);
    this.name = 'EmbeddingError';
  }
}

export type PipelineExtractor = (
  textOrTexts: string | string[],
  options?: { pooling?: 'mean' | 'cls' | 'none'; normalize?: boolean }
) => Promise<{ data: Float32Array | number[] }>;

export type PipelineLoader = () => Promise<PipelineExtractor>;

export interface LocalOnnxOptions {
  pipelineLoader?: PipelineLoader;
}

export class LocalOnnxEmbeddingProvider implements EmbeddingProvider {
  private readonly loader: PipelineLoader;
  private cachedExtractor: PipelineExtractor | null = null;
  private readonly metadata = LOCAL_E5_METADATA;

  constructor(options?: LocalOnnxOptions) {
    this.loader =
      options?.pipelineLoader ??
      (async () => {
        // Dynamic import so tests without the real package or weights won't fail
        const { pipeline, env } = await import('@xenova/transformers');
        env.cacheDir = process.env.EMBEDDING_CACHE_DIR ?? './.cache/transformers';
        try {
          const extractor = await pipeline('feature-extraction', this.metadata.model, {
            revision: this.metadata.revision,
            quantized: true,
          });
          return extractor as unknown as PipelineExtractor;
        } catch (err: unknown) {
          console.error('[ONNX_PIPELINE_LOAD_ERROR]', err);
          throw err;
        }
      });
  }

  describe(): EmbeddingProviderMetadata {
    return this.metadata;
  }

  private async getExtractor(): Promise<PipelineExtractor> {
    if (!this.cachedExtractor) {
      this.cachedExtractor = await this.loader();
    }
    return this.cachedExtractor;
  }

  async embedDocuments(texts: readonly string[], options?: OperationOptions): Promise<number[][]> {
    if (texts.length === 0) {
      throw new EmbeddingError('PROVIDER_ERROR', 'Document batch cannot be empty');
    }
    for (const t of texts) {
      if (!t || t.trim().length === 0) {
        throw new EmbeddingError('PROVIDER_ERROR', 'Document text cannot be empty');
      }
    }

    if (options?.signal?.aborted) {
      throw new EmbeddingError('TIMEOUT', 'Operation aborted before execution');
    }

    try {
      const extractor = await this.getExtractor();
      if (options?.signal?.aborted) {
        throw new EmbeddingError('TIMEOUT', 'Operation aborted after model load');
      }

      // Chia texts thành các sub-batch nhỏ (10 texts/lần) để tránh tràn bộ nhớ RAM (OOM)
      const BATCH_SIZE = 10;
      const results: number[][] = [];
      for (let b = 0; b < texts.length; b += BATCH_SIZE) {
        const batchTexts = texts.slice(b, b + BATCH_SIZE);
        const prefixed = batchTexts.map((t) => `passage: ${t}`);
        const output = await extractor(prefixed, { pooling: 'mean', normalize: true });
        const flat = Array.from(output.data);

        const expectedTotal = batchTexts.length * this.metadata.dimensions;
        if (flat.length !== expectedTotal) {
          throw new EmbeddingError(
            'MODEL_INDEX_MISMATCH',
            `Output vector dimension mismatch: expected ${expectedTotal}, received ${flat.length}`
          );
        }

        for (let i = 0; i < batchTexts.length; i++) {
          const slice = flat.slice(i * this.metadata.dimensions, (i + 1) * this.metadata.dimensions);
          for (const num of slice) {
            if (!Number.isFinite(num)) {
              throw new EmbeddingError('PROVIDER_ERROR', 'Vector contains non-finite numbers');
            }
          }
          results.push(slice);
        }
        // Nhường event loop một tick để Fastify trả lời liveness probe của K8s
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return results;
    } catch (err: unknown) {
      console.error('[EMBED_DOCUMENTS_ERROR]', err);
      if (err instanceof EmbeddingError) throw err;
      if (options?.signal?.aborted || (err as Error)?.name === 'AbortError') {
        throw new EmbeddingError('TIMEOUT', 'Embedding operation timed out or was aborted');
      }
      const rawMsg = err instanceof Error ? err.message : String(err);
      throw new EmbeddingError('PROVIDER_ERROR', `Local embedding failed: ${rawMsg.slice(0, 200)}`);
    }
  }

  async embedQuery(text: string, options?: OperationOptions): Promise<number[]> {
    if (!text || text.trim().length === 0) {
      throw new EmbeddingError('PROVIDER_ERROR', 'Query text cannot be empty');
    }

    if (options?.signal?.aborted) {
      throw new EmbeddingError('TIMEOUT', 'Operation aborted before execution');
    }

    try {
      const extractor = await this.getExtractor();
      if (options?.signal?.aborted) {
        throw new EmbeddingError('TIMEOUT', 'Operation aborted after model load');
      }

      const prefixed = `query: ${text}`;
      const output = await extractor(prefixed, { pooling: 'mean', normalize: true });
      const vec = Array.from(output.data);

      if (vec.length !== this.metadata.dimensions) {
        throw new EmbeddingError(
          'MODEL_INDEX_MISMATCH',
          `Dimension mismatch: expected ${this.metadata.dimensions}, received ${vec.length}`
        );
      }

      for (const num of vec) {
        if (!Number.isFinite(num)) {
          throw new EmbeddingError('PROVIDER_ERROR', 'Vector contains non-finite numbers');
        }
      }

      return vec;
    } catch (err: unknown) {
      if (err instanceof EmbeddingError) throw err;
      if (options?.signal?.aborted || (err as Error)?.name === 'AbortError') {
        throw new EmbeddingError('TIMEOUT', 'Embedding query timed out or was aborted');
      }
      throw new EmbeddingError('PROVIDER_ERROR', 'Local query embedding failed');
    }
  }
}

export interface RemoteOpenAiConfig {
  enabled: boolean;
  endpoint: string;
  allowedHosts: string[];
  apiKey: string;
  model: string;
  dimensions: number;
}

const OpenAiEmbeddingResponseSchema = z
  .object({
    object: z.literal('list'),
    data: z.array(
      z
        .object({
          object: z.literal('embedding'),
          index: z.number().int().nonnegative(),
          embedding: z.array(z.number()),
        })
        .strict()
    ),
    model: z.string(),
    usage: z.object({ prompt_tokens: z.number(), total_tokens: z.number() }).optional(),
  })
  .strict();

export interface RemoteOpenAiOptions {
  fetchFn?: typeof fetch;
}

export class RemoteOpenAiEmbeddingProvider implements EmbeddingProvider {
  private readonly config: RemoteOpenAiConfig;
  private readonly fetchFn: typeof fetch;
  private readonly metadata: EmbeddingProviderMetadata;

  constructor(config: RemoteOpenAiConfig, options?: RemoteOpenAiOptions) {
    if (!config.enabled) {
      throw new EmbeddingError('UNCONFIGURED', 'Remote embeddings are disabled');
    }

    let url: URL;
    try {
      url = new URL(config.endpoint);
    } catch {
      throw new EmbeddingError('UNCONFIGURED', 'Invalid remote endpoint URL');
    }

    if (url.protocol !== 'https:') {
      throw new EmbeddingError('UNCONFIGURED', 'Remote embedding endpoint must be HTTPS');
    }

    if (url.username || url.password) {
      throw new EmbeddingError('UNCONFIGURED', 'Remote embedding endpoint must not contain credentials');
    }

    if (!config.allowedHosts.includes(url.hostname)) {
      throw new EmbeddingError(
        'UNCONFIGURED',
        `Remote endpoint host "${url.hostname}" is not in approved allowed hosts list`
      );
    }

    if (!config.apiKey || config.apiKey.trim().length === 0) {
      throw new EmbeddingError('UNCONFIGURED', 'Remote embedding API key is required');
    }

    if (!config.model || config.model.trim().length === 0) {
      throw new EmbeddingError('UNCONFIGURED', 'Remote embedding model is required');
    }

    if (!Number.isInteger(config.dimensions) || config.dimensions <= 0) {
      throw new EmbeddingError('UNCONFIGURED', 'Remote embedding dimensions must be a positive integer');
    }

    this.config = { ...config };
    this.fetchFn = options?.fetchFn ?? fetch;
    this.metadata = {
      provider: 'remote-openai',
      model: config.model,
      revision: 'v1',
      dimensions: config.dimensions,
      policyVersion: '2026.10.1-remote-openai',
    };
  }

  describe(): EmbeddingProviderMetadata {
    return this.metadata;
  }

  private async executeFetch(inputs: readonly string[], options?: OperationOptions): Promise<number[][]> {
    if (inputs.length === 0) {
      throw new EmbeddingError('PROVIDER_ERROR', 'Input batch cannot be empty');
    }
    for (const input of inputs) {
      if (!input || input.trim().length === 0) {
        throw new EmbeddingError('PROVIDER_ERROR', 'Input text cannot be empty');
      }
    }

    const cleanEndpoint = this.config.endpoint.replace(/\/+$/, '');
    const url = `${cleanEndpoint}/v1/embeddings`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.config.apiKey}`,
    };

    const timeoutSignal = AbortSignal.timeout(15_000);
    const combinedSignal = options?.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal;

    try {
      const res = await this.fetchFn(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: this.config.model,
          input: [...inputs],
          encoding_format: 'float',
        }),
        signal: combinedSignal,
      });

      if (!res.ok) {
        throw new EmbeddingError('PROVIDER_ERROR', `Remote provider HTTP status ${res.status}`);
      }

      const json = await res.json();
      const parsed = OpenAiEmbeddingResponseSchema.safeParse(json);
      if (!parsed.success) {
        throw new EmbeddingError('PROVIDER_ERROR', 'Remote response failed schema validation');
      }

      const { data } = parsed.data;
      if (data.length !== inputs.length) {
        throw new EmbeddingError('PROVIDER_ERROR', 'Remote provider returned unexpected number of vectors');
      }

      // Sort by index
      const sorted = [...data].sort((a, b) => a.index - b.index);
      for (let i = 0; i < sorted.length; i++) {
        if (sorted[i]?.index !== i) {
          throw new EmbeddingError('PROVIDER_ERROR', 'Missing or unordered vector index in response');
        }
      }

      const results: number[][] = [];
      for (const item of sorted) {
        if (item.embedding.length !== this.metadata.dimensions) {
          throw new EmbeddingError(
            'MODEL_INDEX_MISMATCH',
            `Vector dimension mismatch: expected ${this.metadata.dimensions}, received ${item.embedding.length}`
          );
        }
        for (const val of item.embedding) {
          if (!Number.isFinite(val)) {
            throw new EmbeddingError('PROVIDER_ERROR', 'Remote vector contains non-finite values');
          }
        }
        results.push(item.embedding);
      }

      return results;
    } catch (err: unknown) {
      if (err instanceof EmbeddingError) throw err;
      if (options?.signal?.aborted || (err as Error)?.name === 'AbortError' || (err as Error)?.name === 'TimeoutError') {
        throw new EmbeddingError('TIMEOUT', 'Remote embedding request timed out or was aborted');
      }
      throw new EmbeddingError('PROVIDER_ERROR', 'Remote embedding call failed');
    }
  }

  async embedDocuments(texts: readonly string[], options?: OperationOptions): Promise<number[][]> {
    return this.executeFetch(texts, options);
  }

  async embedQuery(text: string, options?: OperationOptions): Promise<number[]> {
    const results = await this.executeFetch([text], options);
    const vec = results[0];
    if (!vec) throw new EmbeddingError('PROVIDER_ERROR', 'Empty vector returned');
    return vec;
  }
}

export function createEmbeddingProvider(
  env: NodeJS.ProcessEnv = process.env,
  deps?: { localOptions?: LocalOnnxOptions; remoteOptions?: RemoteOpenAiOptions }
): EmbeddingProvider {
  const remoteEnabled = (env.EMBEDDING_REMOTE_ENABLED ?? '').trim().toLowerCase() === 'true';

  if (remoteEnabled) {
    const endpoint = (env.EMBEDDING_REMOTE_ENDPOINT ?? '').trim();
    const rawAllowedHosts = (env.EMBEDDING_REMOTE_ALLOWED_HOSTS ?? '').trim();
    const allowedHosts = rawAllowedHosts
      .split(',')
      .map((h) => h.trim())
      .filter(Boolean);
    const apiKey = (env.EMBEDDING_REMOTE_API_KEY ?? '').trim();
    const model = (env.EMBEDDING_REMOTE_MODEL ?? '').trim();
    const dimensions = parseInt((env.EMBEDDING_REMOTE_DIMENSIONS ?? '0').trim(), 10);

    return new RemoteOpenAiEmbeddingProvider(
      {
        enabled: true,
        endpoint,
        allowedHosts,
        apiKey,
        model,
        dimensions,
      },
      deps?.remoteOptions
    );
  }

  return new LocalOnnxEmbeddingProvider(deps?.localOptions);
}
