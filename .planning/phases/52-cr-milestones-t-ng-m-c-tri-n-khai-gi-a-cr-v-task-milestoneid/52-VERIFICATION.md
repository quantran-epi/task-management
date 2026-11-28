---
phase: 52-cr-milestones-t-ng-m-c-tri-n-khai-gi-a-cr-v-task-milestoneid
verified: 2026-11-28T04:46:53Z
status: passed
score: 11/11 must-haves verified
overrides_applied: 0
---

# Phase 52: CR Milestones — Verification Report

**Phase Goal:** Một CR có nhiều mốc triển khai, task gắn optional vào từng mốc, note thật đính kèm mốc; dữ liệu và UI vẫn chạy offline trên Tauri, backup v14 vẫn restore được.
**Verified:** 2026-11-28T04:46:53Z
**Status:** passed
**Re-verification:** No — initial verification (no prior VERIFICATION.md)

**Contract source:** ROADMAP Phase 52 declares no requirement IDs; success criteria are D-01..D-11 in `52-CONTEXT.md`. Verifier used those 11 decisions as the non-negotiable must-have set and cross-checked plan-frontmatter truths/artifacts/key_links. `gsd-tools` is unavailable in this environment, so all artifact/link checks were done by direct file, grep, git and scoped-test inspection.

## Goal Achievement

### Observable Truths (D-01..D-11)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| D-01 | CR có nhiều `crMilestones` (V31), mỗi row có id/crId/name/targetDate?/createdAt/updatedAt, index `id, crId`; không hồi sinh legacy `milestones` | ✓ VERIFIED | `src/types/models.ts:105` interface; `src/db/schema.ts:218-223` `SCHEMA_V31` + `LATEST_SCHEMA_VERSION = 31`; `src/db/index.ts:741` `version(31).stores(SCHEMA_V31)`; `tests/db/schemaV31Migration.test.ts` passed |
| D-02 | `Task.milestoneId?` optional, không migration ghi đè; đổi `crId` xoá `milestoneId` | ✓ VERIFIED | `models.ts:118`; `taskRepo.ts:121` `if (crChanged) delete updated.milestoneId`; `tests/db/taskRepo.test.ts`, `tests/db/reparent.test.ts` passed |
| D-03 | Invariant `milestoneId` trúng CR trên create/update/reparent + backup referential | ✓ VERIFIED | `taskRepo.ts:30-38,49,133,326-333` `assertMilestoneMatchesCr` + `crMilestones.get`; `validateBackup.ts:347-435` referential check; scoped taskRepo/reparent/validateBackup tests passed |
| D-04 | Xoá milestone trong 1 transaction: clear task ref, gỡ note, task/note sống; xoá CR cascade cả milestone | ✓ VERIFIED | `cascadeRepo.ts:98-118` `db.transaction('rw', [crMilestones, tasks, notes], ...)` + `bulkDelete`; `cascadeRepo.ts:32-37,83`; `tests/db/cascadeRepo.test.ts`, `crMilestoneRepo.test.ts` passed |
| D-05 | Note gắn `crMilestone` qua cặp `entityType`/`entityId`; pickers/filters/detail/AI enums đọc được | ✓ VERIFIED | `models.ts:209`, `schemas.ts:439`; wiring ở NoteEditor, QuickNotesPanel, DocListPane, NoteDetailModal, NotesPopoutView, aiTools (xem bảng Key Links); `noteRepo.test.ts`, `backupSchemas.test.ts` passed |
| D-06 | Không thêm chat scope / notification / knowledge-link / reminder target cho milestone | ✓ VERIFIED | Grep `crMilestone` trong type/validation/aiTools không xuất hiện ở scope/notification/reminder/knowledge union; chỉ tồn tại trong `NoteEntityType`/`NOTE_ENTITY_TYPES` và AI note-query enums |
| D-07 | Backup v15 có `crMilestones` tables/counts/export/restore; v14 restore coi rỗng; legacy gate chặn `projects`/`milestones` | ✓ VERIFIED | `backupSchemas.ts:896,918,922`; `validateBackup.ts:229,235,798,833` (`legacyMilestones`); `exportBackup.ts:312,348`; `restoreBackup.ts:47,314`; `ImportPreviewModal.tsx:31`; `validateBackup/exportBackup/restoreBackup/backupSchemas` tests passed |
| D-08 | TS SQLite domain list + Rust `ALLOWED_TABLES` đều có `crMilestones` | ✓ VERIFIED | `localSqlitePersistence.ts:17`, `src-tauri/src/sqlite_persistence.rs:34`, `tests/db/tableListParity.test.ts:58-60` passed; `cargo check` exit 0 |
| D-09 | CR Detail section CRUD + notes; cột `Mốc` trong bảng CR + global; TaskDrawer Select lọc theo CR; wrapper-only UI, light/dark đổi ngay | ✓ VERIFIED | `ChangeRequestDetailView.tsx:532,642`; `TaskDrawer.tsx:518-523`; `TaskTable.tsx:97,521-528`; chỉ 2 `import type` từ antd (được ESLint guard cho phép, pre-existing); UAT screenshot light+dark đã quan sát (xem dưới) |
| D-10 | Chain link/reminder 261128-d1m/dlj vẫn nguyên | ✓ VERIFIED | `ItemInsightView.tsx:85,257,620,761,780,801,962` còn `linkModalOpen`/`handleSaveLink`/`item-insight-links-section`/`item-insight-reminder-add`/Popconfirm; `tests/views/ItemInsightView.test.tsx` còn assert |
| D-11 | Focused tests + tsc/lint/build + diff review + Chrome UAT light/dark; residual báo trung thực | ✓ VERIFIED | Exact 16-path gate: 172 passed / 8 baseline-identical failures; `tsc --noEmit` exit 0, `npm run lint` exit 0, `npm run build` exit 0, `cargo check` exit 0; `git diff --check 1ef36016 HEAD` sạch; UAT screenshots tồn tại và đã quan sát; residual được ghi trung thực bên dưới |

