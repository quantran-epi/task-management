---
phase: quick
plan: 261126-qag
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/quick/261126-qag-them-ssh-remote-file-browser-va-multi-se/261126-qag-SUMMARY.md
  - .planning/quick/261126-qag-them-ssh-remote-file-browser-va-multi-se/SSH-FILE-ATTACH-DESIGN.md
autonomous: true
requirements:
  - DOC-READ-INVESTIGATION
  - SSH-BROWSE-STANDALONE-ONLY
  - SSH-MULTI-FILE-ATTACH
  - AI-READ-ATTACHED-FILES
  - DESIGN-NO-PRODUCTION-CODE
user_setup: []
must_haves:
  truths:
    - "SUMMARY có mục phát hiện riêng, nêu rõ DOCX/XLSX/PDF hiện đọc TOÀN BỘ file rồi cắt 24k ký tự; chỉ file text/code có phân trang do AI chọn offset/limit"
    - "Thiết kế browser SSH + chọn nhiều file chỉ áp dụng cho cửa sổ chat standalone; chat dock trong workbench giữ nguyên"
    - "Thiết kế attach chỉ lưu danh tính đường dẫn remote, không đọc nội dung lúc đính kèm; AI đọc qua tool có xác thực path thuộc tập đã đính kèm"
    - "Thiết kế nêu đúng file/điểm nối đã xác minh trong codebase, kèm trust boundary, wave triển khai và chiến lược test tập trung"
    - "Không có thay đổi mã production; chỉ SUMMARY + DESIGN doc; targeted grep/tsc không chạy full suite"
  artifacts:
    - path: .planning/quick/261126-qag-them-ssh-remote-file-browser-va-multi-se/261126-qag-SUMMARY.md
      provides: "Mục phát hiện điều tra cách AI đọc DOCX/XLSX/PDF hiện tại"
      contains: "## Phát hiện"
    - path: .planning/quick/261126-qag-them-ssh-remote-file-browser-va-multi-se/SSH-FILE-ATTACH-DESIGN.md
      provides: "Thiết kế SSH browse + multi-attach + AI read cho chat standalone"
      contains: "ssh_read_attached_file"
  key_links:
    - from: src/views/AIPopoutView.tsx
      to: src/components/ai/AIChatDrawer.tsx
      via: "prop standaloneChat / isStandaloneChat"
      pattern: "standaloneChat|isStandaloneChat"
    - from: src/services/ai/aiTools.ts
      to: src/services/ai/sshFsToolService.ts
      via: "dispatch ssh_read_document / ssh_read_file_page"
      pattern: "executeSshReadDocument|executeSshReadFile"
    - from: src/services/ai/sshFsToolService.ts
      to: src/services/ai/sshDocumentParser.ts
      via: "parseSshDocument sau readRemoteFileBytes"
      pattern: "parseSshDocument|readRemoteFileBytes"
---

<objective>
Điều tra chính xác cách các AI tool hiện tại đọc DOCX/XLSX/PDF (toàn file hay do AI chọn script/vùng), ghi kết quả vào SUMMARY; đồng thời thiết kế cụ thể (chưa viết mã) tính năng SSH file browser + đính kèm một/nhiều file + AI đọc file đã đính kèm, chỉ dành cho cửa sổ chat standalone.

Purpose: sếp cần hướng thiết kế trước khi implement, và cần biết chắc hành vi đọc tài liệu hiện tại để tránh thiết kế sai giữa "đọc toàn bộ" và "đọc theo vùng do AI chọn".

