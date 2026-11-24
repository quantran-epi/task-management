---
phase: quick
plan: 261124-sav
type: execute
wave: 1
depends_on: []
files_modified:
  - src/workbench/DocSetLibrary.tsx
  - src/workbench/DocumentSetDetail.tsx
  - src/components/knowledge/DocumentSetForm.tsx
  - src/db/repositories/documentSetRepo.ts
  - src/workbench/__tests__/DocumentSetDetailPublished.test.tsx
  - src/workbench/__tests__/DocsWorkspace.test.tsx
  - tests/knowledge/documentSetHashes.test.ts
autonomous: true
requirements:
  - DOCSET-WORKBENCH-A
  - DOCSET-VIRTUAL-A
  - DOCSET-HEAVY-A
  - DOCSET-HASH-CACHE
must_haves:
  truths:
    - "Mở tab bộ tài liệu thấy rail trái 248px + vùng danh sách giữa + inspector phải 260px; không chuyển sang tab/rail ngang"
    - "Bộ có nhiều tài liệu vẫn cuộn mượt: toolbar lọc dính đầu, danh sách virtual, số row trong DOM không tăng theo số docs"
    - "Mỗi row chỉ hiện số thứ tự, tên, đường dẫn thư mục, kích thước, ngày, trạng thái — không render markdown/snippet/Note.body"
    - "Chọn một doc thì inspector hiện đúng doc đó; trạng thái xuất bản (Chưa xuất bản / Đã đồng bộ / Có thay đổi cục bộ / Đang xuất bản) vẫn đúng như trước"
    - "Hash nội dung chỉ tính cho các doc thuộc bộ đang xem và cache theo (id, updatedAt); đổi một doc không hash lại toàn bộ notes"
    - "Picker 'Chọn tài liệu' là flat searchable virtual list; không còn Tree defaultExpandAll; membership list trong form cũng virtualize"
    - "Progress/lỗi/empty nằm inline trong detail, có action có thật; danh sách vẫn click được; không thêm dependency; chạy local/Tauri không cần server"
  artifacts:
    - path: "src/workbench/DocSetLibrary.tsx"
      provides: "Shell rail bộ tài liệu cố định 248px, truyền setId vào detail"
    - path: "src/workbench/DocumentSetDetail.tsx"
      provides: "Header + stats + toolbar lọc dính + danh sách virtual + inspector 260px + trạng thái inline"
    - path: "src/components/knowledge/DocumentSetForm.tsx"
      provides: "Picker flat virtual và membership list virtual, không Tree; forwardRef expose openPicker()"
    - path: "src/db/repositories/documentSetRepo.ts"
      provides: "Hàm computeNoteHashesCached chỉ hash note được truyền vào, cache theo (id, updatedAt)"
    - path: "src/workbench/__tests__/DocsWorkspace.test.tsx"
      provides: "WR workspace test cập nhật từ table/pagination sang doc-row-* + filtered count"
    - path: "tests/knowledge/documentSetHashes.test.ts"
      provides: "Test cache hit / invalidate khi đổi updatedAt / không cache global giữa DB"
  key_links:
    - from: "src/workbench/DocSetLibrary.tsx"
      to: "src/workbench/DocumentSetDetail.tsx"
      via: "selectedId truyền qua prop setId; rail 248px, detail giữ data-testid='doc-set-library-detail'"
      pattern: "DocumentSetDetail setId="
    - from: "src/workbench/DocumentSetDetail.tsx"
      to: "src/db/repositories/documentSetRepo.ts"
      via: "noteHashes lấy từ computeNoteHashesCached(documents, hashCache.current), KHÔNG phải formNotes/allNotes.toArray()"
      pattern: "computeNoteHashesCached"
    - from: "src/workbench/DocumentSetDetail.tsx"
      to: "src/workbench/virtual/VirtualizedList.tsx"
      via: "filteredRows -> VirtualizedList(estimateSize=38, height=440, overscan=4); row là React.memo, không nhận body"
      pattern: "VirtualizedList.*filteredRows"
    - from: "src/workbench/DocumentSetDetail.tsx"
      to: "publishedDocuments.publishedContentHash"
      via: "publishView so sánh noteHashes[documentId] như cũ — giữ nguyên logic xuất bản"
      pattern: "noteHashes\\[documentId\\]"
    - from: "src/workbench/DocumentSetDetail.tsx"
      to: "src/components/knowledge/DocumentSetForm.tsx"
      via: "formRef (useRef<DocumentSetFormHandle>) truyền qua ref; CTA empty-state gọi formRef.current?.openPicker()"
      pattern: "formRef\\.current\\?\\.openPicker\\(\\)"
    - from: "src/components/knowledge/DocumentSetForm.tsx"
      to: "src/workbench/virtual/VirtualizedList.tsx"
      via: "picker (flatDocs) và membership (members) dùng chung component virtual có sẵn"
      pattern: "VirtualizedList"
    - from: "src/components/knowledge/DocumentSetForm.tsx"
      to: "DocumentSetFormValue.documentIds"
      via: "save() vẫn gửi members theo thứ tự hiện tại, UUID không đổi"
      pattern: "documentIds: members"
