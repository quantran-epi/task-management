---
phase: quick
plan: 260928-kn4
type: execute
wave: 1
depends_on: []
files_modified:
  - src/types/models.ts
  - src/validation/schemas.ts
  - src/validation/backupSchemas.ts
  - src/db/repositories/projectRepo.ts
  - src/components/projects/ProjectModal.tsx
  - src/components/projects/ProjectTable.tsx
  - src/components/dashboard/AttentionTodayList.tsx
  - src/components/planner/DayColumnHeader.tsx
  - src/components/tasks/TaskFilterBar.tsx
  - src/components/planner/AllocationModal.tsx
  - src/views/TasksView.tsx
  - src/components/planner/FeasibilityModal.tsx
autonomous: true
requirements:
  - PROJECT-NAME-ON-STANDALONE-TASKS
  - PROJECT-URL-DOCUMENT-LINKS
  - PLANNER-DAY-COLUMN-HEADER-STABLE-HEIGHT
  - ADVANCED-FILTER-ALIGNMENT
  - PLANNER-DISTRIBUTE-PROJECT-FILTER

estimate:
  tokens: 30000
  tasks: 5
  confidence: high
---

# Quick Plan 260928-kn4: UI Enhancements & Project Links

Implement 5 user-requested enhancements:
1. Show project name for standalone tasks (AttentionTodayList, FeasibilityModal, TasksView task picker modal).
2. Project link field: Add multiple URL/documentLinks support to Project model, schemas, repository, modal form, and table.
3. Planner day column header stable height: Ensure uniform height across all columns regardless of today tag, warning tags, or status.
4. Advanced filter field alignment: Refactor filter bar into clean, consistent grid layout with top labels.
5. Planner date column "Phân bổ" modal: Add project combobox filter and project subtitles in task dropdown.
