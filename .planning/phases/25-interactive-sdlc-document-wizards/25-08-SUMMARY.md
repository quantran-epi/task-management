---
phase: 25-interactive-sdlc-document-wizards
plan: 08
subsystem: document-export
tags: [docx, ooxml, pl02, zod, jszip]

requires:
  - phase: 25-interactive-sdlc-document-wizards
    provides: "Hash-pinned PL02 structure fixture and strict wizard persistence contracts from Plans 25-02 and 25-03"
provides:
  - "Dedicated source-derived PL02 DOCX builder with fixed bank sections and table shapes"
  - "Shared DOCX table and row primitives for later PL03B and PL07 builders"
  - "Strict approved-current PL02 dispatcher returning a local Word Blob"
  - "Targeted semantic OOXML, safety, and determinism tests"
affects: [25-09, 25-10, wizard-docx-builders, wizard-export-ui]

tech-stack:
  added: []
  patterns:
    - "Dedicated document builders own headings, numbering, tables, and furniture; payload supplies text only"
    - "Strict Zod dispatcher validates approval and revision before Packer"
    - "Structured flow steps become static Word execution-matrix rows"

key-files:
  created:
    - "src/services/export/docxShared.ts"
    - "src/services/export/pl02Docx.ts"
    - "src/services/export/wizardDocx.ts"
  modified:
    - "tests/export/wizardDocx.test.ts"

key-decisions:
  - "PL02 follows observed source: no revision table and no signature block are invented."
  - "Missing required content renders as `(chưa cung cấp)`; optional template-image/source blocks are omitted."
  - "Dispatcher accepts only exact approved PL02 payloads whose approvedRevision equals draftRevision."
  - "OOXML repeat checks normalize generated TOC/bookmark/numbering identifiers only."

patterns-established:
  - "Shared DOCX primitives expose fixed row shapes, not a generic template renderer."
  - "Wizard export has no dynamic sandbox, generated script, persistence, tool, or network path."

requirements-completed: [WIZ-DOCX-01]

metrics:
  duration: 17min
  completed: 2026-10-28
  tasks: 2
  files: 4
---

# Phase 25 Plan 08: Shared DOCX Primitives and PL02 Builder Summary

**Source-derived PL02 Word export now preserves fixed bank sections, table headers, Roman/decimal/letter numbering, measured page furniture, Vietnamese text, and approved revision identity entirely client-side.**

## Performance

- **Duration:** 17 min
- **Started:** 2026-10-28T15:49:57Z
- **Completed:** 2026-10-28T16:06:51Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added reusable Times New Roman DOCX cells, fixed tables, and row helpers for risk, glossary, file layout, input rules, notifications, API, DB, checklist, execution matrix, staffing, and sign-off shapes.
- Built PL02 with source-derived cover, TOC, I–III order, fixed table headers, numbering, margins, bank header/footer, and metadata flow.
- Converted validated structured flow steps into a static Word execution matrix without parsing Mermaid or executing generated JavaScript.
- Added exact approved/current PL02 validation before `Packer.toBlob`, returning only a Word MIME `Blob`.
- Added targeted OOXML assertions for semantic section order, tables, fonts, numbering, margins, Unicode, missing values, source safety, network isolation, and repeat-build equality.

## Verification

```text
npm test -- tests/export/wizardDocx.test.ts -t "PL02|dispatcher"
1 test file passed, 5 tests passed, 5 skipped
```

Scoped TypeScript check found no errors in `src/services/export/` or `tests/export/`. Full repository typecheck remains blocked by pre-existing Plan 25-05 `changePack.ts` and `changePack.test.ts` errors outside this plan.

## Task Commits

1. **Task 1 RED: Add failing PL02 DOCX contracts** — `126c3aa` (`test`)
2. **Task 1 GREEN: Build source-derived PL02 document** — `e889552` (`feat`)
3. **Task 2 RED: Add failing PL02 dispatcher contracts** — `9059b5a` (`test`)
4. **Task 2 GREEN: Add strict PL02 DOCX dispatcher** — `1d9a134` (`feat`)

## Files Created/Modified

- `src/services/export/docxShared.ts` — fixed Times New Roman cells, tables, and reusable row helpers.
- `src/services/export/pl02Docx.ts` — dedicated PL02 `Document` builder using source-observed layout and furniture.
- `src/services/export/wizardDocx.ts` — strict PL02 approval/revision validator and Blob dispatcher.
- `tests/export/wizardDocx.test.ts` — semantic OOXML, sparse-data, safety, dispatcher, isolation, and determinism checks.

## Decisions Made

- Honored source OOXML over generic planning prose: PL02 has no revision table and no signature block.
- Kept builder dedicated. No generic Markdown renderer or template engine introduced.
- Used existing `docx`, JSZip, Zod, and native browser `Blob`; no dependency added.
- Kept optional image/source blocks absent when omitted and made required blanks explicit.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `docx` assigns process-global TOC bookmark and numbering IDs. Determinism test normalizes only those generated identifiers while comparing semantic document/header/footer text and stable style/settings structure.
- Full `tsc --noEmit` reports unrelated existing errors in `src/services/wizard/changePack.ts` and `tests/ai/changePack.test.ts`. Scoped DOCX files are clean; unrelated files were not modified.
- Context7 CLI was unavailable. Existing installed `docx@9.9.0` declarations and repository runtime tests supplied API verification; no package install performed.

## Known Stubs

None. `(chưa cung cấp)` is intentional bank-document missing-data output, not a product stub.

## Threat Flags

None. Builder adds only local in-memory OOXML generation. No endpoint, auth path, file read, schema migration, network call, script execution, or persistence boundary added.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 25-09 can extend `wizardDocx.ts` with an explicit PL03B branch and reuse fixed DB/API/execution helpers.
- Plan 25-10 can reuse checklist rows while keeping PL07 baseline text immutable.
- Manual Word/LibreOffice visual comparison remains deferred to Phase 25 final fidelity checkpoint as planned.
- `STATE.md` and `ROADMAP.md` were not modified per orchestrator instruction.

## Self-Check: PASSED

- Builder, shared primitives, dispatcher, and targeted test files exist.
- Task commits `126c3aa`, `e889552`, `9059b5a`, and `1d9a134` exist in git history.
- Targeted PL02/dispatcher tests pass.
- No generated or unrelated untracked files remain in this worktree.
- `STATE.md` and `ROADMAP.md` remain unchanged by Plan 25-08.

---
*Phase: 25-interactive-sdlc-document-wizards*
*Plan: 08*
*Completed: 2026-10-28*