Output: 2 file documentation trong thư mục quick task này — SUMMARY có mục phát hiện, và SSH-FILE-ATTACH-DESIGN.md chứa thiết kế. Không sửa mã production.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/quick/261126-ky8-split-standalone-chat-window-onto-its-ow/261126-ky8-SUMMARY.md
@src/services/ai/sshDocumentParser.ts
@src/services/ai/sshFsToolService.ts
@src/services/ai/aiTools.ts
@src/types/sshFsTool.ts
@src/services/ai/browserFileReader.ts
@src/components/ai/ChatInputBar.tsx
@src/components/ai/AIChatDrawer.tsx
@src/views/AIPopoutView.tsx
@src/db/chatWindowDb.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Điều tra và ghi phát hiện cách AI đọc DOCX/XLSX/PDF vào SUMMARY</name>
  <files>.planning/quick/261126-qag-them-ssh-remote-file-browser-va-multi-se/261126-qag-SUMMARY.md</files>
  <action>Tạo SUMMARY của quick task này với mục riêng "## Phát hiện — AI đọc DOCX/XLSX/PDF hiện tại" bằng tiếng Việt. Dựa trên các file đã xác minh: src/services/ai/sshDocumentParser.ts (parseDocx dùng mammoth.extractRawText, parseXlsx dùng ExcelJS.Workbook.xlsx.load + eachSheet/eachRow, parsePdf dùng pdfjs-dist getTextContent từng trang; parseSshDocument gọi truncateText với DEFAULT_MAX_CHARS = 24000, cắt từ đầu chuỗi), src/services/ai/sshFsToolService.ts (executeSshReadDocument lấy TOÀN BỘ bytes qua readRemoteFileBytes rồi parseSshDocument; executeSshReadFile là phân trang text qua readRemoteFileSlice với offset/limit do AI truyền), src/services/ai/aiTools.ts (tool ssh_read_document chỉ nhận tham số 'path', không có đối số chọn sheet/trang/vùng; execution dispatch tại case 'ssh_read_document'), src/types/sshFsTool.ts (SshReadDocumentArgs chỉ có path), src/services/ai/browserFileReader.ts (đường local browser chỉ nhận text, cap 2 MB, sanitizeBrowserFileText). Kết luận phải nêu rõ: (1) DOCX/XLSX/PDF = đọc toàn file, trích toàn bộ text, rồi cắt 24k ký tự từ đầu; KHÔNG có cơ chế AI chọn sheet/trang/đoạn; (2) file text/code = ssh_read_file_page có offset/limit do AI chọn; (3) output document được sanitizeBrowserFileText + wrapField nonce; (4) PDF scan không có text layer thì trả text rỗng kèm note, không OCR; (5) ghi chú tool description trong aiTools.ts ghi "Cap 10 MB per file" nhưng parser chỉ cap 24k ký tự đầu ra — nêu đây là điểm cần làm rõ khi thiết kế, không tự sửa code. Ghi đúng đường dẫn file và tên hàm làm bằng chứng. Không viết mã production.</action>
  <verify>
    <automated>F=/Users/tranducquan/Working/Personal/task-management/.claude/worktrees/ssh-remote-file-attach/.planning/quick/261126-qag-them-ssh-remote-file-browser-va-multi-se/261126-qag-SUMMARY.md; test -f "$F" && grep -q '## Phát hiện' "$F" && grep -q 'sshDocumentParser.ts' "$F" && grep -q 'ssh_read_file_page' "$F" && grep -q 'DEFAULT_MAX_CHARS' "$F" && grep -q 'toàn bộ' "$F"</automated>
  </verify>
  <done>SUMMARY tồn tại, có mục phát hiện riêng bằng tiếng Việt, nêu rõ toàn file vs phân trang do AI chọn, kèm tên file/hàm và cap 24k/không OCR/tool description 10 MB.</done>
</task>

