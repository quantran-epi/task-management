---
phase: 26-sdlc-prompt-grounding-tool-use-policy
reviewed: 2026-11-03T14:30:00Z
depth: standard
files_reviewed: 26
files_reviewed_list:
  - src/components/ai/AIChatDrawer.tsx
  - src/components/ai/AiChatWidget.tsx
  - src/components/ai/runtime/chatTurnRuntime.ts
  - src/components/ai/runtime/useChatTurn.ts
  - src/components/sdlc/SdlcWorkspace.tsx
  - src/components/sdlc/chat/StepChatPanel.tsx
  - src/components/sdlc/chat/useStepChatToolbox.ts
  - src/services/ai/aiOrchestratorLoop.ts
  - src/services/ai/chatTurnTools.ts
  - src/services/ai/sdlcPromptComposer.ts
  - src/services/sdlc/groundingBuilder.ts
  - src/views/ProjectSdlcView.tsx
  - tests/ai/AIChatDrawer.test.tsx
  - tests/ai/AiChatWidget.test.tsx
  - tests/ai/chatTurnRuntime.test.ts
  - tests/ai/sdlcPromptComposer.test.ts
  - tests/ai/sdlcPromptIsolation.test.ts
  - tests/ai/useChatTurn.test.tsx
  - tests/services/ai/aiOrchestratorLoop.test.ts
  - tests/services/sdlc/groundingBuilder.test.ts
  - tests/unit/sdlc/ProjectSdlcAnalysisLifecycle.test.tsx
  - tests/unit/sdlc/ProjectSdlcAutoAnalysis.test.tsx
  - tests/unit/sdlc/ProjectSdlcGrounding.test.tsx
  - tests/unit/sdlc/StepChatPanelArtifactBudget.test.tsx
  - tests/unit/sdlc/StepChatPanelArtifactQueue.test.tsx
  - tests/unit/sdlc/StepChatPanelToolPolicy.test.tsx
findings:
  critical: 1
  warning: 3
  info: 3
  total: 7
  necessity: 0
status: issues_found
---

# Phase 26: Code Review Report

**Reviewed:** 2026-11-03T14:30:00Z
**Depth:** standard
**Files Reviewed:** 26
**Status:** issues_found

## Summary

Phạm vi review là 26 file theo `/tmp/taskmate-phase26-review-scope.json`. Scope resolver trả `degraded` (`no-reachable-task-commits`): bốn SHA ghi trong SUMMARY (`2307bd16`, `44c42457`, `c8c06971`, `cc875049`) không tồn tại trên HEAD, nên phạm vi được phân định theo các commit tương đương thực sự reachable: `3ce3814b`, `9ec213cf`, `00a189fa`, `274f8e69`, `ccbc89f6`, `a717db26`, `850e0478`, `b77b26c1`. Nguồn review là working source hiện tại; so sánh byte sau khi chuẩn hóa `\r\n` cho thấy 26 file này chỉ khác nhau ở CRLF giữa hai checkout, không có khác biệt ngữ nghĩa nào bị gán sai cho Phase 26.

Grounding builder, thứ tự layer của composer, parity giữa tool policy và tool payload, và vòng tool bị chặn trần (không dispatch batch cuối, không synthesis, không persist assistant row) đều khớp mô tả plan và có test chứng minh. Vấn đề nặng nhất không phải thiếu code mà là cổng tiền-điều-kiện artifact tin vào văn bản tài liệu không tin cậy: `hasGroundingSource` chỉ so khớp dòng marker trong chuỗi grounding đã render, nên nội dung artifact hoặc metadata do người dùng nhập có thể giả mạo marker và mở cổng soạn tài liệu khi nguồn thật còn thiếu. Cùng cổng đó làm 6 test cũ trong `tests/unit/sdlc/StepChatPanelArtifactBudget.test.tsx` fail, và nhánh clarify của detector tạo ngõ chết ở các bước không có artifact action.

