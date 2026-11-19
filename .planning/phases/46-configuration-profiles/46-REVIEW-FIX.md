---
phase: 46-configuration-profiles
review: 46-REVIEW.md
status: all_findings_fixed
findings_fixed: 9
critical: 2
warning: 5
info: 2
commits:
  - af8fe9ad
  - 5df8f63e
  - e7603859
  - dae56ebf
  - 9c91fa58
verified: 2026-11-19
---

# Phase 46: Review Fix Report

**Trạng thái:** Tất cả 9 finding trong `46-REVIEW.md` đã được sửa (CR-01, CR-02, WR-01..WR-05, IN-01, IN-02). Không finding nào bị bỏ qua hoặc defer.

**Verification chung:**
- `npx tsc --noEmit -p tsconfig.json` — clean (exit 0).
- Focused gate: `npx vitest run tests/services/configProfiles/importProfile.test.ts tests/services/configProfiles/profileRoundTrip.test.ts tests/services/configProfiles/exportProfile.test.ts tests/validation/configProfileSchemas.test.ts tests/views/ConfigProfilesView.test.tsx tests/workbench/ConfigProfilesEntryPoint.test.tsx tests/components/settings/ConfigProfileImportCard.test.tsx tests/components/settings/ImportProfilePreviewModal.test.tsx tests/components/settings/PostProfileImportChecklist.test.tsx --bail=1` — **9 files / 37 tests passed**.
- Non-regression: `npx vitest run tests/views/SettingsView.test.tsx --bail=1` — **1 file / 9 tests passed** (6-tab contract intact).
- Không chạy full suite theo project rule (memory: full Vitest > 1 tiếng).

---

## CR-01 — Profile import ghi snapshot sai định dạng, phá hỏng rollback

**Trạng thái: FIXED**

**Thay đổi cụ thể:**
- `src/services/configProfiles/importProfile.ts`: xóa hoàn toàn lệnh `db.settings.put({ key: 'last_pre_import_snapshot', value: snapshot })` cùng toàn bộ bước dựng snapshot không tương thích (`settings`/`capacityRules`/`capacityOverrides`). Profile import là key-by-key merge nên không cần global rollback point; snapshot hợp lệ của backup import vì thế không bị ghi đè.
- `tests/services/configProfiles/importProfile.test.ts`: test mới seed sẵn một `SnapshotData` hợp lệ (`tables`/`counts`) vào `last_pre_import_snapshot`, import profile, rồi assert snapshot đó còn nguyên vẹn byte-for-byte, không có khóa profile-snapshot nào được tạo.
- `tests/services/configProfiles/profileRoundTrip.test.ts`: tracer cập nhật từ `toBeDefined()` sang assert snapshot dùng chung **không** tồn tại sau profile import.

**Test evidence:**
- Commit: `af8fe9ad` (source + test), `9c91fa58` (tracer alignment).
- `npx vitest run tests/services/configProfiles/importProfile.test.ts tests/services/configProfiles/profileRoundTrip.test.ts --bail=1` — 2 files / 9 tests passed.

## CR-02 — Route `config-profiles` không có điểm vào UI

**Trạng thái: FIXED**

**Thay đổi cụ thể:**
- `src/workbench/TitleBar.tsx`: thêm quick-view button “Profiles” (`aria-label="Open Config Profiles"`) gọi `onOpenView?.('config-profiles')` — đây là shell mặc định của Tauri IntelliJ.
- `src/views/SettingsView.tsx`: thêm button “Soạn & xuất Profile” trong data tab gọi `onNavigate('config-profiles')`; **không** thêm tab thứ 7.
- `src/workbench/WorkbenchLayout.tsx`: bổ sung title map `config-profiles` cho notification deeplink (`handleOpenView` đã có map từ phase trước).
- `tests/workbench/ConfigProfilesEntryPoint.test.tsx` (mới): assert TitleBar gọi `onOpenView('config-profiles')`, Settings data tab gọi `onNavigate('config-profiles')` và vẫn đúng 6 tab.

**Test evidence:**
- Commit: `5df8f63e`.
- `npx vitest run tests/workbench/ConfigProfilesEntryPoint.test.tsx --bail=1` — 1 file / 2 tests passed.
- `npx vitest run tests/views/SettingsView.test.tsx --bail=1` — 1 file / 9 tests passed (6-tab lock).

## WR-01 — Secret không rỗng trong `settings` có thể ghi đè secret thật

**Trạng thái: FIXED**