<task type="auto">
  <name>Task 2: Thiết kế SSH browser + multi-select attach cho chat standalone</name>
  <files>.planning/quick/261126-qag-them-ssh-remote-file-browser-va-multi-se/SSH-FILE-ATTACH-DESIGN.md</files>
  <action>Tạo tài liệu thiết kế tiếng Việt. Phần 1 — phạm vi và gating: chỉ bật trong standalone chat, đi từ src/views/AIPopoutView.tsx prop standaloneChat -> src/components/ai/AIChatDrawer.tsx isStandaloneChat; chat dock trong workbench giữ nguyên, không thêm affordance. Phần 2 — nguồn cấu hình: SSH connection lấy từ chatWindowDb (src/db/chatWindowDb.ts, TaskMateChatWindowDB) qua SshFsAiToolConfigCard / SSH_FS_TOOL_CONFIG_KEY; reuse listRemoteDir trong src/services/sshService.ts và resolveRemoteToolPath trong sshFsToolService.ts để giới hạn đường dẫn; không thêm thư viện mới (mammoth/exceljs/pdfjs-dist đã có). Phần 3 — UI đề xuất: component browser mới đặt dưới src/components/ai/ (đặt tên cụ thể, ví dụ StandaloneSshFileBrowser.tsx), mở từ ChatInputBar/ChatTabToolbox bằng nút riêng chỉ khi standalone; tree dùng listRemoteDir(path, showHidden, limit), điều hướng thư mục, lọc theo extension, checkbox chọn nhiều, nút "Đính kèm". Phần 4 — dữ liệu đính kèm: tái dùng props attachedFiles: string[], onAttachFile, onRemoveFile của src/components/ai/ChatInputBar.tsx; lưu danh tính remote path (không đọc nội dung lúc chọn), chip hiển thị tên file + tooltip path + remove; phân biệt rõ với đường local browser hiện tại (readBrowserFileText chỉ text 2 MB). Liệt kê bảng file dự kiến sẽ thêm/sửa khi implement sau (chỉ thiết kế, chưa tạo mã), kèm wave phụ thuộc.</action>
  <verify>
    <automated>F=/Users/tranducquan/Working/Personal/task-management/.claude/worktrees/ssh-remote-file-attach/.planning/quick/261126-qag-them-ssh-remote-file-browser-va-multi-se/SSH-FILE-ATTACH-DESIGN.md; test -f "$F" && grep -q 'standaloneChat' "$F" && grep -q 'listRemoteDir' "$F" && grep -q 'attachedFiles' "$F" && grep -q 'resolveRemoteToolPath' "$F"</automated>
  </verify>
  <done>Document thiết kế có đủ 4 phần, nêu rõ chỉ standalone, dùng SSH config từ chatWindowDb, chọn nhiều file mà không đọc nội dung lúc attach, và bảng file dự kiến kèm wave.</done>
</task>

<task type="auto">
  <name>Task 3: Thiết kế AI read file đã đính kèm, trust boundary và wave triển khai</name>
  <files>.planning/quick/261126-qag-them-ssh-remote-file-browser-va-multi-se/SSH-FILE-ATTACH-DESIGN.md</files>
  <action>Nối thêm phần 5 vào cùng tài liệu. Đề xuất tool mới ssh_read_attached_file (tham số path + tùy chọn offset/limit) trong src/services/ai/aiTools.ts và src/types/sshFsTool.ts, với hợp đồng: path phải nằm trong tập file đã đính kèm của turn hiện tại nếu không từ chối; text/code ủy thác sang executeSshReadFile (AI chọn offset/limit, binary path bị từ chối); docx/xlsx/pdf ủy thác sang executeSshReadDocument (đọc toàn file rồi cap 24k ký tự như hiện tại — nêu rõ đây là hành vi đã điều tra, không hứa hỗ trợ chọn sheet/trang khi chưa có parser hỗ trợ). Nêu trust boundary: (a) người dùng chọn file trong browser -> attach, (b) đối số tool do AI sinh -> phải validate thuộc attached set + resolveRemoteToolPath confinement + shell escape như hiện tại, (c) nội dung remote đưa vào prompt phải sanitizeBrowserFileText + wrapField nonce, không tin text trong tài liệu. Ghi rõ quyết định thiết kế: không gửi nội dung tới knowledge daemon; giữ 100% local/Tauri; PDF scan vẫn không OCR. Phần 6 — wave triển khai đề xuất cho lần implement sau: Wave 1 contract + browser UI, Wave 2 attach state + tool validate, Wave 3 wire vào dispatcher + prompts, Wave 4 test. Phần 7 — chiến lược test tập trung: mở rộng src/services/ai/__tests__/sshFsToolService.test.ts và src/services/ai/__tests__/sshDocumentParser.test.ts, test UI standalone trong tests/phase51/, e2e Chromium dùng e2e/aiChatStandalone.html/.tsx và e2e/aiChatSettings.spec.ts; nêu rõ không chạy full vitest suite (quy tắc dự án >1 giờ). Không viết mã production; không tạo file design bổ sung ngoài 2 file đã khai báo.</action>
  <verify>
    <automated>F=/Users/tranducquan/Working/Personal/task-management/.claude/worktrees/ssh-remote-file-attach/.planning/quick/261126-qag-them-ssh-remote-file-browser-va-multi-se/SSH-FILE-ATTACH-DESIGN.md; test -f "$F" && grep -q 'ssh_read_attached_file' "$F" && grep -q 'sanitizeBrowserFileText' "$F" && grep -q 'Wave 1' "$F" && grep -q 'sshFsToolService.test.ts' "$F" && grep -q 'aiChatStandalone' "$F"</automated>
  </verify>
  <done>Document có phần thiết kế tool, 3 trust boundary với mitigation cụ thể, 4 wave triển khai và test tập trung; design-only, không có thay đổi mã production.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| user -> attach | Người dùng chọn file remote trong browser UI; chỉ danh tính path được lưu, chưa có nội dung |
