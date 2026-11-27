---
phase: quick
plan: 261127-qrn
subsystem: task-menu-links-workbench
tags: [task-menu, cr-detail, item-insight, cr-explorer, link-unification, dexie-v30, backup-v14]
dependency_graph:
  requires: []
  provides: [QRN-01, QRN-02, QRN-03, QRN-04, QRN-05]
  affects: [TaskTable, ChangeRequestDetailView, ItemInsightView, CRExplorer, ChangeRequest, Task]
tech_stack:
  added: []
  patterns: [shared-menu-owner, single-link-field, dexie-upgrade-migration, backup-reader-normalize, scoped-vitest-gates]
key_files:
  created:
    - src/hooks/useTaskMenuItems.tsx
  modified:
    - src/components/tasks/TaskTable.tsx
    - src/views/ChangeRequestDetailView.tsx
    - src/views/ItemInsightView.tsx
    - src/workbench/toolwindows/CRExplorer.tsx
    - src/types/models.ts
    - src/validation/schemas.ts
    - src/validation/backupSchemas.ts
    - src/db/schema.ts
    - src/db/index.ts
    - src/services/backup/validateBackup.ts
    - src/db/repositories/documentLinkRepo.ts
    - src/components/changeRequests/ChangeRequestModal.tsx
    - src/components/tasks/TaskDrawer.tsx
    - tests/components/TaskTable.test.tsx
    - tests/views/ChangeRequestDetailView.test.tsx
    - tests/views/ItemInsightView.test.tsx
    - tests/workbench/CRExplorer.test.tsx
    - src/db/repositories/__tests__/namedQuickLinks.test.ts
decisions:
  - "Task menu có một owner duy nhất; TaskTable, CR detail và CR Explorer dùng chung useTaskMenuItems, không tự dựng confirm/xóa."
  - "Link field được rebrand hoàn toàn thành links[{name,url}]; documentLinks/quickLinks chỉ tồn tại ở reader/migration/backup legacy."
  - "Dexie version(30) và backup schemaVersion 14 normalize field cũ, dedupe theo url, xoá field cũ bằng delete."
  - "CR Explorer resolve mọi cr.targets qua systemMap; multi-target dùng AntD Menu children thay vì hard-code targets[0]."
metrics:
  duration: ~35min
  completed_date: 2026-11-27
---

# Quick 261127-qrn: Menu task dùng chung, parity CR Explorer và hợp nhất link Summary

Bốn sửa đổi theo đúng state owner: task menu dùng chung ba surface, CR detail có cột Thao tác, task insight có tag hệ thống, CR Explorer có menu parity SystemsExplorer, và `documentLinks`/`quickLinks` gộp thành một field `links: [{name, url}]` duy nhất kèm Dexie v30 và backup v14.

## Commits

| Task | Commit | Nội dung |
|------|--------|----------|
| 1 (QRN-01) | 4815defc | Trích `useTaskMenuItems` làm owner chung cho TaskTable |
| 2 (QRN-01, QRN-02) | a09141d3 | Thêm cột Thao tác CR detail và tag system task insight |
| 3 (QRN-03, QRN-04) | 1d52d5f5 | CR Explorer parity SystemsExplorer và task leaf context menu |
| 4 (QRN-05) | 04f33385 | Hợp nhất `documentLinks`/`quickLinks` thành `links` có tên |

## Kết quả

- `useTaskMenuItems` là nơi duy nhất dựng menu item, confirm xoá, `deleteTaskWithAllocations`, reminder modal; TaskTable, CR detail, CR Explorer cùng gọi. TaskTable giữ nguyên testid, aria-label, cột Thao tác và right-click.
- CR detail render 6 cột, action xoá đi qua shared owner và clear `placeholderTaskIdRef` khi xoá placeholder.
- Task insight render `${code} — ${name}`, click mở insight hệ thống; fallback `Chung (không gắn)` và fallback `systemId`; breadcrumb/subsystem test giữ nguyên.
- CR node có đủ 6 item parity SystemsExplorer; Git/Terminal resolve mọi `cr.targets`, multi-target dùng submenu `children`; task leaf dùng chung task menu.
- `ChangeRequest`/`Task` chỉ có `links?: NamedLink[]`. Mọi write path (model, schema, repo, form, UI, AI/knowledge consumer) chỉ ghi/đọc `links`; doc link có `{name:'', url:docId}`. Dexie v30 migration và backup v13→v14 normalize, dedupe theo url, xoá field cũ bằng `delete`; writer chỉ xuất `schemaVersion: 14`.

