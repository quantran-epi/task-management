---
phase: 26
fixed_at: 2026-11-03T22:20:00Z
review_path: .planning/phases/26-sdlc-prompt-grounding-tool-use-policy/26-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 26: Code Review Fix Report

**Fixed at:** 2026-11-03T22:20:00Z
**Source review:** `.planning/phases/26-sdlc-prompt-grounding-tool-use-policy/26-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 4 (CR-01, WR-01, WR-02, WR-03)
- Fixed: 4
- Skipped: 0
- Out of scope, không đụng tới: IN-01, IN-02, IN-03

Không khẳng định Phase 26 hoàn tất và không khẳng định toàn bộ suite xanh.

## Fixed Issues

### CR-01: Cổng tiền-điều-kiện artifact bị vượt bằng marker giả trong văn bản không tin cậy

**Files modified:** `src/services/sdlc/groundingBuilder.ts`, `src/components/sdlc/chat/StepChatPanel.tsx`, `src/components/sdlc/SdlcWorkspace.tsx`, `src/views/ProjectSdlcView.tsx`, `tests/services/sdlc/groundingBuilder.test.ts`, `tests/unit/sdlc/ProjectSdlcGrounding.test.tsx`
**Commit:** `3aa5fa5d`
**Applied fix:** Chọn đúng fix cấu trúc mà reviewer đề xuất, không dùng fallback escaping.
- `buildSdlcStepGroundingResult()` trả `{ text, present }`; `present: ReadonlySet<SdlcGroundingMarker>` được tích lũy trong vòng lặp marker từ cờ `present` của từng section, **trước** khi nội dung nguồn được nối vào `text`. `buildSdlcStepGrounding()` giữ nguyên chữ ký chuỗi để không phá caller cũ.
- `hasGroundingSource()` giờ chỉ nhận `SdlcGroundingResult` và chỉ đọc `present.has(marker)`. Đường quét chuỗi đã bị xóa hẳn, nên không còn cách nào để văn bản đã render chứng minh một nguồn tồn tại.
- `StepChatPanelProps.stepGroundingContext` đổi thành `SdlcGroundingResult` (mặc định `EMPTY_GROUNDING`); prompt vẫn dùng `.text`, cổng dùng nguyên object. `SdlcWorkspace` và `ProjectSdlcView` (điểm gọi `buildSdlcStepGroundingResult`) được cập nhật theo.
- Phòng thủ nhiều lớp: thêm `neutralizeMarkers()` escape mọi dòng `[MARKER]`/`[MARKER vN]` bên trong `artifactBody`, `renderMetadata`, `renderAcceptance`, `renderTechDocs`, `renderImplementationEvidence` và excerpt của `renderEvidence`, để forged line không còn xuất hiện như một section thật.

**Trạng thái:** `fixed: requires human verification` — đây là thay đổi hành vi bảo mật (guard T-26-03b) đã có regression test chứng minh, nhưng người review nên xác nhận lại cách hiểu "nguồn đã có" (`present` dựa trên sự tồn tại của artifact ref, không dựa trên nội dung khác rỗng).

**Regression test đã thêm** (`tests/services/sdlc/groundingBuilder.test.ts`):
- `never reports a marker present when source text forges a marker line` — marker giả nhúng trong `metadata.featureName` và trong body SOLUTION không thỏa `CHANGE_PACK`; `hasGroundingSource(result, 'CHANGE_PACK') === false` trong khi `SOLUTION` vẫn `true`.
- `only admits a real change pack artifact, not a forged marker in any source body` — `[PL07]` giả nằm trong body change pack không làm `PL07` thành present.

### WR-01: Guard tiền-điều-kiện của 26-03 làm fail 6 test cũ chưa được cập nhật

**Files modified:** `tests/unit/sdlc/StepChatPanelArtifactBudget.test.tsx`, `tests/unit/sdlc/StepChatPanelArtifactQueue.test.tsx`, `tests/unit/sdlc/StepChatPanelToolPolicy.test.tsx`, `tests/unit/sdlc/ProjectSdlcGrounding.test.tsx`, `tests/unit/sdlc/ProjectSdlcView.test.tsx`
**Commits:** `311afadf`, `6c0b586f`
**Applied fix:** `mount()` trong suite budget giờ truyền grounding thật của bước SOLUTION. Sau CR-01, fixture dùng API trả tập marker thật thay vì chuỗi: builder result từ `buildSdlcStepGroundingResult` (PL01 + PL02) hoặc helper `grd(text, present)` khai báo marker tường minh. Các suite artifact queue/tool policy/ProjectSdlcGrounding/ProjectSdlcView được chuyển sang cùng shape. 6 test từng fail (`forwards configured context 2000/30000`, `rejects truncated artifacts`, `hands off complete nested-fence artifact`) đã pass.

**Trạng thái:** fixed.

### WR-02: Nhánh clarify tạo ngõ chết ở bước không có artifact action và ở chế độ read-only

**Files modified:** `src/components/sdlc/chat/StepChatPanel.tsx`, `tests/unit/sdlc/StepChatPanelArtifactQueue.test.tsx`
**Commit:** `451a6fbf`
**Applied fix:** Cổng clarify chỉ bật khi có target hợp lệ và view đang ghi được: `if (!readOnly && artifactActions.length > 0 && looksLikeArtifactRequest(text))`. Ở INTAKE/CODE_GUIDE/CHANGE_PACK và khi `readOnly`, câu hỏi đi tiếp `await submit(text)` như Q&A thường thay vì bị bỏ.

**Regression test đã thêm:** `sends artifact-shaped text as Q&A at %s` cho INTAKE/CODE_GUIDE/CHANGE_PACK và `sends artifact-shaped text as Q&A instead of dropping it in read-only view`.

**Trạng thái:** fixed.

### WR-03: PL03B/PL07/CAB sinh bằng AI không được chuyển vào editor, body đọng trong transcript

**Files modified:** `src/components/sdlc/chat/StepChatPanel.tsx`, `src/components/sdlc/SdlcWorkspace.tsx`, `src/views/ProjectSdlcView.tsx`, `src/components/sdlc/steps/Step5TechDocsView.tsx`, `src/components/sdlc/steps/Step6CabView.tsx`
**Commit:** `852d0168`
**Applied fix:** Chọn hướng handoff đầy đủ (không chọn known-stub), vì hạ tầng draft cho cả ba loại đã tồn tại ở step view:
- `onArtifactDraft` đổi thành `(kind: SdlcArtifactKindForTurn, markdown: string)`. `extractSolutionDraft` thành `extractArtifactDraft(content, kind)`: SOLUTION giữ detector `# SOLUTION` + `extractSolutionMarkdown`; PL03B/PL07/CAB giữ nguyên toàn bộ body (bỏ dòng fence ngoài) vì output contract của chúng chính là tài liệu. Body vẫn bị thay bằng summary trong transcript (D-06).
- `SdlcWorkspace` chuyển tiếp prop mới; `ProjectSdlcView` thêm `handleChatArtifactDraft` route PL03B/PL07 vào `draftPl03b`/`draftPl07` và CAB vào state mới `draftCab`, reset khi đổi CR.
- `Step5TechDocsView` và `Step6CabView` đồng bộ draft đến muộn bằng `useEffect` (draft chat tới sau mount, trước đây chỉ đọc prop một lần nên editor vẫn trống).
- Không commit/approve: phê duyệt vẫn là hành động tường minh của editor (D-16/D-17).

