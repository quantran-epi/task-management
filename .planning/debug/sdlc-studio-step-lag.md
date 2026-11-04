---
status: investigating
trigger: "pass, nhưng không hiểu sao vào sdlc studio khiến app bị lag rất nặng, chuyển step rất lag"
created: 2026-11-04T02:58:43Z
updated: 2026-11-04T03:49:00Z
---

## Current Focus

hypothesis: Native CPU trace identifies synchronous rankBM25 as dominant blocking task; document frequency is recomputed with full corpus scan for each document (quadratic corpus factor).
test: Trace CPU sample aggregation, before/after synthetic corpus benchmark, exact score parity, operation-budget regression.
expecting: Move query-term document frequencies outside document scoring loop; preserve all scores/ranks/evidence while removing repeated scans.
next_action: After explicitly requested commit/push, native retest same Step 3 to Step 4 transition; trace proves bottleneck, not yet verified responsiveness after fix.

## Symptoms

expected: Opening SDLC Studio and switching steps stays responsive in Tauri desktop.
actual: User reports severe app lag when entering SDLC Studio and switching steps.
errors: Not reported; unknown.
reproduction: Open SDLC Studio, switch steps in Tauri desktop during Phase 26 UAT.
timeline: Reported during Phase 26 UAT after Test 5 pass; onset and earlier performance unknown.

## Evidence

- timestamp: 2026-11-04 (native trace diagnosis)
  checked: /home/quantd/workspace/personal/task-management/docs/Trace-sdlc.json supplied by user for Step 3 to Step 4; 24594 trace events. Analyzed locally with python3 -I; trace not copied or published.
  found: Renderer main thread PID 22352/TID 30496 runs 2344.750ms task at ts 86269966652 (~1.300s after CPU profile start). Samples attribute 2329.3ms inclusive to minified IM at bundle index-CKBzgHml.js line 457 col 17282, called by k7e/local retrieval. Exact trace bundle absent locally, but neighboring function offsets map structurally to normalizeVietnamese/tokenize/rankBM25 in local dist bundle (symbols shifted by one); source confirms rankBM25 recalculates document frequency per scored document by rescanning all docs and tokens.
  implication: Actual native stall dominated by synchronous BM25 ranking; prior cancellation cannot interrupt an already running synchronous task.
- timestamp: 2026-11-04 (ranking fix validation)
  checked: Same synthetic 10KB/document corpus before/after hoisting document-frequency calculation once per query term; no worker/cache/dependency added.
  found: 200 docs 777ms to 106ms; 400 docs 3278ms to 142ms; 800 docs 14891ms to 311ms (local Node measurements, not native). Regression counts corpus includes scans 3200 to 80 for 40 docs/two query terms. Exact ranking/score parity passes 10 varied query/options cases against HEAD baseline. 63/63 tests in five suites and npx tsc --noEmit pass.
  implication: Minimal algorithm fix removes quadratic repeated scans without changing result formula. Native responsiveness still needs retest after new build; no commit/push requested yet.

- timestamp: 2026-11-04T07:59:03Z
  checked: Three-step rapid-vs-settled fixture using real collectWizardEvidence and runLocalGroundedRetrieval; agent reproduction and integrated main-checkout tests.
  found: Before cancellation fix rapid navigation reads [4,4,4] docs and ranks 3 times; after fix reads [1,1,4] and ranks once. Settled path ranks 3 times, with latest evidence identical to rapid path including ranges/hashes/snippets. Fix passes signal into local retrieval and checks abort before/after asynchronous reads and hashing. Collector maps canceled retrieval to existing ABORTED error rather than empty evidence.
  implication: Demonstrated stale-work overlap matching rapid-navigation condition, not proof of full native latency cause. Main checkout 56/56 tests in six suites and tsc --noEmit pass; jsdom pseudo-element warning only. In-flight read and synchronous rank cannot be preempted midway. No commit/push/build in this round.

- timestamp: 2026-11-04 (new reproduction constraint)
  checked: User comparison of rapid versus settled navigation.
  found: "tôi có 1 phát hiện mới, nếu chuyển bước nhanh thì lag, còn chuyển sang bước rồi, để khoảng 2s rồi chuyển bước khác thì phản hồi tức thì"
  implication: Prioritize overlapping pending work and cleanup over steady-state mount cost. No root cause confirmed. Navigation sets selected step immediately; evidence cleanup aborts controller but local BM25 dependency accepts no signal and continues all note reads/ranking before cancellation is checked.

- timestamp: 2026-11-04 (round 3)
  checked: User retest after staging push 2ae522c6.
  found: "không cải thiện tí nào"
  implication: Neither round improved native symptom; require real native Performance trace before any further speculative production fix. Verified UI entry: AI drawer menu > Nhật ký gỡ lỗi AI > Mở Tauri DevTools.

- timestamp: 2026-11-04 (round 2)
  checked: Agent timing probes and mount-path inspection in isolated worktree; integrated into main checkout.
  found: navigateToStep with 10MB history blocks handler only 0-15ms; renderSafeMarkdown 100-500KB costs 23-104ms. ChatInputBar reads entire tasks and projects tables on every chat mount (~600ms at 1000 rows each); useStepChatToolbox runs fetchAvailableModels network request per step chat mount. Both gated to actual use (mention typing, manual refresh). Integrated regressions 31/31 pass; tsc --noEmit pass.
  implication: Measured mount waste removed; jsdom cannot reproduce multi-second native delay. Root cause of user-visible lag not yet proven; next step is native profiling if retest still lags.

- timestamp: 2026-11-04
  checked: User retest following staging push ec376a71.
  found: "chuyển step vẫn rất lag, chưa cải thiện tí nào"
  implication: Prior code-level waste fixes did not improve observed symptom. Reopen investigation; do not claim cause identified or responsiveness fixed.

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
