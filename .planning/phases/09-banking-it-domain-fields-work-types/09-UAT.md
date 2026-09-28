---
status: complete
phase: 09-banking-it-domain-fields-work-types
source:
  - 09-01-SUMMARY.md
  - 09-02-SUMMARY.md
  - 09-03-SUMMARY.md
started: 2026-09-28T12:00:00Z
updated: 2026-09-28T12:30:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: |
  Kill any running dev server or reload the application afresh.
  The application boots cleanly without runtime errors or console exceptions.
  Database initializes Dexie schema v2 properly.
result: pass

### 2. QuickAddBar WorkType Selector
expected: |
  In the Tasks view QuickAddBar, observe the compact work type selector.
  It defaults to "Lập trình" (code, blue icon).
  Selecting a different work type (e.g., "Tài liệu", "Họp", "Hỗ trợ/Test") and creating a task saves it with that work type.
result: pass

### 3. TaskDrawer WorkType and Tag Fields
expected: |
  Open the TaskDrawer (create or edit a task).
  Notice the WorkType segmented/select control and tag input fields for "Ops Owner" and "BA (Business Analyst)".
  If the task's milestone or project has tags defined, placeholders show inheritance hints (e.g., "Kế thừa từ...").
  Typing tags trims whitespace and autocompletes from existing distinct tags.
result: pass

### 4. TaskTable WorkType and Tag Columns
expected: |
  In the Tasks table, check the "Loại việc", "Ops Owner", and "BA" columns.
  "Loại việc" displays triple-encoded badges (icon, preset color, Vietnamese label) with a column filter.
  "Ops Owner" and "BA" columns show up to 2 tags with overflow (+N popover).
  Inherited tags display with dashed borders and an origin tooltip indicating where they are inherited from.
result: pass

### 5. Project and Milestone Modals Tag Management
expected: |
  Open ProjectModal (create or edit a project) and MilestoneModal.
  Both modals contain tag input fields for Ops Owners and Business Analysts.
  MilestoneModal shows project-level tag inheritance hints in placeholders when parent project has tags.
  Saving updates project and milestone tags properly in the database.
result: pass

### 6. ProjectTable Tag Columns Display
expected: |
  In the Projects view table, observe the Ops Owner and BA columns.
  Tags entered on projects are displayed cleanly in the table cells.
result: pass

## Summary

total: 6
passed: 6
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
