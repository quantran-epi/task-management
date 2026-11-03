---
phase: 26-sdlc-prompt-grounding-tool-use-policy
plan: 04
subsystem: ai
status: complete
tags: [tool-loop, runtime, react, antd, vitest]
requires:
  - phase: 26-02
    provides: Per-step tool-policy and payload alignment
  - phase: 26-03
    provides: Explicit artifact intents and prerequisite guards
provides:
  - Default 50-round ceiling stopping before final pending tool dispatch without synthesis
  - Runtime-only tool-limit terminal outcome with sanitized count and retained audit events
  - Neutral stopped widget tag, warning count, retry, 12px tool details and idle drawer mapping
affects: [27-artifact-tools, shared-chat-runtime]
tech-stack:
  added: []
  patterns: [terminal-before-persistence, retained-runtime-tool-audit]
key-files:
  created: []
  modified:
    - src/services/ai/aiOrchestratorLoop.ts
    - src/components/ai/runtime/chatTurnRuntime.ts
    - src/components/ai/runtime/useChatTurn.ts
    - src/components/ai/AiChatWidget.tsx
    - src/components/ai/AIChatDrawer.tsx
    - src/components/sdlc/chat/StepChatPanel.tsx
    - tests/services/ai/aiOrchestratorLoop.test.ts
    - tests/ai/chatTurnRuntime.test.ts
    - tests/ai/AiChatWidget.test.tsx
    - tests/ai/useChatTurn.test.tsx
    - tests/ai/AIChatDrawer.test.tsx
key-decisions:
  - Normalize finite positive round overrides by flooring and clamping to one; invalid values use 50.
  - Preserve existing user CRLF bytes while staging LF-only implementation hunks.
  - Keep drawer tool_limit metadata debug-only; terminal widget warning is not an error card.
requirements-completed: [SDLC-PR-06]
commits: 2
plan_head_before: e3f8ec131d67bc8dddfab407da505b428c6e0979
plan_head_after: 0f6ed478b4f2919065f2400f43be271bd84d2a67
actuals:
  tokens: 8260
  tasks: 2
  commits: 2
duration: 27 min
completed: 2026-11-03
coverage:
  - id: D1
    description: Bounded loop and runtime-only terminal persistence gate
    requirement: SDLC-PR-06
    verification:
      - kind: unit
        ref: /tmp/phase26-04-task1-tests.log
        status: pass
    human_judgment: false
  - id: D2
    description: Stopped widget, retry, audit details and drawer idle/debug-only outcome
    requirement: SDLC-PR-06
    verification:
      - kind: automated_ui
        ref: /tmp/phase26-04-green-regression.log
        status: pass
      - kind: automated_ui
        ref: /tmp/phase26-04-drawer-limit-seeded.log
        status: pass
    human_judgment: false
  - id: D3
    description: Manual Tauri visual, focus and streaming verification
    requirement: SDLC-PR-06
    verification: []
    human_judgment: true
    rationale: Native desktop interaction and narrow-layout visual checks were not run.
---

# Phase 26 Plan 04: Bounded Tool Rounds and Visible Stop Summary

**Tool use stops before the ceiling batch at 50 rounds, never synthesizes or persists limited output, and retains auditable tool activity with a neutral stopped state and retry.**

## Performance

- Started: 2026-11-03T13:09:36Z
- Finished implementation/checks: 2026-11-03T13:36:17Z
- Tasks: 2/2 implemented and committed
- Files changed: 11 implementation/test files
- Plan commits above are measured before this separate summary commit.

## Task Commits

1. `200a7a3a` — feat(26-04): bound tool rounds and stop limited turns before persistence
2. `0f6ed478` — feat(26-04): show stopped tool rounds with retained audit and retry

Both commits end with `Co-Authored-By: Claude Code <noreply@anthropic.com>`.

## Accomplishments

- Exported `DEFAULT_MAX_TOOL_ROUNDS = 50`; normalized overrides; returned non-optional `loopLimitReached`; stopped before final pending dispatch and skipped synthesis. Length truncation remains independent.
- Runtime publishes terminal `tool-limit`, exposes normalized rounds, returns sanitized `tool_limit` metadata, skips error/completion callbacks and assistant persistence, and supports retry with the original user row.
- Widget renders exact Vietnamese neutral stop tag and warning/count/retry, hides partial text and staged loader, enables input, retains merged tool audit events, and raises tool details to 12px.
- Drawer maps terminal status to idle, clears partial buffers, records only debug `tool_limit` metadata and forwards rounds. StepChatPanel adds only the rounds snapshot; dynamic policy and artifact-intent wiring remain intact.

## Verification Results

