---
quick_id: 261128-k1q
slug: fix-task-list-header-v-dropdown-filter
date: 2026-11-28
status: complete
---

# Quick Task 261128-k1q: Fix task list header và dropdown filter

## What changed
- Bỏ subtitle `.command deck · quản lý, phân bổ, theo dõi` khỏi deck head; bỏ luôn rule CSS `.tm-tasklist__deck-sub` đã chết.
- Mọi Select trong filter bar (CR, Subsystem, Sort, horizon, status, priority, work type, Ops Owner, BA, Jira) dùng chung props `popupMatchSelectWidth={false}` + `popupClassName="tm-tasklist__filter-popup"`.
- CSS `.tm-tasklist__filter-popup .ant-select-item-option-content { white-space: nowrap; }` giữ option một dòng, popup tự rộng theo option dài nhất nhờ rc-trigger `adjustX`/`dynamicInset`.

## Verification
- `npx tsc --noEmit`: pass.
- `npx vitest run src/components/tasks/__tests__/TaskTableDense.test.tsx`: 1 file / 1 test pass.
- Chrome (Playwright, isolated profile, app trên dev server 5173): deck-sub count 0; desktop 1280 mở 6 dropdown (sort/horizon/status/priority/worktype/jira), mọi option đều `scrollWidth <= clientWidth`, không page error. Kiểm tra thêm responsive 768/375 và light/dark trong cùng phiên Chrome.
- Chrome verify 1280/768/375, light/dark: deck-sub count = 0, không page error. Screenshot: `261128-k1q-filter-1280.png`, `261128-k1q-filter-768.png`, `261128-k1q-filter-375.png`, `261128-k1q-filter-dark.png`.
- Đo popup trực tiếp trên selector `.ant-select-dropdown:not(.ant-select-dropdown-hidden)`: sort 150px so với trigger 100px; status 200px; worktype 158px; Jira 161px (375px: 291px). Option không bị cắt (`clipped=0`). Một số measurement trước đó trả về 0 do popup ẩn sau Escape cùng tick — đã đo lại; đây là artifacts của script test, không phải lỗi UI.

## Files changed
- `src/views/TasksView.tsx`
- `src/components/tasks/TaskFilterBar.tsx`
- `src/components/tasks/tasklist-workspace.css`

## Commits
- code: `7c03777750ef70a55629f7553989789e812a4169` — fix(261128-k1q): bỏ subtitle thừa và mở rộng dropdown filter task list
- plan/docs: orchestrator commit.
