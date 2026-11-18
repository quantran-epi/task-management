---
phase: 27-studio-artifact-tools-diff-approval
verified: 2026-11-05T14:40:00Z
status: human_needed
score: 26/26 must-haves verified
covered_files: [".planning/phases/27-studio-artifact-tools-diff-approval/27-01-PLAN.md", ".planning/phases/27-studio-artifact-tools-diff-approval/27-01-SUMMARY.md", ".planning/phases/27-studio-artifact-tools-diff-approval/27-02-PLAN.md", ".planning/phases/27-studio-artifact-tools-diff-approval/27-02-SUMMARY.md", ".planning/phases/27-studio-artifact-tools-diff-approval/27-03-PLAN.md", ".planning/phases/27-studio-artifact-tools-diff-approval/27-03-SUMMARY.md", ".planning/phases/27-studio-artifact-tools-diff-approval/27-04-PLAN.md", ".planning/phases/27-studio-artifact-tools-diff-approval/27-04-SUMMARY.md", ".planning/phases/27-studio-artifact-tools-diff-approval/27-05-PLAN.md", ".planning/phases/27-studio-artifact-tools-diff-approval/27-05-SUMMARY.md", "src/components/ai/AiChatWidget.tsx", "src/components/ai/runtime/chatTurnRuntime.ts", "src/components/ai/runtime/useChatTurn.ts", "src/components/ai/widget/ArtifactDiffApprovalCard.tsx", "src/components/sdlc/SdlcWorkspace.tsx", "src/components/sdlc/chat/StepChatPanel.tsx", "src/components/sdlc/chat/useStepChatToolbox.ts", "src/components/sdlc/common/SdlcStaleBanner.tsx", "src/services/ai/aiOrchestratorLoop.ts", "src/services/ai/aiTools.ts", "src/services/ai/chatTurnTools.ts", "src/services/ai/sdlcArtifactTools.ts", "src/services/ai/sdlcPromptComposer.ts", "src/services/wizard/stalenessDetector.ts", "src/utils/lineDiff.ts", "src/utils/markdownSections.ts", "src/views/ProjectSdlcView.tsx", "tests/ai/ArtifactDiffApprovalCard.test.tsx", "tests/ai/artifactToolAccess.test.ts", "tests/ai/sdlcPromptComposer.test.ts", "tests/ai/useChatTurn.test.tsx", "tests/services/ai/sdlcArtifactGuards.test.ts", "tests/services/ai/sdlcArtifactTools.test.ts", "tests/services/sdlc/markdownSections.test.ts", "tests/unit/sdlc/ArtifactPatchApproval.test.tsx", "tests/unit/sdlc/ArtifactPatchIntent.test.tsx", "tests/unit/sdlc/ProjectSdlcView.test.tsx", "tests/unit/sdlc/SdlcDraftStaleness.test.tsx", "tests/unit/sdlc/StepChatPanelArtifactQueue.test.tsx", "tests/unit/sdlc/StepChatPanelToolPolicy.test.tsx", "tests/utils/lineDiff.test.ts"]
covered_digest: "v4:sha256:b7bb95856698f7bfae31188cde5eb09140106ef9809896f06058bcf47790b7a1"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Trong Tauri, mở CR đang hoạt động ở bước SOLUTION, gửi 'Thêm quy tắc kiểm tra đầu vào vào SOLUTION', xem card diff"
    expected: "Card hiện tiêu đề mục, SOLUTION · phiên bản · mục, +1 dòng thêm / −0 dòng xóa, diff nguyên văn có ---/+++/@@, vùng diff cao 240px cuộn được hai chiều, không chữ nào dưới 12px, màu xanh/đỏ đúng ở cả light và dark"
    why_human: "Bố cục, màu, ngưỡng cuộn và độ tương phản theme chỉ xác nhận được bằng mắt trong app thật"
  - test: "Sau khi bấm Chấp thuận hoặc Từ chối bằng bàn phím, quan sát tiêu điểm bàn phím"
    expected: "Tiêu điểm chuyển tới action của card kế tiếp, hoặc về composer đã bật lại; không mất ngữ cảnh"
    why_human: "Hành vi tiêu điểm thật phụ thuộc trình duyệt/webview; grep xác nhận hiện KHÔNG có lệnh .focus() nào (xem W-06)"
  - test: "Chấp thuận một patch SOLUTION rồi xem banner cảnh báo ở bước SOLUTION"
    expected: "Banner 'Bản nháp SOLUTION khác với phiên bản đã lưu', chỉ bước sở hữu bị đánh dấu, không có phiên bản mới/approvedAt mới nào được tạo"
    why_human: "Cần xác nhận trực quan banner xuất hiện đúng chỗ trong app thật sau thao tác duyệt"
  - test: "Ở màn hình xem trước/lịch sử hoặc khi thiếu PL01, yêu cầu AI đọc tài liệu"
    expected: "Hiện Alert cảnh báo đúng copy, có nút 'Chuyển đến Bước {N}: {Tên bước}' điều hướng được, không có card duyệt rỗng"
    why_human: "Luồng điều hướng và vị trí cảnh báo trong transcript cần thao tác thật"
  - test: "Chạy một lượt chat thật với model 9router: yêu cầu chỉnh sửa nhỏ"
    expected: "Model gọi get_artifact rồi patch_artifact_section, không tái tạo toàn bộ tài liệu, editor chỉ đổi sau khi bấm Chấp thuận"
    why_human: "Hành vi model thật không thể chứng minh bằng provider script"
