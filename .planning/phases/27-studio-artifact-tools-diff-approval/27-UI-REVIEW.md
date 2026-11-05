# Phase 27 — UI Review

**Audited:** 2026-11-05
**Baseline:** `27-UI-SPEC.md` (approved design contract, Ant Design 6.6.5, no shadcn)
**Screenshots:** not captured (no dev server on localhost:3000/5173/8080 — code-only audit)
**Interaction captures:** off (`workflow.ui_interaction_capture = false`)

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | CTA/meta/diff-stat/resolved copy khớp chính xác; refusal copy lệch spec và thiếu câu "next action" vì metadata điều hướng bị bỏ. |
| 2. Visuals | 3/4 | Card có thứ bậc rõ (icon+tít, meta, chip, diff, nút); marker `+`/`−` không tô màu và nền dòng chỉ phủ span nội tuyến. |
| 3. Color | 3/4 | 100% token + palette diff khai báo; nhưng bỏ màu marker `#52c41a`/`#ff4d4f` mà spec §Color yêu cầu. |
| 4. Typography | 3/4 | Card đúng 12/14, 2 weight; banner stale còn 13px ngoài thang 12/14/16/20. |
| 5. Spacing | 3/4 | Card khớp từng giá trị (16/8/4/240/32); diff region không có gutter/padding nên ký tự prefix dính mép. |
| 6. Experience Design | 2/4 | Refusal của `get_artifact` không render alert nào; refusal của patch mất nút điều hướng; pendingProposalRef sống quá lâu. |

**Overall: 17/24**

---

## Top 3 Priority Fixes

1. **Refusal của `get_artifact` không hiện gì trên UI; refusal của `patch_artifact_section` mất nút "Chuyển đến Bước {N}"** — `StepChatPanel.tsx:247` chỉ parse refusal khi `normalizeToolName(event.name) === 'patch_artifact_section'`, và `StepChatPanel.tsx:251` chỉ map `ARTIFACT_NOT_FOUND`/`WORKFLOW_UNAVAILABLE` sang step hiện tại, bỏ hoàn toàn `supplyingStep`/`stepNumber` mà `sdlcArtifactTools.ts:196-201` đã trả về. Hệ quả: UI-27-08 và dòng zero-state "get_artifact on missing prerequisite → refusal renders as the missing-prerequisite alert copy" của UI-SPEC **không đạt**; user chỉ thấy badge công cụ (còn gắn icon check xanh) và không có đường đi tiếp. Fix: parse refusal cho **cả hai** tool, đọc `supplyingStep`/`stepNumber`/`missingArtifact` từ payload và render `Button` "Chuyển đến Bước {N}: {Tên bước}" nối `onNavigateToStep`; đổi icon badge sang trạng thái cảnh báo khi `refused === true`.

2. **`pendingProposalRef` không được xoá sau khi card được giải quyết, và mọi `onResolveApproval` đều bị route qua handler artifact** — `StepChatPanel.tsx:435-437` đọc `pendingProposalRef.current` vô điều kiện, ref chỉ bị xoá ở `StepChatPanel.tsx:237` (đổi scope/thread). `StepChatPanel.tsx:672` thay `turn.resolveApproval` bằng `handleResolveArtifactApproval` cho **tất cả** approval. Hệ quả: `MutationApprovalCard` (khi có) bấm nút không có tác dụng (`if (!patch) return`), và một approval thường đến sau một card đã reject sẽ bị ghi đè bởi proposal cũ và resolve `false`. Hiện chưa chạm được vì allowlist SDLC không quảng bá mutation tool, nhưng đây là bẫy hồi quy. Fix: `pendingProposalRef.current = null` (và `setActiveProposalId(null)`) sau khi resolve; route `onResolveApproval` về `turn.resolveApproval` khi `turn.pendingApproval?.patch` không tồn tại.

3. **Diff thiếu marker màu và nền dòng không phủ hết hàng** — `ArtifactDiffApprovalCard.tsx:55-56` chỉ đặt `backgroundColor` trên `<span>` nội tuyến, không tô `+` bằng `#52c41a` / `-` bằng `#ff4d4f` như UI-SPEC §Color ("Line prefix markers"). Trên diff dài, nền xanh/đỏ đứt quãng theo độ dài text thay vì thành dải hàng, làm khó quét mắt — đúng thứ D-01 muốn tránh. Fix: render mỗi dòng bằng `display: block` (hoặc `<div>`) với nền full-width, và tách ký tự prefix thành span màu `#52c41a`/`#ff4d4f`.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)