## Review fixes (commit 08e48dd0)

Reviewer tìm 6 finding; đã fix hết:

1. **Blocker mất dữ liệu:** `TaskDrawer`/`ChangeRequestModal` lọc link theo `name && url` → xoá mọi link migrate có `name: ''`. Đổi lọc theo `url`, giữ name rỗng. Thêm regression test trong `tests/components/TaskDrawer.test.tsx`.
2. **Blocker không lưu được task/CR:** validator URL thiếu nhánh document UUID. Trích `isValidLinkUrl` từ `src/validation/schemas.ts` làm nguồn duy nhất, dùng ở cả 2 form; backup `linkSchema` cũng nhận UUID.
3. **Backup v14 reject UUID link:** thêm `isValidUuid` vào `linkSchema` trong `src/validation/backupSchemas.ts`.
4. **CR detail render link 2 lần:** bỏ block "Tài liệu liên kết", giữ một block "Links"; stats gộp thành `LINKS` + `NHẮC NHỞ`. Test cập nhật có chủ đích.
5. **Test normalize chỉ chạy helper local:** test truyền raw legacy rows để production `normalizeLegacyLinks` trong `validateBackup.ts` thực thi.
6. **"Sửa tác vụ" trên CR Explorer mở insight thay vì editor:** thêm item "Xem chi tiết" mở insight, `Sửa tác vụ` mở `TaskDrawer` qua `drawerTaskId`.

Ngoài ra V30 upgrade giờ `await Promise.all([...modify()])` để Dexie chờ migration hoàn tất.

## Verification

- Review fixes: `npx tsc --noEmit` exit 0; `npx eslint` trên 12 file lõi exit 0.
- ScopedVitest sau review: nhóm migration/explorer/backup (`namedQuickLinks`, `CRExplorer`, `validateBackup`) 51 passed; nhóm TaskTable/ItemInsight/subsystem/documentLink/repo 51 passed; nhóm AI/backup còn lại 105 passed; `TaskDrawer` 11 passed / 1 skipped; `ChangeRequestDetailView` 20 passed.
- **Pre-existing failure ngoài phạm vi QRN:** `tests/services/ai/office/teamTools.test.ts` pin 12 tool definitions nhưng codebase hiện có 13 (`agentDeveloperFileToolName` từ commit `eb10620e`, trước QRN). Không sửa trong quick task này.
- Task 1: `npx vitest run tests/components/TaskTable.test.tsx --bail=1` + `npx tsc --noEmit` xanh.
- Task 2: `npx vitest run tests/views/ChangeRequestDetailView.test.tsx src/views/__tests__/ChangeRequestDetailView.subsystemOptions.test.tsx tests/views/ItemInsightView.test.tsx tests/components/TaskTable.test.tsx --bail=1` + `npx tsc --noEmit` xanh.
- Task 3: `npx vitest run tests/workbench/CRExplorer.test.tsx tests/components/TaskTable.test.tsx --bail=1` + `npx tsc --noEmit` xanh.
- Task 4: nhóm scoped cuối `npx vitest run src/db/repositories/__tests__/namedQuickLinks.test.ts tests/db/documentLinkRepo.test.ts tests/db/repos.test.ts tests/components/TaskDrawer.test.tsx tests/components/TaskTable.test.tsx tests/views/ItemInsightView.test.tsx tests/views/ChangeRequestDetailView.test.tsx tests/ai/contextGrounding.test.ts tests/ai/aiTools.test.ts --bail=1` → 9 files, 162 passed / 1 skipped; nhóm backup/version `npx vitest run tests/services/backup/validateBackup.test.ts tests/services/backup/officeBackup.test.ts tests/services/ai/office/aiTeamRepo.test.ts tests/db/schemaV27Migration.test.ts --bail=1` xanh.
- Gate chung: `npx tsc --noEmit` exit 0; `npx eslint` trên các file lõi task 4 exit 0; grep field cũ chỉ còn ở reader/migration/backup schema được phép.
- Browser (sau review fixes): Vite `http://127.0.0.1:5179/task-management/`, Chrome DevTools MCP. Seed 1 system/CR/task qua IndexedDB. CR node menu `["Mở CR Detail","Tạo CR","Mở Git","Mở Terminal","Sửa","Xóa"]`; task leaf menu `["Xem chi tiết","Hỏi Trợ lý AI","Thêm nhắc nhở","Sửa tác vụ","Xóa"]`; click `Sửa tác vụ` mở drawer "Chỉnh sửa tác vụ"; click `Xem chi tiết` mở insight. CR detail headers `["Task","Subsystem","Status","Ước lượng","Hạn","Thao tác"]`; đúng 1 block "Links" + stats `LINKS 1 / NHẮC NHỞ 0`. Task insight tag `PAYMENT_SVC — Payment Service`, click mở system insight "Payment Service". Light + dark đều render đúng.
- Không chạy full vitest suite, không cài dependency, không đụng PWA/GitHub Pages.

