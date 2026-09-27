---
phase: 05
slug: actionable-dashboard-workload-forecasting
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-27
---

# Phase 05 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.2 |
| **Config file** | `vite.config.ts` |
| **Quick run command** | `npx vitest run tests/utils/dashboard.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/utils/dashboard.test.ts`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | DASH-01, DASH-04, DASH-05 | T-05-01 | Sanitize `date` query param against `YYYY-MM-DD` | unit | `npx vitest run tests/utils/dashboard.test.ts` | ❌ W0 | ⬜ pending |
| 05-01-02 | 01 | 1 | DASH-06 | T-05-02 | Match route against strict whitelist `AppRoute` union | unit | `npx vitest run tests/hooks/useHashRoute.test.ts` | ❌ W0 | ⬜ pending |
| 05-02-01 | 02 | 2 | DASH-02 | N/A | Correct load status badge and hours math | unit / component | `npx vitest run tests/components/TodaySummaryCard.test.tsx` | ❌ W0 | ⬜ pending |
| 05-02-02 | 02 | 2 | DASH-01, DASH-06 | N/A | Grouping and in-place status changes / drawer opening | component | `npx vitest run tests/components/AttentionTodayList.test.tsx` | ❌ W0 | ⬜ pending |
| 05-03-01 | 03 | 2 | DASH-03, DASH-04, DASH-05, DASH-06 | N/A | Horizon switching, overload alert chips, and day card click | component | `npx vitest run tests/components/WorkloadForecast.test.tsx` | ❌ W0 | ⬜ pending |
| 05-03-02 | 03 | 3 | DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, DASH-06 | T-05-01 | End-to-end integration and Planner deep linking | component / integration | `npx vitest run tests/views/DashboardView.test.tsx` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/utils/dashboard.test.ts` — stubs for DASH-01, DASH-04, DASH-05, query param parsing
- [ ] `tests/components/TodaySummaryCard.test.tsx` — stubs for DASH-02
- [ ] `tests/components/AttentionTodayList.test.tsx` — stubs for DASH-01, DASH-06
- [ ] `tests/components/WorkloadForecast.test.tsx` — stubs for DASH-03, DASH-04, DASH-05, DASH-06
- [ ] `tests/views/DashboardView.test.tsx` — stubs for DASH-01..06 assembly

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual polish and card responsiveness across screen widths | DASH-03, DASH-06 | Responsive flex/grid wrapping | Resize window between 768px and 1440px to verify card layouts |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-09-27
