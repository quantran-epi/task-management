---
status: resolved
trigger: "check xem tại sao hiện tại các drawer của taskmate mở hơi chậm, ví dụ drawer task detail, fix triệt để đi"
created: 2026-11-28
updated: 2026-11-28
---

## Symptoms

- Expected: click mở drawer (đặc biệt task detail) phản hồi ngay, animation mượt.
- Actual: mở hơi chậm (độ trễ cảm nhận được khi click).
- Errors: không có báo lỗi.
- Timeline: hiện tại, chưa rõ từ khi nào.
- Reproduction: click mở task detail drawer trong TaskMate.
- Context: nhiều session cùng working tree; phạm vi cho phép: common drawer shell (`src/components/ui/*`), task detail (`TaskDrawer.tsx`, `TaskDrawerPlanning.tsx`), không đụng AI/tasklist/validation files.

## Current Focus

- hypothesis: `TaskDrawer` dùng `loading={loading}` → AntD DrawerPanel thay children bằng `<Skeleton>`; khi data về, mount toàn bộ cây form (40+ AntD controls, 4 tabs, nhiều sections) trong một synchronous commit. `destroyOnClose` bắt mount lại mỗi lần mở. Đây là work nặng trên critical path.
- next_action: xong — fix applied, benchmark + browser UAT + scoped tests passed
- expecting: resolved

## Evidence

- timestamp: 2026-11-28 — Chrome headless, dev server :5173 (React DEV + StrictMode), seed 1 CR + 20 tasks. MutationObserver marks: click→drawer-dom 150ms, drawer-dom→skeleton-gone (form đầy đủ) 378ms. Long tasks: +167ms/444ms (self). CPU profiler: `unsubscribe` (Dexie) 32ms self, React commit `performWorkOnRoot` 450ms inclusive.
- timestamp: 2026-11-28 — Production bundle (vite build, tĩnh :5199), cùng dataset. Marks: click→drawer-dom 44ms, drawer-dom→skeleton-gone 169ms. Xác nhận form mount là phase chậm, không phải DB query (DB chỉ 1 CR/20 tasks).
- timestamp: 2026-11-28 — Đọc `node_modules/antd/es/drawer/DrawerPanel.js`: khi `loading` true, render `<Skeleton>` thay `children`; `destroyOnHidden ?? destroyOnClose` truyền vào rc-drawer. `getSharedControlTokens()` trong `ui/drawer.tsx` là static object, không phải nguyên nhân.
- timestamp: 2026-11-28 — Fix applied: bỏ `destroyOnClose` + `loading` prop; bọc nội dung bằng `<Spin spinning={loading}>`; `form.resetFields()` + reset preview/ghost state trong loadData để tránh stale data giữa các task.
- timestamp: 2026-11-28 — Benchmark prod (5 lần mở/đóng, cùng task, median): baseline click→form-ready 138ms; sau fix 75ms (giảm ~45%). Lần đầu sau fix 223ms (mount form lần đầu), các lần sau ~70ms. Baseline mỗi lần đều ~140ms do mount lại.
- timestamp: 2026-11-28 — Scoped tests `src/components/tasks/__tests__/TaskDrawer.test.tsx`: 4/4 passed. Browser UAT prod: mở task 0 → task 1 → task 0 lại, tên đúng từng task, 4 tabs render, spin overlay biến mất sau load, không stale field.