Khớp chính xác UI-SPEC Copywriting Contract:
- `ArtifactDiffApprovalCard.tsx:33` — `Đề xuất chỉnh sửa: {sectionTitle}`.
- `ArtifactDiffApprovalCard.tsx:38` — `{kind} · phiên bản {version} · mục {sectionId}`.
- `ArtifactDiffApprovalCard.tsx:42-43` — `+{N} dòng thêm`, `−{N} dòng xóa` (dùng U+2212 đúng).
- `ArtifactDiffApprovalCard.tsx:46` — stale warning đúng nguyên văn.
- `ArtifactDiffApprovalCard.tsx:60-61` — `Đã chấp thuận — bản nháp bước này đã được cập nhật.` / `Đã từ chối đề xuất — tài liệu không thay đổi.`
- `ArtifactDiffApprovalCard.tsx:64` — tooltip `Không thể áp dụng vì tài liệu đã thay đổi`.
- `StepChatPanel.tsx:463` — error copy đúng mẫu `Không thể cập nhật bản nháp: {detail}. Bản nháp hiện tại vẫn nguyên vẹn — ...`.
- Không có chuỗi vi phạm hard rule "approve không được nói đã lưu/đã phê duyệt/đã commit": grep `đã lưu|đã phê duyệt|đã commit` chỉ hit `stalenessDetector.ts:136` (hướng dẫn user dùng thao tác lưu hiện có, không phải claim).

Lệch (WARNING):
- `sdlcArtifactTools.ts:294` — refusal thiếu prerequisite dùng `... Vui lòng tạo tài liệu trước khi xem hoặc đề xuất chỉnh sửa.` thay vì câu spec `... Vui lòng hoàn thành bước trước để tiếp tục.` — cùng nghĩa nhưng không đúng hợp đồng copy.
- `sdlcArtifactTools.ts:434` — nhánh vượt cap theo số dòng cung cấp ghi `Đề xuất quá lớn ({N} dòng, giới hạn {cap})`, thiếu cụm `dòng thay đổi` mà spec khai báo; nhánh thứ hai (`:459`) mới đúng.
- `StepChatPanel.tsx:445` — copy "Chưa có kết nối cập nhật bản nháp trong màn hình này..." không có trong hợp đồng copy (copy mới không khai báo). Không sai nghĩa nhưng làm lệch nguồn sự thật.
- Hệ quả của Fix #1: alert thiếu prerequisite không có CTA, nên câu copy thiếu luôn "next action" mà spec bắt buộc (D-10).

### Pillar 2: Visuals (3/4)

Điểm mạnh:
- Focal point rõ: icon `DiffOutlined` màu primary + tiêu đề 14/600 ellipsis (`ArtifactDiffApprovalCard.tsx:30-35`), meta phụ 12px, chip thống kê, rồi diff, rồi action row phải-dưới — đúng DNA `MutationApprovalCard` nhưng container trung tính.
- Phân cấp bằng size/weight/color hợp lệ: 14/600 vs 12/400; secondary color cho meta; success/secondary icon cho decision.
- Nút icon-only không tồn tại trong surface mới; `Tooltip` + `aria-label` cho Approve bị disable (`:64-68`).
- Diff render thuần text node, không `dangerouslySetInnerHTML` (`:54-57`); test `ArtifactDiffApprovalCard.test.tsx:57` xác nhận `<img onerror>` không được chèn.

Vấn đề (WARNING):
- Marker `+`/`-` không được tô màu theo spec §Color; nền dòng chỉ phủ span nội tuyến → dải màu đứt quãng, không tạo "line band" như `DiffHunkView` (`DiffHunkView.tsx:193`).
- Refusal hiển thị dưới badge công cụ với `CheckCircleOutlined` màu success (`AiChatWidget.tsx:180-182`) dù kết quả là từ chối — tín hiệu thị giác ngược nghĩa.
- Trạng thái `applying` chỉ disable nút, không có nhãn/tiến trình (`ArtifactDiffApprovalCard.tsx:63,66`) → card trông "đứng hình" khi host đang ghi Dexie.
- Trạng thái khôi phục workflow là một dòng chữ thuần (`ProjectSdlcView.tsx:907-911`), không skeleton/spinner; dễ đọc thành màn hình rỗng.

### Pillar 3: Color (3/4)