| Check | Result | Evidence |
|---|---|---|
| Task 1 loop/runtime tests | PASS, 65/65 | `/tmp/phase26-04-task1-tests.log` |
| Core + 26-02/26-03 policy/artifact queue regression, 8 files | PASS, 170/170 | `/tmp/phase26-04-green-regression.log` |
| New drawer terminal integration, seeded durable tab | PASS, 1 selected test; 31 unselected | `/tmp/phase26-04-drawer-limit-seeded.log` |
| Required five-file focused command | FAIL, 113 passed / 11 failed; all failures in existing drawer tests | `/tmp/phase26-04-focused-final.log` |
| Untouched baseline drawer suite via temporary pre-load plugin | FAIL, 21 passed / 10 failed | `/tmp/phase26-04-drawer-baseline.log` |
| Baseline debug test alone | FAIL, expected debug turn count > 0, received 0 | `/tmp/phase26-04-debug-baseline.log` |
| Extra artifact-budget regression | FAIL, 3 passed / 6 failed; exact six failures also on baseline | `/tmp/phase26-04-budget-baseline.log`, `/tmp/phase26-04-regression-final.log` |
| `./node_modules/.bin/tsc --noEmit` | PASS, exit 0 | `/tmp/phase26-04-tsc-final.log` |
| `TAURI_ENV_PLATFORM=linux ./node_modules/.bin/vite build --outDir /tmp/phase26-04-desktop-dist` | PASS, exit 0, no generated service worker | `/tmp/phase26-04-desktop-build-final.log` |
| Committed diff whitespace | PASS | `git diff e3f8ec13..HEAD --check` |
| Manual Tauri/native visual check | NOT RUN | Pending end-of-phase verification |

The required focused suite is NOT green. Drawer failure membership varies between runs (initially 9 failures, finally 11). Baseline reproduces mutation approval, empty reply, automatic mutation, tool-error, clarification, bootstrap and isolated debug failures. This is evidence of pre-existing test instability, not proof that every varying failure is unrelated. No unrelated drawer behavior or assertions were changed to hide failures.

Build warnings remain: large chunks and ineffective dynamic imports for DB/Tauri modules. Native Rust/package build was not run; successful build is desktop-targeted frontend only. Full repository suite was not run. No PWA/GitHub Pages checks were added.

## Deviations from Plan

- Preserved user dirty state: 1,939 dirty paths existed before changes, including CRLF-only differences in scope. Saved original bytes outside the repo, restored their line-ending convention after edits, and staged implementation-only LF hunks with `git apply --cached`. Final dirty path set remains exactly 1,939, no new/lost dirty paths, index empty after task commits.
- [Rule 1 - Bug] Integration regression exposed older StepChatPanel mocks without `getToolLimitRounds`; optional method access preserves those existing host adapters without changing their tests. Verified artifact queue/tool-policy regression in the 170-test passing run. Commit: `0f6ed478`.
- Adapted existing synthesis test fixture to reach synthesis through a tool round followed by an empty response, rather than using exhausted `maxLoops: 1` (now intentionally stops). Existing payload/maxTokens/truncation assertions retained.
- New drawer terminal test seeds its durable tab before send to avoid pre-existing first-send bootstrap timing. Production bootstrap code unchanged.
- Used installed local binaries, not npx. Desktop output redirected to `/tmp` so existing user `dist` content stays untouched.
- Per explicit execution boundary, no STATE.md, ROADMAP.md, REQUIREMENTS.md, WINDOWS.md or other shared tracking writes. No phase completion performed.

## Deferred Issues

- Existing drawer focused suite failures require separate investigation; final five-file result remains 11 failures. Logs above retain exact failing names and traces.
- Existing artifact-budget tests fail before model invocation or expected handoff; all six failures reproduce on original baseline modules. Left unchanged.
- Manual Tauri check pending: force a low controlled override, inspect neutral tag, count/retry, retained tool list, no assistant bubble, enabled composer, keyboard focus and minimum 12px Phase 26 text.
- Library documentation lookup unavailable: ctx7 absent; official Ant Design docs returned HTTP 403. Installed Ant Design Alert declaration confirms `title`, `type` and `action`; TypeScript and component tests pass. No package installed.

## Known Stubs

None introduced. No added TODO/FIXME/coming-soon marker or mock-data production wiring. Existing `placeholder` props are input hints, not incomplete functionality.

## Threat Review

Existing mitigations covered: bounded provider rounds, no ceiling dispatch, no synthesis/persistence on limit, static count-only alert, and retained tool audit. No new endpoint, auth path, schema or file-access trust boundary introduced.

## Self-Check: PASSED

- All 11 changed implementation/test files exist.
- Task commits `200a7a3a` and `0f6ed478` exist as ancestors of HEAD.
- Commit count measured from persisted plan ledger: 2.
- No task commit deletes tracked files.
- No new/lost dirty paths; all 1,939 original dirty paths preserved.
- Validation gaps explicitly recorded; self-check does not claim the full focused suite passed.

## Handoff

Implementation complete; automated core checks pass. Required full focused drawer suite and manual Tauri verification remain gaps. Coordinator owns shared tracking and phase-level verification/completion.
