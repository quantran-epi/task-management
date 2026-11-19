# Phase 46: Configuration Profiles — Research

**Researched:** 2026-11-19
**Domain:** Settings inventory / portable profile JSON / import safety — TaskMate (Tauri desktop, Dexie, Ant Design)
**Confidence:** HIGH (codebase inventory read directly this session); MEDIUM (kiến trúc đề xuất)

> Phạm vi research CHỈ là codebase trong worktree `phase-46-configuration-profiles`. Không đọc/sửa Phase 45 ở worktree chính. Không sửa source code. Không có CONTEXT.md — các quyết định dưới đây là design context có thẩm quyền từ prompt.

<user_constraints>
## User Constraints (từ prompt — locked decisions)

### Locked Decisions (phải tuân thủ, không research alternative)

1. **Màn hình soạn (authoring) KHÔNG đọc cũng KHÔNG export settings hiện tại của user.** Profile được soạn MỚI từ defaults. (Không tái dùng các config card gắn với `db` theo cách đọc giá trị thật.)
2. **Profile phải phủ MỌI setting type trong app**, không chỉ 6 tab của SettingsView. Bao gồm global AI settings + template defaults cho AI-team sạch. **Loại trừ** bookkeeping nội bộ như `ai_teams_docs_root`, và loại trừ team records / members / usage / doc folders thực tế.
3. **Secrets/credentials** (API keys, tokens, passphrases, SSH/Oracle secrets) được HIỂN THỊ là field trong profile soạn nhưng **export blank**. Sau import, recipient nhận checklist "need to re-enter" rõ ràng. **Không bao giờ** đưa giá trị secret vào JSON export. Telegram secrets bị loại hoàn toàn theo Quyết định 8 (xem dưới).
4. **Machine-specific values** (SSH host/keyPath, sqlclPath, claudePath, docs root, localhost endpoints, GitHub owner/repo, v.v.) được **giữ lại** trong JSON profile nhưng màn hình import phải flag chúng với warning/checklist rõ ràng.
5. **AI team global configurable settings gồm:** `ai_budget_warn_threshold_pct` (BudgetWarnThresholdCard), `global_conventions`, `mcp_servers`/Graphiti, 9Router endpoint/model/limits, và global tool connection configs (SSH/Oracle/Ghost Dev; Telegram bị loại theo Quyết định 8) — khác với cột per-team trên `aiTeams`. **Team defaults template:** `budgetTokens`, `concurrencyLimit`, `autoSplitEnabled`, `autoApproveMutations`, `mcpEnabled`, `sshFsToolsEnabled`, `oracleToolsEnabled`, `budgetWarnThresholdPct` với `null` = inherit global. KHÔNG có team names, ids, members, usage, folder handles.
6. **UX ưu tiên cực kỳ dễ dùng:** nút rõ ràng, export một-click profile đang chọn, import preview có tóm tắt cảnh báo, preserve existing settings safety (không clear wholesale destructive).
7. **Cô lập trong worktree** `phase-46-configuration-profiles`, branch `feature/phase-46-configuration-profiles`. Phase 45 chạy ở worktree chính — KHÔNG đụng file/planning state của Phase 45.
8. **[QUYẾT ĐỊNH MỚI — user, 2026-11-19] Telegram bị LOẠI hoàn toàn khỏi profile scope.** Cấu hình Telegram chỉ tồn tại trên máy owner; không đưa vào schema/export, không render field trong form soạn, không ghi `db.telegramSettings` lúc import, và không xuất hiện trong checklist. Đây là scope decision có thẩm quyền, thay thế suggestion trước đó về việc đưa `telegramSettings` vào profile. Test boundary: fixture có `telegramSettings` phải bị schema từ chối; import phải giữ nguyên row `db.telegramSettings` của recipient; authoring test khẳng định không có field Telegram. Phần còn lại của blocker (capacityRules, capacityOverrides, Ghost Dev localStorage) VẪN in-scope.

### Claude's Discretion
- Không được ghi rõ trong prompt. Các lựa chọn triển khai (lưu profile ở đâu, route name, schema shape) để planner quyết định dựa trên research này.

### Deferred Ideas (OUT OF SCOPE)
- PWA / GitHub Pages behavior (CLAUDE.md: out of scope cho work hiện tại).
- Multi-user collaboration / role system.
- Gửi profile tự động qua mạng — chỉ export/import file JSON thủ công.
</user_constraints>

<phase_requirements>
## Phase Requirements

Không có requirement ID được gán (`phase_req_ids = null`). Mục tiêuphase (từ prompt) dùng làm đơn vị lập kế hoạch:

| Mục tiêu | Diễn giải research hỗ trợ |
|----------|---------------------------|
| Màn hình "Settings for Others" soạn profile mới từ defaults | Xem `## Settings Inventory`, `## UX Patterns`, `## Implications for Planning` |
| Profile phủ mọi setting type + AI-team defaults template | Xem `## Settings Inventory` (bảng đầy đủ + template) |
| Export đúng 1 profile ra JSON, secrets blank | Xem `## Schema & Validation`, `## File Dialogs` |
| Import Settings JSON trong SettingsView thường + preview cảnh báo | Xem `## UX Patterns`, `## Risks & Guardrails` |
| Post-import checklist (secrets + machine-specific review) | Xem `## Implications for Planning` (#7) |
| Không phá dữ liệu recipient (merge, snapshot, confirm) | Xem `## Persistence & Write APIs`, `## Risks & Guardrails` |
</phase_requirements>

## Summary

Phase 46 xây dựng một luồng "soạn profile cấu hình cho người khác" hoàn toàn mới, tách biệt khỏi SettingsView hiện tại. Research chỉ ra một sự thật kiến trúc quan trọng: **settings của TaskMate không nằm ở một chỗ duy nhất** — chúng phân bố qua (a) bảng Dexie `db.settings` dạng `{key,value}`, (b) các bảng Dexie riêng (`capacityRules`, `capacityOverrides`, `plannedAllocations`, `telegramSettings`, `aiTeams`/`aiTeamMembers`), (c) `localStorage` (Ghost Dev config), và (d) OS keyring Tauri (secrets). Bất kỳ impl nào "đọc settings hiện tại" sẽ vô tình vi phạmLocked Decision 1 — vì vậy profile phải được soạn từ một **template defaults thuần** (dùng các hằng `DEFAULT_*` đã có), không gắn trực tiếp vào các card đọc `db`.

Tin tốt: app đã có sẵn hầu hết "vật liệu xây dựng" — denylist secret (`isSafeBackupSetting`), forbidden-key regex của backup schema, pattern preview/import (`ImportPreviewModal`), pattern restore an toàn(key-by-key, snapshot, không clear wholesale), file export 3 tầng (`saveFileWithPicker`), và pattern named-config CRUD (`sshService`, Oracle profiles). Phase này **không cần npm dependency mới**.

**Primary recommendation:** Tạo một module thuần `services/configProfiles/` (schema Zod + danh mục keys/secret/machine-specific + build/export/import functions) và một màn hình soạn riêng render form từ defaults vào state cục bộ; tách bạch hoàn toàn khỏi `db.settings` lúc soạn. Export dùng `saveFileWithPicker`; import dùng card kiểu `BackupImportCard` + modal preview kiểu `ImportPreviewModal` nhưng merge key-by-key có snapshot, KHÔNG ghi đè secret blank lên secret thật của recipient.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Soạn profile từ defaults (form state) | Browser / Client (React local state) | — | Quyết định 1 cấm đọc db; profile là draft thuần trước khi lưu/export |
| Lưu danh sách profile đã đặt tên | Database / Storage (Dexie) | — | Theo pattern `ssh_configurations`: một settings row chứa mảng; tránh schema version bump |
| Export 1 profile ra JSON | Browser / Client | Tauri native FS | `saveFileWithPicker` → `save_file_dialog` → fallback download |
| Import JSON + preview + apply | Browser / Client | Database / Storage | Validate Zod ở trust boundary, merge vào Dexie trong transaction, snapshot trước |
| Secrets (không bao giờ lộ ra JSON) | Tauri native keyring | Client (chỉ field trống) | Keyring là nơi duy nhất giữ giá trị thật; export luôn blank |
| Nhắc re-enter / review sau import | Browser / Client (checklist UI) | — | Hiện thị danh sách field cần nhập lại + machine-specific cần rà soát |

## Objective

Trả lời "cần biết gì để lập kế hoạch Phase 46 tốt": tồn kho đầy đủ mọi loại setting, các API ghi/đọc, schema validation, cơ chế file dialog, UX pattern hiện có, và kiến trúc test — kèm rủi ro/guardrails cho việc import an toàn.

## Requirements

Không có ID yêu cầu chính thức; xem `<phase_requirements>` ở trên.

---

## Findings theo Area

### Area 1 — Settings Inventory (tồn kho đầy đủ)

#### 1a. Bốn backend lưu trữ settings

| Backend | Ví dụ | verified |
|---------|-------|----------|
| Dexie `db.settings` `{key, value}` | hầu hết cấu hình (xem bảng 1b) | `[VERIFIED: src/db/index.ts:84]`, `[VERIFIED: src/services/backup/exportBackup.ts:235]` |
| Dexie bảng riêng | `capacityRules`, `capacityOverrides`, `plannedAllocations`, `telegramSettings`, `telegramWhitelist`, `aiTeams`, `aiTeamMembers` | `[VERIFIED: src/db/index.ts:80-114]`, `[VERIFIED: src/services/backup/exportBackup.ts:224-258]` |
| `localStorage` | Ghost Dev config, lịch sử session, geometry popout, code Mermaid | `[VERIFIED: src/services/agents/ghostDevConfig.ts:8,31]`, `[VERIFIED: src/services/agents/agentSessionHistoryRepo.ts:9]` |
| OS keyring (Tauri) | `github_pat`, `backup_passphrase`, `jira_api_token`, `ninerouter_api_key`, `image_api_key`, `ssh_secret_*` | `[VERIFIED: src/services/keyringService.ts:5-11]`, `[VERIFIED: src/services/sshService.ts:18,67]` |

Hệ quả: "tất cả setting types" phải được hiểu là **hợp** của 4 backend này (trừ phần bookkeeping/secrets theo quyết định 2/3).

#### 1b. Dexie settings keys — danh mục đầy đủ (đọc trực tiếp source)

`[VERIFIED: src/services/backup/exportBackup.ts:12-43]` — denylist (trích verbatim):
```ts
export const UNSAFE_OR_EPHEMERAL_SETTING_KEYS = new Set<string>([
  'jira_api_token', 'github_pat', 'github_token', 'github_passphrase',
  'backup_passphrase', 'ninerouter_api_key', 'knowledge_server_token',
  'image_api_key', 'tauri_keyring_migrated', 'tauri_sqlite_queue',
  'tauri_sqlite_last_flush_at', 'tauri_sqlite_missing_path',
  'tauri_sqlite_path', 'tauri_sqlite_enabled', 'last_synced_sha',
  'last_synced_at', 'github_auto_sync_last_run_at',
  'github_auto_sync_last_attempt_at', 'github_auto_sync_last_error',
  'github_auto_sync_state', 'github_auto_sync_dirty_since',
  'github_auto_sync_missed_due_at', 'last_pre_import_snapshot',
  'ssh_configurations',
  'oracle_ai_tool_config_list',
  'oracle_ai_tool_config',
]);
```

`[VERIFIED: src/services/backup/exportBackup.ts:50-63]` — suffix rule (trích verbatim):
```ts
export function isSafeBackupSetting(key: string): boolean {
  if (UNSAFE_OR_EPHEMERAL_SETTING_KEYS.has(key)) return false;
  const lower = key.toLowerCase();
  if (
    lower.endsWith('_token') || lower.endsWith('_key') ||
    lower.endsWith('_passphrase') || lower.endsWith('_secret') ||
    lower.endsWith('_pat')
  ) { return false; }
  return true;
}
```

Bảng phân loại mọi key tìm được (nguồn: grep `db.settings.*` + constants trên khắp `src`, đã đọc file định nghĩa):

| Nhóm | Keys | Xử lý trong profile | Nguồn verified |
|------|------|---------------------|----------------|
| **Config thường (portable)** | `github_owner`, `github_repo`, `github_branch`, `github_auto_sync_enabled`, `github_auto_sync_mode`, `github_auto_sync_interval_minutes`, `github_auto_sync_daily_time` | Giữ (machine-specific: owner/repo → flag review) | `src/components/settings/GitHubConfigCard.tsx:61-87`, `src/components/settings/GitHubSyncCard.tsx:91-97,534-568` |
| Jira config | `jira_domain`, `jira_email`, `jira_cors_proxy`, `jira_default_project`, `jira_default_issue_type`, `jira_status_mappings`, `jira_account_id` | Giữ | `src/components/settings/JiraConfigCard.tsx:96-140`, `src/components/tasks/CreateJiraIssueModal.tsx:128` |
| 9Router / image (AI) | `ninerouter_endpoint`, `ninerouter_default_model`, `ninerouter_char_limit`, `ninerouter_context_window_tokens`, `ninerouter_cached_models`, `image_endpoint`, `image_model`, `image_cached_models` | Giữ (endpoint = machine-specific → flag) | `src/services/ai/nineRouterTokenService.ts:138-176,296-300` |
| MCP / Graphiti | `mcp_servers`, `graphiti_mcp_enabled`, `graphiti_mcp_endpoint` | Giữ (endpoint = machine-specific → flag) | `src/services/ai/mcpClient.ts:8`, `src/services/ai/graphitiMcpClient.ts:8-9` |
| AI global | `global_conventions`, `ai_budget_warn_threshold_pct` | Giữ (bắt buộc theo quyết định 5) | `src/services/conventionService.ts:5`, `src/services/ai/budgetWarnSettings.ts:10` |
| Notification | `notification_settings` | Giữ (có `DEFAULT_NOTIFICATION_SETTINGS`) | `src/types/notifications.ts:3,23-36` |
| System types | `system_type_options` | Giữ (có `DEFAULT_SYSTEM_TYPE_OPTIONS`) | `src/services/system/systemTypeSettings.ts:10,23-29` |
| Knowledge daemon | `knowledge_server_enabled`, `knowledge_server_base_url` | Giữ (base_url localhost → flag review) | `src/services/knowledge/knowledgeConfig.tsx:11-13` |
| **Secret (blank on export)** | `jira_api_token`, `github_pat`, `github_token`, `github_passphrase`, `backup_passphrase`, `ninerouter_api_key`, `knowledge_server_token`, `image_api_key` | HIỂN THỊ field nhưng export `''` | denylist trên + `src/services/keyringService.ts:5-11` |
| **Machine + secret (blank)** | `ssh_configurations` (host/username/keyPath), `oracle_ai_tool_config_list`, `oracle_ai_tool_config` (connectionString chứa password) | Theo quyết định 3 vs 4: host/keyPath "preserved" nhưng connectionString/password là secret → cần tách field. Xem rủi ro R-3 | `src/types/ssh.ts:3-14`, `src/types/oracleSqlcl.ts:1-40`, denylist trên |
| **Bookkeeping (LOẠI TRỪ)** | `ai_teams_docs_root`, `tauri_*`, `last_synced_*`, `github_auto_sync_last_*`, `github_auto_sync_state`, `last_pre_import_snapshot` | Không đưa vào profile | `src/db/repositories/teamDocsRepo.ts:19`, denylist trên, `src/services/backup/validateBackup.ts:570-585` |

#### 1c. Các bảng Dexie riêng liên quan setting

| Bảng | Nội dung | Xử lý |
|------|----------|-------|
| `capacityRules` (7 ngày, `dayOfWeek`/`workMinutes`) | cấu hình công suất tuần | Giữ; copy rows sang profile; import upsert theo `dayOfWeek` | `[VERIFIED: src/db/repositories/capacityRepo.ts:26-55]`, `[VERIFIED: src/types/models.ts:131-134]` |
| `capacityOverrides` | ngoại lệ theo ngày | Giữ; upsert theo `date` | `[VERIFIED: src/db/repositories/capacityRepo.ts:60-113]` |
| `plannedAllocations` | phân bổ kế hoạch | **RESOLVED (A2): LOẠI TRỪ** — dữ liệu vận hành, không phải setting; không export để tránh mang dữ liệu lịch sử | `[VERIFIED: src/services/backup/exportBackup.ts:227]` |
| `telegramSettings` (`id:'default'`, `botToken`, `isEnabled`, `autoStartOnLaunch`, `defaultScope`, `maxHistoryTurns`) | cấu hình bot | **RESOLVED (user decision mới): LOẠI TRỪ HOÀN TOÀN** — chỉ tồn tại trên máy owner; không vào schema/export/form/import/checklist. Quyết định này thay thế đề xuất cũ "giữ config, botToken blank". | `[VERIFIED: src/services/telegram/telegramSettingsService.ts:10-17]` |
| `telegramWhitelist` | danh sách user | LOẠI TRỪ (dữ liệu thực tế, không phải setting) | `[VERIFIED: src/services/backup/exportBackup.ts:242]` |
| `aiTeams` / `aiTeamMembers` | team records + usage + docsFolderId | LOẠI TRỪ record; CHỈ lấy template defaults (xem 1d) | `[VERIFIED: src/types/aiOffice.ts:88-132]` |

#### 1d. AI-team defaults template (quyết định 5)

`[VERIFIED: src/types/aiOffice.ts:88-114]` — các field cấu hình được phép đưa vào template (trích verbatim phần khai báo):
```ts
export interface AiTeam {
  id: string;              // LOẠI TRỪ
  name: string;            // LOẠI TRỪ
  leadId?: string;         // LOẠI TRỪ
  leaderLockedAt?: string; // LOẠI TRỪ (bookkeeping)
  budgetTokens: number;
  autoSplitEnabled?: boolean | undefined;
  autoApproveMutations?: boolean | undefined;
  mcpEnabled?: boolean | undefined;
  sshFsToolsEnabled?: boolean | undefined;
  oracleToolsEnabled?: boolean | undefined;
  concurrencyLimit?: number | undefined;
  budgetWarnThresholdPct?: number | undefined; // null/undefined = inherit global
  docsFolderId?: string;   // LOẠI TRỪ (folder handle)
  createdAt: string;       // LOẠI TRỪ
  updatedAt: string;       // LOẠI TRỪ
}
```
Template đề xuất (chỉ các field cấu hình, KHÔNG id/name/members/usage/folder):
`{ budgetTokens, concurrencyLimit?, autoSplitEnabled?, autoApproveMutations?, mcpEnabled?, sshFsToolsEnabled?, oracleToolsEnabled?, budgetWarnThresholdPct?: null }`.
`budgetWarnThresholdPct: null` = inherit global (khớp semantics `undefined` ở `src/services/ai/budgetWarnSettings.ts:12-25`).

Secrets bổ sung nằm ngoài `db.settings`: Telegram `botToken` trong bảng (bị LOẠI hoàn toàn khỏi profile theo Quyết định 8 — chỉ máy owner); SSH secret trong keyring với prefix `ssh_secret_<id>` `[VERIFIED: src/services/sshService.ts:18,67,92]`; Oracle connectionString có password `[VERIFIED: src/types/oracleSqlcl.ts:4]`.

Defaults sẵn có để seed form (dùng lại, không tự chế):
- `DEFAULT_NOTIFICATION_SETTINGS` `[VERIFIED: src/types/notifications.ts:23-36]`
- `DEFAULT_SYSTEM_TYPE_OPTIONS` `[VERIFIED: src/services/system/systemTypeSettings.ts:23-29]`
- `DEFAULT_GHOST_DEV_CONFIG` `[VERIFIED: src/services/agents/ghostDevConfig.ts:10-15]`
- `DEFAULT_MCP_SERVERS` `[VERIFIED: src/services/ai/mcpClient.ts:40+]`
- ~~`DEFAULT_TELEGRAM_SETTINGS`~~ — KHÔNG dùng: Telegram bị loại khỏi profile (Quyết định 8). `[VERIFIED: src/services/telegram/telegramSettingsService.ts:10-17]`
- `DEFAULT_NINEROUTER_ENDPOINT/MODEL/CHAR_LIMIT/CONTEXT_WINDOW_TOKENS`, `DEFAULT_IMAGE_*` `[VERIFIED: src/services/ai/nineRouterTokenService.ts:12-19]`
- `DEFAULT_BUDGET_WARN_THRESHOLD_PCT` (trong `src/types/aiOffice.ts`) `[VERIFIED: src/services/ai/budgetWarnSettings.ts:3-7]`

---

### Area 2 — Persistence / Write APIs hiện có

| Nhu cầu | API/địa điểm | Hành vi quan trọng | verified |
|---------|--------------|--------------------|----------|
| Settings đọc/ghi | `db.settings.get/put/delete` | `{key,value}`, key là PK | `src/db/index.ts:84` |
| Config có defaults-in-code + 1 row override | `getSshConfigs`/`saveSshConfig` — một row `ssh_configurations` chứa mảng, id stable từ caller | Pattern gợi ý để lưu named profiles | `src/services/sshService.ts:21-88` |
| Named CRUD + secret tách keyring | Oracle profiles (`oracle_ai_tool_config_list`) | profile list 1 row; secret nằm connectionString → nằm denylist | `src/types/oracleSqlcl.ts:24-40`, `src/services/ai/oracleSqlclService.ts:36-66` |
| Capacity upsert có validate | `updateCapacityRule`, `setCapacityOverride`, `removeCapacityOverride` | Zod parse trước, transaction `rw`, upsert theo `dayOfWeek`/`date` | `src/db/repositories/capacityRepo.ts:36-125` |
| Restore an toàn | `replaceTables` | **settings thay key-by-key**, `bulkDelete([...incomingSettingKeys])` — KHÔNG clear wholesale; snapshot trước | `src/services/backup/restoreBackup.ts:279-336` |
| Snapshot / rollback | `captureSnapshot` / `rollbackToSnapshot` | lưu vào `last_pre_import_snapshot`, có `downloadSnapshotFile` | `src/services/backup/restoreBackup.ts:361-375` |
| Validate trước ghi | `validateBackupPayload(raw)` → `{valid, envelope, errors}` | boundary; UI preview gọi trước | `src/services/backup/validateBackup.ts:77` |
| UUID stable | `generateId()` = `crypto.randomUUID()` | không dùng package `uuid` | `src/utils/uuid.ts:1-6` |

`[VERIFIED: src/services/backup/restoreBackup.ts:279-286]` — trích verbatim đoạn guardrail phải kế thừa:
```ts
// Settings are replaced key-by-key, never cleared wholesale: secrets (tokens, passphrases)
// are not part of any payload and must survive an import and its rollback.
const incomingSettingKeys = new Set<string>([
  ...(tables.settings ?? []).map((setting) => setting.key),
]);
```
```ts
targetDb.settings.bulkDelete([...incomingSettingKeys]), targetDb.backupMetadata.clear(),
```

---

### Area 3 — Schema / Validation

- `BACKUP_SCHEMA_VERSION = 13` `[VERIFIED: src/validation/backupSchemas.ts:887]`; envelope `{app, schemaVersion: literal(13), exportedAt, tables, counts}` `[VERIFIED: src/validation/backupSchemas.ts:891]`.
- `BackupSettingRecordSchema = z.object({ key: z.string().min(1), value: z.unknown() })` `[VERIFIED: src/validation/backupSchemas.ts:396-399]` — setting value là `unknown` (không validate kiểu ở record level).
- `FORBIDDEN_BACKUP_KEYS` + regex chặn secret ở mọi cấp nested `[VERIFIED: src/validation/backupSchemas.ts:194-218]` (trích verbatim):
```ts
const FORBIDDEN_BACKUP_KEYS = new Set([
  'apiKey', 'apikey', 'bearerToken', 'token', 'accessToken', 'refreshToken',
  'passphrase', 'password', 'secret', 'pat', 'endpointCredential', 'authorization',
  'systemPrompt', 'prompt', 'rawModelResponse', 'rawToolResponse', 'partialBuffer',
  'streamingText', 'error', 'stack', 'diagnostics', 'runtime', 'attachments',
]);
```
Regex: `/(^|_)(api[_-]?key|bearer[_-]?token|access[_-]?token|refresh[_-]?token|passphrase|password|secret|pat|prompt|partial|raw.*response|stack|diagnostic|error)(_|$)/i`.
- **Hệ quả trực tiếp cho Phase 46:** nếu tái dùng `findForbiddenBackupKey` cho profile JSON, mọi field tên `*token*`, `*key*`, `*secret*` (kể cả field trống) sẽ bị chặn. Cần **schema profile riêng** (file mới, ví dụ `src/validation/configProfileSchemas.ts`) với danh sách secret field được khai báo rõ ràng, giá trị bắt buộc `''`, thay vì dùng chung forbidden-key regex của backup. Đây là điểm dễ gây rewrite nếu bỏ qua.
- `ai_teams_docs_root` bị validate đặc biệt và phải nằm ngoài profile `[VERIFIED: src/services/backup/validateBackup.ts:570-585]`.

---

### Area 4 — File Dialogs & Export/Import Mechanism

| Chức năng | API | Hành vi | verified |
|-----------|-----|---------|----------|
| Save file (3 tầng) | `saveFileWithPicker(filename, blob, options)` | (1) Tauri `save_file_dialog` → (2) `showSaveFilePicker` → (3) `downloadBlob` fallback | `src/utils/fileExport.ts:679-714` |
| Tauri save command | Rust `save_file_dialog(default_name, title, filters, data: Vec<u8>)` — `rfd::FileDialog`, ghi file, trả `Option<String>` (None = user cancel) | native FS | `src-tauri/src/jira_proxy.rs:156-179`, `src-tauri/src/lib.rs:44` |
| Download đơn giản | `triggerDownload(content, fileName)` (Blob + anchor + revoke URL) | fallback browser | `src/services/backup/exportBackup.ts:381-391` |
| Chọn file local | `select_local_file` (Rust, trả path string) — chỉ pick, không đọc nội dung | cần FileReader/Rust để đọc JSON | `src-tauri/src/jira_proxy.rs:190-195`, `src-tauri/src/lib.rs:43` |
| Import JSON hiện tại | `BackupImportCard`: Ant Design `Upload.Dragger` + `FileReader.readAsText` + `JSON.parse`, max 50MB, `accept='.json'` — chạy được cả browser lẫn Tauri qua file input | pattern chuẩn để copy | `src/components/settings/BackupImportCard.tsx:11,26-58,75-83` |
| Sanitize filename | `sanitizeFilename` (chặn traversal) | dùng cho tên file export | `src/utils/__tests__/fileExport.test.ts:34-39` |

Khuyến nghị: export profile dùng `saveFileWithPicker` (đã xử lý Tauri; test sẵn ở `src/utils/__tests__/fileExport.test.ts:202-235`). Import dùng `Upload.Dragger` + FileReader y hệt `BackupImportCard` — KHÔNG cần gọi `select_local_file` (phải tự đọc file).

---

### Area 5 — UX Patterns hiện có

- **SettingsView**: 6 tab, thứ tự bị test khóa cứng `[VERIFIED: tests/views/SettingsView.test.tsx:229-248]` — `getAllByRole('tab')` length 6 + tên từng tab. Kết luận: **KHÔNG thêm tab thứ 7**; dùng route/screen riêng (đúng gợi ý prompt) để không đụng test này.
  Thứ tự tab `[VERIFIED: src/views/SettingsView.tsx:136-271]`: `capacity`, `data`, `jira`, `notifications`, `ai`, `ssh`.
- **Import preview pattern**: `ImportPreviewModal` — validate in-memory, bảng so sánh current/incoming/delta, Alert cảnh báo, xhróa bằng confirm text `RESTORE` `[VERIFIED: src/components/settings/ImportPreviewModal.tsx:62-67,106-132,226-337]`. Có thể mở rộng thành preview profile (bảng field-count + warning summaries) thay vì regeneration từ đầu.
- **Post-restore banner**: `PostRestoreBanner` + `announceToScreenReader` (a11y) `[VERIFIED: src/views/SettingsView.tsx:162-168,320-325]` → dùng cho checklist sau import.
- **Named-config UI**: `SshConfigCard` (chọn file qua `select_local_file`), Oracle profile service/modal — mẫu CRUD tên + active selection `[VERIFIED: src/components/settings/SshConfigCard.tsx:141]`, `[VERIFIED: src/types/oracleSqlcl.ts:24-40]`.
- **Nhóm section trong tab**: `Typography.Text strong` làm section header, `Space direction=vertical` — pattern nhất quán `[VERIFIED: src/views/SettingsView.tsx:146-150,239-250]`.

---

### Area 6 — Tests & Environment

`[VERIFIED: vite.config.ts:65-75]` — Vitest, `environment: 'jsdom'`, `setupFiles: ['./tests/setup.ts']`.
Script: `npm test` = `vitest run` (**full suite ~1 tiếng — theo memory KHÔNG chạy full**); `npm run test:e2e` = Playwright `[VERIFIED: package.json scripts]`.

Gói test liên quan đã có (dùng làm mẫu, không viết lại từ đầu):
- `tests/views/SettingsView.test.tsx` (khóa 6 tab)
- `tests/components/settings/ImportPreviewModal.test.tsx`, `BackupExportCard.test.tsx`
- `tests/services/backup/exportBackup.test.ts`, `restoreBackup.test.ts`, `validateBackup.test.ts`
- `src/utils/__tests__/fileExport.test.ts` (save dialog, sanitize)
- `src/services/ai/__tests__/oracleMultiConnection.test.ts` (named CRUD)
- `src/services/system/__tests__/systemTypeSettings.test.ts`, `tests/services/ai/budgetWarnSettings.test.ts`
- `tests/agents/ghostDevConfig.test.ts`, `tests/ai/nineRouterTokenService.test.ts`

Mock patterns: `vi.mock('@tauri-apps/api/core')` hoặc `vi.mock('../../../src/utils/timerPopout', () => ({ isTauriApp: vi.fn(() => false) }))` `[VERIFIED: tests/components/settings/McpConfigCard.test.tsx:7-9]`; `import 'fake-indexeddb/auto'` + `new TaskPlannerDatabase('TestDB_'+Math.random())` `[VERIFIED: src/db/repositories/__tests__/aiOfficeImport.test.ts:2,35]`.

Environment (đã probe): `node v26.13.0`, `npm 11.20.0` — đáp ứng Vitest 5 (yêu `^22.12||^24||>=26`). Không có dependency ngoài cần cài.

---

## Don't Hand-Roll

| Problem | Đừng tự làm | Dùng | Lý do |
|---------|-------------|------|-------|
| Secret denylist | danh sách secret tự nghĩ | `isSafeBackupSetting` + `UNSAFE_OR_EPHEMERAL_SETTING_KEYS` (`exportBackup.ts:12-63`) + `KEYRING_KEYS` |Đã được test, phản ánh mọi secret thực tế |
| File save dialog | tự viết input/download | `saveFileWithPicker` | 3 fallback, Tauri native, sanitize filename |
| JSON file import | tự viết parser/dragger | `BackupImportCard` pattern (`Upload.Dragger` + FileReader) | chạy cả browser/Tauri, có size guard |
| Preview UI | tự dựng modal | mở rộng `ImportPreviewModal` | đã có validate+bảng so sánh+a11y |
| Restore an toàn | `db.settings.clear()` | key-by-key + snapshot (`restoreBackup.ts:279-336`) | tránh xóa secret của recipient |
| UUID | `Math.random()` / package `uuid` | `generateId()` = `crypto.randomUUID()` | CLAUDE.md cấm package uuid |
| Defaults form | tự nhập giá trị | các hằng `DEFAULT_*` đã liệt kê | tránh drift với runtime |

## Common Pitfalls

1. **Tái dùng config card gắn `db` cho màn hình soạn** — vi phạm Quyết định 1 (card đọc settings thật). Tránh: form thuần từ defaults. Dấu hiệu: thấy `db.settings.get(...)` trong luồng authoring.
2. **Dùng chung `findForbiddenBackupKey` cho profile JSON** — regex chặn field `*_token`/`*_key` dù để trống → profile hợp lệ bị reject. Tránh: schema profile riêng.
3. **Ghi đè secret blank lên recipient** — import `ninerouter_api_key: ''` vào keyring/db xóa secret thật. Tránh: bỏ qua key có giá trị trống khi apply (xem R-2).
4. **Clear wholesale settings/tables** — phá dữ liệu recipient. Tránh: merge key-by-key + snapshot + confirm.
5. **Export `ssh_configurations` / Oracle connectionString nguyên vẹn** — connectionString chứa password, host/path là machine-specific. Tránh: tách field; secret → blank, host/path → giữ + flag review (xem R-3).
6. **Thêm tab thứ 7 vào SettingsView** — vỡ test khóa 6 tab. Tránh: route/screen riêng.
7. **Quên đăng ký route ở workbench** — runtime chính là Tauri workbench, không chỉ `App.tsx` hash route. Phải sửa cả `src/types/navigation.ts`, `src/hooks/useHashRoute.ts`, `src/App.tsx`, `src/workbench/EditorArea.tsx`, `src/workbench/WorkbenchLayout.tsx`, `src/workbench/store/layoutStore.ts` (xem Implications #3).
8. **ID collision khi import** — profile mang sẵn id của SSH config/MCP server/capacity rule → đụng id recipient. Tránh: regenerate id hoặc namespace (xem R-4).

## Code Examples

Mẫu tái dùng (đã verify trong session):

```ts
// save file — src/utils/fileExport.ts:679
const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' });
const result = await saveFileWithPicker('profile.json', blob, {
  title: 'Lưu cấu hình profile', filters: [{ name: 'JSON', extensions: ['json'] }],
});
```

```ts
// safe import boundary — mở rộng từ src/services/backup/validateBackup.ts:77
const validation = validateConfigProfilePayload(parsed); // Zod schema MỚI
if (!validation.valid) { /* hiện errors, KHÔNG ghi db */ }
// apply: merge key-by-key, bỏ qua secret rỗng, có snapshot — xem restoreBackup.ts:279-336
```

```ts
// profile store pattern — theo src/services/sshService.ts:21-63
const rows = await db.settings.get('configuration_profiles'); // một row chứa mảng
// mỗi profile: { id: generateId(), name, createdAt, updatedAt, config: <ProfileConfig> }
```

## Implications for Planning

1. **Tạo module thuần trước UI:** `src/services/configProfiles/` gồm `types.ts`, `defaults.ts`, `schema.ts` (Zod), `catalog.ts` (danh mục phân loại key: portable / secret / machine-specific / excluded), `profileService.ts` (CRUD), `exportProfile.ts`, `importProfile.ts`. Đặt schema riêng ở `src/validation/configProfileSchemas.ts`.
2. **Lưu profile theo pattern một-row-array** (`configuration_profiles` trong `db.settings`) để tránh Dexie version bump — profile do chính user soạn, không phải dữ liệu app. Thêm key này vào danh mục "excluded khỏi nội dung profile" để tránh tự tham chiếu.
3. **Đăng ký màn hình ở 6 điểm:** `src/types/navigation.ts:1-14`, `src/hooks/useHashRoute.ts:11-25`, `src/App.tsx:112-118`, `src/workbench/EditorArea.tsx:578-579`, `src/workbench/WorkbenchLayout.tsx:210-253`, `src/workbench/store/layoutStore.ts:11`. Gợi ý route: `'config-profiles'`. Phải cập nhật `validTabs`/`VALID_ROUTES` nếu dùng tab param.
4. **Form soạn từ defaults:** render theo nhóm khớp 6 tab + AI global + AI-team template; mỗi secret field có placeholder "sẽ để trống khi export"; machine-specific field có icon cảnh báo. Nút "Xuất profile này" một-click (Quyết định 6).
5. **Import card đặt trong tab `data` của SettingsView** (`src/views/SettingsView.tsx:160-199`) — KHÔNG thêm tab; cạnh `BackupImportCard`. Gọi preview modal riêng (profile-aware).
6. **Checklist sau import** gồm 2 nhóm: (a) secrets cần nhập lại (keyring/Oracle — KHÔNG có Telegram theo Quyết định 8), (b) machine-specific cần rà soát (hosts, paths, endpoints, GitHub owner/repo, ghostDevConfig.claudePath). Dùng `PostRestoreBanner` + `announceToScreenReader`.
7. **Không phụ thuộc PWA/GitHub Pages** (CLAUDE.md) — mọi thứ chạy local/Tauri.

## Risks & Guardrails

| ID | Rủi ro | Guardrail |
|----|--------|-----------|
| R-1 | Secret lọt vào JSON | Schema profile: secret field kiểu `z.literal('')` khi export; test quét toàn bộ JSON không chứa giá trị từ denylist/keyring. Không dùng regex forbidden-key của backup làm cơ chế duy nhất. |
| R-2 | Import xóa secret recipient | Apply bỏ qua key/field có giá trị `''`; keyring không bị ghi từ profile; test重现 với secret có sẵn. |
| R-3 | SSH/Oracle vừa machine-specific vừa secret | Tách: `host/username/keyPath/sqlclPath` → giữ + flag review; `connectionString`/password/keyring secret → blank. Cần planner chốt cách tách Oracle connectionString (chứa cả user/pass/host). |
| R-4 | ID collision | Regenerate UUID cho SSH/MCP/capacity rows lúc import, hoặc namespace; test import 2 lần không duplicate/đè. |
| R-5 | Phá dữ liệu recipient | Merge key-by-key, snapshot trước (`captureSnapshot`), xác nhận rõ ràng (confirm text), không `clear()` wholesale. |
| R-6 | Vỡ test 6 tab | Không sửa `items` của SettingsView theo hướng thêm tab; nếu buộc thêm thì cập nhật `tests/views/SettingsView.test.tsx:236` — nhưng khuyến nghị route riêng. |
| R-7 | Schema version | Profile JSON là artifact MỚI, KHÔNG đụng `BACKUP_SCHEMA_VERSION=13`; dùng `profileSchemaVersion` riêng (bắt đầu 1). |
| R-8 | Worktree isolation | Chỉ đụng file trong worktree này; KHÔNG commit/push phase 45; branch đã đúng `feature/phase-46-configuration-profiles`. |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | build/test | ✓ | v26.13.0 | — |
| npm | test runner | ✓ | 11.20.0 | — |
| Vitest + jsdom + fake-indexeddb | unit/component tests | ✓ (trong package.json) | — | — |
| Tauri CLI / Rust | native save dialog | ✓ (src-tauri, `save_file_dialog`) | — | `showSaveFilePicker` → `downloadBlob` |
| npm dependency mới | — | KHÔNG CẦN | — | dùng stack hiện có |

**Missing dependencies with no fallback:** none.

## Validation Architecture

> `workflow.nyquist_validation = true` trong config → bắt buộc. Theo memory: **không chạy full suite**; dùng focused test commands.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest + jsdom + fake-indexeddb |
| Config | `vite.config.ts` (`test.environment='jsdom'`, setupFiles `./tests/setup.ts`) |
| Quick run | `npx vitest run <file> -x` |
| Full suite | `npm test` (chạy ở CI/phases cuối, KHÔNG chạy local theo memory) |

### Phase Requirements → Test Map (đề xuất cho planner)

| Hành vi | Test type | Automated command (focused) | File đề xuất |
|---------|-----------|------------------------------|--------------|
| Soạn profile từ defaults, KHÔNG đọc db | component | `npx vitest run tests/views/ConfigProfilesView.test.tsx -x` | `tests/views/ConfigProfilesView.test.tsx` |
| Export đúng 1 profile, secrets blank | unit | `npx vitest run tests/services/configProfiles/exportProfile.test.ts -x` | `tests/services/configProfiles/exportProfile.test.ts` |
| Schema chấp nhận mọi setting type + team template | unit | `npx vitest run tests/validation/configProfileSchemas.test.ts -x` | `tests/validation/configProfileSchemas.test.ts` |
| Quét JSON không chứa secret + Telegram vắng mặt | unit | `npx vitest run tests/services/configProfiles/exportProfile.test.ts -x` | `tests/services/configProfiles/exportProfile.test.ts` (secret-leak case; Telegram-absent asserted in `configProfileSchemas.test.ts` / `profileRoundTrip.test.ts`) |
| Import preview cảnh báo machine-specific | component | `npx vitest run tests/components/settings/ImportProfilePreviewModal.test.tsx -x` | `tests/components/settings/ImportProfilePreviewModal.test.tsx` |
| Import merge key-by-key, không clear wholesale | unit | `npx vitest run tests/services/configProfiles/importProfile.test.ts -x` | `tests/services/configProfiles/importProfile.test.ts` |
| Import không ghi đè secret thật | unit | `npx vitest run tests/services/configProfiles/importProfile.test.ts -x` | (cùng file, case riêng) |
| Checklist sau import | component | `npx vitest run tests/components/settings/PostProfileImportChecklist.test.tsx -x` | `tests/components/settings/PostProfileImportChecklist.test.tsx` |
| SettingsView vẫn 6 tab (non-regression) | component | `npx vitest run tests/views/SettingsView.test.tsx -x` | existing |
| File save dialog 3 tầng | unit | `npx vitest run src/utils/__tests__/fileExport.test.ts -x` | existing |

### Sampling Rate
- Per task commit: focused command tương ứng ở bảng trên.
- Per wave merge: nhóm focused files của wave.
- Phase gate: tất cả focused tests xanh + `npx tsc --noEmit` (KHÔNG cần full suite theo memory người dùng).

### Wave 0 Gaps
- [ ] `src/validation/configProfileSchemas.ts` + test — schema profile riêng (R-1).
- [ ] `src/services/configProfiles/*` (defaults, catalog, export, import) + tests — lõi phase.
- [ ] `tests/views/ConfigProfilesView.test.tsx` — màn hình soạn.
- [ ] `tests/components/settings/ImportProfilePreviewModal.test.tsx` — preview import.
- [ ] Mock helper cho `saveFileWithPicker` trong jsdom (đã có mẫu ở `src/utils/__tests__/fileExport.test.ts:202`).

## Security Domain

> `security_enforcement = true`, ASVS level 1.

| ASVS Category | Applies | Standard control |
|---------------|---------|------------------|
| V2 Authentication | no | app một user, không auth |
| V3 Session Management | no | — |
| V4 Access Control | yes | secret/keyring chỉ đọc qua API Tauri; profile JSON không chứa secret |
| V5 Input Validation | yes | Zod schema riêng ở trust boundary (import file); validate filename (`sanitizeFilename`), size ≤ 50MB |
| V6 Cryptography | no (không thêm crypto mới) | backup encryption cũ giữ nguyên; profile JSON **không mã hóa** nhưng **không chứa secret** |

Threat patterns cho stack:
| Pattern | STRIDE | Mitigation |
|---------|--------|------------|
| Secret leak qua export JSON | Information disclosure | denylist + schema `z.literal('')` + test quét (R-1) |
| Import file độc hại / oversized | Tampering/DoS | Zod strict + size guard + snapshot + confirm |
| Path traversal trong filename export | Tampering | `sanitizeFilename` |
| Prompt-injection nội dung `global_conventions` trong profile | Tampering | coi nội dung import là untrusted data, wrap khi đưa vào prompt (pattern hiện có) |

## Package Legitimacy Audit

**Không có package ngoài nào được đề xuất cài đặt** — phase dùng lại `antd`, `dexie`, `zod`, `dayjs`, `@ant-design/icons`, `@tauri-apps/api` đã có. Gate legitimacy không áp dụng (không có install step). Không có package `[SLOP]`/`[SUS]` cần ghi.

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|-------|---------|---------------|
| A1 — **RESOLVED** | Lưu named profiles trong 1 row `configuration_profiles` trên `db.settings` (tránh schema bump) | Implications #2 | Chốt: một-row-array, không version bump |
| A2 — **RESOLVED** | `plannedAllocations` là dữ liệu vận hành → không export; capacityRules/Overrides CÓ export | Inventory 1c | Chốt: rules/overrides upsert theo natural key, plannedAllocations loại |
| A3 — **RESOLVED** | Oracle `connectionString`: blank toàn bộ chuỗi, host/service riêng giữ + flag | R-3 | Chốt: không tách password từ chuỗi; host vẫn review được |
| A4 | Tên route `'config-profiles'` và việc đăng ký cả workbench | Implications #3 | Tên khác/đăng ký thiếu → screen không mở được ở runtime chính |
| A5 | Dùng lại `ImportPreviewModal` (mở rộng) thay vì viết modal mới | UX/Implications #5 | Nếu schema khác quá xa → khó tái dùng; planner quyết định |

## Open Questions — tất cả đã RESOLVED

1. **[RESOLVED — A1] Lưu profile ở đâu?** — Quyết định: một-row-array trên `db.settings` key `configuration_profiles` (theo pattern `ssh_configurations`), KHÔNG tạo table Dexie riêng → tránh version bump. Rationale: profile do user soạn, không phải dữ liệu app; pattern đã được test.
2. **[RESOLVED — A3] Oracle connectionString tách thế nào?** — Quyết định: để trống TOÀN BỘ chuỗi `connectionString` (chứa `user/password@host:port/service`) trong export; các field host/service/keyPath ở dạng riêng được giữ và flag machine-specific. Rationale: không thể tách password an toàn từ chuỗi; blank nguyên chuỗi tránh lộ mật khẩu, host vẫn được review.
3. **[RESOLVED — A2] `plannedAllocations` / capacityOverrides có vào profile không?** — Quyết định: **capacityRules (upsert theo `dayOfWeek`) + capacityOverrides (upsert theo `date`) CÓ trong profile**; `plannedAllocations` bị LOẠI (dữ liệu vận hành). Rationale: rules/overrides là cấu hình công suất đúng nghĩa "setting"; plannedAllocations là lịch sử phân bổ.
4. **[RESOLVED] Có cần nameless "quick export" không chọn profile không?** — Không. Quyết định 6 nói "one-click export of the selected profile" → phải chọn profile trước.
5. **[RESOLVED — user decision mới] Telegram có vào profile không?** — KHÔNG. Loại hoàn toàn: không schema/export/form/import/checklist; cấu hình Telegram chỉ trên máy owner. Thay thế đề xuất cũ "giữ config, botToken blank".
6. **[RESOLVED] Ghost Dev config có vào profile không?** — CÓ: `ghostDevConfig` (localStorage `planner:ghost_dev_config`) được export và import lại bằng `localStorage.setItem` có guard; `claudePath` flag machine-specific. Rationale: đây là cấu hình tool global (quyết định 5), và là một trong bốn backend mà blocker yêu cầu phủ.

## Sources

### Primary (HIGH confidence — đọc trực tiếp source trong worktree session này)
- `src/services/backup/exportBackup.ts:12-63,186-374,381-391` — denylist, isSafeBackupSetting, export envelope, triggerDownload
- `src/validation/backupSchemas.ts:194-218,396-399,887-891` — forbidden keys, setting schema, schema version
- `src/services/backup/restoreBackup.ts:255-375` — merge key-by-key, snapshot
- `src/services/backup/validateBackup.ts:77,570-585` — validator, ai_teams_docs_root guard
- `src/views/SettingsView.tsx:50-330` — 6 tab, data/ai/ssh cards
- `tests/views/SettingsView.test.tsx:229-319` — tab order lock
- `src/types/aiOffice.ts:88-132` — AiTeam template fields
- `src/types/navigation.ts:1-16`, `src/hooks/useHashRoute.ts:11-25`, `src/App.tsx:112-118`, `src/workbench/EditorArea.tsx:578-579`
- `src/utils/fileExport.ts:668-714`, `src-tauri/src/jira_proxy.rs:156-195` — file dialogs
- `src/components/settings/ImportPreviewModal.tsx`, `BackupImportCard.tsx` — UX patterns
- `src/services/sshService.ts:1-100`, `src/types/oracleSqlcl.ts:1-40`, `src/services/knowledge/knowledgeConfig.tsx:11-13`
- `src/types/notifications.ts`, `src/services/system/systemTypeSettings.ts`, `src/services/agents/ghostDevConfig.ts`, `src/services/ai/nineRouterTokenService.ts`, `src/services/ai/budgetWarnSettings.ts`
- `vite.config.ts:65-75`, `package.json` scripts

### Secondary (MEDIUM — suy luận kiến trúc từ source)
- Architectural Responsibility Map, Implications, Risks, Assumptions Log

### Tertiary (LOW — không có)
- Không dùng nguồn web bên ngoài; research này là codebase-only.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — không có package mới; mọi API đã đọc source.
- Architecture: MEDIUM — đề xuất module/route/store là thiết kế của researcher, cần planner/user chốt (A1/A4).
- Pitfalls: HIGH — trích trực tiếp guardrail của backup/restore.

**Research date:** 2026-11-19
**Valid until:** 30 ngày (codebase ổn định; nhưng Phase 45 đang chạy ở worktree khác có thể đổi settings keys — re-check trước khi execute nếu phase 45 merge vào).

## RESEARCH COMPLETE
