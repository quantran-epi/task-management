---
phase: "13"
slug: "enhanced-workload-analytics-milestone-burndown"
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-09-30"
updated: "2026-09-30"
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.2 + React Testing Library 16.3.3 |
| **Config file** | `vite.config.ts` |
| **Quick run command** | `npx vitest run tests/utils/analytics.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/utils/analytics.test.ts`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 13-01-01 | 01 | 1 | ANLT-01 | — | N/A | unit | `npx vitest run tests/hooks/useHashRoute.test.ts` | ✅ | ✅ green |
| 13-01-02 | 01 | 1 | ANLT-01, ANLT-02 | — | N/A | unit | `npx vitest run tests/utils/analytics.test.ts` | ✅ | ✅ green |
| 13-01-03 | 01 | 1 | ANLT-02, ANLT-03 | — | N/A | unit | `npx vitest run tests/utils/analytics.test.ts` | ✅ | ✅ green |
| 13-02-01 | 02 | 2 | ANLT-01 | — | Input validation for SVG coordinates prevents NaN / script injection | component | `npx vitest run tests/components/analytics/BurndownSvgChart.test.tsx` | ✅ | ✅ green |
| 13-02-02 | 02 | 2 | ANLT-02 | — | N/A | component | `npx vitest run tests/components/analytics/StackedStatusBar.test.tsx` | ✅ | ✅ green |
| 13-02-03 | 02 | 2 | ANLT-03 | — | N/A | component | `npx vitest run tests/components/analytics/WorkloadProportionBar.test.tsx` | ✅ | ✅ green |
| 13-03-01 | 03 | 3 | ANLT-01, ANLT-02, ANLT-03 | — | N/A | integration | `npx vitest run tests/views/AnalyticsView.test.tsx` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/utils/analytics.test.ts` — covers pure computation algorithms for ANLT-01, ANLT-02, ANLT-03
- [x] `tests/components/analytics/BurndownSvgChart.test.tsx` — covers interactive SVG chart rendering
- [x] `tests/components/analytics/StackedStatusBar.test.tsx` — covers multi-segment status proportions
- [x] `tests/components/analytics/WorkloadProportionBar.test.tsx` — covers stakeholder/work-type proportion bar
- [x] `tests/views/AnalyticsView.test.tsx` — covers full dashboard layout, empty states, and tab switching

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SVG Burndown tooltip tracking & rendering fluidity | ANLT-01 | Browser mousemove crosshair rendering & visual tooltip positioning | Move cursor across milestone burndown chart and verify tooltip stays within viewport bounds |
| Visual clarity of color contrast across dark/light theme | ANLT-02, ANLT-03 | Ant Design theme token styling | Toggle dark/light theme and inspect stacked bar and proportion bar readability |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** verified

---

## Validation Audit 2026-09-30

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |
