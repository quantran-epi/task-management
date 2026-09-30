---
phase: "13"
slug: "enhanced-workload-analytics-milestone-burndown"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-09-30"
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
| 13-01-01 | 01 | 1 | ANLT-01 | — | N/A | unit | `npx vitest run tests/utils/analytics.test.ts` | ❌ W0 | ⬜ pending |
| 13-01-02 | 01 | 1 | ANLT-02 | — | N/A | unit | `npx vitest run tests/utils/analytics.test.ts` | ❌ W0 | ⬜ pending |
| 13-01-03 | 01 | 1 | ANLT-03 | — | N/A | unit | `npx vitest run tests/utils/analytics.test.ts` | ❌ W0 | ⬜ pending |
| 13-02-01 | 02 | 2 | ANLT-01 | — | Input validation for SVG coordinates prevents NaN / script injection | component | `npx vitest run tests/components/analytics/BurndownSvgChart.test.tsx` | ❌ W0 | ⬜ pending |
| 13-02-02 | 02 | 2 | ANLT-02 | — | N/A | component | `npx vitest run tests/components/analytics/StackedStatusBar.test.tsx` | ❌ W0 | ⬜ pending |
| 13-02-03 | 02 | 2 | ANLT-03 | — | N/A | component | `npx vitest run tests/components/analytics/WorkloadProportionBar.test.tsx` | ❌ W0 | ⬜ pending |
| 13-03-01 | 03 | 3 | ANLT-01, ANLT-02, ANLT-03 | — | N/A | integration | `npx vitest run tests/views/AnalyticsView.test.tsx` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/utils/analytics.test.ts` — covers pure computation algorithms for ANLT-01, ANLT-02, ANLT-03
- [ ] `tests/components/analytics/BurndownSvgChart.test.tsx` — covers interactive SVG chart rendering
- [ ] `tests/views/AnalyticsView.test.tsx` — covers full dashboard layout, empty states, and tab switching

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SVG Burndown tooltip tracking & rendering fluidity | ANLT-01 | Browser mousemove crosshair rendering & visual tooltip positioning | Move cursor across milestone burndown chart and verify tooltip stays within viewport bounds |
| Visual clarity of color contrast across dark/light theme | ANLT-02, ANLT-03 | Ant Design theme token styling | Toggle dark/light theme and inspect stacked bar and proportion bar readability |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
