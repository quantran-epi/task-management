# Thiết kế: SSH attached-file theo kiểu Claude Code — chat standalone

**Trạng thái: thay thế `SSH-FILE-ATTACH-DESIGN.md` (261126-qag).** File cũ chỉ là đối chiếu, không sửa; mọi hợp đồng dưới đây overrides file cũ. Design-only: quick task này không sửa mã production.

| Quyết định | Nội dung giữ nguyên |
|---|---|
| `ATTACH-PERSIST-IN-MESSAGE` | Đính kèm là một phần của tin nhắn, không phải transient tab state; chip sống sau reload và sau backup/restore. |
| `DOC-PROGRESSIVE-READ` | DOCX/XLSX/PDF đọc progressive theo vùng (`info` rồi `read` có range), không đọc toàn file rồi cắt 24k. |
| `SSH-BROWSER-SEARCH` | Browser SSH có tree `listRemoteDir` + tìm tên file `find -iname | head -n 201`, multi-select full normalized path. |
| `UNIFIED-ATTACH-TOOL-FAMILY` | Tool family `ssh_attached_file_info/search/read` thay `ssh_read_attached_file`; mọi tool validate path thuộc attached set. |
| `GATING-STANDALONE-ONLY` | Chỉ standalone chat có browser/chip/tool; dock chat giữ nguyên; không knowledge daemon, không network service mới. |

## 1. Gating — chỉ cửa sổ chat standalone

Mọi affordance mới (nút browser, chip trên tin nhắn, tool family) đi qua một cổng duy nhất: `isStandaloneChat`. Dock chat không thêm nút, không render chip mới, không advertise tool mới.

Điểm nối đã xác minh:

- `src/views/AIPopoutView.tsx:24,27-28,229-231` — prop `standaloneChat`, `activeDb = db ?? (standaloneChat ? chatWindowDb : defaultDb)`, truyền `isStandaloneChat={standaloneChat}` và `db={activeDb}` xuống `AIChatDrawer`, rồi `db={activeDb}` vào `AISettingsDrawer`.
- `src/components/ai/AIChatDrawer.tsx:246,263` — prop `isStandaloneChat?: boolean`, mặc định `false`. Cờ này đã chặn remote scope auto-register (`:512`), entity mention (`:1543,1557`) và chọn prompt (`:1704,1729`).
- `src/components/ai/AIChatDrawer.tsx:447-456` — `handleAttachFile`/`handleRemoveFile` hiện ghi `tabRuntimesRef.current.patch(activeTabId, { references })`; đây là draft runtime state, chưa phải tin nhắn.
- `src/components/ai/AIChatDrawer.tsx:1565` — `turnReferences = tabRuntimes.get(turnTabId)?.references ?? []`: nguồn attached set của turn hiện tại.
- `src/components/ai/AIChatDrawer.tsx:1673` — `standaloneCapability: isStandaloneChat` trong `getToolsForTurnWithRemote`.
- `src/components/ai/AIChatDrawer.tsx:1704-1729` — `standalonePrompt` riêng, chọn khi `isStandaloneChat`; `standalonePrompt` là nơi duy nhất được phép advertise tool family mới.
- `src/components/ai/AIChatDrawer.tsx:2321-2369` — dây props vào `ChatInputBar`, gồm `attachedFiles`, `onAttachFile`, `onRemoveFile` từ `activeRuntime.references`.
- `src/services/ai/chatTurnTools.ts:151,170,292-295` — option `standaloneCapability`, nhánh sớm trả tools standalone, và bảng `SSH_ORACLE_USAGE` nơi phải khai báo usage cho tool mới.
- `src/services/ai/aiTools.ts:5179` — điểm gate hiện tại của nhóm SSH tool (`ssh_list_dir`, `ssh_read_file_page`, `ssh_read_document`, `ssh_grep_files`); không dùng `allowedToolNames` vì lọc mất dynamic MCP/Graphiti (`chatTurnTools.ts:151`).

