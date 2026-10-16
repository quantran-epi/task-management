/// <reference types="node" />
import { timingSafeEqual } from 'node:crypto';
import cors from '@fastify/cors';
import Fastify, { type FastifyServerOptions } from 'fastify';
import { AttemptService } from './services/attemptService.js';
import { registerAttemptRoutes } from './routes/attempts.js';
import { registerSnapshotRoutes } from './routes/snapshots.js';
import { registerGraphRoutes, GraphBuildService } from './routes/graph.js';
import { registerRetrievalRoutes } from './routes/retrieval.js';
import { GraphRepository } from './graph/graphRepository.js';
import type { RetrievalService } from './services/retrievalService.js';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);
const SAFE_ERROR = { error: { code: 'INTERNAL_ERROR', message: 'Request could not be processed.' } };

export interface KnowledgeServerOptions {
  token: string;
  allowedOrigins: readonly string[];
  host?: string | undefined;
  port?: number | undefined;
  httpsTerminated?: boolean | undefined;
  bodyLimit?: number | undefined;
  logger?: Exclude<FastifyServerOptions['logger'], boolean> | undefined;
  attemptService?: AttemptService | undefined;
  graphRepository?: GraphRepository | undefined;
  graphBuildService?: GraphBuildService | undefined;
  retrievalService?: Pick<RetrievalService, 'retrieve'> | undefined;
  readinessCheck?: (() => Promise<{ neo4j: boolean; vectorIndex: boolean; model: boolean }>) | undefined;
  onClose?: (() => Promise<void> | void) | undefined;
}

export interface KnowledgeServer {
  app: ReturnType<typeof Fastify>;
  host: string;
  port: number;
  listen(): Promise<string>;
}

function authorized(header: string | undefined, token: string) {
  if (!header?.startsWith('Bearer ')) return false;
  const candidate = Buffer.from(header.slice(7));
  const expected = Buffer.from(token);
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function buildKnowledgeServer(options: KnowledgeServerOptions): KnowledgeServer {
  const token = options.token.trim();
  const allowedOrigins = new Set(options.allowedOrigins);
  if (!token) throw new Error('Knowledge server token is required.');
  if (allowedOrigins.size === 0 || [...allowedOrigins].some((origin) => !origin)) {
    throw new Error('At least one exact allowed origin is required.');
  }

  const host = options.host ?? '127.0.0.1';
  if (!LOOPBACK_HOSTS.has(host) && !options.httpsTerminated) {
    throw new Error('Remote knowledge server binding requires HTTPS termination.');
  }

  const app = Fastify({
    bodyLimit: options.bodyLimit ?? 1_048_576,
    logger:
      options.logger === undefined
        ? false
        : {
            ...options.logger,
            redact: {
              paths: ['req.headers.authorization', 'req.body', 'request.body', 'body', 'payload', 'stack'],
              censor: '[REDACTED]',
              remove: true,
            },
          },
  });
  const attemptService = options.attemptService ?? new AttemptService();
  const graphBuildService =
    options.graphBuildService ??
    new GraphBuildService(options.graphRepository, attemptService.store);

  void app.register(cors, {
    origin(origin, callback) {
      callback(null, origin !== undefined && allowedOrigins.has(origin));
    },
    credentials: false,
    allowedHeaders: ['authorization', 'content-type', 'x-attempt-key', 'x-rebuild-key', 'x-correlation-id'],
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  });

  app.get('/api/v1/health', async () => ({ status: 'ok' }));
  app.get('/api/v1/health/liveness', async () => ({ status: 'alive' }));
  app.get('/api/v1/health/readiness', async (_request, reply) => {
    const checks = options.readinessCheck
      ? await options.readinessCheck()
      : {
          neo4j: Boolean(options.graphRepository),
          vectorIndex: Boolean(options.graphRepository),
          model: Boolean(options.retrievalService),
        };
    const ready = checks.neo4j && checks.vectorIndex && checks.model;
    return reply.code(ready ? 200 : 503).send({ status: ready ? 'ready' : 'not_ready', checks });
  });

  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/v1/')) return;
    if (request.url.startsWith('/api/v1/health/liveness')) return;
    if (request.url.startsWith('/api/v1/health/readiness')) return;
    const origin = request.headers.origin;
    if (!origin || !allowedOrigins.has(origin)) {
      return reply.code(403).send({
        error: { code: 'ORIGIN_DENIED', message: 'Request origin is not allowed.' },
      });
    }
    if (!authorized(request.headers.authorization, token)) {
      return reply.code(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Valid bearer authorization is required.' },
      });
    }
  });

  app.setErrorHandler((error: unknown, request, reply) => {
    const safeError =
      typeof error === 'object' && error
        ? (error as { code?: string | undefined; statusCode?: number | undefined })
        : {};
    request.log.warn(
      { code: safeError.code, statusCode: safeError.statusCode },
      'Request rejected'
    );
    if (safeError.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      return reply.code(413).send({
        error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body exceeds the configured limit.' },
      });
    }
    if (safeError.statusCode && safeError.statusCode < 500) {
      return reply.code(safeError.statusCode).send({
        error: { code: 'INVALID_REQUEST', message: 'Request could not be processed.' },
      });
    }
    return reply.code(500).send(SAFE_ERROR);
  });

  registerAttemptRoutes(app, attemptService);
  registerSnapshotRoutes(app, attemptService, graphBuildService);
  registerGraphRoutes(app, graphBuildService);
  if (options.retrievalService) {
    registerRetrievalRoutes(app, options.retrievalService);
  }

  if (options.onClose) {
    app.addHook('onClose', async () => {
      await options.onClose?.();
    });
  }

  return {
    app,
    host,
    port: options.port ?? 3001,
    listen: () => app.listen({ host, port: options.port ?? 3001 }),
  };
}
