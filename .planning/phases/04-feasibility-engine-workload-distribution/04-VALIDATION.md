---
phase: 04
slug: feasibility-engine-workload-distribution
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-27
---

# Phase 04 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.2 |
| **Config file** | `vite.config.ts` |
| **Quick run command** | `npm test -- tests/utils/feasibility.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- tests/utils/feasibility.test.ts`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | CALC-01, CALC-02 | T-04-01 | Sanitize date inputs, evaluate active load without double-counting | unit | `npm test -- tests/utils/feasibility.test.ts` | ❌ W0 | ⬜ pending |
| 04-01-02 | 01 | 1 | CALC-03, CALC-04 | T-04-01 | Bound earliest feasible date forward scan to 365 days max | unit | `npm test -- tests/utils/feasibility.test.ts` | ❌ W0 | ⬜ pending |
| 04-01-03 | 01 | 1 | CALC-05 | T-04-02 | Deterministic load balancing with 15-minute quantization, no negative values | unit | `npm test -- tests/utils/feasibility.test.ts` | ❌ W0 | ⬜ pending |
| 04-02-01 | 02 | 2 | CALC-06 | T-04-03 | Candidate allocations stay in React memory until explicit confirmation click | component | `npm test -- tests/components/FeasibilityModal.test.tsx` | ❌ W0 | ⬜ pending |
| 04-02-02 | 02 | 2 | CALC-01, CALC-06 | T-04-03 | Integration with TaskList/TaskCard triggering modal and applying allocations | component | `npm test -- tests/components/FeasibilityModal.test.tsx` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/utils/feasibility.test.ts` — stubs for CALC-01, CALC-02, CALC-03, CALC-04, CALC-05
- [ ] `tests/components/FeasibilityModal.test.tsx` — stubs for CALC-06

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Modal focus trap & Esc dismissal | CALC-06 | Verify keyboard accessibility and focus restoration | Open FeasibilityModal, press Tab to cycle elements, press Esc to close, verify trigger button regains focus |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending 2026-09-27
