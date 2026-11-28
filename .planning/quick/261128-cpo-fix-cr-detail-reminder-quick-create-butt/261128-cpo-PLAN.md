---
phase: quick
plan: 261128-cpo
type: execute
wave: 1
depends_on: []
files_modified:
  - src/views/ChangeRequestDetailView.tsx
  - src/views/__tests__/ChangeRequestDetailView.reminderAndSearch.test.tsx
  - .planning/STATE.md
autonomous: true
requirements:
  - CR-DETAIL-REMINDER-SEARCH
user_setup: []
must_haves:
  truths:
    - "Trên tab chi tiết CR, section 'Nhắc nhở' có nút tạo nhắc nhở nhanh cho chính CR đó"
    - "Click nút mở đúng QuickReminderModal với target type 'cr', lưu xong thì reminder xuất hiện trong section và count tăng"
    - "Ô tìm tác vụ trong bảng dùng SearchInput chuẩn TaskMate: icon kính lúp nằm trong input, không còn nút search tách rời tạo khoảng trống"
    - "Hành vi lọc task, status filter, testid và mọi section khác giữ nguyên"
  artifacts:
    - path: src/views/ChangeRequestDetailView.tsx
      provides: "Nút thêm nhắc nhở CR + QuickReminderModal và ô tìm kiếm chuẩn"
      contains: "cr-detail-reminder-add"
    - path: src/views/__tests__/ChangeRequestDetailView.reminderAndSearch.test.tsx
      provides: "Test behavior nút reminder và cấu trúc search input"
      contains: "ant-input-search-button"
  key_links:
    - from: src/views/ChangeRequestDetailView.tsx#secondaryBlocks.reminders
      to: src/components/common/QuickReminderModal.tsx
      via: "state crReminderModalOpen truyền target={{ type: 'cr', entity: cr }} và db"
      pattern: "QuickReminderModal"
    - from: src/views/ChangeRequestDetailView.tsx#taskSearch
      to: src/components/ui/input.tsx#SearchInput
      via: "thay InputSearch bằng SearchInput, giữ data-testid cr-detail-task-search"
      pattern: "SearchInput"
---

<objective>
Sửa 2 điểm UI trên tab chi tiết Change Request: thêm nút tạo nhắc nhở nhanh trong section 'Nhắc nhở', và đưa ô tìm kiếm của bảng tác vụ về đúng SearchInput chuẩn TaskMate (icon kính lúp nằm trong input, không có nút search cách biệt).

Purpose: Section nhắc nhở hiện chỉ đọc dữ liệu, sếp phải mở CR Modal mới thêm được reminder. Ô lọc dùng `InputSearch` (AntD `Input.Search`) nên nút kính lúp bị tách thành một addon riêng, tạo khoảng trống xấu so với mọi màn hình khác trong app vốn dùng `SearchInput`.

Output: `ChangeRequestDetailView.tsx` có nút + modal reminder cho CR và ô search chuẩn; file test scoped phủ cả hai hành vi; `.planning/STATE.md` cập nhật một dòng activity.

Ranh giới cứng — KHÔNG được vi phạm:
- Không sửa `QuickReminderModal`, `RemindersFormList`, `ChangeRequestModal` hay repository — chỉ dùng lại component có sẵn.
- Không đổi logic lọc `filteredTasks`, status filter, stats, bảng task hay các secondary block khác (Ghi chú, Jira Epic, Links).
- Không thêm dependency, không đụng PWA/GitHub Pages, không đổi schema/DB, không refactor rộng.
- Mọi thảo luận/tài liệu bằng tiếng Việt, xưng sếp; mã nguồn giữ tiếng Anh. Chỉ làm trên branch `pre-v1.6-baseline`, không tạo branch/worktree. Không chạy full vitest suite (quy tắc dự án: > 1 giờ).
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/STATE.md

