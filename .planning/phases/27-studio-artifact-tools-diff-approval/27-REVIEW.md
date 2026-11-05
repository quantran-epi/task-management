---
phase: 27-studio-artifact-tools-diff-approval
reviewed: 2026-11-05T12:52:00Z
depth: standard
files_reviewed: 17
files_reviewed_list:
  - src/services/ai/sdlcArtifactTools.ts
  - src/utils/markdownSections.ts
  - src/utils/lineDiff.ts
  - src/services/ai/aiTools.ts
  - src/services/ai/aiOrchestratorLoop.ts
  - src/components/ai/runtime/chatTurnRuntime.ts
  - src/components/ai/widget/ArtifactDiffApprovalCard.tsx
  - src/components/ai/AiChatWidget.tsx
  - src/components/ai/runtime/useChatTurn.ts
  - src/components/sdlc/chat/StepChatPanel.tsx
  - src/views/ProjectSdlcView.tsx
  - src/components/sdlc/SdlcWorkspace.tsx
  - src/services/wizard/stalenessDetector.ts
  - src/components/sdlc/common/SdlcStaleBanner.tsx
  - src/components/sdlc/chat/useStepChatToolbox.ts
  - src/services/ai/sdlcPromptComposer.ts
  - src/services/ai/chatTurnTools.ts
findings:
  critical: 1
  warning: 9
  info: 11
  total: 21
  necessity: 2
status: issues_found
---

# Phase 27: Code Review Report

**Reviewed:** 2026-11-05T12:52:00Z
**Depth:** standard
**Files Reviewed:** 17
**Status:** issues_found

## Narrative Findings (AI reviewer)

## Summary

Đã đọc toàn bộ 17 file trong scope, đối chiếu với baseline `0cd17c90` bằng `git diff`. Kiểm tra tĩnh: `npx tsc --noEmit` pass (theo context). Không chạy full test suite; chỉ chạy một test đơn lẻ (`preserves CRLF documents when appending a section line`, pass) để xác nhận test này **không** chứng minh được điều tên nó nói — xem CR-01.

Điểm mạnh có thật: ranh giới scope là request-local (không singleton), access được kiểm lại sau mỗi `await`, hash so sánh normalize + exact bytes, phê duyệt đi qua host adapter chứ không qua tool, và `get_artifact`/`patch_artifact_section` bị loại khỏi payload mặc định (`chatTurnTools.ts:26`). Không tìm thấy lỗ hổng injection/XSS: diff và tool output đều render dạng text node hoặc qua `renderSafeMarkdown` (escape HTML).

Vấn đề chính: (1) `applyOperation` làm mất CRLF của **toàn bộ tài liệu** trong khi card cho user duyệt một diff nhỏ — nội dung ghi khác nội dung được duyệt; (2) marker quyết định nội bộ bị đưa vào lịch sử gửi model dù summary 27-02 tuyên bố đã lọc; (3) `onResolveApproval` bị route toàn bộ qua handler artifact, nên mọi approval không kèm patch bị nuốt im lặng; (4) metadata `supplyingStep`/`stepNumber` được tạo nhưng không nơi nào đọc — CTA "Chuyển đến Bước N" cho refusal điều kiện tiên quyết không bao giờ hiện.

### CR-01: Duyệt patch làm ghi lại toàn bộ tài liệu với line-ending khác với diff đã duyệt

**File:** `src/services/ai/sdlcArtifactTools.ts:363` (append), `src/services/ai/sdlcArtifactTools.ts:365-369` (replace)

**Issue:** `applyOperation` dùng `splitLines` (split `/\r?\n/`) rồi `join('\n')`. Với tài liệu CRLF, `proposal.patchedMarkdown` trả về **LF cho mọi dòng**, trong khi `createUnifiedLineDiff` split theo cùng regex nên chỉ hiện đúng dòng thay đổi và nối output bằng `eol` của bản gốc (`lineDiff.ts:35`, `166`). Hệ quả: card cho user duyệt một diff `+1/−0`, nhưng khi Chấp thuận, `ProjectSdlcView.tsx:560` ghi `proposal.patchedMarkdown` (LF toàn bộ) vào draft và editor. Nội dung nhìn thấy không đổi, nhưng EOL của cả tài liệu đổi, `hash` đổi, `approvalState` thành `unapproved`, banner stale bật.