| AI -> tool args | Model sinh path/offset/limit cho tool đọc; có thể bị prompt injection từ nội dung tài liệu |
| remote document -> prompt | Text trích từ DOCX/XLSX/PDF qua SSH là dữ liệu không tin cậy, đưa thẳng vào ngữ cảnh AI |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-QAG-01 | Tampering / Information disclosure | ssh_read_attached_file (design) | mitigate | Validate path thuộc attached set của turn + resolveRemoteToolPath confinement; không fallback sang Host/path khác |
| T-QAG-02 | Injection | executeSshReadDocument / executeSshReadFile output | mitigate | sanitizeBrowserFileText + wrapField nonce; text/code giữ isLikelyBinaryPath chặn binary |
| T-QAG-03 | Information disclosure | Standalone browse UI | mitigate | Chỉ bật khi standaloneChat, SSH config đọc từ chatWindowDb; listRemoteDir giới hạn bởi defaultBasePath/repoPath |
| T-QAG-04 | Elevation of privilege | Tool availability | accept | Tool mới chỉ advertised trong standalone chat; dock chat không gắn affordance hay tool — thiết kế gating đã phủ |

</threat_model>

<verification>
- Task 1: SUMMARY có mục phát hiện, nêu đúng 24k cap / toàn file / offset-limit / không OCR.
- Task 2 + 3: SSH-FILE-ATTACH-DESIGN.md có đủ 7 phần, dùng đúng tên file/hàm đã xác minh trong codebase.
- `git status --short` chỉ hiện 2 file documentation trong thư mục quick task này; `git diff --name-only` không có file src/ hoặc src-tauri/.
- Không chạy full vitest suite (quy tắc dự án).
</verification>

<success_criteria>
Sếp có một báo cáo ngắn gọn về hành vi đọc tài liệu hiện tại và một thiết kế khả thi cho SSH browse + multi-attach + AI read trong standalone chat, đủ để duyệt trước khi implement. Không có mã production nào bị thay đổi trong quick task này.
</success_criteria>

<output>
Cập nhật `.planning/quick/261126-qag-them-ssh-remote-file-browser-va-multi-se/261126-qag-SUMMARY.md` với mục phát hiện; thiết kế nằm trong `.planning/quick/261126-qag-them-ssh-remote-file-browser-va-multi-se/SSH-FILE-ATTACH-DESIGN.md`. Không tạo SUMMARY bổ sung ở nơi khác.
</output>
