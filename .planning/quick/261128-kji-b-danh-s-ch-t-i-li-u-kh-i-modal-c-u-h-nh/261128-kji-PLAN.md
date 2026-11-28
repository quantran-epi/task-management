---
phase: quick
plan: 261128-kji
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/knowledge/DocumentSetForm.tsx
  - src/workbench/DocumentSetDetail.tsx
  - src/workbench/__tests__/DocumentSetDetailPublished.test.tsx
autonomous: true
requirements:
  - DOCSET-MODAL-DOC-LIST-MOVE
must_haves:
  truths:
    - "Modal 'Cấu hình bộ tài liệu' chỉ còn cấu hình ở mức bộ (tên, preset/scope, alias, quan hệ, isBase) — không còn danh sách tài liệu hay picker tài liệu"
    - "Mọi thao tác trên tài liệu (thêm, xoá khỏi bộ, đổi tên, mở, sắp xếp lên/xuống) nằm ở màn hình DocumentSetDetail"
    - "Lưu cấu hình bộ không làm mất hay ghi đè documentIds hiện có"
    - "Thêm tài liệu vào bộ và đưa lên/xuống cập nhật IndexedDB, presentationRevision tăng khi sắp xếp, không đụng published hash/state"
    - "Scoped test + npx tsc --noEmit pass; rowCount vẫn <=25 với 60 docs"
  artifacts:
    - path: "src/components/knowledge/DocumentSetForm.tsx"
      provides: "Form cấu hình bộ không chứa membership list/picker; DocumentSetFormValue.documentIds chỉ emit lúc tạo"
    - path: "src/workbench/DocumentSetDetail.tsx"
      provides: "Picker thêm tài liệu + reorder lên/xuống, giữ rename/remove/copy/open hiện có"
    - path: "src/workbench/__tests__/DocumentSetDetailPublished.test.tsx"
      provides: "Regression test ranh giới form/detail và thao tác tài liệu ở detail"
  key_links:
    - from: "src/components/knowledge/DocumentSetForm.tsx"
      to: "src/db/repositories/documentSetRepo.ts"
      via: "updateDocumentSet chỉ nhận documentIds khi tạo; lúc edit payload không chứa documentIds"
      pattern: "documentIds"
    - from: "src/workbench/DocumentSetDetail.tsx"
      to: "src/db/repositories/documentSetRepo.ts"
      via: "updateDocumentSet(append ids) và updatePresentationOrder(swap ids)"
      pattern: "update(PresentationOrder|DocumentSet)"
    - from: "src/workbench/DocumentSetDetail.tsx"
      to: "src/components/knowledge/DocumentSetForm.tsx"
      via: "Modal config render form dạng function component, không còn ref/openPicker"
      pattern: "DocumentSetForm"
---

# 261128-kji: Bỏ danh sách tài liệu khỏi modal cấu hình bộ

## Vấn đề

`DocumentSetForm.tsx` hiện vừa là form cấu hình bộ, vừa chứa danh sách thành viên (kéo lên/xuống, gỡ) và một modal picker "Chọn tài liệu" điều khiển qua `DocumentSetFormHandle.openPicker()`. `DocumentSetDetail.tsx` đã có sẵn filter/sort, row menu (Sửa nhanh / Đổi tên / Sao chép đường dẫn / Xoá khỏi bộ) và inspector nhưng còn thiếu thêm tài liệu trực tiếp và sắp xếp. Ranh giới cần rõ: modal = cấu hình bộ; detail = quản lý tài liệu.

**Ràng buộc cứng:**
- KHÔNG đụng `ChatStandaloneSplash.tsx`, `chat-standalone-splash.css`, `AppIntelliJ.tsx` — thuộc task 261128-kh6, nằm ngoài scope này.
- Làm trên `pre-v1.6-baseline`; không worktree, không branch mới.
- Giữ nguyên dòng `style={{ width: '100%', minWidth: 0 }}` trên `Form` trong `DocumentSetForm.tsx` (từ 261124-udx) — không revert.
- Không chạy full vitest suite (>1h); chỉ scoped test + `npx tsc --noEmit`.
- Không thêm dependency; dùng Ant Design + `VirtualizedList` có sẵn.

