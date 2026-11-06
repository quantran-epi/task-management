---
phase: 27-studio-artifact-tools-diff-approval
plan: "01"
subsystem: ai
tags: [sdlc, artifact-tools, unified-diff, approval-parking, zod, dexie, vitest]

requires:
  - phase: 26-sdlc-prompt-grounding-tool-use-policy
    provides: tool registry, per-step allowlist policy, mutation interception, bounded tool loop
  - phase: 25.3-sdlc-workflow-hardening-common-ai-chat-widget
    provides: approval-parking runtime, workflow coordinator hashing, artifact draft rules

provides:
  - Registered get_artifact / patch_artifact_section local tools with trusted request-bound scope
  - Fence-aware hierarchical section index with stable dotted ids
  - Deterministic bounded unified line diff (1e6-cell budget, 120 changed-line cap)
  - Prepared immutable patch proposals and structured refusals from the service boundary
  - Runtime parking that never lets Auto-approve bypass an artifact diff decision

affects: [27-02, 27-03, 27-04, 27-05, 31]

actuals:
  tokens: 19890
  tasks: 3
  commits: 5

tech-stack:
  added: []
  patterns:
    - Trusted request-local artifact context instead of a singleton scope registry
    - Prepare-then-park approval: diff computed before the approval wait, cached by tool-call id
    - Structured tool refusals (refused/code/Vietnamese message + index metadata) instead of thrown errors

key-files:
  created:
    - src/services/ai/sdlcArtifactTools.ts
    - src/utils/markdownSections.ts
    - src/utils/lineDiff.ts
    - tests/services/ai/sdlcArtifactTools.test.ts
    - tests/services/sdlc/markdownSections.test.ts
    - tests/utils/lineDiff.test.ts
  modified:
    - src/services/ai/aiTools.ts
    - src/services/ai/aiOrchestratorLoop.ts
    - src/components/ai/runtime/chatTurnRuntime.ts
    - tests/ai/chatTurnRuntime.test.ts
    - tests/ai/aiTools.test.ts

key-decisions:
  - "Section ids number by heading order (1, 1.1, 1.1.1) so unrelated body edits and duplicate titles never shift them; hashing stays defaultSha256(markdown.trim()) while splice operations use original bytes."
  - "PATCH_LINE_CAP = 120 applies to both supplied text and resulting added+removed lines, and MAX_DIFF_CELLS = 1000000 is checked after common prefix/suffix trimming so a small edit inside a large document stays cheap."
  - "Analysis Mode keeps its read-only cancellation first; only patch_artifact_section is classified as a mutation, so get_artifact stays advertised in Analysis Mode."
  - "A rejected artifact patch records only its own decision and does not set the turn-wide declined flag, so later cards in the same turn still resolve."

patterns-established:
  - "Prepare-then-park: compute the reviewed artifact before the approval wait, cache it by serialized tool-call id, and return the cached proposal after approval."
  - "Structured artifact refusals: refused/code/Vietnamese message plus sectionIndex or counts so the model can re-read and re-propose."

requirements-completed: [SDLC-ART-01, SDLC-ART-02, SDLC-ART-03]

