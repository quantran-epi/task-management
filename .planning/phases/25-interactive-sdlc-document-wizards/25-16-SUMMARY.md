---
phase: 25-interactive-sdlc-document-wizards
plan: 16
subsystem: wizard-export
 tags: [docx, blob, indexeddb, idempotency, offline]
requires:
  - phase: 25-interactive-sdlc-document-wizards
    provides: Atomic approved artifact persistence and deterministic four-kind builders
provides:
  - Explicit approved preview export orchestration with stale guards
  - Truthful Blob download result contract and retry behavior
  - Drawer approval, pending, Note link, and download retry wiring
affects: [wizard-ui, artifact-persistence, export]
tech-stack:
  added: []
  patterns:
    - Build local Blob before canonical Note persistence and browser download
    - Discriminate save-picker persistence from anchor download initiation
    - Retain in-memory approved Blob for download retry without duplicate Note
key-files:
  created:
    - .planning/phases/25-interactive-sdlc-document-wizards/25-16-SUMMARY.md
  modified:
    - src/services/wizard/wizardCoordinator.ts
    - src/utils/fileExport.ts
    - src/components/ai/AIChatDrawer.tsx
    - src/components/ai/ChatMessageBubble.tsx
    - src/components/ai/wizard/DocumentPreviewCard.tsx
    - tests/export/wizardDocx.test.ts
    - tests/ai/AIChatDrawerWizard.test.tsx
key-decisions:
  - "Canonical Note save remains separate from Blob download result; anchor fallback claims initiation only."
  - "Repeated approval reuses retained Blob and Note, while download retry does not rebuild or duplicate persistence."
requirements-completed: [WIZ-DOCX-01, WIZ-FLOW-01, WIZ-LOOP-01]
duration: 20m
completed: 2026-10-29
---

# Phase 25 Plan 16: Approved Wizard Export Summary

**Approved wizard previews now build deterministic local DOCX Blobs, save one canonical Project-linked Note, and report browser download outcomes truthfully with retry-safe drawer actions.**

## Performance

- **Duration:** 20m
- **Started:** 2026-10-29T13:58:00Z
- **Completed:** 2026-10-29T14:19:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Added `approveAndExport(messageId, payload)` with currentness checks before and after deterministic builder execution.
- Added `DownloadBlobResult` with save-picker, anchor-initiation, cancellation, and failure outcomes.
- Saved canonical Markdown plus structured approved payload through existing idempotent artifact persistence before download.
- Wired drawer preview approval, pending guard, split outcome state, Note route, and download retry.
- Preserved existing `tests/ai/changePack.test.ts` edits and did not touch STATE.md or ROADMAP.md.

## Task Commits

1. **Task 1 RED: Add failing approved export contracts** - `a102ec7` (test)
2. **Task 1 GREEN: Orchestrate approved export outcomes** - `68e3cb9` (feat)
3. **Task 2: Wire wizard preview export actions** - `34d4b80` (feat)

## Files Created/Modified

- `src/services/wizard/wizardCoordinator.ts` - Approval, stale, build/save/download, retry, and idempotency orchestration.
- `src/utils/fileExport.ts` - Truthful `downloadBlob` discriminated result with File System Access API and anchor fallback.
- `src/components/ai/AIChatDrawer.tsx` - Export state, approval pending guard, retry, and Note route callbacks.
- `src/components/ai/ChatMessageBubble.tsx` - Preview callback state projection.
- `src/components/ai/wizard/DocumentPreviewCard.tsx` - Pending approval and failed-download retry UI.
- `tests/export/wizardDocx.test.ts` - Four-kind export contract and failure matrix tests.
- `tests/ai/AIChatDrawerWizard.test.tsx` - Coordinator export mock wiring.

## Decisions Made

- Build success, Note save, and download initiation/save-picker success remain independent flags.
- Browser anchor fallback reports `Đã bắt đầu tải`, never disk persistence.
- Canonical Note is saved before download; Blob is not persisted in IndexedDB.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected download argument order and return semantics**
- **Found during:** Task 1 verification
- **Issue:** Existing callers used filename-first void helper, while approved export needed Blob-first truthful outcomes.
- **Fix:** Added overload-compatible Blob-first helper with discriminated async result and retained legacy call compatibility.
- **Files modified:** `src/utils/fileExport.ts`, `src/components/ai/ChatMessageBubble.tsx` callers remain compatible.
- **Verification:** Targeted export and chat tests pass.
- **Committed in:** `68e3cb9`

**2. [Rule 3 - Blocking] Used direct TypeScript compiler because no typecheck npm script exists**
- **Found during:** Overall verification
- **Issue:** Repository has no `typecheck` script.
- **Fix:** Ran `npx tsc --noEmit --pretty false`; changed-file diagnostics are clean.
- **Files modified:** None.
- **Verification:** Only pre-existing missing `knowledge-server` parser modules remain.
- **Committed in:** Not applicable.

## Issues Encountered

- Full TypeScript check remains blocked by pre-existing missing modules: `unified`, `remark-parse`, `remark-gfm`, `mdast`, and `mdast-util-to-string` in `knowledge-server/src/parser/*`. No dependency install attempted.
- Existing jsdom warning `Not implemented: Window's getComputedStyle() method: with pseudo-elements` appears during ChatMessageBubble tests; all targeted tests pass.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None in the Plan 25-16 export path.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: local-approved-export | `src/services/wizard/wizardCoordinator.ts` | Approval boundary now builds and persists local artifacts; stale revision and replay guards prevent cross-project or duplicate effects. |
| threat_flag: download-result | `src/utils/fileExport.ts` | Browser filesystem boundary reports picker confirmation, anchor initiation, cancellation, and failure separately. |

## Next Phase Readiness

- All four approved wizard output kinds can use the deterministic builder and canonical artifact persistence seam.
- STATE.md and ROADMAP.md intentionally unchanged.

## Self-Check: PASSED

- Required files exist.
- Commits `a102ec7`, `68e3cb9`, and `34d4b80` exist.
- Targeted tests pass: export contracts 6/6; drawer and bubble tests 29/29.
- Changed-file TypeScript diagnostics are clean.
- STATE.md and ROADMAP.md unchanged.
