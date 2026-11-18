---
phase: 30-automatic-change-pack-packaging-drift-reconciliation
plan: "03"
subsystem: ui
tags: [antd, react, alert, drift, ssh, change-pack, tauri]

requires:
  - phase: 30-02
    provides: Step 4 snapshot card, packaging stepper, MultiPack commit path, manual fallback accordion
  - phase: 30-01
    provides: createChangePackFromSnapshot warnings for remote HEAD drift and dirty working tree
  - phase: 29-ssh-remote-repository-branch-diff-review
    provides: checkHeadDrift, getProjectRepoSshBinding, BranchSnapshot approval handoff

provides:
  - Remote HEAD drift gate that pauses packaging until the user confirms or returns to Step 3
  - Dedicated dirty-working-tree info banner that never blocks packaging
  - SSH failure banner with "Thử lại kết nối" retry plus automatic manual-dropzone expansion
  - Missing-snapshot banner CTA to Step 3 backed by auto-open fallback

affects: [step-4-change-pack, sdlc-workflow, phase-31]

tech-stack:
  added: []
  patterns:
    - Pre-flight drift check with explicit user confirmation gate before remote packaging
    - Split packager warnings into a typed info banner vs. residual warning list

key-files:
  created: []
  modified:
    - src/components/sdlc/steps/Step4ChangePackView.tsx
    - src/components/sdlc/steps/__tests__/Step4ChangePackView.test.tsx

key-decisions:
  - Drift confirmation is a warning Alert with two explicit buttons instead of Modal.confirm, so the state stays readable and testable without portal mocking.
  - Dirty-tree detection matches the packager's own warning copy ("tệp chưa commit") and re-routes it to an info banner, keeping the warning list free of duplicated text.
  - Retry re-enters handlePackageFromSnapshot with the persisted driftConfirmed flag so a confirmed drift is not re-prompted on retry.
  - Retry action is scoped to the snapshot packaging path only; manual upload errors keep the plain closable alert.

requirements-completed: [SDLC-REPO-04, SDLC-REPO-05, SDLC-REPO-07]

coverage:
  - id: D1
    description: Missing approved snapshot shows warning banner with "Quay lại Bước 3: Duyệt nhánh" CTA that navigates to CODE_GUIDE, and the manual fallback stays open
    requirement: SDLC-REPO-04
    verification:
      - kind: integration
        ref: src/components/sdlc/steps/__tests__/Step4ChangePackView.test.tsx#navigates to Step 3 from the missing-snapshot banner and keeps the manual fallback open
        status: pass
      - kind: integration
        ref: src/components/sdlc/steps/__tests__/Step4ChangePackView.test.tsx#renders missing-snapshot warning and no packaging CTA when snapshot absent
        status: pass
    human_judgment: false
  - id: D2
    description: Drifted remote HEAD pauses packaging and offers "Tiếp tục với commit đã duyệt" (packages the approved SHA) or "Quay lại Bước 3 duyệt lại"
    requirement: SDLC-REPO-05
    verification:
      - kind: integration
        ref: src/components/sdlc/steps/__tests__/Step4ChangePackView.test.tsx#warns about remote drift and packages the approved commit only after confirmation
        status: pass
      - kind: integration
        ref: src/components/sdlc/steps/__tests__/Step4ChangePackView.test.tsx#returns to Step 3 when the user rejects the drifted remote HEAD
        status: pass
    human_judgment: false
  - id: D3
    description: Dirty remote working tree shows an info banner explaining the pack covers the approved Base..Head range, and packaging still commits the pack
    requirement: SDLC-REPO-05
    verification:
      - kind: integration
        ref: src/components/sdlc/steps/__tests__/Step4ChangePackView.test.tsx#shows a dirty-tree info notice without failing packaging
        status: pass
    human_judgment: false
  - id: D4
    description: SSH connection/packaging failure shows the error banner with a "Thử lại kết nối" button, auto-opens the manual dropzone, and retry re-invokes packaging
    requirement: SDLC-REPO-07
    verification:
      - kind: integration
        ref: src/components/sdlc/steps/__tests__/Step4ChangePackView.test.tsx#offers a retry and opens the manual fallback when SSH packaging fails
        status: pass
      - kind: integration
        ref: src/components/sdlc/steps/__tests__/Step4ChangePackView.test.tsx#opens the manual fallback and reports an error when SSH binding is missing
        status: pass
    human_judgment: false
  - id: D5
    description: Drift gate against a real remote branch (network behaviour, timeout experience, retry UX on a live SSH target)
    requirement: SDLC-REPO-04
    verification: []
    human_judgment: true
    rationale: Component tests mock checkHeadDrift and createChangePackFromSnapshot; real SSH latency, timeout copy and keyring prompts can only be confirmed against a configured desktop target.

