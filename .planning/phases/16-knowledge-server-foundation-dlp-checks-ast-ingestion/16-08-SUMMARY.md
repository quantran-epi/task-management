---
phase: 16-knowledge-server-foundation-dlp-checks-ast-ingestion
plan: "08"
subsystem: knowledge-server-api
tags: [fastify, cors, bearer-auth, zod, async-attempts, redaction]
requires:
  - phase: 16-07
    provides: Immutable idempotent attempt service and atomic active snapshot store
provides:
  - Authenticated exact-origin Fastify daemon boundary under fixed `/api/v1` routes
  - Idempotent async publish-attempt POST/GET resources with structured same-set conflict
  - Strict content-free active snapshot manifest with occurrence and source-range metadata
affects: [16-09, 16-10, 16-11, 17, 18, 19]
tech-stack:
  added: []
  patterns: [fail-closed startup config, constant-time bearer comparison, strict request-response DTOs, bounded stable errors]
key-files:
  created:
    - knowledge-server/src/server.ts
    - knowledge-server/src/routes/attempts.ts
    - knowledge-server/src/routes/snapshots.ts
    - knowledge-server/tests/server.test.ts
  modified: []
key-decisions:
  - "Reject every `/api/v1` request lacking exact configured Origin or valid Bearer token while keeping `/health` content-free."
  - "Expose active snapshots as hashes, occurrence IDs, heading paths, and exact ranges only; omit raw Markdown and representation internals."
  - "Require explicit HTTPS-termination confirmation for non-loopback daemon binding."
patterns-established:
  - "Daemon boundary validates params, headers, body, and emitted resources with strict Zod schemas."
  - "HTTP errors use bounded stable envelopes; logger removes authorization, request bodies, payloads, and stacks."
requirements-completed: [INGEST-01, INGEST-04, INGEST-05]
duration: 9min
completed: 2026-10-08
---

# Phase 16 Plan 08: Secure Async Publish API Summary

**Fastify daemon now exposes exact-origin, bearer-authenticated async publish attempts and content-free active manifests through fixed `/api/v1` routes with bounded validation and disclosure controls.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-10-08T07:31:54Z
- **Completed:** 2026-10-08T07:41:00Z
- **Tasks:** 1
- **Files modified:** 4

## Accomplishments

- Added fail-closed daemon factory with loopback default, remote HTTPS guard, exact CORS allow-list, constant-time bearer comparison, JSON body cap, and content-free health response.
- Added strict async attempt POST/GET routes preserving service idempotency and returning structured `SET_PUBLISH_IN_PROGRESS` conflicts.
- Added strict active snapshot manifest carrying document/chunk hashes, occurrence identity, heading path, and exact line/offset ranges without Markdown bodies.
- Added injection coverage for origin spoofing, auth rejection, malformed and oversized payloads, replay/conflict behavior, safe manifests, route scope, and seeded-secret redaction.

## Task Commits

TDD gates and security correction committed atomically:

1. **Task 1 RED: secure daemon boundary behavior** — `e2c5725` (test)
2. **Task 1 GREEN: authenticated async publish API** — `03c2e1e` (feat)
3. **Task 1 security correction: strict emitted DTO validation** — `d84d0c9` (fix)

## Files Created/Modified

- `knowledge-server/src/server.ts` — Fastify factory, exact-origin CORS/auth hooks, loopback/HTTPS startup guard, body bound, safe errors, and logger redaction.
- `knowledge-server/src/routes/attempts.ts` — Strict attempt POST/GET DTOs, idempotent service delegation, and structured conflict handling.
- `knowledge-server/src/routes/snapshots.ts` — Strict content-free active snapshot projection.
- `knowledge-server/tests/server.test.ts` — CORS, auth, request-bound, idempotency, conflict, manifest, route-scope, and disclosure tests.

## Decisions Made

