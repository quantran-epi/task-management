---
phase: quick
plan: 261127-qrn
type: execute
wave: 1
depends_on: []
files_modified:
  - src/hooks/useTaskMenuItems.ts
  - src/components/tasks/TaskTable.tsx
  - src/views/ChangeRequestDetailView.tsx
  - src/views/ItemInsightView.tsx
  - src/workbench/toolwindows/CRExplorer.tsx
  - src/types/models.ts
  - src/validation/schemas.ts
  - src/validation/backupSchemas.ts
  - src/db/index.ts
  - src/db/schema.ts
  - src/db/repositories/changeRequestRepo.ts
  - src/db/repositories/taskRepo.ts
  - src/db/repositories/documentLinkRepo.ts
  - src/components/changeRequests/ChangeRequestModal.tsx
  - src/components/changeRequests/ChangeRequestTable.tsx
  - src/components/tasks/TaskDrawer.tsx
  - src/components/tasks/LinkedKnowledgeSection.tsx
  - src/services/backup/validateBackup.ts
  - src/services/ai/claudeCliService.ts
  - src/services/ai/contextGrounding.ts
  - src/services/ai/office/teamTools.ts
  - src/utils/recurrence.ts
  - src/components/agents/RunGhostDevModal.tsx
  - src/components/settings/GhostDevConfigCard.tsx
  - tests/components/TaskTable.test.tsx
  - tests/views/ChangeRequestDetailView.test.tsx
  - src/views/__tests__/ChangeRequestDetailView.subsystemOptions.test.tsx
  - tests/views/ItemInsightView.test.tsx
  - tests/workbench/CRExplorer.test.tsx
  - src/db/repositories/__tests__/namedQuickLinks.test.ts
  - tests/db/documentLinkRepo.test.ts
  - tests/services/backup/validateBackup.test.ts
  - tests/services/backup/v2Compatibility.test.ts
  - tests/db/repos.test.ts
  - tests/db/schemaV29Migration.test.ts
  - tests/components/TaskDrawer.test.tsx
  - tests/components/notes/DocEditorPane.test.tsx
  - tests/utils/smartIngestion.test.ts
  - tests/ai/CitationChipAndQuickPreview.test.tsx
  - tests/ai/aiTools.test.ts
  - tests/ai/chatActions.test.ts
  - tests/ai/contextGrounding.test.ts
autonomous: true
requirements:
  - QRN-01
  - QRN-02
  - QRN-03
  - QRN-04
  - QRN-05
