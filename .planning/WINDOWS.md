---
schema_version: 1
open_count: 16
waived_count: 0
fixed_count: 0
total_count: 16
last_updated: 2026-11-20T09:12:06.751Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 26 | unrun-verify | src/components/sdlc/chat/StepChatPanel.tsx |  | Manual Tauri visual verification remains pending; no interactive desktop session exercised. | open |  | 2026-11-03T12:42:45.160Z |  |
| 2 | 26 | deviation | tests/unit/sdlc/ProjectSdlcView.test.tsx |  | View regression intermittently fails in historical SOLUTION/card tests: disabled approval at line 452 or missing artifact card; task-one run passed, final combined verification failed. | open |  | 2026-11-03T12:43:27.727Z |  |
| 3 | 26 | unrun-verify | .planning/phases/26-sdlc-prompt-grounding-tool-use-policy/26-VALIDATION.md |  | Full npm test suite not run: current plan uses focused desktop-safe tests; full suite includes out-of-scope PWA verification. | open |  | 2026-11-03T12:43:27.896Z |  |
| 4 | 37 | stub | src/services/ai/office/teamRunCoordinator.ts | 262 | openBatchId is always null in 37-02, so dispose()'s closeBatch is a no-op until 37-03 task 1 wires the batch producers | open |  | 2026-11-11T19:20:56.993Z |  |
| 5 | 37 | stub | src/services/ai/office/teamRunCoordinator.ts | 264 | assignmentControllers has no producers until 37-04 task 1 wires per-assignment AbortControllers; dispose()'s abort-all is proven directly in tests | open |  | 2026-11-11T19:20:57.170Z |  |
| 6 | 37 | deviation | tests/views/TeamsView.test.tsx |  | Pre-existing unhandled DatabaseClosedError rejections (7-8 per run) in TeamsView suite; tests themselves pass, reproduced on base 6a2e736e | open |  | 2026-11-11T20:55:11.959Z |  |
| 7 | 37 | deviation | src/services/ai/office/teamRunCoordinator.ts |  | Scheduler admission is gated, so tests must wait on admission/running facts instead of fixed counts; three pre-existing coordinator tests were made deterministic | open |  | 2026-11-11T20:55:12.237Z |  |
| 8 | 37 | unrun-verify | tests/workbench/AiExplorers.test.tsx |  | Pre-existing flake: renders AiOfficeExplorer and AiStaffExplorer on one DB; one of four runs reported duplicate lead label. Unrelated to 37-06 delete path. | open |  | 2026-11-11T21:12:38.532Z |  |
| 9 | 37 | skipped-test | tests/services/ai/office/teamRunCoordinator.test.ts | 768 | pauses one agent at 80% flakes ~3/4 runs (expected undefined to be 'running'); reproduces on base 86de027c without this plan's changes | open |  | 2026-11-11T21:35:45.233Z |  |
| 10 | 37 | unrun-verify |  |  | 37-08 task 2: six-observation Tauri walkthrough not performed (headless executor, no observable GUI window) | open |  | 2026-11-11T21:39:49.442Z |  |
| 11 | 28 | unrun-verify | tests/ai/AIChatDrawerGroundedWiring.test.tsx |  | 6 pre-existing drawer wiring tests fail at stock HEAD in isolated worktree (React/dnd-kit useMemo null / DatabaseClosedError); documented in deferred-items.md, not caused by 28-04 | open |  | 2026-11-17T08:05:54.170Z |  |
| 12 | quick-261118-c0y | unrun-verify | tests/views/SettingsView.test.tsx |  | Pre-existing intermittent DatabaseClosedError unhandled rejection from McpConfigCard on DB close; reproduces at pristine HEAD independent of this plan. Out of scope. | open |  | 2026-11-18T02:03:33.414Z |  |
| 13 | quick-261118-cz2 | unrun-verify | src-tauri/Cargo.toml |  | cargo check blocked by sandbox proxy (bit-vec v0.8.0 download); Rust compile unverified in this environment | open |  | 2026-11-18T03:20:22.976Z |  |
| 14 | quick-261118-cz2 | deviation | tests/services/ai/office/teamRunCoordinator.test.ts |  | 4 timing-sensitive scheduler/R6 tests fail on baseline HEAD (pre-existing, out of scope) | open |  | 2026-11-18T03:20:23.156Z |  |
| 15 | 46.1 | deviation | src/workbench/search/find/FindInRemoteFiles.tsx |  | Plan 02: file-mask icon button had no onClick; wired to focus mask input (Rule 1 fix) | open |  | 2026-11-20T09:12:06.486Z |  |
| 16 | 46.1 | deviation |  |  | Plan 02 verify commands use vitest -x which Vitest 5 rejects; used --bail=1 | open |  | 2026-11-20T09:12:06.751Z |  |