- Kept health outside authenticated content routes and limited its response to `{ "status": "ok" }`.
- Applied exact string origin checks in both CORS policy and route hook so absent and lookalike origins fail closed before service processing.
- Required caller to attest HTTPS termination before binding beyond loopback; TLS certificate management remains deployment infrastructure, not daemon route scope.
- Omitted raw chunks, titles, representation IDs, accepted input, token values, and stack details from public attempt/snapshot resources.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Restored locked knowledge-server dependencies**
- **Found during:** Task 1 RED verification
- **Issue:** Worktree lacked `knowledge-server/node_modules`, so existing parser imports failed before expected missing server implementation.
- **Fix:** Ran `npm --prefix knowledge-server ci --legacy-peer-deps` against committed audited lockfile; dependency files stayed unchanged.
- **Files modified:** None.
- **Verification:** RED rerun failed on missing `src/server.js` as intended; final tests and build pass.
- **Committed in:** Not applicable; dependency hydration produced no repository changes.

**2. [Rule 2 - Missing Critical] Added strict response validation**
- **Found during:** Task 1 post-GREEN threat-model review
- **Issue:** Request DTOs were strict, but emitted attempt and snapshot objects were manually shaped without runtime schema enforcement required by T-16-29.
- **Fix:** Added bounded strict Zod response schemas and parsed both resources before emission.
- **Files modified:** `knowledge-server/src/routes/attempts.ts`, `knowledge-server/src/routes/snapshots.ts`
- **Verification:** `npm run test:knowledge -- server.test.ts` and `npm run knowledge:build` pass.
- **Committed in:** `d84d0c9`

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing critical). **Impact on plan:** Both changes enforce planned execution and threat mitigations; no graph, retrieval, answer, cancellation, or sidecar scope added.

## Issues Encountered

- Initial prerequisite `git merge master` conflicted only in `.planning/STATE.md`; resolved with master's version exactly as authorized, then completed merge commit `3779e64`. Merge excluded from plan commit list.
- Context7 CLI was unavailable, so version-specific implementation followed installed Fastify 5 types, audited phase research, and runtime injection checks.
- Local Node runtime was v20.19.5 while Vitest metadata recommends Node 22.12+/24; targeted tests and TypeScript build still passed.

## Verification

- `npm run test:knowledge -- server.test.ts` — 6/6 passed.
- `npm run knowledge:build` — passed with strict TypeScript compilation.
- CORS preflight injection — 204 with exact `Access-Control-Allow-Origin`.
- Scope scan of `server.ts` and route files — no cancel, graph, retrieval, or answer route/code.
- Stub scan — no TODO, FIXME, placeholder, coming-soon, or empty UI/data-source stubs.
- TDD sequence verified in git log: RED `e2c5725`, GREEN `03c2e1e`, security correction `d84d0c9`.

## Known Stubs

None. Empty internal maps/collections belong to existing services and are working state containers, not placeholder data sources.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: network-endpoint | `knowledge-server/src/server.ts` | New optional daemon HTTP boundary; covered by plan threat model with exact origin, bearer auth, body bounds, redaction, and remote HTTPS guard. |

## User Setup Required

None - no external service configuration required by this plan.

## Self-Check: PASSED

- All four plan-declared code/test files exist.
- Commits `e2c5725`, `03c2e1e`, and `d84d0c9` exist in chronological order.
- Targeted tests, TypeScript build, CORS preflight, route-scope scan, and disclosure assertions pass.
- `.planning/STATE.md`, `.planning/ROADMAP.md`, and `.planning/REQUIREMENTS.md` remained unchanged after prerequisite merge.

## Next Phase Readiness

- Client transport can call fixed daemon routes with exact Origin, session Bearer token, and attempt key while polling safe attempt resources.
- Active content-free manifests support exact local preview/reconciliation without exposing canonical Markdown.
- No blocker for remaining Phase 16 plans.

---
*Phase: 16-knowledge-server-foundation-dlp-checks-ast-ingestion*
*Completed: 2026-10-08*
