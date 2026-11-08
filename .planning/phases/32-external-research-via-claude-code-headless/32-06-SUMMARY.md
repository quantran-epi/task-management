---
phase: 32-external-research-via-claude-code-headless
plan: "06"
subsystem: ui
tags: [antd, react, research, sdlc, dexie, streaming]

requires:
  - phase: 32-external-research-via-claude-code-headless
    provides: researchService (executeMultiSystemResearch, ResearchPayloadSchema, ResearchRunError), artifactRepo RESEARCH loaders, propose_research tool, external_research_evidence prompt segment
provides:
  - ResearchSummaryCard, ResearchDetailModal, ResearchTriggerModal
  - StepChatPanel research state machine (proposal, streaming, completion, error) and startResearch handle
  - Manual research trigger wired from Step 1 / Step 2 toolbars through ChangeRequestSdlcView
affects: [32-verification, sdlc-studio]

tech-stack:
  added: []
  patterns:
    - "Presentational research card: step views load CR-scoped artifacts, the card never reads the DB"
    - "Run state machine in the chat panel with a closure-local cancel handle and a scope-keyed run id guard"
    - "Tool result payloads become cards only after a shape guard; malformed payloads are dropped silently"

key-files:
  created:
    - src/components/sdlc/common/ResearchSummaryCard.tsx
    - tests/unit/sdlc/ResearchSummaryCard.test.tsx
    - tests/unit/sdlc/StepChatPanelResearch.test.tsx
  modified:
    - src/components/sdlc/chat/StepChatPanel.tsx
    - src/components/sdlc/steps/Step1IntakeView.tsx
    - src/components/sdlc/steps/Step2SolutionView.tsx
    - src/views/ChangeRequestSdlcView.tsx
    - tests/unit/sdlc/ChangeRequestSdlcAnalysisLifecycle.test.tsx
    - tests/unit/sdlc/ChangeRequestSdlcAutoAnalysis.test.tsx

key-decisions:
  - "ResearchSummaryCard is presentational; Step 1/2 load versions with loadAllResearchArtifacts and pass them down, so D-06 history stays inspectable without a second DB read path"
  - "startResearch returns early on a null threadId, so an artifact can never bind to a thread the panel is not showing (T-32-15)"
  - "The completion CTA dispatches a neutral follow-up prompt rather than the CTA label, so the artifact-intent detector does not re-route it into the SOLUTION generation gate"

patterns-established:
  - "Research cards render through the existing transcriptExtensions slot, next to the subsystem proposal card"
  - "Live stdout console capped at the latest 500 lines (T-32-09)"

requirements-completed: [SDLC-RES-01, SDLC-RES-03, SDLC-RES-05, SDLC-RES-06]

duration: 22min
completed: 2026-11-08
---

# Phase 32 Plan 06: Research UI and Dual Trigger Wiring Summary

**Research summary card with versioned detail modal, in-chat proposal/streaming/completion/error cards, and both trigger paths (AI proposal and the "Nghiên cứu (Claude Code)" toolbar) wired end to end through the chat panel's run state machine**

## Performance

- **Duration:** 22 min
- **Started:** 2026-11-08T06:29:00Z (approx)
- **Completed:** 2026-11-08T06:51:18Z
- **Tasks:** 3
- **Files modified:** 9 (3 created, 6 modified)

## Accomplishments

- `ResearchSummaryCard`, `ResearchDetailModal` (D-06 version selector over every historical version, findings table with `[EXTERNAL:WEB]` / `[EXTERNAL:REPO:{code}]` tags, Raw Output tab, skipped-system warning), and `ResearchTriggerModal` (question textarea, CR-target system checkboxes, web switch) in one module.
- `StepChatPanel` gained the full research lifecycle: `propose_research` result parsing into `ResearchProposalCard`, `startResearch` on the imperative handle for the manual path, `ResearchStreamingCard` with elapsed timer / line count / 500-line console / cancel, `ResearchCompletionCard` with the "Tiếp tục sinh Solution với bằng chứng này" CTA, and `ResearchErrorAlert` splitting unavailable / timeout / SSH / cancelled.
- The latest RESEARCH artifact is loaded with `loadLatestResearchArtifact`, validated with `ResearchPayloadSchema`, and passed to `composeSdlcTurn` as `externalResearch`, so D-07's subordinate evidence segment is live.
- Both step views render the research card beside `ConventionsSummaryCard` from CR-scoped artifacts, and `ChangeRequestSdlcView` routes the toolbar modal submit into `chatPanelRef.current?.startResearch(...)`.

## Task Commits