actuals:
  tokens: 4260
  tasks: 2
  commits: 2
plan_head_before: 4c9ac0e1c9416b4ca9029f6a72724487e7c4c7c2
plan_head_after: b0795ed1
duration: 9min
completed: 2026-11-06
status: complete
---

# Phase 30 Plan 03: Step 4 Drift & Failure Resilience Summary

**Step 4 now gates packaging on a remote HEAD drift confirmation, reports a dirty working tree as a non-blocking info banner, and turns SSH failures into a retryable error state that opens the manual zip fallback automatically.**

## Performance

- Started: 2026-11-06T08:54:00Z (approx.)
- Completed: 2026-11-06T09:03:38Z
- Duration: ~9 minutes
- Tasks: 2/2
- Files changed: 2
- Actual tokens: realized diff characters (17038) divided by four, rounded up; not model usage.
- Commit count: measured with `git rev-list --count <plan_head_before>..HEAD` = 2.

## Accomplishments

- `checkHeadDrift` is now called before any remote file collection when the snapshot carries a target branch and approved SHA. On drift the UI renders a warning Alert (`data-testid="drift-warning"`) naming both SHAs and offers exactly two routes: continue with the approved commit, or return to Step 3 (`onNavigateToStep('CODE_GUIDE')`) (D-08).
- Confirmation is sticky for the retry path: `driftConfirmed` is set on confirm, and `handleRetryConnection` re-enters packaging with that flag so the user is not asked twice (D-08).
- The packager's dirty-tree warning is detected by its own copy and promoted to a dedicated `type="info"` Alert clarifying that the pack is built from the approved `$BASE..$HEAD` range; packaging continues and the pack still commits (D-09). Remaining packager warnings keep the existing warning-list Alert.
- SSH failures (missing binding/config, timeout, non-zero remote exit) now set a retry flag, render the error Alert with a "Thử lại kết nối" action, and auto-expand the manual dropzone (D-11). Error prefix changed to `Lỗi kết nối SSH hoặc đóng gói: …` to match the UI-SPEC error copy.
- Missing-snapshot banner CTA and auto-open fallback behaviour (D-03) are unchanged and now covered by an explicit navigation assertion.
- Retry action is only attached to the snapshot packaging failure path; manual-upload errors keep the plain closable alert, so the retry control never appears for an unrelated validation error.

## Task Commits

Each task was committed atomically:

1. **Task 1: Missing snapshot CTA, remote drift handling & SSH failure auto-expansion** - `c04b3244` (feat)
2. **Task 2: End-to-end edge case integration tests for Step 4 resilience** - `b0795ed1` (test)

Plan metadata is committed separately after this summary's self-check.

## Files Created/Modified

- `src/components/sdlc/steps/Step4ChangePackView.tsx`: drift pre-check + confirmation Alert, dirty-tree info banner, retryable SSH error state, retry/confirm/return handlers.
- `src/components/sdlc/steps/__tests__/Step4ChangePackView.test.tsx`: five new drift/resilience tests plus `checkHeadDrift` default mock in the existing auto-package suite.

## Verification