**Quyết định cổng:** `getToolsForTurnWithRemote` chỉ thêm `ssh_attached_file_*` khi đồng thời `standaloneCapability === true` **và** có ít nhất một attachment trong turn. Không quảng cáo tool khi chưa attach; không thêm tool vào dock dù SSH config sẵn. UI: `ChatInputBar`/`ChatTabToolbox` nhận `isStandaloneChat?: boolean` (default `false`), `AIChatDrawer` chỉ truyền `true` khi `isStandaloneChat`.

## 2. Attachment bền vững — hai lớp rõ ràng

**Lớp (a) draft trước khi gửi.** `ChatTabConfig.attachments?: string[]` đã tồn tại (`src/types/models.ts:239-247`); runtime dùng `references` trong `tabRuntimesRef` (`AIChatDrawer.tsx:447-456`) và render chip qua `ChatInputBar.tsx:23-25,783-827,903-912`. Ai trong composer thêm/xoá chip đều cập nhật draft; chưa ghi vào tin nhắn.

**Lớp (b) tin nhắn đã gửi.** Thêm `ChatMessage.attachments?: string[]` (`src/types/models.ts:291-306`), ghi **cùng lúc** với `saveMessage` tại `AIChatDrawer.tsx:1426` và `src/db/repositories/chatRepo.ts:23-36,87-131` (`SaveMessageInput` + bản ghi `message`). Lúc gửi, copy danh sách attachment hiện tại của draft vào bản ghi; sau đó draft có thể clear mà chip trên tin nhắn vẫn sống.

- `ChatMessageBubble.tsx:348,377,1181` render chip trên tin nhắn đã gửi (dùng lại kiểu chip của `ChatInputBar`), qua `ChatMessageList.tsx:28-29,420`. Chip tin nhắn cũ **chỉ đọc**: không nút xoá, chỉ tooltip full path.
- `src/validation/backupSchemas.ts:291` — `BackupChatMessageRecordSchema` là `z.object` **không** có `attachments`: Zod sẽ strip field khi restore. Đây là điều kiện bắt buộc: khai báo `attachments: z.array(z.string()).optional()`. `src/services/backup/validateBackup.ts:212-223` validate `chatMessages` bằng schema này và chỉ map riêng `messageKind: 'steer'`; **không cần đổi logic khác**.
- Cảnh báo đã xác minh: `FORBIDDEN_BACKUP_KEYS` chứa chữ `attachments` (`backupSchemas.ts:198`) và `findForbiddenBackupKey` quét đệ quy (`:201-217`). Hiện hàm chỉ được dùng trong `superRefine` của `BackupChatTabRecordSchema` (`:251`) — tức chỉ chặn khi `attachments` nằm trong **tab config**, không chặn bản ghi tin nhắn. Khi implement giữ nguyên ranh giới này: draft `ChatTabConfig.attachments` vẫn không được export, còn `ChatMessage.attachments` là field được khai báo rõ trong message schema. Nếu sau này mở rộng forbidden-key check sang message record, phải sửa danh sách ở `:198` cùng lúc, nếu không chip sẽ bị từ chối khi restore.

Chip lưu **danh tính path đã chuẩn hoá**, không nội dung: attach không gọi `readRemoteFileBytes`, `readRemoteFileSlice` (`src/services/sshService.ts:160,177`) hay parser nào.

## 3. Browser SSH searchable

Component mới `src/components/ai/StandaloneSshFileBrowser.tsx`, chỉ render khi `isStandaloneChat`.

