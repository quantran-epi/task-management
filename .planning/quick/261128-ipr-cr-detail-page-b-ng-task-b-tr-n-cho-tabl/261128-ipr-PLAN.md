---
quick: 261128-ipr
date: 2026-11-28
status: complete
description: "CR detail page: bảng task bị tràn, cho table width 100%; các section còn lại sắp xếp thành 2 cột bên dưới bảng task"
---

# 261128-ipr — CR detail task table full-width + 2-column sections

## Context
- Branch `pre-v1.6-baseline`, tiếng Việt, xưng "sếp".
- Peer 85 xác nhận chỉ làm drawer shell/task detail dùng chung, không đụng `ChangeRequestDetailView.tsx`. Peer 24 xác nhận không đụng file này; đã commit artifact hxf `f0aae79b`. Không rebase/reset, không push.
- File mục tiêu: `src/views/ChangeRequestDetailView.tsx` (1 file). Test liên quan: `tests/views/ChangeRequestDetailView.test.tsx`; nếu cần, thêm guard CSS/test trong file test đó thay vì tạo file mới.
- Hiện tại `src/views/ChangeRequestDetailView.tsx:858` dùng grid `minmax(0, 2.4fr) minmax(280px, 1fr)`: bảng task nằm cột trái, cards nằm cột phải. Cột task bị ép, trong khi render task name có `minWidth: 320` (`~line 952`) cộng 6 cột cố định → bảng tràn/horizontal scroll ngay cả khi khung CR detail đủ rộng.

## Task 1 — Full-width task table
- Bỏ grid 2 cột bao quanh bảng + cards. Bảng task chiếm `width: 100%` của container (container đã có `minWidth: 0` và `maxWidth: 1400` ở root).
- Giữ nguyên mọi handler, `data-testid`, search/filter, sorting theo mốc (rowSpan), dropdown tác vụ, `EntityNotesSection`, modal, `TaskDrawer`. Không đổi schema/DB.
- Giảm/bỏ `minWidth: 320` cứng trong render cột Task; dùng `minWidth: 0` + ellipsis (`Text ellipsis` đã có) để cột co giãn theo bảng. Giữ `width` của các cột cố định nếu cần dùng lại, nhưng tổng phải fit `100%` container ở viewport desktop.
- Table AntD: đảm bảo wrapper không tạo horizontal scroll thừa, ví dụ `scroll={{ x: 'max-content' }}` hiện có (nếu có) chỉ giữ khi thực sự cần; ưu tiên bảng tự co giãn `width: 100%`.

## Task 2 — Secondary cards 2 cột bên dưới bảng
- Sau block bảng, render `secondaryBlocks` trong grid 2 cột: `gridTemplateColumns: 'repeat(2, minmax(0, 1fr))'`, `gap: var(--gap-12)`, `alignItems: 'start'`, mỗi `Card` `style={{ minWidth: 0 }}`.
- Responsive: ở viewport hẹp (dưới ~900px) ép về 1 cột bằng CSS media query hoặc style inline có media tương đương; không dùng lib mới.
- Thứ tự block giữ nguyên: reminders, links, notes, milestones, jira. Mỗi `data-testid` giữ nguyên.

## Task 3 — Test + verify
- Cập nhật `tests/views/ChangeRequestDetailView.test.tsx` thay assertion grid cũ (`minmax(0, 2.4fr) minmax(280px, 1fr)`) bằng assertion mới: bảng task là block full-width đứng trước grid cards, grid cards có `gridTemplateColumns` 2 cột và chứa đủ 5 block testid.
- Chạy scoped: `npx vitest run tests/views/ChangeRequestDetailView.test.tsx src/views/__tests__/ChangeRequestDetailView.reminderAndSearch.test.tsx --bail=1` + `npx tsc --noEmit`. KHÔNG chạy full Vitest.
- Verify Chrome riêng (Playwright system Chrome, context isolate, light/dark, 1280px): bảng không tràn ngang, cards xếp 2 hàng cột dưới bảng, dark không chói. Ảnh lưu `/tmp/ipr-verify/`.
- Commit riêng, `git add -- <exact paths>`, kiểm tra `git diff --cached --name-only`. Không stage `.planning/STATE.md`, artifact peer, file drawer. Commit message kết thúc `Co-Authored-By: Claude Code <noreply@anthropic.com>`. Không push.

## Constraints
- Giữ testid/id/aria-label, handler, sorting/sticky/keyboard nếu có; không đổi schema/DB, không thêm dependency.
- Không đụng file peer: `src/components/tasks/TaskDrawer.tsx`, drawer shell dùng chung, `src/services/backup/*`, `src/styles/workbench-tokens.css`, `.planning/STATE.md`, artifact fvp/gna/hxf/i9x/phase 52.
- Không dùng `git add -A`, `git commit -a`, `git checkout --`, `git stash`, `git reset --hard`, `git clean`.
