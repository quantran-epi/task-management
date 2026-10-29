import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { buildKnowledgeServer, type KnowledgeServer } from './server.js';
import { createEmbeddingProvider } from './embedding/embeddingProviders.js';
import { Neo4jRepository } from './graph/neo4jRepository.js';
import {
  GraphBuildService,
  type ProseExtractionConfig,
} from './services/graphBuildService.js';
import { OntologyRegistryService } from './services/ontologyRegistryService.js';
import { SnapshotStore } from './indexing/snapshotStore.js';
import { AttemptService } from './services/attemptService.js';
import {
  RetrievalService,
  readRetrievalTimeouts,
  type RetrievalTimeouts,
} from './services/retrievalService.js';
import { NineRouterQueryPlanner } from './retrieval/nineRouterQueryPlanner.js';
import { buildDeterministicFallbackPlan } from './retrieval/queryPlanning.js';
import type {
  EmbeddingProvider,
  QueryPlanner,
  RetrievalIndexGateway,
  GraphRetrievalGateway,
  QueryPlannerContext,
  QueryPlanResult,
  OperationOptions,
} from './retrieval/contracts.js';
import type { RetrievalRequest } from './types/retrievalProtocol.js';
import { DEFAULT_BODY_LIMIT_BYTES } from './types/protocol.js';

export interface RemoteEmbeddingConfig {
  enabled: boolean;
  endpoint?: string | undefined;
  allowedHosts?: string[] | undefined;
  model?: string | undefined;
  dimensions?: number | undefined;
}

export interface RemotePlannerConfig {
  enabled: boolean;
  endpoint?: string | undefined;
  model?: string | undefined;
  apiKey?: string | undefined;
  allowedHosts?: string[] | undefined;
  timeoutMs?: number | undefined;
}

export interface Neo4jConfig {
  enabled: boolean;
  uri?: string | undefined;
  user?: string | undefined;
  password?: string | undefined;
  database?: string | undefined;
}

export interface ProseExtractionServerConfig {
  enabled: boolean;
  endpoint?: string | undefined;
  model?: string | undefined;
  apiKey?: string | undefined;
  allowedHosts?: string[] | undefined;
}

export interface ReadKnowledgeServerOptionsResult {
  token: string;
  allowedOrigins: string[];
  host: string;
  port: number;
  httpsTerminated: boolean;
  remoteEmbedding: RemoteEmbeddingConfig;
  remotePlanner: RemotePlannerConfig;
  neo4j: Neo4jConfig;
  proseExtraction: ProseExtractionServerConfig;
  rollbackGracePeriodMs: number;
  timeouts: RetrievalTimeouts;
  bodyLimitBytes: number;
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost', 'host.docker.internal']);

function parseAllowedHosts(rawHosts: string, varName: string): string[] {
  const hosts = rawHosts
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);
  if (hosts.length === 0) {
    throw new Error(`${varName} must contain at least one valid host when remote is enabled.`);
  }
  for (const host of hosts) {
    if (host.includes('/') || host.includes(':') || host.includes('@') || host.includes('*')) {
      throw new Error(`Invalid host in ${varName}: "${host}". Must be an exact hostname without port, path, or wildcards.`);
    }
  }
  return hosts;
}

