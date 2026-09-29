import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, describe, test } from 'node:test';

import { createJiraProxyServer, isAllowedAtlassianTarget } from './jira-proxy.mjs';

function listen(server, host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, () => {
      server.off('error', reject);
      resolve(server.address().port);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function readJson(response) {
  return JSON.parse(await response.text());
}

describe('jira proxy target validation', () => {
  test('allows only HTTPS Atlassian targets', () => {
    assert.equal(isAllowedAtlassianTarget('https://example.atlassian.net/rest/api/3/myself'), true);
    assert.equal(isAllowedAtlassianTarget('https://api.atlassian.com/ex/jira/cloud/rest/api/3/myself'), true);
    assert.equal(isAllowedAtlassianTarget('http://example.atlassian.net/rest/api/3/myself'), false);
    assert.equal(isAllowedAtlassianTarget('https://evil-atlassian.net/rest/api/3/myself'), false);
    assert.equal(isAllowedAtlassianTarget('https://atlassian.net.evil.test/rest/api/3/myself'), false);
    assert.equal(isAllowedAtlassianTarget('not a url'), false);
  });
});

describe('jira proxy HTTP behavior', () => {
  let server;
  let port;
  let upstreamCalls;

  before(async () => {
    upstreamCalls = [];
    server = createJiraProxyServer({
      fetchImpl: async (url, init) => {
        upstreamCalls.push({ url, init });
        return new Response(JSON.stringify({ ok: true }), {
          status: 201,
          headers: {
            'content-type': 'application/json',
            'x-upstream': 'seen',
            'access-control-allow-origin': 'https://jira.example',
          },
        });
      },
      port: 3001,
    });
    port = await listen(server);
  });

  after(async () => {
    await close(server);
  });

  test('health returns JSON and CORS headers', async () => {
    const response = await fetch(`http://127.0.0.1:${port}/health`);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), '*');
    assert.deepEqual(await readJson(response), {
      status: 'ok',
      usage: 'Set CORS Proxy URL to http://localhost:3001/proxy?url=',
    });
  });

  test('preflight returns Jira methods and headers', async () => {
    const response = await fetch(`http://127.0.0.1:${port}/proxy?url=https://example.atlassian.net/rest/api/3/myself`, {
      method: 'OPTIONS',
    });

    assert.equal(response.status, 204);
    assert.match(response.headers.get('access-control-allow-methods'), /GET/);
    assert.match(response.headers.get('access-control-allow-methods'), /POST/);
    assert.match(response.headers.get('access-control-allow-headers'), /Authorization/);
  });

  test('missing target URL returns 400 JSON', async () => {
    const response = await fetch(`http://127.0.0.1:${port}/proxy`);

    assert.equal(response.status, 400);
    assert.equal((await readJson(response)).error, 'Missing ?url= parameter. Example: /proxy?url=https://your-domain.atlassian.net/rest/api/3/myself');
  });

  test('non-Atlassian or non-HTTPS targets return 403 without upstream fetch', async () => {
    const beforeCount = upstreamCalls.length;
    const response = await fetch(`http://127.0.0.1:${port}/proxy?url=${encodeURIComponent('http://example.atlassian.net/rest/api/3/myself')}`);

    assert.equal(response.status, 403);
    assert.equal((await readJson(response)).error, 'Proxy only forwards to HTTPS Atlassian hosts (*.atlassian.net / *.atlassian.com)');
    assert.equal(upstreamCalls.length, beforeCount);
  });

  test('allowed Atlassian request forwards method, body, and safe headers', async () => {
    const response = await fetch(`http://127.0.0.1:${port}/proxy?url=${encodeURIComponent('https://example.atlassian.net/rest/api/3/issue')}`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer token',
        'content-type': 'application/json',
        origin: 'http://localhost:5173',
        referer: 'http://localhost:5173/settings',
      },
      body: JSON.stringify({ fields: { summary: 'Test' } }),
    });

    assert.equal(response.status, 201);
    assert.equal(response.headers.get('access-control-allow-origin'), '*');
    assert.equal(response.headers.get('x-upstream'), 'seen');
    assert.deepEqual(await readJson(response), { ok: true });

    assert.equal(upstreamCalls.length, 1);
    const call = upstreamCalls[0];
    assert.equal(call.url, 'https://example.atlassian.net/rest/api/3/issue');
    assert.equal(call.init.method, 'POST');
    assert.equal(call.init.headers.authorization, 'Bearer token');
    assert.equal(call.init.headers['content-type'], 'application/json');
    assert.equal(call.init.headers.origin, undefined);
    assert.equal(call.init.headers.referer, undefined);
    assert.equal(call.init.headers.host, undefined);
    assert.equal(call.init.body.toString(), JSON.stringify({ fields: { summary: 'Test' } }));
  });
});

// Proves tests never depend on a real network listener.
test('local ephemeral upstream can be reached by injected fetch when needed', async () => {
  const upstream = createServer((_, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ local: true }));
  });
  const upstreamPort = await listen(upstream);

  try {
    const response = await fetch(`http://127.0.0.1:${upstreamPort}/ping`);
    assert.deepEqual(await readJson(response), { local: true });
  } finally {
    await close(upstream);
  }
});
