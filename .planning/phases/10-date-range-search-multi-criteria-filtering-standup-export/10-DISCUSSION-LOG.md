# Phase 10: Date-Range Search, Multi-Criteria Filtering & Standup Export - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-28
**Phase:** 10-date-range-search-multi-criteria-filtering-standup-export
**Areas discussed:** Search UI placement & layout, Execution date search strategy, Standup export format & trigger

---

## Search UI Placement & Filter Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Inline Collapsible Filter Bar | Expand TaskFilterBar with collapsible advanced filter row | ✓ |
| Dedicated Filter Drawer | Separate side drawer for advanced multi-criteria inputs | |
| Filter Modal Dialog | Pop-up modal containing all search criteria | |

**User's choice:** Inline Collapsible Filter Bar
**Notes:** Keeps unified flow without separate tabs or drawers. RangePicker for dates, multiselect for Ops/BA/workType, reset button restores defaults.

---

## Execution Date Search Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Reactive Dexie Allocation Query | Query `plannedAllocations` table date range in Dexie, compute matching taskIds Set, filter in-memory | ✓ |
| Denormalized Allocation Dates | Store execution date arrays on task records | |
| Pure Memory Filter | Load all allocations on mount and filter client-side | |

**User's choice:** Reactive Dexie Allocation Query
**Notes:** `useLiveQuery` on `plannedAllocations.where('date').between(...)` ensures instant reactivity when planning ledger changes. Non-matching tasks are hidden, not dimmed.

---

## Standup Export Format & Trigger

| Option | Description | Selected |
|--------|-------------|----------|
| Toolbar Button + Markdown Clipboard | Click "📋 Sao chép Standup" on toolbar, copy structured markdown to clipboard | ✓ |
| Export Modal with Preview | Open dialog showing preview before copying | |
| Plain Text File Download | Download .md or .txt file directly | |

**User's choice:** Toolbar Button + Markdown Clipboard
**Notes:** Formatted for SHB banking IT daily reporting (Teams/Slack/Email). Groups by status category (`✅ Đã hoàn thành`, `🔄 Đang thực hiện`, `📋 Kế hoạch / Đang chờ`). Includes WorkType, title, project, deadline, and assigned BA/Ops.

---

## Claude's Discretion

- Exact flex wrap thresholds and CSS styling for the collapsible advanced filter section.
- Specific icons for advanced toggle and standup export buttons.
- Fallback handling when `navigator.clipboard` is unavailable.

## Deferred Ideas

- Save and reuse preferred filter combinations (PROD-01 candidate for future milestone).