**Thay đổi cụ thể:**
- `src/services/configProfiles/importProfile.ts`: `isBlankSecretKey` giờ nhận diện mọi secret-like key qua `!isSafeBackupSetting(key) || getSecretFields().includes(key)`; vòng lặp import bỏ qua **mọi** secret-like key bất kể giá trị, track blank vào `skippedBlankSecrets` (được UI dùng để nhắc nhập lại). Key secret-like có giá trị khác `''` bị schema refinement chặn ở trust boundary trước khi tới vòng lặp; không có secret nào từ profile được `db.settings.put`. (Đính chính vòng 2: không có trường `rejectedSecretKeys` và không có cảnh báo UI tương ứng.)
- `src/validation/configProfileSchemas.ts`: `.refine` trên `ProfileConfigSchema` từ chối secret-like key có giá trị khác `''` trong `config.settings` với message rõ ràng; field `secretFields` (luôn `''`) vẫn hợp lệ. Blank `*_token` vẫn được chấp nhận.
- `tests/services/configProfiles/importProfile.test.ts`: payload có `github_pat: 'attacker-supplied-secret'` bị schema chặn với 0 write, secret thật của recipient còn nguyên.
- `tests/validation/configProfileSchemas.test.ts`: test mới assert `github_pat: 'attacker'` bị reject kèm message chứa “secret”.

**Test evidence:**
- Commit: `af8fe9ad`.
- `npx vitest run tests/services/configProfiles/importProfile.test.ts tests/validation/configProfileSchemas.test.ts --bail=1` — 2 files / 17 tests passed.

## WR-02 — Snapshot profile import lưu secret plaintext

**Trạng thái: FIXED**

**Thay đổi cụ thể:**
- Cùng fix với CR-01: xóa hoàn toàn việc tạo/lưu snapshot của profile (không còn `settingsBefore = db.settings.toArray()` chứa secret plaintext). Không tồn tại snapshot profile-specific nên không cần lọc `isSafeBackupSetting` ở bước này.
- `tests/services/configProfiles/importProfile.test.ts`: assert mọi setting row **mới** được ghi bởi import (`appliedSettingKeys`) đều không chứa secret thật của recipient; snapshot backup cũ giữ nguyên.

**Test evidence:**
- Commit: `af8fe9ad`.
- `npx vitest run tests/services/configProfiles/importProfile.test.ts --bail=1` — 1 file / 7 tests passed.

## WR-03 — `teamDefaults` bị bỏ qua khi import

**Trạng thái: FIXED**

**Thay đổi cụ thể:**
- `src/services/configProfiles/importProfile.ts`: export `AI_TEAM_DEFAULTS_SETTING_KEY = 'ai_team_defaults'`; `applyConfigProfile` ghi toàn bộ `config.teamDefaults` vào khóa này trong cùng transaction, coi như template cho team mới (không đụng `db.aiTeams` hiện hữu). `appliedSettingKeys` phản ánh khóa này.
- `src/services/configProfiles/catalog.ts`: thêm `ai_team_defaults: 'portable'` để đưa vào inventory.
- `src/components/settings/PostProfileImportChecklist.tsx`: ghi chú rõ template AI-team được lưu nhưng team hiện hữu không tự động đổi — cần chỉnh thủ công khi tạo team mới (không silent drop).
- `tests/services/configProfiles/importProfile.test.ts`: test round-trip assert tất cả 8 field (`budgetTokens`, `concurrencyLimit`, `autoSplitEnabled`, `autoApproveMutations`, `mcpEnabled`, `sshFsToolsEnabled`, `oracleToolsEnabled`, `budgetWarnThresholdPct`) land trong `db.settings`.

**Test evidence:**
- Commit: `af8fe9ad` (service/test), `dae56ebf` (checklist note).
- `npx vitest run tests/services/configProfiles/importProfile.test.ts tests/components/settings/PostProfileImportChecklist.test.tsx --bail=1` — 2 files / 9 tests passed.

## WR-04 — Authoring UI tạo profile vi phạm chính schema import

**Trạng thái: FIXED**

**Thay đổi cụ thể:**
- `src/views/ConfigProfilesView.tsx`: thêm `normaliseDraft` clamp mọi giá trị số theo schema: `concurrencyCap` 1..12 (blank→6), `workMinutes` của rule/override 0..1440, `teamDefaults.concurrencyLimit` ≥1 (≤12), `budgetTokens` ≥0, `ai_budget_warn_threshold_pct` và team threshold 1..100; numeric setting trống → default hợp lệ. Ngoại lệ công suất mới khởi tạo với ngày hôm nay (`YYYY-MM-DD`) thay vì `''`. Secret-like keys trong draft settings bị loại (thuộc `secretFields`).
- Trước `handleSave`, validate toàn bộ envelope bằng `ConfigProfileEnvelopeSchema.safeParse`; nếu invalid, không ghi db mà hiển thị inline `Alert` “Profile chưa hợp lệ” với chi tiết issue. Export dùng lại profile đã lưu (đã normalized) nên cũng luôn schema-valid.
- `tests/views/ConfigProfilesView.test.tsx`: test mới tạo draft với ngày trống, concurrency cap 0, workMinutes 2000, team concurrency 0 → saved profile pass `ConfigProfileEnvelopeSchema.safeParse` và `applyConfigProfile` thành công (date khớp regex, cap=1, workMinutes=1440, team limit=1).
- `src/views/ConfigProfilesView.tsx`: (IN-02, xem below) tooltip icon focusable.

