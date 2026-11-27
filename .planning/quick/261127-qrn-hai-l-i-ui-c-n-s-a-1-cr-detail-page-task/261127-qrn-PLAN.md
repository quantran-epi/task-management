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
  - tests/views/ChangeRequestDetailView.test.tsx
  - tests/views/ItemInsightView.test.tsx
  - tests/workbench/CRExplorer.test.tsx
  - tests/components/TaskTable.test.tsx
  - src/types/models.ts
  - src/validation/schemas.ts
  - src/validation/backupSchemas.ts
  - src/services/backup/validateBackup.ts
  - src/db/index.ts
  - src/db/repositories/changeRequestRepo.ts
  - src/db/repositories/taskRepo.ts
  - src/db/repositories/documentLinkRepo.ts
  - src/components/changeRequests/ChangeRequestModal.tsx
  - src/components/tasks/TaskDrawer.tsx
  - src/components/tasks/LinkedKnowledgeSection.tsx
  - src/services/ai/claudeCliService.ts
  - src/services/ai/contextGrounding.ts
  - src/services/ai/office/teamTools.ts
  - src/utils/recurrence.ts
  - src/components/agents/RunGhostDevModal.tsx
  - src/components/settings/GhostDevConfigCard.tsx
  - src/db/repositories/__tests__/namedQuickLinks.test.ts
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
    - "TaskTable, breadcrumb test cũ và subsystem cell testid không regress"
    - "ChangeRequest và Task chỉ có field `links: [{name, url}]`; `documentLinks`/`quickLinks` bị xóa khỏi model, schema, repo, form, UI và AI consumers"
    - "Dexie version(30) migrate documentLinks/quickLinks cũ sang links dedupe theo url; backup 13→14 normalize trước validate, export chỉ ghi links"
  artifacts:
    - path: src/hooks/useTaskMenuItems.ts
      provides: "Shared task menu builder + delete owner dùng cho TaskTable, ChangeRequestDetailView, CRExplorer"
      contains: "useTaskMenuItems"
    - path: src/views/ChangeRequestDetailView.tsx
      provides: "Cột 'Thao tác' thứ 6 trên bảng task, gọi shared menu; clear placeholderTaskIdRef khi xóa task placeholder"
      contains: "Thao tác"
    - path: src/views/ItemInsightView.tsx
      provides: "Tag system trong header task insight với fallback + click mở system insight"
      contains: "Chung (không gắn)"
    - path: src/workbench/toolwindows/CRExplorer.tsx
      provides: "CR menu đầy đủ qua useSystemActions + task leaf context menu"
      contains: "useSystemActions"
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
      via: "version(30) upgrade normalize tasks.changeRequests: documentLinks + quickLinks → links, dedupe url, delete field cũ"
      pattern: "links:"
    - from: src/services/backup/validateBackup.ts
      to: src/validation/backupSchemas.ts
      via: "v13 normalize documentLinks/quickLinks → links trước per-table validate; schemaVersion 14 là current"
      pattern: "BACKUP_SCHEMA_VERSION"
---

<objective>
Sửa 4 vấn đề theo đúng state owner: (1) CR detail task table có action nhanh dùng chung task menu, (2) Task detail hiện system gắn với task dạng tag click được, (3) CR explorer context menu đầy đủ tool parity SystemsExplorer cho CR node và task node, (4) hợp nhất `documentLinks` + `quickLinks` thành một khái niệm `links: [{name, url}]` trên ChangeRequest/Task.

Purpose: bỏ các handler xóa/menu tự vẽ duplicate, tái dùng builder + hook có sẵn để hành vi nhất quán trên mọi surface; gộp hai khái niệm link thành một field duy nhất có name; không band-aid, không dependency mới, không đụng PWA/GitHub Pages.

Output: shared `useTaskMenuItems`, 3 view được cập nhật, model/schema/repo/UI/AI consumers chuyển sang `links`, migration Dexie 30 + backup 14, test file được mở rộng/cập nhật có chủ đích.