````json
[
  {
    "id": 1,
    "kind": "unrun-verify",
    "phase": "26",
    "file": "src/components/sdlc/chat/StepChatPanel.tsx",
    "line": null,
    "description": "Manual Tauri visual verification remains pending; no interactive desktop session exercised.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-11-03T12:42:45.160Z",
    "resolved_at": null,
    "milestone": "v1.3"
  },
  {
    "id": 2,
    "kind": "deviation",
    "phase": "26",
    "file": "tests/unit/sdlc/ProjectSdlcView.test.tsx",
    "line": null,
    "description": "View regression intermittently fails in historical SOLUTION/card tests: disabled approval at line 452 or missing artifact card; task-one run passed, final combined verification failed.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-11-03T12:43:27.727Z",
    "resolved_at": null,
    "milestone": "v1.3"
  },
  {
    "id": 3,
    "kind": "unrun-verify",
    "phase": "26",
    "file": ".planning/phases/26-sdlc-prompt-grounding-tool-use-policy/26-VALIDATION.md",
    "line": null,
    "description": "Full npm test suite not run: current plan uses focused desktop-safe tests; full suite includes out-of-scope PWA verification.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-11-03T12:43:27.896Z",
    "resolved_at": null,
    "milestone": "v1.3"
  },
  {
    "id": 4,
    "kind": "stub",
    "phase": "37",
    "file": "src/services/ai/office/teamRunCoordinator.ts",
    "line": 262,
    "description": "openBatchId is always null in 37-02, so dispose()'s closeBatch is a no-op until 37-03 task 1 wires the batch producers",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-11-11T19:20:56.993Z",
    "resolved_at": null,
    "milestone": "v1.4"
  },
  {
    "id": 5,
    "kind": "stub",
    "phase": "37",
    "file": "src/services/ai/office/teamRunCoordinator.ts",
    "line": 264,
    "description": "assignmentControllers has no producers until 37-04 task 1 wires per-assignment AbortControllers; dispose()'s abort-all is proven directly in tests",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-11-11T19:20:57.170Z",
    "resolved_at": null,
    "milestone": "v1.4"
  },
  {
    "id": 6,
    "kind": "deviation",
    "phase": "37",
    "file": "tests/views/TeamsView.test.tsx",
    "line": null,
    "description": "Pre-existing unhandled DatabaseClosedError rejections (7-8 per run) in TeamsView suite; tests themselves pass, reproduced on base 6a2e736e",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-11-11T20:55:11.959Z",
    "resolved_at": null,
    "milestone": "v1.4"
  },
  {
    "id": 7,
    "kind": "deviation",
    "phase": "37",
    "file": "src/services/ai/office/teamRunCoordinator.ts",
    "line": null,
    "description": "Scheduler admission is gated, so tests must wait on admission/running facts instead of fixed counts; three pre-existing coordinator tests were made deterministic",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-11-11T20:55:12.237Z",
    "resolved_at": null,
    "milestone": "v1.4"
  },
  {
    "id": 8,
    "kind": "unrun-verify",
    "phase": "37",
    "file": "tests/workbench/AiExplorers.test.tsx",
    "line": null,
    "description": "Pre-existing flake: renders AiOfficeExplorer and AiStaffExplorer on one DB; one of four runs reported duplicate lead label. Unrelated to 37-06 delete path.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-11-11T21:12:38.532Z",
    "resolved_at": null,
    "milestone": "v1.4"
  },
  {
    "id": 9,
    "kind": "skipped-test",
    "phase": "37",
    "file": "tests/services/ai/office/teamRunCoordinator.test.ts",
    "line": 768,
    "description": "pauses one agent at 80% flakes ~3/4 runs (expected undefined to be 'running'); reproduces on base 86de027c without this plan's changes",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-11-11T21:35:45.233Z",
    "resolved_at": null,
    "milestone": "v1.4"
  },
  {
    "id": 10,
    "kind": "unrun-verify",
    "phase": "37",
    "file": "",
    "line": null,
    "description": "37-08 task 2: six-observation Tauri walkthrough not performed (headless executor, no observable GUI window)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-11-11T21:39:49.442Z",
    "resolved_at": null,
    "milestone": "v1.4"
  },
  {
    "id": 11,
    "kind": "unrun-verify",
    "phase": "28",
    "file": "tests/ai/AIChatDrawerGroundedWiring.test.tsx",
    "line": null,
    "description": "6 pre-existing drawer wiring tests fail at stock HEAD in isolated worktree (React/dnd-kit useMemo null / DatabaseClosedError); documented in deferred-items.md, not caused by 28-04",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-11-17T08:05:54.170Z",
    "resolved_at": null,
    "milestone": "v1.4"
  },
  {
    "id": 12,
    "kind": "unrun-verify",
    "phase": "quick-261118-c0y",
    "file": "tests/views/SettingsView.test.tsx",
    "line": null,
    "description": "Pre-existing intermittent DatabaseClosedError unhandled rejection from McpConfigCard on DB close; reproduces at pristine HEAD independent of this plan. Out of scope.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-11-18T02:03:33.414Z",
    "resolved_at": null,
    "milestone": "v1.4"
  },
  {
    "id": 13,
    "kind": "unrun-verify",
    "phase": "quick-261118-cz2",
    "file": "src-tauri/Cargo.toml",
    "line": null,
    "description": "cargo check blocked by sandbox proxy (bit-vec v0.8.0 download); Rust compile unverified in this environment",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-11-18T03:20:22.976Z",
    "resolved_at": null,
    "milestone": "v1.4"
  },
  {
    "id": 14,
    "kind": "deviation",
    "phase": "quick-261118-cz2",
    "file": "tests/services/ai/office/teamRunCoordinator.test.ts",
    "line": null,
    "description": "4 timing-sensitive scheduler/R6 tests fail on baseline HEAD (pre-existing, out of scope)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-11-18T03:20:23.156Z",
    "resolved_at": null,
    "milestone": "v1.4"
  },
  {
    "id": 15,
    "kind": "deviation",
    "phase": "46.1",
    "file": "src/workbench/search/find/FindInRemoteFiles.tsx",
    "line": null,
    "description": "Plan 02: file-mask icon button had no onClick; wired to focus mask input (Rule 1 fix)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-11-20T09:12:06.486Z",
    "resolved_at": null,
    "milestone": "v1.4"
  },
  {
    "id": 16,
    "kind": "deviation",
    "phase": "46.1",
    "file": "",
    "line": null,
    "description": "Plan 02 verify commands use vitest -x which Vitest 5 rejects; used --bail=1",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-11-20T09:12:06.751Z",
    "resolved_at": null,
    "milestone": "v1.4"
  }
]
````
