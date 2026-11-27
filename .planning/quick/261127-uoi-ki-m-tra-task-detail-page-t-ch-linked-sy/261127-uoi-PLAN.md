---
phase: quick
plan: 261127-uoi
type: execute
wave: 1
depends_on: []
files_modified:
  - src/views/ItemInsightView.tsx
  - src/workbench/EditorArea.tsx
  - tests/views/ItemInsightView.test.tsx
autonomous: true
requirements:
  - LINKED_SYSTEM_SECTION
  - CANONICAL_SYSTEM_TAB
  - NO_REGRESSION
must_haves:
  truths:
    - "Task insight có mục riêng 'Hệ thống liên kết' hiện hệ thống dưới dạng tag/label `code — name` có thể bấm được; tag hệ thống không còn nằm trong dòng tag compact của header"
    - "Khi task không gắn hệ thống hoặc systemId orphan, mục 'Hệ thống liên kết' vẫn hiện fallback tương ứng ('Chung (không gắn)' / systemId)"
    - "Bấm hệ thống từ mục mới hoặc từ breadcrumb hệ thống mở đúng tab hệ thống canonical (`system_detail`, id `system-${id}`, params `{systemId:id}`), không mở tab insight hệ thống trùng lặp"
    - "ItemInsightView giữ khả năng test độc lập: nhận callback tùy chọn qua prop, không import useLayoutStore/openTab trực tiếp"
    - "Dùng UI wrapper có sẵn trong src/components/ui và icon từ src/components/ui/icon; không dependency mới, không đổi model/Dexie/backup version"
  artifacts:
    - path: src/views/ItemInsightView.tsx
      provides: "Prop onOpenSystemDetail tùy chọn, mục 'Hệ thống liên kết' riêng cho task, breadcrumb hệ thống dùng callback mới"
      contains: "onOpenSystemDetail"
    - path: src/workbench/EditorArea.tsx
      provides: "Truyền callback mở tab system_detail canonical vào ItemInsightView"
      contains: "system-${systemId}"
    - path: tests/views/ItemInsightView.test.tsx
      provides: "Scoped test cho click-through canonical, mục riêng, header sạch tag hệ thống, fallback"
      contains: "onOpenSystemDetail"
  key_links:
    - from: src/workbench/EditorArea.tsx
      to: src/views/ItemInsightView.tsx
      via: "prop onOpenSystemDetail tại case 'insight', gọi openTab với contract y hệt SystemsExplorer.handleOpenDetail"
    - from: src/views/ItemInsightView.tsx
      to: src/workbench/EditorArea.tsx
      via: "tag trong mục 'Hệ thống liên kết' và breadcrumb hệ thống gọi onOpenSystemDetail(parentSystem) thay vì onNavigate('insight', ...)"
    - from: src/views/ItemInsightView.tsx
      to: src/views/SystemDetailView.tsx
      via: "EditorArea case 'system_detail' render <SystemDetailView systemId={tab.params?.systemId} />"
---

<objective>
Đưa hệ thống liên kết trên task insight vào một mục riêng và sửa click-through để mở đúng tab chi tiết hệ thống hiện hữu thay vì trang insight hệ thống trùng lặp.

Purpose: người dùng đọc task detail bấm vào hệ thống phải tới đúng chỗ Systems Explorer vẫn dùng; một hệ thống chỉ có một dạng chi tiết canonical. Không tạo route/page mới, không đụng store trực tiếp từ view.

Output: mục "Hệ thống liên kết" trên task insight, callback `onOpenSystemDetail` nối từ EditorArea, scoped test cập nhật.

