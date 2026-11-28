---
phase: quick
plan: 261128-dlj
type: execute
wave: 1
depends_on: []
files_modified:
  - src/views/ItemInsightView.tsx
  - tests/views/ItemInsightView.test.tsx
autonomous: true
requirements:
  - TASK-INSIGHT-LINK-REMINDER-STANDARD
user_setup: []
---

<objective>
Áp chuẩn thiết kế đã có trên CR detail sang task insight (ItemInsightView itemType='task'): bảng link tên+URL cắt bớt, nút thêm căn phải mở modal riêng, sửa link qua modal riêng, xoá link qua Popconfirm; thêm section nhắc nhở với nút thêm căn phải và action sửa/xoá.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
</execution_context>

<context>
@./CLAUDE.md
@src/views/ItemInsightView.tsx
@tests/views/ItemInsightView.test.tsx
</context>

<tasks>
<task type="auto">
  <name>Task 1: Chuẩn hoá link và thêm reminders trên task insight</name>
  <files>src/views/ItemInsightView.tsx, tests/views/ItemInsightView.test.tsx</files>
  <action>Link block dạng bảng (Tên ellipsis 160px + URL monospace ellipsis/title đầy đủ + action type=text, xoá danger trong Popconfirm); nút Thêm link căn phải mở modal riêng upsert qua appendTaskLink/updateTask; remover patch links; thêm section Nhắc nhở với QuickReminderModal target task và xoá reminder qua updateTask. Cập nhật test cho luồng modal.</action>
  <verify>npx tsc --noEmit -p tsconfig.json && npx vitest run tests/views/ItemInsightView.test.tsx --bail=1 && Chrome verify</verify>
  <done>9/9 test task insight đậu; Chrome verify modal sửa/thêm, Popconfirm, modal reminder, layout cân đối.</done>
</task>
</tasks>

<verification>
- tsc, scoped test file, git diff --check
- Chrome: task insight qua Search Everywhere, screenshot sections, click thêm/sửa link, xoá link, thêm reminder
</verification>

<output>
Summary: .planning/quick/261128-dlj-apply-cr-detail-link-and-reminder-standa/261128-dlj-SUMMARY.md
</output>
