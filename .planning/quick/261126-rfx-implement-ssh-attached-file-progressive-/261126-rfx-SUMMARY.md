---
phase: quick
plan: 261126-rfx
subsystem: ai-chat-ssh-attachments
tags: [ssh, attachments, tool-family, progressive-read, e2e]
requires: []
provides:
  - "Bền vững attachments trong ChatMessage + backup round-trip"
  - "Tool family ssh_attached_file_info/search/read dùng chung standalone/dock/team"
  - "Browser SSH searchable chỉ standalone; tool core không bị isStandaloneChat gate"
affects:
  - "src/components/ai/AIChatDrawer.tsx"
  - "src/components/ai/AiChatWidget.tsx"
  - "e2e/aiChatSettings.spec.ts"
tech_stack:
  added: []
  patterns:
    - "Attachment identity validated sau resolveRemoteToolPath; không fallback host/path"
    - "sanitizeBrowserFileText + wrapField cho mọi nội dung tool"
    - "PDF <=20 trang/lần, XLSX sheet+range, DOCX block index qua JSZip word/document.xml"
key_files:
  created:
    - "e2e/aiChatStandalone.tsx (mở rộng thành harness SSH fixture có IPC shim)"
  modified:
    - "src/types/models.ts"
    - "src/db/repositories/chatRepo.ts"
    - "src/db/repositories/teamTranscriptRepo.ts"
    - "src/validation/backupSchemas.ts"
    - "src/types/sshFsTool.ts"
    - "src/services/ai/sshDocumentParser.ts"
    - "src/services/ai/sshFsToolService.ts"
    - "src/services/ai/aiTools.ts"
    - "src/services/ai/chatTurnTools.ts"
    - "src/services/ai/aiOrchestratorLoop.ts"
    - "src/services/ai/office/teamRunCoordinator.ts"
    - "src/components/ai/AIChatDrawer.tsx"
    - "src/components/ai/AiChatWidget.tsx"
    - "src/components/ai/ChatInputBar.tsx"
    - "src/components/ai/AiChatWidget.tsx"
    - "src/components/ai/ChatMessageBubble.tsx"
    - "src/components/ai/ChatMessageList.tsx"
    - "src/components/ai/office/TeamWorkspace.tsx"
    - "src/components/ai/StandaloneSshFileBrowser.tsx"
    - "e2e/aiChatSettings.spec.ts"
    - "e2e/aiChatStandalone.tsx"
decisions:
  - "Core reader/tool family là năng lực dùng chung cho cả standalone, dock và team; isStandaloneChat chỉ gate UI browser."
  - "Team chat validate attachment theo team/task scope trước dispatch, trả ATTACHMENT_OUT_OF_SCOPE thay vì fallback."
  - "Truncate 24k chỉ là safety cap cuối, không phải cơ chế đọc chính."
metrics:
  duration: "phiên execute này: Task 5 ~35 phút (cả plan: nhiều phiên)"
  completed: "2026-11-26"
---

# Phase Quick Plan 261126-rfx: SSH attached-file progressive Summary

Attachment là một phần của tin nhắn, tool family `ssh_attached_file_info/search/read` đọc progressive và dùng chung cho standalone/dock/team; browser/searchable picker chỉ có ở standalone.

## 5 tasks đã thực hiện

1. **Attachment bền trong message model, repo, backup** (`f4066cea`): `ChatMessage.attachments`, `saveMessage`/`saveTeamMessage`, `BackupChatMessageRecordSchema.attachments`; forbidden-key check vẫn chỉ chặn tab config. Test: `tests/ai/chatRepo.test.ts`, `tests/backup/backupChatGrounding.test.ts`.
2. **Parser progressive + executor tool family** (`e1e5d182` test RED, `de2f68c3` GREEN): info/range cho PDF/XLSX/DOCX; path validate sau `resolveRemoteToolPath`; find `head -n 201` + `callId`; nội dung qua `sanitizeBrowserFileText` + `wrapField`. Test: `sshFsToolService.test.ts`, `sshDocumentParser.test.ts`.
3. **Định nghĩa/dispatch dùng chung + scope team** (`d750fa57`): 3 tool trong `AI_DATABASE_TOOLS`/`SSH_READ_TOOLS`, dispatch tới executor chung; `attachedPaths`/`attachmentScope` đi qua orchestrator; team chặn path ngoài repo/task bằng `ATTACHMENT_OUT_OF_SCOPE`. Không còn hợp đồng `ssh_read_attached_file`.
4. **UI browser standalone-first + chip persistent** (`060bf272`): browser tree/find/multi-select; dock/team không nút browser; chip composer remove được, chip message chỉ đọc và sống qua reload.
5. **E2E fixture + rà soát trust boundary + summary** (commit cuối): harness `e2e/aiChatStandalone.tsx` có Tauri IPC shim cho SSH/AI/MCP; spec phủ config → browse → find → multi-attach → info/search/read → reload chip; dock có tool family nhưng không nút browser; team có tool family và từ chối attachment ngoài scope.