coverage:
  - id: D1
    description: "get_artifact returns kind, committed version, approval state, full current draft Markdown, baseHash, and section index without writing"
    requirement: SDLC-ART-01
    verification:
      - kind: integration
        ref: "tests/services/ai/sdlcArtifactTools.test.ts#reads the full current draft with committed metadata and a section index without writing"
        status: pass
      - kind: unit
        ref: "tests/services/ai/sdlcArtifactTools.test.ts#treats an empty-string draft as a real draft, not a fallback to committed content"
        status: pass
    human_judgment: false
  - id: D2
    description: "Stable fence-aware section index with hierarchical dotted ids, unique duplicates, and unchanged ids across unrelated edits"
    requirement: SDLC-ART-01
    verification:
      - kind: unit
        ref: "tests/services/sdlc/markdownSections.test.ts#buildSectionIndex (D-05)"
        status: pass
    human_judgment: false
  - id: D3
    description: "patch_artifact_section returns a real unified diff plus patched Markdown and never writes editor drafts or workflow state"
    requirement: SDLC-ART-02
    verification:
      - kind: integration
        ref: "tests/services/ai/sdlcArtifactTools.test.ts#patches one section through registered dispatch and returns a real one-line diff without writes"
        status: pass
      - kind: unit
        ref: "tests/utils/lineDiff.test.ts#createUnifiedLineDiff (SDLC-ART-02, D-09)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Bounded patches and typed refusals: 120/121 line cap, SECTION_NOT_FOUND/DRIFT/EMPTY, INVALID_ARGUMENTS, NO_CHANGES, DIFF_BUDGET_EXCEEDED"
    requirement: SDLC-ART-02
    verification:
      - kind: integration
        ref: "tests/services/ai/sdlcArtifactTools.test.ts#allows exactly 120 supplied lines and refuses 121 with the actual count and cap"
        status: pass
      - kind: unit
        ref: "tests/utils/lineDiff.test.ts#refuses an impossible matrix before allocating it"
        status: pass
    human_judgment: false
  - id: D5
    description: "Runtime prepares the patch before awaiting approval and parks every valid patch even with Auto-approve enabled"
    requirement: SDLC-ART-03
    verification:
      - kind: integration
        ref: "tests/ai/chatTurnRuntime.test.ts#prepares the artifact patch before awaiting approval and forwards the real diff payload"
        status: pass
      - kind: integration
        ref: "tests/ai/chatTurnRuntime.test.ts#never lets autoApprove bypass an artifact patch decision"
        status: pass
    human_judgment: false
  - id: D6
    description: "The approval card UI, draft application, and staleness banner render correctly in the real app"
    requirement: SDLC-ART-03
    verification: []
    human_judgment: true
    rationale: "Card rendering, approve-writes-draft, and visible stale banner belong to 27-02/27-03; this plan ships only the service and runtime contracts they consume."

duration: 38min
completed: 2026-11-04
status: complete
---

# Phase 27 Plan 01: Studio Artifact Tools & Diff Approval Summary

**Registered get_artifact/patch_artifact_section tools with trusted request-bound scope, a fence-aware dotted section index, a bounded 1e6-cell LCS unified diff, and runtime patch parking that Auto-approve can never bypass**

## Performance

- **Duration:** 38 min
- **Started:** 2026-11-04T14:57Z (approx.)
- **Completed:** 2026-11-04T15:35:40Z
- **Tasks:** 3
- **Files modified:** 11 (6 created, 5 modified)

## Accomplishments

- `get_artifact` reads the live editor draft (with committed-content fallback only for `undefined`, never for `''`) and returns kind/version/approval state/full Markdown/baseHash/sectionIndex without touching `db.settings`.
- `patch_artifact_section` resolves a section by dotted id plus exact `expectedHeading` and `baseHash`, applies append or replace to the body only, and returns the real computed unified diff plus patched Markdown.
- Pure helpers: `buildSectionIndex` (fence-aware backtick/tilde, skipped levels, duplicate titles, CRLF) and `createUnifiedLineDiff` (prefix/suffix trimming, preallocation cell budget, headers excluded from counts, CRLF/Unicode preserved).
- Runtime computes the proposal before parking, caches it per serialized tool-call id, and returns that exact proposal after approval instead of recomputing against a moved editor.
- Analysis Mode keeps its read-only cancellation first and filters only `patch_artifact_section`; `get_artifact` stays advertised.

## Task Commits

Each task was committed atomically (TDD tasks produce a test/green pair):

1. **Task 1 RED: failing artifact tool dispatch integration test** - `543e0ba9` (test)
2. **Task 1 GREEN: registered artifact read and bounded patch proposal** - `dddc97b9` (feat)
3. **Task 2: expanded section index, bounded diff, refusal coverage** - `3f6f73df` (test, includes the service `UNSUPPORTED_KIND` fix)
4. **Task 3: prepare and park patch approvals in turn runtime** - `2a32cb1d` (feat)
5. **Task 3 follow-up: Analysis Mode filters only the patch tool** - `67f001a2` (test)

**Plan metadata:** see the completion commit that adds this SUMMARY.

## TDD Gate Compliance

