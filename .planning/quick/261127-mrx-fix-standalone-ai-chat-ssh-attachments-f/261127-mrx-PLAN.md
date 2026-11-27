---
phase: quick
plan: 261127-mrx
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/ai/AIChatDrawer.tsx
  - src/components/ai/__tests__/referencedFilesPrompt.test.ts
  - .planning/STATE.md
autonomous: true
requirements:
  - STANDALONE-ATTACHED-PATHS
user_setup: []
estimate:
  tokens: 28000
  raw_tokens: 18000
  tasks: 2
  confidence: low
must_haves:
  truths:
    - "Standalone AI chat có ít nhất một file đính kèm thì system prompt gửi đi chứa block referenced_files với đúng từng đường dẫn đã chọn"
    - "Standalone không có file đính kèm thì prompt không chứa block referenced_files và giữ nguyên nội dung cũ"
    - "Ordinary chat vẫn nhận block referenced_files ở cùng vị trí, nội dung không đổi"
    - "Chỉ tên/đường dẫn file xuất hiện trong prompt; không đọc nội dung file, không thêm tool hay dependency"
    - "Luồng attachedPaths → tab references → runtime/dispatcher giữ nguyên, không sửa chỗ khác"
  artifacts:
    - path: src/components/ai/AIChatDrawer.tsx
      provides: "Pure helper buildReferencedFilesPrompt + buildStandaloneSystemPrompt, wire cả hai nhánh prompt"
      contains: "buildStandaloneSystemPrompt"
    - path: src/components/ai/__tests__/referencedFilesPrompt.test.ts
      provides: "Targeted check cho block referenced_files trong standalone prompt và trường hợp rỗng"
      contains: "<referenced_files>"
  key_links:
    - from: src/components/ai/AIChatDrawer.tsx#allFiles
      to: src/components/ai/AIChatDrawer.tsx#buildReferencedFilesPrompt
      via: "allFiles từ tab references/mentions được dựng thành một block duy nhất"
      pattern: "referencedFilesBlock"
    - from: src/components/ai/AIChatDrawer.tsx#buildReferencedFilesPrompt
      to: src/components/ai/AIChatDrawer.tsx#buildStandaloneSystemPrompt
      via: "referencedFilesBlock được nối vào standalonePrompt trước khi chọn systemPromptContent"
      pattern: "systemPromptContent"
    - from: src/components/ai/__tests__/referencedFilesPrompt.test.ts
      to: src/components/ai/AIChatDrawer.tsx
      via: "import trực tiếp hai helper thuần, không render component"
      pattern: "from '../AIChatDrawer'"
---

<objective>
Sửa lỗi standalone AI chat: file chọn qua `StandaloneSshFileBrowser` đã đi vào tab `references` và `attachedPaths`, nhưng system prompt nhánh standalone bỏ qua `systemInstruction` nên agent không bao giờ thấy đường dẫn file chính xác. Đưa block `<referenced_files>` vào cả hai nhánh prompt từ một nguồn duy nhất và thêm check có mục tiêu.

Purpose: Khôi phục parity giữa standalone chat và ordinary chat — agent biết chính xác path đã đính kèm để dùng SSH FS tools, mà không đọc nội dung file hay mở rộng quyền. Giữ nguyên mọi hành vi khác của drawer và runtime.

Output: `buildReferencedFilesPrompt` và `buildStandaloneSystemPrompt` là helper thuần trong `src/components/ai/AIChatDrawer.tsx`, file test mới `src/components/ai/__tests__/referencedFilesPrompt.test.ts`, cập nhật `.planning/STATE.md` và SUMMARY.md.

Ranh giới cứng:
- Không đổi `attachedPaths`, `attachmentScope`, `runtime.start`, `chatTurnRuntime`, `aiOrchestratorLoop` hay bất cứ file runtime/dispatcher nào.
- Không đổi `REFERENCED_FILES_HINT`, `STANDALONE_ANALYSIS_PROMPT_SEGMENT`, `ANALYSIS_PROMPT_SEGMENT`, danh sách tool hay nội dung ordinary prompt khi không có attachment.
- Không đọc nội dung file, không thêm dependency, không đụng untracked artifacts có sẵn (.gsd sentinel, .planning/debug, sketches, quick khác).
- Mọi thảo luận bằng tiếng Việt; không chạy `npm test` toàn bộ (quy tắc dự án: > 1 giờ).
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/STATE.md

Quan sát trực tiếp tại checkout (đọc một lần, không cần re-read):