**Locked decisions đã áp dụng:**
- CR explorer menu = parity SystemsExplorer: CR node có `Mở CR Detail` / `Tạo CR` / `Mở Git` / `Mở Terminal` / `Sửa` / `Xóa`, dùng `useSystemActions`, resolve `cr.targets` (multi-target → submenu, không hard-code `targets[0]`); task leaf có mở insight / sửa / AI chat / nhắc nhở / xóa dùng chung task menu owner. Không thêm quick links.
- Task insight: tag `code — name` click mở system insight; fallback "Chung (không gắn)" khi không có `systemId`; fallback `systemId` nếu row bị xóa. Không đổi breadcrumb test cũ.
- Link unification: rebrand hoàn toàn ở data model — `links?: NamedLink[]` với `{name, url}` trên ChangeRequest và Task; xóa `documentLinks`/`quickLinks` khỏi type/schema/form/repo/UI; UUID doc nằm trong `url`, AI/knowledge đọc `.url`; Dexie `version(30)` migrate, backup `13 → 14` normalize reader cũ, writer chỉ ghi `links`; không alias field cũ ở write path.
- Không band-aid: trích shared task-menu owner, CR detail không tự viết confirm/xóa riêng.
- Chỉ chạy scoped test; không full vitest; review diff + verify Chrome light/dark sau implement.
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
@src/services/backup/validateBackup.ts
@src/db/index.ts
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
    Tạo `src/hooks/useTaskMenuItems.ts`: export hook `useTaskMenuItems({ db, onOpenDrawer })` trả về `{ getTaskMenuItems, reminderTargetTask, setReminderTargetTask, reminderModal }` (hoặc shape tương đương đủ cho 3 consumer). Chuyển nguyên khối builder hiện ở `TaskTable.tsx:330-380` vào hook: item `ai-chat` gọi `openChat({ type:'task', id, title })` qua `useAIChat()` (hook này có default context an toàn khi thiếu provider), item `add-reminder` set state target, item `edit` gọi `onOpenDrawer(record.id)`, divider, item `delete` dùng `modal.confirm` + `deleteTaskWithAllocations(record.id, db)` + `message.success/error` y hệt hiện tại. Modal/quick reminder JSX (`reminderTargetTask && <QuickReminderModal ...>`) cũng chuyển vào hook dưới dạng node để owner duy nhất; db truyền vào từ props, fallback `defaultDb` khi undefined.

    Trong `src/components/tasks/TaskTable.tsx`: xóa định nghĩa local `getTaskMenuItems`, xóa state `reminderTargetTask`, xóa import `QuickReminderModal`/`useAIChat`/`deleteTaskWithAllocations` nếu không còn dùng trực tiếp; gọi hook với `db` và `onOpenDrawer` từ props. Thay 2 call site tại dòng ~869 và ~1050 bằng `getTaskMenuItems(record)` / `getTaskMenuItems(contextMenu.record)` từ hook. Render `{reminderModal}` ở vị trí JSX cũ dòng ~1071. Giữ nguyên testid, aria-label, cột 'Thao tác', và logic right-click. Không đổi text confirm hay message — test hiện hữu pin chúng.

    Trong `tests/components/TaskTable.test.tsx`: giữ nguyên các assertion cũ; nếu mock `QuickReminderModal` stub tĩnh không còn start được do chuyển owner, cập nhật mock để render prop target tối thiểu phục vụ assert (không đổi kỳ vọng hành vi).
  </action>
  <verify>
    <automated>npx vitest run tests/components/TaskTable.test.tsx --bail=1 && npx tsc --noEmit</automated>
  </verify>
  <done>TaskTable hành vi y hệt trước, nhưng mọi item menu + xóa + reminder có một owner tại `src/hooks/useTaskMenuItems.ts`; tsc xanh.</done>
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
    Trong `src/views/ChangeRequestDetailView.tsx`: import `useTaskMenuItems` từ `src/hooks/useTaskMenuItems.ts` (đường dẫn tương đối `../hooks/useTaskMenuItems`), gọi với `db` và `onOpenDrawer: openTaskDrawer`. Thêm cột thứ 6 `title: 'Thao tác'`, `key: 'actions'`, `width: 80`, render `Dropdown` (import từ `../components/ui`) với `menu={{ items: getTaskMenuItems(record) }}`, `trigger={['click']}`, nút `MoreOutlined` kiểu `type="text" size="small"` như TaskTable. Render `{reminderModal}` gần `{contextHolder}`. Không viết modal.confirm/xóa/cột actions mới trong file này.

    Xử lý placeholder: trong callback xóa của hook truyền `onDeleted?: (taskId) => void` (hoặc tương đương) để CR detail clear `placeholderTaskIdRef.current` khi `taskId === placeholderTaskIdRef.current` — đảm bảo `handleCloseTaskDrawer` không gọi xóa lần 2. Giữ nguyên mọi cột cũ, `subsystem-cell-${id}`, `handleSubsystemChange`, filter, Empty.

    Trong `src/views/ItemInsightView.tsx`: dùng `parentSystem` đã có (`systemMap.get(currentTask.systemId)`), thêm một Tag/Button trong header task (gần Tag 'Tác vụ', không thay breadcrumb dòng ~355-390): nhãn `${parentSystem.code} — ${parentSystem.name}` khi có row; `currentTask.systemId` khi có id nhưng row bị xóa; `'Chung (không gắn)'` khi không có `systemId`. Chỉ gắn `onClick={() => onNavigate('insight', { type:'system', id: parentSystem.id, name: parentSystem.name })}` khi có row systems; 2 fallback render text thường (no-op). Dùng `Tag`/`Button`/`Space` đã import từ `../components/ui`. Không gọi `getAllSystems` mới, không đổi data-testid cũ, không đổi breadcrumb.

    Cập nhật test: `tests/views/ChangeRequestDetailView.test.tsx` đổi expected headers thành 6 phần tử có 'Thao tác' cuối, thêm case xóa task qua action menu (dùng pattern `fireEvent.click` + confirm trong `tests/components/TaskTable.test.tsx:367`), case placeholder nếu setup cho phép. `tests/views/ItemInsightView.test.tsx` thêm assert tag name + click navigate cho 3 case trên. Giữ `src/views/__tests__/ChangeRequestDetailView.subsystemOptions.test.tsx` nguyên trừ khi fail do cột mới — khi đó chỉ cập nhật index columnheader, không đổi testid.
  </action>
  <verify>
    <automated>npx vitest run tests/views/ChangeRequestDetailView.test.tsx src/views/__tests__/ChangeRequestDetailView.subsystemOptions.test.tsx tests/views/ItemInsightView.test.tsx tests/components/TaskTable.test.tsx --bail=1 && npx tsc --noEmit</automated>
  </verify>
  <done>CR detail có cột 'Thao tác' dùng chung owner, xóa task + placeholder đúng; Task insight có system tag click/fallback đúng; breadcrumb + subsystem test không regress.</done>
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

    Task leaf: import/hook `useTaskMenuItems({ db, onOpenDrawer: (taskId) => { const t = tasks.find((x) => x.id === taskId); if (t) openTaskInsight(t); }, onDeleted: ... })`. Bọc `<TaskLeafTitle task={task} />` bằng `<Dropdown menu={{ items: getTaskMenuItems(task) }} trigger={['contextMenu']}>`, giữ nguyên style/flex/icon/file leaf. Render `{reminderModal}` trong component. Không viết menu xóa/AI/reminder mới trong CR Explorer.

    Trong `tests/workbench/CRExplorer.test.tsx`: mở rộng test menu CR hiện hữu thành assert 6 item; thêm test multi-target (seed CR 2 systems có SSH/repo) + assert submenu + store target đúng; thêm test task leaf context menu. Chỉ assert文字 menu tồn tại, không thay assert cũ. Nếu cần mock `useAIChat` hoặc `QuickReminderModal`, dùng cùng pattern `vi.mock` của `tests/components/TaskTable.test.tsx` — không thêm dependency.
  </action>
  <verify>
    <automated>npx vitest run tests/workbench/CRExplorer.test.tsx tests/components/TaskTable.test.tsx --bail=1 && npx tsc --noEmit</automated>
  </verify>
  <done>CR node có 6 item parity SystemsExplorer, multi-target chọn đúng system, task leaf có shared task menu; test cũ và mới xanh, tsc xanh.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: Hợp nhất links có name (QRN-05)</name>
  <files>src/types/models.ts, src/validation/schemas.ts, src/validation/backupSchemas.ts, src/services/backup/validateBackup.ts, src/db/index.ts, src/db/repositories/changeRequestRepo.ts, src/db/repositories/taskRepo.ts, src/db/repositories/documentLinkRepo.ts, src/components/changeRequests/ChangeRequestModal.tsx, src/components/tasks/TaskDrawer.tsx, src/components/tasks/LinkedKnowledgeSection.tsx, src/components/tasks/TaskTable.tsx, src/views/ChangeRequestDetailView.tsx, src/views/ItemInsightView.tsx, src/services/ai/claudeCliService.ts, src/services/ai/contextGrounding.ts, src/services/ai/office/teamTools.ts, src/utils/recurrence.ts, src/components/agents/RunGhostDevModal.tsx, src/components/settings/GhostDevConfigCard.tsx, src/db/repositories/__tests__/namedQuickLinks.test.ts, tests/db/documentLinkRepo.test.ts, tests/components/TaskDrawer.test.tsx, tests/components/TaskTable.test.tsx, tests/views/ItemInsightView.test.tsx, tests/views/ChangeRequestDetailView.test.tsx</files>
  <behavior>
    - Test 1: `NamedLink` schema nhận `{name, url}`; từ chối name trống/url không hợp lệ; cũ `documentLinks: string[]` và `quickLinks` không còn trong payload.
    - Test 2: Dexie `version(30)` upgrade migration: row có `documentLinks: ['id1','https://x']` + `quickLinks: [{name:'Docs',url:'https://y'}]` → `links` gồm cả ba, dedupe theo url, name rỗng cho UUID/string cũ; field cũ bị xóa hẳn (`undefined`).
    - Test 3: backup v13 chứa field cũ validate/normalize thành `links` trước khi per-table validate; export/schemaVersion 14 chỉ ghi `links`. Backup v14 round-trip đúng.
    - Test 4: `ChangeRequestModal` và `TaskDrawer` chỉ còn một danh sách "Links" với ô name + url + browse folder + open; save payload chỉ có `links`; `LinkedKnowledgeSection`, detail views, TaskTable, AI services, recurrence, ghost-dev/settings consumers đọc `.url` không dùng `.documentLinks`.
    - Test 5: `documentLinkRepo` thêm/bỏ doc link vẫn hoạt động trên `links` (dedupe url, giữ name cũ khi link đã tồn tại).
  </behavior>
  <action>
    1. `src/types/models.ts`: thay `NamedQuickLink` bằng `NamedLink { name: string; url: string }`, xóa `documentLinks`/`quickLinks`, thêm `links?: NamedLink[]` trên `ChangeRequest` và `Task`; cập nhật comment.
    2. `src/validation/schemas.ts` + `src/validation/backupSchemas.ts`: giữ `linkSchema` làm url validator, đổi `namedQuickLinkSchema` thành `namedLinkSchema`, thay mọi `documentLinks`/`quickLinks` bằng `links: z.array(namedLinkSchema).optional()`; `BACKUP_SCHEMA_VERSION = 14`.
    3. `src/services/backup/validateBackup.ts`: normalize payload v13 trong nhánh `schemaVersion < CURRENT` — map từng row `tasks`/`changeRequests`: gộp `documentLinks` (string → `{name:'', url}`) + `quickLinks` (giữ name) + `links` cũ, dedupe url, xóa field cũ, set `schemaVersion = 14` trước khi validate tables; vẫn giữ reject cho legacy projects/milestones và version > 14.
    4. `src/db/index.ts`: thêm `SCHEMA_V30` (giữ nguyên indexes) + `version(30).stores(SCHEMA_V30).upgrade(...)` modify cả `tasks` và `changeRequests` như trên, dùng `delete row.documentLinks/quickLinks`.
    5. `src/db/repositories/{changeRequestRepo,taskRepo}.ts`: thay assignOptional/field list từ documentLinks/quickLinks sang `links`; repo validate bằng schema mới.
    6. `src/db/repositories/documentLinkRepo.ts`: mọi đọc/ghi/has/remove doc link dùng `row.links` và so sánh `link.url === docId`; giữ name nếu link đã có, name rỗng khi thêm mới.
    7. Form editor: `ChangeRequestModal`, `TaskDrawer` gộp 2 `FormList` thành 1 `FormList name="links"` — mỗi row có Input name, Input url, nút browse folder (`browseLocalFolder` gán vào `['links', field.name, 'url']`), nút open (`openDocumentLink` với url); cleanup trim và filter name+url; payload chỉ `links`. Truyền `links` vào `LinkedKnowledgeSection` thay `documentLinks`.
    8. Consumers đọc: `ChangeRequestDetailView`, `ItemInsightView`, `TaskTable`, `claudeCliService`, `contextGrounding`, `teamTools`, `recurrence`, `RunGhostDevModal`, `GhostDevConfigCard` — đổi `documentLinks` thành `links` và map `.url` (hoặc `link.url`) cho mọi nơi từng kỳ vọng string[]. Không đổi text UI khác.
    9. Test: cập nhật `src/db/repositories/__tests__/namedQuickLinks.test.ts` thành link unification tests (model/schema/backup/round-trip), mở rộng `tests/db/documentLinkRepo.test.ts` cho format mới. Giữ assertions hành vi cũ ở các test UI, chỉ đổi field name/expected shape.
  </action>
  <verify>
    <automated>npx vitest run src/db/repositories/__tests__/namedQuickLinks.test.ts tests/db/documentLinkRepo.test.ts tests/db/repos.test.ts tests/components/TaskDrawer.test.tsx tests/components/TaskTable.test.tsx tests/views/ItemInsightView.test.tsx tests/views/ChangeRequestDetailView.test.tsx tests/ai/contextGrounding.test.ts tests/ai/aiTools.test.ts --bail=1 && npx tsc --noEmit && npx eslint src/db/index.ts src/validation/schemas.ts src/validation/backupSchemas.ts src/services/backup/validateBackup.ts src/types/models.ts</automated>
  </verify>
  <done>Mọi CR/Task chỉ có `links: [{name,url}]`; migration local + backup giữ dữ liệu cũ; mọi consumer đúng field; scoped test + tsc + eslint xanh; không alias field cũ ở write path.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Context menu → `deleteTaskWithAllocations` | Task id từ bản ghi IndexedDB, hành vi destructive phải confirm |