Bằng chứng chạy được (Node, cùng thuật toán):

```
input had CRLF: true
output has CRLF: false
"# SOLUTION\n\n## Kiến trúc\n\nDòng mới.\nNội dung."
```

Điều này trực tiếp mâu thuẫn invariant đã ghi trong 27-01 ("Unicode/CRLF preserved") và tên test `preserves CRLF documents when appending a section line` (`tests/services/ai/sdlcArtifactTools.test.ts:452`) — test chỉ assert `diffText` có `\r\n` và `patchedMarkdown` không có `\n\n\n`, nên pass dù bug tồn tại. Test này cần được siết lại cùng lúc với fix.

**Fix:** giữ EOL gốc khi splice và khi join:

```ts
function detectEol(markdown: string): string {
  return markdown.includes('\r\n') ? '\r\n' : '\n';
}

function applyOperation(markdown, slice, operation, newContent) {
  const eol = detectEol(markdown);
  const lines = markdown.split(/\r?\n/);
  const newLines = newContent.split(/\r?\n/);
  if (newLines.length > 0 && newLines[newLines.length - 1] === '') newLines.pop();
  const insertAt = operation === 'append' ? slice.coreEnd + 1 : slice.coreStart;
  const end = operation === 'append' ? insertAt : slice.coreEnd + 1;
  return [...lines.slice(0, insertAt), ...newLines, ...lines.slice(end)].join(eol);
}
```

Thêm assertion `expect(proposal.patchedMarkdown).toContain('\r\n')` vào test CRLF hiện có.

## Warnings

### WR-01: Marker quyết định nội bộ bị đưa vào lịch sử gửi model

**File:** `src/components/sdlc/chat/StepChatPanel.tsx:341-347`

**Issue:** `history` chỉ lọc `!row.artifactEvent`, rồi map mọi role khác `user` thành `assistant`. Row quyết định (`role: 'system'`, nội dung `ARTIFACT_PATCH_DECISION {"proposalId":...}\nĐã chấp thuận — ...`) do chính phase này ghi vào `chatMessages` (`ProjectSdlcView.tsx:563`, `StepChatPanel.tsx:473-476`) sẽ đi vào prompt của mọi lượt sau dưới dạng "câu trả lời trước của model". Trái với tuyên bố trong 27-02 ("filtered out of ordinary bubbles and model history"): chỉ bubble bị lọc (`:650`), lịch sử model thì không. Rủi ro: model bắt chước marker/JSON nội bộ, và ngữ cảnh bị nhiễu bởi dữ liệu không phải hội thoại.

**Fix:** lọc cùng điều kiện với bubble trước khi map:

```ts
const history = (messages ?? [])
  .filter((row) => !row.artifactEvent && !row.content.startsWith(ARTIFACT_PATCH_DECISION_PREFIX))
  // ... existing slice/map
```

### WR-02: Mọi approval bị route qua handler artifact — approval thường bị nuốt im lặng

**File:** `src/components/sdlc/chat/StepChatPanel.tsx:435-437`, `src/components/sdlc/chat/StepChatPanel.tsx:672`

**Issue:** Baseline nối `onResolveApproval={turn.resolveApproval}`; nay route tất cả qua `handleResolveArtifactApproval`, mà handler `return` ngay khi `pendingProposalRef.current` là null và **không** clear ref sau khi resolve (`:237` chỉ clear khi đổi scope/thread). Hệ quả:

- Nếu runtime park một mutation thường (card `MutationApprovalCard`, không có `patch`), bấm Chấp thuận/Từ chối không làm gì: runtime không được resolve, composer bị disable, `awaiting-approval` treo. Chỉ Stop thoát được. Đường này chạm được vì `runAiOrchestratorLoop` không kiểm tra tool có trong payload trước khi gọi `onMutationCheck` (`aiOrchestratorLoop.ts:370`), nên một tool mutation do model bịa ra vẫn park.
- Sau khi một card đã resolve, ref vẫn giữ proposal cũ; approval kế tiếp không phải artifact sẽ đi vào nhánh áp dụng proposal cũ (bị `appliedProposalIdsRef` chặn → im lặng).