- `src/components/ai/AIChatDrawer.tsx:1493-1503`: `allFiles = Array.from(new Set([...turnReferences, ...(mentioned?.filePaths ?? [])]))`; `attachedPaths` và `attachmentScope` được tạo từ `allFiles` và truyền xuống runtime ở `:1857`. Đây là nguồn duy nhất của đường dẫn file.
- `src/components/ai/AIChatDrawer.tsx:1706-1710`: block `<referenced_files>` hiện được nối thẳng vào `systemInstruction` bằng template inline, dùng `REFERENCED_FILES_HINT` (`:185`).
- `src/components/ai/AIChatDrawer.tsx:1785-1799`: `standalonePrompt` là template riêng, kết thúc bằng `${graphitiSkillSegment}${STANDALONE_ANALYSIS_PROMPT_SEGMENT}` — **không** nhắc tới `systemInstruction`.
- `src/components/ai/AIChatDrawer.tsx:1800-1814`: `ordinaryPrompt` mới là nhánh có `systemInstruction`; `:1814` chọn prompt theo `isStandaloneChat`. Đây là điểm gãy.
- `src/components/ai/AIChatDrawer.tsx:78`: `APP_NAME` đã import sẵn ở module scope; `:217` định nghĩa `STANDALONE_ANALYSIS_PROMPT_SEGMENT`.
- `src/components/ai/AIChatDrawer.tsx:2461-2463`: drawer nhận `attachedFiles` từ `activeRuntime.references`, tức file picker đã gắn vào tab trước khi gửi.
- `src/components/ai/__tests__/referencedFilesHint.test.ts`: precedent test chạy `// @vitest-environment node`, import trực tiếp export từ `../AIChatDrawer` — helper thuần làm theo mô hình này.
- `package.json:11`: `test` là `vitest run`; chạy scoped theo từng file, không full suite.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Đưa referenced_files vào standalone prompt qua helper dùng chung</name>
  <files>src/components/ai/AIChatDrawer.tsx</files>
  <action>
    Sửa đúng file `src/components/ai/AIChatDrawer.tsx`. Giữ mọi phần khác byte-identical, đặc biệt các đoạn capability/anti-hallucination, lựa chọn tool, gating và luồng gửi turn.

    1. Thêm export pure helper `buildReferencedFilesPrompt(paths: readonly string[]): string` ngay sau `REFERENCED_FILES_HINT`. Hợp đồng: mảng rỗng trả chuỗi rỗng; ngược lại trả đúng block hiện hành gồm mở `<referenced_files>`, dòng tiêu đề `[User Attached & Referenced Local Files]:`, dòng mô tả "name/path only", mỗi path một dòng dạng gạch đầu dòng + backtick, rồi `REFERENCED_FILES_HINT`, rồi đóng `</referenced_files>`. Giữ nguyên từng từ của header/mô tả/hint so với template cũ ở `:1708` — chỉ chuyển chỗ dựng sang helper. Helper thuần: không db, không SSH, không đọc file, không log.

    2. Thêm export pure helper `buildStandaloneSystemPrompt` nhận một object gồm `todayStr`, `weekday`, `time`, `graphitiSkillSegment` và `referencedFilesBlock` (đều là string), trả về chuỗi prompt. Chuyển nguyên template `standalonePrompt` hiện tại ở `:1785-1799` vào helper, thay các giá trị động bằng tham số và dùng `APP_NAME` từ module scope. Điểm khác duy nhất: nối thêm `referencedFilesBlock` sau `${STANDALONE_ANALYSIS_PROMPT_SEGMENT}`, có prefix hai ký tự newline, chỉ khi block khác rỗng. Khi block rỗng, chuỗi trả về phải giống hệt prompt cũ.

    3. Trong component, sau khi `allFiles` được resolve, tính `referencedFilesBlock = buildReferencedFilesPrompt(allFiles)` một lần. Thay block inline ở `:1706-1710` bằng việc dùng `referencedFilesBlock`: vẫn chỉ nối vào `systemInstruction` khi block khác rỗng, với hai newline như cũ, để ordinary chat không đổi. Thay định nghĩa `standalonePrompt` bằng lời gọi `buildStandaloneSystemPrompt` với `todayStr`, `now.format('dddd')`, `now.format('HH:mm')`, `graphitiSkillSegment`, `referencedFilesBlock`. Giữ nguyên `systemPromptContent = isStandaloneChat ? standalonePrompt : ordinaryPrompt` và mọi chỗ dùng `systemPromptContent` (debug turn, systemMessages, runtime.start).

    4. Không chỉnh sửa `REFERENCED_FILES_HINT`, các segment prompt, `attachmentScope`, `attachedPaths` hay bất cứ file runtime nào. Không thêm import thừa, không thêm dependency.
  </action>
  <verify>
    <automated>npx vitest run src/components/ai/__tests__/referencedFilesHint.test.ts --bail=1</automated>
  </verify>
  <done>Hai helper thuần tồn tại và được export; nhánh standalone dùng block được dựng từ `allFiles`; ordinary prompt giữ nguyên khi không có attachment; hint test cũ vẫn xanh; không file runtime nào bị đổi.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Test có mục tiêu cho block referenced_files trên standalone</name>
  <files>src/components/ai/__tests__/referencedFilesPrompt.test.ts</files>
  <behavior>
    - `buildReferencedFilesPrompt([])` trả chuỗi rỗng
    - `buildReferencedFilesPrompt(['/srv/repo/a.sql', '/srv/repo/report handwriting.txt'])` chứa `<referenced_files>` và `</referenced_files>`, chứa nguyên từng path trong backtick, chứa nội dung của `REFERENCED_FILES_HINT`, và không có với path không được chọn
    - `buildStandaloneSystemPrompt` với `referencedFilesBlock` rỗng không chứa `<referenced_files>`, vẫn chứa `AVAILABLE CAPABILITIES`, `retrieve_knowledge`, `CRITICAL ANTI-HALLUCINATION RULES`
    - `buildStandaloneSystemPrompt` với block có path chứa đúng block đó, đúng path, đồng thời vẫn giữ các đoạn capability/anti-hallucination ở trên
  </behavior>
  <action>
    Tạo file mới `src/components/ai/__tests__/referencedFilesPrompt.test.ts` theo mô hình `src/components/ai/__tests__/referencedFilesHint.test.ts`: bắt đầu bằng directive `// @vitest-environment node`, import `describe/it/expect` từ `vitest`, import `buildReferencedFilesPrompt`, `buildStandaloneSystemPrompt` và `REFERENCED_FILES_HINT` từ `../AIChatDrawer`. Viết đúng 4 case đã liệt kê trong `<behavior>`; không render component, không mock db, không thêm dependency, không sửa file test cũ. Dùng fixture path có dấu cách để chứng minh path được giữ nguyên, không bị cắt. Với case prompt rỗng, truyền các tham số ngày/giờ cố định để test deterministic.
  </action>
  <verify>
    <automated>npx vitest run src/components/ai/__tests__/referencedFilesPrompt.test.ts src/components/ai/__tests__/referencedFilesHint.test.ts --bail=1</automated>
  </verify>
  <done>4 case mới pass cùng hint test cũ; test chứng minh standalone prompt có đúng đường dẫn file khi có attachment và không có block giả khi rỗng; không chạy full suite.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| SSH file picker → tab references → `buildReferencedFilesPrompt` | Path do user chọn từ máy remote của chính user, đi vào system prompt dưới dạng dữ liệu |