---

<objective>
Refactor màn hình "Bộ tài liệu" theo đúng 3 sketch winner đã duyệt: 002/A (rail 248px cố định + detail + inspector 260px), 003/A (filter dính + virtual scroll), 004/A (progress/error/empty inline + picker flat). Đồng thời xử lý lag: danh sách membership và picker virtualize, bỏ `Tree defaultExpandAll`, tách hash khỏi `notes.toArray()` và cache theo `(id, updatedAt)`.

Purpose: bộ có hàng chục nghìn doc vẫn quét/tìm/chọn được trong workbench Tauri local; render không phình theo số doc và publish state không đổi.

Output: 4 file nguồn + 1 file test mới + 2 file test hiện có cập nhật. Không thêm dependency, không đụng PWA/GitHub Pages, không đụng logic xuất bản/đồ thị, không commit, không sửa ROADMAP.md.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.claude/skills/sketch-findings-task-management/SKILL.md
@.claude/skills/sketch-findings-task-management/references/layout-navigation.md
@.claude/skills/sketch-findings-task-management/references/virtual-list-search.md
@.claude/skills/sketch-findings-task-management/references/states-pickers.md
@src/workbench/DocSetLibrary.tsx
@src/workbench/DocumentSetDetail.tsx
@src/components/knowledge/DocumentSetForm.tsx
@src/workbench/virtual/VirtualizedList.tsx
@src/workbench/__tests__/DocsWorkspace.test.tsx
@src/db/repositories/documentSetRepo.ts
@tests/knowledge/DocumentSetPublishFlow.test.tsx
@tests/knowledge/documentSetForm.test.tsx
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Tách hash khỏi full note scan, cache theo (id, updatedAt)</name>
  <files>src/db/repositories/documentSetRepo.ts, src/workbench/DocumentSetDetail.tsx, tests/knowledge/documentSetHashes.test.ts</files>
  <behavior>
    - Hai doc truyền vào -> record có đúng 2 hash; gọi lại với cùng notes -> cache hit, Map không thêm entry, hash không đổi.
    - Đổi body + updatedAt của 1 doc -> hash doc đó đổi, doc kia giữ nguyên, Map vẫn 2 entry.
    - Cache là tham số truyền vào (Map do caller giữ), KHÔNG phải module-global: hai Map khác nhau cùng id/body cho kết quả độc lập.
    - DocumentSetDetail chỉ gọi helper với `documents` (bulkGet theo set.documentIds), không với `formNotes`/`allNotes.toArray()`; publishView vẫn trả 'Đã đồng bộ' khi hash khớp và 'Có thay đổi cục bộ' khi lệch.
  </behavior>
  <action>
    Viết test trước trong `tests/knowledge/documentSetHashes.test.ts` (dùng `computeSha256`/`normalizeMarkdownForHash` để tính hash kỳ vọng; không cần fake-indexeddb vì helper thuần), chạy để đỏ, rồi implement.

    Trong `src/db/repositories/documentSetRepo.ts`: import `type Note` từ `../../types/models`, thêm export `computeNoteHashesCached(notes: readonly Note[], cache: Map<string, { updatedAt: string; hash: string }>): Promise<Record<string, string>>`. Helper chỉ duyệt `notes` được truyền vào; với mỗi note, nếu `cache.get(note.id)?.updatedAt === note.updatedAt` thì lấy hash cũ, ngược lại gọi `computeSha256(normalizeMarkdownForHash(note.body))` rồi ghi vào cache; trả về `Record` chỉ gồm id của `notes`. Không dùng module-level Map (gây nhiễm giữa các DB test), không đổi `computeSha256`, `normalizeMarkdownForHash`, `updateDocumentSet`, `updatePresentationOrder`.

    Trong `src/workbench/DocumentSetDetail.tsx`: thêm `useRef` vào import React; thêm `const hashCache = useRef(new Map<string, { updatedAt: string; hash: string }>())`; thay liveQuery `noteHashes` hiện tại (dòng ~186-191) bằng liveQuery gọi `computeNoteHashesCached(documents, hashCache.current)` với deps `[db, set?.id, documentIdsKey, documents]` và default `{} as Record<string, string>`. Giữ nguyên `publishData`, `published`, `publishView`, `STATE_UI` và mọi handler xuất bản/đồ thị. `allNotes`/`formNotes` vẫn giữ lại vì cần cho form và preview; chỉ bỏ việc hash chúng.
  </action>
  <verify>
    <automated>npx vitest run tests/knowledge/documentSetHashes.test.ts tests/knowledge/DocumentSetPublishFlow.test.tsx --bail=1</automated>
  </verify>
  <done>Helper tồn tại và có test hit/invalidate/isolated cache; `noteHashes` trong detail chỉ hash doc thuộc bộ; test publish state 'Đã đồng bộ' / 'Có thay đổi cục bộ' vẫn xanh; grep `noteHashes` không còn `formNotes.map` hay `allNotes`.</done>
