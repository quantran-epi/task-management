---
status: awaiting_human_verify
trigger: "pass, nhưng không hiểu sao vào sdlc studio khiến app bị lag rất nặng, chuyển step rất lag"
created: 2026-11-04T02:58:43Z
updated: 2026-11-04T03:49:00Z
---

## Current Focus

hypothesis: Two avoidable-work paths reproduced and fixed; native severity remains unverified.
test: Integrated performance regressions and adjacent view tests, plus TypeScript check.
expecting: Closed picker does not scan Notes/projects; evidence retrieval waits for thread scope matching selected project/CR/step.
next_action: Verify same CR/data on Tauri after user requests commit/push/build; do not mark resolved until user confirms responsiveness.

## Symptoms

expected: Opening SDLC Studio and switching steps stays responsive in Tauri desktop.
actual: User reports severe app lag when entering SDLC Studio and switching steps.
errors: Not reported; unknown.
reproduction: Open SDLC Studio, switch steps in Tauri desktop during Phase 26 UAT.
timeline: Reported during Phase 26 UAT after Test 5 pass; onset and earlier performance unknown.

## Evidence

- timestamp: 2026-11-04T02:58:43Z
  checked: Phase 26 UAT Test 5 response.
  found: User passed artifact-action/focus checks and separately reported severe Studio-entry/step-switch lag. No native trace supplied.
  implication: Preserve Test 5 pass; pause UAT before Test 6.
- timestamp: 2026-11-04T03:35:00Z
  checked: Isolated debug agent handoff and reviewed patch/tests.
  found: Step1IntakeView loads notes/projects with picker closed. ProjectSdlcView starts evidence retrieval while selected step still owns previous thread, then retries after new thread resolves. Agent reported all four regressions fail when fixes removed and pass when restored; 43/43 adjacent tests pass in isolated worktree.
  implication: Two deterministic waste paths; not proof of complete native-lag explanation.
- timestamp: 2026-11-04T03:49:00Z
  checked: Main checkout after minimal patch application preserving unrelated edits and CRLF files.
  found: TAURI_PLATFORM=linux npx vitest run tests/unit/sdlc/ProjectSdlcPerformance.test.tsx tests/unit/sdlc/ProjectSdlcView.test.tsx passes 16/16 tests across 2 files. npx tsc --noEmit passes. git diff --check flags existing CRLF as trailing whitespace; with core.whitespace=cr-at-eol check passes. jsdom warns pseudo-element getComputedStyle is unimplemented.
  implication: Integrated regression/type checks pass; real Tauri performance still requires human verification.

## Eliminated

- hypothesis: Runtime recreated continuously or artifact auto-generated when step mounts.
  evidence: Agent inspected step/chat lifecycle and reported no such loop; adjacent lifecycle tests pass. Not native profiling evidence.

## Resolution

root_cause:
  - Closed Step1 Notes picker eagerly reads entire notes/project corpus.
  - Evidence effect can start with previous step thread during asynchronous step-thread resolution.
fix: Gate picker queries by notePickerOpen; keep step thread ID/scope together and require matching scope before evidence collection. Stabilize existing approval test by awaiting CR restore and checking editor stays connected. Add four operation-count regressions.
verification:
  integrated_tests: 16/16 passed in main checkout
  typecheck: passed
  whitespace: passed with existing CRLF treated as line endings
  agent_adjacent_tests: 43/43 reported passed
  agent_full_sdlc_baseline: 157/160 passed before fix; retry 158/160, baseline failures separate from scoped regression checks
  native_uat: not_run
  human_confirmed: false
  build: not_run
  commit_push: not_run
files_changed:
  - src/components/sdlc/steps/Step1IntakeView.tsx
  - src/views/ProjectSdlcView.tsx
  - tests/unit/sdlc/ProjectSdlcPerformance.test.tsx
  - tests/unit/sdlc/ProjectSdlcView.test.tsx

## Prevention

recurrence_guard: Four tests cover empty/nonempty closed-picker reads and immediate/deferred matching-thread retrieval.
