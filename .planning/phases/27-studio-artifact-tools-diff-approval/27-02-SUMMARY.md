---
phase: 27-studio-artifact-tools-diff-approval
plan: "02"
subsystem: ai
tags: [sdlc, artifact-patch, approval-card, unified-diff, dexie, transcript, accessibility, vitest]

requires:
  - phase: 27-studio-artifact-tools-diff-approval
    plan: "01"
    provides: prepared ArtifactPatchProposal, structured refusals, runtime patch parking, trusted ArtifactToolContext
  - phase: 25.3-sdlc-workflow-hardening-common-ai-chat-widget
    provides: shared AiChatWidget ownership, approval wait state, thread-scoped clear contract

provides:
  - Presentational ArtifactDiffApprovalCard rendering verbatim unified diffs, stats, stale and resolved states
  - Typed patch payload forwarding from the runtime snapshot into the shared widget
  - Scoped host decision handler that applies drafts only through the host adapter, serialized against double clicks
  - Durable metadata-only decision transcript rows that survive turn completion, errors and remount
  - Inline refusal alerts at their tool transcript position with prerequisite navigation
  - Bounded artifact tool detail previews (2000 chars) and accessible diff scroll region

affects: [27-03, 27-04, 27-05, 31]

actuals:
  tokens: 12120
  tasks: 3
  commits: 5

tech-stack:
  added: []
  patterns:
    - Separate neutral diff card beside the untouched MutationApprovalCard
    - Host-owned async apply adapter; the tool never writes the editor draft
    - Internal decision marker rows rendered through transcriptExtensions and filtered from bubbles

key-files:
  created:
    - src/components/ai/widget/ArtifactDiffApprovalCard.tsx
    - tests/ai/ArtifactDiffApprovalCard.test.tsx
    - tests/unit/sdlc/ArtifactPatchApproval.test.tsx
  modified:
    - src/components/ai/AiChatWidget.tsx
    - src/components/ai/runtime/useChatTurn.ts
    - src/components/sdlc/chat/StepChatPanel.tsx
    - tests/ai/AiChatWidget.test.tsx
    - tests/ai/useChatTurn.test.tsx

key-decisions:
  - "The diff card is a separate neutral component: semantic green/red lives in diff rows, so the warning treatment stays available for stale state and MutationApprovalCard is never restyled."
  - "Approval writes happen only through the optional onApplyArtifactPatch host adapter; a missing adapter surfaces actionable copy and leaves the draft untouched, and the same proposal can never apply twice."
  - "Staleness compares both the normalized baseHash and the exact captured baseMarkdown, so a whitespace-only draft change still requires a fresh proposal while Unicode/body bytes remain authoritative."
  - "Rejection persists one stable-UUID system row inside the same Dexie transaction, records only the decision, and resolves false without inventing feedback or retrying automatically."
  - "Decision marker rows use the existing ChatMessage shape and are excluded from ordinary bubbles, never persisted with pending diff bodies."

patterns-established:
  - "Host-applied artifact patch: prepare in service, park in runtime, apply in host adapter, record decision row."
  - "Runtime-only refusal records keyed by tool call id, rendered inline through toolEventExtensions."

requirements-completed: [SDLC-ART-03]

coverage:
  - id: D1
    description: "Every valid prepared patch renders title, kind/version/section, +N/−N, verbatim diff and Chấp thuận/Từ chối controls through the shared widget"
    requirement: SDLC-ART-03
    verification:
      - kind: integration
        ref: "tests/ai/ArtifactDiffApprovalCard.test.tsx#renders a real prepared patch as verbatim diff instead of generic mutation approval"
        status: pass
    human_judgment: false
  - id: D2
    description: "Ordinary mutation approval rendering is unchanged and the composer stays disabled with no staged spinner while a card is pending"
    requirement: SDLC-ART-03
    verification:
      - kind: integration
        ref: "tests/ai/ArtifactDiffApprovalCard.test.tsx#keeps stale diff visible, disables approve only, and leaves ordinary mutation UI unchanged"
        status: pass
      - kind: integration
        ref: "tests/ai/AiChatWidget.test.tsx#renders exactly one approval control set and wires approve/reject"
        status: pass
    human_judgment: false
  - id: D3
    description: "Real panel/hook/runtime applies only after explicit approval and keeps a metadata-only decision row after remount"
    requirement: SDLC-ART-03
    verification:
      - kind: integration
        ref: "tests/unit/sdlc/ArtifactPatchApproval.test.tsx#parks a real diff, applies only after explicit approval, and keeps metadata-only decision after remount"
        status: pass
    human_judgment: false
  - id: D4
    description: "Reject records only its decision, leaves the draft untouched, and a second independent patch stays approvable"
    requirement: SDLC-ART-03
    verification:
      - kind: integration
        ref: "tests/unit/sdlc/ArtifactPatchApproval.test.tsx#rejects first then approves independent second against unchanged base without automatic retry"
        status: pass
    human_judgment: false
  - id: D5
    description: "Stale cards keep the old diff, warn, and disable Approve; host write failures keep the pending card with retry guidance"
    requirement: SDLC-ART-03
    verification:
      - kind: integration
        ref: "tests/unit/sdlc/ArtifactPatchApproval.test.tsx#keeps stale diff visible and disables approval after exact-base whitespace change"
        status: pass
      - kind: integration
        ref: "tests/unit/sdlc/ArtifactPatchApproval.test.tsx#keeps pending card on host failure and serializes retry/double activation"
        status: pass
    human_judgment: false
  - id: D6
    description: "Refusals render as actionable inline alerts at their tool position; artifact detail previews are bounded and card text stays at or above 12px"
    requirement: SDLC-ART-03
    verification:
      - kind: integration
        ref: "tests/unit/sdlc/ArtifactPatchApproval.test.tsx#shows oversized refusal inline in tool order without an empty approval card"
        status: pass
      - kind: unit
        ref: "tests/ai/AiChatWidget.test.tsx#bounds expanded artifact detail without mutating the tool result"
        status: pass
      - kind: unit
        ref: "tests/ai/ArtifactDiffApprovalCard.test.tsx#bounds long titles and stats, stays at 12px, and exposes palette and focus semantics"
        status: pass
    human_judgment: false
  - id: D7
    description: "Visual quality at 320/380/480px in Tauri, light/dark, and keyboard-only review"
    requirement: SDLC-ART-03
    verification: []
    human_judgment: true
    rationale: "Plan defers the native visual check to end-of-phase human verification; jsdom asserts styles, not rendered appearance."

