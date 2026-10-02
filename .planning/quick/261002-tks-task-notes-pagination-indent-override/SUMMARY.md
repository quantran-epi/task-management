---
status: complete
date: 2026-10-02
---

# Quick Task Summary: Task Notes Indicator, 10/Page Pagination, Project Expand Indent, Abnormal Day Range & Edit

## Work Completed
1. **Task Table Note Indicator**:
   - Replaced bulky `Có ghi chú` Tag with compact `FileTextOutlined` icon indicator inline with task name.
   - Connected indicator to `db.notes` feature entries (`entityType === 'task'`) via `useLiveQuery` rather than single-field `task.notes`.
2. **Task Table Pagination**:
   - Updated default `pageSize` in `TaskTable` from 25 to 10.
3. **Project Table Indentation**:
   - Enhanced expanded project container with left margin, accent left border (`token.colorPrimaryBorder`), and subtle background tint.
   - Enhanced expanded milestone container with nested dashed left border and background indent.
   - Added compact note indicator to task names in project view.
4. **Settings Abnormal Day (Capacity Overrides)**:
   - Added edit action ("Sửa") to existing override records in `OverridesTable` with pre-filled form.
   - Added Segmented control to create abnormal days either for a single day or across a date range (`DatePicker.RangePicker`).
   - Fixed `setCapacityOverride` to allow clearing notes on edit.