**Fix:** phân nhánh theo loại approval và clear ref khi resolve xong:

```ts
onResolveApproval={(approved) => {
  if (turn.pendingApproval?.patch) void handleResolveArtifactApproval(approved);
  else turn.resolveApproval(approved);
}}
```

và trong `handleResolveArtifactApproval`, sau `turn.resolveApproval(...)` đặt `pendingProposalRef.current = null; setActiveProposalId(null);` (cho cả nhánh approve và reject).

### WR-03: Nhận diện dark mode sai — diff không đọc được ở theme tối

**File:** `src/components/ai/widget/ArtifactDiffApprovalCard.tsx:20`

**Issue:** `dark = token.colorBgBase === '#141414' || token.colorTextBase?.includes('255')`. Với antd 6 + `darkAlgorithm` mà `App.tsx:99` dùng, token thực tế là `colorBgBase = '#000'`, `colorTextBase = '#fff'` (kiểm chứng bằng `theme.darkAlgorithm(theme.defaultSeed)` trong repo). Cả hai vế đều false → dark mode dùng nền sáng `#e6ffed`/`#ffeef0` trong khi `token.colorText` là trắng mờ (rgba(255,255,255,.85)) → tương phản ~1.1:1, toàn bộ vùng diff gần như vô hình. Đây là bề mặt duy nhất để review thay đổi trước khi ghi vào tài liệu. (`DiffHunkView.tsx:26` có cùng pattern — lỗi có sẵn, nhưng file này là bản sao mới của nó.)

**Fix:** suy ra từ token thật thay vì so chuỗi hex:

```ts
const dark = token.colorBgBase === '#000' || token.colorBgBase === '#141414'
  || token.colorTextBase === '#fff' || token.colorTextBase?.includes('255');
```

Tốt hơn: dùng `theme.useToken()` + kiểm tra độ sáng `colorBgContainer` (parse hex → luminance), để không phụ thuộc seed.

### WR-04: Nền dòng diff không phủ hết chiều ngang

**File:** `src/components/ai/widget/ArtifactDiffApprovalCard.tsx:54-57`

**Issue:** mỗi dòng diff là `<span>` inline trong container `whiteSpace: 'pre'`. `backgroundColor` của inline span chỉ phủ phần text, nên dải xanh/đỏ không kéo hết dòng; khi cuộn ngang, vùng trống không có màu và ranh giới thêm/xóa trở nên khó đọc (D-01 yêu cầu "visually unambiguous"). Cũng vì inline, một dòng bị wrap sẽ tô màu rời rạc.

**Fix:** render mỗi dòng là block:

```tsx
{lines.map((line, index) => (
  <div key={index} style={{ backgroundColor: /* same logic */ 'transparent', minWidth: '100%' }}>{line}</div>
))}
```

giữ `whiteSpace: 'pre'` trên container để không wrap.

### WR-05: `supplyingStep`/`stepNumber` được tạo nhưng không nơi nào đọc — CTA điều hướng refusal không bao giờ hiện

**File:** `src/services/ai/sdlcArtifactTools.ts:197-201`, `src/components/sdlc/chat/StepChatPanel.tsx:251`

**Issue:** `prerequisiteRefusal` gắn `supplyingStep`/`stepNumber` (và `missingArtifact`) vào refusal, nhưng grep toàn `src/` cho thấy chỉ có nơi ghi, không có nơi đọc. Panel chỉ đặt `step` khi `parsed.code === 'ARTIFACT_NOT_FOUND' || 'WORKFLOW_UNAVAILABLE'`, và khi đó dùng `stepId` (bước hiện tại) — nên refusal điều kiện tiên quyết thật (`INTAKE_PL01_REQUIRED`, `SOLUTION_AND_PACK_REQUIRED_FOR_TECH_DOCS`, `ALL_DOCS_REQUIRED_FOR_CAB`) hiện alert **không có** nút "Chuyển đến Bước N", đúng phần D-10/27-05 tuyên bố đã giao. `ARTIFACT_NOT_FOUND` thì không tồn tại trong code (xem IN-04).

