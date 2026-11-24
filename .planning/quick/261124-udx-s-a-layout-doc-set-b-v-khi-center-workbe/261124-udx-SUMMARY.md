---
phase: 261124-udx
status: complete
description: Sửa layout doc-set bị vỡ khi center workbench hẹp (~479px, Docs Explorer + Tool Explorer mở)
commit: a6ae8ca5, d3401afd
date: 2026-11-24
---

# Quick Task 261124-udx: Sửa layout doc-set khi center hẹp

## Đã làm

**Task 1 — `src/workbench/DocSetLibrary.tsx`**
- Thêm `rootRef` + `ResizeObserver` đo `containerWidth`, fallback `root.clientWidth` lúc mount.
- Rail co `248px → 160px` khi container `< 640px`; giữ 248px khi rộng (winner 002/A).
- Detail pane padding `16px → 8px` khi hẹp; tên bộ `ellipsis` để không tràn rail.

**Task 2 — `src/workbench/DocumentSetDetail.tsx`, `DocumentSetForm.tsx`, test**
- Tìm ra root cause của mọi measure sai: `useEffect` đăng ký `ResizeObserver` chạy ở render đầu khi `set` từ `useLiveQuery` còn `undefined` (component early-return), nên `rootRef.current` là `null` và observer **không bao giờ được đăng ký**. Fix: dependency `[set?.id]` để effect chạy lại khi set có sẵn.
- Đọc `root.clientWidth` thay vì `entry.contentRect.width` trong callback (nguồn sự thật layout, tránh lệch scale).
- Giữ nguyên các guard từ working tree 261124-sav: root `width/minWidth/overflow`, toolbar responsive, inspector conditional `detailWidth >= 560`, compact selected line khi hẹp.
- Đưa vào commit dòng `Form ... style={{ width: '100%', minWidth: 0 }}` còn tồn từ 261124-sav.
- Test `DocumentSetDetailPublished.test.tsx`: mock `ResizeObserver` theo `data-testid`, set `clientWidth` ban đầu 479 cho detail; thêm 2 case narrow (rail 160/padding 8, toolbar dùng được, aside ẩn, compact line, ≤25 row/60 docs) và wide (aside render).

## Verify

- `npx tsc --noEmit` — sạch.
- `npx vitest run src/workbench/__tests__/DocumentSetDetailPublished.test.tsx --bail=1` — 5/5 pass.
- Chrome UAT (viewport 1280×800, Docs Explorer + Tool Explorer mở, center 605px): rail 160px, detail `clientWidth` 413px, Alert section 366px (trước 96px), không wrap từng chữ, `aside` ẩn, compact selected line có text, 25 row DOM/60 docs.
- Chrome UAT (viewport 1600×900, panel docked đóng, center rộng): rail 248px, `aside` inspector render, 25 row DOM/60 docs.

## Không làm

- Không chỉnh `WorkbenchLayout.tsx` (panel docked là thiết kế có chủ đích, user thu bằng splitter).
- Không thêm dependency, không chạy full vitest suite, không tạo branch/worktree.
- Không đụng file Rust/STATE của quick task 261124-u84 đang chạy song song.

## Ghi chú

Executor gốc (gsd-executor) bị kẹt ở vòng test jsdom; phần còn lại (debug root cause observer, fix, verify, commit) được hoàn tất trực tiếp trong orchestrator. Đây là lý do SUMMARY được viết tay thay vì bởi executor.
