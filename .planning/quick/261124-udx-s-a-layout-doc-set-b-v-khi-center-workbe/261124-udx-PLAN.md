---
phase: quick
plan: 261124-udx
type: execute
wave: 1
depends_on: []
files_modified:
  - src/workbench/DocSetLibrary.tsx
  - src/workbench/DocumentSetDetail.tsx
  - src/workbench/__tests__/DocumentSetDetailPublished.test.tsx
  - src/components/knowledge/DocumentSetForm.tsx
autonomous: true
requirements:
  - DOCSET-NARROW-CENTER-LAYOUT
must_haves:
  truths:
    - "Center island ~479px (Docs Explorer + Tool Explorer mở): rail danh sách co lại ~150-180px, detail pane >= ~280px"
    - "Ở center hẹp: Alert và Form không wrap từng chữ; toolbar vẫn dùng được; inspector ẩn, có compact selected line thay thế"
    - "Ở center rộng (>=900px): giữ nguyên winner 002/A rail 248px + inspector 260px"
    - "rowCount vẫn <=25 với 60 docs (virtual list không đổi); scoped test pass; tsc --noEmit sạch"
  artifacts:
    - path: "src/workbench/DocSetLibrary.tsx"
      provides: "Rail co linh hoạt theo container + detail pane đủ rộng khi center hẹp"
    - path: "src/workbench/DocumentSetDetail.tsx"
      provides: "Alert/Form/body không wrap từng chữ ở narrow width; inspector conditional + compact selected line"
    - path: "src/workbench/__tests__/DocumentSetDetailPublished.test.tsx"
      provides: "Regression test cho virtual rows <=25 và toolbar/alert ở narrow width"
  key_links:
    - from: "src/workbench/DocSetLibrary.tsx"
      to: "src/workbench/DocumentSetDetail.tsx"
      via: "detail pane rộng đủ để ResizeObserver/detailWidth quyết định ẩn inspector"
      pattern: "doc-set-library-detail"
    - from: "src/workbench/DocumentSetDetail.tsx"
      to: "src/components/knowledge/DocumentSetForm.tsx"
      via: "Form đã có width:100%/minWidth:0 (uncommitted, GIỮ LẠI) — không ghi đè"
      pattern: "width: '100%', minWidth: 0"
---

# 261124-udx: Sửa layout doc-set khi center workbench hẹp

## Vấn đề

Measure trong Chrome viewport 1280x800, center island 479px (Docs Explorer + Tool Explorer mở): doc-set-library 439px, rail cố định 248px, detail pane 190px, inner detail 158px (scrollWidth 165), docs 143px, Alert `.ant-alert-section` chỉ 96px → text wrap từng chữ. Root cause: rail cố định 248px + padding 16px hai bên + inspector 260px (đã ẩn bằng `detailWidth` conditional). Cần rail co theo container, giảm padding khi hẹp, bảo đảm vùng chữ Alert có min-width/word-break hợp lý.

**Ràng buộc cứng:**
- Không Worktree, không branch mới — làm trên `pre-v1.6-baseline`.
- GIỮ LẠI toàn bộ sửa đổi tay CHƯA COMMIT từ task 261124-sav: `DocumentSetDetail.tsx` (root width/minWidth/overflow, `rootRef` + `ResizeObserver`, `detailWidth` state, inspector conditional, toolbar responsive widths, compact selected line) và `DocumentSetForm.tsx` (`Form style width:'100%', minWidth:0`). KHÔNG revert, KHÔNG ghi đè; plan này chỉ bổ sung trên nền đó.
- `DocumentSetForm.tsx` chỉ có 1 dòng style (`width:'100%', minWidth:0`) từ task trước; executor PHẢI đưa vào commit của Task 2 (đã thêm vào files_modified) để không bị bỏ sót khi dọn working tree. Không chỉnh nội dung khác của file này.
- Không chỉnh `WorkbenchLayout.tsx` (panel docked là thiết kế có chủ đích, user thu bằng splitter).
- Không chạy full vitest suite (>1h). Chỉ scoped test + `npx tsc --noEmit`.

## Context

@/Users/tranducquan/Working/Personal/task-management/CLAUDE.md
@.planning/STATE.md
- Thiết kế winner: `.claude/skills/sketch-findings-task-management/references/layout-navigation.md` — rail trái + detail + inspector phải, giữ khung `DocSetLibrary.tsx`.
- Pattern ResizeObserver test: `src/workbench/__tests__/RemoteTerminal.test.tsx:47-48`.

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@src/workbench/DocSetLibrary.tsx
@src/workbench/DocumentSetDetail.tsx
@src/components/knowledge/DocumentSetForm.tsx
@src/workbench/__tests__/DocumentSetDetailPublished.test.tsx
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Rail co linh hoạt + detail pane đủ rộng trong DocSetLibrary</name>
  <files>src/workbench/DocSetLibrary.tsx</files>
  <behavior>
    - Rail list: wide container (>=900px available) giữ width 248px; narrow container (~479px) co về ~150-180px (dùng CSS clamp/flex-basis hoặc breakpoint đã có sẵn — ưu tiên inline style, KHÔNG thêm thư viện).
    - Detail pane: flex:1, minWidth:0; padding giảm từ 16px xuống ~8px khi narrow để dành ngang cho nội dung.
    - Không đổi cấu trúc workbench, không đụng WorkbenchLayout.tsx; không làm mất tên bộ/status tag trên row (chỉ ellipsis, không ẩn hoàn toàn).
  </behavior>
  <action>
    Trong `DocSetLibrary.tsx`, đo container bằng một `rootRef` + `ResizeObserver` (pattern copy từ `DocumentSetDetail.tsx` đã sửa ở working tree, KHÔNG đụng file đó) lưu `containerWidth` state; fallback `root.clientWidth` lúc mount để tránh nháy. Rail `data-testid="doc-set-library-list"`: `width: containerWidth < 640 ? 160 : 248`, `flexShrink: 0`, giữ `minWidth: 0`. Giảm padding detail pane `data-testid="doc-set-library-detail"` từ 16 xuống 8 khi `containerWidth < 640`. Giữ `Text strong` tên bộ và `Tag` số tài liệu, thêm `ellipsis` + `style={{ minWidth: 0 }}` trên `ListItemMeta` title nếu cần để không tràn. Dùng CSS thuần/inline style; KHÔNG thêm dependency. Giữ nguyên mọi hành vi select/create/openTab.
  </action>
  <verify>
    <automated>npx tsc --noEmit && npx vitest run src/workbench/__tests__/DocumentSetDetailPublished.test.tsx --bail=1</automated>
  </verify>
  <done>Rail 248px khi rộng, ~160px khi narrow; detail pane >=280px ở center 479px; padding 8px khi narrow; scoped test + tsc pass.</done>
