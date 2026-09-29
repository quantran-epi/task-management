#!/usr/bin/env node
import { createServer } from 'node:http';

export function isAllowedAtlassianTarget() {
  return false;
}

export function createJiraProxyServer() {
  return createServer((_, res) => {
    res.writeHead(501, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not implemented' }));
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT) || 3001;
  const server = createJiraProxyServer({ port });
  server.listen(port, '127.0.0.1', () => {
    console.log(`Jira CORS proxy running on http://localhost:${port}`);
    console.log(`Set CORS Proxy URL in app to: http://localhost:${port}/proxy?url=`);
  });
}
