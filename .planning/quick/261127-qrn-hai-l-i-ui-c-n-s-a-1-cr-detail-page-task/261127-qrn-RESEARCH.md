# Quick Research 261127-qrn — 3 lỗi UI CR detail / Task detail / CR Explorer

**Researched:** 2026-11-27
**Domain:** codebase TaskMate Tauri, React 19 + AntD wrapper + Dexie
**Confidence:** MEDIUM (code facts HIGH; ý nghĩa exact của "yêu cầu mới nhất" cho menu CR chưa có trong artifact)

## Summary

Ba lỗi đều là lỗi bề mặt UI, không phải lỗi schema/query. [VERIFIED: codebase grep]

1. `ChangeRequestDetailView.tsx` tự vẽ bảng task 5 cột, không có cột "Thao tác". Hành vi xóa task đã tồn tại đầy đủ tại `TaskTable.getTaskMenuItems` và repo `deleteTaskWithAllocations`. Đây là state owner đúng: repo cascade + menu builder dùng chung, không tạo handler xóa mới trong CR detail.
2. "Task detail" theo nghĩa artifact gần nhất là `ItemInsightView` (`quick-261127-c3r` gọi `ItemInsightView` là Task detail). Component này đã resolve `currentTask.systemId` → `parentSystem` → breadcrumb (chỉ `code`) và test đã assert `PAYMENT_SVC`. Thiếu là một field/tag hiển thị rõ tên system trong header; không cần query mới.
3. `CRExplorer.tsx` mới có menu CR 3 item (Mở CR Detail / Sửa / Xóa); task leaf không có menu. `SystemsExplorer.tsx` đã có menu đầy đủ cho subsystem (Xem chi tiết / Tạo CR / Mở Git / Mở Terminal / Sửa / Xóa) và dùng chung `useSystemActions`. Đây là pattern cần tái dùng.

**Primary recommendation:** sửa tại owner: shared task-menu builder cho CR detail, dùng `parentSystem` có sẵn cho task detail, tái dùng `useSystemActions` + menu pattern của SystemsExplorer cho CR Explorer. Không thêm dependency.

## Project Constraints (from CLAUDE.md)

- Mọi thảo luận/UAT bằng tiếng Việt; xưng "sếp"; giữ identifier, path, lệnh, code nguyên gốc.
- Không band-aid: sửa tại state owner, nếu nhiều lỗi cùng root cause thì gom thành một thay đổi cấu trúc.
- Tauri là runtime chính; không đụng PWA/GitHub Pages.
- Mọi control AntD phải import qua `src/components/ui`, icon qua `src/components/ui/icon`; ESLint chặn import trực tiếp.
- IndexedDB/Dexie là nguồn dữ liệu; ID do client tạo (`crypto.randomUUID()`); hierarchy change không đổi ID.
- Sau sửa UI: scoped test → review diff → verify trực quan trong Chrome (light + dark).
- Không chạy full `vitest run`; luôn scoped path.
- Làm việc trên nhánh `pre-v1.6-baseline` (đang đúng); không branch/worktree khác.

Không có `CONTEXT.md` trong thư mục quick task này; không có locked decision bổ sung.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|---|---|---|---|
| Task delete + xác nhận | UI owner (`TaskTable` menu builder) | `cascadeRepo.deleteTaskWithAllocations` | Repo đã là single writer transaction; menu chỉ gọi repo. |
| System gắn với task | Task detail read surface (`ItemInsightView`) | `TasksView`/`TaskTable` (đã có cột Subsystem) | `Task.systemId` + `getAllSystems` đã load sẵn; không cần join/query mới. |
| Context menu CR Explorer | `CRExplorer` (tree node title) | `useSystemActions` + `layoutStore` | Explorerowns menu; Git/Terminal action là shared hook đã tồn tại. |

## Current State — findings chi tiết

### Issue 1 — CR detail task table thiếu action nhanh