must_haves:
  truths:
    - "CR detail bảng task có cột 'Thao tác' dùng chung task menu owner: Hỏi Trợ lý AI / Thêm nhắc nhở / Sửa tác vụ / Xóa (confirm + deleteTaskWithAllocations)"
    - "Task insight hiện tag system dạng `code — name`, click mở insight system; fallback 'Chung (không gắn)' và fallback systemId khi row hệ thống bị xóa"
    - "CR Explorer node CR có menu parity SystemsExplorer: Mở CR Detail / Tạo CR / Mở Git / Mở Terminal / Sửa / Xóa, resolve cr.targets (multi-target → submenu, không hard-code targets[0])"
    - "Task leaf trong CR Explorer có menu dùng chung task menu owner: mở insight / sửa / AI chat / nhắc nhở / xóa"
    - "ChangeRequest và Task chỉ có field link duy nhất `links: [{name, url}]`; documentLinks/quickLinks biến mất khỏi type, schema, form, repo, UI và mọi consumer"
    - "Dexie version(30) migrate documentLinks/quickLinks cũ sang links, dedupe theo url, xoá field cũ bằng delete; backup 13→14 normalize ở reader, writer chỉ ghi links"
    - "TaskTable, breadcrumb test cũ, subsystem cell testid và backup round-trip không regress"
  artifacts:
    - path: src/hooks/useTaskMenuItems.ts
      provides: "Shared task menu builder + delete owner dùng cho TaskTable, ChangeRequestDetailView, CRExplorer"
      contains: "useTaskMenuItems"
    - path: src/views/ChangeRequestDetailView.tsx
      provides: "Cột 'Thao tác' thứ 6 trên bảng task, gọi shared menu; clear placeholderTaskIdRef khi xóa task placeholder; link block dùng cr.links"
      contains: "Thao tác"
    - path: src/views/ItemInsightView.tsx
      provides: "Tag system trong header task insight với fallback + click mở system insight; link block dùng links"
      contains: "Chung (không gắn)"
    - path: src/workbench/toolwindows/CRExplorer.tsx
      provides: "CR menu đầy đủ qua useSystemActions + task leaf context menu"
      contains: "useSystemActions"
    - path: src/types/models.ts
      provides: "NamedLink + field links duy nhất trên ChangeRequest và Task"
      contains: "links?: NamedLink[]"
    - path: src/db/schema.ts
      provides: "SCHEMA_V30 spread từ SCHEMA_V29"
      contains: "SCHEMA_V30"
    - path: src/db/index.ts
      provides: "Dexie version(30).stores(SCHEMA_V30) + upgrade normalize tasks/changeRequests sang links"
      contains: "this.version(30)"
    - path: src/validation/backupSchemas.ts
      provides: "Backup record schema có links + field cũ optional để đọc v13; BACKUP_SCHEMA_VERSION = 14"
      contains: "BACKUP_SCHEMA_VERSION = 14"
    - path: src/services/backup/validateBackup.ts
      provides: "Normalize v13/v14: documentLinks + quickLinks -> links, dedupe url, envelope v14 đầu ra"
      contains: "normalizeLinkFields"
  key_links:
    - from: src/hooks/useTaskMenuItems.ts
      to: src/db/repositories/cascadeRepo.ts
      via: "deleteTaskWithAllocations(record.id, db) trong modal.confirm — một writer duy nhất"
      pattern: "deleteTaskWithAllocations"
    - from: src/components/tasks/TaskTable.tsx
      to: src/hooks/useTaskMenuItems.ts
      via: "replace local getTaskMenuItems bằng hook dùng chung cho cột actions + right-click + QuickReminderModal"
      pattern: "useTaskMenuItems"
    - from: src/views/ChangeRequestDetailView.tsx
      to: src/hooks/useTaskMenuItems.ts
      via: "cột 'Thao tác' render Dropdown trigger=['click'] từ shared builder; onOpenDrawer truyền vào hook"
      pattern: "useTaskMenuItems"
    - from: src/workbench/toolwindows/CRExplorer.tsx
      to: src/workbench/hooks/useSystemActions.ts
      via: "openGit/openTerminal/disabledReason cho từng cr.targets system"
      pattern: "useSystemActions"
    - from: src/workbench/toolwindows/CRExplorer.tsx
      to: src/hooks/useTaskMenuItems.ts
      via: "task leaf Dropdown contextMenu dùng chung builder, onOpenDrawer mở insight tab"
      pattern: "useTaskMenuItems"
    - from: src/db/index.ts
      to: src/types/models.ts
      via: "version(30) upgrade normalize tasks/changeRequests: documentLinks + quickLinks → links, dedupe url, delete field cũ"
      pattern: "row.links"
    - from: src/validation/schemas.ts
      to: src/validation/backupSchemas.ts
      via: "cùng namedLinkSchema (name 1-80, url linkSchema); backupSchema v14 giữ field cũ chỉ để đọc"
      pattern: "namedLinkSchema"
    - from: src/services/backup/validateBackup.ts
      to: src/services/backup/exportBackup.ts
      via: "validateBackupPayload normalize v13→v14; writer xuất CURRENT_SCHEMA_VERSION = BACKUP_SCHEMA_VERSION = 14"
      pattern: "CURRENT_SCHEMA_VERSION"
    - from: src/db/repositories/documentLinkRepo.ts
      to: src/types/models.ts
      via: "docId lưu dưới dạng link {name:'', url:docId}; mọi đọc/backlink tìm trong row.links"
      pattern: "links.some"
---

<objective>
Sửa 4 vấn đề theo đúng state owner: (1) CR detail task table có action nhanh dùng chung task menu, (2) Task detail hiện system gắn với task dạng tag click được, (3) CR explorer context menu đầy đủ tool parity SystemsExplorer cho CR node và task node, (4) hợp nhất `documentLinks` + `quickLinks` thành field duy nhất `links: [{name, url}]` trên `ChangeRequest` và `Task` — rebrand hoàn toàn ở data model, không alias.

Purpose: bỏ handler xóa/menu tự vẽ duplicate, tái dùng builder + hook có sẵn để hành vi nhất quán trên mọi surface; đồng nhất khái niệm link giữa UI (có tên) và knowledge/AI (UUID/path) để không còn hai nguồn sự thật. Không band-aid, không dependency mới, không đụng PWA/GitHub Pages.

Output: shared `useTaskMenuItems`, 3 view + CR Explorer cập nhật, model/schema/migration/backup chuyển sang `links`, test file UI + link/backup được cập nhật có chủ đích.

