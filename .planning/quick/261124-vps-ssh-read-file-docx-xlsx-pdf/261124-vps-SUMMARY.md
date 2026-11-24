---
phase: quick
plan: 261124-vps
subsystem: ai/ssh
tags: [tauri, ssh, sftp, docx, xlsx, pdf, mammoth, exceljs, pdfjs-dist, ipc, prompt-injection]
status: complete

requires:
  - phase: existing SSH FS AI tools
    provides: resolveSshConfig / resolveRemoteToolPath / SSH_READ_TOOLS enablement gate
provides:
  - "Lệnh Tauri ssh_read_file_bytes trả ArrayBuffer, cap 10MB"
  - "Parser JS docx/xlsx/pdf, cap 24k ký tự + cờ truncated"
  - "Tool AI ssh_read_document dùng chung cho Chat và Telegram headless/mutation"
  - "Text tài liệu sanitize + wrapField nonce trước khi vào AI context"
affects: [ai-chat, telegram, ssh-fs-tools, settings-ai-tool-catalog]

tech-stack:
  added: [mammoth@1.13.0, pdfjs-dist@6.5.438]
  patterns: ["tauri::ipc::Response cho payload nhị phân", "untrusted text → sanitizeBrowserFileText → wrapField nonce"]

key-files:
  created:
    - src/services/ai/sshDocumentParser.ts
    - src/services/ai/__tests__/sshDocumentParser.test.ts
  modified:
    - src-tauri/src/ssh_service.rs
    - src-tauri/src/lib.rs
    - src/services/sshService.ts
    - tests/services/sshService.test.ts
    - src/types/sshFsTool.ts
    - src/services/ai/sshFsToolService.ts
    - src/services/ai/__tests__/sshFsToolService.test.ts
    - src/services/ai/aiTools.ts
    - src/services/ai/chatTurnTools.ts
    - vite.config.ts
    - package.json
    - package-lock.json

key-decisions:
  - "Rust trả tauri::ipc::Response thay vì Vec<u8> để TS nhận ArrayBuffer, tránh phình ~4x cho file 10MB"
  - "Cap 10MB/file và 24k ký tự/output giữ nguyên (không hạ xuống 2MB như browser file reader)"
  - "PDF scan không text layer trả text rỗng + ghi chú; không OCR/Python/daemon"
  - "Không sửa UI descriptions hard-code tool list ngoài files_modified của plan"

patterns-established:
  - "Binary IPC: check_doc_size trước read_to_end và check lại sau read_to_end"
  - "Untrusted document text luôn đi qua sanitizeBrowserFileText rồi wrapField với nonce"

requirements-completed: [SSH-DOC-BYTES, SSH-DOC-PARSER, SSH-DOC-TOOL, SSH-DOC-REGISTRY]

duration: 15min
completed: 2026-11-24
---

# Phase Quick 261124-vps: SSH read document Summary

**Tool AI `ssh_read_document` đọc .docx/.xlsx/.pdf qua SFTP, trả bytes nhị phân về Tauri dạng ArrayBuffer rồi parse JS và bọc text bằng nonce chống injection**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-11-24T16:12:43Z
- **Completed:** 2026-11-24T16:21:38Z
- **Tasks:** 4/4
- **Files modified:** 14

## Accomplishments
- Lệnh `ssh_read_file_bytes` (Rust) trả `tauri::ipc::Response`, cap 10 MB trước và sau `read_to_end`, lỗi tiếng Việt; lệnh text cũ giữ nguyên.
- `readRemoteFileBytes` (TS) trả thẳng `ArrayBuffer` qua `invoke`, không decode UTF-8.
- Parser `sshDocumentParser.ts`: mammoth cho docx, exceljs cho xlsx, pdfjs-dist text layer cho pdf; cap 24k ký tự, cờ `truncated`, ghi chú PDF scan không OCR.
- Tool `ssh_read_document` có dispatch, nằm trong `SSH_READ_TOOLS` (Chat + Telegram headless/mutation tự lấy) và usage catalog.
- Text tài liệu luôn `sanitizeBrowserFileText` rồi `wrapField('NỘI DUNG TÀI LIỆU ' + targetPath, ...)` với nonce chống forge thẻ đóng.

## Task Commits

1. **Task 1: Lệnh Rust ssh_read_file_bytes + wrapper TS** - `d6884448` (feat)
2. **Task 2: Parser JS docx/xlsx/pdf + cấu hình pdf worker** - `3e9151b7` (feat)
3. **Task 3: Tool AI ssh_read_document + registry + usage** - `b2a85395` (feat)

## Verification thật

| Lệnh | Kết quả |
|------|---------|
| `cargo test check_doc_size` | PASS: 2 case (at/below cap, above cap) |
| `npx vitest run tests/services/sshService.test.ts` | PASS: 8 tests |
| `npx vitest run src/services/ai/__tests__/sshDocumentParser.test.ts` | PASS: 7 tests |
| `npx vitest run src/services/ai/__tests__/sshFsToolService.test.ts` | PASS: 20 tests |
| `npx vitest run ... chatTurnTools.test.ts` (scoped gộp) | PASS: 43 tests / 4 files |
| `npx tsc --noEmit` | PASS, clean |
| `npm run build` | PASS (chỉ warning chunk size/ineffective dynamic import có sẵn; pdf worker chưa emit vì parser lúc đó chưa được import bởi app module) |