- File: `/Users/tranducquan/Working/Personal/task-management/src/views/ChangeRequestDetailView.tsx`
  - Bảng tự định nghĩa inline `columns` tại dòng ~496-579 với đúng 5 cột: `Task`, `Subsystem`, `Status`, `Ước lượng`, `Hạn`. [VERIFIED: codebase read]
  - Task name click mở `TaskDrawer`; Subsystem dùng `Select` + `handleSubsystemChange` → `updateTask`. [VERIFIED: codebase read]
  - CR đã import `DeleteOutlined`, `deleteTaskWithAllocations`, `useTaskMateModal` nhưng chỉ dùng cho việc xóa CR và dọn placeholder drawer. [VERIFIED: codebase read]
  - Có rủi ro nhỏ khi xóa đúng placeholder task vừa tạo bởi `handleCreateTask`: `placeholderTaskIdRef` vẫn giữ ID → `handleCloseTaskDrawer` gọi xóa lần 2. [VERIFIED: codebase read]
- Owner hành vi:
  - `/Users/tranducquan/Working/Personal/task-management/src/components/tasks/TaskTable.tsx` dòng ~330-380: `getTaskMenuItems(record)` gồm Hỏi Trợ lý AI / Thêm nhắc nhở / Sửa tác vụ / Xóa (modal.confirm → `deleteTaskWithAllocations`). Cùng builder dùng cho cột `Thao tác` (dòng ~856) và right-click menu (dòng ~1048). [VERIFIED: codebase read]
  - `/Users/tranducquan/Working/Personal/task-management/src/db/repositories/cascadeRepo.ts` dòng ~86: `deleteTaskWithAllocations` dùng `db.transaction`. Đây là single writer. [VERIFIED: codebase grep]
- Test bị affect:
  - `/Users/tranducquan/Working/Personal/task-management/tests/views/ChangeRequestDetailView.test.tsx:104` assert đúng `['Task', 'Subsystem', 'Status', 'Ước lượng', 'Hạn']`. Phải cập nhật có chủ đích khi thêm cột action. [VERIFIED: codebase read]
  - `/Users/tranducquan/Working/Personal/task-management/src/views/__tests__/ChangeRequestDetailView.subsystemOptions.test.tsx` chỉ chờ columnheader Subsystem và `subsystem-cell-${id}`; giữ nguyên các testid này. [VERIFIED: codebase read]
- Đề xuất: trích `getTaskMenuItems` thành hook dùng chung (ví dụ `src/hooks/useTaskMenuItems.ts` hoặc export từ `TaskTable`), rồi CR detail thêm cột thứ 6 `Thao tác` dùng cùng builder. Tối thiểu phải gọi chung `deleteTaskWithAllocations` + confirm pattern; không viết repo xóa mới. Khi xóa placeholder đang mở drawer, clear `placeholderTaskIdRef`.

### Issue 2 — Task detail không show system gắn với task

- "Task detail" = `/Users/tranducquan/Working/Personal/task-management/src/views/ItemInsightView.tsx` (theo `quick-261127-c3r-PLAN.md`). [VERIFIED: planning doc]
- Hiện tại:
  - `systemMap` từ `getAllSystems(db)` (dòng ~83/95); `parentSystem = systemMap.get(currentTask.systemId)` (dòng ~137-140). [VERIFIED: codebase read]
  - Breadcrumb task gồm CR code + system code (dòng ~355-390) nhưng không có nhãn "Subsystem". Test `tests/views/ItemInsightView.test.tsx:83-84` đã assert code `PAYMENT_SVC` xuất hiện. [VERIFIED: codebase read]
  - Header task (dòng ~401-475) có Tag "Tác vụ", status, priority, Jira key; focus strip (dòng ~565-590) có Ước tính / Đã thực hiện / Đã phân bổ / Checklist / Hạn chót — không có system. [VERIFIED: codebase read]
- `Task.systemId?: string` — optional, "must be one of the CR's targets" (`src/types/models.ts:108`). [VERIFIED: codebase read]
- `TasksView` và `TaskTable` đã có cột Subsystem (`TaskTable.tsx:571-593`) nên không phải lỗi thiếu query ở danh sách. [VERIFIED: codebase read]
- Đề xuất: thêm một dòng/Tag có nhãn rõ trong header task insight, dùng `parentSystem` có sẵn: ưu tiên `code — name`, fallback "Chung (không gắn)" khi `!currentTask.systemId`, fallback `systemId` khi system row bị xóa (giống CR detail). Không thêm `getAllSystems` call mới; không đổi `data-testid` cũ.

### Issue 3 — CR Explorer cần context menu đầy đủ tool