</task>

<task type="auto">
  <name>Task 2: Workbench 248/detail/inspector + filter dính + danh sách docs virtual</name>
  <files>src/workbench/DocumentSetDetail.tsx, src/workbench/DocSetLibrary.tsx, src/workbench/__tests__/DocumentSetDetailPublished.test.tsx, src/workbench/__tests__/DocsWorkspace.test.tsx</files>
  <action>
    Làm theo 002/A + 003/A + 004/A, giữ nguyên mọi handler xuất bản/đồ thị/xóa/xem trước và modals hiện có.

    `src/workbench/DocSetLibrary.tsx`: đổi `width: 260` thành `width: 248` tại div `data-testid="doc-set-library-list"` (dòng ~95). Giữ nguyên query, selectSet, form tạo, testid, và vùng detail `flex:1; minWidth:0`. Không thêm tab/rail ngang.

    `src/workbench/DocumentSetDetail.tsx`:
    - Import `VirtualizedList` từ `../workbench/virtual/VirtualizedList` (component có sẵn dùng `@tanstack/react-virtual`; KHÔNG tự tính scroll, KHÔNG thêm dependency). Thêm `CheckableTag` vào import named existing từ `../components/ui` (xuất tại `src/components/ui/index.ts:283`, định nghĩa tại `src/components/ui/tag.tsx:45`); KHÔNG dùng `Tag.CheckableTag` vì `Tag` ở `../components/ui` là wrapper không có thuộc tính đó. Giữ `Table` cho bảng chunks trong modal (không thuộc danh sách docs).
    - Mở rộng `DocumentRow`: `key, id, no, title, path, sizeBytes, updatedAt, status`. Tính trong `useMemo` từ `documents` + `publishData`: `path` là chuỗi các `title` của cha theo `parentId` qua một `Map` xây từ `allNotes` (giới hạn 20 cấp, gặp cha thiếu thì dừng); `sizeBytes = new TextEncoder().encode(note.body).length`; `status` ưu tiên 'Đang xuất bản' nếu id nằm trong `submittedDocuments` của attempt Publishing, rồi 'Chưa xuất bản' / 'Có thay đổi cục bộ' / 'Đã đồng bộ' dựa trên `noteHashes` và `publishedDocuments`. Không lưu `body` vào row, không render `body`. Giữ `documentTitles` và `documentIds` order nguyên vẹn.
    - QUY TẮC HOOKS: đặt TẤT CẢ hook mới (`useMemo` cho `rows`/`filteredRows`, `useRef` cho form handle, state local mới) TRƯỚC câu `if (!set) return` hiện tại tại dòng ~513. Không đặt hook nào sau early return. Mọi derived value dùng guard `set ? ... : []` (ví dụ `const rows = useMemo(() => (set ? documents.map(...) : []), [set, documents, publishData, noteHashes])`) và `filteredRows` tương tự; không đọc `set.documentIds` khi `set` null.
    - State local mới: `docQuery`, `statusFilter`, `sortKey` ('updated' | 'name'), `extFilter` ('.md' | '.docx' | undefined), `selectedDocId`. Toolbar `position:'sticky', top:0, zIndex:5` gồm `SearchInput` (tên/đường dẫn), `Select` trạng thái, `Select` sort, chip `.md`/`.docx` (dùng named `CheckableTag`), và count `filtered / total`. Dùng `foldForSearch`/`searchIncludes` từ `../utils/searchText` như `src/workbench/DocSetLibrary.tsx:11`. Mọi filter nằm ngoài row component.
    - Thay `<Table<DocumentRow>>` (dòng ~798-817) bằng: wrapper `data-testid="doc-set-documents"` chứa toolbar + `<VirtualizedList items={filteredRows} estimateSize={() => 38} height={440} overscan={4} role="listbox" aria-label="Danh sách tài liệu trong bộ" renderItem=... />`. Row là component `React.memo` định nghĩa ở module scope, cao 38px, nhận props ổn định, hiện `no | title | path | size | updatedAt | status Tag`, click chọn `selectedDocId`, có `data-testid={`doc-row-${id}`}` và aria-label chứa tên. Không dựng Dropdown/MenuProps mới mỗi row, không markdown/snippet.
    - Thêm `<aside>` inspector `width:260, flexShrink:0, borderLeft, padding` cạnh danh sách: khi có `selectedDocId` hiện KV (tên, path, kích thước, ngày, trạng thái, `Text copyable` id); khi chưa chọn hiện "Chọn một tài liệu để xem chi tiết." Không mở drawer/popup.
    - State nặng inline: nếu `state === 'Publishing' && activeAttemptId`, đổi nút "Kiểm tra trạng thái" hiện tại thành banner inline (spinner + `n tài liệu / tổng · chạy locally` + `Progress`) với chính action `handleReconcileAttempt` đó — không bịa nút "Tạm dừng" vì không có API hủy. Giữ nguyên `reconciliationError` Alert, `graphStatus?.state === 'Failed'` Alert có "Thử lại", và progress card của graph (đã inline). Khi `rows.length === 0` thay danh sách bằng `Empty` description "Chưa có tài liệu nào trong bộ này" + CTA "Thêm tài liệu": khai báo `const formRef = useRef<DocumentSetFormHandle>(null)` (import `type DocumentSetFormHandle` từ `../components/knowledge/DocumentSetForm`, định nghĩa ở Task 3), truyền `ref={formRef}` vào `<DocumentSetForm ... />`, CTA `onClick={() => formRef.current?.openPicker()}`. Không query DOM bằng `aria-label`; giữ nguyên `aria-label="Thêm tài liệu"` trên nút bên trong form để test cũ không đổi. Chiều cao banner cố định, chỉ đổi width của progress để không nhảy layout.
    - Giữ root `data-testid="doc-set-detail"`, các section graph/history, `DocumentSetForm`, `DocumentSetDeleteDialog`, `GraphEvidenceDrawer`, `PublishPreviewModal`, chunk Modal.

    Trong `src/workbench/__tests__/DocumentSetDetailPublished.test.tsx`: thêm 1 `it` mới seed bộ có 60 notes (body dài, `updatedAt` khác nhau), render, chờ `screen.findByTestId('doc-set-documents')`, assert số `[data-testid^="doc-row-"]` <= 25 và `document.body.textContent` không chứa nội dung body mẫu; gõ `SearchInput` trong toolbar và assert count filtered thay đổi. Giữ nguyên test WR-02 cũ.

    Trong `src/workbench/__tests__/DocsWorkspace.test.tsx`: test WR workspace hiện tại (dòng ~156-166) vẫn assert `table tbody tr` length 10 + `.ant-pagination` tồn tại — hai assertion này sẽ hỏng khi thay Table bằng VirtualizedList. Cập nhật: đổi seed `seedSet('Bộ lớn', 25)` thành 60 doc; thay `querySelectorAll('table tbody tr')` bằng `querySelectorAll('[data-testid^="doc-row-"]')` và assert số row `> 0` nhưng `<= 25` (trong jsdom `getVirtualItems()` rỗng nên `VirtualizedList` fallback render `min(items.length, 25)` row — KHÔNG phải 10); giữ assert `rows[0]?.textContent` chứa 'Bộ lớn tài liệu 1'; đổi assert vắng từ 'Bộ lớn tài liệu 25' sang 'Bộ lớn tài liệu 60' (doc cuối nằm ngoài fallback window); thay assertion `.ant-pagination` bằng assertion toolbar count ban đầu là `60 / 60` (count dạng `filtered / total`), sau đó gõ filter và assert count đổi — khẳng định không còn pagination. Không đổi phần còn lại của file.
  </action>
  <verify>
    <automated>npx vitest run src/workbench/__tests__/DocumentSetDetailPublished.test.tsx src/workbench/__tests__/DocumentSetDetailDefaultDb.test.tsx src/workbench/__tests__/DocsWorkspace.test.tsx --bail=1</automated>
  </verify>
  <done>Rail 248px + inspector 260px hiện ra; với 60 docs DOM có <= 25 row, row không chứa body; filter/count/click chọn doc hoạt động; CTA empty gọi `openPicker()` qua ref; test WR-02, default-db và DocsWorkspace (doc-row-* + count, không pagination) vẫn xanh; publish/graph handler không đổi; mọi hook mới nằm trước early return `if (!set)`.</done>
