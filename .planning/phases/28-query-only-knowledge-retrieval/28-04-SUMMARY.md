---
phase: 28-query-only-knowledge-retrieval
plan: 04
subsystem: ai-knowledge-retrieval-trust
tags: [server-empty, canonical-notice, grounded-turn, telegram, ai-chat, tool-events, cross-surface, d12, d13, d14, tauri]

requires:
  - phase: 28-query-only-knowledge-retrieval
    provides: "28-02 catalog-free query-only retrieval with structured NO_PUBLISHED_SETS status and 28-03 grounded/snapshot attribution"
provides:
  - "One dependency-free knowledgeOutcome module owning the verbatim D-12 notice, outcome vocabulary, defensive detector and render mapping"
  - "'server_empty' GroundedTurnResult with the canonical notice first and an ordered, separately-labelled local-authority fallback"
  - "Identical app-owned rendering on AI Chat (grounded + shared-widget tool events) and Telegram (grounded + orchestrator tool results), once per turn"
  - "'NO_PUBLISHED_SETS' accepted in ChatMessageGroundingSchema; three retrieval outcomes kept distinct"
affects: [28-query-only-knowledge-retrieval, 28-05]

actuals:
  tokens: 6680
  tasks: 3
  commits: 6
  plan_head_before: 7e1f12979deda964f80c9846c42637897ba2d962
  plan_head_after: 9b17165336b77ea8f8e12012e913e2ea4f0008ba

tech-stack:
  added: []
  patterns:
    - "Single exported constant owns user-visible copy; every live surface imports it rather than authoring its own"
    - "Pure, worker-safe outcome detector parsed defensively from tool-result JSON with a fixed enum and local tool-name normalization"
    - "App-owned notice prepended via existing onToolResult/onToolEvent seams; orchestrator and tool loop untouched"
    - "Server-empty notice is a system-role transcript row; local fallback stays a separate authority:'local' row"

key-files:
  created:
    - src/services/ai/knowledgeOutcome.ts
    - tests/ai/knowledgeOutcome.test.ts
  modified:
    - src/services/ai/groundedTurn.ts
    - src/services/ai/groundedAnswerSchemas.ts
    - src/components/ai/AIChatDrawer.tsx
    - src/services/telegram/telegramHeadlessWorker.ts
    - tests/ai/groundedTurn.test.ts
    - tests/ai/AIChatDrawerGroundedWiring.test.tsx
    - tests/telegram/telegramHeadlessWorker.test.ts

key-decisions:
  - "D-12/D-13: KNOWLEDGE_SERVER_EMPTY_NOTICE is the single verbatim Vietnamese notice; AIChatDrawer and telegramHeadlessWorker both import it, no surface owns a copy"
  - "knowledgeOutcome normalizes tool names locally (byte-equivalent to normalizeToolName) so the headless Telegram worker does not pull the full aiTools graph; no React, DOM, or new dependency"
  - "NO_PUBLISHED_SETS is caught in groundedTurn step 5 before synthesis, so the model never receives or paraphrases the empty-server outcome"
  - "Local fallback reuses executeLocalPath with fallbackReason SERVER_ABSENT and stays a separate ChatMessageGrounding with authority 'local' (D-14)"
  - "NO_PUBLISHED_SETS added to GroundingOutcomeSchema as an enum value only; a server_empty row is a system row with no grounding payload, so the authority superRefine is not involved"
  - "Telegram's onToolResult seam has no tool-name argument; the detector is invoked with the retrieve_knowledge name because only that structured result carries the exact outcome/status code"
  - "Absolute non-regression honored: aiOrchestratorLoop.ts, knowledgeRetrievalTool.ts and aiTools.ts are byte-identical; no flag, routing branch, existing copy or existing outcome changed"

patterns-established:
  - "Cross-surface notice ownership: one constant + one detector + one render mapper consumed by every live host from grounded and tool-driven paths"
  - "Once-per-turn guard: per-tab ref (AI Chat) and per-call local flag (Telegram) prevent duplicate notice rows from repeated tool results"

requirements-completed: [SDLC-RET-04]

