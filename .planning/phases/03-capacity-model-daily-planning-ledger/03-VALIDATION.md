---
phase: 3
slug: capacity-model-daily-planning-ledger
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-26
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.2 + React Testing Library 16.3.3 + fake-indexeddb 6.2.5 |
| **Config file** | `vite.config.ts` |
| **Quick run command** | `npm test -- tests/db/capacityRepo.test.ts tests/db/allocationRepo.test.ts` |
| **Full suite command** | `npm test && npm run build` |
| **Estimated runtime** | ~6 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test && npm run build`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | CAP-01, CAP-02, CAP-03, CAP-04 | T-03-01 | Bounded integer minutes, valid ISO date string validation, template fallback | unit | `npm test -- tests/db/capacityRepo.test.ts tests/utils/capacity.test.ts` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 1 | PLAN-01, PLAN-02, PLAN-05 | T-03-02 | Unique (taskId, date) allocation constraint & inactive task exclusion | unit | `npm test -- tests/db/allocationRepo.test.ts` | ❌ W0 | ⬜ pending |
| 03-02-01 | 02 | 2 | PLAN-03, PLAN-04, UX-02 | T-03-03 | Dual-encoding (color + icon + text) for load states & keyboard navigation | component | `npm test -- tests/components/DayColumnHeader.test.tsx` | ❌ W0 | ⬜ pending |
| 03-02-02 | 02 | 2 | CAP-01, CAP-02, CAP-03 | — | Capacity settings drawer with inline weekly template & date overrides | component | `npm test -- tests/components/CapacitySettingsDrawer.test.tsx` | ❌ W0 | ⬜ pending |
| 03-03-01 | 03 | 3 | PLAN-01, PLAN-02, PLAN-06, UX-05 | T-03-04 | Task allocation modal/popover with estimate tracking & soft overflow warning | component | `npm test -- tests/components/AllocationModal.test.tsx` | ❌ W0 | ⬜ pending |
| 03-03-02 | 03 | 3 | PLAN-01, PLAN-03, UX-02, UX-04 | — | 7-day weekly planner board view, unscheduled task sidebar, route integration | integration | `npm test -- tests/components/PlannerView.test.tsx` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/db/capacityRepo.test.ts` — weekly rules & date overrides CRUD (CAP-01, CAP-02, CAP-03)
- [ ] `tests/utils/capacity.test.ts` — effective capacity calculation, net balance, and load states (CAP-04, PLAN-03, PLAN-04)
- [ ] `tests/db/allocationRepo.test.ts` — planned allocations CRUD, upsert semantics, inactive exclusion (PLAN-01, PLAN-02, PLAN-05)
- [ ] `tests/components/DayColumnHeader.test.tsx` — accessible load indicator rendering (PLAN-04, UX-02)
- [ ] `tests/components/PlannerView.test.tsx` — weekly grid, navigation, and sidebar integration (PLAN-01, PLAN-03)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| WCAG dual-encoding & contrast | PLAN-04, UX-02 | Visual verification of icons, badges, and text contrast in light/dark mode | Inspect DayColumnHeader in Available, Busy, Overloaded, and No Capacity states |
| Fast task allocation flow | UX-05, PLAN-01 | Interaction ergonomics and click efficiency | From PlannerView, pick an unscheduled task, allocate 120m to a day, verify total updates instantly |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter
