---
phase: 31-organization-conventions-in-the-solution-pipeline
plan: 03
subsystem: sdlc-conventions
tags: [sdlc, conventions, prompt-composer, ai, ui]
dependency-graph:
  requires: [31-01, 31-02]
  provides: [sdlcPromptComposer-conventions, ConventionsSummaryCard, ConventionsDetailModal]
  affects: [ProjectSdlcView, Step1IntakeView, Step2SolutionView, StepChatPanel]
tech-stack:
  added: []
  patterns: [untrusted-data-framing, layered-prompt-composition, 2-tab-conventions-modal]
key-files:
  created:
    - src/components/sdlc/common/ConventionsSummaryCard.tsx
    - src/components/sdlc/common/ConventionsDetailModal.tsx
  modified:
    - src/services/ai/sdlcPromptComposer.ts
    - src/views/ProjectSdlcView.tsx
    - src/components/sdlc/SdlcWorkspace.tsx
    - src/components/sdlc/chat/StepChatPanel.tsx
    - src/components/sdlc/steps/Step1IntakeView.tsx
    - src/components/sdlc/steps/Step2SolutionView.tsx
    - tests/ai/sdlcPromptComposer.test.ts
decisions:
  - "Conventions segment placed strictly between tool policy and few-shot/grounding"
  - "Global conventions precede repository conventions in prompt"
  - "Mandatory conflict policy requires AI to cite both sources and stop for user resolution"
  - "No budget cap or character truncation applied to convention document contents"
  - "ConventionsSummaryCard renders live status, line count, SSH path, and refresh CTA on Step 1 & 2"
metrics:
  duration: "10m"
  completed: "2026-11-07"
---

# Phase 31 Plan 03: Layered Conventions Prompt Segment and Intake/Solution Status Visibility Summary

Layered Conventions Prompt Segment and Intake/Solution status visibility implemented according to SDLC-CONV-03, SDLC-CONV-04, SDLC-CONV-05 and decisions D-07 through D-13.

## Implemented Capabilities

1. **Layered Prompt Segment & Conflict Policy**:
   - `buildConventionsSegment` formats conventions inside `[QUY ƯỚC TỔ CHỨC — DỮ LIỆU KHÔNG TIN CẬY]` tags.
   - `CONVENTIONS_CONFLICT_POLICY` instructs the AI to surface conflicting rules from both sources and stop for human confirmation.
   - Segment positioned strictly after `toolPolicy` and before `fewShot` / `grounding`.
   - Full text retained without character caps or truncation.

2. **Conventions Summary & Detail UI**:
   - `ConventionsSummaryCard` displays global/repo status tags, line counts, loaded timestamp, SSH status, and refresh button.
   - `ConventionsDetailModal` provides a 760px two-tab drawer/modal viewing global and repository markdown with safe rendering.
   - Integrated at the top of Step 1 (`Step1IntakeView`) and Step 2 (`Step2SolutionView`).

3. **SDLC Workspace Pipeline Wire-up**:
   - `ProjectSdlcView` loads global conventions from IndexedDB settings and remote repo conventions via Tauri SSH probe on mount.
   - Conventions state passes down through `SdlcWorkspace` into `StepChatPanel`.
   - Every AI turn composed in `StepChatPanel` includes in-effect conventions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Exact optional property type alignment in ConventionsDetailModalProps**
- **Found during:** Task 2 verification (`tsc --noEmit`)
- **Issue:** `exactOptionalPropertyTypes: true` flagged `string | undefined` vs optional string.
- **Fix:** Explicitly declared `string | undefined` on optional modal props.
- **Files modified:** `src/components/sdlc/common/ConventionsDetailModal.tsx`
- **Commit:** `06e45ee8`

## Verification

Scoped Vitest suite passed:
- `tests/ai/sdlcPromptComposer.test.ts` (27 tests)
- `tests/services/conventionService.test.ts` (16 tests)

## Self-Check: PASSED
- FOUND: `src/components/sdlc/common/ConventionsSummaryCard.tsx`
- FOUND: `src/components/sdlc/common/ConventionsDetailModal.tsx`
- FOUND: `0ef7c402`
- FOUND: `06e45ee8`
- FOUND: `7136df23`
