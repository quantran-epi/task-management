# Thiết kế: SSH file browser + đính kèm nhiều file + AI đọc file đính kèm (chat standalone)

Tài liệu thiết kế, chưa triển khai. Mọi tên file/hàm bên dưới đã được kiểm tra trực tiếp trong codebase tại thời điểm viết (xem mục "Điểm nối đã xác minh"). Không thêm thư viện mới: `mammoth`, `exceljs`, `pdfjs-dist` đã có cho đường document.

## 1. Phạm vi và gating — chỉ cửa sổ chat standalone

**Quyết định:** tính năng browser SSH, nút "Đính kèm", chip file remote và tool `ssh_read_attached_file` chỉ tồn tại trong cửa sổ chat standalone. Chat dock trong workbench giữ nguyên hoàn toàn: không thêm nút, không thêm affordance, không advertise tool mới.

Điểm nối gating đã xác minh:

- `src/views/AIPopoutView.tsx` nhận prop `standaloneChat?: boolean` (dòng 24), dùng `chatWindowDb` làm DB khi `standaloneChat` (dòng 28: `db ?? (standaloneChat ? chatWindowDb : defaultDb)`), và truyền `isStandaloneChat={standaloneChat}` vào `AIChatDrawer` (dòng 229). Cùng chỗ truyền `onOpenSettings` và `db={activeDb}` (dòng 230-231).
- `src/components/ai/AIChatDrawer.tsx` nhận `isStandaloneChat?: boolean` (dòng 246, mặc định `false` ở dòng 263). Flag này đã được dùng để tắt auto-register remote scope (dòng 512), tắt resolve entity mention (dòng 1543, 1557) và chọn deep link (dòng 1253).
- `src/components/ai/ChatInputBar.tsx` hiện nhận `attachedFiles?: string[]`, `onAttachFile?: (filePath: string) => void`, `onRemoveFile?: (filePath: string) => void` (dòng 23-25). `AIChatDrawer` truyền các prop này tại dòng 2367-2369, lấy từ `activeRuntime.references` qua `handleAttachFile`/`handleRemoveFile` (dòng 447-456).
- `src/components/ai/ChatTabToolbox.tsx` là nơi chứa nút "SSH Files" hiện tại (`data-testid="tab-ssh-fs-btn"`, dòng 429-440) với prop `sshFsToolEnabled` (dòng 38). Đây là vị trí tự nhiên để đặt nút mở browser mới.

**Cơ chế gating đề xuất (khi implement):**

1. Thêm prop mới `isStandaloneChat?: boolean` vào `ChatTabToolbox` (mặc định `false`). `AIChatDrawer` chỉ truyền `true` khi `isStandaloneChat`; do đó dock chat không bao giờ thấy nút browser.
2. Thêm prop `isStandaloneChat?: boolean` vào `ChatInputBar` (mặc định `false`). Nút browser SSH chỉ render khi prop này đúng, đi kèm nút kẹp giấy hiện tại (giữ nút cũ cho đường local browser).
3. Tool `ssh_read_attached_file` chỉ được advertise trong danh sách tool khi turn thuộc `isStandaloneChat`. Dùng cùng điểm kiểm soát với nhóm SSH tool hiện tại trong `src/services/ai/aiTools.ts` (nhóm `['ssh_list_dir', 'ssh_read_file_page', 'ssh_read_document', 'ssh_grep_files']` tại dòng 5179). Không đưa tool mới vào dock chat.
4. Turn references (`tabRuntimes.get(turnTabId)?.references`, `AIChatDrawer.tsx:1565`) vẫn là nguồn attached set cho turn hiện tại; standalone đã dùng chỗ này để giữ file references (`AIChatDrawer.tsx:1551-1569`).

## 2. Nguồn cấu hình SSH và đường path

**Quyết định:** tái dùng cấu hình SSH đã có trong standalone DB, không tạo store cấu hình mới.