</task>

<task type="auto">
  <name>Task 3: Picker flat virtual + membership virtual, bỏ Tree defaultExpandAll</name>
  <files>src/components/knowledge/DocumentSetForm.tsx</files>
  <action>
    Trong `src/components/knowledge/DocumentSetForm.tsx` (chỉ file này):
    - Chuyển `export function DocumentSetForm(...)` thành `forwardRef<DocumentSetFormHandle, DocumentSetFormProps>` với `useImperativeHandle` expose `{ openPicker() }`; `openPicker()` chạy đúng logic của nút "Thêm tài liệu" hiện tại: `setDraftSelection(members); setSearchDocQuery(''); setPickerOpen(true)`. Export `type DocumentSetFormHandle = { openPicker(): void }`. Giữ nguyên nút `aria-label="Thêm tài liệu"` và handler của nó gọi chung hàm này. Không đổi `DocumentSetFormProps`, payload `onSave`, hay `DocumentSetFormValue`.
    - Import `VirtualizedList` từ `../../workbench/virtual/VirtualizedList`; bỏ import `Tree`, `TreeDataNode` và `FolderOutlined` nếu không còn dùng. Không thêm package.
    - Xóa hoàn toàn khối `treeData` (dòng ~87-172), `treeCheckedKeys` (~174-204), `handleTreeCheck` (~206-239) và `<Tree ... defaultExpandAll />` (~672-679). Không còn vòng `activeNotes.find()/filter()` lặp trên mỗi row.
    - Thay bằng `flatDocs` useMemo: lấy `notes` không `deletedAt`, khác `'folder'`, lọc theo `searchDocQuery` bằng `foldForSearch`/`searchIncludes` trên `title` + `tags`; mỗi item `{ id, title, path }`, trong đó `path` resolve từ `parentId` qua một `Map<id, Note>` xây 1 lần (giới hạn 20 cấp). Không gọi `computeSha256`, không đọc `body`.
    - Modal picker: `<VirtualizedList items={flatDocs} height={320} estimateSize={() => 36} overscan={4} role="group" aria-label="Danh sách tài liệu để chọn" renderItem=... />`; mỗi row là `<Checkbox aria-label={doc.title} checked={draftSelection.includes(doc.id)} onChange=...>` cạnh `<Text type="secondary">{doc.path}</Text>`. Giữ `draftSelection`, `onOk` (retained = members còn trong draft, added = draft chưa có, `setMembers([...retained, ...added])`), `setMode('manual')`, empty text "Không tìm thấy tài liệu phù hợp". Test cũ `getByRole('checkbox', { name: /Gamma/ })` phải vẫn tìm thấy.
    - Membership list (dòng ~596-636): thay `<List dataSource={members} renderItem=...>` bằng `<VirtualizedList items={members} height={320} estimateSize={() => 38} overscan={4} role="group" aria-label="Tài liệu trong bộ" renderItem=... />`. Giữ nguyên `data-testid={`member-${documentId}`}`, 3 Tooltip/Button "Đưa lên" / "Đưa xuống" / `Gỡ ${title}`, điều kiện `disabled` tại index 0 / cuối, handler `move` và remove. Giữ empty text và nút "Lưu thay đổi".
    - Không đổi `snapshotFolderMembers`, chế độ `mode === 'folder'`, `DocumentSetFormValue`, preset/scope/alias/relation, validation, `save()` payload (`documentIds: members`), hay prop `initialSet`. UUID/thứ tự không bị sinh lại.
  </action>
  <verify>
    <automated>npx vitest run tests/knowledge/documentSetForm.test.tsx tests/knowledge/DocumentSetPublishFlow.test.tsx --bail=1 && npx tsc --noEmit</automated>
  </verify>
  <done>Không còn `Tree`/`defaultExpandAll`; picker và membership đều virtual; `DocumentSetFormHandle.openPicker()` tồn tại và mở picker; test thêm/sửa/xóa/reorder member và save `documentIds` thứ tự đúng vẫn xanh; `tsc --noEmit` sạch.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| IndexedDB note rows -> doc-set UI | `Note.title`, `body`, `parentId` là dữ liệu local có thể chứa Markdown/HTML độc hại |
