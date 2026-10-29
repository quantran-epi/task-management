---
phase: 25-interactive-sdlc-document-wizards
plan: 13
subsystem: ui
tags: [react, ant-design, wizard, accessibility, docx-export]

# Dependency graph
requires:
  - phase: 25-interactive-sdlc-document-wizards
    provides: "Wizard lifecycle schemas, dedicated DOCX builders, composer controls, gap/pack/drift cards, and coordinator contracts"
provides:
  - "Immutable document preview card with safe Markdown/Mermaid review and typed export/edit callbacks"
  - "Versioned SOLUTION review card and truthful saved-note/download outcome banner"
  - "Wizard-first ChatMessageBubble/ChatMessageList callback seam before grounding and generated-file paths"
affects: [25-14, 25-15, 25-17, interactive-sdlc-document-wizards]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wizard review cards remain presentational; builder, save, and download effects enter through typed callbacks"
    - "Persisted wizard messages dispatch before generic grounding/generated-file rendering"
    - "Note persistence, browser download initiation, and save-picker completion render as separate outcome truths"

key-files:
  created:
    - src/components/ai/wizard/DocumentPreviewCard.tsx
    - src/components/ai/wizard/SolutionReviewCard.tsx
    - src/components/ai/wizard/WizardSavedNoteBanner.tsx
  modified:
    - src/components/ai/ChatMessageBubble.tsx
    - src/components/ai/ChatMessageList.tsx
    - src/components/ai/wizard/__tests__/documentWizard.test.tsx

key-decisions:
  - "Wizard approval callbacks receive message ID and current draft revision; cards never call DOCX builders or dynamic sandbox code directly."
  - "SOLUTION existing-feature review shows current system and affected surfaces while saved historical cards remain immutable."
  - "Synthetic-anchor download initiation never claims that a file reached disk; save-picker success gets separate copy."

patterns-established:
  - "WizardMessageCallbacks is the typed UI/coordinator seam for review, edit, save, note, question, and pack actions."
  - "Temporary streaming bubbles receive no wizard controls even when persisted message payloads carry wizard state."

requirements-completed: [WIZ-UI-01, WIZ-DOCX-01, WIZ-LOOP-01]

# Metrics
duration: 1h 8m
completed: 2026-10-29
---

# Phase 25 Plan 13: Wizard Review, Save, and Export Message Cards Summary

**Typed immutable PL/PL03/PL07/CAB review cards and versioned SOLUTION history now route before generic chat rendering, with truthful separate Note/download outcomes and no dynamic sandbox export path.**

## Performance

- **Duration:** approximately 1h 8m
- **Started:** 2026-10-29T05:11:46Z
- **Completed:** 2026-10-29T06:13:25Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Added `DocumentPreviewCard` with safe existing Markdown/Mermaid rendering, bounded disclosure, exact Vietnamese review/export/edit copy, PL03 drift slot, immutable payload usage, and inline retry-preserving export error.
- Added `SolutionReviewCard` with version/affected-surface/current-system review, immutable saved history row, same-thread note-opening callback, and separate save/edit actions.
- Added `WizardSavedNoteBanner` with `#/notes?doc=<id>` navigation and separate Note-saved, download-started, and save-picker-completed messages.
- Added `WizardMessageCallbacks` and wizard-first routing in `ChatMessageBubble`/`ChatMessageList`; historical grounding and generic generated-file rendering remain unchanged when no wizard payload exists.
- Added routing spies proving dedicated approval callback receives message identity and draft revision, dynamic sandbox is not called, and streaming temporary bubbles expose no wizard controls.

## Verification

```text
npm test -- tests/ai/ChatMessageBubble.test.tsx src/components/ai/wizard/__tests__/documentWizard.test.tsx
2 test files passed, 32 tests passed

npx tsc --noEmit --pretty false 2>&1 | grep -E "src/components/ai/(ChatMessageBubble|ChatMessageList|wizard/(DocumentPreviewCard|SolutionReviewCard|WizardSavedNoteBanner))|tests/ai/ChatMessageBubble|documentWizard.test"
no scoped errors

git diff --check
clean
```

Full repository TypeScript remains blocked by pre-existing missing `knowledge-server` parser declarations (`unified`, `remark-parse`, `remark-gfm`, `mdast`, `mdast-util-to-string`); no unrelated files changed.

## Task Commits

Each task was committed atomically through TDD gates:

1. **Task 1 RED: Add failing review card contracts** - `cd98652` (test)
2. **Task 1 GREEN: Add wizard review and outcome cards** - `f4c5280` (feat)
3. **Task 2 RED: Add failing wizard routing contracts** - `cc11e25` (test)
4. **Task 2 GREEN: Route wizard messages before generic chat** - `66a04c4` (feat)

**Plan metadata:** pending final metadata commit.

## Files Created/Modified