- `src/db/chatWindowDb.ts` định nghĩa `chatWindowDb = new TaskPlannerDatabase('TaskMateChatWindowDB')` — DB riêng của cửa sổ chat, tách khỏi `db` mặc định; comment ghi rõ dock chat vẫn dùng `db` singleton. `AIPopoutView` đã dùng `chatWindowDb` cho standalone.
- Cấu hình SSH FS hiện nằm ở `db.settings` với key `SSH_FS_TOOL_CONFIG_KEY = 'ssh_fs_ai_tool_config'` (`src/types/sshFsTool.ts:30`), đọc/ghi qua `getSshFsToolConfig(db)` / `saveSshFsToolConfig(config, db)` trong `src/services/ai/sshFsToolService.ts` (dòng 47-66). UI cấu hình là `SshFsAiToolConfigCard` (`src/components/settings/SshFsAiToolConfigCard.tsx`), nhận prop `db` và đã được dùng trong `AISettingsDrawer` với `db={activeDb}` (xem `src/views/AIPopoutView.tsx:233`). Browser mới phải gọi các helper này với `activeDb`/`db` từ drawer, không dùng `defaultDb`.
- `resolveSshConfig()` (`sshFsToolService.ts:77`) ưu tiên `remoteTarget?.sshConfigId`, sau đó tới persisted config; `fsConfig.defaultBasePath` và các cap (`maxListEntries`, `maxLinesPerRead`) là thông số giới hạn. Khi standalone chưa có remote scope (mặc định `{ type: 'global' }` tại `AIPopoutView.tsx:35`), browser dùng persisted `sshConfigId`; nếu sau này có remote target thì path bị chặn trong `repoPath`.
- `listRemoteDir(config, remotePath)` trong `src/services/sshService.ts:121` là hàm duy nhất để liệt kê thư mục remote (invoke `ssh_list_dir` qua Tauri). Browser không gọi Rust command trực tiếp.
- `resolveRemoteToolPath(inputPath, defaultBasePath, remoteTarget)` trong `src/services/ai/sshFsToolService.ts:147` chuẩn hoá path POSIX, chặn `~` và `..` vượt ngoài `repoPath` của remote target. Mọi path sinh ra từ browser và mọi path tool nhận vào đều phải đi qua hàm này trước khi đưa tới SSH — tránh lệch giữa "path hiển thị trên chip" và "path thực sự được đọc".
- `src/services/sshService.ts` còn có `readRemoteFileBytes` (dòng 160) và `readRemoteFileSlice` (dòng 177); browser **không** gọi hai hàm này lúc chọn file (xem phần 4).

**Không thêm thư viện nào.** Parser docx/xlsx/pdf đã dùng `mammoth`, `exceljs`, `pdfjs-dist` trong `src/services/ai/sshDocumentParser.ts`; UI dùng Ant Design có sẵn (`Tree`/`Checkbox`/`Input`/`Button`/`Tooltip` qua lớp `src/components/ui`).

## 3. UI browser SSH đề xuất

**Component mới:** `src/components/ai/StandaloneSshFileBrowser.tsx` (Modal/Drawer của Ant Design), props đề xuất:

| Prop | Kiểu | Mục đích |
|------|------|----------|
| `open` | `boolean` | Đóng/mở từ nút trong `ChatInputBar` hoặc `ChatTabToolbox` |
| `onClose` | `() => void` | Đóng browser |
| `db` | `TaskPlannerDatabase` | Truyền `activeDb` của standalone để đọc config trong `chatWindowDb` |
| `remoteTarget` | `RemoteToolTarget \| undefined` | Target của turn (nếu có) để giới hạn path |
| `initialPath` | `string?` | Mặc định `fsConfig.defaultBasePath ?? '/'`, đã qua `resolveRemoteToolPath` |
| `onAttach` | `(paths: string[]) => void` | Trả danh sách path đã chọn về `AIChatDrawer` |

Hành vi:

1. Mở bằng nút riêng trong `ChatInputBar` (chỉ render khi `isStandaloneChat`) hoặc mục "SSH Files" trong `ChatTabToolbox` (chỉ render khi `isStandaloneChat`). Nút cũ kẹp giấy/local vẫn giữ nguyên.
2. Khi mở, đọc config bằng `getSshFsToolConfig(db)`; nếu thiếu `sshConfigId`, hiện thông báo hướng tới `SshFsAiToolConfigCard` trong Settings của cửa sổ standalone thay vì fallback sang `defaultDb`.
3. Tree thư mục lấy từ `listRemoteDir(sshConfig, path)`; điều hướng bằng double-click vào thư mục hoặc breadcrumb. Gọi `resolveRemoteToolPath` cho mỗi path trước khi list. Giới hạn entries theo `fsConfig.maxListEntries` (mặc định 100, tối đa 200 như `executeSshListDir` hiện dùng), có `showHidden` toggle và filter extension (ví dụ `docx,xlsx,pdf,ts,tsx,md,log,...`).
4. Mỗi dòng file có `Checkbox`; giữ selections qua nhiều lần điều hướng (lưu path đầy đủ làm key, không chỉ tên file). Hiện số lượng đã chọn.
5. Nút "Đính kèm" gọi `onAttach(paths)` một lần cho toàn bộ selection, sau đó đóng modal. Nút "Huỷ" bỏ selection. Không có tiền tố `file:` cho path remote (đường local dùng cú pháp `[name](file:path)` trong `ChatInputBar.tsx:226-248`).
6. Trạng thái loading/empty/error hiển thị tại chỗ (`Spin`, `Empty`, `Alert` từ lớp `ui`); lỗi SSH không được nuốt thành danh sách rỗng im lặng.

## 4. Dữ liệu đính kèm — chỉ danh tính path, không đọc nội dung

**Quyết định:** chọn file = lưu path remote vào attached set của tab. Không gọi `readRemoteFileBytes`/`readRemoteFileSlice`, không gọi parser, không đưa nội dung vào prompt ở thời điểm attach. Việc đọc chỉ xảy ra khi AI gọi tool (xem phần 5).

- Tái dùng `attachedFiles: string[]`, `onAttachFile(filePath)`, `onRemoveFile(filePath)` của `ChatInputBar.tsx` (dòng 23-25) và `handleAttachFile`/`handleRemoveFile` của `AIChatDrawer.tsx` (dòng 447-456) — `handleAttachFile` đã chống trùng path, `handleRemoveFile` lọc theo path. Với multi-select, `AIChatDrawer` gọi `handleAttachFile` cho từng path (hoặc thêm hàm `handleAttachFiles(paths[])` viết theo cùng nguyên tắc dedupe trong cùng file) để cập nhật `tabRuntimesRef.current.patch(activeTabId, { references: [...] })`.
- Chip hiển thị `{tên file}` (đoạn cuối path), `Tooltip` chứa path đầy đủ, nút remove gọi `onRemoveFile(path)`. Chip render trong `ChatInputBar` từ `attachedFiles`; không đổi cấu trúc dữ liệu `string[]`.
- Phân biệt rõ hai đường:
  - **Local browser (hiện tại):** `readBrowserFileText()` trong `src/services/ai/browserFileReader.ts:75` chỉ text, cap `BROWSER_FILE_MAX_BYTES = 2 MB`, chặn binary, và `ChatInputBar.tsx:250-262` chỉ đọc sau `window.confirm`.
  - **Remote SSH (đề xuất):** attach chỉ lưu path; tool đọc theo nhu cầu, có sanitize + wrapField, document cap 24k ký tự, text/code phân trang. Không dùng `readBrowserFileText` cho path remote.

**Bảng file dự kiến khi implement (chỉ thiết kế, chưa tạo mã):**