**Fix:** đọc metadata thay vì đoán theo code:

```ts
let parsed: { refused?: boolean; message?: string; supplyingStep?: SdlcStepId } | undefined;
...
const step = parsed?.supplyingStep;
```

### WR-06: Refusal của `get_artifact` không được surface

**File:** `src/components/sdlc/chat/StepChatPanel.tsx:247`

**Issue:** `onToolEvent` chỉ parse JSON khi `normalizeToolName(event.name) === 'patch_artifact_section'`. `get_artifact` bị từ chối (`ARTIFACT_READ_ONLY`, `ARTIFACT_REQUIRED`, `ARTIFACT_SCOPE_INVALID`, `WORKFLOW_UNAVAILABLE`) chỉ nằm trong badge công cụ đang thu gọn; user không thấy thông điệp hành động được, trái D-10 ("All refusals ... UI surfaces as a clear, actionable message").

**Fix:** mở rộng điều kiện sang cả hai tên artifact tool và dùng chung `refusalRecords`:

```ts
const name = normalizeToolName(event.name);
if (event.phase !== 'result' || (name !== 'patch_artifact_section' && name !== 'get_artifact')) return;
```

### WR-07: Nhận diện "yêu cầu chỉnh sửa nhỏ" bắt nhầm câu hỏi thành patch turn

**File:** `src/components/sdlc/chat/StepChatPanel.tsx:116`, `src/components/sdlc/chat/StepChatPanel.tsx:128-132`

**Issue:** predicate chỉ dựa trên động từ + tên tài liệu, không phân biệt câu hỏi. Chạy thử chính predicate (cùng regex, cùng normalize) cho kết quả:

```
"How to add PL07 checklist?"        patch? true
"explain how to edit the CAB"       patch? true
"what does update mean in PL07"     patch? true
```

Với TECH_DOCS, ba câu này đi thẳng vào `submit(text, kind, true)` — một patch turn, prompt `SDLC_PATCH_TOOL_POLICY` bắt model đi `get_artifact` → `patch_artifact_section` thay vì trả lời. Trước phase này cùng input chỉ hiện thông báo gợi ý, không tự đổi loại turn.

**Fix:** loại trừ dạng nghi vấn trước khi route (ví dụ `/^(how|what|why|when|where|tại sao|thế nào|làm sao|như thế nào)\b/` sau normalize, hoặc yêu cầu câu bắt đầu bằng động từ mệnh lệnh), và bổ sung test cho các câu hỏi tiếng Anh/tiếng Việt có chứa động từ sửa.

### WR-08: `SECTION_EMPTY` chặn cả `append` — không thể thêm nội dung vào mục đang trống

**File:** `src/services/ai/sdlcArtifactTools.ts:422-428`

**Issue:** guard `located.coreStart === -1` đứng trước cả hai operation. Với heading chưa có nội dung (trường hợp phổ biến nhất của "thêm nội dung vào mục X", đúng use case chính của phase), cả `append` và `replace` đều bị từ chối với copy "Hãy đề xuất nội dung cho một mục khác hoặc dùng văn bản thay thế đầy đủ" — nhưng thay thế đầy đủ cũng bị chặn bởi cùng guard.

**Fix:** chỉ áp `SECTION_EMPTY` cho `operation === 'replace'`; với `append`, chèn ngay sau heading (`insertAt = section.start + 1`).

### WR-09: `replace` trên heading cha xóa im lặng toàn bộ mục con

**File:** `src/services/ai/sdlcArtifactTools.ts:335-345`, `src/services/ai/sdlcArtifactTools.ts:365-369`

**Issue:** `coreStart/coreEnd` tính trên `lines.slice(bodyStart, section.end)`, mà `section.end` là heading kế tiếp cùng cấp hoặc nông hơn (`markdownSections.ts:70-76`). Vì vậy `replace` mục `2` xóa luôn `2.1`, `2.2`... Không có guard nào cảnh báo; model chỉ cần chọn nhầm `sectionId` cha là mất nội dung con. Card diff có hiện `-N` nên user có thể phát hiện, nhưng thông điệp refusal/copy không nói rõ rủi ro này và không có giới hạn theo mục.

