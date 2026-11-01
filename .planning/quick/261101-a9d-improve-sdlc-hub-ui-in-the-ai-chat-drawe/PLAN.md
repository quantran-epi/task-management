---
phase: quick
plan: 261101-a9d
type: execute
autonomous: true
requirements: [UI-hub-compact, UI-nested-modal-zindex, UI-preview-overflow]
files_modified:
  - src/components/ai/wizard/SdlcWorkflowHub.tsx
  - src/components/ai/AIChatDrawer.tsx
  - src/components/ai/wizard/NoteSourcePickerModal.tsx
  - src/components/ai/wizard/StepInputDocsModal.tsx
  - src/components/ai/wizard/__tests__/sdlcWorkflowHub.test.tsx
must_haves:
  truths:
    - "Trong drawer chỉ thấy card bước đang xử lý + nút Chi tiết, không thấy timeline 6 bước"
    - "Chi tiết mở modal lớn chứa nguyên hub cũ, mọi tương tác cũ vẫn chạy"
    - "Chọn nguồn trong StepInputDocsModal hiện lên trên modal cha"
    - "Preview Markdown không tràn xuống dưới footer"
  artifacts:
    - { path: src/components/ai/wizard/SdlcWorkflowHub.tsx, contains: "variant" }
    - { path: src/components/ai/wizard/NoteSourcePickerModal.tsx, contains: "gridTemplateRows" }
---

# Quick plan — SDLC hub UI trong AI chat drawer

Presentation-only. Không đổi service/coordinator/artifact/props dữ liệu.

## Task 1 — `SdlcWorkflowHub`: thêm `variant` + card gọn + modal chi tiết
File: `src/components/ai/wizard/SdlcWorkflowHub.tsx`

1. `SdlcWorkflowHubProps`: thêm `variant?: 'full' | 'drawer' | undefined` (default `'full'`).
   Đổi chữ ký component sang `(props)` rồi `const { ... } = props;` để modal lồng nhau spread được `props`.
2. Thêm `Modal` vào import antd (dòng 16 hiện chỉ có `Alert, Badge, Button, Card, Input, Popconfirm, Space, Tag, Typography, theme`).
3. Trích helper module-level `resolveStepState(flags, token)` trả `{ icon, stateLabel, stateColor }` theo đúng thứ tự ưu tiên hiện có: stale → processing → done → chưa bắt đầu. Dùng lại trong vòng `STEP_CONFIGS.map` của timeline (thay 4 nhánh `if` nội tuyến, giữ nguyên chuỗi `'Cần cập nhật' | 'Đang xử lý' | 'Đã xong' | 'Chưa bắt đầu'` và icon).
4. Ngay trước `return (<Card ...>` chính, thêm nhánh `if (variant === 'drawer')` trả về:
   - `Card size="small"` viền `hasStale ? token.colorWarning : token.colorBorderSecondary`, body padding `10px 12px`.
   - Dòng 1: `Bước {currentStepIndex + 1}/6: {currentConfig.title}` — fontSize 16, weight 600; kèm `Tag` (icon + `stateLabel` từ helper, `color` map: warning/processing/success/default) và `Tag color="blue"` cho `state.metadata.cr`.
   - Dòng 2: `currentConfig.hint` — fontSize 14, lineHeight 1.5, `color: token.colorTextSecondary`.
   - Dòng 3 (`Space wrap size={8}`): `Cập nhật lại` (chỉ khi `isCurrentProcessingStale`, `type="primary" danger`, icon `ReloadOutlined`, gọi `onRerunStep?.(currentProcessingStep)`), `Sửa PL01/PL02` (→ `onStartWorkflow`), `Cập nhật yêu cầu` khi `isIntakeCompleted`, `Cập nhật solution` khi `isSolutionCompleted` (cùng logic `onRequestX ?? setRevisionModalType` như header hiện tại), và `Chi tiết` (`type="primary"`, `aria-haspopup="dialog"`, `onClick={() => setDetailOpen(true)}`).
   - State mới `const [detailOpen, setDetailOpen] = useState(false)` (khai báo cùng cụm hook đầu component).
   - `Modal` chi tiết: `open={detailOpen}`, `onCancel={() => setDetailOpen(false)}`, `footer={null}`, `destroyOnHidden`, `title={\`SDLC: ${state.metadata.featureName} — Chi tiết quy trình\`}`, `width="min(1100px, calc(100vw - 32px))"`, `zIndex={1400}`, `styles={{ body: { maxHeight: 'calc(100vh - 200px)', overflowY: 'auto', paddingTop: 8 } }}`. Body = `<SdlcWorkflowHub {...props} variant="full" />` (spread trước, `variant` sau để ghi đè).
   - Vẫn render `RevisionImpactModal` trong nhánh drawer y như nhánh full (copy nguyên block cuối file), để luồng revision mở từ card gọn hoạt động.
