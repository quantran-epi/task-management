---
status: complete
task: 261128-itv
title: Sửa UI màn hình Bộ tài liệu — tách bạch layout và rà virtualization
date: 2026-11-28
---

# 261128-itv — Tóm tắt thực thi

Sếp, đã tách rõ rail trái / danh sách doc / inspector phải / modal cấu hình và các nút trong form bằng CSS token, đồng thời xác nhận virtualization hiện có ở cả 3 danh sách lớn. Không đổi API, export hay `data-testid`; không thêm dependency.

## Phạm vi code (đúng 5 file)

- `src/workbench/DocSetLibrary.tsx`: rail có border/nền token, head có border-bottom, item rail có gap, detail giữ `minWidth:0`; testid `doc-set-library*` giữ nguyên.
- `src/workbench/DocumentSetDetail.tsx`: header actions gap 8, toolbar sticky tách khỏi virtual list bằng `gap: var(--gap-8)`, list pane `minHeight:0`, VirtualizedList `flex:1 1 auto`, vùng docs giữ `minHeight:160` để không collapse ở center hẹp; API/export/testid giữ nguyên.
- `src/components/knowledge/DocumentSetForm.tsx`: membership ListItem nhận class `.doc-set-member-item`; picker row dùng `.doc-set-pick-row` thay `Space`, giữ checkbox `aria-label`, `draftSelection`, move/remove handler.
- `src/styles/workbench-tokens.css`: rule scoped rail/head/toolbar/inspector/member/picker/modal body, chỉ dùng token runtime (`--border`, `--bg-elev`, `--gap-*`, `--fg-secondary`), không rule global, không đụng CSS drawer/CR/git-link.
- `src/workbench/__tests__/DocumentSetDetailPublished.test.tsx`: assert toolbar sticky, list pane `minHeight:0`/gap, vùng docs `minHeight:160`, CSS inspector 260px/`flex-shrink:0`, membership/picker DOM ≤25 và checkbox toggle.

Virtualization baseline: `grep` xác nhận đúng 3 chỗ `VirtualizedList` — docs list (`items={filteredRows}`), membership (`items={members}`), picker (`items={flatDocs}`). Rail danh sách bộ vẫn dùng `List` thường (số bộ ít). `computeNoteHashesCached` giữ nguyên, không hash lại mọi note.

## Verification

- Scoped tests: `npx vitest run src/workbench/__tests__/DocumentSetDetailPublished.test.tsx src/workbench/__tests__/DocumentSetDetailDefaultDb.test.tsx src/workbench/__tests__/DocsWorkspace.test.tsx src/workbench/__tests__/VirtualizedList.test.tsx tests/knowledge/documentSetForm.test.tsx src/components/ui/__tests__/controls.test.tsx --bail=1` → `6 passed`, `53 passed`. Có 1 unhandled rejection baseline đã ghi nhận ở fvp: `TypeError: message.error is not a function` từ `DocSetLibrary.tsx:96` trong DocsWorkspace test; không phải lỗi task này.
- `npx tsc --noEmit`: pass. `npx eslint src/workbench/DocSetLibrary.tsx src/workbench/DocumentSetDetail.tsx src/components/knowledge/DocumentSetForm.tsx`: pass.
- Chrome thật (Playwright `channel: 'chrome'`, context riêng, đóng sau khi xong), 60 docs seed trong IndexedDB, light + dark ở 1280/768/375:
  - 1280 light/dark: rail 248px, border-right 1px, nền token `rgb(247,248,250)`/dark `rgb(23,29,39)`, head border 1px; detail padding 16px; toolbar `position:sticky`, `z-index:5`, border-bottom 1px; list pane gap 8px, `min-height:0`, list `flex:1 1 auto`, height ~197px; inspector 260px, `flex-shrink:0`, border-left 1px, head border 1px.
  - 768 light/dark: rail co 160px, detail padding 8px, inspector ẩn theo thiết kế narrow, toolbar vẫn sticky, list height ~156px.
  - 375 light/dark: rail 160px, detail padding 8px, inspector ẩn, toolbar vẫn dùng được. Sau fix Rule 1, vùng docs có `min-height:160px`; virtual list render tối đa 25 option + 25 nút menu (DOM bounded), filter count `60 / 60`, không có `Note.body`/secret text trong DOM.
  - Modal cấu hình 620px: body padding `16px 24px`, section đầu «Phạm vi bộ tài liệu» tách khỏi header; membership row class `ant-list-item doc-set-member-item`, padding `4px 8px`, action gap `4px`, 3 nút `Đưa lên`/`Đưa xuống`/`Gỡ ...` rõ ràng.
  - Picker: 13 virtual row trong viewport, `.doc-set-pick-row` gap `8px`, checkbox «UAT doc 1» toggle đúng `true → false`; path ellipsis, không đọc nội dung note.
  - Console Chrome: chỉ deprecation/cảnh báo AntD và duplicate-key `modal-holder` có sẵn từ các modal (`overlayStyle`, `destroyOnClose`, `Space direction`, `List` deprecated, `Alert message`, `Card bordered`, `Statistic valueStyle`); không có error/warning mới do CSS/class/task này sinh ra. Không đụng tab của sếp.
  - Screenshot review-only (không commit): `itv-light-1280.png`, `itv-light-768.png`, `itv-light-375.png`, `itv-dark-1280.png`, `itv-dark-768.png`, `itv-dark-375.png`, `itv-modal-light.png`, `itv-picker-light.png` trong thư mục task.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] List pane collapse ở center hẹp**
