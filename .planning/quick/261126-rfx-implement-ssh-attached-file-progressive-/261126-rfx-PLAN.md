---
phase: quick
plan: 261126-rfx
type: execute
wave: 1
depends_on: []
files_modified:
  - src/types/models.ts
  - src/db/repositories/chatRepo.ts
  - src/db/repositories/teamTranscriptRepo.ts
  - src/validation/backupSchemas.ts
  - src/types/sshFsTool.ts
  - src/services/ai/sshDocumentParser.ts
  - src/services/ai/sshFsToolService.ts
  - src/services/ai/aiTools.ts
  - src/services/ai/chatTurnTools.ts
  - src/services/ai/aiOrchestratorLoop.ts
  - src/services/ai/office/teamRunCoordinator.ts
  - src/components/ai/AIChatDrawer.tsx
  - src/components/ai/ChatInputBar.tsx
  - src/components/ai/AiChatWidget.tsx
  - src/components/ai/ChatMessageBubble.tsx
  - src/components/ai/ChatMessageList.tsx
  - src/components/ai/office/TeamWorkspace.tsx
  - src/components/ai/StandaloneSshFileBrowser.tsx
  - src/services/ai/__tests__/sshFsToolService.test.ts
  - src/services/ai/__tests__/sshDocumentParser.test.ts
  - tests/ai/chatRepo.test.ts
  - tests/backup/backupChatGrounding.test.ts
  - tests/phase51/standaloneAttachmentPersistence.test.tsx
autonomous: true
requirements:
  - ATTACH-PERSIST-IN-MESSAGE
  - DOC-PROGRESSIVE-READ
  - SSH-BROWSER-SEARCH
  - UNIFIED-ATTACH-TOOL-FAMILY
  - SHARED-CORE-ALL-SURFACES
  - TEAM-SCOPE-VALIDATION
user_setup: []
must_haves:
  truths:
    - "Attachment là một phần của tin nhắn: composer thêm/xoá chip trước gửi, tin nhắn đã gửi (standalone, dock, team) vẫn có chip sau reload và sau export/import backup; chip tin nhắn cũ chỉ đọc"
    - "Tool family ssh_attached_file_info/search/read dùng chung cho standalone chat, dock chat và team chat; định nghĩa/dispatch/executor có một bản duy nhất, KHÔNG gate core tool bằng isStandaloneChat"
    - "Mọi tool family validate path thuộc attached set SAU resolveRemoteToolPath; không khớp thì success:false, không fallback host/path; team chat additionally validate attachment thuộc team/task scope"
    - "Đọc tài liệu progressive: text/code offset/limit; PDF pageStart/pageCount <=20; XLSX sheet+rowStart/rowCount+colStart/colCount; DOCX block index qua JSZip word/document.xml với mammoth fallback; không dùng cắt 24k làm cơ chế chính"
    - "Browser SSH searchable chỉ ở standalone: tree listRemoteDir + find -iname shellQuote | head -n 201 với callId cancel; multi-select full normalized path; attach KHÔNG đọc nội dung; dock/team không có nút browser"
    - "Nội dung tool đi qua sanitizeBrowserFileText + wrapField; không knowledge daemon, không thêm npm dependency"
  artifacts:
    - path: src/types/models.ts
      provides: "ChatMessage.attachments"
      contains: "attachments?: string[]"
    - path: src/db/repositories/chatRepo.ts
      provides: "SaveMessageInput.attachments + bản ghi message"
      contains: "input.attachments"
    - path: src/validation/backupSchemas.ts
      provides: "BackupChatMessageRecordSchema.attachments"
      contains: "z.array(z.string()).optional()"
    - path: src/services/ai/sshFsToolService.ts
      provides: "Executor tool family + attached-set validation + progressive document read"
      contains: "ssh_attached_file"
    - path: src/services/ai/aiTools.ts
      provides: "Định nghĩa 3 tool + dispatch chung"
      contains: "ssh_attached_file_read"
    - path: src/services/ai/sshDocumentParser.ts
      provides: "Info/range API cho PDF/XLSX/DOCX"
      contains: "word/document.xml"
    - path: src/components/ai/StandaloneSshFileBrowser.tsx
      provides: "Browser tree + find + multi-select"
      contains: "listRemoteDir"
    - path: src/components/ai/AIChatDrawer.tsx
      provides: "Copy draft attachments vào saveMessage + turn attached set; browser chỉ standalone"
      contains: "attachments: turnAttachments"
  key_links:
    - from: src/components/ai/AIChatDrawer.tsx
      to: src/db/repositories/chatRepo.ts
      via: "saveMessage nhận attachments từ draft lúc gửi"
      pattern: "attachments.*turnAttachments"
    - from: src/services/ai/aiTools.ts
      to: src/services/ai/sshFsToolService.ts
      via: "dispatch 3 tool family tới executor dùng chung"
      pattern: "ssh_attached_file_(info|search|read)"
    - from: src/services/ai/aiOrchestratorLoop.ts
      to: src/services/ai/aiTools.ts
      via: "attachedPaths + attachmentScope truyền qua DispatchAiToolCallOptions"
      pattern: "attachedPaths"
    - from: src/services/ai/office/teamRunCoordinator.ts
      to: src/services/ai/aiOrchestratorLoop.ts
      via: "team/task scope validation trước khi truyền attachedPaths"
      pattern: "attachmentScope"
    - from: src/components/ai/StandaloneSshFileBrowser.tsx
      to: src/components/ai/AIChatDrawer.tsx
      via: "onAttach(paths[]) cập nhật draft references"
      pattern: "onAttach"