| File | Thay đổi | Wave |
|------|----------|------|
| `src/components/ai/StandaloneSshFileBrowser.tsx` | Thêm component browser (tree, filter, multi-checkbox, nút Đính kèm) | 1 |
| `src/components/ai/ChatInputBar.tsx` | Thêm prop `isStandaloneChat` + nút mở browser; render chip remote (dùng lại `attachedFiles`/`onRemoveFile`) | 1 |
| `src/components/ai/ChatTabToolbox.tsx` | Thêm prop `isStandaloneChat`, chỉ render mục/browser khi standalone | 1 |
| `src/components/ai/AIChatDrawer.tsx` | Truyền `isStandaloneChat` xuống input/toolbox; thêm `handleAttachFiles(paths[])`; truyền config/target vào browser | 2 |
| `src/types/sshFsTool.ts` | Thêm `SshReadAttachedFileArgs { path; offset?; limit? }` và mở rộng union `action` nếu cần | 2 |
| `src/services/ai/sshFsToolService.ts` | Thêm hàm validate attached set + `executeSshReadAttachedFile`; ủy thác read theo extension | 2-3 |
| `src/services/ai/aiTools.ts` | Thêm tool definition `ssh_read_attached_file`, dispatch case, gating advertise cho standalone | 3 |
| `src/services/ai/prompts* / system prompt nơi liệt kê tool SSH` | Cập nhật hướng dẫn dùng tool (chỉ standalone) | 3 |
| `src/services/ai/__tests__/sshFsToolService.test.ts` | Test validate path/attached set, delegation text/doc | 4 |
| `src/services/ai/__tests__/sshDocumentParser.test.ts` | Test giữ hành vi cap 24k/không OCR | 4 |
| `tests/phase51/*` | Test UI standalone (gating, multi-select, chip) | 4 |
| `e2e/aiChatStandalone.html`, `e2e/aiChatStandalone.tsx`, `e2e/aiChatSettings.spec.ts` | E2E Chromium cho luồng attach + đọc | 4 |

## 5. Tool mới `ssh_read_attached_file` và trust boundary

### Hợp đồng tool

Thêm tool `ssh_read_attached_file` trong `src/services/ai/aiTools.ts` (definition cạnh `ssh_read_document` tại dòng ~2265) và type `SshReadAttachedFileArgs` trong `src/types/sshFsTool.ts`:

| Tham số | Kiểu | Bắt buộc | Ý nghĩa |
|---------|------|----------|---------|
| `path` | `string` | có | Đường dẫn remote phải nằm trong attached set của turn hiện tại (không nhận host/config selector do AI sinh) |
| `offset` | `number` | không | 1-based, chỉ dùng cho text/code; ủy thác cho `executeSshReadFile` |
| `limit` | `number` | không | clamp tới 500 như hiện tại; chỉ dùng cho text/code |

Luồng xử lý đề xuất trong `sshFsToolService.ts` (hàm `executeSshReadAttachedFile`):

1. Nhận `attachedSet` của turn hiện tại từ caller (tức `tabRuntimes.get(turnTabId)?.references` — `AIChatDrawer.tsx:1565` — đã chứa path đã attach). Không cho AI tự khai attached set.
2. So khớp `args.path` với attached set **sau khi chuẩn hoá** bằng cùng `resolveRemoteToolPath(args.path, fsConfig.defaultBasePath, remoteTarget)`; từ chối nếu không khớp. Không fallback sang host/path khác và không fallback sang global config khi có `remoteTarget` (nhất quán với `resolveSshConfig()` hiện tại, `sshFsToolService.ts:77-105`).
3. Phân loại extension:
   - **Text/code:** gọi `executeSshReadFile({ path: resolved, offset, limit }, db, remoteTarget)`. `isLikelyBinaryPath()` trong hàm này chặn binary. AI chọn `offset`/`limit`.
   - **`.docx`/`.xlsx`/`.pdf`:** gọi `executeSshReadDocument({ path: resolved }, db, remoteTarget)` — **đọc toàn file rồi cap 24.000 ký tự đầu** như đã điều tra. `offset`/`limit` bị bỏ qua; tool description phải nói rõ điều này để AI không kỳ vọng chọn trang/sheet. Không hứa hỗ trợ chọn sheet/trang khi parser hiện tại chưa có tham số đó.
   - **Extension khác / binary không thuộc 3 định dạng trên:** từ chối (`success: false` + error message), không đoán định dạng.
4. Trả nguyên JSON kết quả của hàm ủy thác để giữ nguyên `success`, `action`, `truncated`, `executionTimeMs` và `data.content` đã sanitize/wrapField. Không tự nối thêm nội dung thô vào result.