| Gate | Commit | Evidence |
|------|--------|----------|
| RED (task 1) | `543e0ba9` | `gsd-tools check tdd-red-evidence` → `RED_EVIDENCE_OK` (`target_test_failed`, JUnit) |
| GREEN (task 1) | `dddc97b9` | same suite green (11 tests) |
| RED (task 3) | inside `2a32cb1d` test delta | `RED_EVIDENCE_OK` (`target_test_failed`, JUnit) — 4 patch-runtime tests failed before implementation |
| GREEN (task 3) | `2a32cb1d` | runtime + loop suites green (71 tests) |

Task 2's RED evidence is real but red-first was not split into its own commit: the new Wave-0 suites failed on missing behaviour before the service/util fix landed in `3f6f73df` (2 expected-behaviour corrections were made in that same commit: fence-run fixture and the CRLF root-section bound, plus `get_artifact` kind validation loosened so `UNSUPPORTED_KIND` is actionable). Flagged here rather than claimed as a clean split.

## Files Created/Modified

- `src/services/ai/sdlcArtifactTools.ts` — trusted context contract, snapshot read, patch preparation, structured refusals, `PATCH_LINE_CAP`, `MAX_DIFF_CELLS` re-export
- `src/utils/markdownSections.ts` — `ArtifactSection`, `buildSectionIndex`, `splitLines`
- `src/utils/lineDiff.ts` — `UnifiedLineDiff`, `DiffBudgetRefusal`, `createUnifiedLineDiff`
- `src/services/ai/aiTools.ts` — two tool definitions, `executeAiTool` cases, `ExecuteAiToolOptions.artifactContext`, `patch_artifact_section` in `MUTATION_TOOLS`
- `src/services/ai/aiOrchestratorLoop.ts` — `DispatchAiToolCallOptions.artifactContext` and turn-level `artifactContext` forwarding
- `src/components/ai/runtime/chatTurnRuntime.ts` — `ChatTurnApprovalInfo.patch`, `ChatTurnRequest.artifactContext`, `preparePatch` dep, prepare-then-park branch
- Tests: `tests/services/ai/sdlcArtifactTools.test.ts` (19), `tests/services/sdlc/markdownSections.test.ts` (8), `tests/utils/lineDiff.test.ts` (9), `tests/ai/chatTurnRuntime.test.ts` (+9 cases), `tests/ai/aiTools.test.ts` (registry count 69→71 + names)

## Decisions Made

- Section ids derive from heading order, not heading text, so D-05 stability holds through duplicate titles and skipped levels.
- Hash identity is `defaultSha256(markdown.trim())` (matching coordinator call sites) while all splicing stays on original bytes, so Unicode and CRLF survive untouched.
- `baseMarkdown` rides on the proposal as the exact-base compare-and-apply check; it is runtime-only and never persisted.
- Refusals always carry `refused: true`, a `code`, and Vietnamese copy, plus `sectionIndex`/`addedLines`/`removedLines`/`cap` where the model needs them to re-propose.
- An artifact rejection clears only its own card; the legacy turn-wide `declined` semantics stay for ordinary mutation tools.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `executeToolFn` receives no options in the existing loop contract**
- **Found during:** Task 1 (`dispatchAiToolCall` wiring)
- **Issue:** Passing `options` unconditionally to `executeToolFn` broke two existing loop tests that assert the exact 4-argument call shape.
- **Fix:** Forward options only when an `artifactContext` exists, preserving the legacy 4-argument call path byte-for-byte.
- **Files modified:** `src/services/ai/aiOrchestratorLoop.ts`
- **Verification:** `tests/services/ai/aiOrchestratorLoop.test.ts` green (46 tests with the artifact suite).
- **Committed in:** `dddc97b9`

**2. [Rule 1 - Bug] `UNSUPPORTED_KIND` was unreachable for present-but-unsupported kinds**
- **Found during:** Task 2 (`get_artifact` validation)
- **Issue:** A strict enum in `executeSdlcArtifactTool` rejected `kind: 'PL01'` as `INVALID_ARGUMENTS` before `readArtifactSnapshot` could return the actionable `UNSUPPORTED_KIND`.
- **Fix:** Validate `kind` as a string at the dispatch boundary and keep the enum check inside the snapshot reader.
- **Files modified:** `src/services/ai/sdlcArtifactTools.ts`
- **Verification:** `refuses stale baseHash, missing arguments and unsupported kinds without throwing` passes.
- **Committed in:** `3f6f73df`