</task>

<task type="auto">
  <name>Task 2: Chặn wrap từng chữ ở Alert/Form + regression test narrow width</name>
  <files>src/workbench/DocumentSetDetail.tsx, src/workbench/__tests__/DocumentSetDetailPublished.test.tsx, src/components/knowledge/DocumentSetForm.tsx</files>
  <action>
    Giữ NGUYÊN toàn bộ uncommitted changes hiện có trong `DocumentSetDetail.tsx` (rootRef/ResizeObserver/detailWidth, root width/minWidth/overflow, toolbar responsive widths, inspector conditional `detailWidth>=560`, compact selected line). Task 1 đã mở rộng detail pane bằng cách co rail; KHÔNG thêm `wordBreak`/`overflowX` kiểu band-aid lên root hay Alert — nếu measure Chrome vẫn thấy Alert `.ant-alert-section` < 260px sau khi rail co, mới xử lý đúng chỗ bằng CSS cho `.ant-alert-section` (tối thiểu, có comment giải thích), không đổi nội dung text hay action. Đảm bảo `VirtualizedList` height/row count không đổi (rowCount <=25 với 60 docs). Đưa vào commit Task 2 dòng style duy nhất đã có trong `src/components/knowledge/DocumentSetForm.tsx` (`Form ... style={{ width: '100%', minWidth: 0 }}`) — giữ nguyên, không sửa gì khác.

    Trong `src/workbench/__tests__/DocumentSetDetailPublished.test.tsx`: mock `ResizeObserver` theo pattern `RemoteTerminal.test.tsx:47-48` để điều khiển `detailWidth` (case narrow <560 và wide >=560). Thêm 2 case: (a) narrow width: assert toolbar inputs vẫn render (`aria-label` Tìm tài liệu trong bộ / Lọc trạng thái / Sắp xếp), inspector `aside` KHÔNG render, compact selected line render sau khi click 1 row, và `doc-row-*` <=25; (b) wide width: assert `aside` inspector render. KHÔNG dùng full suite; chạy scoped file.
  </action>
  <verify>
    <automated>npx vitest run src/workbench/__tests__/DocumentSetDetailPublished.test.tsx --bail=1 && npx tsc --noEmit</automated>
  </verify>
  <done>Alert/Form không wrap từng chữ ở narrow; inspector conditional đúng; compact selected line xuất hiện; 60 docs vẫn <=25 row; scoped test + tsc pass. Dòng style trong DocumentSetForm.tsx được giữ nguyên và nằm trong commit Task 2.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| (none) | Quick task UI layout — không có input từ bên ngoài, không có dữ liệu nhạy cảm mới; chỉ inline style React + test. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-udx-01 | T (Tampering) | doc-set inline styles | accept | Chỉ style tĩnh của chính component, không nhận giá trị từ URL/props user; không có injection path mới. |
| T-udx-SC | Tampering | npm installs | accept | Không có package install nào trong plan này. |
</threat_model>

<verification>
1. `npx tsc --noEmit` — sạch.
2. `npx vitest run src/workbench/__tests__/DocumentSetDetailPublished.test.tsx --bail=1` — pass, bao gồm 2 case narrow/wide mới; KHÔNG chạy full vitest suite.
3. Chrome thủ công: viewport 1280x800, mở Docs Explorer + Tool Explorer để center island ~479px; vào tab doc-set: rail ~160px, detail pane >=280px, Alert/Form không wrap từng chữ, toolbar dùng được. Kéo splitter ra >=900px: rail 248px + inspector 260px như winner 002/A. rowCount <=25 với 60 docs.
4. `git diff` cuối phải vẫn thấy `DocumentSetForm.tsx` (`width:'100%', minWidth:0`) và các uncommitted changes từ 261124-sav được giữ lại — KHÔNG revert.
</verification>

<success_criteria>
- Center ~479px: rail ~150-180px, detail >=280px, Alert/Form không wrap từng chữ, toolbar dùng được, inspector ẩn + compact selected line, rowCount <=25.
- Center >=900px: rail 248px + inspector 260px (winner 002/A).
- Scoped test + `npx tsc --noEmit` pass; không full suite; không worktree/branch mới; uncommitted changes từ 261124-sav còn nguyên.
</success_criteria>

<output>
Create `.planning/quick/261124-udx-s-a-layout-doc-set-b-v-khi-center-workbe/261124-udx-SUMMARY.md` when done
</output>