**Locked decisions đã áp dụng:**
- CR explorer menu = parity SystemsExplorer: CR node có `Mở CR Detail` / `Tạo CR` / `Mở Git` / `Mở Terminal` / `Sửa` / `Xóa`, dùng `useSystemActions`, resolve `cr.targets` (multi-target → submenu, không hard-code `targets[0]`); task leaf có mở insight / sửa / AI chat / nhắc nhở / xóa dùng chung task menu owner. Không thêm quick links riêng.
- Task insight: tag `code — name` click mở system insight; fallback "Chung (không gắn)" khi không có `systemId`; fallback `systemId` nếu row bị xóa. Không đổi breadcrumb test cũ.
- Link unification = rebrand hoàn toàn: field duy nhất `links?: NamedLink[]` với `{name: string, url: string}` trên `ChangeRequest` và `Task`. Xóa `documentLinks` và `quickLinks` khỏi type/schema/form/repo/UI. UUID doc vẫn nằm trong `url`; AI/knowledge/`documentLinkRepo` đọc `.url` thay vì `.documentLinks` (name có thể là tên doc hoặc `''`). Dexie schema version bump + migration chuyển `documentLinks` cũ → `links[{name:'', url}]` và `quickLinks` cũ → `links[{name,url}]`, dedupe URL; backup reader chấp nhận cả field cũ lẫn `links` rồi normalize; writer chỉ ghi `links`. Backup schema version bump 13→14. Không giữ alias field ở write path.
- Không band-aid: trích shared task-menu owner, CR detail không tự viết confirm/xóa riêng.
- Chỉ chạy scoped test; không full vitest; review diff + verify Chrome light/dark sau implement. Làm trên `pre-v1.6-baseline`, không branch/worktree mới.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/quick/261127-qrn-hai-l-i-ui-c-n-s-a-1-cr-detail-page-task/261127-qrn-RESEARCH.md
@src/components/tasks/TaskTable.tsx
@src/views/ChangeRequestDetailView.tsx
@src/views/ItemInsightView.tsx
@src/workbench/toolwindows/CRExplorer.tsx
@src/workbench/toolwindows/SystemsExplorer.tsx
@src/workbench/hooks/useSystemActions.ts
@src/db/repositories/cascadeRepo.ts
@src/types/models.ts
@src/validation/schemas.ts
@src/validation/backupSchemas.ts
@src/db/schema.ts
@src/db/index.ts
@src/services/backup/validateBackup.ts
@src/services/backup/exportBackup.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Trích shared task menu owner (QRN-01)</name>
  <files>src/hooks/useTaskMenuItems.ts, src/components/tasks/TaskTable.tsx, tests/components/TaskTable.test.tsx</files>
  <behavior>
    - Test 1 (giữ xanh): TaskTable cột 'Thao tác' và right-click vẫn có đủ 4 item `Hỏi Trợ lý AI`, `Thêm nhắc nhở`, `Sửa tác vụ`, `Xóa`.
    - Test 2: click `Xóa` vẫn mở confirm 'Xóa tác vụ' rồi gọi `deleteTaskWithAllocations(record.id, db)`; cancel không gọi repo.
    - Test 3: click 'Sửa tác vụ' gọi đúng `onOpenDrawer(record.id)`; 'Thêm nhắc nhở' mở `QuickReminderModal` với target task tương ứng (giữ mock có sẵn trong test).
  </behavior>
  <action>
    Tạo `src/hooks/useTaskMenuItems.ts`: export hook `useTaskMenuItems({ db, onOpenDrawer, onOpenInsight?, onDeleted? })` trả về `{ getTaskMenuItems, reminderTargetTask, setReminderTargetTask, reminderModal }` (hoặc shape tương đương đủ cho 3 consumer). Chuyển nguyên khối builder hiện ở `TaskTable.tsx:330-380` vào hook: item `ai-chat` gọi `openChat({ type:'task', id, title })` qua `useAIChat()` (hook có default context an toàn khi thiếu provider), item `add-reminder` set state target, item `edit` gọi `onOpenDrawer(record.id)`, item `open-insight` gọi `onOpenInsight?.(record.id)` khi được truyền (dùng cho task leaf CR Explorer), divider, item `delete` dùng `modal.confirm` + `deleteTaskWithAllocations(record.id, db)` + `message.success/error` y hệt hiện tại, rồi gọi `onDeleted?.(record.id)` sau repo xóa thành công. Modal/quick reminder JSX (`reminderTargetTask && <QuickReminderModal ...>`) cũng chuyển vào hook dưới dạng node để owner duy nhất; db truyền vào từ props, fallback `defaultDb` khi undefined.

    Trong `src/components/tasks/TaskTable.tsx`: xóa định nghĩa local `getTaskMenuItems`, xóa state `reminderTargetTask`, xóa import `QuickReminderModal`/`useAIChat`/`deleteTaskWithAllocations` nếu không còn dùng trực tiếp; gọi hook với `db` và `onOpenDrawer` từ props. Thay 2 call site tại dòng ~869 và ~1050 bằng `getTaskMenuItems(record)` / `getTaskMenuItems(contextMenu.record)` từ hook. Render `{reminderModal}` ở vị trí JSX cũ dòng ~1071. Giữ nguyên testid, aria-label, cột 'Thao tác', và logic right-click. Không đổi text confirm hay message — test hiện hữu pin chúng.

    Trong `tests/components/TaskTable.test.tsx`: giữ nguyên các assertion cũ; nếu mock `QuickReminderModal` stub tĩnh không còn start được do chuyển owner, cập nhật mock để render prop target tối thiểu phục vụ assert (không đổi kỳ vọng hành vi).
  </action>
  <verify>
    <automated>npx vitest run tests/components/TaskTable.test.tsx --bail=1 && npx tsc --noEmit</automated>
  </verify>
  <done>TaskTable hành vi y hệt trước, nhưng mọi item menu + xóa + reminder có một owner tại `src/hooks/useTaskMenuItems.ts`; tsc xanh. Commit riêng.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: CR detail action + Task insight system tag (QRN-01, QRN-02)</name>
  <files>src/views/ChangeRequestDetailView.tsx, src/views/ItemInsightView.tsx, tests/views/ChangeRequestDetailView.test.tsx, src/views/__tests__/ChangeRequestDetailView.subsystemOptions.test.tsx, tests/views/ItemInsightView.test.tsx</files>
  <behavior>
    - Test 1: `ChangeRequestDetailView` render 6 columnheader theo thứ tự `['Task', 'Subsystem', 'Status', 'Ước lượng', 'Hạn', 'Thao tác']` — cập nhật assertion cũ có chủ đích từ 5 thành 6.
    - Test 2: trong CR detail, click 'Xóa' trên action menu của task → confirm → repo xóa task + allocations; task biến mất khỏi bảng; khi task bị xóa là placeholder đang mở drawer thì `placeholderTaskIdRef` được clear (không xóa lần 2 lúc đóng drawer).
    - Test 3: `ItemInsightView` task có system gắn render tag chứa `PAYMENT_SVC — Payment Service`, click tag gọi `onNavigate('insight', { type:'system', id: sysA.id, ... })`; case `systemId` undefined render 'Chung (không gắn)' và không click được; case row hệ thống đã xóa render chính `systemId` làm fallback. Breadcrumb test cũ (`PAYMENT_SVC`) vẫn pass.
    - Test 4: subsystem test giữ nguyên `subsystem-cell-${id}` và columnheader Subsystem — không regress.
  </behavior>
  <action>
    Trong `src/views/ChangeRequestDetailView.tsx`: import `useTaskMenuItems` từ `../hooks/useTaskMenuItems`, gọi với `db` và `onOpenDrawer: openTaskDrawer`. Thêm cột thứ 6 `title: 'Thao tác'`, `key: 'actions'`, `width: 80`, render `Dropdown` (import từ `../components/ui`) với `menu={{ items: getTaskMenuItems(record) }}`, `trigger={['click']}`, nút `MoreOutlined` kiểu `type="text" size="small"` như TaskTable. Render `{reminderModal}` gần `{contextHolder}`. Không viết modal.confirm/xóa/cột actions mới trong file này.

    Xử lý placeholder: truyền `onDeleted: (taskId) => { if (taskId === placeholderTaskIdRef.current) placeholderTaskIdRef.current = null; }` vào hook — đảm bảo `handleCloseTaskDrawer` không gọi xóa lần 2. Giữ nguyên mọi cột cũ, `subsystem-cell-${id}`, `handleSubsystemChange`, filter, Empty.

    Trong `src/views/ItemInsightView.tsx`: dùng `parentSystem` đã có (`systemMap.get(currentTask.systemId)`), thêm một Tag/Button trong header task (gần Tag 'Tác vụ', không thay breadcrumb dòng ~355-390): nhãn `${parentSystem.code} — ${parentSystem.name}` khi có row; `currentTask.systemId` khi có id nhưng row bị xóa; `'Chung (không gắn)'` khi không có `systemId`. Chỉ gắn `onClick={() => onNavigate('insight', { type:'system', id: parentSystem.id, name: parentSystem.name })}` khi có row systems; 2 fallback render text thường (no-op). Dùng `Tag`/`Button`/`Space` đã import từ `../components/ui`. Không gọi `getAllSystems` mới, không đổi data-testid cũ, không đổi breadcrumb.

    Cập nhật test: `tests/views/ChangeRequestDetailView.test.tsx` đổi expected headers thành 6 phần tử có 'Thao tác' cuối, thêm case xóa task qua action menu (dùng pattern `fireEvent.click` + confirm trong `tests/components/TaskTable.test.tsx:367`), case placeholder nếu setup cho phép. `tests/views/ItemInsightView.test.tsx` thêm assert tag name + click navigate cho 3 case trên. Giữ `src/views/__tests__/ChangeRequestDetailView.subsystemOptions.test.tsx` nguyên trừ khi fail do cột mới — khi đó chỉ cập nhật index columnheader, không đổi testid.
  </action>
  <verify>
    <automated>npx vitest run tests/views/ChangeRequestDetailView.test.tsx src/views/__tests__/ChangeRequestDetailView.subsystemOptions.test.tsx tests/views/ItemInsightView.test.tsx tests/components/TaskTable.test.tsx --bail=1 && npx tsc --noEmit</automated>
  </verify>
  <done>CR detail có cột 'Thao tác' dùng chung owner, xóa task + placeholder đúng; Task insight có system tag click/fallback đúng; breadcrumb + subsystem test không regress. Commit riêng.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: CR Explorer context menu parity (QRN-03, QRN-04)</name>
  <files>src/workbench/toolwindows/CRExplorer.tsx, tests/workbench/CRExplorer.test.tsx</files>
  <behavior>
    - Test 1: context menu trên CR node (1 target) chứa đúng 6 item `Mở CR Detail`, `Tạo CR`, `Mở Git`, `Mở Terminal`, `Sửa`, `Xóa`; item Git/Terminal disabled kèm `title` = `SYSTEM_ACTIONS_DISABLED_REASON` khi subsystem chưa có SSH/repo.
    - Test 2: CR có 2 targets → menu có 2 submenu con cho `Mở Git` và `Mở Terminal`, mỗi submenu item tên hệ thống; click item đúng gọi `setActiveRemoteTarget` với target được chọn (không phải `targets[0]` cố định). Assert qua `useLayoutStore.getState()`.
    - Test 3: click `Tạo CR` mở `ChangeRequestModal` với `initialTargets` đúng target hệ thống; giữ nguyên assert menu text cũ.
    - Test 4: right-click task leaf → menu có mở insight (`openTab` viewType 'insight'), `Sửa tác vụ`, `Hỏi Trợ lý AI`, `Thêm nhắc nhở`, `Xóa`; click mở insight tạo tab đúng.
  </behavior>
  <action>
    Trong `src/workbench/toolwindows/CRExplorer.tsx`: import `useSystemActions` từ `../hooks/useSystemActions`, `getAllSystems` từ `../../db/repositories/systemRepo`, `useTaskMenuItems` từ `../../hooks/useTaskMenuItems`, icon `CloudServerOutlined`, `CodeOutlined`, `RocketOutlined` từ `../../components/ui/icon`; giữ import Dropdown/Button/Tag từ `../../components/ui`. Thêm `const systems = useLiveQuery(() => getAllSystems(db), [db]) ?? []` và `const systemMap = useMemo(() => new Map(systems.map((s) => [s.id, s])), [systems])`.

    CR menu: giữ nguyên 3 item cũ (`open-detail`, `edit`, `delete`) rồi chèn `Tạo CR` (mở `ChangeRequestModal` với `initialTargets` lấy từ `cr.targets`, tương đương `crModalTarget` của SystemsExplorer), `Mở Git`, `Mở Terminal` dùng `openGit/openTerminal/disabledReason` của `useSystemActions`. Resolve toàn bộ `cr.targets` qua `systemMap`: 1 target → item phẳng; ≥2 target → item có `children` là submenu, mỗi child `${s.code} — ${s.name}` (hoặc `t.systemId` khi row bị xóa), `disabled`/`title` theo `disabledReason(s)`, click `openGit(s)` / `openTerminal(s)`. Không hard-code `targets[0]`, không thêm quick links. Submenu phải dùng cấu trúc `MenuProps['items']` của antd (`children`), không tự vẽ dropdown lồng.

    Task leaf: gọi `useTaskMenuItems({ db, onOpenDrawer: ..., onOpenInsight: (taskId) => { const t = tasks.find((x) => x.id === taskId); if (t) openTaskInsight(t); }, onDeleted: ... })` với handler mở insight tạo tab insight đúng. Bọc `<TaskLeafTitle task={task} />` bằng `<Dropdown menu={{ items: getTaskMenuItems(task) }} trigger={['contextMenu']}>`, giữ nguyên style/flex/icon/file leaf. Render `{reminderModal}` trong component. Không viết menu xóa/AI/reminder mới trong CR Explorer.

    Trong `tests/workbench/CRExplorer.test.tsx`: mở rộng test menu CR hiện hữu thành assert 6 item; thêm test multi-target (seed CR 2 systems có SSH/repo) + assert submenu + store target đúng; thêm test task leaf context menu. Chỉ assert文字 menu tồn tại, không thay assert cũ. Nếu cần mock `useAIChat` hoặc `QuickReminderModal`, dùng cùng pattern `vi.mock` của `tests/components/TaskTable.test.tsx` — không thêm dependency.
  </action>
  <verify>
    <automated>npx vitest run tests/workbench/CRExplorer.test.tsx tests/components/TaskTable.test.tsx --bail=1 && npx tsc --noEmit</automated>
  </verify>
  <done>CR node có 6 item parity SystemsExplorer, multi-target chọn đúng system, task leaf có shared task menu; test cũ và mới xanh, tsc xanh. Commit riêng.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: Hợp nhất documentLinks + quickLinks thành links (QRN-05)</name>
  <files>src/types/models.ts, src/validation/schemas.ts, src/validation/backupSchemas.ts, src/db/index.ts, src/db/schema.ts, src/db/repositories/changeRequestRepo.ts, src/db/repositories/taskRepo.ts, src/db/repositories/documentLinkRepo.ts, src/components/changeRequests/ChangeRequestModal.tsx, src/components/changeRequests/ChangeRequestTable.tsx, src/components/tasks/TaskDrawer.tsx, src/components/tasks/TaskTable.tsx, src/components/tasks/LinkedKnowledgeSection.tsx, src/views/ChangeRequestDetailView.tsx, src/views/ItemInsightView.tsx, src/services/backup/validateBackup.ts, src/services/ai/claudeCliService.ts, src/services/ai/contextGrounding.ts, src/services/ai/office/teamTools.ts, src/utils/recurrence.ts, src/components/agents/RunGhostDevModal.tsx, src/components/settings/GhostDevConfigCard.tsx, src/db/repositories/__tests__/namedQuickLinks.test.ts, tests/db/documentLinkRepo.test.ts, tests/services/backup/validateBackup.test.ts, tests/services/backup/v2Compatibility.test.ts, tests/db/repos.test.ts, tests/db/schemaV29Migration.test.ts, tests/components/TaskDrawer.test.tsx, tests/components/TaskTable.test.tsx, tests/views/ItemInsightView.test.tsx, tests/components/notes/DocEditorPane.test.tsx, tests/utils/smartIngestion.test.ts, tests/ai/CitationChipAndQuickPreview.test.tsx, tests/ai/aiTools.test.ts, tests/ai/chatActions.test.ts, tests/ai/contextGrounding.test.ts</files>
  <behavior>
    - Test 1 (model/schema): `ChangeRequestInputSchema`, `ChangeRequestUpdateSchema`, `TaskInputSchema`, `TaskUpdateSchema` chỉ nhận `links: [{name,url}]`; document UUID/path và named quick link cùng chung field; name rỗng/>80 ký tự, url unsafe (javascript:, data:, relative) bị từ chối; field cũ `documentLinks`/`quickLinks` không còn emit ra output write.
    - Test 2 (migration): DB seed V29 có `documentLinks: [docId, 'https://x.test/a']` và `quickLinks: [{name:'Spec', url:'https://x.test/a'}]` → mở DB V30 có `links` theo thứ tự documentLinks rồi quickLinks, dedupe theo `url` (giữ bản đầu tiên), field cũ bị xoá hẳn (`'documentLinks' in row === false`, `'quickLinks' in row === false`) trên cả `tasks` và `changeRequests`. Row không có link cũ không bị ghi `links` rỗng.
    - Test 3 (backup): envelope v13 cũ (có `documentLinks`/`quickLinks` trong tasks/changeRequests) validate thành công, `validateBackupPayload(...).envelope` trả row đã normalize sang `links` dedupe; envelope v14 có `links` validate giữ nguyên; writer (`exportBackup`/`restoreBackupPayload` snapshot) chỉ ghi `schemaVersion: 14` và row chỉ có `links`; envelope version 15 vẫn bị từ chối. Test cũ pin `schemaVersion: 13` (`tests/services/backup/validateBackup.test.ts:110`) đổi có chủ đích thành fixture v13 riêng, không đổi ý nghĩa test reject version.
    - Test 4 (repo + consumer): `createChangeRequest`/`createTask`/`update*` chỉ write `links`; `documentLinkRepo.linkEntitiesToDoc`/`unlinkEntityFromDoc`/`getBacklinksForDoc` đọc/ghi `row.links` với entry `{name:'', url:docId}`, dedupe URL, giữ name cũ khi link đã tồn tại; `LinkedKnowledgeSection`, `claudeCliService`, `contextGrounding`, `teamTools`, `RunGhostDevModal`, `recurrence` đọc `.url` từ links; `ChangeRequestModal`/`TaskDrawer` form một danh sách link duy nhất; `ChangeRequestTable`/`ChangeRequestDetailView`/`ItemInsightView`/`TaskTable` render link từ `links`; `GhostDevConfigCard` giữ import util `browseLocalFile` từ `src/utils/documentLinks` (đây là tên module tiện ích, KHÔNG đổi tên file/util).
  </behavior>
  <action>
    **Model + validation:** Trong `src/types/models.ts`: thay `NamedQuickLink` bằng `NamedLink { name: string; url: string }`, xóa `documentLinks?: string[]` và `quickLinks?: ...` khỏi cả `ChangeRequest` và `Task`, thêm `links?: NamedLink[]`; cập nhật comment cũ nói "separate from documentLinks". Trong `src/validation/schemas.ts`: dùng `namedLinkSchema` duy nhất (giữ rule name 1-80/url `linkSchema` hiện tại), thay 8 chỗ `documentLinks`/`quickLinks` trong CR/task input+update bằng `links: z.array(namedLinkSchema).optional()`; không giữ alias field trong output. Trong `src/validation/backupSchemas.ts`: `BackupTaskRecordSchema` và `BackupChangeRequestRecordSchema` có `links: z.array(namedLinkSchema).optional()` cộng `documentLinks: z.array(linkSchema).optional()`, `quickLinks: z.array(namedQuickLinkSchema).optional()` CHỈ để đọc backup v13; `BACKUP_SCHEMA_VERSION` bump `13 → 14`; cập nhật comment D-49: link đổi meaning nên bump kèm normalize `13→14` thay vì reject. Giữ `linkSchema` để validate URL document link.

    **Dexie V30:** Trong `src/db/schema.ts` thêm `export const SCHEMA_V30 = { ...SCHEMA_V29 }`. Trong `src/db/index.ts` thêm ngay sau `version(29)` (~dòng 692-703): `this.version(30).stores(SCHEMA_V30).upgrade((tx) => Promise.all(['tasks','changeRequests'].map((table) => tx.table(table).toCollection().modify((row: Record<string, unknown>) => { const old = [...(Array.isArray(row.documentLinks) ? row.documentLinks.map((url) => ({ name: '', url })) : []), ...(Array.isArray(row.quickLinks) ? row.quickLinks : [])].filter((l) => l && typeof l.url === 'string'); const seen = new Set<string>(); const links = old.filter((l) => { if (seen.has(l.url)) return false; seen.add(l.url); return true; }); if (old.length > 0) row.links = links; delete row.documentLinks; delete row.quickLinks; }))))`. Dùng pattern `.upgrade((tx) => tx.table(...).toCollection().modify(...))` như V26/V28/V29; dùng `delete`, không gán `undefined`; chỉ gán `links` khi có link cũ. Test mới `tests/db/schemaV29Migration.test.ts` seed V29 rồi assert V30 normalize + field cũ biến mất; test migration cũ assert `LATEST_SCHEMA_VERSION`, không pin literal 29 → vẫn xanh.

    **Repo + backup reader:** `src/db/repositories/changeRequestRepo.ts` / `taskRepo.ts`: thay mọi nhắc `documentLinks`/`quickLinks` bằng `links` (create assignment + update patch key; `TaskUpdatePatch` union chỉ giữ `links`). `src/db/repositories/documentLinkRepo.ts`: mọi `currentDocLinks` đọc từ `row.links ?? []` lấy `.url`; ghi `links` với entry `{name:'', url:docId}` khi add (dedupe URL, giữ name cũ nếu link đã có), filter theo `.url !== docId` khi remove, backlink `links.some(l => l.url === docId)`. Trong `src/services/backup/validateBackup.ts`: thêm helper `normalizeLinkFields(records: unknown)` map row: nếu có `documentLinks`/`quickLinks` thì chuyển sang `links` như migration V30 (dedupe URL, document link name `''`), xóa field cũ; apply cho `rawTables.tasks` và `rawTables.changeRequests` trước `validateTable(...)`. Envelope gate chấp nhận `schemaVersion` 13 và 14 (13 normalize, 14 current); vẫn reject <13 và >14. Trả `schemaVersion: BACKUP_SCHEMA_VERSION (14)` trong `validEnvelope` thay vì `candidate.schemaVersion as number` để writer/restore chỉ xuất 14; `exportBackup.ts` tự động theo constant. Cập nhật `tests/services/backup/validateBackup.test.ts` (fixture v13 + case normalize) và `v2Compatibility.test.ts` (reject version vẫn đúng).

    **UI + consumer:** `ChangeRequestModal.tsx` / `TaskDrawer.tsx`: form giá trị `links: entity.links ?? []`, một Form.List duy nhất (giữ validation name/url), mỗi row có Input name, Input url, browse folder (`browseLocalFolder` gán vào `['links', field.name, 'url']`), open (`openDocumentLink(url)`); submit `links: cleaned.length ? cleaned : undefined`, bỏ cleanedLinks/cleanedQuickLinks và type field cũ. `LinkedKnowledgeSection.tsx`: prop `links?: NamedLink[]`, extract UUID từ `links.map(l => l.url)`. `ChangeRequestTable.tsx`/`TaskTable.tsx`: linkCount và render map đọc `record.links` (label `link.name || link.url`, `openDocumentLink(link.url)`). `ChangeRequestDetailView.tsx`: gộp docCount/quickLinkCount thành `linkCount: cr.links?.length ?? 0`, render một block link từ `cr.links`. `ItemInsightView.tsx`: gộp 2 block thành một block `currentTask?.links ?? currentCr?.links`; `openDocumentLink` nhận `.url`. `claudeCliService.ts`/`contextGrounding.ts`/`office/teamTools.ts`: thay `task.documentLinks`/`Array.isArray(item.documentLinks)` bằng `links` lọc `.url`, teamTools giữ normalize URL cũ. `recurrence.ts`: copy `links`. `RunGhostDevModal.tsx`: detect path từ `task.links.map(l => l.url)`. `GhostDevConfigCard.tsx`: giữ nguyên import `browseLocalFile` từ `src/utils/documentLinks`. KHÔNG đổi file `src/utils/documentLinks.ts`.

    **Tests khác:** cập nhật fixture/assert trong `tests/db/repos.test.ts`, `tests/components/TaskDrawer.test.tsx`, `tests/components/TaskTable.test.tsx`, `tests/views/ItemInsightView.test.tsx`, `tests/components/notes/DocEditorPane.test.tsx`, `tests/utils/smartIngestion.test.ts`, `tests/ai/CitationChipAndQuickPreview.test.tsx`, `tests/ai/aiTools.test.ts`, `tests/ai/chatActions.test.ts`, `tests/ai/contextGrounding.test.ts` sang field `links` dạng `[{name:'',url:...}]`; mở rộng `tests/db/documentLinkRepo.test.ts` cho format mới; rewrite `src/db/repositories/__tests__/namedQuickLinks.test.ts` theo behavior 1/4 ở trên. Không đổi kỳ vọng hành vi, chỉ đổi shape field.
  </action>
  <verify>
    <automated>npx vitest run src/db/repositories/__tests__/namedQuickLinks.test.ts tests/db/documentLinkRepo.test.ts tests/db/schemaV29Migration.test.ts tests/db/repos.test.ts tests/services/backup/validateBackup.test.ts tests/services/backup/v2Compatibility.test.ts tests/components/TaskDrawer.test.tsx tests/components/TaskTable.test.tsx tests/views/ItemInsightView.test.tsx tests/views/ChangeRequestDetailView.test.tsx tests/components/notes/DocEditorPane.test.tsx tests/utils/smartIngestion.test.ts tests/ai/CitationChipAndQuickPreview.test.tsx tests/ai/aiTools.test.ts tests/ai/chatActions.test.ts tests/ai/contextGrounding.test.ts --bail=1 && npx tsc --noEmit && npx eslint src && grep -rn "documentLinks\|quickLinks" src --include='*.ts' --include='*.tsx' | grep -v "src/utils/documentLinks.ts" | grep -v "backupSchemas.ts" | grep -v "validateBackup.ts" | grep -v "db/index.ts" || true</automated>
  </verify>
  <done>Mọi write path chỉ có `links`; migration V30 + backup v13→v14 normalize đúng, dedupe URL, field cũ bị xoá; mọi consumer đọc `.url`; scoped test + tsc + eslint xanh; grep chỉ còn field cũ ở reader/migration/backup schema được phép. Commit riêng.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Context menu → `deleteTaskWithAllocations` | Task id từ bản ghi IndexedDB, hành vi destructive phải confirm |