**3. [Rule 1 - Bug] Registry-count assertion pinned to the old tool total**
- **Found during:** Task 1
- **Issue:** `tests/ai/aiTools.test.ts` asserted exactly 69 `AI_DATABASE_TOOLS`; registering two tools made it fail for the right reason but blocked the suite.
- **Fix:** Updated the count to 71 and asserted both new names are present.
- **Files modified:** `tests/ai/aiTools.test.ts`
- **Verification:** `tests/ai/aiTools.test.ts` green (58 tests).
- **Committed in:** `dddc97b9`

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking)
**Impact on plan:** No scope creep; all three were required for the plan's own verification commands to pass.

## Issues Encountered

- **CRLF worktree, LF index:** the touched pre-existing files carry `i/lf w/crlf`, so a plain `git add` staged whole-file rewrites. Staged LF-normalized blobs via `git hash-object -w` + `git update-index --cacheinfo`, keeping each diff to the real delta only. The remaining dirty entries on those files are EOL-only (verified blob-identical after `tr -d '\r'`) and stay uncommitted as they were found.
- **Pre-existing flaky/failing suites, not caused by this plan:** `tests/ai/AIChatDrawer.test.tsx` fails 6–9 tests at baseline (`0cd17c90`) with a varying set, and `tests/unit/sdlc/SdlcWorkspace.test.tsx > clamps pointer, keyboard, and reset changes` fails at baseline too. Both were reproduced in a throwaway worktree at the plan's base commit. Out of scope per the scope-boundary rule; not fixed.
- **TDD RED evidence format:** Vitest's default `tap`/`tap-flat` reporters emit multi-line YAML diagnostics that the classifier rejects as `Malformed TAP`; the JUnit reporter with a qualified `classname#name` target produced `RED_EVIDENCE_OK`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 27-02 can consume `ChatTurnApprovalInfo.patch` directly for the diff card and `ArtifactDiffApprovalCard` mount.
- 27-03 owns applying `patchedMarkdown` through the existing draft handlers plus the draft-divergence staleness marker; nothing here writes editor or workflow state.
- 27-04/27-05 own intent routing, host prompt copy, studio-only advertisement filtering, and the access/guard suites.
- Watch item: `chatTurnRuntime` now keys prepared proposals by `currentCallId` from `onToolCall`; any host that dispatches tool executions outside the orchestrator loop must emit the call id first or the proposal will not be returned from cache.

---
*Phase: 27-studio-artifact-tools-diff-approval*
*Completed: 2026-11-04*

## Self-Check: PASSED

- Created files verified on disk: `src/services/ai/sdlcArtifactTools.ts`, `src/utils/markdownSections.ts`, `src/utils/lineDiff.ts`, and the three Wave-0 suites.
- Commits verified as ancestors of HEAD: `543e0ba9`, `dddc97b9`, `3f6f73df`, `2a32cb1d`, `67f001a2`.
- `check evaluation-scope --plan 27-01 --commits-only` returned `status: resolved` with 5 plan commits.

## Regression Follow-up — 2026-11-05

**Disposition: no confirmed Phase 27 regression among the four current-only failures. No production or permanent test changes. The full-suite gate remains failed; this investigation does not turn a red suite green.**

### Scope and baseline validity

The coordinator supplied a current full-suite run of **35 failed / 2930 passed** (`/tmp/gsd-vitest.log`) and a baseline rerun of the same ten failing files of **32 failed / 76 passed** (`/tmp/gsd-base-vitest.log`), with 31 shared failures, four current-only failures, and one baseline-only notification failure. These are different test scopes, not directly comparable suite totals. No full-suite rerun was performed in this follow-up.

Used only the existing diagnostic checkout `/tmp/gsd-base-27`, HEAD `0cd17c90f632951a3c7192d802e06509f41b7476`; no new worktree was created. Its copied `package.json` differs from the committed file only in line endings. After CRLF normalization, `package.json`, `vite.config.ts`, `tests/setup.ts`, all three affected test files, `AIChatDrawer.tsx`, and `ProjectSdlcView.tsx` match both baseline commit and current checkout. Both checkouts use the same installed dependencies through the existing node_modules symlink. No dependency install or config change occurred.

