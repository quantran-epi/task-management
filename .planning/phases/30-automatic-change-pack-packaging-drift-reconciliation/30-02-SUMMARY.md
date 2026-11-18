---
phase: 30-automatic-change-pack-packaging-drift-reconciliation
plan: "02"
subsystem: ui
tags: [antd, react, ssh, change-pack, drift, stepper, accordion, tauri]

requires:
  - phase: 30-01
    provides: createChangePackFromSnapshot in-memory packager with progress callbacks
  - phase: 29-ssh-remote-repository-branch-diff-review
    provides: BranchSnapshot approval handoff and getProjectRepoSshBinding

provides:
  - Step 4 Snapshot summary card with active packaging trigger
  - Four-stage packaging progress stepper driven by service callbacks
  - Automatic MultiPack active-pack insertion and drift commit after packaging
  - Collapsible manual zip fallback accordion

affects: [30-03, step-4-change-pack, sdlc-workflow]

tech-stack:
  added: []
  patterns: [service progress callback to Ant Design Steps mapping, accordion fallback auto-open on SSH failure]

key-files:
  created:
    - src/components/sdlc/steps/__tests__/Step4ChangePackView.test.tsx
  modified:
    - src/components/sdlc/steps/Step4ChangePackView.tsx
    - src/views/ProjectSdlcView.tsx

key-decisions:
  - Map five packager progress phases onto the four user-visible stages, keeping diff inside stage 1 and validating inside stage 3.
  - Reuse the manual-upload commit path for auto-packaging so both flows persist MultiPack state and commit drift identically.
  - Auto-open the manual accordion when no snapshot exists or SSH binding/config resolution fails (D-03, D-11).

requirements-completed: [SDLC-REPO-04, SDLC-REPO-07]

coverage:
  - id: D1
    description: Step 4 renders approved Snapshot card (branch, base, head, file count) with active packaging CTA
    requirement: SDLC-REPO-04
    verification:
      - kind: unit
        ref: src/components/sdlc/steps/__tests__/Step4ChangePackView.test.tsx#renders snapshot card with branch, commits and packaging CTA when snapshot provided
        status: pass
    human_judgment: false
  - id: D2
    description: Packaging click runs SSH packager, shows four-stage stepper, saves active MultiPack entry and commits drift
    requirement: SDLC-REPO-04
    verification:
      - kind: unit
        ref: src/components/sdlc/steps/__tests__/Step4ChangePackView.test.tsx#auto-packages from snapshot, shows stepper stages, saves active pack and commits drift
        status: pass
    human_judgment: false
  - id: D3
    description: Manual zip dropzone lives in a collapsed accordion and auto-opens on missing snapshot or SSH failure
    requirement: SDLC-REPO-07
    verification:
      - kind: unit
        ref: src/components/sdlc/steps/__tests__/Step4ChangePackView.test.tsx#houses the manual dropzone in a collapsed accordion by default
        status: pass
      - kind: unit
        ref: src/components/sdlc/steps/__tests__/Step4ChangePackView.test.tsx#opens the manual fallback and reports an error when SSH binding is missing
        status: pass
    human_judgment: false
  - id: D4
    description: ProjectSdlcView passes the approved branch snapshot into Step 4
    requirement: SDLC-REPO-04
    verification:
      - kind: automated_ui
        ref: test(30-02) commit 705afcb9 wiring diff; behavior exercised indirectly through Step4 props in the above component tests
        status: unknown

    human_judgment: true
    rationale: No component test renders ProjectSdlcView; the one-line prop pass-through has no direct assertion, so a verifier should confirm it in the running app or accept the diff review.
actuals:
  tokens: 7023
  tasks: 2
  commits: 2
plan_head_before: 33b3c07da5ca896397043e3a862b4281d92e7b4d
plan_head_after: 2020dba0c53cce00c554baa947380438b32d1878
duration: 26min
completed: 2026-11-06
status: complete
---

# Phase 30 Plan 02: Step 4 Auto-Packaging UI Integration Summary

**Step 4 now shows the approved Snapshot card with a one-click "Đóng gói & Đối chiếu từ Snapshot" trigger that runs SSH packaging under a four-stage stepper, persists the result as the active MultiPack entry, and folds the manual zip dropzone into an auto-opening fallback accordion.**

## Performance

- Started: 2026-11-06T15:22:00Z (approx.)
- Completed: 2026-11-06T15:48:00Z (approx.)
- Duration: ~26 minutes
- Tasks: 2/2
- Files changed: 3
- Actual tokens: realized diff characters divided by four, rounded up; not model usage.
- Commit count: measured from persisted plan-head ledger before this metadata commit.

## Accomplishments

