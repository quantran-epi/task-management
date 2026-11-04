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
| **Estimated runtime** | ~60 seconds full suite |

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
| 27-01-01 | 01 | 1 | SDLC-ART-01 | — | section index + artifact read | unit | `npx vitest run tests/services/sdlc/markdownSections.test.ts` | ❌ W0 | ⬜ pending |
| 27-01-02 | 01 | 1 | SDLC-ART-01, 02 | — | get_artifact / patch_artifact_section produce diff without write | unit | `npx vitest run tests/services/ai/sdlcArtifactTools.test.ts` | ❌ W0 | ⬜ pending |
| 27-01-03 | 01 | 1 | SDLC-ART-02 | — | line diff bounded | unit | `npx vitest run tests/utils/lineDiff.test.ts` | ❌ W0 | ⬜ pending |
| 27-02-01 | 02 | 2 | SDLC-ART-03 | — | approval card renders diff + approve/reject | component | `npx vitest run tests/ai/AiChatWidget.test.tsx` | ✅ | ⬜ pending |
| 27-03-01 | 03 | 3 | SDLC-ART-04 | — | approve writes draft, marks stale, never commits | unit/component | `npx vitest run tests/unit/sdlc/ProjectSdlcView.test.tsx` | ✅ | ⬜ pending |
| 27-04-01 | 04 | 4 | SDLC-ART-05 | — | "add this content" → get + patch bounded diff | integration | `npx vitest run tests/unit/sdlc/StepChatPanelArtifactQueue.test.tsx` | ✅ | ⬜ pending |
| 27-05-01 | 05 | 5 | SDLC-ART-06 | — | preview/historical/prerequisite guards | unit | `npx vitest run tests/services/ai/sdlcArtifactTools.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*(Task IDs above are planner estimates — planner may re-map; keep the requirement→test coverage.)*

---

## Wave 0 Requirements

- [ ] `tests/services/sdlc/markdownSections.test.ts` — stubs for section index (SDLC-ART-01)
- [ ] `tests/services/ai/sdlcArtifactTools.test.ts` — stubs for tool behavior (SDLC-ART-01/02/06)
- [ ] `tests/utils/lineDiff.test.ts` — stubs for line diff (SDLC-ART-02)

*Existing vitest infra covers everything else; no framework install needed.*

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