## E2E đã chạy

- Lệnh: `npx playwright test e2e/aiChatSettings.spec.ts` (chạy từ worktree, binary/root dependencies dùng lại từ repo chính, Vite dev server khởi động riêng).
- Kết quả: **6/6 passed** (49.9s), gồm 3 test mới `RFX standalone`, `RFX dock chat`, `RFX team tool family`.
- Typecheck: `npx tsc --noEmit -p tsconfig.json` — không có lỗi cho `e2e/aiChatStandalone.tsx`, `e2e/aiChatSettings.spec.ts`, `AIChatDrawer.tsx`, `AiChatWidget.tsx`.
- Không chạy full vitest suite theo yêu cầu.

## Rà soát trust boundary

- `ssh_read_attached_file`: chỉ còn 1 lần trong assertion tiêu cực tại `src/services/ai/__tests__/sshFsToolService.test.ts:480`; không còn định nghĩa/dispatch/executor.
- `ssh_attached_file`: 23 lần xuất hiện trên `src/` — có mặt ở definition, dispatch, executor và usage map.
- Path validation: mọi executor attached-family gọi `resolveRemoteToolPath` rồi `resolveAttachedPath` so sánh normalized attached set (`sshFsToolService.ts:479-491`, dùng ở 522/548/627); không fallback host/path.
- Nội dung tool: `wrapAttachedContent` = `wrapField(label, sanitizeBrowserFileText(text))` dùng cho search name/content và read (`sshFsToolService.ts:508,577,608,676`).
- Truncate 24k: `DEFAULT_MAX_CHARS` trong `sshDocumentParser.ts` chỉ cap cuối sau khi đã đọc range progressive (PDF page, XLSX row/col, DOCX block); không phải cơ chế đọc chính.
- Knowledge daemon: không có tham chiếu trong tool path, parser, browser hay fixture e2e.
- Tool family shared: `isStandaloneChat` chỉ xuất hiện trong comment tại `aiTools.ts:5265` và gate UI browser; không gate definition/dispatch/team addenda.
- Không cài npm dependency mới; `jszip`, `mammoth`, `exceljs`, `pdfjs-dist` đã có sẵn.

## Known baseline issue

- PDFjs worker asset (`pdfjs-dist/build/pdf.worker.min.mjs?url`) trả 403 trong Vite dev server chạy từ worktree symlink; `watchErrors` trong spec đã whitelist exact noise `Failed to load resource ... 403 (Forbidden)` để không che lỗi UI mới. Không sửa trong plan này vì là baseline môi trường, không thuộc trust boundary của attached-file reader.
- MCP fixture trả response hợp lệ để tránh noise `graphiti-banking` discovery; đây là synthetic IPC, không bật knowledge daemon.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Standalone SSH browser đọc config từ `defaultDb` thay vì `chatWindowDb`**
- **Found during:** Task 5, e2e `RFX standalone` báo `Chưa cấu hình SSH Host cho trình duyệt tệp` dù config đã lưu trong chat DB.
- **Issue:** `AIChatDrawer` truyền `isStandaloneChat` xuống `AiChatWidget`, nhưng không truyền `db`; `ChatInputBar` vì vậy fallback `defaultDb` cho `StandaloneSshFileBrowser`.
- **Fix:** thêm prop `db?: TaskPlannerDatabase` ở `AiChatWidget`, forward xuống `ChatInputBar`, và truyền `db={db}` từ `AIChatDrawer`. Cùng commit Task 5; document ở đây.
- **Files modified:** `src/components/ai/AiChatWidget.tsx`, `src/components/ai/AIChatDrawer.tsx`.
- **Commit:** commit cuối Task 5.

**2. [Rule 3 - Blocking] Fixture e2e phải mô phỏng Tauri IPC cho AI/MCP**
- **Found during:** Task 5, các test RFX không gọi được provider vì `isTauriApp()` true → nineRouterClient dùng `ai_proxy_request`, MCP dùng `graphiti_mcp_request`.
- **Fix:** `e2e/aiChatStandalone.tsx` implement 2 command trong shim: `ai_proxy_request` fetch thật để `page.route` chặn, `graphiti_mcp_request` trả initialize/tools-list hợp lệ. Chỉ trong harness, không đổi production.
- **Files modified:** `e2e/aiChatStandalone.tsx`.
- **Commit:** commit cuối Task 5.

## Commits

- `f4066cea` — Task 1
- `e1e5d182` — Task 2 RED
- `de2f68c3` — Task 2 GREEN
- `d750fa57` — Task 3
- `060bf272` — Task 4
- Task 5 — e2e fixture/spec + summary + Rule 1/Rule 3 fixes (commit cuối)
