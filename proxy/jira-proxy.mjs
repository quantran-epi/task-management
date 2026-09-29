#!/usr/bin/env node
/**
 * Local Jira CORS proxy — zero dependencies, Node 24+.
 *
 * Forwards browser requests to Jira Cloud, adding CORS headers so the
 * browser accepts the response. Runs on localhost only.
 *
 * Usage:
 *   node proxy/jira-proxy.mjs              # port 3001
 *   PORT=8888 node proxy/jira-proxy.mjs    # custom port
 *
 * App config (Settings > Jira > CORS Proxy URL):
 *   http://localhost:3001/proxy?url=
 */

import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

const DEFAULT_PORT = 3001;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Atlassian-Token, Accept',
  'Access-Control-Allow-Private-Network': 'true',
  'Access-Control-Max-Age': '86400',
};

const strippedRequestHeaders = new Set([
  'host',
  'origin',
  'referer',
  'connection',
  'transfer-encoding',
  'content-length',
]);

const strippedResponseHeaders = new Set([
  'transfer-encoding',
  'connection',
  'access-control-allow-origin',
  'access-control-allow-methods',
  'access-control-allow-headers',
]);

function sendJson(res, status, payload) {
  res.writeHead(status, { ...corsHeaders, 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

export function isAllowedAtlassianTarget(targetUrl) {
  try {
    const url = new URL(targetUrl);
    const host = url.hostname.toLowerCase();

    return (
      url.protocol === 'https:' &&
      (host === 'atlassian.net' ||
        host.endsWith('.atlassian.net') ||
        host === 'atlassian.com' ||
        host.endsWith('.atlassian.com'))
    );
  } catch {
    return false;
  }
}

export function createJiraProxyServer({ fetchImpl = fetch, port = DEFAULT_PORT } = {}) {
  return createServer(async (req, res) => {
    if (req.url === '/' || req.url === '/health') {
      sendJson(res, 200, {
        status: 'ok',
        usage: `Set CORS Proxy URL to http://localhost:${port}/proxy?url=`,
      });
      return;
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders);
      res.end();
      return;
    }

    const parsed = new URL(req.url ?? '/', `http://localhost:${port}`);
    const targetUrl = parsed.searchParams.get('url');

    if (!parsed.pathname.startsWith('/proxy') || !targetUrl) {
      sendJson(res, 400, {
        error: 'Missing ?url= parameter. Example: /proxy?url=https://your-domain.atlassian.net/rest/api/3/myself',
      });
      return;
    }

    if (!isAllowedAtlassianTarget(targetUrl)) {
      sendJson(res, 403, {
        error: 'Proxy only forwards to HTTPS Atlassian hosts (*.atlassian.net / *.atlassian.com)',
      });
      return;
    }

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);

    const forwardHeaders = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (!strippedRequestHeaders.has(key.toLowerCase())) forwardHeaders[key] = value;
    }

    try {
      const upstream = await fetchImpl(targetUrl, {
        method: req.method,
        headers: forwardHeaders,
        body: ['GET', 'HEAD'].includes(req.method ?? '') ? undefined : body,
        signal: AbortSignal.timeout(30000),
      });

      const responseHeaders = { ...corsHeaders };
      for (const [key, value] of upstream.headers.entries()) {
        if (!strippedResponseHeaders.has(key.toLowerCase())) responseHeaders[key] = value;
      }

      res.writeHead(upstream.status, responseHeaders);
      res.end(Buffer.from(await upstream.arrayBuffer()));
    } catch (error) {
      sendJson(res, 502, {
        error: error instanceof Error ? error.message : 'Proxy fetch failed',
      });
    }
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const port = Number(process.env.PORT) || DEFAULT_PORT;
  const server = createJiraProxyServer({ port });

  server.listen(port, '127.0.0.1', () => {
    console.log(`Jira CORS proxy running on http://localhost:${port}`);
    console.log(`Set CORS Proxy URL in app to: http://localhost:${port}/proxy?url=`);
  });
}