5. Không đổi phần render `variant === 'full'` ngoài bước trích helper — 13 test hub hiện có phải xanh nguyên trạng.

Verify: `npx tsc --noEmit` && `npx vitest run src/components/ai/wizard/__tests__/sdlcWorkflowHub.test.tsx`
Done: drawer variant không render `#sdlc-step-list`; `Chi tiết` mở modal chứa `#sdlc-step-list` + `hub-panel-*`; full variant giữ nguyên DOM.

## Task 2 — Drawer dùng variant gọn; sửa zIndex + tràn preview + bề rộng modal
Files: `src/components/ai/AIChatDrawer.tsx`, `src/components/ai/wizard/NoteSourcePickerModal.tsx`, `src/components/ai/wizard/StepInputDocsModal.tsx`

1. `AIChatDrawer.tsx` (~dòng 3358): thêm prop `variant="drawer"` vào `<SdlcWorkflowHub ...>`. Không đổi prop nào khác.
2. `NoteSourcePickerModal.tsx` `<Modal>` (~dòng 196–204):
   - thêm `zIndex={1310}` kèm comment: parent `StepInputDocsModal` là 1300, antd mặc định 1000 làm picker chìm dưới cha.
   - `width="min(1000px, calc(100vw - 32px))"`.
3. Grid hai cột (~dòng 244–251): thêm `gridTemplateRows: 'minmax(0, 1fr)'`, giữ `gridTemplateColumns`, đổi `maxHeight` thành `'calc(100vh - 260px)'`, thêm `overflow: 'hidden'`.
4. Hai con của grid: listbox (~dòng 254) thêm `minWidth: 0, minHeight: 0`; preview (~dòng 349) thêm `minWidth: 0, minHeight: 0`, `overflow: 'hidden'`. Giữ `overflowY: 'auto'` ở container cuộn bên trong (listbox và khối Markdown `dangerouslySetInnerHTML`) — không đổi `renderSafeMarkdown`, không đổi listbox keyboard/aria.
5. `StepInputDocsModal.tsx` (~dòng 127): `width="min(1000px, calc(100vw - 32px))"`. Giữ `zIndex={1300}`.

Verify: `npx tsc --noEmit` && `npx vitest run src/components/ai/wizard/__tests__/`
Done: picker nằm trên modal cha; preview cuộn trong khung, không đẩy footer; cả hai modal rộng tối đa 1000px và không tràn viewport 32px.

## Task 3 — Test cho variant gọn + chốt hồi quy
File: `src/components/ai/wizard/__tests__/sdlcWorkflowHub.test.tsx`

Thêm 1 `it` vào `describe('SdlcWorkflowHub')`, dùng `dummyState` sẵn có:
- `render(<SdlcWorkflowHub projectScoped variant="drawer" state={dummyState} onStartWorkflow={vi.fn()} />)`.
- Assert: thấy `Bước 2/6: Giải pháp SOLUTION.md`, `Đang xử lý`, nút `Chi tiết`; `document.getElementById('sdlc-step-list')` là `null` và `queryByTestId('hub-panel-SOLUTION')` là `null`.
- `fireEvent.click(getByRole('button', { name: 'Chi tiết' }))` → `getByRole('dialog')` chứa `#sdlc-step-list`, `hub-panel-SOLUTION`, VÀ các nút `Sửa PL01/PL02`, `Cập nhật yêu cầu`.

Không sửa test cũ.

## Must not break — 13 test `SdlcWorkflowHub` hiện có (render default `variant="full"`)
`hiển thị nhắc nhở chọn project…` · `hiển thị nút khởi tạo khi chưa có state` · `hiển thị đúng 6 bước dọc…` · `D-17: chọn dòng timeline…` · `D-25: …stale…` · `D-20/D-21: …cập nhật yêu cầu và solution…` · `D-26/D-27: …chu kỳ…` · `collapses and expands the six-row timeline…` · `moves focus to the toggle before hiding the rows` · `appends the stale count to the collapsed summary` · `renders a per-step panel body…` · `hosts the PL02 export slot on the INTAKE panel…` · `renders injected panels when the drawer supplies them`.
Cộng thêm toàn bộ `StepChangePackPanel`, `StepTechDocsPanel`, `StepCabPanel`, `PL02 export placement`, `StepSolutionPanel`, `RevisionImpactModal` trong cùng file, và 7 test trong `stepInputDocsModal.test.tsx` (listbox semantics, chọn nhiều nguồn, D-19 citation closure).

## Verification (cuối)
```
npx tsc --noEmit
npx vitest run src/components/ai/wizard/__tests__/
```
Không chạy full suite.