**Fix:** với `replace`, từ chối khi mục có mục con (`sectionIndex.some(s => s.id.startsWith(section.id + '.'))`), trả `SECTION_HAS_CHILDREN` kèm `sectionIndex` để model chọn mục lá; hoặc giới hạn `coreEnd` ở heading con đầu tiên.

## Info

### IN-01: `staleRef` là dead code

**File:** `src/components/sdlc/chat/StepChatPanel.tsx:226-227`
**Issue:** `staleRef` được gán mỗi render nhưng không đọc ở đâu; freshness dùng state `approvalState.stale` (`:443`).
**Fix:** xóa hai dòng.

### IN-02: `PatchRecord.callId` không bao giờ được gán hoặc đọc

**File:** `src/components/sdlc/chat/StepChatPanel.tsx:32`
**Issue:** field `callId?` trong `PatchRecord` chết; record chỉ được tạo ở `:260-262` với `patch`, `scopeKey`, `decisionRow`.
**Fix:** bỏ field.

### IN-03: `MAX_DIFF_CELLS` re-export không có consumer

**File:** `src/services/ai/sdlcArtifactTools.ts:14`, `src/services/ai/sdlcArtifactTools.ts:25`
**Issue:** re-export từ `lineDiff` nhưng không file nào import từ `sdlcArtifactTools`; test import trực tiếp `../../src/utils/lineDiff`.
**Fix:** bỏ re-export (và dòng import tương ứng) để public surface phản ánh đúng nhu cầu.

### IN-04: Hai mã refusal không bao giờ được phát ra

**File:** `src/services/ai/sdlcArtifactTools.ts:34`, `src/services/ai/sdlcArtifactTools.ts:36`, `src/components/sdlc/chat/StepChatPanel.tsx:251`
**Category:** necessity
**Issue:** `UNSUPPORTED_KIND` không thể xuất hiện: `readArtifactSnapshot` từ chối kind lạ bằng `kindSchema` trước (`:267-270` → `INVALID_ARGUMENTS`), và test đang assert đúng như vậy (`tests/services/ai/sdlcArtifactTools.test.ts:432`). `ARTIFACT_NOT_FOUND` không có producer nào trong `src/` (grep chỉ thấy khai báo union và nhánh `if` ở panel). Nhánh `if` ở panel và 2 union member là code phòng trạng thái không tồn tại trong stack này; ghi chú deviation 27-01 nói `UNSUPPORTED_KIND` "actionable" cũng không còn đúng.
**Fix:** xóa `ARTIFACT_NOT_FOUND` và `UNSUPPORTED_KIND` khỏi union + nhánh panel; nếu muốn giữ thông điệp actionable cho kind lạ thì sửa copy của `INVALID_ARGUMENTS` thay vì thêm mã chết.

### IN-05: Tham số `availableToolNames` của `toolsForTurn` không được dùng trong production

**File:** `src/components/sdlc/chat/useStepChatToolbox.ts:25`, `src/components/sdlc/chat/useStepChatToolbox.ts:98-100`
**Category:** necessity
**Issue:** chỉ có một call site production (`StepChatPanel.tsx:360`) gọi `toolbox.toolsForTurn()` không tham số; panel tự lọc payload sau đó (`:364-369`). Không test nào truyền tham số. Đây là abstraction một-instantiation: nhánh `availableToolNames === undefined ? payload : payload.filter(...)` chưa từng chạy nhánh thứ hai ngoài test tương lai.
**Fix:** bỏ tham số và nhánh filter (hoặc dùng nó ở panel thay cho filter thủ công, để chỉ còn một đường lọc).

### IN-06: Nhánh approve không cập nhật `chatThreads.updatedAt`

**File:** `src/views/ProjectSdlcView.tsx:563` (so với `src/components/sdlc/chat/StepChatPanel.tsx:473-476`)
**Issue:** nhánh reject cập nhật `updatedAt` của thread trong transaction; nhánh approve chỉ `chatMessages.put`, nên thứ tự thread trong danh sách không phản ánh quyết định vừa xảy ra.
**Fix:** thêm `db.chatThreads.update(decision.threadId, { updatedAt: decision.createdAt })` trong cùng transaction (và khai báo `db.chatThreads` trong danh sách bảng của `db.transaction`).