| Form draft -> `updateDocumentSet` | `documentIds` do người dùng chọn, quyết định membership và thứ tự xuất bản |
| Knowledge Server response -> detail | Chỉ đọc trạng thái; handler cũ không đổi trong quick task này |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-SAV-01 | Tampering | `DocumentRow` path/title | mitigate | Render bằng `Text`/`Tag` (React escape), tuyệt đối không `dangerouslySetInnerHTML`; path xây từ `title` cha qua Map có chặn 20 cấp |
| T-SAV-02 | Information disclosure | Virtual doc row | mitigate | Row chỉ nhận `{no,title,path,sizeBytes,updatedAt,status}`; không truyền `Note.body` vào component row hay vào DOM |
| T-SAV-03 | Tampering | `computeNoteHashesCached` | mitigate | Cache key gồm `updatedAt`; đổi nội dung mà quên đổi updatedAt thì vẫn hash lại ở liveQuery vì `documents` là row mới — không cache module-global |
| T-SAV-04 | Tampering | `DocumentSetForm.onOk` / `save()` | mitigate | Giữ nguyên retained+added theo UUID, không sinh id mới, không mutate `members`; `updateDocumentSet` vẫn validate qua `DocumentSetSchema` |
| T-SAV-05 | Denial of service | Picker/membership/tree-data | mitigate | Virtual list giới hạn DOM; bỏ `Tree defaultExpandAll` và các `find()/filter()` lặp; filter chạy trên metadata, không hash body |
| T-SAV-SC | Tampering | Package installs | accept | Không có lệnh cài đặt nào trong plan này; mọi import dùng dependency đã có (`@tanstack/react-virtual`, antd, dexie) |