**Quyết định chốt cần giữ nguyên:** contract tab canonical lấy nguyên từ `SystemsExplorer.handleOpenDetail`: `{ id: \`system-${system.id}\`, title: system.name, viewType: 'system_detail', closable: true, params: { systemId: system.id } }`. Chủ sở hữu callback là EditorArea (dùng `openTab` có sẵn); ItemInsightView chỉ nhận prop tùy chọn, không import `useLayoutStore`. Breadcrumb hệ thống dùng chung callback này. Không thêm route/page/page insight hệ thống nào khác.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/STATE.md
@src/views/ItemInsightView.tsx
@src/workbench/EditorArea.tsx
@src/workbench/toolwindows/SystemsExplorer.tsx
@src/views/SystemDetailView.tsx
@src/components/ui/index.ts
@src/components/ui/icon.tsx
@tests/views/ItemInsightView.test.tsx
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Thêm prop onOpenSystemDetail và mục 'Hệ thống liên kết' trên task insight</name>
  <files>src/views/ItemInsightView.tsx, tests/views/ItemInsightView.test.tsx</files>
  <behavior>
    - Test 1 (cập nhật test cũ dòng 97-145): render task có hệ thống với `onOpenSystemDetail={mockOpenSystem}`; bấm tag `PAYMENT_SVC — Payment Service` trong mục mới → `mockOpenSystem` nhận đúng object system từ `systemMap` (id/name/code), `mockNavigate` KHÔNG được gọi với 'insight' system params nữa.
    - Test 2: mục 'Hệ thống liên kết' hiện cho task; dòng tag compact trong header (`itemType === 'task'` tag row ~431-450) không còn tag hệ thống, chỉ giữ tag 'Tác vụ' và các tag khác; breadcrumb hệ thống (crumb `parentSystem`, ~393-411) bấm cũng gọi `mockOpenSystem`.
    - Test 3: task không có systemId → fallback 'Chung (không gắn)' vẫn hiện trong mục mới; task có systemId orphan → hiện chính systemId đó làm fallback; cả hai không gọi `mockOpenSystem` khi không click.
    - Test 4: CR/system insight và các section Links/Notes/Diagrams hiện hữu không regress.
  </behavior>
  <action>
    Trong `src/views/ItemInsightView.tsx`: mở rộng `ItemInsightViewProps` với `onOpenSystemDetail?: (system: System) => void` (import type `System` từ model hiện hữu); destructuring thêm prop này, KHÔNG import `useLayoutStore` hay `openTab`. Giữ `parentSystem` useMemo (~140) nguyên vẹn làm nguồn object hệ thống.

    Thêm mục riêng `Hệ thống liên kết` cho `itemType === 'task'`, đặt cạnh các section hiện hữu (sau block Links ~668-711, trước các Card Notes/Diagrams ~901/958). Dùng `Card`/`Tag`/`Text`/`Space` từ `../components/ui` và icon từ `../components/ui/icon` theo pattern có sẵn. Nội dung: nếu `parentSystem` tồn tại → một `Tag` (hoặc Button dạng text) nhãn `${parentSystem.code} — ${parentSystem.name}`, `style={{ cursor: 'pointer' }}`, `onClick={() => onOpenSystemDetail?.(parentSystem)}`, kèm `data-testid="item-insight-linked-system"`; nếu không → `Tag color="default"` hiện fallback giữ nguyên logic cũ `currentTask?.systemId ?? 'Chung (không gắn)'`. Prop là optional nên khi không truyền thì tag vẫn hiện nhưng không mở gì — không fallback sang `onNavigate('insight', ...)`.

    Xóa hoàn toàn đoạn render tag hệ thống khỏi dòng tag compact header (~431-450) — gồm cả nhánh có `parentSystem` và nhánh fallback; chỉ giữ `<Tag color="blue">Tác vụ</Tag>` và các tag khác. Trong breadcrumb `parentSystem` (~393-411), đổi `onNavigate('insight', { type:'system', id, name })` thành `onOpenSystemDetail?.(parentSystem)`; giữ nhãn `{parentSystem.code}`. Các breadcrumb CR/task khác giữ nguyên.

    Trong `tests/views/ItemInsightView.test.tsx`: thêm `const mockOpenSystem = vi.fn()` cạnh `mockNavigate`, clear trong `beforeEach`. Đổi test cũ 'renders system tag in task header, click navigates to system insight, with both fallbacks' thành tên/case mới: truyền `onOpenSystemDetail={mockOpenSystem}` cho cả 3 render; assert tag nằm trong `data-testid="item-insight-linked-system"`, click → `expect(mockOpenSystem).toHaveBeenCalledWith(expect.objectContaining({ id: system.id, code: 'PAYMENT_SVC', name: 'Payment Service' }))` và `expect(mockNavigate).not.toHaveBeenCalled()`; assert breadcrumb system cũng gọi callback; assert fallback 'Chung (không gắn)' và orphanId vẫn render trong section mới. Giữ mọi test khác nguyên vẹn (kể cả quick-create link từ 261127-ts3).
  </action>
  <verify>
    <automated>npx vitest run tests/views/ItemInsightView.test.tsx --bail=1 && npx tsc --noEmit</automated>
  </verify>
  <done>Task insight có mục riêng hiện tag hệ thống/fallback; header sạch tag hệ thống; breadcrumb và tag đều gọi `onOpenSystemDetail`; không còn navigate insight hệ thống; scoped test + tsc xanh.</done>
</task>