- File: `/Users/tranducquan/Working/Personal/task-management/src/workbench/toolwindows/CRExplorer.tsx`
  - `getCrMenu` (dòng ~104-144) chỉ có 3 item: `open-detail`, `edit`, `delete`. Gắn `<Dropdown trigger={['contextMenu']}>` trên title node CR (dòng ~172). Task leaf (`TaskLeafTitle`, dòng ~54) không có Dropdown. [VERIFIED: codebase read]
  - `treeData` dùng `tasks.filter(t => t.crId === cr.id)`; `changeRequests`/`tasks` đã load qua `useLiveQuery`. [VERIFIED: codebase read]
- Pattern chuẩn đã có:
  - `/Users/tranducquan/Working/Personal/task-management/src/workbench/toolwindows/SystemsExplorer.tsx` `getNodeMenu` (dòng ~94-163): `Xem chi tiết`, `Tạo CR`, `Mở Git`, `Mở Terminal`, `Sửa`, `Xóa`; item disabled kèm `title: reason` lấy từ `disabledReason`. [VERIFIED: codebase read]
  - `/Users/tranducquan/Working/Personal/task-management/src/workbench/hooks/useSystemActions.ts`: `useSystemActions()` trả `openGit`, `openTerminal`, `disabledReason`; store đọc tại click time; `openGit` activate LEFT `remote_explorer`, `openTerminal` setPendingTerminalTarget rồi mở bottom `terminal`. [VERIFIED: codebase read]
  - Component `Dropdown` wrapper: `/Users/tranducquan/Working/Personal/task-management/src/components/ui/dropdown.tsx`, export từ `src/components/ui/index.ts`. Icon wrapper đầy đủ `CloudServerOutlined`, `CodeOutlined`, `RocketOutlined`, `ExportOutlined`, `EditOutlined`, `DeleteOutlined`, `PlusOutlined`, `MoreOutlined` tại `src/components/ui/icon.tsx`. [VERIFIED: codebase grep]
- Đề xuất: CR Explorer import `useSystemActions`, resolve system từ `cr.targets[].systemId` qua map hệ thống đã load. Vì CR có thể target nhiều system, dùng Dropdown nested `children` (submenu) liệt kê các target có cấu hình SSH/repo; nếu chỉ 1 target thì item phẳng. Giữ nguyên 3 item cũ. Với task leaf, ít nhất thêm menu mở insight + sửa + xóa dùng `getTaskMenuItems` dùng chung (Issue 1). [ASSUMED — "full tool" chưa được liệt kê trong artifact; xem Open Questions]
- Test hiện tại: `/Users/tranducquan/Working/Personal/task-management/tests/workbench/CRExplorer.test.tsx:134-146` assert menu text có `Mở CR Detail`, `Sửa`, `Xóa`; mở rộng assert thay vì thay thế. [VERIFIED: codebase read]

## Standard Stack (không thêm package)

| Library | Version | Purpose | Source |
|---|---|---|---|
| React | 19.3.0 | UI | CLAUDE.md (đã pinned) |
| Ant Design qua `src/components/ui` | 6.6.5 | Dropdown/Menu/Table/Tag/Modal wrapper | CLAUDE.md + codebase |
| Dexie + dexie-react-hooks | 4.4.6 / 4.4.0 | `useLiveQuery`, repo IndexedDB | CLAUDE.md + codebase |
| Vitest + Testing Library | 5.0.2 / 16.3.3 | scoped regression | CLAUDE.md |

**Installation:** none. Package Legitimacy Audit: không có package mới → không áp dụng.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Xóa task + allocation | handler xóa tự viết trong CR detail | `cascadeRepo.deleteTaskWithAllocations` + shared menu builder | transaction, cascade đã đúng; tránh duplicate owner. |
| Resolve system của task/CR | query Dexie mới / join | `getAllSystems` + Map đã load trong view | dữ liệu đã có; D-46 đảm bảo `systemId` nằm trong `cr.targets`. |
| Git/Terminal action | store manipulation trực tiếp ở CR Explorer | `useSystemActions` | một hook cho mọi consumer, click-time store read. |
| Dropdown/context menu | raw antd import / custom positioned div | `components/ui/dropdown` + pattern `trigger={['contextMenu']}` | guardrail ESLint + token dùng chung. |
| UUID | `uuid` package | `crypto.randomUUID()` | CLAUDE.md. |

