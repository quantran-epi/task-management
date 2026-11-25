---
phase: quick
plan: 261125-ffm
type: execute
wave: 1
depends_on: []
files_modified:
  - src/views/ChangeRequestDetailView.tsx
  - src/views/__tests__/ChangeRequestDetailView.subsystemOptions.test.tsx
autonomous: true
requirements:
  - CR-DETAIL-LABEL
  - CR-DETAIL-SELECT
user_setup: []
must_haves:
  truths:
    - "Subsystem dropdown trong bảng tác vụ của CR Detail hiện tên hệ thống dễ đọc cạnh mã hệ thống"
    - "Giá trị lưu khi đổi subsystem vẫn là systemId; option 'Chung (không gắn)' vẫn giữ nguyên"
    - "Cột Subsystem đủ rộng để hiển thị nhãn tên + mã thay vì bị cắt ngắn"
    - "Targeted Vitest và tsc --noEmit đạt; không chạy full suite"
  artifacts:
    - path: "src/views/ChangeRequestDetailView.tsx"
      provides: "CR Detail subsystem Select với nhãn tên + mã hệ thống"
      contains: "subsystemOptions"
    - path: "src/views/__tests__/ChangeRequestDetailView.subsystemOptions.test.tsx"
      provides: "Regression test cho nhãn dropdown và giá trị systemId"
      contains: "ant-select-item-option-content"
  key_links:
    - from: "src/views/ChangeRequestDetailView.tsx (subsystemOptions)"
      to: "Select options trong cột Subsystem"
      via: "label `${sys.name} (${sys.code})`, value vẫn là t.systemId"
    - from: "handleSubsystemChange"
      to: "updateTask"
      via: "onChange của Select truyền value systemId hoặc UNATTACHED_OPTION"
---

<objective>
Sửa dropdown Subsystem trong bảng tác vụ của màn hình CR Detail: hiện tên hệ thống dễ đọc cạnh mã hệ thống thay vì chỉ hiện mã.

Purpose: Sếp không đọc được mã hệ thống trừ khi nhớ danh mục; tên hệ thống có ngữ nghĩa, mã vẫn cần để nhận diện. Giữ nguyên giá trị lưu systemId nên không có thay đổi dữ liệu hay schema.

Output: Một dòng đổi nhãn option theo convention `${name} (${code})` đã dùng ở SystemModal, tinh chỉnh độ rộng cột, và một file regression test chứng minh dropdown render tên + mã mà vẫn ghi systemId đúng.