| Context menu → `useSystemActions` (Git/Terminal) | `sshConfigId`/`remoteRepoPath` từ hệ thống IndexedDB, có validate |
| Backup import → normalize links | Payload backup là input không tin cậy; URL link phải qua `namedLinkSchema`/`linkSchema` trước khi ghi Dexie |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-261127qrn-01 | Tampering | `useTaskMenuItems` delete item | mitigate | Giữ nguyên `modal.confirm` + `deleteTaskWithAllocations` transaction; không route qua handler xóa mới trong CR detail/CR Explorer. |
| T-261127qrn-02 | Tampering | `useSystemActions.openTerminal` | mitigate | Giữ validate `repoPath.startsWith('/')` + CONTROL_CHARS trong hook có sẵn; CR Explorer chỉ gọi hook, không tự dựng lệnh. |
| T-261127qrn-03 | Information disclosure | System tag trên ItemInsightView | accept | Chỉ render `code`/`name` từ bản ghi systems đã validate ở repo; không thêm secret hay input người dùng. |
| T-261127qrn-04 | Tampering | Backup v13 link normalization | mitigate | Normalize field cũ rồi validate qua `namedLinkSchema` (name 1-80, url http/https/file/UUID/absolute path), dedupe URL; không tin payload `links` v14 nếu sai schema. |
| T-261127qrn-SC | Tampering | npm/pip/cargo installs | mitigate | Không cài package mới — mọi component/icon lấy từ `src/components/ui`, `src/components/ui/icon`, hook nội bộ. |
</threat_model>