## Common Pitfalls

- **Pinning test 5 cột:** đổi CR detail thành 6 cột mà quên `tests/views/ChangeRequestDetailView.test.tsx` → fail. Cập nhật assertion có chủ đích.
- **Double delete placeholder:** xóa task vừa tạo trong CR detail mà không clear `placeholderTaskIdRef` → drawer close gọi xóa lần 2 (xem `handleCloseTaskDrawer`). [VERIFIED: codebase read]
- **Import AntD trực tiếp:** dùng `import { Dropdown } from 'antd'` thay vì `../components/ui` → ESLint guard vi phạm.
- **Giả định single target:** CR có thể có nhiều `cr.targets`; hard-code `targets[0]` cho Git/Terminal sẽ chọn sai hệ thống.
- **Full test suite:** tuyệt đối không `npx vitest run` không scoped (hơn 1 giờ).
- **PWA/GitHub Pages:** không đụng; runtime là Tauri.

## Code Examples (pattern có sẵn, không copy bản mới)

```tsx
// Source: src/workbench/toolwindows/SystemsExplorer.tsx:94-163 (pattern menu + disabledReason)
const getNodeMenu = (system: System): MenuProps['items'] => {
  const reason = disabledReason(system);
  return [
    { key: 'open-git', icon: <CloudServerOutlined />, label: 'Mở Git',
      disabled: !!reason, ...(reason ? { title: reason } : {}), onClick: () => openGit(system) },
    { key: 'open-terminal', icon: <CodeOutlined />, label: 'Mở Terminal',
      disabled: !!reason, ...(reason ? { title: reason } : {}), onClick: () => openTerminal(system) },
  ];
};
```

```tsx
// Source: src/workbench/toolwindows/CRExplorer.tsx:172 (pattern context-menu trên tree node)
<Dropdown menu={{ items: getCrMenu(cr) ?? [] }} trigger={['contextMenu']}>
  <div>...</div>
</Dropdown>
```

```tsx
// Source: src/components/tasks/TaskTable.tsx:357-379 (pattern xóa task có confirm)
{
  key: 'delete', danger: true, label: 'Xóa', onClick: () => modal.confirm({
    title: 'Xóa tác vụ', okText: 'Xóa', okButtonProps: { danger: true },
    onOk: async () => { await deleteTaskWithAllocations(record.id, db); },
  }),
}
```

## Validation Architecture

Config: `workflow.nyquist_validation: true`, `security_enforcement: true` (`.planning/config.json`).

### Test Framework

| Property | Value |
|---|---|
| Framework | Vitest 5.0.2 + @testing-library/react |
| Config | `vite.config.ts` (fileParallelism: false) |
| Quick run | `npx vitest run tests/views/ChangeRequestDetailView.test.tsx src/views/__tests__/ChangeRequestDetailView.subsystemOptions.test.tsx tests/views/ItemInsightView.test.tsx tests/workbench/CRExplorer.test.tsx tests/components/TaskTable.test.tsx --bail=1` |
| Full suite | `npx vitest run` — KHÔNG dùng theo memory `test-scope-focus-only` |

### Requirements → Test Map (quick task, ID tự gán)

| ID | Behavior | Test file | Trạng thái |
|---|---|---|---|
| Q1 | CR detail có action xóa task, confirm, cascade đúng | `tests/views/ChangeRequestDetailView.test.tsx` + `src/views/__tests__/ChangeRequestDetailView.subsystemOptions.test.tsx` | cần thêm test + update header assertion |
| Q2 | Task insight hiển thị system gắn (code + name / fallback) | `tests/views/ItemInsightView.test.tsx` | test cũ chỉ assert code; thêm assert nhãn |
| Q3 | CR node context menu đủ tool; task leaf có menu | `tests/workbench/CRExplorer.test.tsx` | cần mở rộng |
| Q0 | TaskTable menu dùng chung không regress | `tests/components/TaskTable.test.tsx` | giữ xanh |

Additional gates: `npx tsc --noEmit`, `npx eslint src`, review diff, verify UI trong Chrome (light + dark) theo memory `review-and-browser-verify`.

### Wave 0 Gaps

- None — infrastructure sẵn. Chỉ cần test case mới trong 3 file hiện hữu.

