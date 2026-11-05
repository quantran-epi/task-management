---
phase: 27-studio-artifact-tools-diff-approval
plan: "03"
subsystem: ai
tags: [sdlc, artifact-patch, dexie-transaction, staleness, react-refs, vitest]
requires:
  - phase: 27-studio-artifact-tools-diff-approval
    plan: "02"
    provides: ChatTurnApprovalInfo.patch, host onApplyArtifactPatch contract, decision marker rows
  - phase: 27-studio-artifact-tools-diff-approval
    plan: "01"
    provides: ArtifactToolContext, prepared proposals, defaultSha256 normalized hashing
provides:
  - Production ProjectSdlcView live artifact context and atomic approved-patch adapter
  - SOLUTION draft + decision Dexie transaction with rollback and serialized manual writes
  - Runtime-only PL03B/PL07/CAB draft application after durable decision
  - Pure detectDraftHashDivergence report merged into the existing stale banner
  - Generation-guarded draft hashes computed from trim-normalized live drafts
affects: [27-04, phase-27-verification]
tech-stack:
  added: []
  patterns:
    - Live refs for access/draft getters that never freeze a turn-start draft
    - Edit epoch plus transaction abort to stop late writes into a newer draft
    - Read-only draft divergence unioned into committed staleness at render
key-files:
  created:
    - tests/unit/sdlc/SdlcDraftStaleness.test.tsx
  modified:
    - src/views/ProjectSdlcView.tsx
    - src/components/sdlc/SdlcWorkspace.tsx
    - src/services/wizard/stalenessDetector.ts
    - src/components/sdlc/common/SdlcStaleBanner.tsx
    - tests/unit/sdlc/ProjectSdlcView.test.tsx
key-decisions:
  - "Approval validates live mounted scope, active CR, non-historical view, exact baseMarkdown and normalized baseHash before and after hashing, then writes SOLUTION draft plus decision in one Dexie transaction."
  - "Only durable success publishes the patched draft; PL03B/PL07/CAB keep their existing runtime-only lifecycle after the decision row is committed."
  - "Draft staleness compares trim-normalized hashes only and never mutates workflow state, versions, sourceHashes or approvedAt."
  - "A pending proposal becomes stale through generation-guarded live draft hashes; rejection alone never marks a later independent proposal stale."
requirements-completed: [SDLC-ART-03, SDLC-ART-04]
actuals:
  tokens: 10087
  tasks: 2
  commits: 3
plan_head_before: 76ae47583bc10d5f08adbc205b6d9dd2ecc502b1
plan_head_after: 75c46d3508a5541c07981b25a1674bcb428c2004
coverage:
  - id: D1
    description: "Approving a real prepared proposal changes only the live editor draft and records the decision, without any artifact version commit"
    requirement: SDLC-ART-04
    verification:
      - kind: integration
        ref: "tests/unit/sdlc/ProjectSdlcView.test.tsx#applies a real prepared SOLUTION only through approval, atomically with decision and without workflow mutation"
        status: pass
    human_judgment: false
  - id: D2
    description: "Draft-write failure keeps the previous draft, leaves no approved decision, and surfaces the error for retry"
    requirement: SDLC-ART-04
    verification:
      - kind: integration
        ref: "tests/unit/sdlc/ProjectSdlcView.test.tsx#rolls back SOLUTION draft and approved decision when the second transaction write fails"
        status: pass
    human_judgment: false
  - id: D3
    description: "PL03B/PL07/CAB approvals touch only their own live draft and leave sibling drafts and committed workflow unchanged"
    requirement: SDLC-ART-04
    verification:
      - kind: integration
        ref: "tests/unit/sdlc/ProjectSdlcView.test.tsx#updates only the live PL03B draft and keeps committed metadata unchanged"
        status: pass
    human_judgment: false
  - id: D4
    description: "A stale or cross-scope captured approval never overwrites a newer draft or another step's editor"
    requirement: SDLC-ART-05
    verification:
      - kind: integration
        ref: "tests/unit/sdlc/ProjectSdlcView.test.tsx#rejects a whitespace-only manual edit before approval instead of overwriting it"
        status: pass
      - kind: integration
        ref: "tests/unit/sdlc/ProjectSdlcView.test.tsx#refuses a captured approval adapter after leaving its step"
        status: pass
    human_judgment: false
  - id: D5
    description: "Draft divergence marks the owning step in the existing stale banner and clears when the draft returns to committed content"
    requirement: SDLC-ART-04
    verification:
      - kind: unit
        ref: "tests/unit/sdlc/SdlcDraftStaleness.test.tsx#detectDraftHashDivergence (SDLC-ART-04 read-only)"
        status: pass
      - kind: integration
        ref: "tests/unit/sdlc/SdlcDraftStaleness.test.tsx#shows the owning stale banner after approval and clears it when the draft is restored"
        status: pass
    human_judgment: false
  - id: D6
    description: "Native Tauri check: approve one small edit per artifact, confirm the editor and banner, then force a storage error"
    verification: []
    human_judgment: true
    rationale: "Plan defers the native Tauri check to end-of-phase UAT; jsdom tests styles and DB state, not rendered desktop behavior."