- `Step4ChangePackView` accepts `branchSnapshot` and renders an Ant Design `Card` with target branch tag, base/head short SHAs, changed-file count, and the primary packaging CTA; missing snapshot renders a warning alert with a "Quay lại Bước 3: Duyệt nhánh" action (D-01, D-03).
- `handlePackageFromSnapshot` resolves the project SSH binding (falling back to snapshot fields), loads the SSH config, calls `createChangePackFromSnapshot`, feeds the resulting Blob through `validateHubChangePack` and `buildHubReconciliation`, then inserts a new active `ChangePackHistoryItem` and calls `onCommitChangePackAndDrift` (D-02).
- Packaging progress maps service phases onto four Ant Design `Steps` stages: remote check/diff.patch → new files & SQL → in-memory JSZip → drift reconciliation (D-04).
- Remote drift and dirty-tree warnings returned by the packager surface in a warning alert without blocking packaging (D-08, D-09).
- Missing SSH binding or packaging failure shows the UI-SPEC error copy and auto-expands the manual accordion (D-11).
- Manual `ChangePackDropzone` moved into a ghost `Collapse` titled "Nạp Change Pack thủ công (.zip) — Dự phòng khi không có SSH", collapsed by default when a snapshot exists (D-10).
- `ProjectSdlcView` passes `workflowState?.artifacts.branchSnapshot` into Step 4.
- Packaging button is disabled while a run is active, mitigating rapid repeated clicks (T-30-05).

## Task Commits

1. **Task 1: Step 4 UI layout — Snapshot summary card, Stepper progress & Accordion fallback** — `705afcb9` (`feat`).
2. **Task 2: Integration tests for Step 4 auto-packaging, stepper & MultiPack integration** — `2020dba0` (`test`).

Plan metadata committed separately after this summary's self-check.

## Files Created/Modified

- `src/components/sdlc/steps/Step4ChangePackView.tsx`: snapshot card, packaging handler, stepper, warning/error alerts, accordion fallback; manual and auto flows share one commit path.
- `src/views/ProjectSdlcView.tsx`: one-line `branchSnapshot` prop pass-through.
- `src/components/sdlc/steps/__tests__/Step4ChangePackView.test.tsx`: five focused tests covering render, fallback, and auto-package behavior.

## Verification

- Task 1 plan gate: `TAURI_ENV_PLATFORM=linux node ../../../node_modules/vitest/vitest.mjs run src/components/sdlc/steps/__tests__/Step3CodeGuideView.test.tsx` — **10/10 passed**.
- Task 2 plan gate: same runner on `src/components/sdlc/steps/__tests__/Step4ChangePackView.test.tsx -t "auto-package|render"` — **5/5 passed**, exit 0.
- Final focused pair (Step 4 + Step 3): **15/15 passed**, exit 0.
- Targeted strict TypeScript check on `Step4ChangePackView.tsx` — passed (exit 0) with `--ignoreConfig --noEmit --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes`.
- No full suite, PWA validation, or app build run (project rule + plan constraint).
- Note: `tests/unit/sdlc/StepViews.test.tsx` cannot run in this worktree — `@tanstack/react-virtual` is not resolvable from the ancestor `node_modules` in this isolated checkout. Unrelated pre-existing environment gap; not caused by these changes.

## Decisions Made

- Five packager phases collapse into four UI stages because the approved UI contract fixes the stage count; `diff` joins stage 1 and `validating` joins stage 3.
- Auto-packaging reuses the same persistence/commit helper as manual upload, so MultiPack dedup by `packHash`, active-hash switching, and coordinator notification stay in one place.
- Generated filename is `${crCode}-${head.slice(0,8)}.zip`, derived from the validated manifest identity rather than a user-supplied name.
- Errors during packaging keep the failed stepper visible (`status: 'error'`) and open the manual fallback instead of clearing state.

## Deviations from Plan

None — plan executed as written. No changes to 30-01 service files.

## Issues Encountered

- Initial combined verify run appeared to time out at 15000ms; re-running each file separately and the pair together passed. The timeout was a first-run import/transform cost in the isolated worktree, not a test failure.
- Strict `tsc` on the new test file reports missing `vitest` globals and jest-dom matcher types when run without the project config; the unchanged `Step3CodeGuideView.test.tsx` produces the same class of errors under that invocation, confirming it is tooling-config noise. Component-only strict check is clean.

## Known Stubs

None. All rendered values come from the snapshot, the validated manifest, or the reconciliation result.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes. The packaging path reuses existing SSH helpers and the existing validator.

## User Setup Required

Runtime packaging still requires a configured SSH repository binding and an existing keyring credential for that SSH profile. No new setup introduced by this plan.

## Next Phase Readiness

- Step 4 auto-packaging UI is ready for end-to-end manual smoke on a real SSH target.
- 30-03 can build on the committed pack/drift flow.
- ProjectSdlcView prop pass-through has no direct component assertion; verifier should confirm during UAT.

## Self-Check: PASSED

- Created test file and modified component/view files exist.
- Both task commits verified as ancestors of worktree HEAD.
- Persisted ledger base `33b3c07da5ca896397043e3a862b4281d92e7b4d` matches the recorded plan head; measured 2 task commits.
- Final focused verification passes (15/15).
- Stub scan found no TODO, FIXME, or empty placeholder wiring.