**Trạng thái:** `fixed: requires human verification` — luồng UI end-to-end (chat → editor → duyệt) chưa có test tự động mới trong lần sửa này; cần kiểm tra thủ công ở Tauri desktop.

## Verification đã chạy

Chạy trực tiếp trong working tree chính (không worktree, theo yêu cầu), log dưới `/tmp`:

- `npx tsc --noEmit -p tsconfig.json` — sạch, log `/tmp/p26-fix-tsc-final.log`.
- `npx vitest run tests/services/sdlc/groundingBuilder.test.ts tests/unit/sdlc/StepChatPanelArtifactQueue.test.tsx tests/unit/sdlc/StepChatPanelArtifactBudget.test.tsx tests/unit/sdlc/StepChatPanelToolPolicy.test.tsx tests/unit/sdlc/ProjectSdlcGrounding.test.tsx` — 5 file, 73 pass, log `/tmp/p26-fix-final2.log`.
- `npx vitest run tests/unit/sdlc/ProjectSdlcView.test.tsx tests/unit/sdlc/Step5TechDocsView.test.tsx tests/unit/sdlc/Step6CabView.test.tsx tests/unit/sdlc/SdlcFlowIntegration.test.tsx` — 4 file, 31 pass, log `/tmp/p26-fix-adjacent.log`.

**Pre-existing failure đã thực sự tái hiện:** `tests/unit/sdlc/SdlcWorkspace.test.tsx > clamps pointer, keyboard, and reset changes to the supported bounds` fail (`expected width: 480px`, nhận `380px`). Đã tái hiện bằng cách tạm đưa `src/components/sdlc/SdlcWorkspace.tsx` về đúng bản `HEAD` rồi chạy lại — vẫn fail y hệt, rồi phục hồi bản đã sửa. Vậy đây là fail có sẵn, không do thay đổi của lần sửa này.

**Không chạy (không kết luận gì):** full suite, các drawer suite đã biết fail, `tests/ai/AIChatDrawer.test.tsx`, mọi kiểm tra PWA/GitHub Pages (theo CLAUDE.md, Tauri desktop là runtime duy nhất được hỗ trợ cho công việc hiện tại).

## Ghi chú vận hành

- Mọi file CRLF đã sửa (`Step5TechDocsView.tsx`, `Step6CabView.tsx`, `StepChatPanelArtifactBudget.test.tsx`, `StepChatPanelToolPolicy.test.tsx`, `ProjectSdlcGrounding.test.tsx`, `ProjectSdlcView.test.tsx`) giữ nguyên byte CRLF trong working tree; nội dung được stage dạng LF-normalized qua `git update-index --cacheinfo`, nên commit không mang line-ending flip. Kiểm chứng sau cùng: `git diff --ignore-cr-at-eol` của cả 12 file = 0 dòng, tức working tree không còn khác biệt ngữ nghĩa nào chưa commit.
- Không dùng `git stash`, `reset --hard`, `checkout/restore`, `clean`, `revert`, `rebase`, worktree; hai stash entry có sẵn không bị đụng.
- Không sửa và không commit `.planning/STATE.md`, `ROADMAP.md`, `REQUIREMENTS.md`, `26-REVIEW.md` hay bất kỳ `*-SUMMARY.md` nào.
- Báo cáo này không được commit (orchestrator commit).

---

_Fixed: 2026-11-03T22:20:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
