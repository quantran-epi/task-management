# Phase 46: Configuration Profiles — Pattern Map

**Mapped:** 2026-11-19
**Files analyzed:** 28 new/modified artifacts
**Analogs found:** 28 / 28 (all analog paths verified `git ls-files --error-unmatch` = TRACKED in this worktree)
**Scope:** worktree `phase-46-configuration-profiles` only. No main-worktree / Phase 45 files read or touched. No source edits made.

> Locked decisions live in `46-RESEARCH.md §User Constraints` (no CONTEXT.md). Above all: **authoring screen seeds from `DEFAULT_*` constants, never reads `db.settings`**; secrets shown as blank fields and export `''`; machine-specific values kept but flagged; merge key-by-key with snapshot (never clear wholesale); no 7th tab in SettingsView. In-scope backends: `db.settings`, `capacityRules`, `capacityOverrides`, Ghost Dev `localStorage`. **Telegram is fully out of profile scope by user decision (2026-11-19, owner-machine-only):** no schema section, no form field, no import write, no checklist item.

## Quick Map: artifact -> analog:line -> pattern -> pitfall

| New/Modified Artifact | Closest analog (file:line) | Pattern to copy | Pitfall |
|---|---|---|---|
| `src/validation/configProfileSchemas.ts` | `src/validation/backupSchemas.ts:194-218,396-399,887-891` | Zod envelope `{app, schemaVersion literal, exportedAt, ...}`; `BackupSettingRecordSchema` (`value: z.unknown()`) shape | Do NOT reuse `findForbiddenBackupKey` regex — it rejects empty `*_token`/`*_key`/`*_secret` fields. Use own `profileSchemaVersion` (start 1), never touch `BACKUP_SCHEMA_VERSION=13`. Secret fields must be `z.literal('')`. |
| `src/services/configProfiles/types.ts` | `src/types/oracleSqlcl.ts:24-40`, `src/types/aiOffice.ts:88-114` | `ConfigurationProfile = { id, name, createdAt, updatedAt, config }`; team default template from `AiTeam` config fields only | No `id`/`name`/`members`/`usage`/`docsFolderId`/`ai_teams_docs_root` inside team template; `budgetWarnThresholdPct: null` = inherit global. |
| `src/services/configProfiles/defaults.ts` | `src/services/ai/nineRouterTokenService.ts:12-19`, `src/services/ai/budgetWarnSettings.ts:3-7`, `src/types/notifications.ts:23-37` | Re-export/assemble existing `DEFAULT_*` constants into one fresh defaults object | Never read `db.settings` here; no hand-typed literal values (drift). Constants at `ghostDevConfig.ts:10`, `mcpClient.ts:37`, `systemTypeSettings.ts:23`, `aiOffice.ts:338`. Telegram defaults deliberately NOT included (user decision: owner-machine-only). Capacity weekday defaults from `src/db/seeds.ts:14-25`. |
| `src/services/configProfiles/catalog.ts` | `src/services/backup/exportBackup.ts:12-63` (`UNSAFE_OR_EPHEMERAL_SETTING_KEYS`, `isSafeBackupSetting`) + `src/services/keyringService.ts:5-11` (`KEYRING_KEYS`) | Classify each key: portable / secret(blank) / machine-specific(flag) / excluded. Reuse denylist + suffix rule + keyring list as source of truth | Add `configuration_profiles` to the excluded set to avoid self-reference. SSH/Oracle `connectionString` holds password -> blank; host/path -> keep + flag. |
| `src/services/configProfiles/profileService.ts` | `src/services/sshService.ts:20-88` (one-row-array CRUD) + `src/services/ai/oracleSqlclService.ts:32-84` | `getProfiles()` reads one `db.settings` row (`configuration_profiles`), returns `[]` if absent; `saveProfiles()` does a single `db.settings.put({key,value})`; `generateId()` for `id` | No Dexie version bump. Stable IDs from caller; upsert by `id` (`findIndex` -> replace/push). |
| `src/services/configProfiles/exportProfile.ts` | `src/services/backup/exportBackup.ts:186-374,381-391` + `src/utils/fileExport.ts:679-755` | Build artifact from the **in-memory profile** (not db); blank all catalog secrets; `JSON.stringify(...,null,2)`; `saveFileWithPicker(name, blob, {title, filters})` | Must not read current-user settings. Export exactly ONE selected profile. `saveFileWithPicker` already does Tauri -> FSA -> download fallback. |
| `src/services/configProfiles/importProfile.ts` | `src/services/backup/restoreBackup.ts:279-336,340-367` | Validate at boundary -> `captureSnapshot` -> in `db.transaction('rw', ...)`: **key-by-key** settings merge via `bulkDelete([...incomingSettingKeys])` + `put`, snapshot into `last_pre_import_snapshot`, `backupMetadata.add` | Never `db.settings.clear()`. **Skip any key/field whose value is `''`** so blank secrets cannot wipe recipient's real keyring/db values; never write keyring from profile. |
| `src/views/ConfigProfilesView.tsx` | `src/views/SettingsView.tsx:50-71,273-330` (view shell/section pattern) + `src/components/settings/BackupExportCard.tsx:20-53` | `PageHeader` + `Space direction="vertical"` + `Typography.Text strong` section headers; local `useState` form seeded from `defaults.ts`; separate screen/route, not a SettingsView tab | Do NOT mount any `db`-reading config card in authoring — that violates Locked Decision 1. Use plain form inputs bound to defaults, not `<XConfigCard db={db}/>`. |
| `src/components/settings/ConfigProfileExportButton.tsx` | `src/components/settings/BackupExportCard.tsx:27-53,88-95` | `type="primary"` Button + `loading` state; `announceToScreenReader` + `notification.success/error`; `try/finally` resets loading | One-click export of the *selected* profile; pass profile as prop, do not query db for "current settings". |
| `src/components/settings/ConfigProfileImportCard.tsx` (implied) | `src/components/settings/BackupImportCard.tsx:11-105` | `Upload.Dragger` + `beforeUpload` size guard (50MB) + `FileReader.readAsText` + `JSON.parse` + open preview modal; `accept='.json,application/json'`, `LIST_IGNORE` | Runs in browser AND Tauri via file input — do NOT call `select_local_file` (that only picks a path, does not read content). Place beside `BackupImportCard` in data tab. |
| `src/components/settings/ImportProfilePreviewModal.tsx` | `src/components/settings/ImportPreviewModal.tsx:50-163,226-339` | `useMemo` in-memory validate; Ant `Modal`+`Descriptions`+`Table`; `Alert type="warning"` summaries; confirm-text gate (use e.g. `IMPORT`, not `RESTORE`); `okButtonProps.disabled` until valid+typed; `announceToScreenReader` | Summary must list (a) blank-secret fields to re-enter and (b) machine-specific fields to review. Do not use word "thay thế toàn bộ" — this is a merge. |
| `src/components/settings/PostProfileImportChecklist.tsx` | `src/components/settings/PostRestoreBanner.tsx:11-51` + `src/views/SettingsView.tsx:162-168,320-325` | Ant `Alert` (`type="warning"`) with description listing two groups (secrets + machine-specific); `announceToScreenReader` for a11y; show/hide via parent state | Checklist content derived from `catalog.ts` secret/machine classification, not ad-hoc list. |
| `src/types/navigation.ts` (modify) | `src/types/navigation.ts:1-14` | Add `'config-profiles'` to `AppRoute` union | Must be mirrored in every route list below or new screen won't resolve. |
| `src/hooks/useHashRoute.ts` (modify) | `src/hooks/useHashRoute.ts:11-25,31-60` | Add `'config-profiles'` to `VALID_ROUTES` so `parseHash` passes the whitelist | Forgetting this silently falls back to `dashboard`. |
| `src/App.tsx` (modify) | `src/App.tsx:100-146` (`renderContent` switch) | Add `case 'config-profiles': return <ConfigProfilesView onNavigate={navigate} />;` + import | If using a `?tab=` param, extend `validTabs` at `App.tsx:113` (local to settings case). |
| `src/workbench/EditorArea.tsx` (modify) | `src/workbench/EditorArea.tsx:568-592` (`renderViewContent`) | Add `case 'config-profiles'` rendering the new view with `{...dbProp}` | Runtime primary is the Tauri workbench — App.tsx alone is not enough. |
| `src/workbench/WorkbenchLayout.tsx` (modify) | `src/workbench/WorkbenchLayout.tsx:249-257` (`handleOpenSettingsTab`) + `:259-273` (`handleOpenView`) | Register a title in `titles` map and an open handler that `openTab({id,title,viewType,closable:true})` | Keep view type string identical across all registration points. |
| `src/workbench/store/layoutStore.ts` (modify) | `src/workbench/store/layoutStore.ts:6-21` (`EditorViewType`) | Add `'config-profiles'` to `EditorViewType` union | Required for `viewType` typing in EditorArea/WorkbenchLayout. |
| `src/views/SettingsView.tsx` (modify - import card only) | `src/views/SettingsView.tsx:160-199` (data tab) | Insert `<ConfigProfileImportCard db={db} />` + optional checklist state next to `BackupImportCard` (line 172) | Do NOT add a 7th entry to `items` (line 136-271) and do not change `defaultActiveTab` union — test locks 6 tabs. |
| `src/services/backup/exportBackup.ts` (modify - denylist) | `src/services/backup/exportBackup.ts:12-43` | Add `'configuration_profiles'` to `UNSAFE_OR_EPHEMERAL_SETTING_KEYS` | Prevents the profile list (which may carry blank secret fields + machine paths) from leaking into plaintext backups. |
| `tests/validation/configProfileSchemas.test.ts` | `tests/components/settings/ImportPreviewModal.test.tsx:106-128` (invalid fixture) | Build minimal valid profile fixture + invalid one; assert secret field `''` required, non-profile rejected | Assert regex-style secrets are NOT blanket-rejected when blank. |
| `tests/services/configProfiles/exportProfile.test.ts` | `src/services/ai/__tests__/oracleMultiConnection.test.ts:57-83` (secret-leak assertions) | `expect(JSON.stringify(payload)).not.toContain('<secret>')`; verify blank fields, no live settings | Seed `db.settings` with a real secret, assert export doesn't include it. |
| `tests/services/configProfiles/importProfile.test.ts` | `src/services/ai/__tests__/oracleMultiConnection.test.ts:39-53,85-121` + `restoreBackup.ts:279-336` | `new TaskPlannerDatabase('Name_'+Math.random())`, `import 'fake-indexeddb/auto'`; assert existing settings survive key-by-key, secret `''` does not overwrite, no `clear()` | Import twice -> no collisions; verify snapshot row written. |
| `tests/views/ConfigProfilesView.test.tsx` | `tests/views/SettingsView.test.tsx:33-50,229-248` | `db` prop injected; render with providers; assert form shows defaults and no `db.settings.get` side effects | Mock db read spy to prove authoring never touches db. |
| `tests/components/settings/ConfigProfileExportButton.test.tsx` | `src/utils/__tests__/fileExport.test.ts:202-236` | Mock `saveFileWithPicker` / `window.showSaveFilePicker`; assert one-click passes selected profile + blank secrets | Clean up `window.showSaveFilePicker` after each test. |
| `tests/components/settings/ImportProfilePreviewModal.test.tsx` | `tests/components/settings/ImportPreviewModal.test.tsx:54-104` | Render modal with profile fixture; assert warning summary + confirm text gate | Assert both secret & machine-specific review items present. |
| `tests/components/settings/PostProfileImportChecklist.test.tsx` | `tests/components/settings/ImportPreviewModal.test.tsx` (render/assert style) | Render checklist; assert every blank-secret field listed | Use `vi.spyOn(ariaLive,'announceToScreenReader')` like `SettingsView.test.tsx:107`. |
| `tests/views/SettingsView.test.tsx` (non-regression) | existing file itself | Run unchanged to prove 6-tab lock still green | Do not edit tab `items` or test expectations. |
| `src/utils/__tests__/fileExport.test.ts` (non-regression) | existing file itself | Confirms save dialog 3-layer fallback still green | No change needed. |