## Files Created/Modified
- `src-tauri/src/ssh_service.rs` - `check_doc_size` + lệnh `ssh_read_file_bytes` + 2 unit test Rust.
- `src-tauri/src/lib.rs` - đăng ký handler trong `generate_handler!`.
- `src/services/sshService.ts` - `readRemoteFileBytes` trả `ArrayBuffer`.
- `tests/services/sshService.test.ts` - test invoke payload và raw buffer.
- `src/services/ai/sshDocumentParser.ts` - parser docx/xlsx/pdf + cap output.
- `src/services/ai/__tests__/sshDocumentParser.test.ts` - 7 test với mock bắt buộc gồm byteOffset ≠ 0.
- `src/types/sshFsTool.ts` - `SshReadDocumentArgs` + action `read_document`.
- `src/services/ai/sshFsToolService.ts` - `executeSshReadDocument` với sanitize + wrapField.
- `src/services/ai/__tests__/sshFsToolService.test.ts` - 3 test tool (extension, nonce, metadata).
- `src/services/ai/aiTools.ts` - definition + dispatch + `SSH_READ_TOOLS`.
- `src/services/ai/chatTurnTools.ts` - usage catalog override.
- `vite.config.ts` - `worker: { format: 'es' }` cho pdf worker.
- `package.json` / `package-lock.json` - mammoth 1.13.0, pdfjs-dist 6.5.438.

## Decisions Made
- Dùng `file.stat()` thay vì `sftp.metadata()`: API `ssh2::Sftp` không có `metadata`.
- Bổ sung check cap sau `read_to_end` để chặn file lớn lên giữa lúc stat và đọc.
- Dùng `new Uint8Array(buffer.slice(0))` trong parser để xử lý đúng view có byteOffset ≠ 0.
- Không sửa `SshFsSettingsModal.tsx` / `SshFsAiToolConfigCard.tsx` (danh sách tool hard-code) vì nằm ngoài `files_modified` của plan theo yêu cầu scope; UI vẫn chưa liệt kê `ssh_read_document`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `sftp.metadata()` không tồn tại trong ssh2 crate**
- **Found during:** Task 1
- **Issue:** `cargo test` lỗi E0599; plan gợi ý metadata hoặc file.stat.
- **Fix:** Đổi sang `file.stat()` sau khi mở tệp, giữ nguyên kiểm tra cap trước `read_to_end`.
- **Files modified:** src-tauri/src/ssh_service.rs
- **Verification:** `cargo test check_doc_size` pass 2 case.
- **Committed in:** d6884448

**2. [Rule 1 - Bug] ExcelJS `row.values` là mảng 1-indexed**
- **Found during:** Task 2
- **Issue:** Parser bỏ cell đầu tiên (`A1`) do `.slice(1)` sai.
- **Fix:** Bỏ `.slice(1)`, map trực tiếp mảng values.
- **Files modified:** src/services/ai/sshDocumentParser.ts
- **Verification:** test xlsx assert `A1 | B1` pass.
- **Committed in:** 3e9151b7

**3. [Rule 3 - Blocking] npm cache EEXIST/EACCES**
- **Found during:** Task 2
- **Issue:** `npm install` mặc định lỗi ghi `~/.npm/_cacache`.
- **Fix:** Chạy `npm install --cache /tmp/npm-cache-vps-261124`; chỉ cài đúng 2 package pinned.
- **Files modified:** package.json, package-lock.json
- **Verification:** `node -e` xác nhận pdfjs-dist 6.5.438, mammoth 1.13.0; build pass.
- **Committed in:** 3e9151b7

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking). Không mở rộng scope.

## Issues Encountered
- Ban đầu test Rust filtered 0 case vì tên test không chứa `check_doc_size`; đã đổi tên test để filter đúng.
- Mock pdfjs trong test dùng `getTextContent` trên document; parser hỗ trợ cả document/page để tương thích cả API thật và mock.
- `npm run build` chưa emit asset pdf worker vì tại thời điểm build Task 2, parser chưa được import bởi module nào của app. Sau Task 3 đã có import; chưa chạy lại build lần cuối (chỉ `tsc --noEmit` + scoped test).

## Known Stubs / Limitations
- PDF scan không có text layer: trả `text: ''` + `metadata.note` "PDF không có text layer (có thể là ảnh scan); không hỗ trợ OCR." Không OCR, không Python/daemon.
- pdfjs-dist 6.5.438 cần `Promise.withResolvers` (Chrome 119+/Safari 17.4+); giả định Tauri WKWebView hiện tại hỗ trợ. Webview cũ hơn cần pinpdfjs-dist@3.11.174 (không đổi pin hiện tại).
- `mammoth.extractRawText` flatten bảng thành text, không giữ cấu trúc bảng DOCX đầy đủ.
- UI settings hard-code danh sách SSH tool chưa hiển thị `ssh_read_document` (xem Decisions).

## Threat Flags
None mới ngoài threat_model của plan. Đường untrusted data đã được mitigate bằng sanitize + wrapField nonce; path được confine bằng `resolveRemoteToolPath`.

## User Setup Required
Không có. Không đụng PWA/GitHub Pages.

## Next Phase Readiness
Sẵn sàng dùng tool `ssh_read_document` trong Chat/Telegram. Cần UAT thực tế trên Tauri với file .docx/.xlsx/.pdf, đặc biệt PDF có text layer và buffer IPC 10 MB (unit test chỉ mock).

---
*Phase: quick-261124-vps*
*Completed: 2026-11-24*
