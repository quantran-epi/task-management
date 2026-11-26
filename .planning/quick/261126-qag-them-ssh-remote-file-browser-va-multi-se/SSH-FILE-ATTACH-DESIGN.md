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