duration: 46min
completed: 2026-11-05
status: complete
---

# Phase 27 Plan 03: Production Draft Application and Draft Staleness Summary

**Approved artifact patches now reach the real editor draft through one scoped, serialized host adapter — SOLUTION writes draft plus decision in a single Dexie transaction, other artifacts apply after the durable decision, and divergent drafts mark their owning step in the existing stale banner with zero version commits.**

## Performance

- Started: 2026-11-05T03:13:21Z.
- Completed: 2026-11-05T03:59:40Z.
- Duration: 46 min.
- Tasks: 2/2.
- Files changed: 6 (1 new test, 5 modified).
- Commits: 3 measured from the persisted ledger `76ae4758..HEAD`.

## Accomplishments

- `ProjectSdlcView` now exposes a live `artifactToolContext` whose getters read refs, so a turn never captures a stale draft or a stale access answer. Access fails closed when unmounted, on a different CR/step, in a historical view, or without workflow state.
- `handleApplyArtifactPatch` validates scope, kind, active CR, exact captured `baseMarkdown`, normalized `baseHash`, and committed version before hashing and again after it, then runs a `settings` + `chatMessages` Dexie transaction with a post-write recheck.
- Only durable success publishes the patched text. A failed second write rolls back both the SOLUTION draft and the decision row; no approval is reported.
- SOLUTION draft writes are serialized per project/CR and guarded by an edit epoch, so a late hash or transaction cannot overwrite newer typing. PL03B/PL07/CAB keep their runtime-only lifecycle and apply after the decision is durably stored.
- Patch approval never calls `commitSolution`, `commitRevision`, `commitTechDoc`, `commitCab`, `appendArtifactEvent`, or `handleSolutionExtracted`; versions, `activeVersions`, `sourceHashes`, and `approvedAt` stay byte-identical.
- `detectDraftHashDivergence` is a pure read-only report mapping SOLUTION→SOLUTION, PL03B/PL07→TECH_DOCS, CAB→CAB. It treats absent drafts and missing baselines as no divergence, uses trim-normalized hashes, and renders through the existing banner with committed reasons taking precedence.
- Draft hashes are computed in a generation- and scope-guarded effect and forwarded through `SdlcWorkspace` as `draftHashes`.

## Task Commits

1. Task 1 RED — `04fd8bce` `test(27-03): require atomic production artifact draft approval`
2. Task 1 GREEN — `80f9ec86` `feat(27-03): apply approved artifact patches to live drafts`
3. Task 2 — `75c46d35` `feat(27-03): surface draft divergence in the stale banner`

The second commit was amended once to normalize line endings in the LF-index files; no content changed. Metadata commit follows this SUMMARY.

## TDD Gate Compliance

- `query phase.tdd-applicable` returned `applicable: true`, source `task_attribute`, despite global `config_tdd_mode: false`.
- Task 1 RED: `check tdd-red-evidence` returned `RED_EVIDENCE_OK` (`target_test_failed`). The real production view rendered, the real workspace wrapper captured props, and the target failed on the explicit missing `artifactToolContext` assertion.
- Task 1 GREEN: adapter tests 7/7, full host file 19/19, second verify command 63/63, grounding 12/12, TypeScript exit 0.
- Task 2: the helper and banner wiring landed in the same commit as its tests, so the Task 2 RED record was classified `INVALID_RED` (`no_target_test_failure`). That partial-helper order is recorded here rather than claimed as strict red-first discipline. The 12-case suite then passed 13/13 after two fixture corrections and one added approve→banner→restore case, three consecutive runs.
- REFACTOR: none needed.

## Verification

All commands ran in the pinned checkout with installed dependencies.

```sh
npx vitest run tests/unit/sdlc/ProjectSdlcView.test.tsx
npx vitest run tests/unit/sdlc/StepChatPanelArtifactQueue.test.tsx tests/unit/sdlc/ProjectSdlcView.test.tsx
npx vitest run tests/unit/sdlc/SdlcDraftStaleness.test.tsx
npx vitest run tests/services/sdlc/groundingBuilder.test.ts tests/unit/sdlc/ProjectSdlcGrounding.test.tsx tests/unit/sdlc/ProjectSdlcView.test.tsx
npx tsc --noEmit
```

Final results after the commits:

- `ProjectSdlcView`: 19/19 passed.
- `StepChatPanelArtifactQueue` + `ProjectSdlcView`: 63/63 passed.
- Staleness suite: 13/13, three consecutive runs.
- Adapter subset: 7/7, three consecutive runs.
- Suite without the flaky host file (staleness + artifact queue + grounding + project grounding): 69/69.
- TypeScript: exit 0.
- `check evaluation-scope --plan 27-03 --commits-only` resolved all three commits on this branch.

