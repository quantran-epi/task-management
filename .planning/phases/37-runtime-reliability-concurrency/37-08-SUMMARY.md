---
phase: 37-runtime-reliability-concurrency
plan: 08
subsystem: ui
tags: [ai-office, retry, d-13, d-27, c-15, transcript, supersession, walkthrough]
dependency-graph:
  requires:
    - 37-03 (ChatMessage link fields: assignmentId, runStatus, supersededByMessageId)
    - 37-06 (messageListExtensions threading used for onStopAgent, now mirrored for onRetryAgent)
    - 37-07 (TeamRunCoordinator.retryAssignment(assignmentId) — the action this plan surfaces)
  provides:
    - ChatMessageBubble.onRetryAgent threaded AiChatWidget -> ChatMessageList -> bubble
    - AgentStatusRow "Chưa hoàn tất" label driven by status alone plus agent-retry-<assignmentId>
    - bubble render gate message.supersededByMessageId === undefined && (message.runStatus ?? agentStatus)
    - TeamWorkspace wiring onRetryAgent -> coordinator.retryAssignment
  affects:
    - phase verification / UAT (the six-observation walkthrough remains an open human gate)
tech-stack:
  added: []
  patterns:
    - "terminal status is read from the persisted row first; the live map is only a legacy fallback"
    - "supersession is suppressed at the bubble gate, so the whole row disappears, not just the button"
    - "the retry button is keyed by assignment id, so two attempts of one agent never collide"
key-files:
  created: []
  modified:
    - src/components/ai/office/AgentAttributionRow.tsx
    - src/components/ai/ChatMessageBubble.tsx
    - src/components/ai/ChatMessageList.tsx
    - src/components/ai/AiChatWidget.tsx
    - src/components/ai/office/TeamWorkspace.tsx
    - tests/components/ai/office/AgentAttributionRow.test.tsx
    - tests/ai/ChatMessageListAttribution.test.tsx
    - .planning/WINDOWS.md
decisions:
  - "the persisted message.runStatus wins over the live agentStatus, because TeamWorkspace filters terminal agents out of snapshot.agents — a stopped attempt has no live status anywhere and a remount has none at all"
  - "supersession is decided once, at the bubble gate; onRetry is not overloaded to express it, so onRetry means only 'this surface cannot retry'"
  - "the retry button carries the assignment id (the exact attempt lineage) via agent-retry-<assignmentId>; the callback receives that same id, never the agent id"
actuals:
  tokens: 3772
  tasks: 2
  commits: 2
  plan_head_before: 8199b155827e355f164e7f8a93b1971d51712eb1
  plan_head_after: 5ee86cc3bb9f90c7b9e85a1ef16d85b575066a9f
requirements-completed: [AIO-LEAD-05]
coverage:
  - id: D1
    description: "A stopped or errored attempt's bubble shows \"Chưa hoàn tất\" and, when the surface can retry, a \"Chạy lại\" button keyed by assignment id"
    requirement: AIO-LEAD-05
    verification:
      - kind: unit
        ref: "tests/components/ai/office/AgentAttributionRow.test.tsx#renders the label and the retry button for a stopped assignment"
        status: pass
      - kind: unit
        ref: "tests/components/ai/office/AgentAttributionRow.test.tsx#renders the label and the retry button for an errored assignment"
        status: pass
      - kind: unit
        ref: "tests/components/ai/office/AgentAttributionRow.test.tsx#keys the retry test id by assignment so two attempts never collide"
        status: pass
    human_judgment: false
  - id: D2
    description: "The affordance is reachable from persisted state alone (remount with no live snapshot), and the retry targets the assignment id, not the agent id"
    requirement: AIO-LEAD-05
    verification:
      - kind: unit
        ref: "tests/ai/ChatMessageListAttribution.test.tsx#renders the retry button from the persisted runStatus alone"
        status: pass
    human_judgment: false
  - id: D3
    description: "A superseded report renders no AgentStatusRow at all (no label, no stop, no retry, no agent-status-<agentId> node)"
    requirement: AIO-LEAD-05
    verification:
      - kind: unit
        ref: "tests/ai/ChatMessageListAttribution.test.tsx#renders no status row at all for a superseded report"
        status: pass
    human_judgment: false
  - id: D4
    description: "The old labels are replaced, not stacked: no bubble renders \"Đã dừng giữa chừng\" or a bare \"Lỗi\""
    requirement: AIO-LEAD-05
    verification:
      - kind: unit
        ref: "tests/ai/ChatMessageListAttribution.test.tsx#renders the stopped label without a stop button"
        status: pass
      - kind: unit
        ref: "tests/components/ai/office/AgentAttributionRow.test.tsx#renders the label and the retry button for an errored assignment"
        status: pass
    human_judgment: false
  - id: D5
    description: "Six-observation Tauri walkthrough closing the phase (limit-2 batch, outbox, queued stop, global abort, retry, delete mid-run)"
    verification: []
    human_judgment: true
    rationale: "D-27/C-15 require observed runtime behavior. Not performed in this environment: no TaskMate app profile with a saved provider exists, no built Tauri binary, and no GUI-driving/screenshot tooling — an observation could not be made without inventing a result. Recorded as open defect-ledger entry #10 for the phase verifier."