- Task 1 plan gate: `TAURI_ENV_PLATFORM=linux node ../../../node_modules/vitest/vitest.mjs run src/components/sdlc/steps/__tests__/Step3CodeGuideView.test.tsx` — **10/10 passed**, exit 0.
- Task 2 plan gate: same runner on `src/components/sdlc/steps/__tests__/Step4ChangePackView.test.tsx` — **10/10 passed**, exit 0.
- Regression check on the packager contract: `src/services/__tests__/changePackPackager.test.ts` — **25/25 passed**, exit 0.
- `tsc --noEmit -p tsconfig.json`: zero diagnostics in `Step4ChangePackView.tsx` or its test file. Remaining project diagnostics are pre-existing ancestor-`node_modules` gaps (`@dnd-kit/*` unresolvable in this isolated worktree) and unrelated files.
- No full suite, PWA validation, or app build run (project rule + plan constraint).

## Decisions Made

- Used a warning `Alert` with two buttons rather than `Modal.confirm`: the drift state remains rendered and assertable without portal/async mocking, and both choices stay visible in the page flow.
- Dirty-tree routing keys off the packager's own warning wording (`tệp chưa commit`) instead of adding a new packager return field — the service stays untouched, per plan scope.
- `driftConfirmed` persists across retries but is reset when the user chooses to go back to Step 3, so re-entering Step 4 re-earns the confirmation.
- The retry control is tied to `showRetryConnection`, which is cleared on manual upload and at the start of each packaging attempt, preventing a stale retry button after a later successful action.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Retry button would have been attached to unrelated manual-upload errors**
- **Found during:** Task 1 (drift & SSH failure handling)
- **Issue:** The error Alert is shared by manual dropzone validation and snapshot packaging. Rendering "Thử lại kết nối" unconditionally would offer an SSH retry for, e.g., a bad zip.
- **Fix:** Added a `showRetryConnection` flag set only on snapshot packaging failures and cleared on manual upload/retry start.
- **Files modified:** `src/components/sdlc/steps/Step4ChangePackView.tsx`
- **Verification:** Existing manual-error test still passes; new SSH-failure test asserts the retry button appears.
- **Committed in:** `c04b3244` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Narrow correctness guard; no scope change. Service layer (`changePackPackager.ts`) and `ProjectSdlcView.tsx` untouched.

## Issues Encountered

- Drift detection is implemented in the view (calling `checkHeadDrift` before `createChangePackFromSnapshot`) because the packager only reports drift as a post-hoc warning. The packager's own drift warning is therefore filtered into the generic warning list only when the branch/SHA pair cannot be pre-checked (e.g. missing target branch).
- `checkHeadDrift` is invoked without an explicit secret, so it resolves the keyring credential internally — same behaviour as Step 3.

## Known Stubs

None. Every banner is driven by a real drift check, real packager warnings, or a caught error.

## Threat Flags

None — no new endpoints, auth paths, or schema changes. The drift check reuses the existing SSH helper; T-30-06 (SSH timeout) and T-30-07 (unreviewed remote commits) are mitigated by the retryable error state and the confirmation gate respectively.

## User Setup Required

Runtime verification of drift/retry still needs a configured SSH repository binding and a keyring credential for that profile. No new setup introduced by this plan.

## Next Phase Readiness

- Step 4 is resilient to missing snapshot, drift, dirty tree, and SSH failure; all four routes have automated coverage.
- Live SSH drift/retry behaviour remains a manual verification item (D5 in coverage).
- 30-03 completes Phase 30's planned waves; organization conventions remain scoped to Phase 31.

## Self-Check: PASSED

- Both modified files exist on disk.
- Commits `c04b3244` and `b0795ed1` verified as ancestors of worktree HEAD.
- Ledger base `4c9ac0e1c9416b4ca9029f6a72724487e7c4c7c2` matches the recorded plan head; measured 2 commits.
- Focused gates pass: Step 4 10/10, Step 3 10/10, packager 25/25.
- Stub scan found no TODO, FIXME, or placeholder wiring.

---
*Phase: 30-automatic-change-pack-packaging-drift-reconciliation*
*Completed: 2026-11-06*