- Không hex lạ ngoài palette khai báo: `ArtifactDiffApprovalCard.tsx:20-22` dùng đúng `#141414/#23452b/#e6ffed/#4d1f24/#ffeef0` và cùng biểu thức dark-detect với `DiffHunkView.tsx:26`.
- Accent tiết chế đúng danh sách: header icon primary (`:31`), focus ring primary (`:49`), nút Approve là `type="primary"` (antd token). Không có `text-primary`/`bg-primary` rải rác; grep `colorPrimary` trong 4 file surface = 5 hit, tất cả thuộc danh sách reserved.
- Destructive đúng: chỉ nút `Từ chối` dùng `danger` (`:63`), khớp `MutationApprovalCard.tsx:60`.
- Stale dùng `colorWarningBg`/`colorWarningBorder` (`:28-29`), không mượn accent — đúng ý đồ "warning treatment luôn sẵn".

Lệch (WARNING):
- Spec §Color liệt kê rõ "Line prefix markers: `+` in `#52c41a`, `-` in `#ff4d4f`" — không được implement.
- Tỉ lệ 60/30/10: surface mới gần như 100% `colorBgContainer` + diff palette; `colorFillAlter` (secondary 30%) không xuất hiện trong card, chỉ ở badge công cụ. Không sai, nhưng card trắng-trơn trên nền trắng của widget, thiếu một lớp phân tách ngoài border 1px.

### Pillar 4: Typography (3/4)

- Card: `fontSize` chỉ có 12 (9 lần) và 14 (2 lần); weight chỉ 600 ở header + mặc định 400 → đúng "2 weights".
- `AiChatWidget.tsx`: 12/14; `StepChatPanel.tsx`: chỉ 12. Không có text < 12px ở bất kỳ touch point mới nào → UI-27-10 đạt.
- Diff body 12px monospace, `lineHeight: '20px'` (`ArtifactDiffApprovalCard.tsx:51-53`) đúng declared exception.

Lệch (WARNING):
- `SdlcStaleBanner.tsx:66` dùng `fontSize: 13` cho reason — ngoài thang khai báo 12/14/16/20. Đây là giá trị carried từ Phase 26 nhưng file đã bị sửa trong Phase 27 (27-03) và banner là touch point của phase, nên hợp đồng "exactly 4 sizes" không đạt.
- Diff stat `padding: '2px 8px'` + 12px là đúng, nhưng chip thống kê và message alert đều 12px nên mật độ chữ cao; không có weight khác biệt để tách meta khỏi số liệu.

### Pillar 5: Spacing (3/4)

- Container card: `padding: 16`, `gap: 8`, `borderRadius: 8`, `margin: '8px 0 16px'` (`ArtifactDiffApprovalCard.tsx:26-29`) — khớp chính xác §Component 1.
- Diff body: `maxHeight: 240`, `overflowX/Y: auto` (`:51`) — đúng exception "new" của phase.
- Button row: `gap: 8`, `marginTop: 4` (`:62`), button `minHeight: 32` (`:63,67`) — đúng "interactive control minimum 32px".
- Widget wrapper `padding: '0 16px'` (`AiChatWidget.tsx:467`) và refusal alert `marginTop: 4` (`StepChatPanel.tsx:612`) đều trên thang 4/8/16.
- Không có arbitrary value `[...px]`/`[...rem]` trong các file phase.

Lệch (WARNING):
- Diff region không có gutter/padding trái: ký tự `+`/`-` bắt đầu sát mép container, trong khi spec cho phép gutter background và `DiffHunkView` dùng gutter 44px + marker 20px. Thiếu lớp đệm này làm diff khó đọc và lệch nhịp với phần còn lại của app.
- `SdlcWorkspace.tsx:107` `padding: 20` không thuộc thang (4/8/16/24/32) — giá trị có sẵn, nhưng file nằm trong phạm vi sửa của 27-03 và đây là dịp chuẩn hoá.

### Pillar 6: Experience Design (2/4)

