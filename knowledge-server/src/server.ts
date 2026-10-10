/// <reference types="node" />
import { timingSafeEqual } from 'node:crypto';
import cors from '@fastify/cors';
import Fastify, { type FastifyServerOptions } from 'fastify';
import { AttemptService } from './services/attemptService.js';
import { registerAttemptRoutes } from './routes/attempts.js';
import { registerSnapshotRoutes } from './routes/snapshots.js';
import { registerGraphRoutes, GraphBuildService } from './routes/graph.js';
import { GraphRepository } from './graph/graphRepository.js';

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
    new GraphBuildService(options.graphRepository, attemptService);

  void app.register(cors, {
    origin(origin, callback) {
      callback(null, origin !== undefined && allowedOrigins.has(origin));
    },
    credentials: false,
    allowedHeaders: ['authorization', 'content-type', 'x-attempt-key', 'x-rebuild-key'],
    methods: ['GET', 'POST', 'OPTIONS'],
  });

  app.get('/api/v1/health', async () => ({ status: 'ok' }));

  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/v1/')) return;
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
  registerSnapshotRoutes(app, attemptService);
  registerGraphRoutes(app, graphBuildService);

  return {
    app,
    host,
    port: options.port ?? 3001,
    listen: () => app.listen({ host, port: options.port ?? 3001 }),
  };
}
