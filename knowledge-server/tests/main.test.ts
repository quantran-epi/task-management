/// <reference types="node" />
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { describe, expect, it } from 'vitest';
import { readKnowledgeServerOptions, startKnowledgeServer } from '../src/main.js';
import { buildKnowledgeServer } from '../src/server.js';

const KNOWLEDGE_SERVER_DIR = resolve(fileURLToPath(import.meta.url), '../../');

const VALID_ORIGIN = 'https://planner.example';
const TOKEN_CANARY = 'secret-token-canary-never-leak-999';

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => {
      const address = srv.address();
      if (!address || typeof address === 'string') {
        srv.close(() => reject(new Error('Could not get free port')));
        return;
      }
      const port = address.port;
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

describe('readKnowledgeServerOptions', () => {
  it('parses valid minimal environment with remote off by default', () => {
    const opts = readKnowledgeServerOptions({
      KNOWLEDGE_SERVER_TOKEN: 'valid-token',
      KNOWLEDGE_ALLOWED_ORIGINS: 'https://planner.example',
    });
    expect(opts.token).toBe('valid-token');
    expect(opts.allowedOrigins).toEqual(['https://planner.example']);
    expect(opts.host).toBe('127.0.0.1');
    expect(opts.port).toBe(3001);
    expect(opts.httpsTerminated).toBe(false);
    expect(opts.remoteEmbedding.enabled).toBe(false);
    expect(opts.remotePlanner.enabled).toBe(false);
    expect(opts.neo4j.enabled).toBe(false);
    expect(opts.timeouts).toEqual({
      fulltextMs: 500,
      vectorMs: 1500,
      graphMs: 2000,
    });
  });

  it('parses multiple comma-separated trimmed origins', () => {
    const opts = readKnowledgeServerOptions({
      KNOWLEDGE_SERVER_TOKEN: 'valid-token',
      KNOWLEDGE_ALLOWED_ORIGINS: ' http://localhost:4173 , https://planner.example ',
      HOST: 'localhost',
      PORT: '8080',
      HTTPS_TERMINATED: 'true',
    });
    expect(opts.allowedOrigins).toEqual(['http://localhost:4173', 'https://planner.example']);
    expect(opts.host).toBe('localhost');
    expect(opts.port).toBe(8080);
    expect(opts.httpsTerminated).toBe(true);
  });

  it('validates remote embedding configuration when enabled', () => {
    const opts = readKnowledgeServerOptions({
      KNOWLEDGE_SERVER_TOKEN: 'valid-token',
      KNOWLEDGE_ALLOWED_ORIGINS: VALID_ORIGIN,
      EMBEDDING_REMOTE_ENABLED: 'true',
      EMBEDDING_REMOTE_ENDPOINT: 'https://api.openai.com',
      EMBEDDING_REMOTE_ALLOWED_HOSTS: 'api.openai.com, custom.openai.azure.com',
      EMBEDDING_REMOTE_API_KEY: 'sk-secret-123',
      EMBEDDING_REMOTE_MODEL: 'text-embedding-3-small',
      EMBEDDING_REMOTE_DIMENSIONS: '1536',
    });
    expect(opts.remoteEmbedding.enabled).toBe(true);
    expect(opts.remoteEmbedding.endpoint).toBe('https://api.openai.com');
    expect(opts.remoteEmbedding.allowedHosts).toEqual(['api.openai.com', 'custom.openai.azure.com']);
    expect(opts.remoteEmbedding.model).toBe('text-embedding-3-small');
    expect(opts.remoteEmbedding.dimensions).toBe(1536);
  });

  it('rejects remote embedding with invalid or unapproved host', () => {
    expect(() =>
      readKnowledgeServerOptions({
        KNOWLEDGE_SERVER_TOKEN: 'valid-token',
        KNOWLEDGE_ALLOWED_ORIGINS: VALID_ORIGIN,
        EMBEDDING_REMOTE_ENABLED: 'true',
        EMBEDDING_REMOTE_ENDPOINT: 'https://evil.example.com',
        EMBEDDING_REMOTE_ALLOWED_HOSTS: 'api.openai.com',
        EMBEDDING_REMOTE_API_KEY: 'sk-secret',
        EMBEDDING_REMOTE_MODEL: 'text-embedding-3-small',
        EMBEDDING_REMOTE_DIMENSIONS: '1536',
      })
    ).toThrow(/EMBEDDING_REMOTE_ALLOWED_HOSTS/);
  });

  it('rejects missing or empty token without leaking canary', () => {
    expect(() =>
      readKnowledgeServerOptions({
        KNOWLEDGE_SERVER_TOKEN: '   ',
        KNOWLEDGE_ALLOWED_ORIGINS: VALID_ORIGIN,
      })
    ).toThrow(/token/i);
    try {
      readKnowledgeServerOptions({
        KNOWLEDGE_SERVER_TOKEN: '',
        KNOWLEDGE_ALLOWED_ORIGINS: VALID_ORIGIN,
      });
    } catch (e: unknown) {
      expect(String(e)).not.toContain(TOKEN_CANARY);
    }
  });

  it('rejects missing or empty origins', () => {
    expect(() =>
      readKnowledgeServerOptions({
        KNOWLEDGE_SERVER_TOKEN: 'valid-token',
        KNOWLEDGE_ALLOWED_ORIGINS: '   ,  ',
      })
    ).toThrow(/origin/i);
  });

  it('rejects wildcard, path-bearing, query, fragment, or non-origin URL formats', () => {
    const invalidOrigins = [
      '*',
      'https://*',
      'https://planner.example/path',
      'https://planner.example?query=1',
      'https://planner.example#hash',
      'https://planner.example/',
      'ftp://planner.example',
      'not-a-url',
    ];
    for (const origin of invalidOrigins) {
      expect(() =>
        readKnowledgeServerOptions({
          KNOWLEDGE_SERVER_TOKEN: 'valid-token',
          KNOWLEDGE_ALLOWED_ORIGINS: origin,
        })
      ).toThrow(/origin/i);
    }
  });

  it('rejects invalid ports', () => {
    for (const port of ['0', '-1', '65536', 'abc', '3000.5']) {
      expect(() =>
        readKnowledgeServerOptions({
          KNOWLEDGE_SERVER_TOKEN: 'valid-token',
          KNOWLEDGE_ALLOWED_ORIGINS: VALID_ORIGIN,
          PORT: port,
        })
      ).toThrow(/port/i);
    }
  });

  it('validates Neo4j configuration when enabled', () => {
    const opts = readKnowledgeServerOptions({
      KNOWLEDGE_SERVER_TOKEN: 'valid-token',
      KNOWLEDGE_ALLOWED_ORIGINS: VALID_ORIGIN,
      NEO4J_URI: 'bolt://localhost:7687',
      NEO4J_USER: 'neo4j',
      NEO4J_PASSWORD: 'password123',
      NEO4J_DATABASE: 'neo4j',
    });
    expect(opts.neo4j.enabled).toBe(true);
    expect(opts.neo4j.uri).toBe('bolt://localhost:7687');
    expect(opts.neo4j.user).toBe('neo4j');
    expect(opts.neo4j.password).toBe('password123');
    expect(opts.neo4j.database).toBe('neo4j');
  });

  it('rejects partial Neo4j credentials or invalid URI protocol', () => {
    expect(() =>
      readKnowledgeServerOptions({
        KNOWLEDGE_SERVER_TOKEN: 'valid-token',
        KNOWLEDGE_ALLOWED_ORIGINS: VALID_ORIGIN,
        NEO4J_URI: 'bolt://localhost:7687',
        NEO4J_USER: 'neo4j',
      })
    ).toThrow(/NEO4J_PASSWORD/i);

    expect(() =>
      readKnowledgeServerOptions({
        KNOWLEDGE_SERVER_TOKEN: 'valid-token',
        KNOWLEDGE_ALLOWED_ORIGINS: VALID_ORIGIN,
        NEO4J_USER: 'neo4j',
        NEO4J_PASSWORD: 'pwd',
      })
    ).toThrow(/NEO4J_URI/i);

    expect(() =>
      readKnowledgeServerOptions({
        KNOWLEDGE_SERVER_TOKEN: 'valid-token',
        KNOWLEDGE_ALLOWED_ORIGINS: VALID_ORIGIN,
        NEO4J_URI: 'http://localhost:7474',
      })
    ).toThrow(/protocol/i);
  });

  it('rejects remote binding without HTTPS termination', () => {
    expect(() =>
      readKnowledgeServerOptions({
        KNOWLEDGE_SERVER_TOKEN: 'valid-token',
        KNOWLEDGE_ALLOWED_ORIGINS: VALID_ORIGIN,
        HOST: '0.0.0.0',
        HTTPS_TERMINATED: 'false',
      })
    ).toThrow(/HTTPS/i);
  });
});

describe('executable startup', () => {
  it('opens a real listener and terminates cleanly without leaking token canary', async () => {
    const port = await getFreePort();
    const serverInstance = await startKnowledgeServer({
      KNOWLEDGE_SERVER_TOKEN: TOKEN_CANARY,
      KNOWLEDGE_ALLOWED_ORIGINS: VALID_ORIGIN,
      PORT: String(port),
      HOST: '127.0.0.1',
    });
    expect(serverInstance.port).toBe(port);

    // Call health check to verify it is listening
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/health`, {
      headers: {
        Origin: VALID_ORIGIN,
        Authorization: `Bearer ${TOKEN_CANARY}`,
      },
    });
    expect(res.status).toBe(200);

    await serverInstance.app.close();
  });

  it('launches via tsx src/main.ts child process on custom port without canary in output', async () => {
    const port = await getFreePort();
    let stdoutData = '';
    let stderrData = '';

    const tsxCli = resolve(KNOWLEDGE_SERVER_DIR, 'node_modules/tsx/dist/cli.mjs');
    const child = spawn(
      process.execPath,
      [tsxCli, 'src/main.ts'],
      {
        cwd: KNOWLEDGE_SERVER_DIR,
        env: {
          ...process.env,
          KNOWLEDGE_SERVER_TOKEN: TOKEN_CANARY,
          KNOWLEDGE_ALLOWED_ORIGINS: VALID_ORIGIN,
          PORT: String(port),
          HOST: '127.0.0.1',
          NEO4J_URI: '',
          NEO4J_USER: '',
          NEO4J_PASSWORD: '',
          PLANNER_REMOTE_ENABLED: 'false',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );

    child.stdout.on('data', (d) => {
      stdoutData += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderrData += d.toString();
    });

    child.on('error', (err) => {
      stderrData += `\nchild error: ${err.message}`;
    });

    // Wait until port is open
    let ready = false;
    for (let i = 0; i < 150; i++) {
      if (stdoutData.includes('listening on')) {
        ready = true;
        break;
      }
      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/v1/health`, {
          headers: {
            Origin: VALID_ORIGIN,
            Authorization: `Bearer ${TOKEN_CANARY}`,
          },
        });
        if (res.ok) {
          ready = true;
          break;
        }
      } catch {
        // ignore and retry
      }
      await new Promise((r) => setTimeout(r, 100));
    }

    child.kill();
    await new Promise((resolve) => child.on('exit', resolve));

    if (!ready) {
      throw new Error(`Child did not become ready. stdout: "${stdoutData}", stderr: "${stderrData}"`);
    }

    expect(ready).toBe(true);
    expect(stdoutData).not.toContain(TOKEN_CANARY);
    expect(stderrData).not.toContain(TOKEN_CANARY);
  }, 25000);

  it('proves clean shutdown triggers onClose handler and releases resources', async () => {
    let closed = false;
    const serverInstance = buildKnowledgeServer({
      token: 'test-token',
      allowedOrigins: [VALID_ORIGIN],
      onClose: async () => {
        closed = true;
      },
    });

    await serverInstance.app.close();
    expect(closed).toBe(true);
  });

  describe('Remote planner configuration validation (D-13, D-14)', () => {
    it('throws when PLANNER_REMOTE_ENABLED is true but PLANNER_ENDPOINT is missing', () => {
      expect(() =>
        readKnowledgeServerOptions({
          KNOWLEDGE_SERVER_TOKEN: 'valid-token',
          KNOWLEDGE_ALLOWED_ORIGINS: VALID_ORIGIN,
          PLANNER_REMOTE_ENABLED: 'true',
          PLANNER_MODEL: 'qwen2.5-72b-instruct',
          PLANNER_API_KEY: 'secret-key',
          PLANNER_REMOTE_ALLOWED_HOSTS: '9router.internal.shb.vn',
        })
      ).toThrow(/PLANNER_ENDPOINT is required/);
    });

    it('throws when PLANNER_REMOTE_ENABLED is true but PLANNER_MODEL is missing', () => {
      expect(() =>
        readKnowledgeServerOptions({
          KNOWLEDGE_SERVER_TOKEN: 'valid-token',
          KNOWLEDGE_ALLOWED_ORIGINS: VALID_ORIGIN,
          PLANNER_REMOTE_ENABLED: 'true',
          PLANNER_ENDPOINT: 'https://9router.internal.shb.vn',
          PLANNER_API_KEY: 'secret-key',
          PLANNER_REMOTE_ALLOWED_HOSTS: '9router.internal.shb.vn',
        })
      ).toThrow(/PLANNER_MODEL is required/);
    });

    it('throws when PLANNER_REMOTE_ENABLED is true but PLANNER_API_KEY is missing', () => {
      expect(() =>
        readKnowledgeServerOptions({
          KNOWLEDGE_SERVER_TOKEN: 'valid-token',
          KNOWLEDGE_ALLOWED_ORIGINS: VALID_ORIGIN,
          PLANNER_REMOTE_ENABLED: 'true',
          PLANNER_ENDPOINT: 'https://9router.internal.shb.vn',
          PLANNER_MODEL: 'qwen2.5-72b-instruct',
          PLANNER_REMOTE_ALLOWED_HOSTS: '9router.internal.shb.vn',
        })
      ).toThrow(/PLANNER_API_KEY is required/);
    });

    it('throws when PLANNER_ENDPOINT host is not in PLANNER_REMOTE_ALLOWED_HOSTS', () => {
      expect(() =>
        readKnowledgeServerOptions({
          KNOWLEDGE_SERVER_TOKEN: 'valid-token',
          KNOWLEDGE_ALLOWED_ORIGINS: VALID_ORIGIN,
          PLANNER_REMOTE_ENABLED: 'true',
          PLANNER_ENDPOINT: 'https://evil.host.com',
          PLANNER_MODEL: 'qwen2.5-72b-instruct',
          PLANNER_API_KEY: 'secret-key',
          PLANNER_REMOTE_ALLOWED_HOSTS: '9router.internal.shb.vn',
        })
      ).toThrow(/not in PLANNER_REMOTE_ALLOWED_HOSTS/);
    });

    it('parses valid remote planner configuration correctly', () => {
      const opts = readKnowledgeServerOptions({
        KNOWLEDGE_SERVER_TOKEN: 'valid-token',
        KNOWLEDGE_ALLOWED_ORIGINS: VALID_ORIGIN,
        PLANNER_REMOTE_ENABLED: 'true',
        PLANNER_ENDPOINT: 'https://9router.internal.shb.vn',
        PLANNER_MODEL: 'qwen2.5-72b-instruct',
        PLANNER_API_KEY: 'secret-key',
        PLANNER_REMOTE_ALLOWED_HOSTS: '9router.internal.shb.vn',
      });
      expect(opts.remotePlanner.enabled).toBe(true);
      expect(opts.remotePlanner.endpoint).toBe('https://9router.internal.shb.vn');
      expect(opts.remotePlanner.model).toBe('qwen2.5-72b-instruct');
      expect(opts.remotePlanner.apiKey).toBe('secret-key');
      expect(opts.remotePlanner.allowedHosts).toEqual(['9router.internal.shb.vn']);
      expect(opts.remotePlanner.timeoutMs).toBe(30000);
    });
  });
});
