---
phase: 25-interactive-sdlc-document-wizards
plan: 10
subsystem: document-export
tags: [docx, ooxml, cab, dispatcher, deterministic-export]

# Dependency graph
requires:
  - phase: 25-interactive-sdlc-document-wizards
    provides: "Strict CAB proposal source pins, shared DOCX primitives, and PL02/PL03B/PL07 builders from Plans 25-07 through 25-09"
provides:
  - "Minimal caveat-preserving CAB Document builder"
  - "Exact same-project/thread/revision/hash CAB source validation"
  - "Exhaustive PL02|PL03B|PL07|CAB local DOCX dispatcher"
affects: [wizard-export-ui, document-wizard, phase-25]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CAB uses bounded title/heading/paragraph content and one two-cell sign-off table; no bank-template tree"
    - "Dispatcher validates strict discriminated payloads before local Packer.toBlob"
    - "Semantic OOXML normalization compares repeat builds without requiring raw ZIP byte equality"

key-files:
  created:
    - "src/services/export/cabDocx.ts"
  modified:
    - "src/services/export/wizardDocx.ts"
    - "tests/export/wizardDocx.test.ts"

key-decisions:
  - "CAB source pins must match exactly across PL02, PL03B, and PL07 projectId, threadId, artifactId, version, hash, and approved state."
  - "Missing SIT/UAT, unresolved drift, and unverified rollback render as explicit caveats; export does not claim approval or deployment readiness."
  - "The public dispatcher is exhaustive over four approved output kinds and has no generic fallback, dynamic sandbox, network, or script path."

patterns-established:
  - "Minimal CAB content is capped by item and paragraph ceilings to preserve a short 1–2 page contract."
  - "Builder errors expose stable code-only messages through WizardDocxBuildError.code without raw payload content."

requirements-completed: [WIZ-DOCX-01, WIZ-FLOW-01]

# Metrics
duration: 12min
completed: 2026-10-29
---

# Phase 25 Plan 10: Minimal CAB Builder and Complete DOCX Dispatcher Summary

**Same-thread CAB summaries now export as bounded caveat-preserving Word documents, while one strict local dispatcher exhaustively builds all four approved wizard outputs.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-10-29T01:45:13Z
- **Completed:** 2026-10-29T01:57:32Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added `buildCabDocument(payload): Document` with Times New Roman title/headings/paragraphs, explicit context, business and technical changes, SIT/UAT state, risks/drift, rollback state, and one two-cell developer/approver sign-off table.
- Added strict CAB validation for all three required approved source artifacts, exact same project/thread, artifact IDs, versions, hashes, and current draft/approval revision.
- Extended `buildWizardDocx` to exhaustive PL02, PL03B, PL07, and CAB dispatch with stable typed errors and no generic renderer.
- Added deterministic semantic XML tests covering CAB caveats, mixed source rejection, all four Word MIME outputs, repeat builds, strict errors, no TODOs, no dynamic script/sandbox use, and zero network calls.

## Verification

```text
npm test -- tests/export/wizardDocx.test.ts -t CAB
1 test file passed, 3 tests passed

npm test -- tests/export/wizardDocx.test.ts
1 test file passed, 17 tests passed

npm exec -- tsc --noEmit --pretty false 2>&1 | grep -E "src/services/export/(cabDocx|wizardDocx)|tests/export/wizardDocx"
no scoped errors

git diff --check
clean
```

Full repository TypeScript output still reports pre-existing missing `knowledge-server` parser modules (`unified`, `remark-parse`, `remark-gfm`, `mdast`, `mdast-util-to-string`); no export-file errors remain.

## Task Commits

Each TDD task was committed atomically:

1. **Task 1 RED: Add failing CAB DOCX contracts** - `5f1a271` (`test`)
2. **Task 1 GREEN: Build caveat-preserving CAB DOCX** - `78801b6` (`feat`)
3. **Task 2 RED: Cover complete four-kind DOCX dispatcher** - `e9dd4f7` (`test`)
4. **Task 2 GREEN: Close exhaustive DOCX dispatch** - `5743a02` (`feat`)

**Plan metadata:** pending final metadata commit.

## Files Created/Modified

- `src/services/export/cabDocx.ts` - bounded minimal CAB Document builder and typed payload.
- `src/services/export/wizardDocx.ts` - strict CAB schema/source validation and exhaustive four-kind dispatcher.
- `tests/export/wizardDocx.test.ts` - CAB and full-dispatcher semantic, safety, determinism, and caveat tests.

## Decisions Made

- Reused existing `docx`, Zod, shared paragraph/table primitives, and native Blob output; no dependency or template renderer added.
- CAB deliberately avoids TOC, revision table, checklist, bank PL trees, and invented identity/signature claims.
- Repeat-build assertions normalize only generated OOXML identifiers; tests do not require raw ZIP byte equality.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unsupported CAB section option**
- **Found during:** Task 1 GREEN typecheck
- **Issue:** Current `docx` declarations reject `type` on `ISectionOptions`; CAB builder did not typecheck.
- **Fix:** Removed unused `SectionType.CONTINUOUS` option and import; retained explicit page margins.
- **Files modified:** `src/services/export/cabDocx.ts`
- **Verification:** CAB tests passed; scoped TypeScript check passed.
- **Committed in:** `78801b6`

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Required API correction only; no scope expansion.

## Issues Encountered

- `ctx7` CLI was unavailable. Existing installed `docx` declarations and targeted runtime tests supplied API verification; no package install performed.
- Full repository typecheck remains blocked by unrelated missing knowledge-server parser dependencies. Export scope is clean; unrelated files were not modified.
- `STATE.md` and `ROADMAP.md` were not modified per user instruction.

## Authentication Gates

None.

## Known Stubs

None in files created or modified by this plan. `(chưa cung cấp)` and explicit missing SIT/UAT/rollback text are intentional caveat output, not product stubs.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag:cab-source-spoofing | `src/services/export/wizardDocx.ts` | CAB accepts multiple source artifacts; exact project/thread/artifact/version/hash/approval validation prevents mixed-revision or cross-thread summaries. |
| threat_flag:export-privilege-escalation | `src/services/export/wizardDocx.ts` | Four-kind dispatch is local and exhaustive with no dynamic sandbox, generated script, network, or tool path. |
| threat_flag:error-disclosure | `src/services/export/wizardDocx.ts` | Stable code-only `WizardDocxBuildError` prevents raw payload leakage on rejected export. |

## Next Phase Readiness

- Four approved wizard output kinds now share one strict local DOCX entry point.
- CAB preserves unresolved drift, missing testing, and rollback uncertainty for downstream UI/export flows.
- Manual Word/LibreOffice visual comparison remains deferred to Phase 25 fidelity checkpoint.

## Self-Check: PASSED

- Created and modified files exist: `src/services/export/cabDocx.ts`, `src/services/export/wizardDocx.ts`, `tests/export/wizardDocx.test.ts`.
- Task commits `5f1a271`, `78801b6`, `e9dd4f7`, and `5743a02` exist in git history.
- CAB targeted tests and complete DOCX suite pass: 17 tests.
- Scoped TypeScript check and `git diff --check` pass.
- `STATE.md` and `ROADMAP.md` remain unchanged.

---
*Phase: 25-interactive-sdlc-document-wizards*
*Plan: 10*
*Completed: 2026-10-29*
