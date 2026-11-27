---
sketch: 015
name: ssh-file-picker
question: "Chuẩn hoá UI chọn tệp SSH theo folder-picker của SSH Remote Explorer, nhưng pick multiple files — bố cục và multi-select nào rõ nhất?"
winner: "A"
tags: [chat, ssh, file-picker, multi-select, standalone, ant-design, consistency]
---

# Sketch 015: SSH File Picker (VS Code-consistent)

## Design Question

UI hiện tại (`StandaloneSshFileBrowser.tsx`) là modal 640px với một `Tree` checkbox, path text thuần, search `find -iname` không breadcrumb/up/kích thước. Sếp muốn chuẩn hoá theo **folder picker của SSH Remote Explorer**, chỉ khác là chọn **nhiều tệp**. Ba variant dưới đây giữ chung một cấu trúc (explorer trái + danh sách phải + footer selection), khác nhau ở mức độ thông tin phụ.

## How to View

`open .planning/sketches/015-ssh-file-picker/index.html`

Toolbar góc phải: đổi viewport (Desktop/Tablet/Phone), bật Annotate, và chuyển state (no-config / searching / empty / error).

## Variants

- **A: Two-column · VS Code faithful** — Explorer cây host/thư mục bên trái (đúng mô hình Remote Explorer), breadcrumb + Up + search + danh sách tệp có size/mtime bên phải, checkbox multi-select, footer gom chip đã chọn. Ít xáo trộn nhất, path-of-least-resistance với Ant Design `Modal` + `Tree` + `Table`.
- **B: Two-column + selection tray** — Giữ A, thêm cột phải 224px hiện từng tệp đã chọn kèm 3 dòng preview. Tránh attach nhầm, nhưng hẹp vùng danh sách và preview chỉ là giả lập (code hiện tại **không đọc nội dung** khi attach).
- **C: Compact + filters + ⌘K** — Giữ A, thêm filter extension + command-bar tìm nhanh. Hợp khi biết trước đuôi/tên tệp; selection gom thành count badge.

## What to Look For

- Cây explorer trái có đủ làm "đồng nhất với Remote Explorer" không, hay cần hiện cả tệp trong cây luôn?
- Breadcrumb + Up có thay thế được nút "Thư mục hiện tại" không.
- Checkbox nên nằm trên mỗi row (hiện tại) hay chỉ chọn ở footer? Click row = toggle file, click folder row = navigate — có đủ tách biệt không?
- Có cần preview trước khi attach (B) hay path + size + mtime là đủ?
- Khi host chưa cấu hình / mất kết nối / search đang chạy / thư mục rỗng: CTA và selection đã chọn có giữ nguyên không?

## Grounded Constraints (from current code)

- `StandaloneSshFileBrowser.tsx:36-48` — props `open/onClose/onAttach(paths)/db`; entry shape `{path, name, isDir}`.
- `:69-112` — config bootstrap: `getSshFsToolConfig` → `getSshConfigById` → `resolveRemoteToolPath`.
- `:114-151` — `listRemoteDir` load entries; `:153-195` — `find -iname ... | head -n 201`, cancellable by `callId`.
- `:234-319` — hiện tại: error alert không CTA sửa, path text thường (không breadcrumb/up), checkbox `Tree`, folder click navigate.
- `sshService.ts:134-149` `listRemoteDir` và `types/ssh.ts:16-24` `RemoteFileInfo {name, path, isDir, isSymlink, size, modified, permissions}` — sketch dùng `size` + `modified` thật, không bịa field.
- `sshFsToolService.ts:480-491` — attached paths bị validate lại sau `resolveRemoteToolPath`; picker chỉ trả path, **không đọc nội dung**. Preview trong variant B là giả lập và phải ghi rõ điều đó khi implement.
- Ant Design 6.6.5 + React 19.3.0 có sẵn: `Modal`, `Tree`, `Table`/`List`, `Checkbox`, `Breadcrumb`, `Input`, `Tag`; không cần dependency mới.

## Status

Winner: **A — Two-column · VS Code faithful** (chọn 2026-11-27). Không cherry-pick B/C. Insight: consistency với Remote Explorer quan trọng hơn preview hay filter; đủ thông tin để chọn đúng tệp là breadcrumb/Up + size/mtime + chip selection ở footer.