export function readKnowledgeServerOptions(
  env: NodeJS.ProcessEnv = process.env
): ReadKnowledgeServerOptionsResult {
  const token = (env.KNOWLEDGE_SERVER_TOKEN ?? '').trim();
  if (!token) {
    throw new Error('KNOWLEDGE_SERVER_TOKEN is required and cannot be empty.');
  }

  const rawOrigins = (env.KNOWLEDGE_ALLOWED_ORIGINS ?? '').trim();
  if (!rawOrigins) {
    throw new Error('KNOWLEDGE_ALLOWED_ORIGINS is required and cannot be empty.');
  }

  const allowedOrigins = rawOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (allowedOrigins.length === 0) {
    throw new Error('At least one exact allowed origin is required.');
  }

  for (const origin of allowedOrigins) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error(`Invalid allowed origin: "${origin}". Must be a valid URL.`);
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`Invalid allowed origin protocol: "${origin}". Must be http: or https:.`);
    }

    if (parsed.username || parsed.password) {
      throw new Error(`Allowed origin must not contain credentials: "${origin}".`);
    }

    if (parsed.pathname !== '/' && parsed.pathname !== '') {
      throw new Error(`Allowed origin must not contain path: "${origin}".`);
    }

    if (parsed.search) {
      throw new Error(`Allowed origin must not contain query parameters: "${origin}".`);
    }

    if (parsed.hash) {
      throw new Error(`Allowed origin must not contain hash fragment: "${origin}".`);
    }

    // Origin must match serialized origin exactly with no trailing slash
    if (parsed.origin !== origin) {
      throw new Error(
        `Allowed origin must be exact origin without trailing slash, wildcards, or extras: "${origin}". Expected "${parsed.origin}".`
      );
    }

    if (origin.includes('*')) {
      throw new Error(`Wildcard origins are not permitted: "${origin}".`);
    }
  }

  const host = (env.HOST ?? '127.0.0.1').trim() || '127.0.0.1';

  const rawPort = (env.PORT ?? '3001').trim() || '3001';
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || String(port) !== rawPort) {
    throw new Error(`Invalid PORT: "${rawPort}". Must be an integer between 1 and 65535.`);
  }

  const httpsTerminated = (env.HTTPS_TERMINATED ?? '').trim().toLowerCase() === 'true';

  if (!LOOPBACK_HOSTS.has(host) && !httpsTerminated) {
    throw new Error('Remote knowledge server binding requires HTTPS termination.');
  }

  // Validate remote embedding configuration
  const embeddingRemoteEnabled = (env.EMBEDDING_REMOTE_ENABLED ?? '').trim().toLowerCase() === 'true';
  const remoteEmbedding: RemoteEmbeddingConfig = { enabled: embeddingRemoteEnabled };

  if (embeddingRemoteEnabled) {
    const endpoint = (env.EMBEDDING_REMOTE_ENDPOINT ?? '').trim();
    if (!endpoint) throw new Error('EMBEDDING_REMOTE_ENDPOINT is required when EMBEDDING_REMOTE_ENABLED is true.');
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(endpoint);
    } catch {
      throw new Error(`Invalid EMBEDDING_REMOTE_ENDPOINT: "${endpoint}". Must be a valid URL.`);
    }

    const rawHosts = (env.EMBEDDING_REMOTE_ALLOWED_HOSTS ?? '').trim();
    const allowedHosts = rawHosts ? parseAllowedHosts(rawHosts, 'EMBEDDING_REMOTE_ALLOWED_HOSTS') : undefined;
    if (allowedHosts && !allowedHosts.includes(parsedUrl.hostname)) {
      throw new Error(`EMBEDDING_REMOTE_ENDPOINT host "${parsedUrl.hostname}" is not in EMBEDDING_REMOTE_ALLOWED_HOSTS.`);
    }

    const apiKey = (env.EMBEDDING_REMOTE_API_KEY ?? '').trim();
    if (!apiKey) throw new Error('EMBEDDING_REMOTE_API_KEY is required when EMBEDDING_REMOTE_ENABLED is true.');

    const model = (env.EMBEDDING_REMOTE_MODEL ?? '').trim();
    if (!model) throw new Error('EMBEDDING_REMOTE_MODEL is required when EMBEDDING_REMOTE_ENABLED is true.');

    const rawDims = (env.EMBEDDING_REMOTE_DIMENSIONS ?? '').trim();
    const dims = parseInt(rawDims, 10);
    if (!Number.isInteger(dims) || dims <= 0 || String(dims) !== rawDims) {
      throw new Error(`Invalid EMBEDDING_REMOTE_DIMENSIONS: "${rawDims}". Must be a positive integer.`);
    }

    remoteEmbedding.endpoint = endpoint;
    remoteEmbedding.allowedHosts = allowedHosts;
    remoteEmbedding.model = model;
    remoteEmbedding.dimensions = dims;
  }

  // Validate remote planner configuration
  const plannerRemoteEnabled = (env.PLANNER_REMOTE_ENABLED ?? '').trim().toLowerCase() === 'true';
  const remotePlanner: RemotePlannerConfig = { enabled: plannerRemoteEnabled };

  if (plannerRemoteEnabled) {
    const endpoint = (env.PLANNER_ENDPOINT ?? '').trim();
    if (!endpoint) {
      throw new Error('PLANNER_ENDPOINT is required when PLANNER_REMOTE_ENABLED is true.');
    }
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(endpoint);
    } catch {
      throw new Error(`Invalid PLANNER_ENDPOINT: "${endpoint}". Must be a valid URL.`);
    }

    const model = (env.PLANNER_MODEL ?? '').trim();
    if (!model) {
      throw new Error('PLANNER_MODEL is required when PLANNER_REMOTE_ENABLED is true.');
    }

    const apiKey = (env.PLANNER_API_KEY ?? '').trim();
    if (!apiKey) {
      throw new Error('PLANNER_API_KEY is required when PLANNER_REMOTE_ENABLED is true.');
    }

    const rawPlannerHosts = (env.PLANNER_REMOTE_ALLOWED_HOSTS ?? '').trim();
    const allowedPlannerHosts = rawPlannerHosts ? parseAllowedHosts(rawPlannerHosts, 'PLANNER_REMOTE_ALLOWED_HOSTS') : undefined;
    if (allowedPlannerHosts && !allowedPlannerHosts.includes(parsedUrl.hostname)) {
      throw new Error(
        `PLANNER_ENDPOINT host "${parsedUrl.hostname}" is not in PLANNER_REMOTE_ALLOWED_HOSTS.`
      );
    }

    const rawTimeout = (env.PLANNER_TIMEOUT_MS ?? '30000').trim() || '30000';
    const timeoutMs = Number(rawTimeout);
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) {
      throw new Error(
        `Invalid PLANNER_TIMEOUT_MS: "${rawTimeout}". Must be an integer between 1000 and 120000.`
      );
    }

    remotePlanner.endpoint = endpoint;
    remotePlanner.model = model;
    remotePlanner.apiKey = apiKey;
    remotePlanner.allowedHosts = allowedPlannerHosts;
    remotePlanner.timeoutMs = timeoutMs;
  }

  // Validate Neo4j configuration
  const neo4jUri = (env.NEO4J_URI ?? '').trim();
  const neo4jUser = (env.NEO4J_USER ?? '').trim();
  const neo4jPassword = (env.NEO4J_PASSWORD ?? '').trim();
  const neo4jDatabase = (env.NEO4J_DATABASE ?? '').trim() || undefined;

  let neo4j: Neo4jConfig = { enabled: false };
  if (neo4jUri) {
    let parsed: URL;
    try {
      parsed = new URL(neo4jUri);
    } catch {
      throw new Error(`Invalid NEO4J_URI: "${neo4jUri}". Must be a valid bolt/neo4j URL.`);
    }

    if (!['bolt:', 'neo4j:', 'bolt+s:', 'neo4j+s:', 'bolt+ssc:', 'neo4j+ssc:'].includes(parsed.protocol)) {
      throw new Error(`Invalid NEO4J_URI protocol: "${parsed.protocol}".`);
    }

    if ((neo4jUser && !neo4jPassword) || (!neo4jUser && neo4jPassword)) {
      throw new Error('NEO4J_USER and NEO4J_PASSWORD must both be provided when authentication is configured.');
    }

    neo4j = {
      enabled: true,
      uri: neo4jUri,
      user: neo4jUser || undefined,
      password: neo4jPassword || undefined,
      database: neo4jDatabase,
    };
  } else if (neo4jUser || neo4jPassword) {
    throw new Error('NEO4J_URI is required when NEO4J_USER or NEO4J_PASSWORD is provided.');
  }

  // Validate prose extraction configuration
  const proseExtractionEnabled = (env.PROSE_EXTRACTION_ENABLED ?? '').trim().toLowerCase() === 'true';
  let proseExtraction: ProseExtractionServerConfig = { enabled: proseExtractionEnabled };

  if (proseExtractionEnabled) {
    let endpoint = (env.PROSE_EXTRACTION_ENDPOINT ?? '').trim();
    let model = (env.PROSE_EXTRACTION_MODEL ?? '').trim();
    let apiKey = (env.PROSE_EXTRACTION_API_KEY ?? '').trim() || undefined;
    let rawHosts = (env.PROSE_EXTRACTION_ALLOWED_HOSTS ?? '').trim();

    // a. Fallback to planner credentials if endpoint is not explicitly provided
    if (!endpoint && remotePlanner.enabled && remotePlanner.endpoint) {
      endpoint = remotePlanner.endpoint;
      model = model || remotePlanner.model || '';
      apiKey = apiKey ?? remotePlanner.apiKey;
      if (!rawHosts && remotePlanner.allowedHosts) {
        rawHosts = remotePlanner.allowedHosts.join(',');
      }
    }

    // b. If no endpoint configured at all, fallback to enabled: false with a diagnostic warning
    if (!endpoint) {
      // eslint-disable-next-line no-console
      console.warn(
        '[PROSE_EXTRACTION_FALLBACK] PROSE_EXTRACTION_ENABLED is true but no endpoint is configured. Disabling prose extraction; falling back to deterministic extraction.'
      );
      proseExtraction = { enabled: false };
    } else {
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(endpoint);
      } catch {
        throw new Error(`Invalid PROSE_EXTRACTION_ENDPOINT: "${endpoint}". Must be a valid URL.`);
      }

      if (!model) {
        throw new Error('PROSE_EXTRACTION_MODEL is required when PROSE_EXTRACTION_ENABLED is true.');
      }

      let allowedHosts: string[] | undefined;
      if (rawHosts) {
        allowedHosts = parseAllowedHosts(rawHosts, 'PROSE_EXTRACTION_ALLOWED_HOSTS');
        if (!allowedHosts.includes(parsedUrl.hostname)) {
          throw new Error(
            `PROSE_EXTRACTION_ENDPOINT host "${parsedUrl.hostname}" is not in PROSE_EXTRACTION_ALLOWED_HOSTS.`
          );
        }
      }

      proseExtraction.endpoint = endpoint;
      proseExtraction.model = model;
      proseExtraction.apiKey = apiKey;
      proseExtraction.allowedHosts = allowedHosts;
    }
  }

  // Validate rollback grace period
  const rawGrace = (env.ROLLBACK_GRACE_PERIOD_MS ?? '600000').trim() || '600000';
  const rollbackGracePeriodMs = Number(rawGrace);
  if (!Number.isInteger(rollbackGracePeriodMs) || rollbackGracePeriodMs <= 0 || String(rollbackGracePeriodMs) !== rawGrace) {
    throw new Error(`Invalid ROLLBACK_GRACE_PERIOD_MS: "${rawGrace}". Must be a positive integer.`);
  }

  // Validate body limit bytes
  const rawBodyLimit = (env.KNOWLEDGE_SERVER_BODY_LIMIT_BYTES ?? '').trim();
  let bodyLimitBytes = DEFAULT_BODY_LIMIT_BYTES;
  if (rawBodyLimit) {
    const parsedLimit = Number(rawBodyLimit);
    if (!Number.isInteger(parsedLimit) || parsedLimit <= 0 || String(parsedLimit) !== rawBodyLimit) {
      throw new Error(
        `Invalid KNOWLEDGE_SERVER_BODY_LIMIT_BYTES: "${rawBodyLimit}". Must be a positive integer.`
      );
    }
    bodyLimitBytes = parsedLimit;
  }

  const timeouts = readRetrievalTimeouts(env);

  return {
    token,
    allowedOrigins,
    host,
    port,
    httpsTerminated,
    remoteEmbedding,
    remotePlanner,
    neo4j,
    proseExtraction,
    rollbackGracePeriodMs,
    timeouts,
    bodyLimitBytes,
  };
}