---

<objective>
Implement đính kèm file SSH theo thiết kế `CLAUDE-STYLE-ATTACH-DESIGN.md` (261126-r13), với hiệu chỉnh mới nhất của sếp: core reader (parser + tools `ssh_attached_file_info/search/read` + trust boundary) là năng lực dùng chung cho standalone chat, dock chat và team chat; riêng UI browser/searchable file picker và chip composer khởi động standalone-first. Team chat phải validate attachment theo team/task scope bên cạnh attached set.

Purpose: thiết kế cũ lỗi ở 3 điểm — attach chỉ là transient `references`, document đọc toàn file rồi cắt 24k, tool đơn `ssh_read_attached_file` delegate text/code cho docs. Lần implement này phải giao được chip bền, đọc progressive, tool family có ranh giới tin cậy, và không tách core tool theo `isStandaloneChat`.

Output: production edits trên `src/`, kèm test tập trung. Không thêm npm dependency, không knowledge daemon, không chạy full vitest suite. Mỗi task là một commit riêng theo thứ tự phụ thuộc bên dưới.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/quick/261126-r13-sua-thiet-ke-261126-qag-claude-code-styl/CLAUDE-STYLE-ATTACH-DESIGN.md
@src/types/models.ts
@src/types/sshFsTool.ts
@src/db/repositories/chatRepo.ts
@src/db/repositories/teamTranscriptRepo.ts
@src/validation/backupSchemas.ts
@src/services/ai/sshDocumentParser.ts
@src/services/ai/sshFsToolService.ts
@src/services/ai/aiTools.ts
@src/services/ai/chatTurnTools.ts
@src/services/ai/aiOrchestratorLoop.ts
@src/services/ai/office/teamRunCoordinator.ts
@src/components/ai/AIChatDrawer.tsx
@src/components/ai/ChatInputBar.tsx
@src/components/ai/AiChatWidget.tsx
@src/components/ai/ChatMessageBubble.tsx
@src/components/ai/ChatMessageList.tsx
@src/components/ai/office/TeamWorkspace.tsx
@src/views/AIPopoutView.tsx
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Attachment bền vững trong message model, repo và backup schema</name>
  <files>src/types/models.ts, src/db/repositories/chatRepo.ts, src/db/repositories/teamTranscriptRepo.ts, src/validation/backupSchemas.ts, tests/ai/chatRepo.test.ts, tests/backup/backupChatGrounding.test.ts</files>
  <behavior>
    - Test 1: saveMessage với attachments(['/repo/a.pdf']) lưu đúng mảng vào ChatMessage; không truyền thì không có field
    - Test 2: saveTeamMessage với attachments lưu đúng mảng vào ChatMessage của team thread
    - Test 3: BackupChatMessageRecordSchema.safeParse giữ attachments; export→import restore giữ chip; tab config vẫn bị forbidden 'attachments' chặn
  </behavior>
  <action>Thêm `attachments?: string[] | undefined` vào `ChatMessage` (src/types/models.ts:291) và `SaveMessageInput` (src/db/repositories/chatRepo.ts:23). Trong saveMessage (`:101-119`) copy `input.attachments` theo conditional spread như generatedFiles: `...(input.attachments && input.attachments.length > 0 ? { attachments: [...input.attachments] } : {})`. Làm tương tự cho SaveTeamMessageInput + message trong src/db/repositories/teamTranscriptRepo.ts:106 (`SaveTeamMessageInput` hiện ở đầu file — đọc rồi sửa đúng interface). Trong src/validation/backupSchemas.ts thêm `attachments: z.array(z.string()).optional()` vào `BackupChatMessageRecordSchema` (`:291`), ngay cạnh `generatedFiles`. GIỮ NGUYÊN `attachments` trong `FORBIDDEN_BACKUP_KEYS` (`:198`) và giữ `findForbiddenBackupKey` chỉ dùng ở `BackupChatTabRecordSchema.superRefine` (`:251`) — KHÔNG áp sang message record, nếu không chip bị từ chối lúc restore. src/services/backup/validateBackup.ts:212-223 không đổi. Test: mở rộng tests/ai/chatRepo.test.ts (saveMessage giữ attachments) và tests/backup/backupChatGrounding.test.ts (round-trip schema giữ attachments, tab record vẫn reject). Đây là nền tảng: task sau copy draft vào đây.</action>
  <verify>
    <automated>cd /Users/tranducquan/Working/Personal/task-management/.claude/worktrees/ssh-remote-file-attach && npx vitest run tests/ai/chatRepo.test.ts tests/backup/backupChatGrounding.test.ts && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E 'chatRepo|teamTranscriptRepo|models|backupSchemas' || true</automated>
  </verify>
  <done>ChatMessage/SaveMessageInput/saveTeamMessage có attachments; backup.message record giữ attachments qua restore; tab config vẫn chặn forbidden key; test scoped pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Parser progressive và executor tool family dùng chung</name>
  <files>src/types/sshFsTool.ts, src/services/ai/sshDocumentParser.ts, src/services/ai/sshFsToolService.ts, src/services/ai/__tests__/sshFsToolService.test.ts, src/services/ai/__tests__/sshDocumentParser.test.ts</files>
  <behavior>
    - Test 1: info trả format/size/count + gợi ý range; read text offset/limit; path ngoài attached set bị reject sau resolveRemoteToolPath, không fallback host
    - Test 2: PDF pageCount>20 bị từ chối; pageStart/pageCount đúng trả đúng trang; XLSX sheet + row/col đúng vùng; DOCX block index từ word/document.xml, mammoth fallback khi index lỗi
    - Test 3: find name dùng shellQuote + head -n 201 + callId cancel; result text đi qua sanitize + wrapField; truncated được giữ
  </behavior>
  <action>Trong src/types/sshFsTool.ts thêm type args mới cạnh :32-66: `SshAttachedFileInfoArgs { path }`, `SshAttachedFileSearchArgs { path; kind: 'name'|'content'; query?; pattern?; limit? }`, `SshAttachedFileReadArgs { path; offset?; limit?; pageStart?; pageCount?; sheet?; rowStart?; rowCount?; colStart?; colCount?; blockStart?; blockCount? }`. Mở rộng `SshFsToolResult.action` (`:70`) với `'attached_file_info' | 'attached_file_search' | 'attached_file_read'`. Thêm interface `AttachmentScope` trong cùng file: `{ attachedPaths: string[]; teamId?: string; taskIds?: string[] }` — dùng để validate ở executor, KHÔNG phải flag standalone. Trong src/services/ai/sshDocumentParser.ts giữ nguyên truncateText làm safety cap cuối, nhưng THÊM API progressive dùng thư viện có sẵn: `getSshDocumentInfo(buffer, filename)` (docx/xlsx/pdf → format, size, pageCount/sheetCount+rowCount/blockCount + next-range hint); `readSshDocumentRegion(buffer, filename, range)` — pdf `pageStart/pageCount`, reject pageCount>20, vẫn gắn SCAN_NOTE (`:29`) khi page không có text, KHÔNG OCR; xlsx load workbook 1 lần, `sheet` + rowStart/rowCount + colStart/colCount, KHÔNG join toàn sheet rồi cắt; docx dùng JSZip (`jszip` đã có trong package.json) đọc `word/document.xml`, dựng block index theo paragraph/table (KHÔNG dùng mammoth cho đường chính), `mammoth.extractRawText` chỉ là fallback khi dựng index hỏng; text/code đi qua `readRemoteFileSlice` có sẵn, không qua parser. Trong src/services/ai/sshFsToolService.ts thêm 3 executor `executeSshAttachedFileInfo/Search/Read`: nhận `scope: AttachmentScope` (sau db, remoteTarget), require path, resolve bằng `resolveRemoteToolPath(args.path, fsConfig.defaultBasePath, remoteTarget)` rồi so sánh với normalized `scope.attachedPaths` (dùng lại normalizePosixPath logic hoặc so sánh string đã chuẩn hoá); không khớp → `success:false`, không fallback host/path. `kind:'name'` dùng `execRemoteCommand(sshConfig, \`find ${quotedBase} -type f -iname ${shellQuote(query)} | head -n 201\`, undefined, callId)`, shellQuote từ `:42`, trả lỗi rõ ràng nếu exitStatus bất thường thay vì mảng rỗng; `kind:'content'` ủy thác `executeSshGrepFiles`. Mọi nội dung đi qua `sanitizeBrowserFileText` + `wrapField` như `:345-348`; giữ `truncated`/`executionTimeMs`. KHÔNG xoá `executeSshReadDocument` cũ trong task này nếu dispatcher còn dùng — task 3 sẽ thay. Test: mở rộng src/services/ai/__tests__/sshFsToolService.test.ts và sshDocumentParser.test.ts theo behavior trên; mock sshService như file hiện có. Không cài package mới.</action>
  <verify>
    <automated>cd /Users/tranducquan/Working/Personal/task-management/.claude/worktrees/ssh-remote-file-attach && npx vitest run src/services/ai/__tests__/sshFsToolService.test.ts src/services/ai/__tests__/sshDocumentParser.test.ts</automated>
  </verify>
  <done>Core tool family có executor dùng chung, path validation sau resolve, progressive readers đúng range; test scoped pass; không dependency mới.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Định nghĩa/dispatch tool family dùng chung cho cả ba surface + scope team/task</name>
  <files>src/services/ai/aiTools.ts, src/services/ai/chatTurnTools.ts, src/services/ai/aiOrchestratorLoop.ts, src/services/ai/office/teamRunCoordinator.ts, src/components/ai/AIChatDrawer.tsx</files>
  <behavior>
    - Test 1: toolsForTurn có 3 tool family trên cả standalone, dock và team khi có config SSH + có attachment; KHÔNG bị chặn bởi isStandaloneChat
    - Test 2: team chat gửi attachment ngoài team/task scope → tool result success:false 'ATTACHMENT_OUT_OF_SCOPE'
    - Test 3: dispatch 3 tool qua executeAiTool tới executor đúng; gỡ hoàn toàn hợp đồng ssh_read_attached_file (nếu tồn tại) và không advertise ssh_read_document cũ thay family mới
  </behavior>
  <action>Trong src/services/ai/aiTools.ts thêm 3 definition cạnh :2213-2283 (mô tả rõ path là định danh, range theo extension; PDF <=20 trang, XLSX/DOCX range), dispatch tại :2385-2397 tới 3 executor task 2. `ExecuteAiToolOptions` (`:2316`) thêm `attachedPaths?: string[]`, `attachmentScope?: AttachmentScope`. Truyền options này xuống executor; executeAiTool trả JSON success:false nếu `attachedPaths` thiếu/rỗng. Trong chatTurnTools.ts: export `SSH_ATTACHED_TOOL_NAMES`, đưa vào `SSH_READ_TOOLS`/`getGatedAddenda` (`:86-94`) để mọi surface (standalone/dock/team/Telegram nếu dùng addenda) nhận cùng tool family; usage map `:271-295` thêm 3 tên với `SSH_ORACLE_USAGE`. KHÔNG gate bằng `standaloneCapability`. Trong src/services/ai/aiOrchestratorLoop.ts mở rộng `DispatchAiToolCallOptions` (`:17`) với `attachedPaths`/`attachmentScope`, forward vào executeAiTool (`:81-91`) và vào options của loop (`:137`, `:540`). Trong src/components/ai/AIChatDrawer.tsx: máy chủ turn đã có `turnReferences` (`:1565`) và `allFiles` (`:1566`); truyền `attachedPaths: allFiles` + `attachmentScope: { attachedPaths: allFiles }` vào runtime executeToolFn/loop options tương ứng. Trong teamRunCoordinator.ts: ở `makeExecuteToolFn` (`:1614-1655`), lấy attachedPaths từ attachment của tin nhắn user/current turn (sẽ có ở task 4), validate từng path: với path repo phải nằm trong repo của team (listTeamLinks `itemType:'system'` / remoteTarget.repoPath) và nếu scope task thì path phải thuộc task được link (`aiTeamLinks` itemType 'task') — thiếu scope thì trả `success:false` code `ATTACHMENT_OUT_OF_SCOPE` thay vì cho tool đọc. Giữ nguyên role gating (team.sshFsToolsEnabled + lead/employee allowlist). CẨN THẬN: `dispatchAiToolCall` chỉ route local DB tools (`isLocalDbTool`); ensure 3 tool family nằm trong AI_DATABASE_TOOLS để không rơi vào dynamic-MCP branch. Không thêm knowledge daemon.</action>
  <verify>
    <automated>cd /Users/tranducquan/Working/Personal/task-management/.claude/worktrees/ssh-remote-file-attach && npx vitest run src/services/ai/__tests__/sshFsToolService.test.ts tests/phase51/standaloneAffordances.test.tsx && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E 'aiTools|chatTurnTools|aiOrchestratorLoop|teamRunCoordinator|AIChatDrawer' || true</automated>
  </verify>
  <done>Core family advertise/dispatch dùng chung cả 3 surface; scope team/task chặn attachment lạ; không còn hợp đồng tool cũ; test scoped pass.</done>