<verification>
Chạy từ checkout root. Tuyệt đối không chạy full `npx vitest run` (quy tắc dự án: > 1 giờ). Chỉ scoped path:

- Task 1: `npx vitest run tests/components/TaskTable.test.tsx --bail=1`
- Task 2: `npx vitest run tests/views/ChangeRequestDetailView.test.tsx src/views/__tests__/ChangeRequestDetailView.subsystemOptions.test.tsx tests/views/ItemInsightView.test.tsx tests/components/TaskTable.test.tsx --bail=1`
- Task 3: `npx vitest run tests/workbench/CRExplorer.test.tsx tests/components/TaskTable.test.tsx --bail=1`
- Task 4: `npx vitest run src/db/repositories/__tests__/namedQuickLinks.test.ts tests/db/documentLinkRepo.test.ts tests/db/schemaV29Migration.test.ts tests/db/repos.test.ts tests/services/backup/validateBackup.test.ts tests/services/backup/v2Compatibility.test.ts tests/components/TaskDrawer.test.tsx tests/components/TaskTable.test.tsx tests/views/ItemInsightView.test.tsx tests/views/ChangeRequestDetailView.test.tsx tests/components/notes/DocEditorPane.test.tsx tests/utils/smartIngestion.test.ts tests/ai/CitationChipAndQuickPreview.test.tsx tests/ai/aiTools.test.ts tests/ai/chatActions.test.ts tests/ai/contextGrounding.test.ts --bail=1`
- Gate chung: `npx tsc --noEmit`, `npx eslint src`, grep field cũ (chỉ reader/migration/backup schema được phép), review `git diff`, verify Chrome light+dark.