---

# Phase 27: Studio Artifact Tools & Diff Approval Verification Report

**Phase Goal:** Studio chat có thể đọc tài liệu hiện tại và đề xuất chỉnh sửa dưới dạng unified diff mà người dùng phải chấp thuận rõ ràng trước khi editor thay đổi; chấp thuận cập nhật draft và đánh dấu stale, không commit phiên bản.
**Verified:** 2026-11-05T14:40:00Z
**Status:** human_needed
**Re-verification:** Không — xác minh lần đầu

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `get_artifact` trả kind, version, approval state, full Markdown, baseHash, sectionIndex và không ghi dữ liệu | ✓ VERIFIED | `sdlcArtifactTools.ts:262-316`; test "reads the full current draft with committed metadata and a section index without writing" (sdlcArtifactTools.test.ts:123) |
| 2 | Section ID duy nhất, theo thứ tự heading, ổn định qua nhiều lần đọc và sửa thân mục không liên quan | ✓ VERIFIED | `markdownSections.ts:30-81`; 9 test markdownSections, gồm "keeps ids stable across repeated reads and unrelated body edits" |
| 3 | Tài liệu không có heading trả `sectionIndex: []`, không lỗi | ✓ VERIFIED | test markdownSections.test.ts:8 + sdlcArtifactTools.test.ts:255 |
| 4 | Patch vào mục không tồn tại hoặc mục rỗng trả lỗi có cấu trúc, không crash/không ghi im lặng | ✓ VERIFIED | `sdlcArtifactTools.ts:326-346, 433-439` (`SECTION_NOT_FOUND`, `SECTION_EMPTY`); guard `coreStart === -1` |
| 5 | Giới hạn patch đếm theo dòng, không theo byte; tiếng Việt/emoji/combining giữ nguyên | ✓ VERIFIED | `countLogicalLines` + `PATCH_LINE_CAP=120`; test 120/121 (sdlcArtifactTools.test.ts:301); test Unicode/emoji (:343); lineDiff.test.ts:52 |
| 6 | `patch_artifact_section` trả unified diff + Markdown kết quả, chỉ chấp thuận mới đổi draft | ✓ VERIFIED | `sdlcArtifactTools.ts:450-495`; test "patches one section through registered dispatch ... without writes" (:144) |
| 7 | Mọi patch hợp lệ đều park chờ chấp thuận kể cả khi Auto-approve bật; Analysis Mode giữ huỷ read-only | ✓ VERIFIED | `chatTurnRuntime.ts:353-394` (analysis trước, nhánh patch trước autoApprove); `artifactToolAccess.test.ts:71,45` |
| 8 | Chấp thuận chỉ đổi draft của đúng tài liệu đó; từ chối không đổi draft nào | ✓ VERIFIED | `ProjectSdlcView.tsx:530-578`; test `it.each(['PL03B','PL07','CAB'])` và rollback/refuse trong ProjectSdlcView.test.tsx:621-670 |
| 9 | Chấp thuận khiến bước sở hữu stale qua báo cáo lệch hash draft chỉ-đọc | ✓ VERIFIED | `stalenessDetector.ts:114-139`; `SdlcWorkspace.tsx:77-79`; test "shows the owning stale banner after approval..." (SdlcDraftStaleness.test.tsx:131) |
| 10 | Chấp thuận không đổi workflow artifacts, version history, activeVersions, sourceHashes, approvedAt | ✓ VERIFIED | `ProjectSdlcView.tsx:550-566` chỉ ghi `db.settings` draft + `db.chatMessages`; assert `workflowStorageKey` không đổi |
| 11 | Lỗi ghi draft giữ draft cũ, card vẫn pending, cho retry | ✓ VERIFIED | rollback test ProjectSdlcView.test.tsx:624; ArtifactPatchApproval.test.tsx:139 |
| 12 | Proposal có base draft đổi thì stale, Approve disable, chỉ đề xuất lại qua chat | ✓ VERIFIED | `StepChatPanel.tsx:280-295`; ArtifactPatchApproval.test.tsx:124; ArtifactDiffApprovalCard.tsx:76-81 |
| 13 | `get_artifact` trả draft live chưa lưu; draft rỗng khác draft vắng | ✓ VERIFIED | `readArtifactSnapshot` `draft !== undefined ? draft : committed?.content`; test :245 và :231 |
| 14 | Điều hướng CR/bước/lịch sử khi proposal đang chờ không ghi sang CR khác | ✓ VERIFIED | `ProjectSdlcView.tsx:534-541` (scopeEpoch/editEpoch/identity); test "refuses a captured approval adapter after leaving its step" |
| 15 | Card hiện tiêu đề mục, kind/version, +N/−N, diff nguyên văn, nút Chấp thuận/Từ chối | ✓ VERIFIED | `ArtifactDiffApprovalCard.tsx:34-82`; ArtifactDiffApprovalCard.test.tsx:35-76 |
| 16 | Nhiều proposal chờ giải quyết lần lượt theo thứ tự call, mỗi cái theo base riêng | ✓ VERIFIED | `chatTurnRuntime.ts:266,372-393`; ArtifactPatchApproval.test.tsx:108 |
| 17 | Quyết định vẫn hiện trong transcript sau khi turn xong và sau remount; pending body chỉ ở runtime | ✓ VERIFIED | `StepChatPanel.tsx:610-613,655`; test :87 (remount, row chỉ metadata — không chứa diff/nội dung) |
| 18 | Từ chối chỉ ghi quyết định, không mở dialog lý do, không ép retry | ✓ VERIFIED | `StepChatPanel.tsx:471-487`; ArtifactPatchApproval.test.tsx:108 |
| 19 | Diff body maxHeight 240, cuộn dọc/ngang độc lập, prefix hiện rõ, không chữ dưới 12px | ✓ VERIFIED | `ArtifactDiffApprovalCard.tsx:61-63`; assert style trong card test |
| 20 | Thiếu prerequisite: `get_artifact` từ chối kèm cảnh báo hành động được và không có card rỗng; điều hướng tới bước cung cấp | ✓ VERIFIED | `StepChatPanel.tsx:245-258` (cả 2 tool, đọc `supplyingStep`), :615-626; test :203 |
| 21 | Refusal quá lớn hiện số dòng thực tế so với cap và hướng dẫn chia nhỏ tại đúng vị trí tool | ✓ VERIFIED | `sdlcArtifactTools.ts:442-478`; ArtifactPatchApproval.test.tsx:255 |
| 22 | Yêu cầu thêm/sửa nhỏ đi `get_artifact` → `patch_artifact_section` và tạo bounded diff, không tái tạo tài liệu | ✓ VERIFIED | `StepChatPanel.tsx:116-132,546`; `SDLC_PATCH_TOOL_POLICY`; ArtifactPatchIntent.test.tsx:170 (+1/−0) |
| 23 | Turn patch không trích toàn bộ tài liệu assistant vào editor | ✓ VERIFIED | `extractArtifactDraft` chỉ chạy cho intent artifact đầy đủ; ArtifactPatchIntent.test.tsx:193 |
| 24 | Yêu cầu mơ hồ hỏi chọn tài liệu thay vì mặc định PL03B/PL07 | ✓ VERIFIED | `patchClarification` `StepChatPanel.tsx:690-711`; StepChatPanelArtifactQueue.test.tsx:252,316 |
| 25 | Tool policy nêu đúng tool có trong payload; Analysis Mode ON bỏ patch và giải thích cách bật lại | ✓ VERIFIED | `sdlcPromptComposer.ts:93-110,126,134-141`; StepChatPanelToolPolicy.test.tsx:77-84 (set khớp) |
| 26 | Guard đánh giá lại quyền tin cậy và tham chiếu workflow thật cho cả hai tool: từ chối preview/historical/inactive CR, cho phép CR active | ✓ VERIFIED | `validateArtifactToolAccess` `sdlcArtifactTools.ts:250-260`; gọi ở :272,:281,:285,:301,:403,:409; sdlcArtifactGuards.test.ts:73,90,104,155,342 |

