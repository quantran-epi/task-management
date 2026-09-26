---
phase: 2
slug: work-hierarchy-fast-task-management
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-26
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.2 + React Testing Library 16.3.3 + fake-indexeddb 6.2.5 |
| **Config file** | `vite.config.ts` |
| **Quick run command** | `npm test` |
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
| 02-01-01 | 01 | 1 | WORK-01, WORK-02, WORK-03 | T-02-01 | Zod input schema validation & Dexie transaction boundaries | unit/integration | `npm test tests/db/repos.test.ts` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | WORK-04, TASK-02 | T-02-02 | Stable UUID preservation on reparenting & bounded integer minutes | unit | `npm test tests/utils/time.test.ts tests/db/reparent.test.ts` | ❌ W0 | ⬜ pending |
| 02-01-03 | 01 | 1 | WORK-05 | T-02-03 | Atomic cascade deletion with allocation cleanup in Dexie transaction | integration | `npm test tests/db/cascadeRepo.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 2 | TASK-05 | T-02-04 | Strict date horizon filtering without timezone drift | unit | `npm test tests/utils/filter.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-02 | 02 | 2 | TASK-01, UX-03 | T-02-05 | Focus restoration & inline form validation | component | `npm test tests/components/TaskDrawer.test.tsx` | ❌ W0 | ⬜ pending |
| 02-02-03 | 02 | 2 | TASK-03, TASK-04, TASK-06 | — | Instant inline status dropdown & progress slider updates | component | `npm test tests/components/InlineControls.test.tsx` | ❌ W0 | ⬜ pending |
| 02-03-01 | 03 | 3 | UX-02, UX-05 | T-02-06 | Non-colliding global keyboard shortcuts & quick-add parsing | component | `npm test tests/components/QuickAddBar.test.tsx tests/hooks/useKeyboardShortcuts.test.ts` | ❌ W0 | ⬜ pending |
| 02-03-02 | 03 | 3 | WORK-01, WORK-03, WORK-05 | — | Integrated project hierarchy view & deletion modal confirmation | integration | `npm test tests/components/HierarchyView.test.tsx` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/db/repos.test.ts` — repository CRUD for projects, milestones, tasks (WORK-01, WORK-02, WORK-03)
- [ ] `tests/utils/time.test.ts` — time estimate parsing and formatting (TASK-02)
- [ ] `tests/db/reparent.test.ts` — reparenting tasks preserving UUID (WORK-04)
- [ ] `tests/db/cascadeRepo.test.ts` — cascade deletion and allocation cleanup (WORK-05)
- [ ] `tests/utils/filter.test.ts` — search, filter, and date horizon sorting (TASK-05)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| WCAG focus restoration | UX-02, UX-03 | Browser DOM focus ring and screen reader accessibility | Open task drawer with keyboard Enter, press Escape to close, verify focus returns to initiating table row |
| Quick-add shortcut ergonomics | UX-05 | Interactive global hotkey feel | Press `c` while viewing tasks table, verify quick-add input focuses; press Escape to dismiss |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-09-26