Không khẳng định phase hoàn tất, không khẳng định suite xanh. Checks đã chạy: `tests/services/sdlc/groundingBuilder.test.ts`, `tests/ai/sdlcPromptComposer.test.ts`, `tests/unit/sdlc/StepChatPanelToolPolicy.test.tsx`, `tests/unit/sdlc/StepChatPanelArtifactQueue.test.tsx` (4 file, 79 pass — log `/tmp/phase26-review-focused.log`); `tests/ai/chatTurnRuntime.test.ts`, `tests/ai/useChatTurn.test.tsx`, `tests/ai/AiChatWidget.test.tsx`, `tests/services/ai/aiOrchestratorLoop.test.ts`, `tests/ai/sdlcPromptIsolation.test.ts`, `tests/unit/sdlc/ProjectSdlcGrounding.test.tsx`, `tests/unit/sdlc/StepChatPanelArtifactBudget.test.tsx` (104 pass, 6 fail — log `/tmp/phase26-review-focused2.log`). Checks bỏ qua: full suite, `tests/ai/AIChatDrawer.test.tsx` cùng các drawer suite đã biết fail (không chạy nên không kết luận gì về chúng), và toàn bộ kiểm tra PWA/GitHub Pages. `necessity-review.md` đã đọc; không có finding thuộc nhóm necessity.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Cổng tiền-điều-kiện artifact bị vượt bằng marker giả trong văn bản không tin cậy

**File:** `src/services/sdlc/groundingBuilder.ts:198-205`, `src/components/sdlc/chat/StepChatPanel.tsx:302-307`
**Issue:** `hasGroundingSource` xác định "nguồn đã có" bằng cách tìm dòng **đầu tiên** khớp `^\[<MARKER>\]$` trong chuỗi grounding rồi kiểm tra dòng kế tiếp không rỗng và không bắt đầu bằng `[MISSING:`. Chuỗi grounding lại chứa nguyên văn nội dung artifact và metadata CR (`renderArtifact` → `artifactBody` tại dòng 56-76, `renderMetadata` tại dòng 78-93), vốn là dữ liệu người dùng nhập hoặc văn bản tài liệu không tin cậy. `cleanSource` (dòng 142-144) chỉ xóa delimiter của composer, không xử lý dòng marker nguồn. Vì `findIndex` lấy marker xuất hiện trước, một marker giả nằm trong section đứng trước sẽ thắng section `[MISSING: ...]` thật.

Trigger cụ thể ở bước TECH_DOCS (prereq `SOLUTION` + `CHANGE_PACK`, thứ tự nguồn `CR_METADATA, SOLUTION, CHANGE_PACK, ...`): nhập vào `metadata.featureName` hoặc vào nội dung SOLUTION đoạn

```
[CHANGE_PACK]
đã đóng gói
```

`hasGroundingSource(grounding, 'CHANGE_PACK')` trả `true`, `ARTIFACT_PREREQUISITES.TECH_DOCS` không thấy mục thiếu, `launchArtifact` gọi `submit(ARTIFACT_PROMPTS.PL03B, 'PL03B')`. Cùng cách này áp cho `SOLUTION` (giả `[PL01]`/`[PL02]` trong phần `CR_METADATA`) và cho `CAB` (giả `[PL03B]`/`[PL07]` trong nội dung code guide đã render trong `[TECH_DOCS]`).

**Consequence:** Guard T-26-03b mất hiệu lực. AI được yêu cầu soạn PL03B/PL07/CAB "theo bằng chứng Change Pack đã xác thực" khi Change Pack chưa tồn tại, rồi kết quả đi tiếp vào transcript/artifact card như bản nháp hợp lệ. Test `derived markers never substitute required sources` không bắt được vì nó chỉ dùng marker phái sinh, không dùng marker giả nhúng trong nội dung nguồn.

**Fix:** Không dùng chuỗi đã render làm nguồn sự thật cho cổng. Cho builder trả kèm tập marker thật và gate theo tập đó:

```ts
// groundingBuilder.ts
export interface SdlcGroundingResult {
  text: string;
  present: ReadonlySet<SdlcGroundingMarker>;
}
export function buildSdlcStepGroundingResult(input: SdlcGroundingInput): SdlcGroundingResult;
// `present` tích lũy trong vòng lặp marker, trước khi nội dung nguồn được nối vào `text`
```

