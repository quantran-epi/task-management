import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { buildKnowledgeServer, type KnowledgeServer } from './server.js';

export interface ReadKnowledgeServerOptionsResult {
  token: string;
  allowedOrigins: string[];
  host: string;
  port: number;
  httpsTerminated: boolean;
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

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

  return {
    token,
    allowedOrigins,
    host,
    port,
    httpsTerminated,
  };
}

export async function startKnowledgeServer(
  env: NodeJS.ProcessEnv = process.env
): Promise<KnowledgeServer> {
  const options = readKnowledgeServerOptions(env);
  const server = buildKnowledgeServer({
    token: options.token,
    allowedOrigins: options.allowedOrigins,
    host: options.host,
    port: options.port,
    httpsTerminated: options.httpsTerminated,
  });

  await server.listen();
  // Safe operator log - never log token or secret details
  // eslint-disable-next-line no-console
  console.log(`Knowledge server listening on http://${server.host}:${server.port}`);
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