Quyết định (Claude's discretion): dùng định dạng `${sys.name} (${sys.code})` theo precedent tại SystemModal.tsx:229 thay vì chỉ tên — giữ mã hệ thống để nhận diện chéo với CR header và các bảng khác. Khi không tìm thấy system row, vẫn fallback về `t.systemId` như cũ (không bịa tên).
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/STATE.md
@src/views/ChangeRequestDetailView.tsx
@src/components/systems/SystemModal.tsx
@src/views/__tests__/TasksViewActions.test.tsx

Quan sát tại lúc lập plan: `src/views/ChangeRequestDetailView.tsx:178-184` xây `subsystemOptions` với `label: systemMap.get(t.systemId)?.code ?? t.systemId` — chỉ có mã. Cột Subsystem tại dòng 379-395 có `width: 160` và dùng `Select variant="borderless"` với `options={subsystemOptions}`; `handleSubsystemChange` (dòng 163-173) ghi `systemId` hoặc `undefined` cho sentinel `UNATTACHED_OPTION`. `System` có cả `name` lẫn `code` (`src/types/models.ts:49-61`). Convention `${p.name} (${p.code})` đã có ở `src/components/systems/SystemModal.tsx:229`. Pattern test dropdown AntD: `fireEvent.mouseDown(combobox)` rồi `screen.findByText(text, { selector: '.ant-select-item-option-content' })` (`src/components/systems/SystemModal.test.tsx:35-40`). Pattern render view có ThemeAppHolder: `src/views/__tests__/TasksViewActions.test.tsx:21-23`. `tests/setup.ts` đã nạp fake-indexeddb + jest-dom, nên seed repo thật qua `createSystem`/`createChangeRequest`/`createTask` rồi truyền `db` prop là được. Không đụng `TaskTable.tsx` — bảng đó là màn hình Tasks toàn cục, khác với bảng flat trong CR Detail.
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Hiện tên + mã hệ thống trong dropdown Subsystem của CR Detail</name>
  <files>src/views/ChangeRequestDetailView.tsx, src/views/__tests__/ChangeRequestDetailView.subsystemOptions.test.tsx</files>
  <behavior>
    - Seed subsystem có name = "Web app", code = "WEB" (khác nhau rõ rệt) làm target của CR; mở dropdown Subsystem của tác vụ đó thì option content chứa cả "Web app" lẫn "WEB" theo dạng "Web app (WEB)".
    - Option "Chung (không gắn)" vẫn hiện đúng; danh sách option vẫn có đúng số lượng bằng số target cộng một.
    - Giá trị option vẫn là systemId: chọn option có nhãn tên + mã thì updateTask được gọi với systemId đúng, không phải chuỗi nhãn; chọn "Chung (không gắn)" thì ghi undefined.
    - Khi systemMap không có row cho một target (id lạ), nhãn fallback về chính systemId, không sinh tên giả.
  </behavior>
  <action> Viết file test trước rồi chạy để thấy đỏ, sau đó mới sửa production. Tạo src/views/__tests__/ChangeRequestDetailView.subsystemOptions.test.tsx theo pattern `// @vitest-environment jsdom` + `ThemeAppHolder` (TasksViewActions.test.tsx): seed qua `createSystem` (name "Web app", code "WEB", type "SERVICE"), `createChangeRequest` (targets `[{ systemId }]`), `createTask` (crId, systemId) trên defaultDb hoặc instance Dexie riêng; render `<ChangeRequestDetailView changeRequestId={cr.id} db={db} />` trong `act`; mock `useMessage`/`useTaskMateModal` nếu cần để tránh modal context, và mock `useLayoutStore` để `reloadTab` là no-op. Tìm Select đúng qua `data-testid="subsystem-cell-${task.id}"`, `fireEvent.mouseDown` vào combobox, rồi `screen.findByText('Web app (WEB)', { selector: '.ant-select-item-option-content' })`; thêm assertion option sentinel và assertion selection gọi `updateTask` với systemId (mock repo nếu cần, hoặc seed sẵn rồi đọc lại db.changeRequests/tasks). Chạy test file để xác nhận fail ở nhãn cũ. Sau đó trong src/views/ChangeRequestDetailView.tsx dùng biến `const sys = systemMap.get(t.systemId)` trong map của `subsystemOptions`, đặt `label: sys ? \`\${sys.name} (\${sys.code})\` : t.systemId`, giữ nguyên `value: t.systemId` và option `UNATTACHED_OPTION`. Tăng `width` của cột Subsystem từ 160 lên 200 trong cùng file để nhãn dài hơn vẫn đọc được. Không đổi type, schema, repo, TaskDrawer, hay bảng TaskTable.tsx; không thêm dependency. </action>
  <verify>
    <automated>npx vitest run src/views/__tests__/ChangeRequestDetailView.subsystemOptions.test.tsx --bail=1 && npx tsc --noEmit</automated>
  </verify>
  <done>Dropdown CR Detail hiện "Web app (WEB)" cạnh nhau, value vẫn là systemId, sentinel nguyên vẹn, fallback id lạ đúng, cột rộng 200px; test xanh và tsc sạch.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| system row → dropdown label | `System.name` và `System.code` từ IndexedDB được render vào option Select của CR Detail. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-ffm-01 | T (Tampering) | subsystemOptions label | low | mitigate | Chỉ nối `name` + `code` của System đã load qua `getAllSystems`; value vẫn là systemId nên thay đổi nhãn không thể đổi giá trị ghi vào task; test pin cả nhãn lẫn value. |
| T-ffm-SC | Tampering | npm/pip/cargo installs | high | accept | Không có lệnh cài package trong plan; chỉ sửa một file production và thêm một file test với dependency có sẵn. |
</threat_model>

<verification>
1. `npx vitest run src/views/__tests__/ChangeRequestDetailView.subsystemOptions.test.tsx --bail=1` — pass (chạy đích danh; full suite chạy hơn một tiếng nên không chạy).
2. `npx tsc --noEmit` — clean.
3. `git diff --name-only` — đúng 2 file trong `files_modified`; không đụng `src/components/tasks/TaskTable.tsx`, schema Dexie, backup, hay cấu hình PWA/GitHub Pages.
4. `grep -n "label:" src/views/ChangeRequestDetailView.tsx` — không còn nhãn chỉ dùng `?.code`.
</verification>

<success_criteria>
- Dropdown Subsystem trong CR Detail hiện tên hệ thống và mã cạnh nhau theo dạng "Tên (MÃ)".
- Giá trị ghi xuống vẫn là systemId; option "Chung (không gắn)" và fallback id lạ không đổi.
- Targeted Vitest và tsc --noEmit đạt; không commit/push trong plan; không đụng màn hình Tasks toàn cục.
</success_criteria>

<output>
Create `.planning/quick/261125-ffm-fix-cr-detail-screen-task-table-system-d/261125-ffm-SUMMARY.md` when done
</output>
