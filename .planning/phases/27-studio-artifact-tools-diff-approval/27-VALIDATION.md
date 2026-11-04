---
phase: "27"
slug: "studio-artifact-tools-diff-approval"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-04"
---

# Phase 27 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (existing, matches Phase 26) |
| **Config file** | existing vitest config at repo root |
| **Quick run command** | `npx vitest run <changed test files>` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | Targeted task command budget: under 60 seconds. Measure full-suite runtime during execution; no full-suite duration asserted at planning. |

---

## Sampling Rate

- **After every task commit:** Run quick command on the task's touched test files
- **After every plan wave:** Run full suite
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 27-01-01 | 01 | 1 | SDLC-ART-01, 02 | T-27-01, T-27-02 | real registered get/patch, trusted scope, no writes | integration | `npx vitest run tests/services/ai/sdlcArtifactTools.test.ts` | W0 in task | pending |
| 27-01-02 | 01 | 1 | SDLC-ART-01, 02 | T-27-03 | ordered unique fence-aware index, bounded Unicode diff | unit | `npx vitest run tests/services/sdlc/markdownSections.test.ts tests/utils/lineDiff.test.ts tests/services/ai/sdlcArtifactTools.test.ts` | W0 in task | pending |
| 27-01-03 | 01 | 1 | SDLC-ART-03 | T-27-04 | explicit patch approval, existing analysis guard, sequential decline/abort | runtime | `npx vitest run tests/ai/chatTurnRuntime.test.ts` | exists; extend | pending |
| 27-02-01 | 02 | 2 | SDLC-ART-03 | T-27-05 | verbatim diff text, metadata, fresh/stale controls | component | `npx vitest run tests/ai/ArtifactDiffApprovalCard.test.tsx tests/ai/AiChatWidget.test.tsx` | mixed; card suite created in task | pending |
| 27-02-02 | 02 | 2 | SDLC-ART-03, 05 | T-27-06, T-27-07 | durable decisions, stale check, retry, refusal navigation | integration | `npx vitest run tests/unit/sdlc/ArtifactPatchApproval.test.tsx tests/ai/useChatTurn.test.tsx` | mixed; approval suite created in task | pending |
| 27-02-03 | 02 | 2 | SDLC-ART-03 | T-27-08 | bounded tool detail, narrow/light/dark/font backstops | component | `npx vitest run tests/ai/ArtifactDiffApprovalCard.test.tsx tests/ai/AiChatWidget.test.tsx` | created earlier in plan | pending |
| 27-03-01 | 03 | 3 | SDLC-ART-04 | T-27-09, T-27-10 | atomic draft/decision, no version commit, race protection | host integration | `npx vitest run tests/unit/sdlc/ProjectSdlcView.test.tsx` | exists; extend | pending |
| 27-03-02 | 03 | 3 | SDLC-ART-04 | T-27-11 | pure draft divergence, visible owning-step stale banner | unit/integration | `npx vitest run tests/unit/sdlc/SdlcDraftStaleness.test.tsx` | created in task | pending |
| 27-04-01 | 04 | 4 | SDLC-ART-05 | T-27-12, T-27-13 | real get then patch, +1/−0, approval-only editor | integration | `npx vitest run tests/unit/sdlc/ArtifactPatchIntent.test.tsx` | created in task | pending |
| 27-04-02 | 04 | 4 | SDLC-ART-05 | T-27-14 | explicit target, prior-base rejection, independent card freshness | integration | `npx vitest run tests/unit/sdlc/StepChatPanelArtifactQueue.test.tsx tests/unit/sdlc/StepChatPanelToolPolicy.test.tsx tests/unit/sdlc/ArtifactPatchApproval.test.tsx` | mixed; earlier plan creates approval suite | pending |
| 27-05-01 | 05 | 5 | SDLC-ART-06 | T-27-15, T-27-16 | active controls and preview/historical/prerequisite refusals | integration | `npx vitest run tests/services/ai/sdlcArtifactGuards.test.ts` | created in task | pending |
| 27-05-02 | 05 | 5 | SDLC-ART-06 | T-27-17, T-27-18 | studio-only payload filter, revoked scope, alias/input validation, safe refusal payload | integration | `npx vitest run tests/services/ai/sdlcArtifactGuards.test.ts tests/services/ai/sdlcArtifactTools.test.ts tests/ai/artifactToolAccess.test.ts` | mixed; access suite created in this task, other suites earlier | pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*(Task IDs above are planner estimates — planner may re-map; keep the requirement→test coverage.)*

---

## Wave 0 Requirements

- [ ] `tests/services/sdlc/markdownSections.test.ts` — stubs for section index (SDLC-ART-01)
- [ ] `tests/services/ai/sdlcArtifactTools.test.ts` — stubs for tool behavior (SDLC-ART-01/02/06)
- [ ] `tests/utils/lineDiff.test.ts` — stubs for line diff (SDLC-ART-02)

- [ ] `tests/ai/artifactToolAccess.test.ts` — 27-05 Task 2 creates payload/runtime access cases and owns src/services/ai/chatTurnTools.ts studio-only filtering; moved from 27-01 to keep all plans at ten files or fewer.
- [ ] `tests/ai/ArtifactDiffApprovalCard.test.tsx` — 27-02 Task 1 creates card/UI-state cases.
- [ ] `tests/unit/sdlc/ArtifactPatchApproval.test.tsx` — 27-02 Task 2 creates real approval/refusal integration.
- [ ] `tests/unit/sdlc/SdlcDraftStaleness.test.tsx` — 27-03 Task 2 creates pure/visible stale cases.
- [ ] `tests/unit/sdlc/ArtifactPatchIntent.test.tsx` — 27-04 Task 1 creates scripted-provider end-to-end regression.
- [ ] `tests/services/ai/sdlcArtifactGuards.test.ts` — 27-05 Task 1 creates registered guard matrix.

Wave 0 is embedded in each owning task's RED step before production behavior changes; no extra plan/wave or test framework install. Tests must execute rather than remain skipped stubs. Section-suite path above is canonical; do not create research's alternate duplicate `tests/utils/markdownSections.test.ts`.

Every runnable task verify has immediate `<fails_when>` in its PLAN.md. Non-zero exit, `No test files found`, or skipped Phase 27 cases prevents a passing claim. Keep status draft and wave_0_complete false until execution evidence exists.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Diff card visual rendering (colors, scroll, ellipsis) | SDLC-ART-03 | visual acceptance | Open SDLC studio, trigger patch, inspect card visuals per 27-UI-SPEC |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
