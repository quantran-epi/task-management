# Phase 49 — Discussion Log

**Date:** 2026-11-21

## API wrapper & thay thế
- Tên export: cùng tên AntD từ `src/components/ui` (chosen) / prefix Tm / namespace Ui.
- Props: props AntD + policy props (chosen) / TaskMate-only / raw AntD.
- Thay thế: sửa 1 file wrapper (chosen) / registry / token-only.
- Test coverage: test quét tự động (chosen) / chỉ ESLint.

## Theme switching
- Toggle UI + mặc định theo OS (chosen) / UI only / OS only.
- Lưu: localStorage (chosen) / Dexie / không lưu.
- Phạm vi: tức thì toàn app + popout (chosen) / cửa sổ hiện tại / reload.
- Palette: IntelliJ Light + Darcula (chosen) / giữ palette hiện tại / để design quyết.

## Icon & style policy
- Icons: wrap @ant-design/icons (chosen) / import trực tiếp.
- Icon button: bắt aria-label + size (chosen) / tooltip / không enforce.
- Inline style: thay bằng token ở Phase 50 (chosen) / giữ nguyên / cấm hoàn toàn.
- Status map: một map chung trong token (chosen) / mỗi domain tự định nghĩa.

## Lộ trình xóa shell cũ
- Thứ tự: cleanup shell trước (chosen) / wrapper trước / cùng plan.
- PWA: xóa prompts + manifest/SW config (chosen) / chỉ prompts / giữ nguyên.
- Check: local npm lint+build+test (chosen, user rejected GitHub Actions CI) / CI GitHub.
- UAT: để Phase 50 (chosen) / smoke ở 49.
