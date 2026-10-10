import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { buildKnowledgeServer, type KnowledgeServer } from './server.js';
import { createEmbeddingProvider } from './embedding/embeddingProviders.js';
import { Neo4jRepository } from './graph/neo4jRepository.js';
import {
  RetrievalService,
  readRetrievalTimeouts,
  type RetrievalTimeouts,
} from './services/retrievalService.js';
import type {
  EmbeddingProvider,
  QueryPlanner,
  RetrievalIndexGateway,
  GraphRetrievalGateway,
} from './retrieval/contracts.js';
import type {
  RetrievalRequest,
  QueryPlannerContext,
  QueryPlanResult,
  OperationOptions,
} from './retrieval/contracts.js';

export interface RemoteEmbeddingConfig {
  enabled: boolean;
  endpoint?: string;
  allowedHosts?: string[];
  model?: string;
  dimensions?: number;
}

export interface RemotePlannerConfig {
  enabled: boolean;
  allowedHosts?: string[];
}

export interface Neo4jConfig {
  enabled: boolean;
  uri?: string;
  user?: string;
  password?: string;
  database?: string;
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
  timeouts: RetrievalTimeouts;
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

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
    if (parsedUrl.protocol !== 'https:') {
      throw new Error(`EMBEDDING_REMOTE_ENDPOINT must use HTTPS protocol: "${endpoint}".`);
    }
    if (parsedUrl.username || parsedUrl.password) {
      throw new Error('EMBEDDING_REMOTE_ENDPOINT must not contain credentials.');
    }
    if (parsedUrl.search || parsedUrl.hash) {
      throw new Error('EMBEDDING_REMOTE_ENDPOINT must not contain query parameters or hash.');
    }

    const rawHosts = (env.EMBEDDING_REMOTE_ALLOWED_HOSTS ?? '').trim();
    const allowedHosts = parseAllowedHosts(rawHosts, 'EMBEDDING_REMOTE_ALLOWED_HOSTS');
    if (!allowedHosts.includes(parsedUrl.hostname)) {
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
    const rawPlannerHosts = (env.PLANNER_REMOTE_ALLOWED_HOSTS ?? '').trim();
    const allowedPlannerHosts = parseAllowedHosts(rawPlannerHosts, 'PLANNER_REMOTE_ALLOWED_HOSTS');
    remotePlanner.allowedHosts = allowedPlannerHosts;
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
    timeouts,
  };
}

export async function startKnowledgeServer(
  env: NodeJS.ProcessEnv = process.env
): Promise<KnowledgeServer> {
  const options = readKnowledgeServerOptions(env);

  let graphRepository: Neo4jRepository | undefined;
  let retrievalService: RetrievalService | undefined;

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

    // Provider-neutral baseline query planner
    const queryPlanner: QueryPlanner = {
      async plan(
        _req: RetrievalRequest,
        _ctx: QueryPlannerContext,
        _opts?: OperationOptions
      ): Promise<QueryPlanResult> {
        return {
          type: 'unsupported',
          reason: 'Autonomous query planner not configured',
          unsupportedConstructs: [],
        };
      },
    };

    // Shared Neo4j repository acts as index gateway and graph gateway
    const indexGateway = graphRepository as unknown as RetrievalIndexGateway;
    const graphGateway = graphRepository as unknown as GraphRetrievalGateway;

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
    graphRepository,
    retrievalService,
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