| Context menu → `useSystemActions` (Git/Terminal) | `sshConfigId`/`remoteRepoPath` từ hệ thống IndexedDB, có validate |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-261127qrn-01 | Tampering | `useTaskMenuItems` delete item | mitigate | Giữ nguyên `modal.confirm` + `deleteTaskWithAllocations` transaction; không route qua handler xóa mới trong CR detail/CR Explorer. |
| T-261127qrn-02 | Tampering | `useSystemActions.openTerminal` | mitigate | Giữ validate `repoPath.startsWith('/')` + CONTROL_CHARS trong hook có sẵn; CR Explorer chỉ gọi hook, không tự dựng lệnh. |
| T-261127qrn-03 | Information disclosure | System tag trên ItemInsightView | accept | Chỉ render `code`/`name` từ bản ghi systems đã validate ở repo; không thêm secret hay input người dùng. |
| T-261127qrn-SC | Tampering | npm/pip/cargo installs | mitigate | Không cài package mới — mọi component/icon lấy từ `src/components/ui`, `src/components/ui/icon`, hook nội bộ. |
</threat_model>

<verification>
Chạy từ checkout root. Tuyệt đối không chạy full `npx vitest run` (quy tức dự án: > 1 giờ). Chỉ scoped path:

- `npx vitest run tests/components/TaskTable.test.tsx --bail=1`
- `npx vitest run tests/views/ChangeRequestDetailView.test.tsx src/views/__tests__/ChangeRequestDetailView.subsystemOptions.test.tsx tests/views/ItemInsightView.test.tsx tests/components/TaskTable.test.tsx --bail=1`
- `npx vitest run tests/workbench/CRExplorer.test.tsx tests/components/TaskTable.test.tsx --bail=1`
- `npx tsc --noEmit`

