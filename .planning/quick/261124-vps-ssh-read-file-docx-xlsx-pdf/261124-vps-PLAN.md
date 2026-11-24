---
phase: quick
plan: 261124-vps
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/src/ssh_service.rs
  - src-tauri/src/lib.rs
  - src/services/sshService.ts
  - src/services/ai/sshDocumentParser.ts
  - src/services/ai/__tests__/sshDocumentParser.test.ts
  - src/types/sshFsTool.ts
  - src/services/ai/sshFsToolService.ts
  - src/services/ai/__tests__/sshFsToolService.test.ts
  - src/services/ai/aiTools.ts
  - src/services/ai/chatTurnTools.ts
  - vite.config.ts
  - package.json
  - package-lock.json
autonomous: true
requirements:
  - SSH-DOC-BYTES
  - SSH-DOC-PARSER
  - SSH-DOC-TOOL
  - SSH-DOC-REGISTRY
must_haves:
  truths:
    - "Lệnh Tauri mới `ssh_read_file_bytes` đọc SFTP trả bytes nhị phân có cap ~10MB; Rust trả `tauri::ipc::Response` nên TS nhận `ArrayBuffer` (không phình ~4x như `number[]`); lỗi vượt cap/thiếu file có thông báo tiếng Việt; lệnh cũ `ssh_read_file_all`/`ssh_read_file_slice` giữ nguyên hành vi"
    - "Parser JS thuần chuyển buffer .docx (mammoth), .xlsx (exceljs), .pdf (pdfjs-dist text layer) thành text có metadata; output bị cap ~24k ký tự kèm cờ `truncated`"
    - "Tool AI `ssh_read_document` nhận sshConfigId (remote target) + path, gọi lệnh bytes, parse theo extension, trả JSON có format/số sheet hoặc trang/truncated; AI Chat và Telegram headless/mutation đều dùng được"
    - "Text tài liệu là untrusted data: được `sanitizeBrowserFileText` rồi `wrapField` với nonce chống forge thẻ đóng trước khi vào tool result/AI context; không trả `content` text thô"
    - "PDF scan không có text layer trả text rỗng kèm ghi chú rõ giới hạn; không dùng OCR/Python/daemon"
  artifacts:
    - path: "src-tauri/src/ssh_service.rs"
      provides: "`ssh_read_file_bytes` trả `tauri::ipc::Response` (bytes) qua IPC → TS nhận `ArrayBuffer`, cap 10MB, lỗi tiếng Việt"
    - path: "src/services/ai/sshDocumentParser.ts"
      provides: "Factory parseDocx/parseXlsx/parsePdf + hàm điều phối theo extension + cap output; input là `ArrayBuffer`"
    - path: "src/services/ai/sshFsToolService.ts"
      provides: "`executeSshReadDocument` theo pattern `executeSshReadFile`, content đi qua sanitize + wrapField"
    - path: "src/services/ai/aiTools.ts"
      provides: "Định nghĩa tool `ssh_read_document` + dispatch + đưa vào `SSH_READ_TOOLS`"
  key_links:
    - from: "src/services/sshService.ts::readRemoteFileBytes"
      to: "ssh_read_file_bytes"
      via: "Rust trả tauri::ipc::Response::new(bytes) nên TS nhận ArrayBuffer, không phình ~4x như number[] cho file 10MB"
      pattern: "invoke<ArrayBuffer>\\('ssh_read_file_bytes'"
    - from: "src/services/ai/sshFsToolService.ts::executeSshReadDocument"
      to: "parseSshDocument"
      via: "parse buffer theo extension rồi đóng gói SshFsToolResult"
      pattern: "parseSshDocument\\("
    - from: "src/services/ai/sshFsToolService.ts::executeSshReadDocument"
      to: "wrapField + sanitizeBrowserFileText"
      via: "content text là untrusted data, bọc nonce chống forge thẻ đóng trước khi vào tool result/AI context"
      pattern: "wrapField\\('NỘI DUNG TÀI LIỆU"
    - from: "src/services/ai/aiTools.ts::SSH_READ_TOOLS"
      to: "chatTurnTools / telegramHeadlessWorker / telegramMutationSession"
      via: "cùng danh sách SSH_READ_TOOLS đã được filter enablement"
      pattern: "ssh_read_document"