- `src/components/ai/wizard/DocumentPreviewCard.tsx` - immutable Markdown/Mermaid document review and typed DOCX approval callback.
- `src/components/ai/wizard/SolutionReviewCard.tsx` - versioned SOLUTION review/save/history surface.
- `src/components/ai/wizard/WizardSavedNoteBanner.tsx` - truthful Note/download/save-picker status surface.
- `src/components/ai/ChatMessageBubble.tsx` - wizard-first dispatch and `WizardMessageCallbacks` seam; generic paths retained.
- `src/components/ai/ChatMessageList.tsx` - forwards typed wizard callbacks to persisted messages only.
- `src/components/ai/wizard/__tests__/documentWizard.test.tsx` - review, immutable history, truthful outcomes, routing, callback, streaming, and sandbox-bypass contracts.

## Decisions Made

- Cards do not import or invoke `buildWizardDocx`, `handleDownloadGeneratedFile`, `executeDynamicFileScript`, persistence, or ZIP services; coordinator owns effects.
- Wizard branch runs before `grounding` and generated-file rendering only for persisted non-streaming assistant messages with wizard callbacks; historical non-wizard rendering remains unchanged.
- Existing-feature SOLUTION review exposes current system and affected surfaces; saved rows preserve prior version payload instead of mutating it.
- Download initiation and Note/save-picker outcomes use distinct copy so UI does not overclaim disk persistence.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected accessible action names and saved-document link semantics**
- **Found during:** Task 1 GREEN verification
- **Issue:** Ant Design icon buttons exposed icon-plus-label accessible names, and saved SOLUTION `Mở tài liệu` rendered as a button instead of a navigable document link.
- **Fix:** Added explicit `aria-label` values for primary/secondary review actions and rendered saved-note navigation as an anchor with the required hash URL while preserving callback handling.
- **Files modified:** `src/components/ai/wizard/DocumentPreviewCard.tsx`, `src/components/ai/wizard/SolutionReviewCard.tsx`
- **Verification:** Targeted wizard card tests pass.
- **Committed in:** `f4c5280`

**2. [Rule 3 - Blocking] Rebased isolated worktree onto current master before execution**
- **Found during:** Plan initialization
- **Issue:** Worktree HEAD lacked current Phase 25 dependency commits and Plan 25-10/25-14 artifacts.
- **Fix:** Fast-forwarded worktree with `git merge --ff-only master` before edits; no local changes were discarded.
- **Files modified:** None by this deviation.
- **Verification:** Current master dependencies available; targeted tests and scoped typecheck pass.
- **Committed in:** N/A

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking workspace alignment)
**Impact on plan:** Required accessibility and dependency alignment only. No architecture or dependency scope added.

## Issues Encountered

- Full `tsc --noEmit` still reports unrelated missing `knowledge-server` parser modules. Scoped Phase 25 UI files are clean; unrelated parser files were not modified.
- Ant Design emitted existing deprecation warnings for `Space.direction` and `Alert.message` during targeted tests; assertions pass and warnings are outside this plan's required files.

## Authentication Gates

None.

## Known Stubs

None in Plan 25-13 production files. Explicit `(chưa cung cấp)` output is intentional missing-data handling, not an unimplemented path.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag:historical-preview-tampering | `src/components/ai/wizard/DocumentPreviewCard.tsx` | Review card consumes persisted untrusted wizard payload; it never mutates the payload and edit callback carries identity/revision for append-only coordinator handling. |
| threat_flag:export-privilege-escalation | `src/components/ai/ChatMessageBubble.tsx` | Wizard-first branch routes approval through typed callback and bypasses generic generated-file/dynamic sandbox execution. |
| threat_flag:false-file-success | `src/components/ai/wizard/WizardSavedNoteBanner.tsx` | Separate truth states prevent download initiation from claiming disk completion. |

## Next Phase Readiness

- Plan 25-14 coordinator already has typed lifecycle/save effects available for wiring into `WizardMessageCallbacks`.
- Plan 25-15 can consume immutable review/export cards and dedicated builder callbacks without adding service logic to chat components.
- Plan 25-17 can provide real gap, solution, pack, generated-file, and saved-note payloads through the established seam.

## Self-Check: PASSED

- Created files exist: `DocumentPreviewCard.tsx`, `SolutionReviewCard.tsx`, `WizardSavedNoteBanner.tsx`.
- Task commits `cd98652`, `f4c5280`, `cc11e25`, and `66a04c4` exist in git history.
- Targeted tests pass: 32/32.
- Scoped TypeScript check passes.
- `git diff --check` passes.
- Worktree has no uncommitted changes.
- `STATE.md` and `ROADMAP.md` were not modified.

---
*Phase: 25-interactive-sdlc-document-wizards*
*Plan: 13*
*Completed: 2026-10-29*