coverage:
  - id: D1
    description: "One canonical D-12 notice and a dependency-free detector/render module usable from React and the headless worker"
    requirement: SDLC-RET-04
    verification:
      - kind: unit
        ref: "tests/ai/knowledgeOutcome.test.ts#knowledgeOutcome canonical notice > exports the exact D-12 canonical string with no surrounding whitespace"
        status: pass
      - kind: unit
        ref: "tests/ai/knowledgeOutcome.test.ts#knowledgeOutcome detect"
        status: pass
      - kind: unit
        ref: "tests/ai/knowledgeOutcome.test.ts#knowledgeOutcome render"
        status: pass
    human_judgment: false
  - id: D2
    description: "Server-empty grounded result with the canonical notice first and ordered local-only fallback; other outcomes unchanged"
    requirement: SDLC-RET-04
    verification:
      - kind: unit
        ref: "tests/ai/groundedTurn.test.ts#groundedTurn state machine > Phase 28-04: server-empty grounded outcome with ordered local fallback"
        status: pass
      - kind: unit
        ref: "tests/ai/groundedTurn.test.ts#groundedTurn state machine (54 pre-existing regression cases)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Telegram renders the identical canonical notice on grounded and tool-driven paths, once per turn"
    requirement: SDLC-RET-04
    verification:
      - kind: unit
        ref: "tests/telegram/telegramHeadlessWorker.test.ts#Telegram Headless Worker > Phase 28-04: canonical server-empty notice on Telegram"
        status: pass
    human_judgment: false
  - id: D4
    description: "AI Chat renders the identical canonical notice on grounded and shared-widget tool-event paths, with separate local-labelled fallback"
    requirement: SDLC-RET-04
    verification:
      - kind: automated_ui
        ref: "tests/ai/AIChatDrawerGroundedWiring.test.tsx#AIChatDrawer Grounded Turn Wiring > Phase 28-04: canonical server-empty notice on AI Chat (3 new cases)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Live Tauri walkthrough on AI Chat and Telegram with zero published sets, then with one published set"
    requirement: SDLC-RET-04
    verification: []
    human_judgment: true
    rationale: "Manual stack-up UAT requires a running knowledge daemon and the desktop surfaces; automated tests cover the shared module and both host seams but not the observed end-to-end answer."

duration: ~20min
completed: 2026-11-17
status: complete
---

# Phase 28 Plan 04: Canonical Empty-Server Notice Across Live Surfaces Summary

**One application-owned D-12 notice rendered verbatim on AI Chat and Telegram from grounded and tool-driven paths, with a distinct server_empty outcome and separately labelled local fallback**

## Performance

- **Duration:** ~20 min (active execution)
- **Started:** 2026-11-17T07:45:06Z
- **Completed:** 2026-11-17T08:05:26Z
- **Tasks:** 3 of 3
- **Files modified:** 8 (5 source, 3 test)

## Accomplishments

- `knowledgeOutcome.ts` exports the exact D-12 Vietnamese notice plus the fixed outcome vocabulary, a defensive `retrieve_knowledge` result detector (local tool-name normalization, try/catch JSON parse, null on unknown input) and a render mapper — with no React, DOM, browser API or new package, so the headless Telegram worker can use it.
- `runGroundedTurn` catches `NO_PUBLISHED_SETS` before synthesis and returns `kind:'server_empty'` with the canonical notice; when local documents exist, the existing local path runs and its grounding is attached as a separate `authority:'local'` `localFallback` behind the notice.
- `ChatMessageGroundingSchema` accepts `NO_PUBLISHED_SETS` as a persisted outcome enum value without touching any authority/superRefine field.
- AI Chat saves the notice as a `system` transcript row (and the local fallback as its own assistant grounded row), and surfaces the same notice once per turn from shared-widget `onToolEvent` results.
- Telegram's `formatGroundedNonAnswer` returns the canonical notice for `kind:'server_empty'`, and an `onToolResult` callback on the existing orchestrator call prepends it once when a tool result carries `NO_PUBLISHED_SETS`.
- Three outcomes stay distinct: no published sets (canonical notice + publish guide), searched-with-no-evidence (existing `refine`/no notice), and unreachable (existing local-fallback path/no notice).

## Task Commits

All three `tdd="true"` tasks followed RED → GREEN with machine-validated RED evidence (`gsd_run check tdd-red-evidence` → `RED_EVIDENCE_OK` for each):

1. **Task 1: Shared canonical outcome module** — `6b3e6c68` (test), `76c51721` (feat)
2. **Task 2: server_empty grounded result with ordered local fallback** — `7d945072` (test), `38049d10` (feat)
3. **Task 3: Identical rendering on AI Chat and Telegram** — `83b3cd75` (test), `9b171653` (feat)

**Plan metadata:** this SUMMARY commit (docs)

## Files Created/Modified

- `src/services/ai/knowledgeOutcome.ts` — canonical notice, outcome codes, defensive detector, render mapper (new)
- `src/services/ai/groundedTurn.ts` — `server_empty` result kind and NO_PUBLISHED_SETS branch before synthesis
- `src/services/ai/groundedAnswerSchemas.ts` — `NO_PUBLISHED_SETS` added to `GroundingOutcomeSchema`
- `src/components/ai/AIChatDrawer.tsx` — system notice row, local-fallback row, tool-event notice path with once-per-turn ref
- `src/services/telegram/telegramHeadlessWorker.ts` — `formatGroundedNonAnswer` server_empty case, `onToolResult` notice prepend
- `tests/ai/knowledgeOutcome.test.ts` (new), `tests/ai/groundedTurn.test.ts`, `tests/ai/AIChatDrawerGroundedWiring.test.tsx`, `tests/telegram/telegramHeadlessWorker.test.ts`

## Decisions Made

- Kept the notice detector independent of `aiTools.ts` by duplicating the small `normalizeToolName` wrapper logic locally; this keeps the Telegram worker free of the full AI tool graph and satisfies the "no new package, no browser API" constraint.
- Used `SERVER_ABSENT` (already in `FallbackReasonSchema`) as the local path's fallback reason for the empty-server case, avoiding any schema widening.
- The Telegram `onToolResult` seam receives only `(callId, result, durationMs)`; detection keys off the structured `outcome`/`status.code` value, which is specific to the knowledge tool, rather than changing the orchestrator to pass a tool name.

