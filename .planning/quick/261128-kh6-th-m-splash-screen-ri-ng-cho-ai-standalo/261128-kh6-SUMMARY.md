---
quick_id: 261128-kh6
slug: th-m-splash-screen-ri-ng-cho-ai-standalone-chat
date: 2026-11-28
status: complete
commits:
  - d491e476
  - ae1201c2
  - 25a4513b
---

# Quick Task 261128-kh6: Thêm splash screen riêng cho AI standalone chat

## Kết quả

Standalone chat (`VITE_CHAT_STANDALONE=1`, `#/ai-popout`) có splash riêng independent khỏi `AppSplashScreen`: 4 mốc tiến độ, fade 350ms, gọi `onReady` đúng 1 lần, CSS namespace `.tm-chat-splash*` riêng (light/dark, 1280/768/375, reduced-motion). App chính và popout thường giữ nguyên hành vi.

## Files thay đổi

| File | Trạng thái | Mục đích |
|------|-----------|----------|
| `src/components/ChatStandaloneSplash.tsx` | mới | Component splash chat, props `onReady?`/`minDuration?` (default 1800), timer dọn trên unmount |
| `src/components/chat-standalone-splash.css` | mới | CSS riêng `.tm-chat-splash*`, palette xanh/tím, theme/responsive/reduced-motion |
| `src/components/__tests__/ChatStandaloneSplash.test.tsx` | mới | 6 test: 4 mốc, text riêng, onReady 1 lần, fade, cleanup, CSS contract |
| `src/AppIntelliJ.tsx` | sửa | `StandaloneAiPopoutShell` module-scope; splash chỉ mount khi `standaloneChat===true`; nhánh app chính giữ nguyên |
| `src/workbench/__tests__/AppIntelliJ.test.tsx` | sửa | 4 case: mount đúng điều kiện, không mount popout thường/dashboard |

## Commits

- `d491e476` — feat(261128-kh6): thêm splash riêng cho AI standalone chat
- `ae1201c2` — feat(261128-kh6): mount splash chỉ cho standalone AI popout
- `25a4513b` — test(261128-kh6): cập nhật assert route standalone

## Verification

- `npx vitest run src/components/__tests__/ChatStandaloneSplash.test.tsx src/workbench/__tests__/AppIntelliJ.test.tsx tests/phase51/standaloneRoute.test.tsx --bail=1` — 3 files / 15 tests passed
- `npx eslint src/components/ChatStandaloneSplash.tsx src/components/__tests__/ChatStandaloneSplash.test.tsx src/AppIntelliJ.tsx src/workbench/__tests__/AppIntelliJ.test.tsx` — sạch (exit 0). `tests/` nằm ngoài `npm run lint` (`eslint src`).
- `rg -n 'AppSplashScreen|tm-splash' src/components/ChatStandaloneSplash.tsx src/components/chat-standalone-splash.css` — không có kết quả
- `npx tsc --noEmit` — trước đó sạch cho code kh6; lần chạy gần nhất fail chỉ ở `src/workbench/DocumentSetDetail.tsx` do session khác sửa dở (TS6133/TS2724/TS2322), không đụng file ngoài phạm vi.

## Chrome UAT

Dev server riêng: `npx vite --config vite.chat.config.ts --port 5188 --strictPort` → `http://localhost:5188/task-management/#/ai-popout` . Chrome daemon isolated headless để tránh xung đột browser session khác.

Ảnh bằng chứng (đã verify viewport/theme/text lúc chụp, progression chạy, fade vào chat, text không cắt):
- `kh6-1280-light.png`, `kh6-1280-dark.png`
- `kh6-768-light.png`, `kh6-768-dark.png`
- `kh6-375-light.png`, `kh6-375-dark.png`

Nội dung splash: `TaskMate Chat`, `KHÔNG GIAN HỘI THOẠI RIÊNG`, 4 text boot, progress 15→45→80→100%, `Private • Local-first • Always yours`. Theme set qua `localStorage.taskmate_theme` rồi reload; timer được slow-down bằng initScript chỉ lúc chụp UAT, không đổi source.

Non-regression (Chrome, app build thường `http://127.0.0.1:5173/task-management/`):
- `#/` → `.tm-splash` present, `.tm-chat-splash` absent, text `TaskMate / Đang tải dữ liệu cục bộ / 45%`.
- `#/ai-popout` → `.tm-chat-splash` absent, `.tm-splash` absent; UI chat thường hiển thị.

Console: 3 message ngoài scope (Ant Design deprecation `Tooltip overlayStyle`/`Modal destroyOnClose`, Knowledge Server connection refused), không lỗi từ splash, không animation lặp vô hạn.

Sau UAT: đã stop Chrome daemon isolated và dev server 5188; không đụng server 5173/browser của session khác.

## Ghi chú

- Không đụng `AppSplashScreen.tsx`, `app-splash.css`, test của app splash; không đổi dependency; không đụng ROADMAP/STATE.
- Không push/merge/rebase/pull/reset/stash; không stage file của session khác (`tasklist-workspace.css`, `DocumentSetDetail.tsx`, `.planning/STATE.md`).
