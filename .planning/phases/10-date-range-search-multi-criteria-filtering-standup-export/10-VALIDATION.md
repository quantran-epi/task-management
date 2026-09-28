---
phase: "10"
slug: "date-range-search-multi-criteria-filtering-standup-export"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-09-28"
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.2 |
| **Config file** | `vite.config.ts` |
| **Quick run command** | `npx vitest run tests/utils/filter.test.ts tests/utils/standup.test.ts --environment node` |
| **Full suite command** | `npx vitest run --environment node` |
| **Estimated runtime** | ~2 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/utils/filter.test.ts tests/utils/standup.test.ts --environment node`
- **After every plan wave:** Run `npm run build && npx vitest run tests/utils/ tests/db/ --environment node`
- **Before `/gsd-verify-work`:** Full suite must be green + `npm run build` zero TypeScript errors
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 1 | SRCH-01 | T-10-02 | Bounded Dexie B-tree range query on planned allocations date index | unit / db | `npx vitest run tests/db/allocationRepo.test.ts --environment node` | ❌ W0 | ⬜ pending |
| 10-01-02 | 01 | 1 | SRCH-01, SRCH-02, SRCH-03 | T-10-02 | Multi-criteria and date-range filter pipeline with ancestor inheritance | unit | `npx vitest run tests/utils/filter.test.ts --environment node` | ❌ W0 | ⬜ pending |
| 10-01-03 | 01 | 1 | SRCH-04 | T-10-01 | Plain text Markdown formatting with status grouping and XSS avoidance | unit | `npx vitest run tests/utils/standup.test.ts --environment node` | ❌ W0 | ⬜ pending |
| 10-02-01 | 02 | 2 | SRCH-01, SRCH-02, SRCH-03 | T-10-02 | Filter state reactive hook with debounced input and Dexie live query integration | unit / component | `npm run build` | ✅ | ⬜ pending |
| 10-02-02 | 02 | 2 | SRCH-01, SRCH-02, SRCH-03, SRCH-04 | T-10-03 | Safe clipboard copy with error toast and fallback modal, full UI integration in TaskFilterBar and TasksView | component | `npm run build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/utils/standup.test.ts` — stubs for SRCH-04 standup Markdown generation, formatting, status grouping, and empty category handling.
- [ ] Extend `tests/utils/filter.test.ts` — add test cases covering `executionDateRange` with Set matching, `deadlineRange` boundary tests, `workTypes`, `milestoneId`, and `opsOwners`/`businessAnalysts` inheritance filtering.
- [ ] Extend `tests/db/allocationRepo.test.ts` — add test verifying `getTaskIdsWithAllocationsInRange` using `fake-indexeddb`.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Clipboard Copy & Toast Feedback | SRCH-04 | Async browser clipboard write requires secure context and user gesture | Click "Sao chép Standup" in Task table toolbar, verify success toast "Đã sao chép báo cáo Standup vào clipboard" appears, and paste text into an editor to confirm correct Markdown structure. |
| Collapsible Advanced Filters Animation & Badge | SRCH-01, SRCH-02, SRCH-03 | Visual interaction & Ant Design collapse transitions | Click "Bộ lọc nâng cao", confirm panel smoothly expands with RangePickers and multi-select tags; select filters and verify badge count matches active items. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending 2026-09-28