**Score:** 11/11 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/types/models.ts` | `CrMilestone`, `Task.milestoneId?`, widen note union | ✓ VERIFIED | Substantive, wired vào repo/UI |
| `src/db/schema.ts` / `src/db/index.ts` | SCHEMA_V31 + table V31 | ✓ VERIFIED | `crMilestones: 'id, crId'`, `version(31)` |
| `src/db/repositories/crMilestoneRepo.ts` | create/update/list/delete verbs | ✓ VERIFIED | Re-export `deleteCrMilestoneWithCascade` từ cascadeRepo |
| `src/db/repositories/taskRepo.ts` | Invariant trên mọi write | ✓ VERIFIED | create/update/reparent đều gọi assert |
| `src/db/repositories/cascadeRepo.ts` | Cascade + unlink | ✓ VERIFIED | Transaction rw, tasks/notes sống |
| `src/validation/schemas.ts` | `NOTE_ENTITY_TYPES` có `crMilestone` | ✓ VERIFIED | Dùng chung cho form/AI validation |
| `src/validation/backupSchemas.ts` | v15 + record schema | ✓ VERIFIED | `BACKUP_SCHEMA_VERSION = 15` |
| `src/services/backup/validateBackup.ts` | v14 normalize + referential | ✓ VERIFIED | `legacyMilestones`, `milestoneIds` set |
| `src/services/backup/exportBackup.ts` / `restoreBackup.ts` | table list + counts | ✓ VERIFIED | `crMilestones` trong snapshot/clear/add |
| `src-tauri/src/sqlite_persistence.rs` / `src/services/localSqlitePersistence.ts` | Allowlist parity | ✓ VERIFIED | Cả hai có `crMilestones`, parity test pass |
| `src/views/ChangeRequestDetailView.tsx` | `cr-detail-milestones` inline CRUD + EntityNotesSection | ✓ VERIFIED | `secondaryBlocks` entry + Popconfirm + notes mount |
| `src/components/tasks/TaskDrawer.tsx` | FormItem `milestoneId` + CR-scoped options | ✓ VERIFIED | `targetMilestoneId` map sang repo; fallback an toàn |
| `src/components/tasks/TaskTable.tsx` | Cột `milestone` + "Chưa gán mốc" | ✓ VERIFIED | `key: 'milestone'`, default visible |
| Note surfaces (5 files) + `aiTools.ts` | crMilestone option/filter/label | ✓ VERIFIED | Xem key links |
| 16 scoped test files |substantive tests| ✓ VERIFIED | Mọi file tồn tại, 76–696 dòng, không stub |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `crMilestoneRepo.ts` | `cascadeRepo.ts` | `deleteCrMilestoneWithCascade` | ✓ WIRED | Import + re-export (dòng 8, 69) |
| `taskRepo.ts` | `db/index.ts` | `db.crMilestones.get(milestoneId)` | ✓ WIRED | Dòng 36, 327 |
| `NoteEditor.tsx` | `db/index.ts` | `db.crMilestones.toArray()` | ✓ WIRED | Dòng 51 |
| `NotesPopoutView.tsx` | `db/index.ts` | `map.set('crMilestone:' + id, name)` | ✓ WIRED | Dòng 213, 219 |
| `validateBackup.ts` | `backupSchemas.ts` | `BackupCrMilestoneRecordSchema` | ✓ WIRED | Import dòng 34, dùng dòng 235 |
| `restoreBackup.ts` | `localSqlitePersistence.ts` | `crMilestones` mirror | ✓ WIRED | Table trong snapshot + parity test |
| `ChangeRequestDetailView.tsx` | `crMilestoneRepo.ts` | `create/update/deleteCrMilestoneWithCascade` | ✓ WIRED | Import dòng 8, gọi dòng 204-225 |
| `ChangeRequestDetailView.tsx` | `EntityNotesSection.tsx` | `entityType="crMilestone"` | ✓ WIRED | Dòng 642, mount khi selectedMilestone |
| `TaskDrawer.tsx` | `taskRepo.ts` | `milestoneId` vào `reparentTask`/`updateTask` | ✓ WIRED | `targetMilestoneId` (dòng 341, 393) — pattern plan ghi `values.milestoneId`, tương đương về ngữ nghĩa |
| `52-VALIDATION.md` | test paths | `vitest run` | ✓ WIRED | Exact 16-path gate chạy được (xem Behavioral Spot-Checks) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `ChangeRequestDetailView.tsx` | `milestones`, `crNotesCount`, `tasks` | `useLiveQuery` → `listCrMilestones`/Dexie | Có query thật, UAT ghi nhận count 0→1 | ✓ FLOWING |
| `TaskDrawer.tsx` | milestone Select options | `db.crMilestones` lọc theo CR | Có query thật; UAT dropdown hiển thị mốc thật | ✓ FLOWING |
| `TaskTable.tsx` | `Mốc` cell | `milestoneMap` từ repo | Có map thật, UAT hiển thị tên mốc/"Chưa gán mốc" | ✓ FLOWING |
| `NoteEditor` / QuickNotes / DocList / Popout / aiTools | entity options + labels | `db.crMilestones.toArray()` | Có query thật | ✓ FLOWING |
| Backup export/restore | `crMilestones` table | `targetDb.crMilestones.toArray()` | Có query thật, round-trip test pass | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Data-layer milestone + invariant + cascade + note + backup schema (7 files) | `npx vitest run tests/db/schemaV31Migration.test.ts tests/db/crMilestoneRepo.test.ts tests/db/taskRepo.test.ts tests/db/cascadeRepo.test.ts tests/db/tableListParity.test.ts tests/validation/backupSchemas.test.ts src/db/repositories/__tests__/noteRepo.test.ts` | 56 passed / 56 | ✓ PASS |
| Backup v15 + UI tests (5 files) | `npx vitest run tests/services/backup/{validateBackup,exportBackup,restoreBackup}.test.ts src/components/tasks/__tests__/TaskDrawer.test.tsx src/views/__tests__/ChangeRequestDetailView.reminderAndSearch.test.tsx` | 64 passed / 64 | ✓ PASS |
| Exact plan-05 gate (16 files) | lệnh 16 path trong `52-05-SUMMARY.md` | 172 passed / 8 baseline failures (exit 1) | ✓ PASS for Phase 52 scope (8 failures = baseline, xem bên dưới) |
| Baseline comparison | `git worktree add --detach /tmp/52-baseline-wt 1ef36016` + chạy 2 file failing | 8 failed / 25 passed — đúng 8 failures, khớp HEAD | ✓ PASS (không phải regression) |
| Type check | `npx tsc --noEmit` | exit 0, 0 `error TS` | ✓ PASS |
| Lint | `npm run lint` | exit 0 | ✓ PASS |
| Build | `npm run build` | exit 0, `✓ built in 2.05s` | ✓ PASS |
| Rust mirror | `cargo check --manifest-path src-tauri/Cargo.toml` | exit 0, `Finished dev profile` | ✓ PASS |
| Diff hygiene | `git diff --check 1ef36016 HEAD` | sạch | ✓ PASS |

Full Vitest suite intentionally NOT run (project rule: >1 hour). No server started, no state mutated.

### Probe Execution

Không có probe/script `probe-*.sh` được khai báo trong PLAN/SUMMARY cho phase này. Step 7b/7c probe: SKIPPED (không phải migration/tooling phase có probe; verification dùng scoped tests + UAT screenshots).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | `TBD` / `FIXME` / `XXX` trong phase source files | none | Debt-marker gate: sạch |
| `src/components/tasks/TaskTable.tsx` | 3 | `import type { TableColumnsType } from 'antd'` | ℹ️ Info | Type-only import, pre-existing, được ESLint `allowTypeImports` cho phép — không phải runtime AntD |
| `src/components/notes/DocListPane.tsx` | 3 | `import type { MenuProps } from 'antd'` | ℹ️ Info | Tương tự ở trên |

Không có critical/warning anti-pattern, stub, empty implementation, hay hardcoded-empty prop mới từ Phase 52.

### Residual (không phải blocking gap)

1. **8 failing tests có từ trước Phase 52.** Independent baseline check: worktree detached tại `1ef36016` (pre-phase commit) chạy cùng 2 file → đúng 8 failures, khớp HEAD exact gate. Chi tiết: 7 trong `ChangeRequestDetailView.test.tsx` (Spec button, 3 filter `cr-detail-task-search`, 3 link-editor `cr-detail-link-url`) + 1 trong `TaskTable.test.tsx` (duplicate `Tác vụ` columnheader). Đã ghi trong `52-04-SUMMARY.md` và `52-05-SUMMARY.md`. Không phải Phase 52 regression; không patch (D-11 chỉ yêu cầu báo trung thực).
2. **Intermittent flake (≤1/2 lần chạy full-file ở HEAD):** `renders a stats strip...` đôi khi trả `GHI CHÚ = 0` thay vì `2`. Code `crNotesCount` ở HEAD giữ nguyên so với baseline (`db.notes.where('entityId').equals(crId).filter(...).count()`), test đứng riêng pass 3/3, exact 16-path gate pass; baseline full-file ổn định 6/6. Đây là test timing flake, không phải lỗi sản phẩm của Phase 52, nhưng được ghi lại để theo dõi.
3. **Pre-existing warnings:** AntD deprecation (`destroyOnClose`, `overlayStyle`, `Space direction`, `columns.render` cell props), 32 Rust unused-function warnings, build chunk-size/ineffective-dynamic-import notices — không phải Phase 52.
4. **Không chạy:** full Vitest suite (>1h), Tauri desktop binary (`cargo check` thay thế), human click-through trong shared Tauri window (dùng Chrome UAT isolated thay thế theo D-11).

### Chrome UAT (light/dark) — đã quan sát, không chỉ suy luận từ code

Executor 52-05 chạy live Vite dev server + isolated Playwright Chromium, seed synthetic CR/3 tasks/3 milestones. Verifier đã mở và kiểm tra trực tiếp screenshot: `/tmp/52-05-uat/v3-flow4-dark-section.png` (dark: "Mốc triển khai (3)", cột "Mốc", 3 group gồm "Chưa gán mốc", edit/delete icon buttons, `--bg-app` tối) và `/tmp/52-05-uat/v2-flow1-note-light.png` (light: milestone row selected, ghi chú "Ghi chú UAT mốc 3", count 1, toast "Đã thêm mốc"/"Đã to ghi chú"). Đủ 4 flow (CR CRUD+notes, TaskDrawer select, cột Mốc, theme toggle không reload) có ảnh chứng minh ở cả 2 theme. 2 state chưa UAT trực tiếp (`Chọn CR trước` disabled tooltip, empty-CR hint) được cover bởi `TaskDrawer.test.tsx` passed — ghi nhận là test evidence.

### Requirements Coverage

ROADMAP Phase 52 khai báo `Requirements: TBD`; không có requirement ID nào trong PLAN frontmatter (`requirements: []`) và không có dòng `Phase 52` trong REQUIREMENTS.md. Không có orphaned requirement. Tiêu chí là D-01..D-11, đã map đầy đủ ở bảng Observable Truths (11/11).

---

_Verified: 2026-11-28T04:46:53Z_
_Verifier: Claude (gsd-verifier)_