export async function startKnowledgeServer(
  env: NodeJS.ProcessEnv = process.env
): Promise<KnowledgeServer> {
  const options = readKnowledgeServerOptions(env);

  let graphRepository: Neo4jRepository | undefined;
  let retrievalService: RetrievalService | undefined;
  let graphBuildService: GraphBuildService | undefined;

  const snapshotStore = new SnapshotStore({
    storageDir: env.SNAPSHOT_STORAGE_DIR,
  });
  const attemptService = new AttemptService(snapshotStore);
  const ontologyRegistry = new OntologyRegistryService();

  if (options.neo4j.enabled && options.neo4j.uri) {
    graphRepository = new Neo4jRepository({
      uri: options.neo4j.uri,
      user: options.neo4j.user,
      password: options.neo4j.password,
      database: options.neo4j.database,
    });

    // Initialize constraints & schema on startup
    await graphRepository.initializeSchemaConstraints();

    const embeddingProvider: EmbeddingProvider = createEmbeddingProvider(env);

    const proseConfig: ProseExtractionConfig | undefined = options.proseExtraction.enabled
      ? {
          endpoint: options.proseExtraction.endpoint!,
          model: options.proseExtraction.model!,
          apiKey: options.proseExtraction.apiKey,
        }
      : undefined;

    graphBuildService = new GraphBuildService({
      repository: graphRepository,
      snapshotStore,
      embeddingProvider,
      proseExtraction: proseConfig,
      ontologyRegistry,
      productionMode: true,
      rollbackGracePeriodMs: options.rollbackGracePeriodMs,
    });

    // Query planner: either remote 9router planner or baseline fallback
    let queryPlanner: QueryPlanner;
    if (options.remotePlanner.enabled) {
      queryPlanner = new NineRouterQueryPlanner({
        enabled: true,
        endpoint: options.remotePlanner.endpoint!,
        model: options.remotePlanner.model!,
        apiKey: options.remotePlanner.apiKey!,
        allowedHosts: options.remotePlanner.allowedHosts!,
        timeoutMs: options.remotePlanner.timeoutMs,
      });
    } else {
      queryPlanner = {
        async plan(
          req: RetrievalRequest,
          ctx: QueryPlannerContext,
          _opts?: OperationOptions
        ): Promise<QueryPlanResult> {
          const fallback = buildDeterministicFallbackPlan(
            req.query,
            ctx.resolvedCandidates,
            'AUTONOMOUS_PLANNER_NOT_CONFIGURED'
          );
          return {
            type: 'plan',
            plan: fallback.plan,
          };
        },
      };
    }

    // Typed adapter bridges repo method names/criteria shapes to the gateway contracts.
    // Compiler now enforces both interfaces instead of the old `as unknown as` casts.
    // const capture: closures must not re-widen the `let graphRepository` back to undefined.
    const repo = graphRepository;
    const indexGateway: RetrievalIndexGateway = {
      acquirePinnedSnapshot: (setId) => repo.acquirePinnedSnapshot(setId),
      queryFulltext: (snapshotId, criteria) =>
        repo.queryFullText(snapshotId, criteria.keywords.join(' '), criteria.limit),
      queryVector: (snapshotId, criteria) =>
        repo.queryVector(snapshotId, criteria.vector, criteria.limit),
      queryChunksByDocument: (snapshotId, documentIds, limit) =>
        repo.queryChunksByDocument(snapshotId, documentIds, limit),
      validateVectorIndexMetadata: (snapshotId, metadata) =>
        repo.validateVectorIndexMetadata(snapshotId, metadata),
      // ponytail: repo ignores setId + gracePeriodMs and uses its global grace constant;
      //   add per-set retention + custom grace when multi-set policies diverge.
      cleanupSupersededSnapshots: (_setId, _gracePeriodMs) =>
        repo.cleanupSupersededGenerations(),
    };
    const graphGateway: GraphRetrievalGateway = repo;

    retrievalService = new RetrievalService(
      {
        indexGateway,
        embeddingProvider,
        queryPlanner,
        graphGateway,
      },
      {
        timeouts: options.timeouts,
      }
    );
  }

  const server = buildKnowledgeServer({
    token: options.token,
    allowedOrigins: options.allowedOrigins,
    host: options.host,
    port: options.port,
    httpsTerminated: options.httpsTerminated,
    bodyLimit: options.bodyLimitBytes,
    logger: { level: env.LOG_LEVEL || 'info' },
    attemptService,
    graphRepository,
    graphBuildService,
    retrievalService,
    readinessCheck: async () => {
      if (!graphRepository || !retrievalService) {
        return { neo4j: false, vectorIndex: false, model: false };
      }
      return { neo4j: true, vectorIndex: true, model: true };
    },
    onClose: async () => {
      if (graphRepository) {
        await graphRepository.close();
      }
    },
  });

  // Safe operator log - never log token, key, or secret details
  // eslint-disable-next-line no-console
  console.log(`Knowledge server listening on http://${server.host}:${server.port}`);

  if (options.remoteEmbedding.enabled) {
    const host = new URL(options.remoteEmbedding.endpoint!).hostname;
    // eslint-disable-next-line no-console
    console.log(
      `[REMOTE EGRESS BANNER] Semantic embeddings: remote-openai (host: ${host}, model: ${options.remoteEmbedding.model}, dim: ${options.remoteEmbedding.dimensions})`
    );
  } else {
    // eslint-disable-next-line no-console
    console.log('[LOCAL RUNTIME] Semantic embeddings: local-onnx (Xenova/multilingual-e5-small)');
  }

  if (options.remotePlanner.enabled) {
    // eslint-disable-next-line no-console
    console.log('[REMOTE EGRESS BANNER] Query planner: remote-enabled');
  }

  if (options.neo4j.enabled) {
    // eslint-disable-next-line no-console
    console.log(`[STORAGE] Graph & retrieval repository: Neo4j (${options.neo4j.uri})`);
  }

  await server.listen();
  return server;
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? resolve(process.argv[1]) : '';
const isDirectRun =
  currentFile === invokedFile ||
  invokedFile.endsWith('main.ts') ||
  invokedFile.endsWith('main.js');

if (isDirectRun) {
  startKnowledgeServer().catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error('Failed to start knowledge server:', err instanceof Error ? err.message : 'Unknown error');
    process.exit(1);
  });
}