duration: 22 min
completed: 2026-11-12
status: complete
---

# Phase 37 Plan 08: "Chưa hoàn tất" / "Chạy lại" bubble affordance Summary

**A stopped or errored attempt's transcript bubble now offers "Chạy lại" from persisted state alone — surviving a remount with no live coordinator — and a superseded report disappears entirely at the bubble gate**

## Performance

- **Duration:** 22 min
- **Started:** 2026-11-11T21:17:00Z (plan ledger base `8199b155`)
- **Completed:** 2026-11-11T21:39:00Z
- **Tasks:** 2 planned; task 1 executed, task 2 blocked by environment (recorded, not claimed)
- **Files modified:** 8 (0 created)

## Accomplishments

- `AgentStatusRow` renders one "Chưa hoàn tất" label for both `stopped` and `error`, replacing "Đã dừng giữa chừng" and the bare "Lỗi" — no stacked tags.
- The retry button is `agent-retry-<assignmentId>` and the callback receives the **assignment** id, so two attempts of one agent never collide and a retry targets the attempt on screen.
- `ChatMessageBubble`'s render gate changed to `agent && message.supersededByMessageId === undefined && (message.runStatus ?? agentStatus)`; the persisted `runStatus` now wins over the live map, which is what makes the affordance reachable after a remount (terminal agents are filtered out of `snapshot.agents`).
- `onRetryAgent` threads through the existing `messageListExtensions` path from `AiChatWidget` → `ChatMessageList` → bubble, and `TeamWorkspace` wires it to `coordinator.retryAssignment`.

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end retry affordance** - `6ced50d4` (feat)
2. **Task 2: Observed Tauri walkthrough** - `5ee86cc3` (docs — defect-ledger record only; observations not performed, see below)

**Plan metadata:** committed after this file (docs: complete plan)

## Files Created/Modified

- `src/components/ai/office/AgentAttributionRow.tsx` — widened `status` to the ledger union, added `assignmentId`/`onRetry`, new label + button
- `src/components/ai/ChatMessageBubble.tsx` — gate change, persisted-status precedence, `onRetryAgent` prop
- `src/components/ai/ChatMessageList.tsx` — forwards `onRetryAgent`
- `src/components/ai/AiChatWidget.tsx` — forwards `onRetryAgent` to the transcript
- `src/components/ai/office/TeamWorkspace.tsx` — wires `onRetryAgent` to `coordinator.retryAssignment`
- `tests/components/ai/office/AgentAttributionRow.test.tsx` — 5 new retry cases
- `tests/ai/ChatMessageListAttribution.test.tsx` — label assertions updated; 4 new remount/supersession cases
- `.planning/WINDOWS.md` — open entry #10 for the unperformed walkthrough