**Test evidence:**
- Commit: `e7603859`.
- `npx vitest run tests/views/ConfigProfilesView.test.tsx --bail=1` — 1 file / 8 tests passed.

## WR-05 — `FileReader` import card thiếu `onerror`

**Trạng thái: FIXED**

**Thay đổi cụ thể:**
- `src/components/settings/ConfigProfileImportCard.tsx`: thêm `reader.onerror` gọi `notification.error({ message: 'Không đọc được tệp', description: 'Không thể đọc nội dung tệp cấu hình. Vui lòng thử lại.' })`, reset `fileName`, `parsedPayload` và đóng modal state (`modalOpen=false`) — người dùng không còn rơi vào trạng thái “bấm mà không có phản hồi”.
- `tests/components/settings/ConfigProfileImportCard.test.tsx` (mới): capture `beforeUpload` dari Dragger, stub `FileReader` để gọi `onerror`, assert notification Vietnamese được fire.

**Test evidence:**
- Commit: `dae56ebf`.
- `npx vitest run tests/components/settings/ConfigProfileImportCard.test.tsx --bail=1` — 1 file / 1 test passed.

## IN-01 — Checklist/preview liệt kê toàn bộ secret catalog

**Trạng thái: FIXED**

**Thay đổi cụ thể:**
- `src/services/configProfiles/catalog.ts`: thêm `getDeclaredProfileSecretFields(declared)` — giao `Object.keys(secretFields)` của profile với catalog secrets (chặn key lạ từ file untrusted).
- `src/components/settings/ImportProfilePreviewModal.tsx` và `src/components/settings/PostProfileImportChecklist.tsx`: thay `getSecretFields()` bằng helper mới; checklist cũng gộp `blankSecretFields` từ apply result. Thêm ghi chú: chỉ liệt kê secret profile khai báo, các secret catalog khác vẫn cần kiểm tra nếu dùng dịch vụ tương ứng.
- `tests/components/settings/ImportProfilePreviewModal.test.tsx` và `tests/components/settings/PostProfileImportChecklist.test.tsx`: assert mọi secret **được khai báo** xuất hiện và ít nhất một secret catalog **không khai báo** không xuất hiện.

**Test evidence:**
- Commit: `dae56ebf`.
- `npx vitest run tests/components/settings/ImportProfilePreviewModal.test.tsx tests/components/settings/PostProfileImportChecklist.test.tsx --bail=1` — 2 files / 5 tests passed.

## IN-02 — Tooltip cảnh báo machine-specific không focus được

**Trạng thái: FIXED**

**Thay đổi cụ thể:**
- `src/views/ConfigProfilesView.tsx`: `machineWarning` render `WarningOutlined` với `tabIndex={0}`, `role="img"` và `aria-label` tiếng Việt mô tả rõ field nào được giữ lại và cần rà soát sau import ( applicability cho mọi field, kể cả `ghostDevConfig.claudePath`).
- `tests/views/ConfigProfilesView.test.tsx`: test mới query `[data-machine-specific][role="img"]`, assert `tabindex="0"` và aria-label chứa “cảnh báo”.

**Test evidence:**
- Commit: `e7603859`.
- `npx vitest run tests/views/ConfigProfilesView.test.tsx --bail=1` — 1 file / 8 tests passed.

---

## Commit summary

| Commit | Scope |
|--------|-------|
| `af8fe9ad` | CR-01, WR-01, WR-02, WR-03 (import/schema/catalog + tests) |
| `5df8f63e` | CR-02 (TitleBar, Settings, WorkbenchLayout + entry-point tests) |
| `e7603859` | WR-04, IN-02 (authoring clamp/validation + a11y + tests) |
| `dae56ebf` | WR-05, IN-01 (import card onerror + declared-secret lists + tests) |
| `9c91fa58` | Align round-trip tracer with snapshot-free import |

**Không thay đổi:** `.planning/STATE.md`, `ROADMAP.md`, requirements, plan files, `.gsd/dispatch-isolation-sentinel.json` (pre-existing modification từ harness, không stage). Không push. Không đánh dấu phase complete.
