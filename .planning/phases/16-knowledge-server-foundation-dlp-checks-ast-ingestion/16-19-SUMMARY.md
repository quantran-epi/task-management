---
phase: 16-knowledge-server-foundation-dlp-checks-ast-ingestion
plan: 19
subsystem: knowledge
tags: [knowledge, security, dlp, manifest, error-handling, gap-03, cr-05]
requires: [16-17]
provides: [fail-closed-manifest-verification, authoritative-remote-removals]
affects: [knowledge-client, notes-view, publish-orchestrator]
tech-stack:
  added: []
  patterns: [fail-closed-error-handling, bounded-error-envelope-parsing, consent-gated-removal]
key-files:
  created: []
  modified:
    - src/services/knowledge/knowledgeClient.ts
    - tests/knowledge/knowledgeClient.test.ts
    - src/views/NotesView.tsx
    - tests/knowledge/NotesWorkspacePublishingIntegration.test.tsx
decisions:
  - "Extract bounded serverCode SNAPSHOT_NOT_FOUND from validated ErrorEnvelopeSchema on HTTP 404 responses without leaking raw payload or headers."
  - "Fail closed on all manifest uncertainties (network errors, 401, 403, 5xx, invalid JSON) in NotesView without mounting publish preview or issuing POST requests."
  - "Require explicit removal confirmation checkbox when active manifest contains remote documents absent from local set."
metrics:
  duration: 12m
  completed_date: "2026-10-09"
---

# Phase 16 Plan 19: Close GAP-03 and CR-05 Manifest Uncertainty Gate Summary

Only validated HTTP 404 with `SNAPSHOT_NOT_FOUND` error code allows treating active remote snapshot as absent; all other errors fail closed with localized diagnostics and zero POST egress.

## Completed Tasks

| Task | Name | Commit | Key Files |
| ---- | ---- | ------ | --------- |
| 1 | Bounded daemon error code extraction in KnowledgeClientError | 8f951db | `src/services/knowledge/knowledgeClient.ts`, `tests/knowledge/knowledgeClient.test.ts` |
| 2 | Block publish preview unless manifest result is authoritative | e3d07c8 | `src/views/NotesView.tsx`, `tests/knowledge/NotesWorkspacePublishingIntegration.test.tsx` |

## Key Changes

1. **Structured Daemon Error Code Extraction (`src/services/knowledge/knowledgeClient.ts`)**:
   - Added optional `serverCode?: string` to `KnowledgeClientError`.
   - In `request()`, parsed error response body against strict `ErrorEnvelopeSchema`.
   - Exposed `serverCode` only when envelope parsing succeeded, preventing arbitrary HTML/JSON errors from masquerading as authoritative daemon codes.
   - Retained bearer token redaction and bounded error messages without logging raw payloads or headers.

2. **Fail-Closed Manifest Uncertainty Gate (`src/views/NotesView.tsx`)**:
   - Replaced permissive catch-all `activeManifest = null` with explicit check for `err instanceof KnowledgeClientError && err.status === 404 && err.serverCode === 'SNAPSHOT_NOT_FOUND'`.
   - Aborts preview flow immediately on network errors, 401/403 auth rejections, invalid responses, or 5xx daemon errors.
   - Displays targeted Vietnamese diagnostic messages while keeping local Docs editing, searching, and IndexedDB operations completely intact.

3. **Authoritative Remote Removal Tracking & Testing (`tests/knowledge/NotesWorkspacePublishingIntegration.test.tsx`)**:
   - Updated first-publish integration test to mock authoritative 404 `SNAPSHOT_NOT_FOUND`.
   - Added integration test proving active manifest items absent from local set show `Gỡ khỏi máy chủ` badge and disable DLP scanning/submitting until explicit removal consent checkbox is confirmed.
   - Added uncertainty integration test proving network, 401, and 500 errors display localized error notices, prevent preview modal mounting, and issue zero POST requests.

## Deviations from Plan

None - plan executed exactly as specified.

## Self-Check: PASSED

- `src/services/knowledge/knowledgeClient.ts` exists and updated
- `src/views/NotesView.tsx` exists and updated
- `tests/knowledge/knowledgeClient.test.ts` exists and updated
- `tests/knowledge/NotesWorkspacePublishingIntegration.test.tsx` exists and updated
- Commits `8f951db` and `e3d07c8` exist in git history
- All 13 targeted tests in `NotesWorkspacePublishingIntegration.test.tsx` and `knowledgeClient.test.ts` pass