- `npx vitest run src/db/repositories/__tests__/namedQuickLinks.test.ts tests/db/documentLinkRepo.test.ts tests/db/repos.test.ts tests/components/TaskDrawer.test.tsx tests/components/TaskTable.test.tsx tests/views/ItemInsightView.test.tsx tests/views/ChangeRequestDetailView.test.tsx tests/ai/contextGrounding.test.ts tests/ai/aiTools.test.ts --bail=1`
- `npx eslint src/db/index.ts src/validation/schemas.ts src/validation/backupSchemas.ts src/services/backup/validateBackup.ts src/types/models.ts`

Sau khi code xanh: review diff (`git diff`) rồi verify trong Chrome cả light và dark: CR detail bảng có cột Thao tác, click xóa có confirm; Task insight tag system click mở đúng system insight; CR Explorer right-click CR node (single + multi target) và task leaf; CR/Task form chỉ còn một mục Links có tên. Không đụng PWA/GitHub Pages.
</verification>

<success_criteria>
- CR detail, TaskTable, CR Explorer dùng chung một task menu owner (`useTaskMenuItems`), không confirm/xóa duplicate.
- CR detail bảng 6 cột, action xóa task cascade đúng, placeholder không xóa 2 lần.
- Task insight hiện tag `code — name` click mở system insight với 2 fallback đúng; breadcrumb test cũ không đổi.
- CR node menu parity SystemsExplorer, multi-target dùng submenu đúng target; task leaf có đủ menu.
- Mọi CR/Task chỉ có `links: [{name,url}]`; migration Dexie 30 + backup 14 giữ dữ liệu cũ.
- Scoped Vitest + tsc + eslint xanh; diff reviewed + Chrome light/dark verified; không dependency mới, không full suite.
</success_criteria>

<output>
Create `.planning/quick/261127-qrn-hai-l-i-ui-c-n-s-a-1-cr-detail-page-task/261127-qrn-SUMMARY.md` when done
</output>
