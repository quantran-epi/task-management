---
phase: 261128-i9x
plan: 01
type: execute
subsystem: ai-chat
tags: [ai-chat, ssh, file-attach, prompt, removal]
requires: []
provides:
  - "Single SSH-remote attach flow across AI chat drawer, standalone chat and team widget"
  - "REFERENCED_FILES_HINT names ssh_attached_file_info/search/read with exact attached path"
  - "Source-level guard test against local attach and standalone-only SSH gating"
affects:
  - "src/components/ai/AiChatWidget.tsx callers (prop compatibility preserved)"
  - "src/services/ai/sshFsToolService.ts (sanitizer exports preserved)"
tech_stack:
  added: []
  patterns: ["SSH remote path only in <referenced_files>", "source-level regression guards"]
key_files:
  created:
    - src/components/ai/__tests__/chatInputBarAttach.test.ts
  modified:
    - src/components/ai/ChatInputBar.tsx
    - src/components/ai/AIChatDrawer.tsx
    - src/services/ai/browserFileReader.ts
    - src/services/ai/__tests__/browserFileReader.test.ts
    - src/components/ai/__tests__/referencedFilesHint.test.ts
    - src/components/ai/__tests__/referencedFilesPrompt.test.ts
decisions:
  - "isStandaloneChat prop retained in ChatInputBarProps for caller compatibility but no longer gated attach; destructured binding removed to satisfy noUnusedLocals"
  - "StandaloneSshFileBrowser renders unconditionally; visibility is controlled by the SSH browse button, which appears when onAttachFile or onAttachFiles is supplied"
  - "sanitizeBrowserFileText and isBrowserTextFileName kept byte-identical; sshFsToolService calls sanitizeBrowserFileText at two sites"
  - "parseFileInputPath kept byte-identical; @file: grounding tests unchanged"
metrics:
  duration: "~30 min"
  completed: "2026-11-28T06:23:30Z"
  tasks: 2
  files: 7
---

# Quick 261128-i9x: Attach file local bỏ, SSH attach cho mọi AI chat — Summary

Bỏ hoàn toàn luồng đính kèm file local (PaperClip / `select_local_file` / FileReader / `window.confirm` / `/file`) khỏi composer AI chat. Nút "Duyệt tệp SSH từ xa" giờ hiển thị trên cả drawer lẫn standalone; path đính kèm đi thẳng vào `tabRuntimes.references` qua `onAttachFiles`, block `<referenced_files>` và SSH attached-file tools dùng chung.

## Commits (branch `pre-v1.6-baseline`, KHÔNG push)

| Task | Hash đầy đủ | Hash ngắn | Message |
|------|-------------|-----------|---------|
| 1 | 8f16826d696e056889e865b4ecebe8175e9cccbb | 8f16826d | `refactor(261128-i9x): remove local file attach from composer` |
| 2 | 426f15c61468cde2ebbcf9ef07699d44528f9b35 | 426f15c6 | `feat(261128-i9x): remove local file attach, enable SSH attach in AI chat drawer` |

Các session khác: Stage đúng 7 file scope ở trên. Không stage/chung commit với tasklist, splash, sketch hay git-link validation.

## Implementation

- `ChatInputBar.tsx`: xoá `handlePickFile`, entry `/file`, nhánh `/file` trong send/fullscreen/Cmd+Enter/mentions, PaperClip, import `isTauriApp`/`readBrowserFileText`/`PaperClipOutlined`. SSH button gate đổi thành `onAttachFile || onAttachFiles`; modal render vô điều kiện. `isStandaloneChat` chỉ còn trong interface (comment cập nhật) để caller không phải đổi.
- `browserFileReader.ts`: chỉ giữ `sanitizeBrowserFileText` + `isBrowserTextFileName` + `TEXT_EXTENSIONS`; xoá `readBrowserFileText`, error class, caps, `ReaderLike`.
- `AIChatDrawer.tsx`: `REFERENCED_FILES_HINT` giờ chỉ nói SSH FS tools với path chính xác; nhãn block đổi thành `Attached Files (SSH remote paths)`; 2 analysis prompt segment bỏ ngôn ngữ browser file input.
- Tests: sanitizer test rút về 2 case; hint test pin 3 tool name + cấm local-browser language; prompt test thêm guard language; guard test mới chặn regress source-level.

## Verification

- `npx vitest run src/services/ai/__tests__/browserFileReader.test.ts src/services/ai/__tests__/sshFsToolService.test.ts src/services/ai/__tests__/fileReference.test.ts --bail=1` — 3 files / 41 tests pass.
- `npx vitest run src/components/ai/__tests__/referencedFilesHint.test.ts src/components/ai/__tests__/referencedFilesPrompt.test.ts src/components/ai/__tests__/chatInputBarAttach.test.ts src/services/ai/__tests__/browserFileReader.test.ts src/services/ai/__tests__/fileReference.test.ts src/services/ai/__tests__/sshFsToolService.test.ts src/services/ai/__tests__/chatTurnTools.test.ts --bail=1` — 7 files / 66 tests pass.
- `npx tsc --noEmit` — exit 0. `npx eslint` trên 7 file scope — exit 0.
- Chrome thật qua Playwright `channel: 'chrome'`, Vite dev `http://127.0.0.1:5173/task-management/`:
  - Drawer (Alt+3), light + dark: PaperClip = 0, nút SSH = 1, click mở modal "Duyệt tệp SSH"; môi trường Chrome này chưa có SSH Host config nên hiện đúng "Chưa cấu hình SSH Host cho trình duyệt tệp." nhưng vẫn mở được modal.
  - Standalone harness `e2e/aiChatStandalone.html`: PaperClip = 0, nút SSH = 1; fixture `/srv/taskmate-fixture` có sẵn. Chọn 2 file (`plan.docx`, `summary.txt`) → "Đính kèm (2)" → cả 2 chip path hiện trong composer, không page error. Light/dark đều render đúng (xem screenshot `/tmp/i9x-drawer-dark.png`, `/tmp/i9x-standalone-attached.png`).
  - Không có UI "Debug AI" để inspect system prompt trực tiếp; nội dung hint được pin bằng unit test `referencedFilesHint.test.ts` + `referencedFilesPrompt.test.ts`.
- Kiểm tra `git diff --cached --name-only` trước mỗi commit: Task 1 đúng 3 file, Task 2 đúng 5 file, không file lạ.
- Không chạy full vitest suite theo quy tắc dự án.

## Deviations from Plan

None — plan executed as written. Minor implementation detail: `isStandaloneChat` destructuring removed (interface kept) because `noUnusedLocals` rejected an unused binding; plan explicitly allowed keeping the prop only.

## Auth gates

None.

## Known Stubs

None.

## Threat Flags

None — local FileReader / `select_local_file` read path removed at source, sanitizer preserved, `<referenced_files>` delimiter and backtick path wrapping unchanged.

## Self-Check: PASSED

8/8 files exist; both commits present as git objects; branch `pre-v1.6-baseline`; SUMMARY.md left untracked per orchestrator instruction (docs commit handled by orchestrator).