### Original, unmodified focused runs

Ran the following command from **each checkout**, three times, with unique report paths `/tmp/gsd27-follow-{current|base}-{1|2|3}.json` (console logs at matching `.log` paths):

```sh
npx vitest run tests/ai/AIChatDrawer.test.tsx tests/components/ai/AIChatDrawerNotification.test.ts tests/unit/sdlc/ProjectSdlcAutoAnalysis.test.tsx -t 'renders debug button in header and opens AIDebugModal with tracked turn|dispatches desktop notification when AI finishes while document is hidden|does NOT dispatch desktop notification when document is visible and focused|dispatches desktop notification with truncated body if response exceeds 120 chars when blurred|switching CR cancels pending activation and rejects stale callback' --reporter=json --outputFile=<unique-report-path>
```

Each run selected five tests; 36 other tests were intentionally filtered out, not newly skipped in source.

| Run | Current | Baseline |
|-----|---------|----------|
| 1 | 3 passed / 2 failed | 2 passed / 3 failed |
| 2 | 2 passed / 3 failed | 3 passed / 2 failed |
| 3 | 2 passed / 3 failed | 2 passed / 3 failed |

| Case | Current failures / runs | Baseline failures / runs | Observed failure |
|------|-------------------------|--------------------------|------------------|
| Debug modal with tracked turn | 3/3 | 3/3 | No debug turn (`expected 0 to be greater than 0`) |
| Notification while document hidden | 3/3 | 3/3 | Notification spy has zero calls |
| Visible/focused notification suppression | 2/3 | 1/3 | Reply text never appears; negative notification assertion is not reached |
| CR switch cancels pending analysis | 0/3 | 1/3 | Intake setup remains `INTAKE` instead of reaching `SOLUTION` |
| Truncated blurred notification (baseline-only control) | 0/3 | 0/3 | Passes in these focused original runs |

Then ran the **whole auto-analysis file**, unmodified, from both checkouts:

```sh
npx vitest run tests/unit/sdlc/ProjectSdlcAutoAnalysis.test.tsx --reporter=json --outputFile=<report-path>
```

Both results were **4 passed / 1 failed**, with the same failing CR-switch case and the same `Found multiple elements with the text: CR-OTHER` error. Reports: `/tmp/gsd27-auto-current.json`, `/tmp/gsd27-auto-base.json`.

### Diagnostic controls and causal evidence

Temporary test-only probes were applied identically to both checkouts, with exact original bytes captured before modification and restored in `finally`. These probes were not shipped, and their passing results do not count as passing unmodified acceptance tests.

1. **Bootstrap control:** waiting only for `ai-chat-widget[data-scope-key]` to stop being `default` still failed in the debug and hidden-notification cases on both checkouts. Waiting for controlled input value and enabled Send did not remove that shared bootstrap failure. This locates the failure before the plan's operational runtime path, rather than in notification dispatch or diff preparation.
2. **Seeded-tab control:** create the durable global tab with the existing `getOrCreateActiveChatTab({ scopeKey: 'global', scopeType: 'global' }, db)` before rendering, wait for its non-default widget scope and controlled composer state, then perform the original assertions. Combined with the selector control below, **all five cases passed in two rounds on each checkout**: current 10/10, baseline 10/10. The debug service completed a tracked turn, hidden/blurred notification contents matched, and visible/focused suppression passed. Reports: `/tmp/gsd27-seeded-probe-{current|base}-{1|2}.json`.
3. **CR selector control:** replace the document-wide `findByText('CR-OTHER')` diagnostic query with the matching element inside `.ant-select-item-option`. This avoids confusing the selected label with the dropdown option. The stale-callback assertions then passed on both checkouts, including the seeded control runs above. Production selection/cancellation code and original test are identical to baseline.

The seeded-tab probe used a 50ms diagnostic settling interval in addition to explicit readiness assertions; it was not retained as a test fix. The whole-file selector failure on both branches is independently reproduced without that diagnostic timing aid.

**Cause classification:** existing chat-tab bootstrap/composer test setup race and existing CR dropdown query ambiguity, plus an observed baseline intake-setup race. No evidence supports a Phase 27 code fix for these four cases. All unrelated baseline defects remain unchanged. Further work on those defects needs its own scope; the full-suite gate is still red.

