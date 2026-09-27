---
task: Fix task dropdown delete click target and storage persistence feedback
date: 2026-09-27
status: in-progress
---

# Quick Task: Fix task dropdown delete click target and storage persistence feedback

## Objective
1. Fix task list dropdown menu delete item so clicking anywhere on the item (icon, text, row) triggers delete confirmation via `Modal.confirm` instead of `Popconfirm` nested only inside `label` text.
2. Provide explicit user feedback via Ant Design `message` when user clicks "Yêu cầu lưu trữ bền vững" in Settings, informing them of the persistence result or explaining browser heuristics.

## Proposed Changes
- `src/components/tasks/TaskTable.tsx`:
  - Replace `Popconfirm` wrapping `<span>Xóa</span>` with `onClick` handler calling `Modal.confirm`.
  - Import `Modal, message` from `antd`, remove unused `Popconfirm` import.
- `src/components/settings/StoragePersistenceCard.tsx`:
  - Handle `requestPersistence` result with `message.success` on true, `message.warning` explaining heuristics on false, and `message.error` on exception.
- Tests:
  - Update `tests/components/TaskTable.test.tsx` and `tests/components/settings/StoragePersistenceCard.test.tsx` as needed.