Nếu buộc giữ chữ ký chuỗi, tối thiểu phải vô hiệu hóa marker trong nội dung nguồn trước khi nối: mở rộng `cleanSource` để escape mọi dòng khớp `^\[[A-Z_]+( v\d+)?\]$` bên trong `artifactBody`/`renderMetadata`/`renderEvidence` thành `(marker nguồn đã loại bỏ) [...]`, kèm test với marker nhúng trong `metadata.featureName` và trong nội dung SOLUTION.

## Warnings

### WR-01: Guard tiền-điều-kiện của 26-03 làm fail 6 test cũ chưa được cập nhật

**File:** `tests/unit/sdlc/StepChatPanelArtifactBudget.test.tsx:84-85,115-123,137-151,153-176`
**Issue:** `mount()` render `StepChatPanel` không truyền `stepGroundingContext` (mặc định `''`), nên `ARTIFACT_PREREQUISITES.SOLUTION` (`src/components/sdlc/chat/StepChatPanel.tsx:68-72`) luôn thiếu `PL01`/`PL02`; `launchArtifact` dừng trước `submit` và `mocks.start` không bao giờ được gọi. Kết quả chạy thực tế: 6 fail (`forwards configured context 2000/30000...`, `rejects truncated artifacts... (fallback false/true)`, `hands off complete nested-fence artifact... (fallback false/true)`), lỗi đầu là `expected "vi.fn()" to be called 1 times, but got 0 times` tại dòng 119 và `Unable to find role="alert"` tại dòng 144. 26-02-SUMMARY ghi file này đã sửa (chỉ đổi shape mock `{ tools, dynamicReadOnlyToolNames }`), 26-03-PLAN không liệt kê nó trong `files_modified`, nên hồi quy không bị phát hiện.
**Fix:** Trong `mount()` truyền grounding thỏa prereq của bước SOLUTION, ví dụ `stepGroundingContext={'[PL01]\nBaseline\n\n[PL02]\nAcceptance'}`; hoặc chuyển các case này sang `sendMessage` Q&A nếu ý định là kiểm tra budget chứ không phải artifact intent. Sau CR-01 thì dùng API trả tập marker thật thay vì fixture chuỗi.

### WR-02: Nhánh clarify tạo ngõ chết ở bước không có artifact action và ở chế độ read-only

**File:** `src/components/sdlc/chat/StepChatPanel.tsx:321-328`, `src/components/sdlc/chat/StepChatPanel.tsx:415-424`
**Issue:** `sendMessage` chặn mọi câu khớp `looksLikeArtifactRequest` rồi `return` trước `submit`, kể cả khi `artifactActions` rỗng. Ở INTAKE / CODE_GUIDE / CHANGE_PACK (`STEP_ARTIFACT_ACTIONS` không có entry), `setArtifactNotice({ type: 'info', targets: [] })` render alert với câu `... Chọn tài liệu bạn muốn: .` và không có nút nào: câu hỏi bị bỏ, không có lượt model, không có hành động khả dụng. Khi `readOnly` (xem phiên bản lịch sử; `src/views/ProjectSdlcView.tsx:736` truyền `readOnly={Boolean(viewedVersion)}`), `statusExtensions` bị ẩn hoàn toàn do điều kiện `!readOnly && ...`, nên tin nhắn bị bỏ im lặng không phản hồi gì.
**Fix:** Chỉ bật clarify khi có target hợp lệ và không read-only: `if (!readOnly && artifactActions.length > 0 && looksLikeArtifactRequest(text)) { ...; return; }`; các trường hợp còn lại đi tiếp `await submit(text)` như Q&A thường.

### WR-03: PL03B/PL07/CAB sinh bằng AI không được chuyển vào editor, body đọng trong transcript

