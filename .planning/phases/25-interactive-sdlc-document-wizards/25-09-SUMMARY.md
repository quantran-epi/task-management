---
phase: 25-interactive-sdlc-document-wizards
plan: 09
subsystem: document-export
tags: [docx, ooxml, pl03b, pl07, reconciliation, fixtures]

# Dependency graph
requires:
  - phase: 25-interactive-sdlc-document-wizards
    provides: "Pinned PL03B/PL07 source fixtures, reconciliation contracts, and shared DOCX primitives from Plans 25-02, 25-05, and 25-08"
provides:
  - "Dedicated source-derived PL03B DOCX builder with pinned reconciliation rendering"
  - "Immutable reviewed PL07 I-V baseline and source hash"
  - "Evidence-gated PL07 checklist and Section VI review-code DOCX builder"
  - "Strict PL03B and PL07 dispatcher branches"
affects: [25-10, 25-15, wizard-docx-builders, wizard-export-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dedicated bank-form builders consume structured validated payloads; no generic renderer or generated script"
    - "PL07 baseline is generated directly from reviewed fixture and recursively frozen at runtime"
    - "Positive and not-applicable PL07 marks require evidence IDs; unknown stays visibly unknown"
    - "PL03B reconciliation preserves partial coverage, drift, rollback uncertainty, and regression evidence"

key-files:
  created:
    - "src/services/export/pl03bDocx.ts"
    - "src/services/export/pl07Baseline.ts"
    - "src/services/export/pl07Docx.ts"
  modified:
    - "src/services/export/wizardDocx.ts"
    - "tests/export/wizardDocx.test.ts"

key-decisions:
  - "PL03B follows source fixture exactly: mandatory six-column revision table, TOC, numbered hop paragraphs, technical section order, and no signature block."
  - "PL07 I-V comes only from the reviewed hash-pinned fixture; dynamic payload owns marks, notes, and Section VI findings."
  - "Unsupported PL07 positive or not-applicable statuses fail schema validation instead of becoming approval ticks."
  - "Partial PL03B coverage never renders as clean no-drift, even when drift tuples are empty."

patterns-established:
  - "Dispatcher validates strict approved/current payload before Packer.toBlob."
  - "No export builder imports dynamic sandbox, executes code, performs network calls, or reads mutable template files at runtime."

requirements-completed: [WIZ-DOCX-01, WIZ-FLOW-01]

# Metrics
duration: 9h
completed: 2026-10-29
---

# Phase 25 Plan 09 Summary

**Source-derived PL03B reconciliation export and immutable PL07 security-review export now preserve approved bank structure while keeping drift, evidence, and unknown review states explicit.**

## Performance

- **Duration:** approximately 9h wall time including gateway interruption and resumed execution
- **Started:** 2026-10-28T16:20:58Z
- **Completed:** 2026-10-29T01:19:45Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Built `buildPl03bDocument` with source-observed title furniture, six-column revision table, TOC, decimal nested numbering, numbered flow hops, optional `Source code:` lines, API/DB/integration/notification sections, and no invented signature block.
- Rendered pinned reconciliation payload into approved-design, actual-implementation, drift, DB/rollback, coverage, and regression sections. Partial/deferred/binary states remain visible; clean text requires complete included coverage and zero drift.
- Added frozen `PL07_BASELINE` and `PL07_BASELINE_SOURCE_SHA256` from `tests/fixtures/ai/pl07-baseline.json`; no model-generated baseline text enters Sections I-V.
- Built PL07 metadata, merged `Đáp ứng` checklist header, distinct pass/fail/not-applicable/unknown marks, evidence-gated statuses, immutable I-V rows, dynamic evidence-backed Section VI findings, source furniture, and signature block.
- Extended strict `buildWizardDocx` union with PL03B and PL07 branches. Builders remain local, deterministic, and free of dynamic code execution or network access.

## Verification

```text
npm test -- tests/export/wizardDocx.test.ts
1 test file passed, 12 tests passed

npm exec -- tsc --noEmit --pretty false
Scoped export files and tests: clean
Full tsc: clean

git diff --check
clean
```

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Add failing PL03B DOCX contracts** - `4b39f6f` (`test`)
2. **Task 1 GREEN: Build source-derived PL03B document** - `2d35b39` (`feat`)
3. **Task 2 RED: Add failing PL07 DOCX contracts** - `66fc034` (`test`)
4. **Task 2 GREEN: Build immutable-baseline PL07 document** - `93d46a7` (`feat`)

**Plan metadata:** pending final metadata commit.

## Files Created/Modified

- `src/services/export/pl03bDocx.ts` - dedicated PL03B document tree and reconciliation renderer.
- `src/services/export/pl07Baseline.ts` - recursively frozen fixture-derived PL07 I-V baseline and source hash.
- `src/services/export/pl07Docx.ts` - dedicated PL07 checklist, evidence marks, Section VI findings, and signature furniture.
- `src/services/export/wizardDocx.ts` - strict PL02/PL03B/PL07 validation and dispatch.
- `tests/export/wizardDocx.test.ts` - PL03B and PL07 semantic OOXML, evidence, immutability, dispatcher, and safety contracts.

## Decisions Made

- Source OOXML fixtures override generic template prose for PL03B furniture, margins, headers, numbering, revision table, and signature absence.
- PL07 baseline module is fixture-derived and recursively frozen; caller cannot replace it through payload or builder argument.
- Unknown marks render without positive or negative ticks; positive and not-applicable marks require evidence IDs.
- Reconciliation status and coverage ledger are rendered as data, not summarized away into a positive claim.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected PL03B table construction for current `docx` API**
- **Found during:** Task 1 GREEN verification
- **Issue:** Initial helper passed plain objects to `Table.rows`; `docx` required `TableRow` instances and failed during export.
- **Fix:** Reused shared `TableRow`/`WidthType` construction pattern.
- **Files modified:** `src/services/export/pl03bDocx.ts`
- **Verification:** PL03B targeted tests passed.
- **Committed in:** `2d35b39`

**2. [Rule 1 - Bug] Preserved exact source header text and completed PL07 type narrowing**
- **Found during:** Task 1/Task 2 targeted verification
- **Issue:** PL03B source header fixture has no space between `SHB` and `Mã`; PL07 fixture union item type does not expose `subItems` on every item.
- **Fix:** Matched fixture header byte-for-text and narrowed `subItems` with an own-property guard.
- **Files modified:** `src/services/export/pl03bDocx.ts`, `src/services/export/pl07Docx.ts`
- **Verification:** Targeted DOCX tests and scoped TypeScript check passed.
- **Committed in:** `93d46a7`

**3. [Rule 2 - Missing Critical] Added PL07 evidence gate for positive review states**
- **Found during:** Task 2 implementation
- **Issue:** Positive and not-applicable marks could otherwise create unsupported official-looking claims.
- **Fix:** Strict dispatcher schema rejects `pass`/`not_applicable` without evidence; unknown remains distinct.
- **Files modified:** `src/services/export/wizardDocx.ts`, `src/services/export/pl07Docx.ts`, `tests/export/wizardDocx.test.ts`
- **Verification:** Negative dispatcher tests pass.
- **Committed in:** `93d46a7`

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 missing critical security control)
**Impact on plan:** All fixes were directly required by source fidelity, type correctness, or evidence-safe document correctness. No architectural scope added.