---

<objective>
Thêm đường đọc tài liệu nhị phân qua SSH cho AI: lệnh Rust mới trả bytes qua SFTP có giới hạn kích thước, parser JS thuần cho docx/xlsx/pdf, và tool AI `ssh_read_document` dùng chung cho AI Chat lẫn Telegram. Giữ nguyên lệnh read text cũ và mọi hành vi enablement/remote-target hiện có. Chỉ Tauri desktop; không đụng PWA/GitHub Pages, không OCR/Python/daemon.

Purpose: `ssh_read_file_page` hiện chỉ đọc text (`BufReader::lines()`), `ssh_read_file_all` ép `String::from_utf8` nên lỗi với file nhị phân. AI cần đọc nội dung .docx/.xlsx/.pdf trên remote mà vẫn nằm trong context window và binding SSH target hiện có.

Output: 1 lệnh Rust + 1 wrapper TS, 1 module parser + unit test, 1 tool AI + registry/usage, 2 dependency npm (`mammoth`, `pdfjs-dist`), cấu hình pdf worker cho Vite/Tauri. Kết thúc bằng commit scoped + push `pre-v1.6-baseline`.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@src-tauri/src/ssh_service.rs
@src-tauri/src/lib.rs
@src/services/sshService.ts
@src/services/ai/sshFsToolService.ts
@src/services/ai/aiTools.ts
@src/services/ai/chatTurnTools.ts
@src/services/ai/untrustedData.ts
@src/services/ai/browserFileReader.ts
@src/types/sshFsTool.ts
@vite.config.ts
@package.json
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Lệnh Rust `ssh_read_file_bytes` + wrapper TS (cap 10MB, lỗi tiếng Việt)</name>
  <files>src-tauri/src/ssh_service.rs, src-tauri/src/lib.rs, src/services/sshService.ts</files>
  <behavior>
    - Test Rust unit (trong ssh_service.rs, `#[cfg(test)]`): hàm `check_doc_size(size: u64) -> Result<(), String>` — size &lt;= 10*1024*1024 trả Ok; size = 10MB+1 trả Err chứa "vượt quá 10 MB"; helper tách logic cap để test không cần SSH
    - Test TS (mock `invoke`) trong `tests/services/sshService.test.ts` (hoặc file test hiện có của sshService): `readRemoteFileBytes` truyền đúng tên lệnh `ssh_read_file_bytes`, args `config/secret/remotePath`, trả nguyên `ArrayBuffer` không decode UTF-8 và không tạo view lệch
  </behavior>
  <action>
    Trong `src-tauri/src/ssh_service.rs`: thêm const `SSH_DOC_MAX_BYTES: u64 = 10 * 1024 * 1024` và hàm `check_doc_size(size: u64) -> Result&lt;(), String&gt;` (Err: `"Tệp vượt quá 10 MB, tool chỉ hỗ trợ tài liệu nhỏ hơn 10 MB."`). Thêm `#[tauri::command] pub fn ssh_read_file_bytes(config: SshConfig, secret: Option&lt;String&gt;, remote_path: String) -&gt; Result&lt;tauri::ipc::Response, String&gt;` — dùng chung `connect_and_auth` + `sftp.open(Path::new(&amp;remote_path))` như `ssh_read_file_all`, nhưng gọi `sftp.metadata(Path::new(&amp;remote_path))` (hoặc `file.stat()`) lấy `size` và gọi `check_doc_size` TRƯỚC `read_to_end`; lỗi mở tệp giữ thông báo kiểu `"Không thể mở tệp '{}': {}"` (tiếng Việt). Trả `Ok(tauri::ipc::Response::new(bytes))` với `bytes: Vec&lt;u8&gt;` thô. Dùng `Response` thay vì trả `Vec&lt;u8&gt;` trực tiếp: Rust serialize `Vec&lt;u8&gt;` thành `number[]`, TS phình ~4x bộ nhớ cho file 10MB; `Response` đưa `ArrayBuffer` nguyên bản sang TS. KHÔNG đổi thân `ssh_read_file_all` / `ssh_read_file_slice`. Thêm module test `#[cfg(test)]` với 2 case cho `check_doc_size` dùng `cargo test`.

    Trong `src-tauri/src/lib.rs`: thêm `ssh_service::ssh_read_file_bytes` vào danh sách `generate_handler!` ngay sau `ssh_read_file_slice` (dòng ~75).

    Trong `src/services/sshService.ts`: import type cần thiết rồi thêm `export async function readRemoteFileBytes(config, remotePath, secret?): Promise&lt;ArrayBuffer&gt;` theo đúng pattern `readRemoteFile` — guard `isTauriApp()`, `resolveSecret`, dynamic `import('@tauri-apps/api/core')`, `invoke&lt;ArrayBuffer&gt;('ssh_read_file_bytes', { config, secret: effectiveSecret ?? null, remotePath })`. Không decode, không base64 ở TS, KHÔNG bọc `new Uint8Array(arrayBuffer, byteOffset, ...)` — trả thẳng `ArrayBuffer` cho parser.
  </action>
  <verify>
    <automated>cd /Users/tranducquan/Working/Personal/task-management/src-tauri &amp;&amp; cargo test check_doc_size 2&gt;&amp;1 | tail -20; cd /Users/tranducquan/Working/Personal/task-management &amp;&amp; npx vitest run tests/services/sshService.test.ts --bail=1</automated>
  </verify>
  <done>`cargo test check_doc_size` pass 2 case; `ssh_read_file_bytes` đăng ký trong `generate_handler!` với kiểu trả `tauri::ipc::Response`; `readRemoteFileBytes` trả `ArrayBuffer` qua invoke đúng tên lệnh; lệnh text cũ byte-identical.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Parser JS thuần docx/xlsx/pdf + unit test mock buffer + cấu hình pdf worker</name>
  <files>src/services/ai/sshDocumentParser.ts, src/services/ai/__tests__/sshDocumentParser.test.ts, package.json, package-lock.json, vite.config.ts</files>
  <behavior>
    - `parseDocx(buffer)` với mammoth mock: trả text từ `extractRawText`, giữ bảng dạng dòng (`|` phân cách cell), gắn header `[DOCX]`
    - `parseXlsx(buffer)` với exceljs mock: trả từng sheet dạng `=== Sheet: &lt;name&gt; ===` + dòng cell, metadata `sheetCount`
    - `parsePdf(buffer)` với pdfjs-dist mock (`getDocument` → `numPages`, mỗi page `getTextContent` trả items có `str`): ghép text theo trang, metadata `pageCount`; PDF không text layer → `text: ''` kèm `note` "PDF không có text layer (có thể là ảnh scan); không hỗ trợ OCR."
    - `parseSshDocument(buffer, filename, maxChars?)`: dispatch theo extension; extension không hỗ trợ → throw tiếng Việt; cap default 24000 ký tự, khi vượt trả `truncated: true` + text đã cắt + thông báo rõ
    - Buffer có `byteOffset` ≠ 0 (view lệch) vẫn parse đúng vùng dữ liệu — test phòng ngừa lỗi slice của mammoth/exceljs/pdfjs
  </behavior>
  <action>
    Cài `mammoth@1.13.0` và `pdfjs-dist@6.5.438` (`npm install mammoth@1.13.0 pdfjs-dist@6.5.438` — ghi vào package.json + package-lock.json). `exceljs` đã có (`^4.4.0`), dùng import mặc định như `src/utils/dynamicFileSandbox.ts`.

    Giữ cap 10MB/file + 24k ký tự/output, KHÔNG hạ xuống 2MB như `BROWSER_FILE_MAX_BYTES`: tài liệu văn bản thực tế nhỏ; 2MB quá chặt cho xlsx nhiều sheet. IPC dùng `Response` nên bytes không phình; output vẫn cap 24k nên context window an toàn.

    Tạo `src/services/ai/sshDocumentParser.ts`: export kiểu `ParsedDocument { format: 'docx'|'xlsx'|'pdf'; text: string; truncated: boolean; metadata: { sheetCount?: number; pageCount?: number; note?: string } }`. Input cho mọi parser là `ArrayBuffer` nhận trực tiếp từ `readRemoteFileBytes` (Task 1), KHÔNG tạo `Uint8Array` view ở wrapper hay parser; nếu trong mock/test có view thì phải cắt đúng `slice(byteOffset, byteOffset + byteLength)` trước khi đưa vào thư viện để tránh lệch vùng dữ liệu.

    Dùng `mammoth.extractRawText({ arrayBuffer })` (hoặc `mammoth.convertToHtml` rồi strip tag — chọn `extractRawText` cho đơn giản, bảng được mammoth trả dạng text; nếu cần bảng có cấu trúc thì dùng convertToHtml + regex strip thẻ, nhưng KHÔNG thêm dependency). `.xlsx`: `new ExcelJS.Workbook()` → `workbook.xlsx.load(buffer as unknown as Parameters&lt;typeof workbook.xlsx.load&gt;[0])` kèm comment giải thích: kiểu khai của ExcelJS là `Buffer`, nhưng runtime nhận `Uint8Array`/`ArrayBuffer`; cast chỉ để khớp type, không đổi giá trị runtime. Với mỗi worksheet, `eachRow` → join cell value bằng ` | `, prefix `=== Sheet: ${ws.name} ===`. `.pdf`: `import * as pdfjs-dist` nhắm `pdfjs-dist` + `import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'`; đặt `pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl` một lần ở module scope; `getDocument({ data: buffer }).promise` → lặp `page.getTextContent()` → join `item.str`; đóng `pdf.clearResources()` nếu API có. pdfjs-dist@6.5.438 dùng `Promise.withResolvers` (Chrome 119+/Safari 17.4+): giả định Tauri 2 / WKWebView hiện tại đạt API này, verify bằng `tsc` + build; nếu webview cũ thiếu thì fallback = pin `pdfjs-dist@3.11.174`, KHÔNG đổi pin hiện tại. Cap: hàm `truncateText(text, maxChars=24000)` cắt rồi thêm `\n\n[Đã cắt bởi tool: nội dung vượt quá ${maxChars} ký tự.]`, set `truncated`. Không dùng OCR/Python/daemon.

    Trong `vite.config.ts`: thêm `worker: { format: 'es' }` nếu cần cho `?url` worker build Tauri; giữ `base` hiện nguyên (không đụng PWA/GitHub Pages). Verify build `npx tsc --noEmit` bắt buộc pass.

    Viết `src/services/ai/__tests__/sshDocumentParser.test.ts`: mock BẮT BUỘC bằng `vi.mock` — `vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'pdf.worker.mock.mjs' }))`, `vi.mock('pdfjs-dist', ...)`, `vi.mock('mammoth', ...)`, `vi.mock('exceljs', ...)` (không viết "nếu cần"). Dùng `Buffer`/`Uint8Array` giả, assert 6 behavior trên + case extension lạ + case truncation + case buffer có `byteOffset` ≠ 0.
  </action>
  <verify>
    <automated>cd /Users/tranducquan/Working/Personal/task-management &amp;&amp; npx vitest run src/services/ai/__tests__/sshDocumentParser.test.ts --bail=1 &amp;&amp; npx tsc --noEmit</automated>
  </verify>
  <done>6+ test parser pass với mock buffer (gồm case `byteOffset` ≠ 0); `npx tsc --noEmit` clean; mammoth/pdfjs-dist cài và build worker cho Tauri không lỗi import.</done>