Đã phủ tốt:
- Pending: turn park `awaiting-approval`, không spinner (`AiChatWidget.tsx:115-136`), composer disable (`:537`), tag `Chờ phê duyệt` (`:341-345`).
- Stale: diff cũ giữ nguyên, warning strip, chỉ Approve disable (`ArtifactDiffApprovalCard.tsx:45,66`); freshness dùng generation token (`StepChatPanel.tsx:276-290`).
- Error: host write fail giữ card pending + copy retry, xoá khỏi `appliedProposalIdsRef` (`StepChatPanel.tsx:460-464`); transaction rollback có test.
- Resolved: decision rows bền qua remount, lọc khỏi bubble và history (`StepChatPanel.tsx:605-608,650`).
- Empty/zero heading: service trả index rỗng, không lỗi; oversized refusal render inline tại tool position (`ArtifactDiffApprovalCard` không mount — test `ArtifactPatchApproval.test.tsx:182`).

Khoảng trống (BLOCKER / WARNING):
- **BLOCKER (UI-27-08, zero-state row):** `StepChatPanel.tsx:247` bỏ qua mọi refusal của `get_artifact`; người dùng không thấy thông điệp "Chỉ được phép chỉnh sửa ở phiên bản đang hoạt động..." hay "Chưa đủ điều kiện: Thiếu ..." khi model gọi `get_artifact` ở màn hình lịch sử/thiếu prerequisite.
- **BLOCKER (UI-27-08 next action):** refusal alert của patch không có nút `Chuyển đến Bước {N}: {Tên bước}` vì `supplyingStep` không được parse (`StepChatPanel.tsx:248-252`). Khác với đường pre-flight (`:508, :547`) có nút. Người dùng bị chặn mà không có đường đi.
- **WARNING:** khi có >1 tool event và danh sách đang thu gọn, chỉ event cuối được render (`AiChatWidget.tsx:432`), nên refusal của một call trước đó biến mất sau khi turn chạy tiếp.
- **WARNING:** không có quản lý focus sau khi resolve. Plan 27-02 Task 3 yêu cầu "On resolving a card, focus moves to next pending card action, otherwise back to enabled composer"; grep `.focus(` trong 3 file surface = 0 hit. Người dùng bàn phím mất ngữ cảnh sau khi bấm.
- **WARNING:** `applying` không có phản hồi tiến trình; nếu Dexie chậm, người dùng không biết click đã được nhận.
- **WARNING (latent):** `pendingProposalRef` và `activeProposalId` không được reset sau resolve (`StepChatPanel.tsx:458-459, 478-479`) — xem Fix #2.
- **WARNING:** refusals chỉ được xoá khi đổi scope/thread hoặc khi submit mới (`setRefusalRecords([])` ở `:332`); spec nói "dismissed on step change or thread clear" — hành vi rộng hơn spec nhưng không gây hại, chỉ cần ghi nhận.
- **WARNING:** trạng thái resolved trên card gần như không bao giờ thấy trong production vì `handleResolveArtifactApproval` gọi `turn.resolveApproval` ngay, khiến `pendingApproval` null và card unmount; bản ghi quyết định chỉ còn ở `transcriptExtensions`. UI-27-09 vẫn đạt qua transcript, nhưng nhánh "card renders the decision record line" trong §Component 1 là dead code trên thực tế.

---

## Files Audited

- `src/components/ai/widget/ArtifactDiffApprovalCard.tsx` (mới)
- `src/components/ai/AiChatWidget.tsx`
- `src/components/ai/runtime/useChatTurn.ts`
- `src/components/ai/runtime/chatTurnRuntime.ts` (đối chiếu parking)
- `src/components/ai/widget/MutationApprovalCard.tsx` (baseline pattern)
- `src/components/sdlc/chat/StepChatPanel.tsx`
- `src/components/sdlc/chat/useStepChatToolbox.ts`
- `src/components/sdlc/common/SdlcStaleBanner.tsx`
- `src/components/sdlc/SdlcWorkspace.tsx`
- `src/views/ProjectSdlcView.tsx`
- `src/services/ai/sdlcArtifactTools.ts` (refusal codes/copy)
- `src/services/ai/chatTurnTools.ts` (quảng bá tool)
- `src/services/ai/sdlcPromptComposer.ts` (allowlist + policy copy)
- `src/services/wizard/stalenessDetector.ts`
- `src/services/wizard/workflowGuards.ts`
- `src/components/agents/DiffHunkView.tsx` (palette baseline)
- `tests/ai/ArtifactDiffApprovalCard.test.tsx`, `tests/unit/sdlc/ArtifactPatchApproval.test.tsx`, `tests/unit/sdlc/StepChatPanelArtifactQueue.test.tsx` (đối chiếu coverage)

Registry audit: không chạy — không có `components.json`, UI-SPEC không khai báo registry bên thứ ba.