## Decisions Made

- Persisted `message.runStatus` is authoritative; `agentStatus` is a legacy fallback only. `TeamWorkspace.tsx` filters `TERMINAL` agents out of `snapshot.agents` (left intact), so the live map can never carry the status of the attempt a user needs to retry.
- Supersession is suppressed at the bubble gate only. `onRetry` expresses "this surface cannot retry" and nothing else — it never hides the label.
- The retry click is the only caller of `retryAssignment`; nothing in the render path or an effect starts a paid call (T-37-22/T-37-26 rely on the coordinator's in-flight guard).

## Deviations from Plan

**1. [Rule 3 - Blocking] Task 2's Tauri walkthrough could not be performed**
- **Found during:** Task 2
- **Issue:** Precondition unmet. No TaskMate app profile exists (`~/.local/share/com.personal.taskplanner` absent → no saved provider endpoint/API key), `src-tauri/target` is absent (no built binary), and no GUI-driving or screenshot tooling (`xdotool`, `xwd`, `import`, `scrot`) is installed. The plan's own `<behavior>` says the human-check is harvested at phase close, so this is recorded rather than checkpointed.
- **Fix:** None attempted. No code change can satisfy an observation gate; fabricating a pass would violate C-15.
- **Files modified:** `.planning/WINDOWS.md` (open defect-ledger entry #10)
- **Verification:** The precondition probes above are read-only and reproducible.
- **Committed in:** `5ee86cc3`

---

**Total deviations:** 1 (blocking/environmental, not a code deviation)
**Impact on plan:** Task 1 fully delivered. The phase's runtime-behavior gate is NOT closed by this plan and must be performed by a human in a real Tauri window (all six observations) before the phase can be considered verified.

## Issues Encountered

- First test run failed on `toBeEmptyDOMElement()` for `skipped`/`blocked`/`needs-input`: the row container renders (empty) rather than not rendering. The assertion was tightened to "no `.ant-tag`", which is what the label map actually promises. Fixed within task 1 before its commit.

## Walkthrough Results (task 2) — NOT PERFORMED

All six observations are **unperformed**, not passed:

1. Limit-2 batch with five assignments — **not performed**
2. Outbox queueing of a second message mid-batch — **not performed**
3. Per-agent stop on a queued agent — **not performed**
4. Global Stop mid-batch — **not performed**
5. "Chạy lại" on the stopped bubble — **not performed**
6. Delete the group mid-batch — **not performed**

Reason: no runnable Tauri profile with saved provider settings in this environment. These must be executed by a human in a real window; defect-ledger entry #10 tracks the gap.

## Verification

- `npx vitest run tests/components/ai/office/AgentAttributionRow.test.tsx tests/ai/ChatMessageListAttribution.test.tsx tests/services/ai/office/teamRunCoordinator.test.ts` — **PASS: 3 files, 102 tests** (focused run only; full suite deliberately not run per the user rule).
- `npx tsc --noEmit` — **PASS**, exit 0, zero `error TS` lines.
- `grep -n "onRetryAgent"` returns matches in all three threading files (`ChatMessageList.tsx`, `ChatMessageBubble.tsx`, `AiChatWidget.tsx`).
- Manual Tauri walkthrough — **not performed** (see above).

## Next Phase Readiness

- Retry is reachable end-to-end from the UI: persisted report row → bubble button → `coordinator.retryAssignment(assignmentId)`.
- **Open gate:** the six-observation Tauri walkthrough (D-27, C-15) is unverified. Phase 37 should not be closed on code reading alone — a human must run it.

## Self-Check: PASSED

- `src/components/ai/office/AgentAttributionRow.tsx` — FOUND
- `src/components/ai/ChatMessageBubble.tsx` — FOUND
- `tests/components/ai/office/AgentAttributionRow.test.tsx` — FOUND
- `tests/ai/ChatMessageListAttribution.test.tsx` — FOUND
- commit `6ced50d4` — FOUND
- commit `5ee86cc3` — FOUND