</task>

<task type="auto">
  <name>Task 3: Tool AI `ssh_read_document` + registry Chat/Telegram + usage catalog</name>
  <files>src/types/sshFsTool.ts, src/services/ai/sshFsToolService.ts, src/services/ai/__tests__/sshFsToolService.test.ts, src/services/ai/aiTools.ts, src/services/ai/chatTurnTools.ts</files>
  <behavior>
    - Tool result `content` KHÔNG phải text thô: đi qua `sanitizeBrowserFileText` rồi `wrapField('NỘI DUNG TÀI LIỆU ' + targetPath, ...)`; thẻ mở/đóng mang nonce ngẫu nhiên nên text trong tài liệu không forge được thẻ đóng
    - `format`/`truncated`/metadata giữ nguyên; phần text nằm trong cặp thẻ `DỮ LIỆU KHÔNG ĐÁNG TIN — BẮT ĐẦU` / `KẾT THÚC DỮ LIỆU KHÔNG ĐÁNG TIN`
  </behavior>
  <action>
    Trong `src/types/sshFsTool.ts`: thêm `SshReadDocumentArgs { path: string }` (chỉ path; sshConfigId đến từ remoteTarget/global config như các tool khác); mở rộng `SshFsToolResult.action` thành `'list_dir' | 'read_file' | 'grep_files' | 'read_document'` (giữ các action cũ nguyên vẹn).

    Trong `src/services/ai/sshFsToolService.ts`: import `readRemoteFileBytes` từ `../sshService`, `parseSshDocument` từ `./sshDocumentParser`, `wrapField` từ `./untrustedData` (cùng thư mục `src/services/ai/`) và `sanitizeBrowserFileText` từ `./browserFileReader`. Thêm `export async function executeSshReadDocument(args, db = defaultDb, remoteTarget?)` theo pattern `executeSshReadFile`: validate `path` không rỗng → `resolveSshConfig` + `resolveRemoteToolPath` (giữ nguyên confinement repo cho remote target) → KIỂM TRA extension thuộc `docx|xlsx|pdf` (nếu không, trả `SshFsToolResult` success:false với thông báo tiếng Việt liệt kê định dạng hỗ trợ) → `readRemoteFileBytes(sshConfig, targetPath)` → `parseSshDocument(bytes, targetPath)` → trả JSON `success:true, action:'read_document', truncated, data: { path, format, ...metadata, content }` với `content: wrapField('NỘI DUNG TÀI LIỆU ' + targetPath, sanitizeBrowserFileText(parsed.text))` — text tài liệu là untrusted data, `sanitizeBrowserFileText` loại control char/thẻ giả, `wrapField` mint nonce (32-bit) chống forge thẻ đóng trước khi vào tool result/AI context. catch trả `success:false, action:'read_document', error` như pattern cũ. KHÔNG dùng `isLikelyBinaryPath` ở đây (docx/xlsx/pdf nằm trong set nhị phân cũ nhưng tool này phải đọc được chúng). Thêm case test trong `src/services/ai/__tests__/sshFsToolService.test.ts` assert `content` có cặp thẻ `DỮ LIỆU KHÔNG ĐÁNG TIN` với nonce khớp nhau và không chứa thẻ đóng do text tài liệu tự chèn.

    Trong `src/services/ai/aiTools.ts`: (1) import `executeSshReadDocument` cùng nhóm import sshFsToolService hiện tại (~dòng 93); (2) thêm định nghĩa tool vào `AI_DATABASE_TOOLS` ngay sau `ssh_read_file_page` (~dòng 2259): name `ssh_read_document`, description nêu rõ đọc .docx/.xlsx/.pdf qua SSH, trả text có metadata (format, sheetCount/pageCount, truncated), có cap 10MB/file và ~24k ký tự/output, KHÔNG hỗ trợ PDF scan/OCR; parameters chỉ `path: string` (bắt buộc); (3) thêm `case 'ssh_read_document'` trong `executeAiTool` switch (~dòng 2369) gọi `executeSshReadDocument(args as any, db, options?.remoteTarget)`; (4) thêm `'ssh_read_document'` vào filter `SSH_READ_TOOLS` (~dòng 5155).

    Trong `src/services/ai/chatTurnTools.ts`: thêm `ssh_read_document: SSH_ORACLE_USAGE` vào `BUILTIN_USAGE_OVERRIDES` (~dòng 266) để tool xuất hiện đúng trong Settings AI tool catalog. Không sửa registry Telegram — `telegramHeadlessWorker.ts` và `telegramMutationSession.ts` đã import `SSH_READ_TOOLS` nên tự động lấy tool mới; xác nhận bằng grep.

    Kiểm tra prompt admin/usage: nếu có danh sách tool admin hard-code khác ngoài 4 file trên (grep `ssh_read_file_page` toàn `src/`), chỉ bổ sung `ssh_read_document` ở nơi liệt kê tool SSH read.
  </action>
  <verify>
    <automated>cd /Users/tranducquan/Working/Personal/task-management &amp;&amp; grep -rn "SSH_READ_TOOLS\|ssh_read_document\|ssh_read_file_page" src/services/ai/chatTurnTools.ts src/services/telegram/telegramHeadlessWorker.ts src/services/telegram/telegramMutationSession.ts src/services/ai/aiTools.ts | grep -E "ssh_read_document|SSH_READ_TOOLS" | head -20 &amp;&amp; npx vitest run src/services/ai/__tests__/sshFsToolService.test.ts --bail=1</automated>
  </verify>
  <done>`ssh_read_document` có định nghĩa + dispatch + nằm trong `SSH_READ_TOOLS`; grep xác nhận Chat/Telegram headless/mutation cùng dùng danh sách đó; test sshFsToolService pass gồm case content được sanitize + wrapField có nonce; extension lạ trả lỗi tiếng Việt, output có `format`/`truncated`/metadata.</done>