## File Classification

| Role | New/Modified Files | Data Flow |
|---|---|---|
| config/schema | `configProfileSchemas.ts`, `types.ts`, `defaults.ts`, `catalog.ts` | transform / config |
| service | `profileService.ts`, `exportProfile.ts`, `importProfile.ts`, `exportBackup.ts` (mod) | CRUD, file-I/O, batch |
| component | `ConfigProfileExportButton`, `ConfigProfileImportCard`, `ImportProfilePreviewModal`, `PostProfileImportChecklist` | request-response, transform |
| view | `ConfigProfilesView.tsx` | request-response (local-state form) |
| route/config | `navigation.ts`, `useHashRoute.ts`, `App.tsx`, `EditorArea.tsx`, `WorkbenchLayout.tsx`, `layoutStore.ts` | request-response (routing) |
| test | 7 new test files + 2 non-regression files | — |

## Pattern Assignments (concrete excerpts)

### Named-profile CRUD — `src/services/sshService.ts:20-88` (exact role+flow)
```ts
export async function getSshConfigs(db: TaskPlannerDatabase = defaultDb): Promise<SshConfig[]> {
  const record = await db.settings.get(SSH_CONFIGS_SETTING_KEY);
  if (!record || !Array.isArray(record.value)) return [];
  return record.value as SshConfig[];
}
// save: findIndex by id -> replace or push -> one db.settings.put({key,value})
```
`src/services/ai/oracleSqlclService.ts:75-84` is the cleaner single-row writer: `db.settings.put({ key: ORACLE_TOOL_CONFIG_LIST_KEY, value: { profiles } satisfies ... })`.