## TDD Gate Compliance

- RED, GREEN commit pairs present and correctly ordered for all three tasks (test commit precedes its feat commit in ancestry).
- RED evidence for each target test was validated by `gsd_run check tdd-red-evidence` → `RED_EVIDENCE_OK`; records at `.planning/debug/28-04-t{1,2,3}-red.json`.
- `workflow.tdd_mode` is false in config, so the end-of-phase TDD review checkpoint is not triggered; gate compliance is recorded here for audit.

## Deviations from Plan

### Auto-fixed Issues

None — plan executed as written. All changes were the planned implementation.

### Documentation / test-adjustment notes

- **Drawer test label assertion:** the new "grounded server_empty with localFallback" test was written during RED against a guessed local label; in GREEN it was corrected to assert the existing `GroundedBanner variant="local"` copy (`Chỉ tìm từ khoá trên Markdown đã lập chỉ mục cục bộ`) so it verifies the real local-only label rather than a fabricated string. This changed only the new test, not production behavior.
- **TDD RED stub for a new module:** Task 1's target is a brand-new file, so an import-only RED produced an INVALID_RED (load failure). A minimal empty-export stub was used to obtain a valid assertion-level RED; the stub was never committed and GREEN replaced it with the real implementation.

---

**Total deviations:** 0 auto-fixed code issues; 2 documentation/test-adjustment notes.
**Impact:** No scope creep, no new dependency, no deleted file, no SDLC/wizard resurrection, no change to routing flags or existing outcome copy.

## Issues Encountered

- The plan-level verification command includes `tests/ai/AIChatDrawerGroundedWiring.test.tsx`, which fails 6 pre-existing tests at stock HEAD in this isolated worktree (React/dnd-kit `useMemo` on null / `DatabaseClosedError`), documented in `.planning/phases/28-query-only-knowledge-retrieval/deferred-items.md`. All 3 new Task 3 drawer cases pass; the failure set is unchanged or smaller than baseline and was not treated as a new regression.
- Vitest `tap-flat` output for this project was rejected by the RED-evidence classifier (`invalid_record`); the JUnit reporter with a qualified target name satisfied `RED_EVIDENCE_OK` for all three tasks, matching prior plans in this phase.
- Full Vitest suite intentionally not run (project rule: over an hour); only the plan's four focused test files plus the phase-gate non-regression suites and `tsc --noEmit` were run.

## Non-Regression Verification

- `git diff -- src/services/ai/aiOrchestratorLoop.ts src/services/ai/knowledgeRetrievalTool.ts src/services/ai/aiTools.ts` is empty (byte-identical).
- Client phase gate: `npx vitest run tests/knowledge/retrievalProtocolParity.test.ts tests/ai/knowledgeRetrievalTool.test.ts tests/ai/evidencePack.test.ts tests/ai/SourcesPanel.test.tsx tests/ai/CitationChipAndQuickPreview.test.tsx` → 5 files, 96 tests passed.
- Server phase gate: `npm --prefix knowledge-server test -- tests/publishedSetDiscovery.test.ts tests/snapshotLexicalRetrieval.test.ts tests/federatedRetrieval.test.ts tests/retrievalProtocol.test.ts tests/retrievalRoutes.test.ts` → 5 files, 90 tests passed.
- Focused: `npx vitest run tests/ai/knowledgeOutcome.test.ts tests/ai/groundedTurn.test.ts tests/telegram/telegramHeadlessWorker.test.ts` → 123 tests passed; `npx tsc --noEmit` exits 0.
- Canonical-copy ownership: `grep -rln "chưa có bộ tài liệu nào được publish" src/ --include=*.ts --include=*.tsx` returns exactly `src/services/ai/knowledgeOutcome.ts`.

## User Setup Required

None - no external service configuration added. Manual live walkthrough with zero/one published sets remains a phase-level UAT item (D5).

## Next Phase Readiness

Ready for Phase 28 plan 05. The server-empty outcome is now one canonical, app-owned notice on both live surfaces from grounded and tool-driven paths, with the three retrieval outcomes kept distinct and all existing AI-engine flows preserved. Live end-to-end verification on AI Chat and Telegram with the knowledge daemon remains a phase-level UAT item.

---
*Phase: 28-query-only-knowledge-retrieval*
*Completed: 2026-11-17*

## Self-Check: PASSED

- All 5 source files and 3 test files exist on disk; this SUMMARY exists.
- All 6 commit hashes (`6b3e6c68`, `76c51721`, `7d945072`, `38049d10`, `83b3cd75`, `9b171653`) are ancestors of HEAD.
- All task acceptance criteria verified: constant in both surfaces (3 hits each), single owner of the literal, `onToolResult` wired, orchestrator diff empty, server_empty/NO_PUBLISHED_SETS greps satisfied, localFallback authority asserted.
- Focused tests pass; phase-gate non-regression suites pass (96 + 90); `tsc --noEmit` clean.
- No new stubs, no new network surface, no dangerous HTML injection.
