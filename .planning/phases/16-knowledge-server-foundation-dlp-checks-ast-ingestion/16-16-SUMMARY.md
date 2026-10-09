---
phase: 16-knowledge-server-foundation-dlp-checks-ast-ingestion
plan: 16
subsystem: knowledge-server
tags: [daemon, executable, fail-closed, auth, health-route, gap-closure]
requires: [16-08, 16-10]
provides: [executable-daemon, authenticated-health-contract]
affects: [knowledge-server, settings-diagnostics]
tech-stack:
  added: []
  patterns: [fail-closed-environment-validation, constant-time-auth-guard, exact-origin-cors]
key-files:
  created:
    - knowledge-server/src/main.ts
    - knowledge-server/tests/main.test.ts
  modified:
    - knowledge-server/package.json
    - knowledge-server/src/server.ts
    - knowledge-server/tests/server.test.ts
decisions:
  - "Close GAP-01 / CR-01: Export readKnowledgeServerOptions and startKnowledgeServer in knowledge-server/src/main.ts, failing closed before listening on invalid/insecure environment."
  - "Close CR-02: Register one authenticated /api/v1/health route in Fastify under onRequest hook, eliminating unversioned /health contract divergence with KnowledgeServerConfigCard."
metrics:
  duration: 12m
  completed_date: "2026-10-09"
  tasks: 2
  files: 5
---

# Phase 16 Plan 16: Executable Daemon Entrypoint and Health Contract Gap Closure Summary

One-liner: Fail-closed daemon executable entrypoint with validated exact origins and unified authenticated /api/v1/health route matching client diagnostics.

## Executive Summary

Closed GAP-01, CR-01, and CR-02 by providing a dedicated executable daemon entrypoint `src/main.ts` with fail-closed configuration parsing and scripts in `knowledge-server/package.json`, and replacing the unversioned public `/health` endpoint with an authenticated `/api/v1/health` endpoint matching PlannerMate's client diagnostic contract.

## Key Changes

1. **Executable Entrypoint (`knowledge-server/src/main.ts`)**
   - Implemented `readKnowledgeServerOptions(env)`: strictly checks required non-empty `KNOWLEDGE_SERVER_TOKEN`, exact `KNOWLEDGE_ALLOWED_ORIGINS` (rejecting wildcards, credentials, paths, queries, fragments), valid integer `PORT` (1-65535), and enforces HTTPS termination for non-loopback host bindings.
   - Implemented `startKnowledgeServer(env)`: creates Fastify instance via `buildKnowledgeServer` and listens on host/port.
   - Added direct-run bootstrap with safe logging that never reflects secrets or tokens.

2. **Package Scripts (`knowledge-server/package.json`)**
   - Updated `dev` to `tsx watch src/main.ts`.
   - Added `start` as `tsx src/main.ts`.

3. **Unified Health Contract (`knowledge-server/src/server.ts`)**
   - Replaced unversioned `/health` route with `/api/v1/health`.
   - Route sits behind `/api/v1/` `onRequest` hook, enforcing exact-origin CORS and constant-time Bearer token authentication.
   - Responds with content-free `{ status: 'ok' }` without leaking capabilities, tokens, or system info.

4. **Integration Tests**
   - `knowledge-server/tests/main.test.ts`: verified configuration parser validation and live child process startup with token canary leak checks.
   - `knowledge-server/tests/server.test.ts`: verified 200 on `/api/v1/health` with exact origin and valid token, 401 on missing/invalid token, 403 on invalid origin, and 404 on obsolete unversioned `/health`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking Issue] Vitest root path resolution in child process test**
- **Found during:** Task 1 test run
- **Issue:** `process.cwd()` in root vs subproject workspace caused child process `tsx` path resolution to misalign.
- **Fix:** Used `resolve(KNOWLEDGE_SERVER_DIR, 'node_modules/tsx/dist/cli.mjs')` and configured child process `cwd` to `KNOWLEDGE_SERVER_DIR`.
- **Files modified:** `knowledge-server/tests/main.test.ts`
- **Commit:** `07cafd5`

## Self-Check: PASSED

- FOUND: `knowledge-server/src/main.ts`
- FOUND: `knowledge-server/tests/main.test.ts`
- FOUND: `knowledge-server/src/server.ts`
- FOUND: commit `07cafd5`
- FOUND: commit `9ea1294`