### Secret denylist + key-by-key merge — `src/services/backup/exportBackup.ts:12-63`, `src/services/backup/restoreBackup.ts:279-336`
```ts
export function isSafeBackupSetting(key: string): boolean {
  if (UNSAFE_OR_EPHEMERAL_SETTING_KEYS.has(key)) return false;
  const lower = key.toLowerCase();
  if (lower.endsWith('_token') || lower.endsWith('_key') || lower.endsWith('_passphrase') ||
      lower.endsWith('_secret') || lower.endsWith('_pat')) return false;
  return true;
}
// restore: targetDb.settings.bulkDelete([...incomingSettingKeys])  // NOT clear()
// then: for (const s of tables.settings ?? []) if (isSafeBackupSetting(s.key)) await targetDb.settings.put(s);
// snapshot: await targetDb.settings.put({key:'last_pre_import_snapshot', value: snapshotData});
```
Comment to preserve verbatim intent (restoreBackup.ts:279-280): "Settings are replaced key-by-key, never cleared wholesale: secrets ... must survive an import and its rollback."

### File save (3-layer) — `src/utils/fileExport.ts:679-755`
```ts
const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' });
const res = await saveFileWithPicker('profile.json', blob, {
  title: 'Lưu cấu hình profile', filters: [{ name: 'JSON', extensions: ['json'] }],
});
// Tauri save_file_dialog -> showSaveFilePicker -> downloadBlob; returns {saved, path?}
```

