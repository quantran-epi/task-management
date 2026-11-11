---
schema_version: 1
open_count: 7
waived_count: 0
fixed_count: 0
total_count: 7
last_updated: 2026-11-11T20:55:12.237Z
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
  }
]
````
