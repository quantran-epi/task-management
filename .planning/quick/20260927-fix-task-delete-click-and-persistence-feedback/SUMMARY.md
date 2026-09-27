---
task: Fix task dropdown delete click target and storage persistence feedback
date: 2026-09-27
status: complete
---

# Quick Task Summary: Fix task dropdown delete click target and storage persistence feedback

## What Changed
1. **Task Dropdown Delete Button Click Target**:
   - `src/components/tasks/TaskTable.tsx`: Replaced inline `Popconfirm` inside `label` with `Modal.confirm` triggered via menu item `onClick`.
   - Now clicking anywhere on the delete menu item (icon, text "Xóa", or item padding) reliably triggers the deletion confirmation dialog.
2. **Storage Persistence Request Feedback**:
   - `src/components/settings/StoragePersistenceCard.tsx`: Wrapped `requestPersistence` call with Ant Design `message` notifications (`message.success` on true, `message.warning` explaining browser heuristics/PWA installation on false, `message.error` on exception).
   - Now user receives immediate visible feedback when clicking "Yêu cầu lưu trữ bền vững".
3. **Tests**:
   - Updated `tests/components/TaskTable.test.tsx` to verify `Modal.confirm` invocation from dropdown delete item.
   - Updated `tests/components/settings/StoragePersistenceCard.test.tsx` to verify feedback on success and browser heuristic denial.