### JSON import via drag/drop — `src/components/settings/BackupImportCard.tsx:26-58`
```ts
beforeUpload: (file) => {
  if (file.size > 50*1024*1024) { notification.error({...}); return Upload.LIST_IGNORE; }
  const reader = new FileReader();
  reader.onload = (e) => { const parsed = JSON.parse(e.target?.result as string); setParsedPayload(parsed); setModalOpen(true); };
  reader.readAsText(file);
  return false;
}
```

### Preview modal confirm gate — `src/components/settings/ImportPreviewModal.tsx:134-163,238-244`
```ts
if (confirmText !== 'RESTORE' || !validationResult.valid || !validationResult.envelope) return;
// okButtonProps={{ danger:true, disabled: confirmText !== 'RESTORE' || !validationResult.valid, loading }}
```

### Defaults (seed source, no db) — `src/types/notifications.ts:23-37`, `src/services/ai/budgetWarnSettings.ts:3-7`
`DEFAULT_NOTIFICATION_SETTINGS`, `DEFAULT_BUDGET_WARN_THRESHOLD_PCT=80`, `DEFAULT_NINEROUTER_*` (nineRouterTokenService.ts:12-19), `DEFAULT_GHOST_DEV_CONFIG`, `DEFAULT_MCP_SERVERS`, `DEFAULT_SYSTEM_TYPE_OPTIONS`. Telegram defaults are deliberately excluded — Telegram is owner-machine-only and never enters a profile.

## Shared Patterns

- **DB injection for tests:** every service/view takes `db: TaskPlannerDatabase = defaultDb` (sshService.ts:21, SettingsView.tsx:57). Tests pass `new TaskPlannerDatabase('Name_'+Math.random())` with `import 'fake-indexeddb/auto'`.
- **IDs:** `generateId()` from `src/utils/uuid.ts:5-7` = `crypto.randomUUID()`; no `uuid` package, no `Math.random()` for real IDs. Regenerate IDs for imported SSH/MCP/capacity rows to avoid recipient collisions (R-4).
- **User messaging:** Vietnamese UI; `notification.success/error` + `announceToScreenReader` (SettingsView.tsx:99-107, BackupExportCard.tsx:38-49).
- **Validation boundary:** Zod schema before any db write; invalid payload surfaces errors and blocks confirm (ImportPreviewModal.tsx:262-281).
- **A11y:** `announceToScreenReader` from `src/components/common/AriaLiveRegion`; keep `aria-label`/`placeholder` on confirm inputs (ImportPreviewModal.tsx:329-334).
- **Tauri guard:** native-only calls check `isTauriApp()` then dynamic `import('@tauri-apps/api/core')` (sshService.ts:110-118, keyringService.ts:13-20). Import UI itself needs no Tauri call (FileReader path works in both).

## No Analog Found

None — every artifact has a tracked analog. The genuinely new logic (profile JSON schema with explicit blank-secret fields; machine-specific catalog classification; two-group post-import checklist) is a composition of the analogs above, not a wholly novel pattern. Planner should treat `configProfileSchemas.ts` as a fresh file guided by `backupSchemas.ts` (envelope shape) with the deliberate departure noted in the pitfall column.

## Metadata

**Analog search scope:** `src/services/{backup,ai,agents,system,telegram,knowledge}/`, `src/{validation,types,components/settings,views,workbench,hooks,utils}/`, `tests/{views,components/settings,services,utils}/`, `src-tauri/src/`.
**Tracked-source gate:** all 36 candidate analog paths checked with `git ls-files --error-unmatch` — all TRACKED; no gitignored mirror paths emitted.
**Focused test commands:** from `46-VALIDATION.md` (`npx vitest run <file> -x`); do not run full suite (user memory).

## PATTERN MAPPING COMPLETE