</task>

<task type="auto">
  <name>Task 4: Commit scoped + push `pre-v1.6-baseline`</name>
  <files>src-tauri/src/ssh_service.rs, src-tauri/src/lib.rs, src/services/sshService.ts, src/services/ai/sshDocumentParser.ts, src/services/ai/__tests__/sshDocumentParser.test.ts, src/types/sshFsTool.ts, src/services/ai/sshFsToolService.ts, src/services/ai/__tests__/sshFsToolService.test.ts, src/services/ai/aiTools.ts, src/services/ai/chatTurnTools.ts, vite.config.ts, package.json, package-lock.json</files>
  <action>
    Chỉ commit các đường dẫn cụ thể do 3 task trên tạo/sửa: chạy `git status --short` để xác nhận scope, rồi `git add <đường dẫn cụ thể>` cho từng file trong danh sách `<files>` ở trên. TUYỆT ĐỐI KHÔNG `git add -A`, KHÔNG `git add .`, KHÔNG đụng `src/components/ai/office/TeamWorkspace.tsx` và `tests/components/ai/office/TeamWorkspaceWorktreeTarget.test.tsx` của session khác (còn dở trong working tree). Commit message mô tả tính năng đọc tài liệu SSH qua AI + thêm dòng `Co-Authored-By: Claude Code <noreply@anthropic.com>`. Sau đó `git push origin pre-v1.6-baseline`. KHÔNG tạo branch/worktree mới, KHÔNG đụng PWA/GitHub Pages.
  </action>
  <verify>
    <automated>cd /Users/tranducquan/Working/Personal/task-management &amp;&amp; git status --short &amp;&amp; git log -1 --pretty=fuller &amp;&amp; git status -sb | grep -q 'pre-v1.6-baseline' &amp;&amp; ! git status -sb | grep -q 'ahead'</automated>
  </verify>
  <done>Commit chứa đúng file của 3 task trên, không chứa TeamWorkspace.tsx/test của session khác; message có dòng Co-Authored-By đúng; `git push origin pre-v1.6-baseline` thành công, không còn ahead so với origin.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| remote SSH file → Tauri command | Nội dung tệp remote không tin cậy; đọc qua SFTP với cap kích thước |