## Context

@/Users/tranducquan/Working/Personal/task-management/CLAUDE.md
@.planning/STATE.md
- `updatePresentationOrder(setId, orderedDocumentIds, db)` đã tồn tại trong `src/db/repositories/documentSetRepo.ts:384` — tăng `presentationRevision`, KHÔNG đụng hash hay trạng thái xuất bản. Dùng lại, không viết repository mới.
- CSS `.doc-set-pick-row`, `.doc-set-inspector__actions`, `.doc-row-action` trong `src/styles/workbench-tokens.css` đã có; tái dùng class, không thêm CSS mới trừ khi thật sự cần.

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@src/components/knowledge/DocumentSetForm.tsx
@src/workbench/DocumentSetDetail.tsx
@src/db/repositories/documentSetRepo.ts
@src/workbench/__tests__/DocumentSetDetailPublished.test.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: DocumentSetForm chỉ giữ cấu hình bộ, bỏ membership list và picker</name>
  <files>src/components/knowledge/DocumentSetForm.tsx</files>
  <action>
    Trong `src/components/knowledge/DocumentSetForm.tsx`, xóa hoàn toàn section 6 "Tài liệu thành viên" (VirtualizedList `members` + hàm `move()` + 3 nút Đưa lên/Đưa xuống/Gỡ) và section 7 (Modal "Chọn tài liệu" + `SearchInput` + `flatDocs` + checkbox chọn). Xóa luôn state/import chỉ phục vụ hai section đó: `pickerOpen`, `draftSelection`, `searchDocQuery`, `flatDocs`, `noteById`, `documents`, `openPicker`, `useImperativeHandle`, `DocumentSetFormHandle`, `VirtualizedList`, `SearchInput`, `ListItem`, `Modal`, `Tooltip`, `DeleteOutlined`, `UpOutlined`, `DownOutlined`, `PlusOutlined`, `foldForSearch`, `searchIncludes`. Chuyển component từ `forwardRef` sang function component thuần (`export function DocumentSetForm({...}: DocumentSetFormProps)`); bỏ prop `ref` ở cả hai callsite trong Task 2.

    Giữ nguyên `snapshotFolderMembers` export, preset/scope fields, Collapse nâng cao, tên bộ, và dòng `Form ... style={{ width: '100%', minWidth: 0 }}`. Phần "Khởi tạo từ" chỉ giữ hai radio "Bộ trống" và "Từ thư mục hiện tại"; bỏ radio "Chọn tài liệu" (manual) vì picker chuyển sang detail. Thu type `mode` thành `'empty' | 'folder'`; bỏ nhánh `manual` trong `chooseMode`.

    Đổi `DocumentSetFormValue.documentIds` thành optional (`documentIds?: string[] | undefined`). Trong `save()`, chỉ đưa `documentIds` vào payload khi `!initialSet`: `mode === 'folder'` thì dùng `snapshotFolderMembers(notes, currentFolderId)`, ngược lại `[]`. Khi edit (`initialSet` có sẵn) KHÔNG emit `documentIds` để `updateDocumentSet` không ghi đè membership — đây là điểm dữ liệu dễ mất nhất. Giữ các validation hiện có với preset.
  </action>
  <verify>
    <automated>npx tsc --noEmit && ! grep -q 'Tài liệu thành viên' src/components/knowledge/DocumentSetForm.tsx && ! grep -q 'Chọn tài liệu' src/components/knowledge/DocumentSetForm.tsx && ! grep -q 'openPicker' src/components/knowledge/DocumentSetForm.tsx</automated>
  </verify>
  <done>Form không còn danh sách tài liệu, picker hay handle `openPicker`; edit không emit `documentIds`; creation vẫn emit snapshot folder/[]; `npx tsc --noEmit` sạch.</done>
