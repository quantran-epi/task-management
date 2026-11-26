---
phase: quick
plan: 261126-qag
subsystem: documentation
tags: [ssh, ai-tools, document-parsing, standalone-chat, design-only]

requires: []
provides:
  - "Phát hiện đã xác minh: DOCX/XLSX/PDF đọc toàn bộ file rồi cắt 24.000 ký tự đầu; file text/code phân trang do AI chọn offset/limit"
  - "Thiết kế SSH file browser + đính kèm nhiều file + tool ssh_read_attached_file cho chat standalone"
affects: [quick task triển khai SSH file attach sau này, aiTools dispatcher, AIChatDrawer standalone, SSH FS tests]

tech-stack:
  added: []
  patterns:
    - "Design-only: không thêm dependency, không sửa mã production"

key-files:
  created:
    - .planning/quick/261126-qag-them-ssh-remote-file-browser-va-multi-se/SSH-FILE-ATTACH-DESIGN.md
    - .planning/quick/261126-qag-them-ssh-remote-file-browser-va-multi-se/261126-qag-SUMMARY.md
  modified: []

key-decisions:
  - "Chỉ bật browser/attach/tool mới trong standalone chat; dock chat trong workbench giữ nguyên"
  - "Lúc đính kèm chỉ lưu danh tính đường dẫn remote; nội dung chỉ đọc khi AI gọi tool và path nằm trong attached set"
  - "DOCX/XLSX/PDF giữ nguyên hành vi đọc toàn file + cap 24k ký tự; không hứa chọn sheet/trang khi parser chưa hỗ trợ"
  - "Không gửi nội dung tài liệu tới knowledge daemon; giữ 100% local/Tauri; PDF scan không OCR"
patterns-established:
  - "Attach identity-only, read-on-tool-call, sanitize + wrapField trước khi đưa vào prompt"
  - "Gating theo isStandaloneChat từ AIPopoutView -> AIChatDrawer"

requirements-completed:
  - DOC-READ-INVESTIGATION
  - SSH-BROWSE-STANDALONE-ONLY
  - SSH-MULTI-FILE-ATTACH
  - AI-READ-ATTACHED-FILES
  - DESIGN-NO-PRODUCTION-CODE

# Metrics
duration: ~12min
completed: 2026-11-26
---

# Quick 261126-qag: SSH file browser + multi-attach (thiết kế) Summary

Điều tra hành vi đọc tài liệu của AI tool hiện tại và thiết kế SSH browse + multi-attach + AI read cho riêng cửa sổ chat standalone, không sửa mã production.

## Performance

- **Bắt đầu:** 2026-11-26T11:59:09Z
- **Hoàn tất:** 2026-11-26
- **Tasks:** 3/3
- **Files modified:** 2 file documentation trong thư mục quick task này

## Accomplishments

- Xác minh bằng targeted read rằng DOCX/XLSX/PDF được đọc TOÀN BỘ bytes rồi trích toàn bộ text, sau đó cắt 24.000 ký tự đầu; không có tham số chọn sheet/trang/đoạn.
- Xác minh file text/code đi qua `ssh_read_file_page` với `offset`/`limit` do AI chọn, còn local browser file chỉ nhận text, cap 2 MB.
- Hoàn tất thiết kế 7 phần cho SSH browser + multi-attach + tool `ssh_read_attached_file`, kèm 3 trust boundary, 4 wave và chiến lược test tập trung.

## Task Commits

1. **Task 1: Điều tra và ghi phát hiện cách AI đọc DOCX/XLSX/PDF vào SUMMARY** — file docs artifact; orchestrator commit ở bước docs cuối cùng theo constraint của quick task.
2. **Task 2: Thiết kế SSH browser + multi-select attach cho chat standalone** — `a4a0fc44` (docs).
3. **Task 3: Thiết kế AI read file đã đính kèm, trust boundary và wave triển khai** — `e4053a7e` (docs).