- **Found during:** Task 3 Chrome verify ở 375px light/dark.
- **Issue:** Sau khi đổi `minHeight` của vùng docs từ 160 xuống 0 để list co linh hoạt, container bị ép `height:0px`, danh sách doc trống dù filter vẫn hiện `60 / 60`.
- **Fix:** Khôi phục `minHeight:160` trên `[data-testid="doc-set-documents"]`; giữ `minHeight:0` trên `.doc-set-docs-list` và `flex:1 1 auto` trên VirtualizedList. Thêm assert test ở width 479.
- **Files modified:** `src/workbench/DocumentSetDetail.tsx`, `src/workbench/__tests__/DocumentSetDetailPublished.test.tsx`.
- **Commit:** `ed339023` (re-commit sau peer reset; hash cũ `a4dd94ab` không còn trên HEAD).

**2. [Deviation - Test scope] Bổ sung test file đã nằm trong plan**
- Plan Task 1/2 chỉ liệt kê scoped test có sẵn; tôi mở rộng `DocumentSetDetailPublished.test.tsx` (đã nằm trong `files_modified`) để khóa computed/inline style và bounded DOM. Không đổi file test của session khác.

## Commits (code only, explicit paths, chưa push)

- `755f8ec8c956587f34dd4795dc08e5787b263ba6` (`755f8ec8`) — `fix(261128-itv): tách rail, toolbar và inspector bộ tài liệu` — 3 file: DocSetLibrary, DocumentSetDetail, workbench-tokens.css.
- `7ddfbb8bc2cf1511cd241e0ebc83f8ae76ffb136` (`7ddfbb8b`) — `fix(261128-itv): tách nút khỏi nội dung form bộ tài liệu` — 2 file: DocumentSetForm, workbench-tokens.css.
- `ed339023` (re-commit của `a4dd94ab`, bị mất trong peer reset) — `fix(261128-itv): giữ chiều cao danh sách doc khi center hẹp và thêm assert layout` — 2 file: DocumentSetDetail, DocumentSetDetailPublished.test.tsx.

Mỗi commit kiểm tra `git diff --cached --name-only` trước khi commit; không file peer nào bị stage (`src/components/ui/drawer.tsx`, `TaskDrawer*`, `ChangeRequestDetailView.tsx`, test 6a, git links). Branch vẫn `pre-v1.6-baseline`. KHÔNG rebase/reset, KHÔNG đổi branch, KHÔNG push. Có commit peer xen kẽ sau các commit trên; tôi không đụng. Không commit PLAN/SUMMARY/STATE, không update ROADMAP.

## Stubs / Threat flags

- Không có stub mới; mọi list có data source thật từ IndexedDB/props.
- Không có bề mặt threat mới: không endpoint/network/auth/schema change; threat model giữ nguyên (accept).