# Đọc 1 lần, đủ rộng, không re-read:
@src/views/ChangeRequestDetailView.tsx (toàn bộ 685 dòng)
@src/components/common/QuickReminderModal.tsx (toàn bộ 124 dòng)
@src/components/ui/input.tsx (44-75)
@src/components/changeRequests/ChangeRequestTable.tsx (437-444 — pattern mount modal target 'cr')
@src/views/ChangeRequestsView.tsx (138-156 — pattern SearchInput chuẩn)
@src/views/__tests__/ChangeRequestDetailView.subsystemOptions.test.tsx (toàn bộ 97 dòng — pattern render test)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Thêm nút reminder nhanh và đổi ô search sang SearchInput</name>
  <files>src/views/ChangeRequestDetailView.tsx</files>
  <action>Trong `src/views/ChangeRequestDetailView.tsx`: (1) Dòng import từ `../components/ui` đổi `InputSearch` thành `SearchInput` (giữ `Input` vì vẫn dùng cho ô Links). Thêm `import { QuickReminderModal } from '../components/common/QuickReminderModal';`. (2) Thêm state `const [crReminderModalOpen, setCrReminderModalOpen] = useState(false);` cạnh các state hiện có (trước early return `if (!cr)`). (3) Trong mảng `secondaryBlocks`, phần tử `key: 'reminders'`: bọc `body` hiện tại bằng `<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 'var(--gap-8)' }}>`; đặt đầu tiên nút `<Button data-testid="cr-detail-reminder-add" size="small" icon={<PlusOutlined />} onClick={() => setCrReminderModalOpen(true)}>Thêm nhắc nhở</Button>`; giữ nguyên ba nhánh render cũ (`cr.reminders`, `cr.reminderDate`, 'Chưa có') bên dưới nút, không đổi nội dung hay count. (4) Sau early return `if (!cr)` và cạnh `{reminderModal}` (modal reminder của task từ `useTaskMenuItems`), mount `{crReminderModalOpen && (<QuickReminderModal open onClose={() => setCrReminderModalOpen(false)} target={{ type: 'cr', entity: cr }} db={db} />)}` — đúng pattern `ChangeRequestTable.tsx:437-444`. (5) Ở toolbar bảng task, thay `<InputSearch data-testid="cr-detail-task-search" ... />` bằng `<SearchInput ... />`; giữ nguyên `placeholder="Tìm tác vụ"`, `allowClear`, `value={taskSearch}`, `onChange={(e) => setTaskSearch(e.target.value)}`, `style={{ width: 240 }}`. Không thêm prop `onSearch`, không đổi `Select` status filter hay `<Space>` bao quanh. `QuickReminderModal` tự validate date/time, trim note, append vào `cr.reminders` qua `updateChangeRequest`; không tự viết lại logic đó ở đây.</action>
  <verify>
    <automated>npx tsc --noEmit -p tsconfig.json && test "$(grep -v '^#' src/views/ChangeRequestDetailView.tsx | grep -c 'QuickReminderModal')" -ge 1 && test "$(grep -v '^#' src/views/ChangeRequestDetailView.tsx | grep -c 'InputSearch')" -eq 0</automated>
  </verify>
  <done>Button `cr-detail-reminder-add` nằm trong block reminders; click mở QuickReminderModal với target CR; không còn `InputSearch` trong file; `SearchInput` giữ testid và hành vi lọc cũ; tsc sạch.</done>
</task>