</threat_model>

<verification>
Chạy scoped theo từng task, tuyệt đối không chạy full Vitest suite (> 1 giờ):

1. `npx vitest run tests/knowledge/documentSetHashes.test.ts tests/knowledge/DocumentSetPublishFlow.test.tsx --bail=1`
2. `npx vitest run src/workbench/__tests__/DocumentSetDetailPublished.test.tsx src/workbench/__tests__/DocumentSetDetailDefaultDb.test.tsx src/workbench/__tests__/DocsWorkspace.test.tsx --bail=1`
3. `npx vitest run tests/knowledge/documentSetForm.test.tsx tests/knowledge/DocumentSetPublishFlow.test.tsx --bail=1 && npx tsc --noEmit`

Kiểm tra tay trong Tauri/local (không đụng PWA/GitHub Pages): mở tab "Bộ tài liệu", tạo bộ có nhiều doc, gõ filter thấy count đổi và cuộn mượt; click doc thấy inspector đổi; mở "Thêm tài liệu" thấy danh sách phẳng có search, không còn cây expand-all; đổi nội dung 1 doc và quay lại tab thấy tag "Có thay đổi cục bộ".
</verification>

<success_criteria>
- 3 sketch winner được thể hiện đúng trong code, không có variant B/C bịa thêm.
- Với 60+ doc, DOM danh sách <= 25 row; row không chứa Markdown/`Note.body`.
- `noteHashes` chỉ hash doc thuộc bộ, cache theo `(id, updatedAt)`, không còn hash `formNotes` mỗi change.
- Picker và membership virtualize; không còn `Tree defaultExpandAll`, không vòng `find()/filter()` lặp theo row.
- Publish state, thứ tự `documentIds`, UUID và data safety không đổi; test scoped + `tsc --noEmit` xanh.
- Không dependency mới, không commit, không sửa ROADMAP.md.
</success_criteria>

<output>
Khi xong tạo `.planning/quick/261124-sav-refactor-m-n-h-nh-b-t-i-li-u-theo-3-sket/261124-sav-SUMMARY.md` theo template summary.
</output>