### IN-07: Dòng nội dung bắt đầu bằng `++`/`--` bị tô màu như header

**File:** `src/components/ai/widget/ArtifactDiffApprovalCard.tsx:55-56`
**Issue:** `!line.startsWith('+++')` / `!line.startsWith('---')` loại trừ theo tiền tố; một dòng thêm có nội dung `++ x` sinh ra `+++ x` và mất màu xanh (tương tự `--- ` cho dòng xóa). Chỉ ảnh hưởng màu, không ảnh hưởng nội dung.
**Fix:** kiểm tra header theo vị trí (index 0/1 hoặc dòng khớp `/^(---|\+\+\+) /` khi index < headerCount) thay vì theo tiền tố.

### IN-08: `decisionRow.threadId` có thể là chuỗi rỗng

**File:** `src/components/sdlc/chat/StepChatPanel.tsx:261`
**Issue:** row được tạo với `threadId: threadId ?? ''`; nếu thread chưa resolve mà quyết định được ghi (approve dùng thẳng `decision.threadId`), row mồ côi sẽ không hiện ở transcript nào và `chatThreads.update('')` là no-op. Thực tế khó chạm vì `submit` chặn khi `!threadId`, nhưng đây là fail-open.
**Fix:** tạo row trong `onAwaitingApproval` chỉ khi có `threadId`, hoặc throw/không cho resolve khi `threadId` null.

### IN-09: Hai nguồn điều kiện tiên quyết khác nhau cho cùng một quyết định

**File:** `src/components/sdlc/chat/StepChatPanel.tsx:352-356` (grounding markers) vs `src/services/ai/sdlcArtifactTools.ts:163-180` (workflow state)
**Issue:** panel quyết định advertise dựa trên `stepGroundingContext.present`, service quyết định cho phép dựa trên `state.artifacts.*`. Hai nguồn có thể lệch (grounding chậm/thiếu marker nhưng state đã có nội dung, hoặc ngược lại), dẫn tới tool bị ẩn oan hoặc bị refusal ngay sau khi advertise.
**Tech:** không phải lỗi bảo mật (service vẫn là chốt), nhưng là nguồn UX không nhất quán.
**Fix:** cho panel dùng cùng `validateArtifactToolAccess` với state đã restore (hoặc rút gọn: advertise khi context + state thỏa, bỏ nhánh marker).

### IN-10: `RefusalRecord.scopeKey` lưu mà không đọc

**File:** `src/components/sdlc/chat/StepChatPanel.tsx:34`, `src/components/sdlc/chat/StepChatPanel.tsx:252`
**Issue:** field được set, không nơi nào đọc; `refusalRecords` đã được reset theo `[scopeKey, threadId]` (`:235-239`), nên field này thừa.
**Fix:** bỏ field.

### IN-11: Cache proposal phụ thuộc host phải phát `onToolCall` trước

**File:** `src/components/ai/runtime/chatTurnRuntime.ts:294-296`, `src/components/ai/runtime/chatTurnRuntime.ts:359`
**Issue:** `preparedPatches` được tra theo `currentCallId`; `currentCallId` chỉ được set trong `onToolCall` và không bao giờ reset. Một host gọi `executeToolFn` ngoài orchestrator (đúng watch item 27-01) sẽ nhận proposal cũ của call trước thay vì thực thi tool — im lặng, không lỗi. Hiện chỉ có một host dùng loop nên chưa chạm.
**Fix:** reset `currentCallId = null` sau khi tiêu thụ cache, và chỉ trả cache khi `preparedPatches.get(callId)` khớp cả `name`:

```ts
const prepared = callId ? preparedPatches.get(callId) : undefined;
if (prepared && prepared.kind) { preparedPatches.delete(callId); return Promise.resolve(JSON.stringify(prepared)); }
```

(hoặc lưu kèm `toolName` trong cache và so sánh trước khi trả).

---

_Reviewed: 2026-11-05T12:52:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