| parsed document → AI prompt | Text trích từ docx/xlsx/pdf là untrusted data, đi vào tool result/AI context qua sanitize + wrapField có nonce |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-VPS-01 | Denial of service | `ssh_read_file_bytes` | mitigate | `check_doc_size` chặn file > 10MB trước `read_to_end`; cap output parser 24k ký tự; `Response` tránh phình bộ nhớ TS |
| T-VPS-02 | Tampering | `executeSshReadDocument` | mitigate | Dùng `resolveRemoteToolPath` hiện có để confine path trong repo của remote target |
| T-VPS-03 | Tampering (prompt injection) | `executeSshReadDocument` → tool result | mitigate | Text tài liệu là untrusted data: `sanitizeBrowserFileText` loại control char/thẻ giả, rồi `wrapField('NỘI DUNG TÀI LIỆU ' + targetPath, ...)` bọc bằng cặp thẻ mang nonce ngẫu nhiên (32-bit) chống forge thẻ đóng; không trả `content` text thô vào AI context. Không OCR, không gửi bytes ra daemon; lỗi tiếng Việt không lộ secret |
| T-VPS-SC | Tampering | npm install mammoth/pdfjs-dist | mitigate | Chỉ cài 2 package đã nêu version cụ thể từ registry npm; không thêm package khác |
</threat_model>