- **Config:** `getSshFsToolConfig(activeDb)` (`sshFsToolService.ts:47-66`) với key `SSH_FS_TOOL_CONFIG_KEY = 'ssh_fs_ai_tool_config'` (`src/types/sshFsTool.ts:30`, DB riêng `chatWindowDb`). Không fallback sang `defaultDb`; nếu thiếu `sshConfigId`, hiện hướng dẫn cấu hình trong Settings của standalone.
- **Tree:** `listRemoteDir(sshConfig, path)` (`src/services/sshService.ts:121`), mọi path đi qua `resolveRemoteToolPath(input, fsConfig.defaultBasePath, remoteTarget)` (`sshFsToolService.ts:147-169`). Base mặc định là `defaultBasePath` đã resolve; **không quét `~/`** khi chưa rõ base.
- **Tìm tên file:** `execRemoteCommand(sshConfig, command, undefined, callId)` (`sshService.ts:272-276`) với lệnh `find <base> -type f -iname '<q shellQuote>' | head -n 201`. `shellQuote` ở `sshFsToolService.ts:42`; `<q>` luôn đi qua hàm này. UI sinh `callId` và hủy bằng `cancelRemoteCall`/`cancelToolCall` (`sshService.ts:295-308`). Giới hạn 201 để phân biệt "có thêm kết quả" với "đủ 201"; find lỗi/thiếu `head` thì hiện lỗi rõ ràng, **không** trả danh sách rỗng im lặng.
- **Selection:** multi-select lưu **full normalized path** làm key (không chỉ tên file), giữ qua điều hướng; nút "Đính kèm" gọi `onAttach(paths[])` **một lần** rồi đóng modal.
- Attach **không đọc nội dung**: không gọi read bytes/slice/parser. Việc đọc chỉ xảy ra khi AI gọi tool family (phần 5).

## 4. Progressive read theo Claude Code

**Điểm bị thay trong design cũ:** `sshDocumentParser.ts:53-143` dùng `mammoth.extractRawText` (docx), `ExcelJS.Workbook.xlsx.load` + `eachSheet`/`eachRow` (xlsx), `pdfjs-dist getDocument/getPage/getTextContent` cho **mọi trang** (pdf); rồi `parseSshDocument` gọi `truncateText` với `DEFAULT_MAX_CHARS = 24000` (`:27,:32-38`) cắt từ đầu. `executeSshReadDocument` (`sshFsToolService.ts:312-362`) đọc **toàn bộ bytes** qua `readRemoteFileBytes` rồi parse. Đây là lý do design cũ bị loại.

Thiết kế mới theo Claude Code `Read`: **info trước, read theo vùng**.

1. **Text/code:** `offset`/`limit` 1-based qua `readRemoteFileSlice` (`src/services/sshService.ts:177`), ủy thác `executeSshReadFile` (`sshFsToolService.ts:247-305`), cap 500 dòng. `isLikelyBinaryPath` (`:34`) chặn binary ở đường text.
2. **PDF:** `info` trả `numPages`; `read` nhận `pageStart` + `pageCount`, **tối đa 20 trang/lần**. Nếu >10 trang thì mặc định phân trang và từ chối yêu cầu đọc toàn bộ (`pageCount` thiếu hoặc vượt 20). Vẫn giữ `SCAN_NOTE` (`sshDocumentParser.ts:29`); **không OCR**.
3. **XLSX:** `info` trả sheet names + row count; `read` nhận `sheet` + `rowStart/rowCount` + `colStart/colCount`. Load workbook **một lần**, trích đúng vùng — không join toàn bộ sheet vào text rồi cắt.
4. **DOCX:** dùng `JSZip` (có sẵn: `package.json:50`, đã dùng ở `src/utils/exportFolderZip.ts:1,68`) đọc `word/document.xml`, dựng index block theo thứ tự paragraph/table rồi trả `blockStart/blockCount`. `mammoth.extractRawText` là **fallback** khi không dựng được index. Claude Code không hỗ trợ docx/xlsx bản địa nên phải convert/index bằng script — ghi rõ trong tool description.

**Không thêm thư viện:** `exceljs` (`package.json:48`), `jszip` (`:50`), `mammoth` (`:51`), `pdfjs-dist` (`:54`) đã có. Cap 24k có thể giữ làm giới hạn an toàn cuối cùng, nhưng **không** được thay thế cơ chế phân trang.

## 5. Tool family thống nhất

Thay hợp đồng `ssh_read_attached_file` bằng ba tool:

| Tool | Chức năng |
|---|---|
| `ssh_attached_file_info` | Trả format, size, số dòng/trang/sheet/block + gợi ý range tiếp theo. |
| `ssh_attached_file_search` | `kind: 'name'` (find -iname, shellQuote, callId, `head -n 201`) hoặc `kind: 'content'` (tái dùng `executeSshGrepFiles`, `sshFsToolService.ts:367-451`). |
| `ssh_attached_file_read` | `read` theo extension: text/code `offset/limit`; pdf `pageStart/pageCount <= 20`; xlsx `sheet`+row/col; docx block range. Extension khác/binary ngoài 3 định dạng thì từ chối. |

Vị trí implement khi tách phase riêng: definition trong `src/services/ai/aiTools.ts` cạnh `:2213-2283`, dispatch tại `:2385-2397`, type mới trong `src/types/sshFsTool.ts` cạnh `:32-66`, executor trong `src/services/ai/sshFsToolService.ts`, advertise trong `chatTurnTools.ts:151,170` và usage map `:292-295`, prompt trong `AIChatDrawer.tsx:1704-1729`.

**Hợp đồng chung (bắt buộc):**

- Tham số `path` **bắt buộc**, chỉ là danh tính: AI không sinh host/config selector.
- Validate path thuộc attached set của turn **SAU KHI** `resolveRemoteToolPath(args.path, fsConfig.defaultBasePath, remoteTarget)`. Không khớp → `success:false`; **không fallback** host/path.
- Mọi result giữ dạng `SshFsToolResult` (`src/types/sshFsTool.ts:68-76`) với `success/action/truncated/executionTimeMs`; action enum mở rộng cho family mới.
- Nội dung đi qua `sanitizeBrowserFileText` (`src/services/ai/browserFileReader.ts:14,46`) rồi `wrapField` (`src/services/ai/untrustedData.ts:47,59`) — tài liệu là dữ liệu không tin.
- Không knowledge daemon, không network service khác.

**Điểm loại bỏ so với thiết kế cũ:** không còn hợp đồng `ssh_read_attached_file`; không hứa chọn sheet/trang kiểu cũ; không dùng cắt 24k làm cơ chế chính; không advertise tool cho dock chat.

## 6. Trust boundary

| Boundary | Luồng | Rủi ro | Mitigation |
|---|---|---|---|
| (a) user → browser → attach | `StandaloneSshFileBrowser` → `onAttach(paths[])` → draft → `ChatMessage.attachments` | Chọn path/host sai, path vượt repo, đọc nội dung quá sớm | Chỉ standalone; config từ `activeDb`/`chatWindowDb`; path qua `resolveRemoteToolPath`; attach lưu danh tính, không gọi read bytes/slice/parser |
| (b) AI → tool args | model sinh `path`/range, có thể bị injection từ tài liệu | Đọc ngoài attached set, traversal, host fallback, shell injection, burn CPU | Validate attached set sau chuẩn hoá; `shellQuote` cho `find`/`grep`; `head -n 201` + `callId` cancel; `isLikelyBinaryPath` chặn binary ở đường text; từ chối thay fallback; PDF `<=20` trang, XLSX/DOCX range bounded |
| (c) remote content → prompt | text từ DOCX/XLSX/PDF/`find`/`grep` → tool result → context | Injection qua delimiter/instruction giả trong tài liệu | `sanitizeBrowserFileText` + `wrapField` nonce; không đưa raw bytes/text vào prompt; PDF scan giữ `SCAN_NOTE`, không OCR |
| (d) message → backup | `ChatMessage.attachments` → Export → Import | Mất chip sau restore, hoặc bị chặn bởi forbidden-key gate | Khai báo `attachments: z.array(z.string()).optional()` trong `BackupChatMessageRecordSchema` (`:291`); giữ forbidden-key quét ở tab config (`:198,251`), không áp sang message record; test restore giữ chip |

Threat register kế thừa từ PLAN: `T-R13-01` (path validation), `T-R13-02` (injection), `T-R13-03` (DoS), `T-R13-04` (standalone-only), `T-R13-05` (backup data loss); `T-R13-SC` accept — không cài package mới.