**Task 1:** phát hiện được ghi vào SUMMARY artifact; SUMMARY + PLAN + STATE được orchestrator commit riêng ở bước docs cuối (theo constraint của quick task).

## Files Created/Modified

- `.planning/quick/261126-qag-them-ssh-remote-file-browser-va-multi-se/261126-qag-SUMMARY.md` — báo cáo phát hiện và trạng thái quick task.
- `.planning/quick/261126-qag-them-ssh-remote-file-browser-va-multi-se/SSH-FILE-ATTACH-DESIGN.md` — thiết kế 7 phần, chưa triển khai.

## Phát hiện — AI đọc DOCX/XLSX/PDF hiện tại

Kết luận ngắn: **DOCX/XLSX/PDF hiện được đọc TOÀN BỘ file, trích toàn bộ text, rồi cắt 24.000 ký tự đầu; không có cơ chế để AI chọn sheet/trang/đoạn. Ngược lại, file text/code dùng `ssh_read_file_page` với `offset`/`limit` do AI tự chọn.** Các nhận định dưới đây đã được kiểm tra trực tiếp từ mã nguồn, không chỉ dựa trên mô tả tool.

### 1. Parser tài liệu: đọc toàn bộ nội dung, không phân trang

Trong `src/services/ai/sshDocumentParser.ts`:

- `parseDocx()` gọi `mammoth.extractRawText({ arrayBuffer: bytes.buffer })` — mammoth trích toàn bộ văn bản của tài liệu, không nhận tham số vùng/sheet.
- `parseXlsx()` tạo `ExcelJS.Workbook()`, `await workbook.xlsx.load(bytes)`, rồi `workbook.eachSheet(...)` + `ws.eachRow(...)` — duyệt **mọi sheet và mọi row**, nối thành `[XLSX]\n=== Sheet: ... ===\n...`. Không có tham số chọn sheet hay vùng ô.
- `parsePdf()` dùng `pdfjsLib.getDocument({ data: bytes })`, lặp `for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1)` và gọi `page.getTextContent()` cho **từng trang**, nối thành `[PDF]\n--- Trang N ---...`. Không có tham số chọn trang.
- `parseSshDocument(buffer, filename, maxChars = DEFAULT_MAX_CHARS)` là điểm dispatch theo extension; `DEFAULT_MAX_CHARS = 24000` (dòng 27). `truncateText()` (dòng 32-38) dùng `text.slice(0, maxChars)` — **cắt từ đầu chuỗi**, nối thêm dòng `[Đã cắt bởi tool: nội dung vượt quá ... ký tự.]` và đặt `truncated: true`. Không có cắt theo sheet/trang hay theo ngữ cảnh câu hỏi.

### 2. Tool SSH: hai đường đọc khác nhau

Trong `src/services/ai/sshFsToolService.ts`:

- `executeSshReadDocument()` (dòng 312) gọi `readRemoteFileBytes(sshConfig, targetPath)` — **toàn bộ bytes** của file qua `ssh_read_file_bytes` (định nghĩa trong `src/services/sshService.ts:160`), rồi `parseSshDocument(bytes, targetPath)` với `maxChars` mặc định 24.000. Kết quả `data.content` là `wrapField('NỘI DUNG TÀI LIỆU ...', sanitizeBrowserFileText(parsed.text))`.
- `executeSshReadFile()` (dòng 247) là đường **phân pagination cho text/code**: `offset = Math.max(1, Number(args.offset) || 1)`, `limit` bị clamp tới đa 500, gọi `readRemoteFileSlice(sshConfig, targetPath, offset, limit)` rồi trả các dòng đánh số `offset + idx`. `isLikelyBinaryPath(targetPath)` chặn file nhị phân trước khi đọc.
- `resolveRemoteToolPath()` (dòng 147) chuẩn hoá path POSIX và giới hạn trong `repoPath` của `remoteTarget` (khi có target); `resolveSshConfig()` ưu tiên `remoteTarget.sshConfigId`, không fallback sang host khác.

