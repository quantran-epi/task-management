---
phase: quick
plan: 261127-nai
type: execute
status: complete
started: 2026-11-27T09:49:36Z
completed: 2026-11-27
requirements:
  - SSH-PICKER-SINGLE-PANEL
tech-stack:
  added: []
  patterns: ["single-panel picker", "AntD theme token via useAntdToken"]
key-files:
  created: []
  modified:
    - src/components/ai/StandaloneSshFileBrowser.tsx
    - tests/phase51/standaloneAttachmentPersistence.test.tsx
decisions:
  - "Bỏ cột explorer trái; navigation dời hẳn vào panel đơn qua folder row/breadcrumb/Up, vẫn giới hạn bởi basePath."
  - "Giữ nguyên hợp đồng onAttach(paths), search find -iname | head -n 201 có huỷ theo callId, seq guard và cam kết không đọc nội dung tệp."
  - "Không thêm dependency/CSS/service; token lấy từ useAntdToken, UI wrapper dùng ../ui."
actuals:
  tokens: 4100
  tasks: 2
  commits: 2
  plan_head_before: d2727e5851b1734cff44f5c5f119abbfdccc9f74
  plan_head_after: d2be1fd3
  duration: ~3min
---

# Quick Task 261127-nai: Bỏ cột explorer, picker SSH thành single-panel

## Outcome

- Modal "Duyệt tệp SSH" giờ chỉ có một panel: breadcrumb + nút Up + search + danh sách tệp/thư mục + footer chip. Không còn cây explorer bên trái.
- Xóa `Tree` khỏi import, state `hostLabel`, state `folderChildren`, khối `explorerTree` useMemo và grid `228px minmax(0, 1fr)`. Bootstrap vẫn gọi `getSshConfigById` để validate cấu hình trước khi set `basePath`.
- Navigation đầy đủ trong panel: folder row click → `loadDir`, breadcrumb → `navigate(prefix)`, Up bị disable tại `basePath`/`/` và không vượt quá `basePath`.
- Contract không đổi: checkbox chỉ trên file row; `onAttach(paths)` + `onClose()` gọi một lần trong `onOk`; `paths = [...selected]`; search `find -iname ... | head -n 201` với `callIdRef`/`cancelRemoteCall`; seq guard `loadSeqRef`; `destroyOnClose`; không đọc nội dung tệp.

## Commits

- `2752315f` refactor(261127-nai): single-panel SSH picker, drop explorer tree
- `d2be1fd3` test(261127-nai): pin single-panel SSH picker navigation

## Verification

- `npx vitest run tests/phase51/standaloneAttachmentPersistence.test.tsx --bail=1` — 8/8 pass (7 cũ + 1 regression mới).
- `npx tsc --noEmit --pretty false` — exit 0, sạch.
- `git diff --check` — sạch.
- Regression mới: assert `.ant-tree` null, nhãn "Explorer · SSH" vắng mặt, `[data-file-path="/repo/folder"]` vẫn tồn tại và click vẫn gọi `ssh.listRemoteDir(..., "/repo/folder")`.

## Deviations from Plan

None — plan executed exactly as written.

## Threat Flags

Không có bề mặt mới. T-NAI-01 (bỏ host label), T-NAI-02 (tên tệp vẫn là React text child) giữ nguyên; không thêm endpoint, auth path, file access hay schema. Không hiển thị host/username/token/secret trong UI.

## Known Stubs

None — `placeholder` trên Input search và `token` từ `useAntdToken()` là AntD token, không phải stub hay secret.

## Self-Check: PASSED
- SUMMARY.md tồn tại.
- Commit `2752315f` và `d2be1fd3` có trong git history.
- 8/8 scoped tests, tsc, diff --check đều xanh.
