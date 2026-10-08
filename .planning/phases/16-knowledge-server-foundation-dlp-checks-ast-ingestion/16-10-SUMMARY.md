---
phase: 16-knowledge-server-foundation-dlp-checks-ast-ingestion
plan: "10"
subsystem: knowledge-server-settings
tags: [react, antd, indexeddb, accessibility, security, tdd]
requires:
  - phase: 16-09
    provides: Safe persisted knowledge base URL, memory-only token provider, and fixed daemon routes
provides:
  - Optional Knowledge Server card in existing AI and Ghost Dev settings tab
  - HTTPS-or-loopback URL configuration with normalized persisted base URL
  - Memory-only session token entry and bounded content-free connection diagnostics
affects: [16-11, 16-12, 16-13, knowledge-server-publishing]
tech-stack:
  added: []
  patterns: [provider-scoped ephemeral credentials, fixed diagnostic copy, disabled-by-default optional integration]
key-files:
  created:
    - src/components/settings/KnowledgeServerConfigCard.tsx
    - tests/knowledge/KnowledgeServerConfigCard.test.tsx
  modified:
    - src/views/SettingsView.tsx
key-decisions:
  - "Mount KnowledgeConfigProvider around only the existing AI-tab card so optional daemon state cannot gate local application paths."
  - "Connection diagnostics call only fixed GET /api/v1/health and map status or network failures to bounded Vietnamese copy without parsing or rendering response bodies."
patterns-established:
  - "Optional remote integrations default off and expose no network action until explicitly enabled."
  - "Sensitive tokens remain controlled provider state and never enter settings writes, localStorage, sessionStorage, logs, or diagnostics."
requirements-completed: [INGEST-01, INGEST-05]
duration: 19min
completed: 2026-10-08
---

# Phase 16 Plan 10: Safe Knowledge Server Settings Summary

**Optional Ant Design Knowledge Server configuration now persists only a validated base URL while keeping bearer credentials memory-only and diagnostics content-free.**

## Performance

- **Duration:** 19 min
- **Started:** 2026-10-08T08:05:17Z
- **Completed:** 2026-10-08T08:23:52Z
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments

- Added disabled-by-default Knowledge Server card under existing `Trợ lý AI & Ghost Dev` tab without a new route or tab.
- Enforced remote HTTPS, loopback-only HTTP warning, root URL normalization, and silent fixed `/api/v1/health` derivation.
- Kept token in provider memory only, with password input and explicit reload-loss helper copy.
- Added fixed accessible diagnostics for success, authentication, authorization, CORS, invalid URL, and unreachable server outcomes without document content or raw response display.
- Proved disabled state performs no request and local Docs, autosave, and BM25 remain outside this settings-only integration.

## Task Commits

1. **Task 1 RED: safe daemon configuration behavior** - `ecae741` (test)
2. **Task 1 GREEN: optional configuration card and diagnostics** - `a74916f` (feat)

## Files Created/Modified

- `src/components/settings/KnowledgeServerConfigCard.tsx` - Optional daemon form, memory-only token field, URL policy, and bounded diagnostics.
- `src/views/SettingsView.tsx` - Card integration under existing AI settings tab with scoped provider.
- `tests/knowledge/KnowledgeServerConfigCard.test.tsx` - UI location, persistence boundary, URL policy, no-egress disabled state, and diagnostic mapping coverage.

## Decisions Made

- Reused native `URL`, `fetch`, existing React context, Ant Design, IndexedDB settings, and `AriaLiveRegion`; no dependency added.
- Scoped provider to the card because no other current UI consumes knowledge configuration; this keeps optional daemon concerns out of app boot and local document paths.
- Treated diagnostic responses as untrusted: status drives fixed copy, and response payloads are never read or rendered.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Hydrated committed knowledge-server dependencies**
- **Found during:** Task 1 root build
- **Issue:** Root TypeScript compilation includes shared daemon parser source, but worktree lacked `knowledge-server/node_modules`.
- **Fix:** Ran `npm --prefix knowledge-server ci --legacy-peer-deps` against committed lockfile; no tracked dependency files changed.
- **Files modified:** None.
- **Verification:** Targeted component test and root production build pass.
- **Committed in:** Not applicable; dependency hydration created no tracked changes.

---

**Total deviations:** 1 auto-fixed blocking issue. **Impact:** Environment hydration only; declared implementation scope and package manifests remained unchanged.

## Issues Encountered

- Prerequisite merge conflicted only in `.planning/STATE.md`; master's version was accepted as authorized. Merge commit excluded from plan commits.
- Local Node v20.19.5 produced an engine warning while hydrating daemon dependencies; requested tests and build still passed.

## Verification

- `npm test -- tests/knowledge/KnowledgeServerConfigCard.test.tsx` - 1 file, 9/9 tests passed.
- `npm run build` - TypeScript and Vite production build passed; existing chunk-size and ineffective dynamic-import warnings remain.
- Settings integration scan - one card under existing `ai` tab; no new tab or route.
- Credential scan - token appears only in controlled provider state and request header; no persistence call or raw diagnostic rendering.
- Stub scan - URL placeholder is intentional UI-SPEC example copy; no goal-blocking TODO, FIXME, mock data, or unwired source.
- Threat scan - planned URL/token trust boundaries covered; no additional endpoint, auth path, file access, or schema surface introduced.
- TDD order - RED `ecae741` precedes GREEN `a74916f`.

## Known Stubs

None. `https://knowledge.internal.example` is required input placeholder copy, not runtime data.

## User Setup Required

None - Knowledge Server remains optional and disabled by default.

## Self-Check: PASSED

- All three declared code and test files exist.
- Commits `ecae741` and `a74916f` exist in chronological RED/GREEN order.
- Targeted component test and root production build pass.
- `.planning/STATE.md`, `.planning/ROADMAP.md`, and `.planning/REQUIREMENTS.md` remained unchanged after prerequisite merge.

## Next Phase Readiness

- Document-set and publishing UI can consume validated persisted base URL and memory-only token from existing knowledge configuration service.
- No blocker for Plan 16-11.

---
*Phase: 16-knowledge-server-foundation-dlp-checks-ast-ingestion*
*Completed: 2026-10-08*