## 7. Wave triển khai (phase riêng, không nằm trong quick task này)

| Wave | Phạm vi |
|---|---|
| **Wave 1** | Type + backup schema: `ChatMessage.attachments`, `SaveMessageInput.attachments`, `BackupChatMessageRecordSchema.attachments`; `ChatTabConfig.attachments` + `isStandaloneChat` prop; browser UI với tree/find/cancel/multi-select |
| **Wave 2** | Persist attachment vào `saveMessage` và render chip trên tin nhắn đã gửi; draft copy sang message lúc gửi; chip cũ chỉ đọc |
| **Wave 3** | Tool family `info/search/read` + executor progressive + dispatcher + usage map + standalone prompt; gỡ `ssh_read_attached_file` |
| **Wave 4** | Test tập trung theo phần 8 |

Phụ thuộc: Wave 2 cần schema Wave 1; Wave 3 cần persisted attachments từ Wave 2 (attached set của turn); Wave 4 cần đủ 3 wave. Mỗi wave commit riêng.

## 8. Chiến lược test tập trung

- `src/services/ai/__tests__/sshFsToolService.test.ts`: path ngoài attached set bị từ chối, shellQuote trong `find`, cap 201, cancel bằng `callId`, ủy thác đúng theo extension, result giữ `truncated`.
- `src/services/ai/__tests__/sshDocumentParser.test.ts`: page range `<=20`, sheet + row/col, DOCX block index qua JSZip, fallback mammoth, **không** dùng `24k-truncate` làm cơ chế chính.
- `tests/phase51/standaloneAttachmentPersistence.test.tsx` (hoặc mở rộng `standaloneAffordances.test.tsx`): gating standalone, chip composer + chip tin nhắn sau reload, backup schema giữ `attachments`.
- E2E: dùng lại `e2e/aiChatStandalone.html`, `e2e/aiChatStandalone.tsx`, `e2e/aiChatSettings.spec.ts` cho luồng config SSH → browse → find → multi-attach → `info/search/read` → dock chat không nút/tool.
- Lệnh mẫu: `npx vitest run <các path cụ thể>`. **KHÔNG chạy full vitest suite** (quy tắc dự án: >1 giờ). Quick task này chỉ kiểm tra tệp/grep, không chạy suite.

## Điểm nối đã xác minh (tóm tắt)

| Khẳng định | File / hàm |
|---|---|
| Standalone truyền flag + DB riêng | `src/views/AIPopoutView.tsx:24,27-28,229-231` |
| Drawer nhận flag, draft references, turnReferences, prompt/gate | `src/components/ai/AIChatDrawer.tsx:246,263,447-456,1426,1565,1673,1704-1729,2321-2369` |
| Draft type + message type | `src/types/models.ts:239-247,291-306` |
| Repo lưu message | `src/db/repositories/chatRepo.ts:23-36,87-131` |
| Backup schema + validator | `src/validation/backupSchemas.ts:198,201-217,251,291`; `src/services/backup/validateBackup.ts:212-223` |
| Chip composer / chip message | `src/components/ai/ChatInputBar.tsx:23-25,783-827,903-912`; `src/components/ai/ChatMessageBubble.tsx:348,377,1181`; `src/components/ai/ChatMessageList.tsx:28-29,420` |
| SSH config / list / exec / cancel | `src/types/sshFsTool.ts:30`; `sshFsToolService.ts:42,47-66,147-169`; `sshService.ts:121,160,177,272-276,295-308` |
| Parser / cap / SCAN_NOTE | `src/services/ai/sshDocumentParser.ts:27,29,32-38,53-143` |
| Sanitize + wrapField | `src/services/ai/browserFileReader.ts:14,46`; `src/services/ai/untrustedData.ts:47,59` |
| Tool definition / dispatch / gate / usage | `src/services/ai/aiTools.ts:2213-2283,2385-2397,5179`; `src/services/ai/chatTurnTools.ts:151,170,292-295` |
| Thư viện có sẵn | `package.json:48,50,51,54`; `src/utils/exportFolderZip.ts:1,68` |