Trong `src/services/ai/aiTools.ts`:

- Tool `ssh_read_document` (dòng 2265) có `parameters.properties` chỉ gồm `path`, `required: ['path']` — **không có đối số chọn sheet/trang/vùng**.
- Tool `ssh_read_file_page` (dòng 2239) có `offset` và `limit` do AI truyền.
- Dispatcher tại dòng 2389/2393 lần lượt gọi `executeSshReadFile(...)` và `executeSshReadDocument(...)`; cả hai nhận `options?.remoteTarget`.
- **Điểm cần làm rõ khi thiết kế:** description của `ssh_read_document` ghi `Cap 10 MB per file and ~24k characters of text output`. Parser chỉ thực thi cap **24k ký tự đầu ra**; không thấy cap 10 MB ở tầng tool. Không tự sửa code trong quick task này — cần xác minh/khớp lại khi implement.

Trong `src/types/sshFsTool.ts`, `SshReadDocumentArgs` (dòng 50) chỉ có `path: string`; `SshReadFileArgs` có thêm `offset?`/`limit?`.

### 3. Xử lý an toàn nội dung và trường hợp PDF scan

- `sanitizeBrowserFileText()` trong `src/services/ai/browserFileReader.ts:46` chuẩn hoá CRLF, xoá control chars, neutralise thẻ đóng giả mạo và `](file:`. Đường document dùng hàm này rồi `wrapField()` (định nghĩa tại `src/services/ai/untrustedData.ts:47`) với nonce ngẫu nhiên để text trong tài liệu không giả mạo delimiter.
- `parsePdf()` phát hiện không có text layer thì trả `text: ''` kèm `metadata.note = 'PDF không có text layer (có thể là ảnh scan); không hỗ trợ OCR.'` — **không OCR**.
- Đường local browser (`readBrowserFileText()`, `src/services/ai/browserFileReader.ts:75`) chỉ đọc file text qua FileReader, `BROWSER_FILE_MAX_BYTES = 2 MB`, chặn binary; về sau `ChatInputBar.tsx` đưa nội dung vào prompt chỉ sau `window.confirm` (dòng 250-262). Đây là đường **khác** với SSH document path ở trên.

### Hệ quả cho thiết kế

- Khi thiết kế tool đọc file đã đính kèm, không thể hứa "AI chọn sheet/trang" nếu vẫn ủy thác cho parser hiện tại; phải nói rõ hành vi đọc toàn file + cap 24k.
- Phải giữ nguyên lớp `sanitizeBrowserFileText` + `wrapField` cho mọi nội dung remote đưa vào prompt, kể cả nội dung do tool mới trả về.
- File text/code nên ủy thác cho `executeSshReadFile` để tận dụng offset/limit có sẵn; binary document ủy thác cho `executeSshReadDocument`.

## Decisions Made

- Ghi phát hiện và thiết kế thành 2 file documentation; không tạo file design bổ sung.
- Không chạy full vitest suite theo quy tắc dự án (tốn hơn 1 giờ); dùng targeted grep/kiểm tra tệp thay thế.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

Không có bước setup người dùng trong quick task này.

## Known Stubs

Không có stub mã production; quick task chỉ tạo tài liệu thiết kế.

## Threat Flags

Không phát hiện bề mặt bảo mật mới trong mã production (không sửa mã production). Thiết kế đã nêu 3 trust boundary và mitigation tương ứng trong `SSH-FILE-ATTACH-DESIGN.md`.

## Self-Check: PASSED

- `SSH-FILE-ATTACH-DESIGN.md` tồn tại, đủ 7 phần, các grep xác nhận của 3 task đều pass.
- Commit `a4a0fc44` và `e4053a7e` tồn tại trên `feat/ssh-remote-file-attach`; `git diff --name-only` không có file `src/`, `src-tauri/`, `e2e/`, `tests/` hay `package.json`.
- Không chạy full vitest suite theo quy tắc dự án.