duration: 33min
completed: 2026-11-05
status: complete
---

# Phase 27 Plan 02: Artifact Diff Approval Card Summary

**Neutral verbatim-diff approval card wired to a scoped host adapter: drafts apply only on explicit approval, rejections become durable metadata-only transcript rows, stale cards stay unapprovable, and refusals render inline at their tool call**

## Performance

- **Duration:** 33 min
- **Started:** 2026-11-05T01:58:37Z
- **Completed:** 2026-11-05T02:31:09Z
- **Tasks:** 3
- **Files modified:** 8 (3 created, 5 modified)

## Accomplishments

- `ArtifactDiffApprovalCard` renders the unified diff as React text nodes with `maxHeight: 240`, both scroll axes, monospace 12px/20px, `DiffHunkView` green/red values, `DiffOutlined` header, exact UI-SPEC copy, and disabled Approve plus tooltip when stale.
- `AiChatTurnSnapshot.pendingApproval` now carries `ChatTurnApprovalInfo`; the widget picks the diff card only when `patch` exists, so `MutationApprovalCard` rendering is byte-identical.
- `StepChatPanel` accepts `artifactToolContext` and `onApplyArtifactPatch`, forwards the trusted context to the turn, and applies an approved proposal only through the host adapter — the tool never writes the draft.
- Decisions persist as one `role: system` row keyed by a stable runtime UUID inside a Dexie transaction, rendered through `transcriptExtensions` with human copy only, and filtered out of ordinary bubbles and model history.
- Staleness compares normalized `baseHash` **and** exact `baseMarkdown`, so a whitespace-only edit blocks approval while unrelated rejections never mark a later independent card stale.
- Refusals (oversized, prerequisite, unavailable) render inline inside their tool badge container via `toolEventExtensions`, with `Chuyển đến Bước {N}` navigation.
- Artifact tool detail previews cap at 2000 characters with an explicit truncation marker; the model still receives the untouched result.

## Task Commits

1. **Task 1 RED: prepared patch lacks review card** — `42518cbd` (test)
2. **Task 1 GREEN: reviewable artifact diff cards** — `1f4b5a87` (feat)
3. **Task 2 RED: missing scoped patch approval integration** — `ceebd2d2` (test)
4. **Task 2 GREEN: persist scoped artifact patch decisions** — `7e6a478d` (feat)
5. **Task 3: bound artifact details and keep card controls accessible** — `b0c87677` (feat + tests)

**Plan metadata:** the completion commit that adds this SUMMARY.

## TDD Gate Compliance

| Gate | Commit | Evidence |
|------|--------|----------|
| RED (task 1) | `42518cbd` | `check tdd-red-evidence` → `RED_EVIDENCE_OK` (`target_test_failed`, JUnit, no parser errors) |
| GREEN (task 1) | `1f4b5a87` | card + widget suites 22/22; tracer re-verified after commit |
| RED (task 2) | `ceebd2d2` | `RED_EVIDENCE_OK`; real panel/hook/runtime failed at the missing card because context was dropped |
| GREEN (task 2) | `7e6a478d` | ArtifactPatchApproval 7/7 plus 85 tests across the touched cluster |
| Task 3 | `b0c87677` | held-out UI-state tests added and passing; no separate RED commit (see deviations) |

## Files Created/Modified