### Trust boundary và mitigation

| Boundary | Luồng dữ liệu | Rủi ro | Mitigation cụ thể |
|----------|---------------|--------|-------------------|
| (a) người dùng → attach | `StandaloneSshFileBrowser` → `onAttach(paths)` → `references` | Chọn nhầm path/host, path vượt repo, nội dung bị đọc sớm | Chỉ render UI khi `isStandaloneChat`; config đọc từ `activeDb` (`chatWindowDb`); mọi path đi qua `resolveRemoteToolPath`; attach lưu **danh tính path**, không gọi `readRemoteFileBytes`/`readRemoteFileSlice`/parser |
| (b) AI → tool args | Model sinh `path`/`offset`/`limit`, có thể bị prompt injection từ nội dung tài liệu | Đọc file ngoài attached set, path traversal, host fallback, binary đọc nhầm | Validate path thuộc attached set của turn **sau** chuẩn hoá; `resolveRemoteToolPath` confinement; shell escape `shellQuote()` (`sshFsToolService.ts:42`) và `isLikelyBinaryPath()` giữ nguyên cho đường text; từ chối thay vì fallback; gating advertise tool chỉ standalone |
| (c) remote document → prompt | `parsed.text` từ DOCX/XLSX/PDF → nội dung tool → ngữ cảnh AI | Text trong tài liệu giả mạo delimiter/instruction | Dùng nguyên `sanitizeBrowserFileText(parsed.text)` + `wrapField(label, ...)` từ `executeSshReadDocument` (nonce ngẫu nhiên, `untrustedData.ts:47`); không tin text trong tài liệu; không đưa raw bytes hay raw text vào prompt |

**Quyết định thiết kế bổ sung:**

- **Không gửi nội dung tới knowledge daemon.** Tool chỉ đọc qua Tauri/SSH local và trả về ngữ cảnh AI; giữ 100% local/Tauri, không gọi daemon hay network service khác.
- **PDF scan vẫn không OCR.** Giữ `SCAN_NOTE` của `sshDocumentParser.ts:29`; nếu không có text layer thì tool trả text rỗng kèm note như hiện tại.
- Giữ nguyên cap 24k ký tự của document; mọi thay đổi về cap phải là quick task riêng, không nằm trong thiết kế attach này.
- Gating tool theo standalone được coi là đã mitigate T-QAG-04; dock chat không gắn affordance lẫn tool.

## 6. Wave triển khai đề xuất

| Wave | Phạm vi | Output kiểm tra được |
|------|---------|----------------------|
| **Wave 1 — contract + browser UI** | Thêm `isStandaloneChat` vào `ChatInputBar`/`ChatTabToolbox`; tạo `StandaloneSshFileBrowser.tsx`; đọc config từ `activeDb`, list bằng `listRemoteDir`, filter + multi-checkbox + nút Đính kèm; định nghĩa `SshReadAttachedFileArgs` | Mở standalone thấy nút browser; dock chat không thấy; chọn nhiều file trả về đúng mảng path đã chuẩn hoá; không tool call nào xảy ra lúc attach |
| **Wave 2 — attach state + tool validate** | `AIChatDrawer.handleAttachFiles` cập nhật `references`; `executeSshReadAttachedFile` validate attached set + `resolveRemoteToolPath`; từ chối path ngoài set và binary extension | Unit test chặn path ngoài attached set, `..`, `~`, binary; chip hiển thị/remove đúng |
| **Wave 3 — wire vào dispatcher + prompts** | Thêm tool definition + `case 'ssh_read_attached_file'` trong `aiTools.ts`; advertise chỉ khi standalone; cập nhật system prompt hướng dẫn dùng tool; ủy thác text/doc | Tool được gọi trong standalone turn, trả nội dung đã sanitize/wrapField; dock chat không advertise tool |
| **Wave 4 — test** | Mở rộng unit test ssh service/parser, UI test standalone, e2e Chromium | Targeted test pass (xem phần 7), không chạy full vitest suite |