**Score:** 26/26 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/services/ai/sdlcArtifactTools.ts` | Đọc scoped, proposal patch, refusal có cấu trúc | ✓ VERIFIED | 519 dòng; export `readArtifactSnapshot`, `prepareArtifactPatch`, `executeSdlcArtifactTool`, `validateArtifactToolAccess`, `PATCH_LINE_CAP`; không có stub |
| `src/utils/markdownSections.ts` | Section index fence-aware, thứ tự | ✓ VERIFIED | `buildSectionIndex` 81 dòng, xử lý fence backtick/tilde, heading cha/con |
| `src/utils/lineDiff.ts` | Unified line diff tất định có giới hạn | ✓ VERIFIED | `createUnifiedLineDiff`, `MAX_DIFF_CELLS`, budget refusal |
| `src/components/ai/widget/ArtifactDiffApprovalCard.tsx` | Card diff + quyết định | ✓ VERIFIED | 85 dòng; render text-node, không `dangerouslySetInnerHTML` |
| `src/components/ai/AiChatWidget.tsx` | Phân biệt card patch với mutation thường | ✓ VERIFIED | `:466-476` chọn `ArtifactDiffApprovalCard` khi có `patch` |
| `src/components/sdlc/chat/StepChatPanel.tsx` | Context, pending record, approve/reject async, transcript bền | ✓ VERIFIED | `:26-45,223-295,440-488,610-626,677-686` |
| `src/views/ProjectSdlcView.tsx` | Getter live + áp dụng draft-quyết định nguyên tử | ✓ VERIFIED | `:506-578` transaction `db.settings` + `db.chatMessages` |
| `src/services/wizard/stalenessDetector.ts` | Báo cáo lệch hash draft thuần | ✓ VERIFIED | `detectDraftHashDivergence` `:114-139`, không mutate |
| `src/components/sdlc/common/SdlcStaleBanner.tsx` | Banner dùng báo cáo gộp | ✓ VERIFIED | `:31-38` hợp nhất committed + draft, committed thắng |
| `src/services/ai/sdlcPromptComposer.ts` | Policy patch thuần + few-shot | ✓ VERIFIED | `SDLC_PATCH_TOOL_POLICY` `:134-141`; `availableToolNames` `:93-104` |
| `src/services/ai/chatTurnTools.ts` | Lọc studio-only khỏi payload | ✓ VERIFIED | `:26` loại artifact tools khi không có allowlist |
| `src/services/ai/aiTools.ts` | Đăng ký 2 tool + dispatch tin cậy | ✓ VERIFIED | `:2003,2022,2063-2080`; `patch_artifact_section` nằm trong `MUTATION_TOOLS` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `aiTools.ts` | `sdlcArtifactTools.ts` | dispatch cục bộ có `artifactContext` | ✓ WIRED | `:2076-2080` gọi `executeSdlcArtifactTool(..., options?.artifactContext)` |
| `aiOrchestratorLoop.ts` | `aiTools.ts` | forward context tin cậy | ✓ WIRED | `:33-40,396-403` |
| `chatTurnRuntime.ts` | `sdlcArtifactTools.ts` | chuẩn bị trước khi chờ duyệt, trả proposal đã duyệt | ✓ WIRED | `:358-394` + cache `preparedPatches` `:295-296` |
| `useChatTurn.ts` | `chatTurnRuntime.ts` | giữ nguyên payload patch | ✓ WIRED | `:76-78` chuyển `onAwaitingApproval` nguyên vẹn |
| `AiChatWidget.tsx` | `ArtifactDiffApprovalCard.tsx` | discriminator `pendingApproval.patch` | ✓ WIRED | `:466-476`; MutationApprovalCard giữ nguyên khi không có patch |
| `StepChatPanel.tsx` | `ProjectSdlcView.tsx` | `onApplyArtifactPatch` | ✓ WIRED | `:71-72,461`; host `:530-578` |
| `ProjectSdlcView.tsx` | `SdlcWorkspace.tsx` | `artifactToolContext`, `onApplyArtifactPatch`, `draftHashes` | ✓ WIRED | `:915-917`; workspace `:43-45,165-166` |
| `SdlcWorkspace.tsx` | `StepChatPanel.tsx` | props context/application | ✓ WIRED | `:165-166` |
| `ProjectSdlcView.tsx` | `stalenessDetector.ts` | hash draft chuẩn hoá, có generation guard | ✓ WIRED | `:580-595` (scopeEpoch + draftEpoch) |
| `SdlcStaleBanner.tsx` | `stalenessDetector.ts` | gộp báo cáo draft với báo cáo committed | ✓ WIRED | `:31-38` |
| `sdlcArtifactTools.ts` | `workflowSchemas.ts` / `workflowGuards.ts` | prerequisite thật + copy guard + supplying step | ✓ WIRED | `:163-202` |
| `StepChatPanel.tsx` | `chatRepo` (qua `db.chatMessages`) | dòng quyết định role system | ✓ WIRED | `:474-481` transaction `chatMessages` + `chatThreads` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `ArtifactDiffApprovalCard` | `patch.diffText`, `addedLines`, `removedLines` | `createUnifiedLineDiff` trên draft/committed thật từ `readArtifactSnapshot` | Có — test dùng DB + coordinator thật, diff +1/−0 | ✓ FLOWING |
| `ProjectSdlcView` editor | `draftRef.current[kind]` / `incomingSolutionDraft` | `db.settings` draft + live editor state | Có — test assert giá trị draft sau duyệt | ✓ FLOWING |
| `SdlcStaleBanner` | `draftHashes` → `draftStaleness` | hash SHA-256 của draft live, so với `state.artifacts[kind].hash` | Có — test banner đổi theo hash | ✓ FLOWING |
| `StepChatPanel` refusal alert | `refusalRecords` | `onToolEvent()` parse JSON refusal từ service thật | Có — test prerequisite + quá lớn | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Service đọc/patch/diff + guard access | `npx vitest run tests/services/ai/sdlcArtifactTools.test.ts tests/services/ai/sdlcArtifactGuards.test.ts tests/services/sdlc/markdownSections.test.ts tests/utils/lineDiff.test.ts` | 4 files, 82 test pass | ✓ PASS |
| Card duyệt + intent + payload + access | `npx vitest run tests/unit/sdlc/ArtifactPatchApproval.test.tsx tests/unit/sdlc/ArtifactPatchIntent.test.tsx tests/ai/artifactToolAccess.test.ts tests/ai/ArtifactDiffApprovalCard.test.tsx` | 4 files, 45 test pass | ✓ PASS |
| Host adapter + stale + queue + policy + hook + composer | `npx vitest run tests/unit/sdlc/ProjectSdlcView.test.tsx tests/unit/sdlc/SdlcDraftStaleness.test.tsx tests/unit/sdlc/StepChatPanelArtifactQueue.test.tsx tests/unit/sdlc/StepChatPanelToolPolicy.test.tsx tests/ai/useChatTurn.test.tsx tests/ai/sdlcPromptComposer.test.ts` | 6 files, 120 test pass | ✓ PASS |
| Type check toàn repo | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Một test hành vi đơn lẻ (loại trừ marker khỏi history) | `npx vitest run tests/unit/sdlc/ArtifactPatchApproval.test.tsx -t "excludes it from model history"` | 1 pass, 9 skip | ✓ PASS (nhưng assertion yếu — xem W-01) |

### Probe Execution

Không áp dụng — phase không khai báo probe `scripts/*/tests/probe-*.sh`.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SDLC-ART-01 | 27-01, 27-03, 27-04, 27-05 | `get_artifact` trả kind/version/approval state/full Markdown/section index ổn định | ✓ SATISFIED | `sdlcArtifactTools.ts:262-316`; test :123, :215, :231, :245; empty-index :255 |
| SDLC-ART-02 | 27-01, 27-04, 27-05 | `patch_artifact_section` trả unified diff + Markdown, không ghi editor | ✓ SATISFIED | `:389-495`; test :144; prohibition "không ghi editor" có test snapshot DB không đổi |
| SDLC-ART-03 | 27-01, 27-02, 27-03 | Card diff mỗi patch, approve ghi draft, reject giữ nguyên, quyết định vào transcript | ✓ SATISFIED | Card test + ArtifactPatchApproval suite (:87, :108, :139, :156); decision row `role: system`, không chứa diff |
| SDLC-ART-04 | 27-03 | Approve cập nhật draft + đánh dấu stale; không commit version, không claim đã duyệt/lưu | ✓ SATISFIED | `stalenessDetector.ts:114`; banner test; assert workflow snapshot bất biến + `version`/`approvedAt` không đổi |
| SDLC-ART-05 | 27-02, 27-03, 27-04 | Yêu cầu "thêm nội dung vào solution" → get+patch, test hồi quy bounded diff | ✓ SATISFIED | ArtifactPatchIntent.test.tsx:170 (+1/−0, editor đổi sau duyệt); :193 chặn full-doc bypass |
| SDLC-ART-06 | 27-05 | Từ chối preview/historical, cho phép CR active, chặn khi thiếu prerequisite | ✓ SATISFIED | `validateArtifactToolAccess`; sdlcArtifactGuards.test.ts:73,90,104,155,342 |

Không có requirement nào của phase bị ORPHANED — cả 6 ID đều xuất hiện trong frontmatter ít nhất một PLAN và đều có bằng chứng code/test.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/components/sdlc/chat/StepChatPanel.tsx` | 346-352 | Dòng quyết định `role: system` bị map thành `assistant` trong `history` và không bị loại; test "excludes it from model history" chỉ kiểm tra các call xảy ra TRƯỚC khi có quyết định nên pass rỗng (W-01) | ⚠️ Warning | Model có thể bắt chước marker nội bộ `ARTIFACT_PATCH_DECISION {...}` ở lượt sau; nhiễu ngữ cảnh, không rò dữ liệu |
| `src/components/sdlc/chat/StepChatPanel.tsx` | 116-132 | Predicate patch không loại câu hỏi; "How to add PL07 checklist?" bị route thành patch turn (WR-07) | ⚠️ Warning | Câu hỏi bị trả lời bằng quy trình đề xuất thay vì giải thích; không sai dữ liệu |
| `src/services/ai/sdlcArtifactTools.ts` | 433-439 | `SECTION_EMPTY` chặn cả `append` trên mục rỗng (WR-08) | ⚠️ Warning | Use case "thêm nội dung vào mục đang trống" bị từ chối; đúng theo giả định A-EMPTY của plan nên không phải must-have fail |
| `src/services/ai/sdlcArtifactTools.ts` | 335-346, 358-381 | `replace` trên heading cha xoá luôn mục con, không guard (WR-09) | ⚠️ Warning | Model chọn nhầm `sectionId` cha có thể mất nội dung con; card hiện `-N` nên người dùng còn thấy |
| `src/components/sdlc/chat/StepChatPanel.tsx` | 440-488 | Không quản lý focus sau khi giải quyết card; grep `.focus(` = 0 hit trong 3 file surface | ⚠️ Warning | Vi phạm acceptance criteria 27-02 Task 3 ("focus moves to next pending card action, otherwise back to composer"); người dùng bàn phím mất ngữ cảnh |
| `src/components/ai/AiChatWidget.tsx` | 432 | Khi >1 tool event và danh sách thu gọn, chỉ event cuối render | ⚠️ Warning | Refusal của call trước có thể biến mất khỏi UI sau khi turn chạy tiếp |
| `src/components/sdlc/chat/StepChatPanel.tsx` | 226-227 | `staleRef` dead code (IN-01) | ℹ️ Info | Không ảnh hưởng hành vi |
| `src/components/sdlc/chat/StepChatPanel.tsx` | 32 | `PatchRecord.callId` không được gán/đọc (IN-02) | ℹ️ Info | Không ảnh hưởng hành vi |
| `src/services/ai/sdlcArtifactTools.ts` | 14,25 | `MAX_DIFF_CELLS` re-export không consumer (IN-03) | ℹ️ Info | Bề mặt public rộng hơn cần thiết |

Không có `TBD`/`FIXME`/`XXX` trong bất kỳ file nào phase 27 sửa — debt marker gate sạch.

### Human Verification Required

#### 1. Card diff hiển thị đúng trong app thật (Tauri)

**Test:** Mở CR đang hoạt động ở bước SOLUTION, gửi "Thêm quy tắc kiểm tra đầu vào vào SOLUTION".
**Expected:** Card hiện `Đề xuất chỉnh sửa: {mục}`, `SOLUTION · phiên bản N · mục X`, `+N dòng thêm` / `−N dòng xóa`, diff nguyên văn có `---`/`+++`/`@@`, vùng diff cao 240px cuộn hai chiều, không chữ dưới 12px, nền xanh/đỏ đúng ở light và dark.
**Why human:** Bố cục, màu, ngưỡng cuộn và tương phản theme chỉ xác nhận được bằng mắt.

#### 2. Tiêu điểm bàn phím sau khi giải quyết card

**Test:** Dùng Tab tới nút Chấp thuận/Từ chối, kích hoạt, quan sát tiêu điểm.
**Expected:** Tiêu điểm chuyển tới action card kế tiếp, hoặc về composer đã bật lại.
**Why human:** Hành vi focus thật phụ thuộc webview; hiện code KHÔNG có lệnh `.focus()` nào (W-06) nên nhiều khả năng sẽ trượt — cần xác nhận để quyết định sửa hay chấp nhận.

#### 3. Banner stale sau khi chấp thuận

**Test:** Chấp thuận một patch SOLUTION, xem banner ở bước SOLUTION, rồi mở bước khác.
**Expected:** Banner "Bản nháp SOLUTION khác với phiên bản đã lưu" chỉ ở bước sở hữu; không có version mới hay approvedAt mới.
**Why human:** Cần xác nhận trực quan vị trí và nội dung banner trong app thật.

#### 4. Refusal và điều hướng prerequisite

**Test:** Ở màn hình xem trước/lịch sử, hoặc xóa PL01, yêu cầu AI đọc tài liệu.
**Expected:** Alert cảnh báo đúng copy, có nút "Chuyển đến Bước {N}: {Tên bước}" hoạt động, không có card duyệt rỗng.
**Why human:** Luồng điều hướng và vị trí cảnh báo trong transcript cần thao tác thật.

#### 5. Một lượt chat thật với model 9router

**Test:** Yêu cầu chỉnh sửa nhỏ bằng model thật.
**Expected:** Model gọi `get_artifact` rồi `patch_artifact_section`, không tái tạo toàn bộ tài liệu, editor chỉ đổi sau Chấp thuận.
**Why human:** Hành vi model thật không chứng minh được bằng provider script.

### Gaps Summary

Không có gap chặn mục tiêu phase. Toàn bộ 26 must-have (5 tiêu chí ROADMAP + 21 truth từ frontmatter 5 plan, đã gộp trùng) đều đạt bằng bằng chứng code + test chạy được: 247 test trong 14 file tập trung pass, `tsc --noEmit` sạch. Critical CR-01 (CRLF) và các cảnh báo WR-02..WR-06 đã được sửa ở commit `2315f87b` và có test hồi quy.

Các cảnh báo còn lại (W-01 marker vào history model, WR-07 nhận nhầm câu hỏi, WR-08 chặn append mục rỗng, WR-09 replace xoá mục con, thiếu quản lý focus) không làm sai lệch mục tiêu phase: duyệt diff, ghi draft, đánh dấu stale, không commit version, guard read-only đều đúng. Chúng nên vào backlog cải thiện, không phải điều kiện chặn phase kế tiếp.

---

_Verified: 2026-11-05T14:40:00Z_
_Verifier: Claude (gsd-verifier)_