Sau khi code xanh: review diff rồi verify trong Chrome cả light và dark: CR detail bảng có cột Thao tác, click xóa có confirm; Task insight tag system click mở đúng system insight; CR Explorer right-click CR node (single + multi target) và task leaf; CR/Task form một danh sách link duy nhất hiển thị cả link UUID cũ lẫn link có tên. Không đụng PWA/GitHub Pages. Mỗi task commit riêng trên `pre-v1.6-baseline`.
</verification>

<success_criteria>
- CR detail, TaskTable, CR Explorer dùng chung một task menu owner (`useTaskMenuItems`), không confirm/xóa duplicate.
- CR detail bảng 6 cột, action xóa task cascade đúng, placeholder không xóa 2 lần.
- Task insight hiện tag `code — name` click mở system insight với 2 fallback đúng; breadcrumb test cũ không đổi.
- CR node menu parity SystemsExplorer, multi-target dùng submenu đúng target; task leaf có đủ menu.
- `ChangeRequest`/`Task` chỉ có `links: NamedLink[]`; documentLinks/quickLinks bị xóa khỏi mọi write path; DB V30 migration và backup v13→v14 normalize đúng, dedupe URL, không alias field.
- Scoped Vitest + tsc + eslint xanh; grep field cũ sạch (ngoại lệ reader/migration); diff reviewed + Chrome light/dark verified; không dependency mới, không full suite, không PWA/GitHub Pages.
</success_criteria>

<output>
Create `.planning/quick/261127-qrn-hai-l-i-ui-c-n-s-a-1-cr-detail-page-task/261127-qrn-SUMMARY.md` when done
</output>