1. **Task 1: ResearchSummaryCard, detail modal with version selector, trigger modal** - `16d8fe81` (feat)
2. **Task 2: research run state machine, in-chat cards, startResearch handle** - `309e02f7` (feat)
3. **Task 3: Step 1 / Step 2 / ChangeRequestSdlcView wiring** - `020020c1` (feat)

**Plan metadata:** committed with this SUMMARY (docs)

## Files Created/Modified

- `src/components/sdlc/common/ResearchSummaryCard.tsx` - Card, detail modal, trigger modal, plus `parseResearchPayload` / `findingTag` helpers
- `src/components/sdlc/chat/StepChatPanel.tsx` - `sessionId`, `startResearch`, research state machine, four cards, `externalResearch` composition, `propose_research` tool gate
- `src/components/sdlc/steps/Step1IntakeView.tsx` - Research card + trigger modal, CR-target system lookup
- `src/components/sdlc/steps/Step2SolutionView.tsx` - Same wiring, plus the missing `dexie-react-hooks` import
- `src/views/ChangeRequestSdlcView.tsx` - `onStartResearch` to both step views via `chatPanelRef`
- `tests/unit/sdlc/ResearchSummaryCard.test.tsx` - 9 tests: empty state, counts, detail modal, history selector, trigger, skipped systems, CR title, trigger-modal submit
- `tests/unit/sdlc/StepChatPanelResearch.test.tsx` - 9 tests: proposal render, malformed drop, confirm→stream, cancel, completion CTA, unavailable, timeout, manual start, null-thread guard
- `tests/unit/sdlc/ChangeRequestSdlcAnalysisLifecycle.test.tsx`, `tests/unit/sdlc/ChangeRequestSdlcAutoAnalysis.test.tsx` - handle doubles gained `startResearch`

## Decisions Made

- Research card stays presentational; the step views own the `useLiveQuery` reads. This keeps the D-06 history selector fed by one loader (`loadAllResearchArtifacts`) and avoids a second read path inside the card.
- The completion CTA dispatches `PROCEED_WITH_RESEARCH_PROMPT` ("Áp dụng bằng chứng nghiên cứu bên ngoài vừa thu thập…") rather than the CTA label text. Reusing the label would have matched `looksLikeArtifactRequest` and diverted the turn into the generation-clarification gate instead of a normal Q&A turn.
- `ResearchDetailModal` is reused inside `StepChatPanel` for the completion card's "Xem chi tiết phát hiện" action, so there is exactly one findings renderer.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `startResearch` to two existing test handle doubles**
- **Found during:** Task 2 (typecheck)
- **Issue:** `ChangeRequestSdlcAnalysisLifecycle.test.tsx` and `ChangeRequestSdlcAutoAnalysis.test.tsx` build `StepChatPanelHandle` literals; extending the interface broke `tsc --noEmit` with TS2741.
- **Fix:** Added `startResearch: vi.fn()` to both doubles.
- **Files modified:** the two test files above
- **Verification:** `npx tsc --noEmit` exits 0
- **Committed in:** `309e02f7` (Task 2 commit)

**2. [Rule 3 - Blocking] Symlinked `node_modules` into the worktree**
- **Found during:** Task 1 (first test run)
- **Issue:** The worktree has no `node_modules` (gitignored), so vitest and tsc could not resolve dependencies.
- **Fix:** `ln -s <main-repo>/node_modules node_modules` (untracked, gitignored).
- **Files modified:** none tracked
- **Verification:** vitest and tsc run normally
- **Committed in:** n/a (untracked symlink)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both were mechanical prerequisites for running the plan's own verification. No scope creep.

## Issues Encountered

- Rejected-promise fixtures in the first draft of `StepChatPanelResearch.test.tsx` produced unhandled rejections (the promise rejects before the component attaches its handler). Rewrote those two cases to reject inside `act()` after confirm.

## Threat Surface Scan

No new surface beyond the plan's `<threat_model>`. Mitigations landed as specified: T-32-08 (claims render as React text nodes, no `dangerouslySetInnerHTML` — the module contains zero occurrences), T-32-09 (500-line console cap), T-32-12 (proposal data only, ids already re-resolved by the tool), T-32-14 (trigger targets loaded from `db.systems` filtered by CR targets), T-32-15 (null-thread gate before any run).

## Known Stubs

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Both trigger paths are reachable in the running app; the manual button only appears when the host supplies `onStartResearch`, which `ChangeRequestSdlcView` always does.
- Verification suites for this plan: `ResearchSummaryCard.test.tsx`, `StepChatPanelResearch.test.tsx`, the six SDLC view suites, and `npx tsc --noEmit` — all green.

---
*Phase: 32-external-research-via-claude-code-headless*
*Completed: 2026-11-08*