## Security Domain

- V5 Input Validation: không có trust boundary mới. Mọi giá trị `systemId`, `crId`, `taskId` vẫn lấy từ bản ghi IndexedDB; `openTerminal` đã validate `repoPath` bằng `startsWith('/')` + `CONTROL_CHARS` trong `useSystemActions`. [VERIFIED: codebase read]
- V4 Access Control: action destructive (`Xóa`) vẫn qua `modal.confirm`; giữ nguyên. [VERIFIED: codebase read]
- V6 Cryptography: không đụng.
- Không lưu token/passphrase mới.

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|---|---|---|
| A1 | "CR explorer context menu đầy đủ tool" = parity menu subsystem của SystemsExplorer (Xem chi tiết / Tạo CR / Mở Git / Mở Terminal / Sửa / Xóa), áp dụng cho CR targets | Issue 3 | Nếu sếp muốn bộ item khác, planner/executor làm sai scope. Cần xác nhận. |
| A2 | "Tasks detail page không show system" là `ItemInsightView` task, và yêu cầu là một nhãn system rõ ràng trong header chứ không phải breadcrumb code-only | Issue 2 | Có thể sửa nhầm chỗ (TasksView list đã có cột Subsystem). Cần xác nhận ngắn với sếp. |
| A3 | Task leaf trong CR Explorer cũng cần context menu | Issue 3 | Có thể chỉ cần menu CR node. Chi phí thấp, nhưng vẫn là scope decision. |

## Open Questions

1. **Bộ item "đầy đủ tool" cho CR explorer là gì chính xác?**
   - What we know: SystemsExplorer có 6 item; CRExplorer có 3.
   - Unclear: artifact quick task ghi "bổ sung yêu cầu mới nhất của user" nhưng không kèm danh sách; không có file prompt khác trong thư mục.
   - Recommendation: hỏi sếp một câu ngắn, xác nhận parity với SystemsExplorer + submenu cho multi-target. Nếu không kịp hỏi, mặc định parity (A1).
2. **Task detail muốn hiện system dạng nào?**
   - What we know: breadcrumb đã có code; test đã assert code.
   - Unclear: có cần cả name, có cần click mở system insight hay không.
   - Recommendation: Tag `CODE — name`, click mở `insight` system (dùng `onNavigate('insight', { type:'system', id })` đã có trong file).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| Node/npm | build, test | ✓ | Node 24 LTS theo CLAUDE.md | — |
| Tauri CLI | runtime chính | ✓ (`npm run tauri:*` scripts tồn tại) | xem `src-tauri` | — |
| Chrome | UAT trực quan | cần sếp xác nhận trong phiên chạy | — | chỉ report fail nếu không có |

## Sources

### HIGH confidence — codebase read/grep
- `src/views/ChangeRequestDetailView.tsx`
- `src/views/ItemInsightView.tsx`
- `src/views/TasksView.tsx`
- `src/components/tasks/TaskTable.tsx`
- `src/workbench/toolwindows/CRExplorer.tsx`
- `src/workbench/toolwindows/SystemsExplorer.tsx`
- `src/workbench/hooks/useSystemActions.ts`
- `src/db/repositories/cascadeRepo.ts`, `systemRepo.ts`, `taskRepo.ts`
- `src/types/models.ts`, `src/components/ui/dropdown.tsx`, `src/components/ui/icon.tsx`
- `tests/views/ChangeRequestDetailView.test.tsx`, `tests/views/ItemInsightView.test.tsx`, `tests/workbench/CRExplorer.test.tsx`, `src/views/__tests__/ChangeRequestDetailView.subsystemOptions.test.tsx`

### MEDIUM confidence — planning doc
- `.planning/quick/261127-c3r-add-named-quick-links-to-cr-detail-and-t/261127-c3r-PLAN.md` (xác định "Task detail" = `ItemInsightView`)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — không thêm package, mọi import đãverify.
- Architecture/owner: HIGH — repo + menu builder + hook hiện hữu, đọc trực tiếp.
- Scope chi tiết item menu: LOW/ASSUMED — artifact không liệt kê; cần xác nhận sếp.

**Research date:** 2026-11-27
**Valid until:** 2026-12-04 (codebase thay đổi nhanh; artifact quick task có thể cập nhật sớm hơn)