| System prompt → model | Kênh điều khiển; block referenced_files phải giữ delimiter và hint nguyên vẹn, không được mang nội dung file |
| Standalone prompt → `runtime.start` | Chỉ đổi chuỗi system prompt; payload tool/attachedPaths giữ nguyên |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-MRX-01 | Injection | `buildReferencedFilesPrompt` | low | mitigate | Helper chỉ phát path dạng gạch đầu dòng trong backtick, giữ nguyên delimiter `<referenced_files>` và `REFERENCED_FILES_HINT` đã có ở ordinary chat; không nhúng nội dung file hay lời gọi tool mới |
| T-MRX-02 | Tampering | `buildStandaloneSystemPrompt` | medium | mitigate | Chỉ nối block khi khác rỗng; không sửa đoạn capability/anti-hallucination; test pin các đoạn cố định để phát hiện drift |
| T-MRX-03 | Information disclosure | Attachment flow | low | mitigate | Helper nhận mảng path, không nhận handle hay nội dung file; attachedPaths/runtime giữ nguyên nên không tạo đường đọc file mới |
| T-MRX-SC | Tampering | package installs | high | mitigate | Không npm install, không dependency mới; chỉ dùng Vitest có sẵn |

</threat_model>

<verification>
Chạy đúng 3 lệnh, không full suite:

1. `npx vitest run src/components/ai/__tests__/referencedFilesPrompt.test.ts src/components/ai/__tests__/referencedFilesHint.test.ts --bail=1`
2. `npx tsc --noEmit --pretty false`
3. `git diff --check`

Phạm vi diff cho phép: `src/components/ai/AIChatDrawer.tsx`, `src/components/ai/__tests__/referencedFilesPrompt.test.ts`, `.planning/STATE.md` và SUMMARY.md mới. Không đụng `.gsd/dispatch-isolation-sentinel.json`, `.planning/debug/*`, sketches hay quick task khác.
</verification>

<success_criteria>
- Standalone prompt có block `<referenced_files>` chứa đúng từng path đã đính kèm khi có ít nhất một attachment; test chứng minh bằng path có dấu cách.
- Không có attachment thì standalone prompt không chứa block và giữ nguyên nội dung cũ; ordinary prompt giữ nguyên trong mọi trường hợp.
- `REFERENCED_FILES_HINT`, các prompt segment, tool list, `attachedPaths`/`attachmentScope`/runtime byte-identical; không đọc nội dung file, không dependency mới.
- 4 test mới + hint test cũ xanh, `tsc --noEmit` sạch, `git diff --check` sạch; không chạy `npm test`.
</success_criteria>

<output>
Khi xong, ghi `.planning/quick/261127-mrx-fix-standalone-ai-chat-ssh-attachments-f/261127-mrx-SUMMARY.md` theo template GSD, và cập nhật `.planning/STATE.md`: thêm dòng quick task `261127-mrx` vào bảng "Quick Tasks Completed", thêm một decision line ghi rõ block referenced_files là nguồn duy nhất cho cả hai nhánh prompt (helper thuần, không đọc nội dung file), và cập nhật "Performance Metrics" nếu có số đo thực tế.
</output>