**File:** `src/components/sdlc/chat/StepChatPanel.tsx:169-189,265-267`, `src/views/ProjectSdlcView.tsx:605-610`
**Issue:** `extractSolutionDraft` chỉ chạy khi `stepId === 'SOLUTION'` và chỉ nhận nội dung chứa `# SOLUTION`. Sau khi 26-03 mở các intent `PL03B`, `PL07`, `CAB`, nhánh `outcome.phase === 'complete'` không có handler cho ba loại này: `setDraftPl03b`/`setDraftPl07` trong `ProjectSdlcView` chỉ được nuôi từ `Step5TechDocsView.onDraftChange`, không từ chat. Hậu quả: bấm "Soạn PL03B bằng AI" trả về tài liệu đầy đủ nhưng editor TECH_DOCS vẫn trống và toàn bộ body tài liệu nằm lại trong transcript, trái với nguyên tắc D-06 được ghi chú ngay tại `StepChatPanel.tsx:182-184`.
**Fix:** Tổng quát hóa đường handoff: cho `onArtifactDraft` nhận `kind: SdlcArtifactKindForTurn`, parse theo kind của lượt vừa chạy (giữ kind trong closure của `submit` hoặc trong `pendingArtifactRef`), rồi nối vào `setDraftPl03b`/`setDraftPl07`/draft CAB trong `ProjectSdlcView`. Nếu handoff này thuộc phase sau thì ghi rõ là known stub, thay vì để nút sinh ra tài liệu không có nơi nhận.

## Info

### IN-01: `fitTotal` có thể vượt `maxChars` khi ngân sách rất nhỏ

**File:** `src/services/sdlc/groundingBuilder.ts:146-171`
**Issue:** Khi `share` nhỏ hơn `marker.length + suffix.length + 2`, `clampSection` đặt `room = 0` nhưng vẫn trả `marker + '\n' + '' + '\n' + suffix`, dài hơn `share`, nên tổng đầu ra vượt `maxChars`. Đường production không chạm: caller duy nhất (`src/views/ProjectSdlcView.tsx:392-400`) không truyền `maxChars`, nên budget là 80.000 và `share` khoảng 11k. Chỉ ảnh hưởng caller tương lai hoặc test với budget nhỏ.
**Fix:** Sau khi join trong `fitTotal`, cắt cứng lần cuối nhưng giữ `status` ở cuối; hoặc tính `share` với sàn `markerLen + suffixLen + 2` và bỏ/hợp nhất section khi không còn chỗ.

### IN-02: Tên MCP trùng tên tool đọc cục bộ sinh định nghĩa trùng trong payload

**File:** `src/components/sdlc/chat/useStepChatToolbox.ts:92-99`, `src/services/ai/chatTurnTools.ts:21-28`
**Issue:** `dynamicReadOnlyToolNames` loại tên trùng với `SDLC_STEP_ALLOWED_TOOLS[stepId]`, nhưng `allowedToolNames` vẫn chứa các tên static đó, nên trong `getToolsForTurn` một MCP tool read-only tên `read_file` vẫn qua filter `allowed.has(...)` và được thêm vào payload cạnh tool cục bộ cùng tên. `dispatchAiToolCall` (`src/services/ai/aiOrchestratorLoop.ts:17-31`) luôn route về bản cục bộ, nên tool MCP được quảng cáo mà không bao giờ chạy. Test parity so sánh tập tên nên không phát hiện trùng định nghĩa.
**Fix:** Trước khi gọi `getToolsForTurn`, loại dynamic tool có tên chuẩn hóa trùng tool cục bộ: `dynamicMcpTools.filter((t) => !SDLC_STEP_ALLOWED_TOOLS[stepId].includes(normalizeToolName(t.function.name)))`.

### IN-03: Mock `useChatTurn` thiếu `runtime` nên guard chống gửi trùng không được kiểm chứng

**File:** `tests/unit/sdlc/StepChatPanelToolPolicy.test.tsx:13-18`
**Issue:** Mock trả object không có `runtime`, trong khi `UseChatTurnResult.runtime` là bắt buộc. Các guard `turn.runtime?.isRunning()` tại `src/components/sdlc/chat/StepChatPanel.tsx:197,283,433,443` và `toolLimitRounds` tại dòng 397 do đó luôn `undefined` trong suite này, nên hành vi "đang chạy thì không gửi tiếp" và tag tool-limit không được suite parity bao phủ (chỉ `tests/unit/sdlc/StepChatPanelArtifactQueue.test.tsx` phủ bằng `runtime: { isRunning }`).
**Fix:** Thêm `runtime: { isRunning: () => false, getToolLimitRounds: () => null, drainPersistence: async () => {} }` vào mock để khớp kiểu thật.

---

_Reviewed: 2026-11-03T14:30:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