**Known baseline flake, not introduced here.** `tests/unit/sdlc/ProjectSdlcView.test.tsx > Test 9` intermittently fails at the pre-existing approve-button assertion (line 369; line 356 on baseline). It reproduced on the untouched `0cd17c90` baseline checkout (1 failure in 5 targeted IDE runs, and 2 of 12 in one earlier full-file run) as well as on the current tree, and passes in isolation. The plan's own new cases are stable across repeated runs. Full-suite results remain inconclusive/red by the coordinator's report; no green-suite claim is made here.

## Files Created/Modified

- `src/views/ProjectSdlcView.tsx` — live draft/access refs, serialized SOLUTION writes, `handleApplyArtifactPatch`, draft hash effect, prop forwarding.
- `src/components/sdlc/SdlcWorkspace.tsx` — forwards `artifactToolContext`, `onApplyArtifactPatch`, and `draftHashes`; derives the draft report.
- `src/services/wizard/stalenessDetector.ts` — new `detectDraftHashDivergence`.
- `src/components/sdlc/common/SdlcStaleBanner.tsx` — optional `draftStaleness` merged with committed staleness.
- `tests/unit/sdlc/ProjectSdlcView.test.tsx` — production adapter matrix: atomic approve, rollback, whitespace stale, per-kind isolation, scope change.
- `tests/unit/sdlc/SdlcDraftStaleness.test.tsx` — new pure and integrated draft staleness suite.

## Decisions Made

- Fail the approval with a thrown error rather than silently completing when the live scope or base moved; the 27-02 card already keeps itself pending and shows retry guidance on rejection.
- Serialize SOLUTION writes on a per-project/CR promise chain so a manual save and a patch apply cannot interleave; other kinds are runtime-only and need no queue.
- Treat `version` mismatch as stale too, because the committed version can advance while a proposal is parked.
- Do not mark a step stale from rejection alone; only actual draft-hash divergence does.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The panel needed the artifact context before accessing it**
- Found during Task 1 while wiring the production adapter.
- Issue: without forwarding `artifactToolContext` from `ProjectSdlcView` through `SdlcWorkspace`, the panel could never prepare a proposal and all host tests failed.
- Fix: forward the context and adapter as optional props, then derive them from live refs in the view.
- Verification: adapter matrix 7/7 and full host file 19/19.
- Commit: `80f9ec86`.

**2. [Rule 1 - Bug] Line-ending churn in an LF-index file**
- Found during Task 2 review of `git show --numstat`.
- Issue: writing through the editor's CRLF view inflated the staleness/banner diff from ~46 to 394 inserted lines.
- Fix: amended the same commit with LF-normalized blobs; content unchanged.
- Verification: `git show --numstat` now reports 31/13/7/162 real lines.
- Commit: `75c46d35`.

No architecture, schema, dependency, provider, or host-interface changes.

## Issues Encountered

- The plan's second Task 1 verify command includes the flaky `ProjectSdlcView` file; it passed 63/63 on the recorded run but later repeated runs of the same file showed the pre-existing Test 9 flake on both checkouts. The new cases, run in isolation, passed 7/7 three times.
- The Task 2 RED classifier returned `INVALID_RED` because the helper had already been implemented before the test run; recorded honestly instead of claiming the gate.

## User Setup Required

None.

## Next Phase Readiness

- 27-04 remains pending: intent routing for "add this content" plus the scripted-provider bounded-diff regression. It must advertise artifact tools only through the explicit studio allowlist added by 27-05.
- End-of-phase UAT still needs the native Tauri pass: approve one small edit per artifact, confirm editor and banner, force a storage error and confirm the old draft survives.
- Requirement state: `ready-ids` marked SDLC-ART-03 and SDLC-ART-04 ready after this plan; SDLC-ART-01/05 stay blocked by unfinished sibling plans.

## Self-Check: PASSED

- Created file exists: `tests/unit/sdlc/SdlcDraftStaleness.test.tsx`.
- Commits are ancestors of HEAD: `04fd8bce`, `80f9ec86`, `75c46d35`.
- Targeted suites and TypeScript pass as listed above.
- No version-commit call is reachable from the patch path; workflow rows are compared byte-for-byte in tests.
- Existing dirty entries preserved (1936 before, 1935 after one file normalized to its committed blob).
- Close-out SDK result: `roadmap.update-plan-progress 27` exited 0 but returned `updated: false`, `reason: missing_phase_details`; treated as a decline, not a write. Manually checked only the existing 27-03 checklist item and changed the Active Phase line to 4/5.
- STATE pointer advanced to plan 4 with 27-04 as the resume file; metric and decision recorded; only SDLC-ART-03/ART-04 (returned `ready`) were marked complete. SDLC-ART-01/05 remain blocked by unfinished siblings.
- Follow-up metadata commit `a470b15e` touches only planning files. Remaining entries under the touched source paths are EOL-only and were verified blob-identical after CRLF normalization.