</task>

<task type="auto">
  <name>Task 2: DocumentSetDetail làm chủ thêm/xoá/sắp xếp tài liệu</name>
  <files>src/workbench/DocumentSetDetail.tsx</files>
  <action>
    Trong `src/workbench/DocumentSetDetail.tsx`: bỏ import `DocumentSetFormHandle`, bỏ `formRef`, bỏ `pendingPicker` và useEffect gọi `formRef.current?.openPicker()`. Nút "Thêm tài liệu" trong `Empty` (rows.length === 0) đổi sang mở picker modal do chính Detail sở hữu. Thêm một nút "Thêm tài liệu" trong `.doc-set-docs-toolbar` với `data-testid="doc-set-add-documents"` để bộ đã có tài liệu vẫn thêm được.

    Picker modal của Detail: tiêu đề "Chọn tài liệu", `SearchInput aria-label="Tìm tài liệu để thêm"`, `VirtualizedList` dùng class `.doc-set-pick-row` và `aria-label="Danh sách tài liệu để chọn"` để tái dùng CSS/tests hiện có. Nguồn items là `allNotes` lọc `!deletedAt && type !== 'folder' && type !== 'diagram'` và chưa nằm trong `set.documentIds`; lọc theo query bằng `foldForSearch`/`searchIncludes` (đã import sẵn). `onOk`: append các id đã chọn vào CUỐI `set.documentIds` rồi gọi `updateDocumentSet(setId, { documentIds: nextIds }, db)`; đóng modal, xóa selection/search.

    Reorder: thêm `updatePresentationOrder` vào import từ `documentSetRepo`. Thêm hai key `up` / `down` (nhãn "Đưa lên" / "Đưa xuống") vào `menuItems` của `DocumentRowView` và gọi qua `DocumentRowActions` mới (`onMoveUp`, `onMoveDown`). Thêm hai nút tương ứng trong `.doc-set-inspector__actions`. Handler `handleMove(row, offset)` swap trong mảng `set.documentIds` GỐC (không phải `filteredRows` đã sort/filter), bỏ qua nếu ra ngoài biên, rồi `void updatePresentationOrder(setId, next, db)`; disable nút/menu khi phần tử đầu/cuối. Giữ nguyên rename/remove/copy/open, filter/sort, virtual list và mọi logic graph/publish. Modal config vẫn render `DocumentSetForm` nhưng KHÔNG truyền `ref`.
  </action>
  <verify>
    <automated>npx tsc --noEmit && grep -q 'updatePresentationOrder' src/workbench/DocumentSetDetail.tsx && grep -q 'doc-set-add-documents' src/workbench/DocumentSetDetail.tsx && ! grep -q 'formRef' src/workbench/DocumentSetDetail.tsx</automated>
  </verify>
  <done>Detail có picker thêm tài liệu, reorder lên/xuống qua `updatePresentationOrder`, không còn `formRef`/`openPicker`; rename/remove/copy/open và virtual list giữ nguyên.</done>
</task>

