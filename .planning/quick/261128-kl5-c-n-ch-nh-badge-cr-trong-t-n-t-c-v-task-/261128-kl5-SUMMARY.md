---
quick_id: 261128-kl5
slug: c-n-ch-nh-badge-cr-trong-t-n-t-c-v-task-
date: 2026-11-28
status: complete
---

# Quick Task 261128-kl5: Căn chỉnh badge CR trong ô tên tác vụ task list

## What changed
- `.tm-tasklist__meta .tm-tasklist__cr-tag.ant-tag`: dùng `inline-flex` + `align-items:center` + `box-sizing:border-box` + `vertical-align:top` để chữ CR căn giữa trong badge 18px, thẳng hàng với task name 18px. Giữ màu CR type, border, radius, padding ngang, hành vi click filter CR.
- Không sửa markup `TaskTable.tsx`; CSS `.tm-tasklist__filter-popup` giữ nguyên.

## Verification
- `npx tsc --noEmit`: pass.
- `npx vitest run src/components/tasks/__tests__/TaskTableDense.test.tsx`: 1/1 pass.
- Chrome (Playwright, isolated profile) 1280 light/dark, 768 light, 375 dark: badge và task name cùng trục x, cùng chiều cao 18px, text không bị cắt, không page error; screenshot trong thư mục task.

## Files changed
- `src/components/tasks/tasklist-workspace.css`

## Commits
- `5cac8953` — fix(261128-kl5): căn giữa nội dung badge CR trong ô tên tác vụ
- plan/docs: orchestrator commit.