## Issues Encountered

- Gateway returned a temporary 503 during execution; work resumed from current worktree without discarding valid commits.
- `ctx7` CLI unavailable. Existing installed `docx` declarations and targeted runtime tests supplied API verification; no package installation performed.
- No STATE.md or ROADMAP.md changes made, per user instruction.

## Known Stubs

None. `(chưa cung cấp)` is intentional missing-data output inherited from shared bank-document builders, not an unimplemented product path.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: untrusted-reconciliation-render | `src/services/export/pl03bDocx.ts` | Reconciliation and coverage values enter official-looking PL03B output; builder renders validated structured data and preserves partial/unknown caveats. |
| threat_flag: review-status-spoofing | `src/services/export/wizardDocx.ts` | PL07 pass/not-applicable statuses require evidence IDs; strict schemas reject baseline injection and unknown fields. |
| threat_flag: baseline-tampering | `src/services/export/pl07Baseline.ts` | Runtime baseline is tied to reviewed fixture text/hash and recursively frozen; builder rejects baseline replacement. |

## Next Phase Readiness

- Plan 25-10 can reuse `checklistRows` and the immutable-baseline pattern while preserving PL07 source authority.
- Plan 25-15 can consume PL03B/PL07 approved payload branches without introducing dynamic script execution.
- Manual Word/LibreOffice visual comparison remains deferred to the phase fidelity checkpoint; automated OOXML and targeted TypeScript checks pass.

## Self-Check: PASSED

- Created files `src/services/export/pl03bDocx.ts`, `src/services/export/pl07Baseline.ts`, and `src/services/export/pl07Docx.ts` exist.
- Task commits `4b39f6f`, `2d35b39`, `66fc034`, and `93d46a7` exist in git history.
- `npm test -- tests/export/wizardDocx.test.ts` passes with 12 tests.
- Scoped export TypeScript check passes; full `tsc --noEmit` reports no errors.
- `git diff --check` passes.
- `STATE.md` and `ROADMAP.md` remain unchanged.

---
*Phase: 25-interactive-sdlc-document-wizards*
*Plan: 09*
*Completed: 2026-10-29*