</task>

<task type="auto">
  <name>Task 4: UI browser standalone-first, chip composer và chip message persistent</name>
  <files>src/components/ai/StandaloneSshFileBrowser.tsx, src/components/ai/ChatInputBar.tsx, src/components/ai/AiChatWidget.tsx, src/components/ai/AIChatDrawer.tsx, src/components/ai/ChatMessageBubble.tsx, src/components/ai/ChatMessageList.tsx, src/components/ai/office/TeamWorkspace.tsx, tests/phase51/standaloneAttachmentPersistence.test.tsx</files>
  <behavior>
    - Test 1: standalone có nút browser; dock và team KHÔNG có nút browser
    - Test 2: thêm/xoá chip composer cập nhật draft; gửi xong chip hiện trên message, reload vẫn còn; chip message không có nút xoá
    - Test 3: browser multi-select full normalized path, gọi onAttach(paths[]) một lần; attach KHÔNG gọi readRemoteFileBytes/readRemoteFileSlice
  </behavior>
  <action>Tạo src/components/ai/StandaloneSshFileBrowser.tsx: config `getSshFsToolConfig(activeDb)` (chatWindowDb khi standalone, KHÔNG fallback defaultDb); tree `listRemoteDir(sshConfig, path)` qua `resolveRemoteToolPath` với base `defaultBasePath` đã resolve, KHÔNG quét '~/' khi chưa rõ base; tìm tên file bằng execRemoteCommand(sshConfig, \`find ${shellQuote(base)} -type f -iname ${shellQuote(query)} | head -n 201\`, undefined, callId), callId do UI sinh, cancel qua cancelRemoteCall/cancelToolCall; multi-select key là full normalized path, giữ selection qua điều hướng, nút Đính kèm gọi onAttach(paths[]) một lần rồi đóng. KHÔNG gọi read bytes/slice/parser lúc attach. Trong ChatInputBar.tsx thêm prop `isStandaloneChat?: boolean` (default false): chỉ khi true mới render nút mở browser và wire modal StandaloneSshFileBrowser; chip composer giữ nguyên cơ chế attachedFiles/onAttachFile/onRemoveFile (:783-827). AiChatWidget.tsx forward prop `isStandaloneChat` xuống ChatInputBar (:530-543) và xuống ChatMessageList. AIChatDrawer.tsx: chỉ truyền `isStandaloneChat` khi flag true (:2353); lúc gửi copy `turnAttachments = allFiles` vào `saveMessage({..., attachments: turnAttachments})` tại :1426 — LƯU Ý allFiles được tính ở :1565 SAU saveMessage, nên dời phép tính attached set lên TRƯỚC lời gọi saveMessage (:1417) và dùng lại ở :1565 (không tính lại, không patch runtime sau khi đã lưu). TeamWorkspace.tsx: coordinator.send(text) (TeamRunCoordinator interface :290) mở rộng nhận attachments?, TeamWorkspace truyền draft attachments; teamEventLog `saveTeamMessage`/`appendForExistingMessage` nhận attachments và ghi vào ChatMessage (task 1); team UI KHÔNG có nút browser nhưng chip trên message vẫn render. ChatMessageBubble.tsx + ChatMessageList.tsx: render chip cho `message.attachments` dạng read-only (tooltip full path, KHÔNG nút xoá), dùng lại style chip của composer. Test tests/phase51/standaloneAttachmentPersistence.test.tsx: gating standalone vs dock vs team, chip composer + chip message sau reload, browser gọi onAttach đúng path không gọi read.</action>
  <verify>
    <automated>cd /Users/tranducquan/Working/Personal/task-management/.claude/worktrees/ssh-remote-file-attach && npx vitest run tests/phase51/standaloneAttachmentPersistence.test.tsx tests/phase51/standaloneAffordances.test.tsx && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E 'StandaloneSshFileBrowser|ChatInputBar|AiChatWidget|AIChatDrawer|ChatMessageBubble|TeamWorkspace' || true</automated>
  </verify>
  <done>Standalone có browser/search/multi-select; dock/team không nút; chip composer và chip message bền sau reload; team attachments vào message + scope; test scoped pass.</done>
</task>

<task type="auto">
  <name>Task 5: E2E fixture, rà soát trust boundary và commit cuối</name>
  <files>e2e/aiChatStandalone.tsx, e2e/aiChatSettings.spec.ts, .planning/quick/261126-rfx-implement-ssh-attached-file-progressive-/261126-rfx-SUMMARY.md</files>
  <behavior>
    - Test 1: e2e config SSH → browse → find → multi-attach → info/search/read → reload chip còn
    - Test 2: dock chat không có nút browser và tool family vẫn có khi có attachment + config
    - Test 3: team chat có tool family nhưng attachment ngoài scope bị từ chối
  </behavior>
  <action>Cập nhật fixture e2e/aiChatStandalone.tsx và spec e2e/aiChatSettings.spec.ts cho luồng config SSH → browse → find → multi-attach → info/search/read → reload chip còn; thêm assert dock chat không có nút browser NHƯNG tool family vẫn xuất hiện khi có attachment + config (đây là điểm sếp sửa so với GATING-STANDALONE-ONLY cũ); assert team chat có tool family và attachment ngoài scope bị từ chối. Chạy `npx playwright test e2e/aiChatSettings.spec.ts` nếu môi trường có browser; nếu không, ghi rõ trong SUMMARY là e2e chưa chạy và để lại fixture. Rà soát cuối: grep đảm bảo không có `ssh_read_attached_file`, không có handling 24k-truncate làm cơ chế chính trong read path, mọi path validate sau resolveRemoteToolPath, mọi nội dung tool qua sanitize+wrapField, không npm install, không knowledge daemon. Tạo 261126-rfx-SUMMARY.md tiếng Việt tóm tắt 5 task, file đã sửa, lệnh test đã chạy, và nêu rõ hiệu chỉnh "core reader shared across standalone/dock/team; UI browser standalone-first". Commit từng task theo thứ tự 1→5 (`feat(261126-rfx): ...`). KHÔNG chạy full vitest suite.</action>
  <verify>
    <automated>cd /Users/tranducquan/Working/Personal/task-management/.claude/worktrees/ssh-remote-file-attach && grep -rn --include='*.ts' --include='*.tsx' 'ssh_read_attached_file' src e2e tests || true; grep -rn --include='*.ts' --include='*.tsx' 'ssh_attached_file' src | wc -l; git status --short</automated>
  </verify>
  <done>E2E fixture phản ánh gating mới; rà soát trust boundary sạch; SUMMARY tồn tại; mỗi task có commit riêng; không full suite.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| user → browser → attach | Chỉ standalone có browser; config từ chatWindowDb; path chuẩn hoá; attach lưu danh tính, không đọc nội dung |
| AI → tool args | Model sinh path/range trên CẢ 3 surface; injection từ tài liệu có thể chỉ huy đọc ngoài attached set |
| remote content → prompt | Text từ DOCX/XLSX/PDF/find/grep là dữ liệu không tin |
| team scope → attached set | Team/agent chỉ được đọc attachment thuộc team/task scope của mình |
| message → backup | Attachments đi vào ChatMessage và phải sống qua export/import, không bị forbidden-key gate chặn |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-RFX-01 | Tampering / Information disclosure | `ssh_attached_file_*` path args | mitigate | Validate path thuộc attached set SAU resolveRemoteToolPath; không fallback host/path; shellQuote mọi giá trị trong find/grep |
| T-RFX-02 | Injection | parsed document / find / grep output | mitigate | sanitizeBrowserFileText + wrapField nonce; không đưa raw text/bytes vào prompt |
| T-RFX-03 | Denial of service | find -iname, PDF/XLSX/DOCX range | mitigate | head -n 201 + callId cancel; PDF <=20 trang/lần; XLSX/DOCX range bounded; text cap 500 dòng |
| T-RFX-04 | Information disclosure / privilege escalation | team chat tool family | mitigate | Team/task scope validation theo aiTeamLinks + remoteTarget.repoPath; trả ATTACHMENT_OUT_OF_SCOPE; giữ flag sshFsToolsEnabled |
| T-RFX-05 | Data loss | backup restore | mitigate | attachments optional trong BackupChatMessageRecordSchema; forbidden-key check giữ ở tab record; test round-trip |
| T-RFX-SC | Tampering | dependency install | accept | Không cài package mới — dùng exceljs/jszip/mammoth/pdfjs-dist có sẵn |

**Rủi ro migration/permission cần flag khi implement:** (1) dời attached-set computation lên trước `saveMessage` trong AIChatDrawer — làm sai thứ tự sẽ lưu message thiếu chip; (2) mở rộng forbidden-key check sang message record sẽ làm mất chip sau restore; (3) team scope validation dựa trên `aiTeamLinks` — nếu team chưa link task/system thì mọi attachment bị từ chối; phải hiện lỗi rõ ràng, không fallback.
</threat_model>

<verification>
- Chạy từng lệnh `<automated>` trong task; KHÔNG chạy `npx vitest run` không đối số.
- `npx tsc --noEmit -p tsconfig.json` sạch cho các file đã sửa.
- Grep: `ssh_attached_file_info/search/read` có mặt ở định nghĩa, dispatch và executor; `ssh_read_attached_file` không còn; `isStandaloneChat` chỉ gate browser UI, không gate core tool.
- Backup round-trip giữ `message.attachments`; tab config vẫn reject field attachments.
- E2E fixture phản ánh dock/team có tool family, chỉ standalone có nút browser.
</verification>

<success_criteria>
Sếp có implement hoàn chỉnh: chip đính kèm bền trong tin nhắn (standalone/dock/team) qua reload và backup; tool family `ssh_attached_file_info/search/read` dùng chung cả 3 surface với path validation sau resolveRemoteToolPath; team chat chặn attachment ngoài team/task scope; đọc tài liệu progressive không cắt 24k làm cơ chế chính; browser searchable chỉ standalone; không dependency mới, không knowledge daemon. Mỗi task commit riêng, test scoped pass.
</success_criteria>

<output>
Tạo `.planning/quick/261126-rfx-implement-ssh-attached-file-progressive-/261126-rfx-SUMMARY.md` sau khi xong. Không tạo file báo cáo khác.
</output>