## Deviations from Plan

**1. [Rule 3 - Blocking] Hook file dùng `.tsx`**
- Plan ghi `src/hooks/useTaskMenuItems.ts`; file thực tế `src/hooks/useTaskMenuItems.tsx` vì hook trả node JSX (icon, modal). Đổi extension để Vite parse đúng.

**2. [Rule 2 - Correctness] Hook trả thêm `modal` và `contextHolder`**
- Plan mô tả shape `{ getTaskMenuItems, reminderTargetTask, setReminderTargetTask, reminderModal }`; thực tế trả thêm `modal`, `contextHolder` để `modal.confirm` có holder được mount bởi chính consumer. Nếu không mount, confirm không render trong test và runtime.

**3. [Rule 2 - Data safety] Backup `namedLinkSchema` cho phép `name: ''`**
- Plan key_links ghi backup schema dùng `namedLinkSchema` name 1-80. Thực tế backup reader cần chấp nhận name rỗng của legacy `documentLinks` sau normalize; input/update schema vẫn giữ name 1-80.

**4. [Rule 1 - Bug] Hook gọi sau early return trong CR detail**
- Gọi `useTaskMenuItems` trước `if (!cr)` gây lỗi "Rendered more hooks than during the previous render". Chuyển hook xuống sau early return.

**5. [Rule 1 - Bug] `TaskLeafTitle` forward props**
- Dropdown contextMenu không mở do span không nhận props. `TaskLeafTitle` đổi nhận `React.HTMLAttributes<HTMLSpanElement>` rồi spread lên `<span>`.

**6. [Rule 3 - Blocking] Cập nhật stale test pins theo code thực tế**
- `tests/ai/aiTools.test.ts`: `AI_DATABASE_TOOLS` 78→83 và danh sách SSH tool 3→7; `tests/db/repos.test.ts`: type invalid `'INVALID'`→`'invalid-type'`; version pins schema backup 13→14 và Dexie 27/28→30. Không đổi hành vi, chỉ theo state owner hiện tại.

**7. [Verification] Browser task insight tag**
- Script browser click trúng TaskDrawer thay vì insight tab, nên tag click được phủ bằng automated test `tests/views/ItemInsightView.test.tsx` thay vì script Chrome. Các màn hình khác verified trực tiếp.

## Auth Gates

None.

## Threat Flags

None mới — giữ nguyên mitigate `modal.confirm` + transaction, validate `useSystemActions`, và normalize backup qua schema trước khi ghi. Không có endpoint/auth/file surface mới.

## Known Stubs

None.

## Self-Check: PASSED

4 commit (`4815defc`, `a09141d3`, `1d52d5f5`, `04f33385`) có trong git log; file hook, summary và các file lõi tồn tại; file docs artifacts không được commit theo yêu cầu.