Phụ thuộc: Wave 2 cần contract từ Wave 1; Wave 3 cần validator từ Wave 2; Wave 4 cần đủ 3 wave trước. Mỗi wave nên commit riêng; không gộp thay đổi production của wave này vào quick task hiện tại.

## 7. Chiến lược test tập trung

- **Unit service:** mở rộng `src/services/ai/__tests__/sshFsToolService.test.ts` — test path ngoài attached set bị từ chối, `..`/`~` bị chặn bởi `resolveRemoteToolPath`, text/code ủy thác `executeSshReadFile` với offset/limit, docx/xlsx/pdf ủy thác `executeSshReadDocument`, binary extension bị từ chối, result giữ cờ `truncated`.
- **Unit parser:** mở rộng `src/services/ai/__tests__/sshDocumentParser.test.ts` — khẳng định lại cap 24.000 ký tự (`DEFAULT_MAX_CHARS`), flag `truncated`, và PDF scan trả note `SCAN_NOTE` không OCR. Không đổi expectation sang "chọn sheet/trang".
- **UI standalone:** thêm test trong `tests/phase51/` — browser chỉ render khi `isStandaloneChat`, multi-select giữ selection qua điều hướng, chip hiển thị tên + tooltip path + remove, không gọi read khi attach.
- **E2E Chromium:** dùng lại `e2e/aiChatStandalone.html` và `e2e/aiChatStandalone.tsx` để dựng fixture cửa sổ standalone, mở rộng `e2e/aiChatSettings.spec.ts` cho luồng cấu hình SSH → mở browser → attach nhiều file → AI gọi `ssh_read_attached_file` → nội dung hiển thị trong câu trả lời; kiểm tra dock chat không có nút/tool mới.
- **Chạy test:** luôn chạy targeted theo đường dẫn cụ thể (ví dụ `npx vitest run src/services/ai/__tests__/sshFsToolService.test.ts src/services/ai/__tests__/sshDocumentParser.test.ts tests/phase51/...`). **Không chạy full vitest suite** — quy tắc dự án: full suite tốn hơn 1 giờ. Quick task này chỉ dùng targeted grep/kiểm tra tệp, không chạy suite.

## Điểm nối đã xác minh (tóm tắt)

| Khẳng định | File / hàm |
|------------|------------|
| Standalone truyền flag + DB riêng | `src/views/AIPopoutView.tsx:27-28,229-231` — `standaloneChat`, `chatWindowDb`, `isStandaloneChat` |
| Drawer nhận flag, giữ references theo tab | `src/components/ai/AIChatDrawer.tsx:246,263,447-456,1565` |
| Input bar đã có props attach | `src/components/ai/ChatInputBar.tsx:23-25,217-268` |
| Toolbox có nút SSH Files | `src/components/ai/ChatTabToolbox.tsx:36-38,415-440` |
| Config SSH FS trong DB/tool | `src/types/sshFsTool.ts:30`; `src/services/ai/sshFsToolService.ts:47-105`; `src/components/settings/SshFsAiToolConfigCard.tsx:29` |
| List thư mục remote | `src/services/sshService.ts:121` — `listRemoteDir` |
| Confinement path | `src/services/ai/sshFsToolService.ts:147` — `resolveRemoteToolPath`; `:42` — `shellQuote`; `:34` — `isLikelyBinaryPath` |
| Đọc text phân trang / document toàn file | `src/services/ai/sshFsToolService.ts:247` (`executeSshReadFile`) / `:312` (`executeSshReadDocument`) |
| Parser và cap | `src/services/ai/sshDocumentParser.ts:27,32-38,53-143` — `DEFAULT_MAX_CHARS`, `truncateText`, `parseSshDocument`; `:29` — `SCAN_NOTE` |
| Sanitize + wrapField | `src/services/ai/browserFileReader.ts:46` — `sanitizeBrowserFileText`; `src/services/ai/untrustedData.ts:47` — `wrapField` |
| Tool definition/dispatch hiện tại | `src/services/ai/aiTools.ts:2239,2265,2389-2395,5179` |
| DB riêng của chat standalone | `src/db/chatWindowDb.ts:5` — `TaskMateChatWindowDB` |

