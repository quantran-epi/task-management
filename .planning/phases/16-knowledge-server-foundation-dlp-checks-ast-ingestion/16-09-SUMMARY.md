---
phase: 16-knowledge-server-foundation-dlp-checks-ast-ingestion
plan: "09"
subsystem: knowledge-publishing-client
tags: [react-context, zod, dlp, async-polling, indexeddb, tdd]
requires:
  - phase: 16-02
    provides: Strict remote cache reconciliation and Publishing uncertainty state
  - phase: 16-03
    provides: Deterministic outbound text scanner and content-free DLP audit
  - phase: 16-06
    provides: Exact frozen document and chunk preview
  - phase: 16-08
    provides: Fixed authenticated async daemon API
provides:
  - Safe persisted knowledge base URL with memory-only bearer token
  - Strict fixed-route knowledge client with validated reconciliation and polling uncertainty
  - Exact-preview-bound removal, DLP, fresh confirmation, and one-shot publish gate
affects: [16-10, 16-11, 16-12, 16-13, knowledge-server-publishing]
tech-stack:
  added: []
  patterns: [memory-only credentials, strict remote DTO validation, frozen-snapshot nonce binding, single guarded content POST]
key-files:
  created:
    - src/services/knowledge/knowledgeConfig.tsx
    - src/services/knowledge/knowledgeClient.ts
    - src/services/knowledge/publishOrchestrator.ts
    - tests/knowledge/knowledgeClient.test.ts
    - tests/knowledge/publishDlpGate.test.ts
  modified:
    - src/services/backup/exportBackup.ts
key-decisions:
  - "Persist only enabled state and normalized base URL; bearer token lives only in provider state and clears on unmount."
  - "Only PublishSession calls createPublishAttempt, after exact preview, removal consent, full DLP scan, and attempt-bound one-shot confirmation."
  - "Abort and network loss stop observation while preserving Publishing plus uncertainty; only validated terminal daemon state reconciles failure or success."
patterns-established:
  - "Remote content routes derive from one validated base URL under fixed /api/v1 paths."
  - "Fresh confirmation binds attempt key, exact payload, document membership, content hashes, and chunk manifest."
requirements-completed: [INGEST-01, INGEST-02, INGEST-04, INGEST-05]
duration: 12min
completed: 2026-10-08
---

# Phase 16 Plan 09: Safe Client and Exact-Preview Publish Gate Summary

**Memory-only bearer client and frozen-preview DLP orchestrator now enforce one guarded content POST while preserving server-authoritative polling uncertainty.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-10-08T07:45:27Z
- **Completed:** 2026-10-08T07:57:14Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Added HTTPS-or-loopback base URL validation, fixed `/api/v1` routes, memory-only bearer state, and defensive backup exclusion.
- Added strict Zod response parsing before cache reconciliation, capped polling backoff, abort-only observation, and `Publishing` uncertainty handling.
- Added `PublishSession` ordering exact preview, removal consent, full frozen-text DLP scan, fresh bound confirmation, content-free audit, and one content POST.
- Proved stale, cancelled, changed, unconfirmed, and closed preview paths produce zero content requests.

## Task Commits

1. **Task 1 RED: safe knowledge client behavior** - `221b3e9` (test)
2. **Task 1 GREEN: safe configuration, fixed routes, and polling** - `f128af4` (feat)
3. **Task 2 RED: guarded publish session behavior** - `d698678` (test)
4. **Task 2 GREEN: preview-bound DLP publish gate** - `fa76910` (feat)

## Files Created/Modified

- `src/services/knowledge/knowledgeConfig.tsx` - Safe persisted configuration and memory-only token provider.
- `src/services/knowledge/knowledgeClient.ts` - Fixed-route transport, strict response parsing, reconciliation, and polling.
- `src/services/knowledge/publishOrchestrator.ts` - Frozen preview, removal, scan, confirmation, audit, submit, and poll state machine.
- `src/services/backup/exportBackup.ts` - Explicit knowledge token backup denylist.
- `tests/knowledge/knowledgeClient.test.ts` - URL, token, malformed response, and uncertainty coverage.
- `tests/knowledge/publishDlpGate.test.ts` - Zero-egress and one-shot frozen confirmation coverage.

## Decisions Made

- Reused native URL, fetch, AbortController, Web Crypto, React context, existing Zod, and existing IndexedDB repositories; no dependency added.
- Treated same-set HTTP conflict as current `Publishing` state without fabricating a failed local attempt.
- Closing publish UI invalidates local confirmation and aborts polling signal only; accepted server work remains untouched.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Hydrated committed knowledge-server dependencies**
- **Found during:** Task 1 root build
- **Issue:** Root TypeScript compilation imports shared daemon parser source, but worktree lacked `knowledge-server/node_modules`.
- **Fix:** Ran `npm --prefix knowledge-server ci --legacy-peer-deps` against committed lockfile; repository files remained unchanged.
- **Files modified:** None.
- **Verification:** Targeted tests and root `npm run build` pass.
- **Committed in:** Not applicable; dependency hydration created no tracked changes.

---

**Total deviations:** 1 auto-fixed blocking issue. **Impact on plan:** Dependency hydration only; no scope or package-lock change.

## Issues Encountered

- Initial prerequisite merge conflicted only in `.planning/STATE.md`; master's version resolved conflict as authorized. Merge commit `e4bee71` excluded from plan commits.
- Local Node v20.19.5 triggered Vitest engine warning during dependency hydration; requested tests and root build passed.

## Verification

- `npm test -- tests/knowledge/knowledgeClient.test.ts tests/knowledge/publishDlpGate.test.ts` - 2 files, 11/11 tests passed.
- `npm run build` - TypeScript and Vite production build passed; existing chunk-size and ineffective dynamic-import warnings remain.
- Production caller scan - `createPublishAttempt` has one caller in `publishOrchestrator.ts`.
- Stub scan - no goal-blocking TODO, FIXME, placeholder, or unwired UI data source.
- TDD order - RED `221b3e9`, GREEN `f128af4`, RED `d698678`, GREEN `fa76910`.

## Known Stubs

None. Nullable fields and empty default options are lifecycle state, not UI or data-source stubs.

## User Setup Required

None - no external service configuration required.

## Self-Check: PASSED

- All six declared code and test files exist.
- Commits `221b3e9`, `f128af4`, `d698678`, and `fa76910` exist in chronological TDD order.
- Targeted tests, root build, caller scan, backup denylist, and uncertainty assertions pass.
- `.planning/STATE.md`, `.planning/ROADMAP.md`, and `.planning/REQUIREMENTS.md` remained unchanged after prerequisite merge.

## Next Phase Readiness

- UI plans can consume `KnowledgeConfigProvider`, strict client diagnostics, and `PublishSession` without creating alternate content egress paths.
- No blocker for remaining Phase 16 plans.

---
*Phase: 16-knowledge-server-foundation-dlp-checks-ast-ingestion*
*Completed: 2026-10-08*
