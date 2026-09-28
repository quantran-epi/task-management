---
status: complete
phase: 10-date-range-search-multi-criteria-filtering-standup-export
source:
  - 10-01-SUMMARY.md
  - 10-02-SUMMARY.md
started: 2026-09-28T12:11:23Z
updated: 2026-09-28T12:33:39Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: |
  Kill any running dev server or reload the application afresh.
  The application boots cleanly without runtime errors or console exceptions.
  Dexie database initializes properly and tasks load into the view.
result: pass

### 2. Advanced Filter Panel Toggle & Active Filter Badge
expected: |
  In the Tasks view, observe the "Bộ lọc nâng cao" button.
  Clicking it expands the collapsible advanced filters panel containing controls for Milestone, Work Types, Ops Owner, BA, Execution Date Range, and Deadline Range.
  When any advanced filter is active, a badge on the button indicates the count of active criteria.
result: pass

### 3. Multi-Criteria Tag and WorkType Filtering
expected: |
  In the advanced filter panel, select one or more Work Types (with colored dot tags), Ops Owners, or BAs.
  The task list filters in real time with an AND conjunction across criteria.
  Filtering matches tasks with direct tag assignments as well as tasks inheriting tags from parent milestones or projects.
result: pass

### 4. Date Range Filters (Planned Execution & Deadline)
expected: |
  In the advanced filter panel, select a Planned Execution Date Range ("Khoảng ngày thực hiện") using the RangePicker.
  The table reactively filters to only tasks that have allocated minutes > 0 within that range.
  Select a Deadline Range ("Hạn hoàn thành") to filter tasks whose deadline falls within that window.
result: pass

### 5. Clear Filters Button ("Xóa bộ lọc")
expected: |
  When any filter (search, status, priority, or advanced filter) is active, observe the "Xóa bộ lọc" button in the filter bar.
  Clicking "Xóa bộ lọc" resets all filter inputs to their default empty states and restores the full task list.
result: pass

### 6. Standup Export to Clipboard
expected: |
  In the TaskTable toolbar, observe the "Sao chép Standup" button alongside the task count.
  Clicking "Sao chép Standup" copies a formatted Vietnamese Banking IT Markdown summary of currently filtered tasks to the clipboard with a success message (or displays a fallback modal with selectable text if clipboard access is denied).
  The generated Markdown categorizes tasks into Done, In Progress / Review / Resolved, and Open, displaying work types, Ops/BA tags, deadlines, and urgent indicators.
result: pass

## Summary

total: 6
passed: 6
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
