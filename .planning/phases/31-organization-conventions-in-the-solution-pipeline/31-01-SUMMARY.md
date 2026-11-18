---
phase: 31-organization-conventions-in-the-solution-pipeline
plan: 01
subsystem: settings-conventions
tags: [conventions, settings, dexie, backup, markdown]
dependency_graph:
  requires: []
  provides: [GLOBAL_CONVENTIONS_SETTING_KEY, conventionService, GlobalConventionsCard]
  affects: [SettingsView, exportBackup]
tech_stack:
  added: []
  patterns: [Dexie settings key-value persistence, renderSafeMarkdown preview, Ant Design Card & Modal]
key_files:
  created:
    - src/services/conventionService.ts
    - src/components/settings/GlobalConventionsCard.tsx
    - tests/services/conventionService.test.ts
    - tests/components/settings/GlobalConventionsCard.test.tsx
  modified:
    - src/views/SettingsView.tsx
decisions:
  - "D-01: Global conventions stored in Dexie settings under 'global_conventions' key"
  - "D-02: GlobalConventionsCard embedded inside SDLC / AI tab of SettingsView"
  - "D-03: Setting key complies with isSafeBackupSetting whitelist, included in encrypted backups"
  - "D-04: Empty state returns empty string without generating default/fabricated text"
metrics:
  duration: 10m
  completed_date: "2026-11-07"
---

# Phase 31 Plan 01: Global Convention Document Schema, Settings Editor, Persistence & Backup Inclusion Summary

Global organization convention document storage, management UI in Settings, and backup inclusion implemented cleanly without dummy data fabrication.

## What Was Built

1. **`src/services/conventionService.ts`**:
   - `GLOBAL_CONVENTIONS_SETTING_KEY`: Constant `'global_conventions'`.
   - `getGlobalConventions(db)`: Reads from `db.settings.get('global_conventions')`. Strictly returns `""` if missing or non-string (preserves empty state per D-04).
   - `saveGlobalConventions(content, db)`: Persists `{ key: 'global_conventions', value: content }` to `db.settings` (per D-01, D-03).
   - `clearGlobalConventions(db)`: Deletes key from `db.settings`.

2. **`src/components/settings/GlobalConventionsCard.tsx`**:
   - Monospace `Input.TextArea` with auto-size (minRows 10, maxRows 24).
   - Tag status: "Đã cấu hình" when non-empty, "Chưa thiết lập" when empty.
   - Character and line counter with keyboard shortcut hint (`Ctrl+S` / `Cmd+S` to save).
   - "Xem trước Markdown" button opening modal sanitized with `renderSafeMarkdown`.
   - Popconfirm for destructive action "Xóa trắng quy ước".
   - Primary CTA "Lưu quy ước tổ chức" (`#3871e1`).

3. **`src/views/SettingsView.tsx`**:
   - Embedded `<GlobalConventionsCard db={db} />` inside `'ai'` tab (Trợ lý AI & Ghost Dev) as the top card.

4. **Automated Unit Tests**:
   - `tests/services/conventionService.test.ts`: CRUD operations, empty state handling, and `isSafeBackupSetting` whitelist verification.
   - `tests/components/settings/GlobalConventionsCard.test.tsx`: Initial empty state, existing content loading, primary save button, and preview modal rendering.

## Verification

- `npx vitest run tests/services/conventionService.test.ts tests/components/settings/GlobalConventionsCard.test.tsx`: 9/9 tests passed.
- `npx vitest run tests/services/backup/exportBackup.test.ts`: 6/6 tests passed.
- `npx tsc --noEmit`: 0 errors.

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- FOUND: `src/services/conventionService.ts`
- FOUND: `src/components/settings/GlobalConventionsCard.tsx`
- FOUND: `tests/services/conventionService.test.ts`
- FOUND: `tests/components/settings/GlobalConventionsCard.test.tsx`
- FOUND commits:
  - `3662a13e`: `test(31-01): add tests for global convention CRUD and backup safety`
  - `3647d84c`: `feat(31-01): implement conventionService with global CRUD`
  - `05431fe5`: `feat(31-01): implement GlobalConventionsCard and embed in SettingsView`
