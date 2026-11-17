# Phase 44: Agent Activity Panel, Configurable Explore Timeout and Prompt Log - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-17
**Phase:** 44-Agent Activity Panel, Configurable Explore Timeout and Prompt Log
**Areas discussed:** explore timeout, activity data contract, panel UI/placement, prompt-log migration, quality gates
**Mode:** autonomous selection from owner-approved scope and draft (no interactive questions in this pass)

---

## Explore timeout

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed 300s | Leave the Phase 43 constant unchanged | |
| Per-call 60..900s, default 300 | Add `timeoutSeconds` to `explore_repo`, clamp invalid input, keep JS watchdog | ✓ |
| Global setting | Add a persisted settings row/profile knob | |

**User's choice:** Per-call range with the existing default; owner asked for one phase and "chuẩn chỉ, không vá víu".
**Notes:** The remote `timeout(1)` command remains forbidden; macOS portability and late-cancel are inherited from Phase 43 review fixes.

## Activity data contract

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse `AgentLiveStep`, add call/result fields | Additive runtime-only extension; upsert by tool event id | ✓ |
| New persisted Dexie event table | Durable history with backup schema changes | |
| Reuse chat drawer events only | No office-path state; panel cannot show team agents | |

**User's choice:** Reuse and extend the office runtime state.
**Notes:** Result events are currently discarded in `teamRunCoordinator.ts`; consuming both phases is the core data fix.

## Panel UI and placement

| Option | Description | Selected |
|--------|-------------|----------|
| Third pane in existing Splitter | Right rail beside transcript, matching the approved draft and `AgentControlView` | ✓ |
| Ant Design Drawer/modal | Separate overlay; hides transcript while inspecting | |
| Inline badges only | Keep current sparse popover/badges | |

**User's choice:** Right-side collapsible rail per approved HTML draft.
**Notes:** UI-SPEC remains required before planning.

## Prompt log migration

| Option | Description | Selected |
|--------|-------------|----------|
| Move debugLogs into rail tab; remove modal/menu | Keep data, change surface | ✓ |
| Delete debug prompt capture entirely | Removes ability to inspect exact prompt sent to AI | |
| Keep modal and add duplicate tab | Two surfaces for the same data | |

**User's choice:** Move and remove the old modal/menu; do not touch the ordinary chat `AIDebugModal`.

## Quality gates and push

| Option | Description | Selected |
|--------|-------------|----------|
| Full review + verify; fix all critical/warning; push once | One phase, then a single push to `feature/intellij-workbench` | ✓ |
| Ship immediately, fix findings later | Faster but violates owner's zero-finding requirement | |
| Split into multiple phases/quick tasks | Explicitly rejected by owner | |

**User's choice:** One phase and one final push.

## Claude's Discretion

Exact component names, final Vietnamese microcopy, AntD Tabs vs accessible custom strip, and whether the compact activity popover remains as a fallback.

## Deferred Ideas

- Streaming nested remote Claude Code tool steps.
- Persisted inspection history across app restarts.
- Replacing the chat drawer's `AIDebugModal`.
