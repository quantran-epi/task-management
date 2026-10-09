/// <reference types="node" />
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { describe, expect, it } from 'vitest';
import { readKnowledgeServerOptions, startKnowledgeServer } from '../src/main.js';

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
  it('parses valid minimal environment', () => {
    const opts = readKnowledgeServerOptions({
      KNOWLEDGE_SERVER_TOKEN: 'valid-token',
      KNOWLEDGE_ALLOWED_ORIGINS: 'https://planner.example',
    });
    expect(opts.token).toBe('valid-token');
    expect(opts.allowedOrigins).toEqual(['https://planner.example']);
    expect(opts.host).toBe('127.0.0.1');
    expect(opts.port).toBe(3001);
    expect(opts.httpsTerminated).toBe(false);
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
    for (let i = 0; i < 60; i++) {
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
  });
});