<task type="auto">
  <name>Task 3: Đổi scoped test theo ranh giới form/detail mới</name>
  <files>src/workbench/__tests__/DocumentSetDetailPublished.test.tsx</files>
  <action>
    Trong `src/workbench/__tests__/DocumentSetDetailPublished.test.tsx`, thay test cũ 'doc-set form membership/picker giữ DOM bounded' bằng hai test: (1) render `DocumentSetForm` với `initialSet`, assert KHÔNG có text "Tài liệu thành viên", KHÔNG có nút "Thêm tài liệu", KHÔNG có `[data-testid^="member-"]`, KHÔNG có `Danh sách tài liệu để chọn`; vẫn có "Phạm vi bộ tài liệu" và input tên bộ; spy `onSave`, bấm "Lưu thay đổi" rồi assert payload KHÔNG có khóa `documentIds`. (2) render form KHÔNG có `initialSet`, spy `onSave`, bấm "Lưu thay đổi" rồi assert payload có `documentIds` (mảng rỗng khi mặc định). Giữ nguyên assertion CSS `.doc-set-pick-row` — class vẫn được picker của Detail tái dùng.

    Thêm test trong describe inspector: render `DocumentSetDetail` với DB seeded, bấm `doc-set-add-documents`, trong dialog chọn 1 note chưa thuộc bộ rồi xác nhận; `await waitFor` assert `db.documentSets.get(set.id)` chứa id mới. Sau đó mở row menu của phần tử cuối, bấm "Đưa lên", assert thứ tự `documentIds` đổi và `presentationRevision` tăng đúng 1; đồng thời assert `db.publishedDocuments` không đổi. Dùng `seedLayoutSet` có sẵn; KHÔNG chạy full suite.
  </action>
  <verify>
    <automated>npx vitest run src/workbench/__tests__/DocumentSetDetailPublished.test.tsx --bail=1 && npx tsc --noEmit</automated>
  </verify>
  <done>Test cũ về membership/picker trong form đã bị thay; test mới chứng minh form sạch, detail thêm/reorder đúng DB, scoped test + tsc pass; rowCount vẫn <=25 với 60 docs.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| picker input → documentIds | Tiêu đề/tag tài liệu từ IndexedDB dùng để lọc; chỉ id được ghi vào `set.documentIds`. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-kji-01 | T (Tampering) | picker thêm tài liệu | mitigate | Chỉ nhận `note.id` từ `allNotes` đã lọc `!deletedAt`; validate bằng `DocumentSetSchema.parse` trong `updateDocumentSet`; KHÔNG nhận id từ URLhay props user. |
| T-kji-02 | I (Information disclosure) | modal cấu hình | accept | Không còn render nội dung/body tài liệu trong form; modal chỉ chứa metadata bộ. |
| T-kji-SC | Tampering | npm installs | accept | Không có package install nào trong plan này. |
</threat_model>

<verification>
1. `npx tsc --noEmit` — sạch.
2. `npx vitest run src/workbench/__tests__/DocumentSetDetailPublished.test.tsx --bail=1` — pass, gồm test form sạch và test thêm/reorder ở detail. KHÔNG chạy full vitest suite.
3. Chrome: mở tab Bộ tài liệu → "Cấu hình": chỉ thấy preset/scope/alias/tên, KHÔNG thấy danh sách hay nút "Thêm tài liệu" trong modal. Đóng modal: toolbar có "Thêm tài liệu", row menu/inspector có "Đưa lên"/"Đưa xuống", "Đổi tên", "Xoá khỏi bộ". Thêm 1 tài liệu, đưa lên/xuống, reload — thứ tự giữ nguyên; lưu cấu hình bộ không làm mất tài liệu.
4. `git diff --stat` chỉ liệt kê 3 file trong `files_modified`; `ChatStandaloneSplash.tsx`, `chat-standalone-splash.css`, `AppIntelliJ.tsx` không đổi.
</verification>

<success_criteria>
- Modal config không còn danh sách tài liệu, picker hay `openPicker`; edit không ghi đè `documentIds`.
- Detail là nơi duy nhất thao tác tài liệu: thêm, xoá, đổi tên, mở, lên/xuống; reorder đi qua `updatePresentationOrder`, không đụng hash/trạng thái xuất bản.
- Scoped test + tsc pass; 60 docs vẫn <=25 row; không đụng 3 file của task 261128-kh6.
</success_criteria>

<output>
Create `.planning/quick/261128-kji-b-danh-s-ch-t-i-li-u-kh-i-modal-c-u-h-nh/261128-kji-SUMMARY.md` when done
</output>