<task type="auto">
  <name>Task 2: Test scoped cho reminder nhanh và search input</name>
  <files>src/views/__tests__/ChangeRequestDetailView.reminderAndSearch.test.tsx, .planning/STATE.md</files>
  <action>Tạo `src/views/__tests__/ChangeRequestDetailView.reminderAndSearch.test.tsx` với `// @vitest-environment jsdom`, dùng `ThemeAppHolder`, `new TaskPlannerDatabase('TestDB_cpo_' + Math.random())`, `createChangeRequest`, `createTask`, pattern `renderDetail` của `ChangeRequestDetailView.subsystemOptions.test.tsx`, `afterEach` gọi `db.delete()`. Viết 2 test: (a) 'dùng SearchInput chuẩn, không có nút search tách rời': tạo 1 CR + 1 task, render, lấy `screen.getByTestId('cr-detail-task-search')`, assert `querySelector('.ant-input-search-button')` là null và `querySelector('.ant-input-prefix .anticon-search')` tồn tại, placeholder vẫn là 'Tìm tác vụ'. (b) 'thêm nhắc nhở nhanh cho CR': tạo CR không reminders + 1 task, render, click `screen.getByTestId('cr-detail-reminder-add')`, assert dialog có tiêu đề chứa 'Thêm nhắc nhở: CR', click nút 'Lưu nhắc nhở', rồi `waitFor` đọc `await db.changeRequests.get(cr.id)` và assert `reminders` có độ dài 1 với `date` định dạng `YYYY-MM-DD`; đóng modal tự động. Không mock repository, không dùng snapshot, không chạy full suite. Sau khi test xanh, cập nhật `.planning/STATE.md`: thêm đúng một dòng `Last activity:` mới và một dòng decision ngắn `[Quick 261128-cpo]: ...` theo cú pháp hiện có, không sửa dòng/task khác.</action>
  <verify>
    <automated>npx vitest run src/views/__tests__/ChangeRequestDetailView.reminderAndSearch.test.tsx src/views/__tests__/ChangeRequestDetailView.subsystemOptions.test.tsx --bail=1</automated>
  </verify>
  <done>Cả test mới và test subsystemOptions cũ đậu; click nút reminder lưu được reminder vào CR; ô search không còn `.ant-input-search-button`; STATE.md phản ánh quick task mà không đụng entry khác.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| user input → CR reminders | Ngày/giờ/ghi chú do sếp nhập qua QuickReminderModal, ghi vào IndexedDB rồi có thể vào backup encrypted |
| task search box → filteredTasks | Chuỗi search là untrusted text, chỉ được dùng để lọc client-side |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-CPO-01 | Tampering | `QuickReminderModal` target CR | mitigate | Dùng nguyên modal có sẵn: `validateFields()` cho date, note trim + `maxLength=200`, patch đi qua `updateChangeRequest` vốn validate bằng Zod; không thêm input path mới |
| T-CPO-02 | Data loss | Append reminder vào `cr.reminders` | mitigate | Modal nhận `entity: cr` từ `useLiveQuery` hiện tại và chỉ append vào mảng reminders; không thay thế CR, không xoá reminder cũ, không đổi repository |
| T-CPO-03 | Information disclosure | `SearchInput` task filter | accept | Search chỉ chạy `searchIncludes` trên tên task trong bộ nhớ, không gửi mạng, không log, không lưu vào DB |
| T-CPO-SC | Tampering | npm/pip/cargo installs | accept | Quick task không cài package nào; dependency và lockfile giữ nguyên |

</threat_model>

<verification>
Chạy scoped, không chạy full vitest suite:
1. `npx tsc --noEmit -p tsconfig.json`
2. `npx vitest run src/views/__tests__/ChangeRequestDetailView.reminderAndSearch.test.tsx src/views/__tests__/ChangeRequestDetailView.subsystemOptions.test.tsx --bail=1`
3. `git diff --check`
4. Kiểm tra diff: chỉ 3 file trong `files_modified`; không đổi `QuickReminderModal`, repository, schema, dependency hay logic lọc task.
5. Browser verify (Chrome, light + dark tab CR detail có task): click 'Thêm nhắc nhở' → modal → lưu → reminder hiện trong section và count tăng; gõ vào ô search → icon kính lúp nằm sát trong input, không còn khoảng trống giữa input và nút.
</verification>

<success_criteria>
- `tsc`, 2 file test scoped và `git diff --check` đều xanh.
- Section 'Nhắc nhở' có nút 'Thêm nhắc nhở'; lưu xong reminder xuất hiện trong section, count tăng, không làm mất reminder cũ.
- Ô tìm tác vụ là `SearchInput`: có prefix `SearchOutlined`, không có `.ant-input-search-button`; filter theo tên/status vẫn chạy như cũ.
- Không thêm dependency, không đổi schema/DB, không đụng PWA/GitHub Pages, không refactor ngoài phạm vi 3 file.
</success_criteria>

<output>
Create `.planning/quick/261128-cpo-fix-cr-detail-reminder-quick-create-butt/261128-cpo-SUMMARY.md` when done
</output>