<task type="auto">
  <name>Task 2: Nối callback canonical từ EditorArea tới ItemInsightView</name>
  <files>src/workbench/EditorArea.tsx</files>
  <action>
    Trong case `insight` (~682-725), thêm prop `onOpenSystemDetail` vào `<ItemInsightView>`: callback nhận `system` (type `System` từ model hiện hữu) và gọi `openTab` với đúng contract của `SystemsExplorer.handleOpenDetail` (~47-55): `id: \`system-${system.id}\``, `title: system.name`, `viewType: 'system_detail'`, `closable: true`, `params: { systemId: system.id }`. Dùng lại biến `openTab` đã có trong scope EditorArea; không import thêm store, không sửa `onNavigate` hiện hữu (route 'insight' cho CR/task vẫn giữ nguyên). Không sửa case `system_detail` (~674-675) — nó đã render `<SystemDetailView systemId={tab.params?.systemId || ''} .../>`. Không thêm route/page/menu item mới.

    Không thêm harness test EditorArea mới (hiện không có file test nào cho component này); việc nối được cover bởi tsc + kiểm tra contract bằng grep/review diff + xác minh Chrome ở bước verification.
  </action>
  <verify>
    <automated>npx tsc --noEmit && npx eslint src/workbench/EditorArea.tsx src/views/ItemInsightView.tsx tests/views/ItemInsightView.test.tsx && grep -n "viewType: 'system_detail'" src/workbench/EditorArea.tsx src/workbench/toolwindows/SystemsExplorer.tsx</automated>
  </verify>
  <done>EditorArea truyền callback mở tab `system-${id}` / `system_detail` / params `{systemId:id}` giống hệt SystemsExplorer; không còn tab insight hệ thống trùng lặp; tsc + eslint xanh.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| IndexedDB hệ thống → ItemInsightView | `systemId` từ task có thể orphan; object system đọc từ `systemMap` rồi đưa vào callback/tab |
| Callback → EditorArea openTab | params tab do view con truyền lên, cần đúng id/viewType để không mở sai page |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-261127uoi-01 | Tampering | `onOpenSystemDetail` ở ItemInsightView | mitigate | Chỉ nhận object từ `systemMap` (đã validate bởi repo), không nhận id/name thô từ URL/props; optional callback, không fallback sang route 'insight'. |
| T-261127uoi-02 | Information disclosure | Nhãn `code — name` và breadcrumb | accept | Render là text React thuần qua `Tag`/`Text`; không `innerHTML`, không nối HTML; dữ liệu là tên hệ thống nội bộ, không secret/token. |
| T-261127uoi-03 | Tampering | Contract tab `system_detail` | mitigate | EditorArea tạo tab từ object system với id `system-${id}`, params `{systemId:id}` y hệt SystemsExplorer; KHÔNG nhận id do người dùng nhập trên URL. |
| T-261127uoi-SC | Tampering | npm/pip/cargo installs | mitigate | Không cài package; UI wrapper từ `src/components/ui`, icon từ `src/components/ui/icon` có sẵn. |
</threat_model>

<verification>
Chạy scoped, tuyệt đối không chạy full `npm test` (quy tắc dự án: > 1 giờ):

- `npx vitest run tests/views/ItemInsightView.test.tsx --bail=1`
- `npx tsc --noEmit`
- `npx eslint src/workbench/EditorArea.tsx src/views/ItemInsightView.tsx tests/views/ItemInsightView.test.tsx`

Sau execute: review diff. Mở Chrome, bật task insight có hệ thống, kiểm tra light/dark: (1) mục 'Hệ thống liên kết' hiện `code — name`, header không còn tag hệ thống thừa; (2) bấm tag trong mục và bấm breadcrumb hệ thống đều mở đúng tabSystemDetailView giống khi bấm từ Systems Explorer — chỉ một tab, không có tab insight hệ thống trùng; (3) task không hệ thống vẫn hiện 'Chung (không gắn)'. Không đụng PWA/GitHub Pages.
</verification>

<success_criteria>
- Task insight có mục 'Hệ thống liên kết' riêng; tag hệ thống chỉ nằm ở mục này, không còn trong header compact.
- Fallback 'Chung (không gắn)' / systemId orphan vẫn hiện trong mục mới.
- Click hệ thống từ task insight (tag hoặc breadcrumb) mở đúng tab `system_detail` canonical: id `system-${id}`, title `name`, params `{systemId:id}` — không tạo tab insight hệ thống trùng lặp.
- ItemInsightView không import layoutStore; nhận callback qua prop optional, test được độc lập.
- Không dependency mới, không đổi model/DB/backup version; scoped Vitest + tsc + eslint xanh; review diff + Chrome light/dark sạch.
</success_criteria>

<output>
Create `.planning/quick/261127-uoi-ki-m-tra-task-detail-page-t-ch-linked-sy/261127-uoi-SUMMARY.md` when done
</output>
