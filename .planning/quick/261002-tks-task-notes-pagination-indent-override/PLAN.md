# Quick Task: Task Notes Indicator, 10/Page Pagination, Project Expand Indent, Abnormal Day Range & Edit

## Goals
1. Task table:
   - For tasks with notes in the note feature (`notes` table with `entityType === 'task'`), show a small space-saving indicator (icon/tooltip) instead of bulky "Có ghi chú" text tag.
   - Do not check task single field `record.notes` for this indicator.
   - Change default pagination from 25 to 10.
2. Project page:
   - When expanding a project, indent child content (milestones and direct tasks) with clear visual hierarchy (e.g. left padding/margin and subtle left border accent).
3. Settings page - Capacity tab - Abnormal day:
   - Allow editing an existing abnormal day (capacity override).
   - Allow creating abnormal days by date range (e.g. RangePicker option to apply hours/minutes/note across all selected dates in range).

## Targeted Test Plan
- Run targeted tests for:
  - `tests/components/tasks/TaskTable.test.tsx` (if existing or add test)
  - `tests/components/settings/OverridesTable.test.tsx` (if existing or add test)