### Final unchanged-plan verification

After restoring all six original test files (three in each checkout), byte comparisons matched the captured originals, baseline git status matched its pre-probe snapshot, and current checkout retained exactly **1936 pre-existing dirty entries** with no staged code changes.

```sh
npx vitest run tests/services/ai/sdlcArtifactTools.test.ts tests/services/sdlc/markdownSections.test.ts tests/utils/lineDiff.test.ts tests/ai/chatTurnRuntime.test.ts tests/services/ai/aiOrchestratorLoop.test.ts
npx tsc --noEmit
```

- Plan verification: **5 files passed / 109 tests passed**, exit 0 (`/tmp/gsd27-follow-plan-verify.log`).
- TypeScript: **exit 0** (`/tmp/gsd27-follow-tsc.log`).
- Follow-up diff: this SUMMARY only. No source, dependency, configuration, STATE/ROADMAP advancement, or permanent test delta.
- Follow-up self-check: original test bytes restored, existing baseline checkout preserved, root/branch pinned to the authorized sequential checkout.

## Code Review Fixes

Phase 27 code review findings fixed in `2315f87b` (`fix(27): keep CRLF drafts, approval fallback and refusal surfacing`). Focused verification after the fix: 8 files / 180 tests passed, `npx tsc --noEmit` exit 0.

| Finding | Location | Outcome | Evidence |
|---|---|---|---|
| CR-01 (critical) | `src/services/ai/sdlcArtifactTools.ts` `applyOperation` | Fixed: splices now join with the document's own dominant EOL (`detectEol`), so a CRLF draft stays CRLF and keeps its hash identity after approval | `tests/services/ai/sdlcArtifactTools.test.ts#preserves CRLF documents when appending a section line` (asserts exact CRLF `patchedMarkdown`, no bare LF), `#keeps LF documents LF when appending`, `tests/unit/sdlc/ArtifactPatchApproval.test.tsx#applies a CRLF APPROVED proposal without changing its EOL or hash identity` |
| WR-02 | `src/components/sdlc/chat/StepChatPanel.tsx` `onResolveApproval` | Fixed: artifact path only when a live, unresolved patch record matches; otherwise `turn.resolveApproval`, restoring the Phase 26 baseline wiring | `tests/unit/sdlc/ArtifactPatchApproval.test.tsx#still resolves an ordinary mutation approval (WR-02)` |
| WR-05 | `StepChatPanel` `onToolEvent` | Fixed: refusals are recorded for both `get_artifact` and `patch_artifact_section` | `#surfaces a get_artifact refusal with prerequisite navigation (WR-05, WR-06)` |
| WR-06 | `StepChatPanel` refusal records + inline alert | Fixed: the service's `supplyingStep`/`stepNumber` are now read, so `Chuyển đến Bước {N}` renders and navigates | same test asserts the button text and `onNavigateToStep('INTAKE')` |
| WR-04 | `ArtifactDiffApprovalCard.tsx` diff rows | Fixed: rows are `display: block; width: 100%`, so a line background fills the row | `tests/ai/ArtifactDiffApprovalCard.test.tsx#renders every diff row as a full-width block` |
| WR-03 | `ArtifactDiffApprovalCard.tsx` dark detection | Fixed: exported `isDarkBase` treats antd 6 darkAlgorithm `#000`/`#000000`/near-black rgb as dark and `#fff` as light; `#141414` still honoured | `tests/ai/ArtifactDiffApprovalCard.test.tsx#detects dark surfaces from antd base tokens` |

TDD: genuine RED was obtained before the production edits — CR-01 (`patchedMarkdown` still contained bare LF), WR-03 (`isDarkBase` did not exist), WR-04 (no block rows), WR-02 (ordinary approval never resolved), WR-05/WR-06 (no alert, no navigation). No INVALID_RED claim.

Disclosure: `tests/unit/sdlc/ArtifactPatchApproval.test.tsx` already carried an uncommitted 27-03 edit (a rerender with a fresh context closure). Because the file was staged whole for this fix, that pre-existing delta is included in `2315f87b`; it was not reverted or altered.
