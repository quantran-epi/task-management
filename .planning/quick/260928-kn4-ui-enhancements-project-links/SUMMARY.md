---
phase: quick
plan: 260928-kn4
status: complete
subsystem: ui-planner-tasks-projects
tags:
  - project-name-context
  - project-links
  - planner-column-height
  - advanced-filter-grid
  - allocation-project-filter
requires: []
provides:
  - Project name subtitles in AttentionTodayList, FeasibilityModal, and TasksView distribute task modal
  - Multiple documentLinks URLs on Project model, validation schemas, repository, modal, and table
  - Stable uniform height on Planner DayColumnHeader (minHeight 142px)
  - Grid-aligned advanced filter panel in TaskFilterBar
  - Project combobox filter and project context in AllocationModal
affects:
  - Dashboard attention list
  - Projects modal and table
  - Weekly planner column headers and allocation modal
  - Tasks view filter bar and auto-distribute modal
  - Feasibility modal
tech-stack:
  added: []
  patterns:
    - Form.List for dynamic URL fields
    - Ant Design Row/Col grid layout for filter forms
    - Min-height container normalization for multi-column grids
key-files:
  created: []
  modified:
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
    - src/views/ProjectsView.tsx
    - src/views/TasksView.tsx
    - src/components/planner/FeasibilityModal.tsx
metrics:
  duration: 8m
  completed_date: "2026-09-28"
---

# Quick Plan 260928-kn4: UI Enhancements & Project Links Summary

Implemented all 5 requested items:
1. Display project names for tasks in AttentionTodayList, FeasibilityModal, and TasksView auto-distribute modal.
2. Added documentLinks URL field (multiple URLs) to Project entity, schemas, repository, ProjectModal, and ProjectTable.
3. Stabilized DayColumnHeader height to uniform 142px minimum across all week columns.
4. Cleanly aligned advanced filter fields into a 4-column responsive Ant Design Row/Col grid with top labels.
5. Added project combobox filter and project subtitles to task dropdown in AllocationModal ("Phân bổ" on day column).