<verification>
1. `cd src-tauri &amp;&amp; cargo test check_doc_size` — 2 case cap pass.
2. `npx vitest run src/services/ai/__tests__/sshDocumentParser.test.ts src/services/ai/__tests__/sshFsToolService.test.ts tests/services/sshService.test.ts --bail=1` — scoped, KHÔNG chạy full suite (&gt;1h).
3. `npx tsc --noEmit` — clean.
4. `npm run build` nếu cần kiểm tra pdf worker build Tauri (không đụng cấu hình PWA).
5. Kiểm tra `git status` — KHÔNG đụng `src/components/ai/office/TeamWorkspace.tsx` và `tests/components/ai/office/TeamWorkspaceWorktreeTarget.test.tsx` của người dùng; chỉ branch `pre-v1.6-baseline`, không worktree/branch mới; commit scoped (`git add <đường dẫn cụ thể>`, KHÔNG `git add -A`) + `git push origin pre-v1.6-baseline` với dòng Co-Authored-By đúng.
</verification>

<success_criteria>
- AI Chat và Telegram (headless + mutation) có tool `ssh_read_document`, gọi được bytes qua SFTP có cap 10MB trả `ArrayBuffer`, parse đúng docx/xlsx/pdf với output cap 24k ký tự kèm cờ truncated.
- Lệnh read text cũ không đổi hành vi; lỗi PDF scan/OCR được nêu rõ trong description tool và kết quả parse.
- `content` text tài liệu luôn được sanitize + `wrapField` có nonce; không có đường trả text thô vào AI context.
- Mọi test scoped ở trên pass; `tsc --noEmit` clean; không full vitest; commit scoped + push `pre-v1.6-baseline`; không đụng file đang dở của người dùng.
</success_criteria>

<output>
Tạo `.planning/quick/261124-vps-ssh-read-file-docx-xlsx-pdf/261124-vps-SUMMARY.md` khi thực hiện xong.
</output>