- `src/components/ai/widget/ArtifactDiffApprovalCard.tsx` — new presentational diff card (pending, stale, error, resolved)
- `src/components/ai/AiChatWidget.tsx` — `ChatTurnApprovalInfo` snapshot, `artifactApprovalState`/`artifactDecision`, `toolEventExtensions`, `data-tool-call-id`, 2000-char artifact detail cap
- `src/components/ai/runtime/useChatTurn.ts` — forwards `preparePatch` only when supplied
- `src/components/sdlc/chat/StepChatPanel.tsx` — host contract, freshness check with generation token, serialized apply, rejection transaction, decision rows, refusal alerts
- Tests: `tests/ai/ArtifactDiffApprovalCard.test.tsx` (4), `tests/unit/sdlc/ArtifactPatchApproval.test.tsx` (7), `tests/ai/AiChatWidget.test.tsx` (+1 held-out), `tests/ai/useChatTurn.test.tsx` (unchanged assertions, kept green)

## Decisions Made

- Diff card container stays neutral; semantic color lives only in diff rows so stale warning treatment remains available.
- Freshness uses both normalized hash and exact base bytes, with a generation token so an older hash promise can never re-enable Approve.
- Approval and rejection both await host persistence before resolving the runtime; a failed write leaves the card pending and retryable.
- Decision rows carry `proposalId`, `kind`, `sectionId`, `decision` plus human copy only — never diff text, full documents, or pending payloads.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Rejection row write needed a repository-shaped API**
- **Found during:** Task 2
- **Issue:** The plan names the existing repository for decision rows, but `saveMessage` always generates a new id, which would duplicate rows on retry.
- **Fix:** Write the pre-built stable-UUID row inside a `rw` Dexie transaction over `chatMessages` + `chatThreads`, keeping the existing schema and timestamp contract.
- **Files modified:** `src/components/sdlc/chat/StepChatPanel.tsx`
- **Verification:** `ArtifactPatchApproval` rejection/retry/remount cases pass with exactly one row.
- **Committed in:** `7e6a478d`

**2. [Rule 1 - Bug] Duplicate decision rendering while the card was still mounted**
- **Found during:** Task 2
- **Issue:** The persisted decision row and the mounted card both rendered the decision line.
- **Fix:** Dedupe the transcript row only while the live card shows that same proposal's resolved state; the row reappears after remount.
- **Files modified:** `src/components/sdlc/chat/StepChatPanel.tsx`
- **Verification:** Decision appears once while mounted and once after remount in the integration suite.
- **Committed in:** `7e6a478d`

**3. [Rule 1 - Bug] Decision marker leaked into ordinary chat bubbles**
- **Found during:** Task 2
- **Issue:** The raw `ARTIFACT_PATCH_DECISION` content would render as a normal message.
- **Fix:** Filter marker rows out of the `messages` prop before the widget and render them only via `transcriptExtensions`.
- **Files modified:** `src/components/sdlc/chat/StepChatPanel.tsx`
- **Verification:** Integration test asserts the marker text never appears in the DOM.
- **Committed in:** `7e6a478d`

---

**Total deviations:** 3 auto-fixed (1 blocking, 2 bugs)
**Impact on plan:** All three were required for the plan's own acceptance criteria (one row, no pending bodies, no raw markers). No scope creep.

## Issues Encountered

- **TDD split for Task 3:** its held-out UI-state fixtures were written and made green in the same commit (`b0c87677`) rather than a separate RED commit; Tasks 1 and 2 have machine-validated RED evidence. Flagged rather than claimed as a clean split.
- **Full suite remains red by agreement:** the user accepted the known baseline gate. This plan did not rerun the full suite and does not claim it green. `tests/ai/AIChatDrawer.test.tsx` remains flaky in both checkouts (current 13/18 failures across runs, baseline 20/23 across runs for the same file); every touched cluster used by the plan is green.
- **CRLF worktree, LF index:** touched pre-existing files were staged as LF-normalized blobs, so commits contain only the real delta. New files are LF. Worktree dirt dropped from 1936 to 1935 because one normalized test file now matches its committed blob.
- **Roadmap query declined:** `roadmap.update-plan-progress 27` still returns `missing_phase_details` (no progress table row, no phase detail list match), so ROADMAP.md is hand-updated on the plan checklist and Active Phase line only. This is surfaced, not treated as success.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 27-03 owns the production `ProjectSdlcView` adapter: it must pass `artifactToolContext` and implement `onApplyArtifactPatch` (validate live identity/base, write draft + approved decision atomically) plus the draft-divergence stale banner.
- 27-04 owns intent routing for "add this content" and the scripted-provider regression; 27-05 owns studio-only advertisement filtering and the access/guard suite.
- Watch item: the panel keys records by `proposalId` and clears them on scope/thread change only; a host that remounts the panel without changing `scopeKey` keeps live cards, and persisted rows still describe their decision.

---
*Phase: 27-studio-artifact-tools-diff-approval*
*Completed: 2026-11-05*

## Self-Check: PASSED

- Created files exist: `ArtifactDiffApprovalCard.tsx`, `ArtifactDiffApprovalCard.test.tsx`, `ArtifactPatchApproval.test.tsx`.
- Commits are ancestors of HEAD: `42518cbd`, `1f4b5a87`, `ceebd2d2`, `7e6a478d`, `b0c87677`.
- Final targeted verification: 8 files / 152 tests passed, `tsc --noEmit` exit 0.

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
