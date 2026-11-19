---
phase: 46-configuration-profiles
reviewed: 2026-11-19T09:18:24Z
depth: standard
files_reviewed: 32
files_reviewed_list:
  - src/App.tsx
  - src/components/settings/ConfigProfileExportButton.tsx
  - src/components/settings/ConfigProfileImportCard.tsx
  - src/components/settings/ImportProfilePreviewModal.tsx
  - src/components/settings/PostProfileImportChecklist.tsx
  - src/hooks/useHashRoute.ts
  - src/services/backup/exportBackup.ts
  - src/services/configProfiles/catalog.ts
  - src/services/configProfiles/defaults.ts
  - src/services/configProfiles/exportProfile.ts
  - src/services/configProfiles/importProfile.ts
  - src/services/configProfiles/types.ts
  - src/types/navigation.ts
  - src/validation/configProfileSchemas.ts
  - src/views/ConfigProfilesView.tsx
  - src/views/SettingsView.tsx
  - src/workbench/EditorArea.tsx
  - src/workbench/WorkbenchLayout.tsx
  - src/workbench/store/layoutStore.ts
  - tests/components/settings/ConfigProfileExportButton.test.tsx
  - tests/components/settings/ImportProfilePreviewModal.test.tsx
  - tests/components/settings/PostProfileImportChecklist.test.tsx
  - tests/services/configProfiles/exportProfile.test.ts
  - tests/services/configProfiles/importProfile.test.ts
  - tests/services/configProfiles/profileRoundTrip.test.ts
  - tests/validation/configProfileSchemas.test.ts
  - tests/views/ConfigProfilesView.test.tsx
  - tests/views/SettingsView.test.tsx
  - tests/workbench/ConfigProfilesEntryPoint.test.tsx
  - tests/components/settings/ConfigProfileImportCard.test.tsx
  - src/workbench/TitleBar.tsx
  - src/components/shell/Navigation.tsx
findings:
  critical: 0
  warning: 2
  info: 4
  total: 6
  necessity: 0
status: issues_found
---

# Phase 46: Code Review Report

**Reviewed:** 2026-11-19T09:18:24Z
**Depth:** standard
**Files Reviewed:** 32
**Status:** issues_found

## Summary

Re-review sau 9 finding của `46-REVIEW.md`, phạm vi 28 file gốc + 4 file mới (`ConfigProfilesEntryPoint.test.tsx`, `ConfigProfileImportCard.test.tsx`, `TitleBar.tsx`, `Navigation.tsx`). Mọi finding cũ đều đã được đối chiếu trực tiếp với source hiện tại, không chỉ dựa vào `46-REVIEW-FIX.md`.

**Xác minh 9 finding cũ — tất cả đã FIXED (không tái phạm):**

- **CR-01** (`importProfile.ts:101-143`): không còn lệnh ghi `last_pre_import_snapshot`; comment tại `:107-109` ghi rõ. Test `importProfile.test.ts:63-89` seed `SnapshotData` hợp lệ và assert byte-for-byte unchanged; `profileRoundTrip.test.ts:95-96` assert cả hai khóa snapshot đều `undefined`. Không còn snapshot profile-specific nào được tạo → CR-01 **và** WR-02 (secret plaintext trong snapshot) cùng được triệt tiêu. ✓
- **CR-02** (`TitleBar.tsx:302-321`, `SettingsView.tsx:189-197`, `WorkbenchLayout.tsx:260-282,272`, `EditorArea.tsx:581-582`): có button "Profiles" gọi `onOpenView('config-profiles')` trong shell IntelliJ mặc định, và button "Soạn & xuất Profile" trong data tab của classic shell. `handleOpenView` mở tab, `EditorArea` render `ConfigProfilesView`. Test entry-point xác nhận; 6-tab contract vẫn giữ (`SettingsView.tsx:145-307`). ✓
- **WR-01** (`configProfileSchemas.ts:57-71`, `importProfile.ts:43-46,78-86`): refine schema reject secret-like key có value ≠ `''`; loop import skip mọi secret-like key. Secret thật của recipient không bị ghi đè (test `importProfile.test.ts:91-107`). ✓
- **WR-03** (`importProfile.ts:18,94-99`, `catalog.ts:50`, checklist `:81-85`): `teamDefaults` được ghi vào `ai_team_defaults` trong cùng transaction; test round-trip 8 field pass. (Xem WR-01 mới bên dưới — giá trị được ghi nhưng không có consumer.) ✓
- **WR-04** (`ConfigProfilesView.tsx:131-210,291-332`): `normaliseDraft` clamp mọi numeric field; `handleSave` validate envelope trước khi ghi db; test `ConfigProfilesView.test.tsx:108-151` pass. ✓
- **WR-05** (`ConfigProfileImportCard.tsx:53-62`): có `reader.onerror` reset state + notification; test chuyên biệt pass. ✓
- **IN-01** (`catalog.ts:99-102`, preview `:91-99`, checklist `:43-50`): dùng `getDeclaredProfileSecretFields` (giao với catalog) thay vì full catalog cho secrets. ✓
- **IN-02** (`ConfigProfilesView.tsx:364-374`): warning icon có `tabIndex={0}`, `role="img"`, `aria-label` tiếng Việt. ✓

Không tìm thấy secret leak mới, snapshot incompatibility, hay entry-point hỏng. Tuy nhiên, chính các fix đã đưa vào 2 vấn đề mới (WR) và 4 vấn đề chất lượng (IN) — chi tiết bên dưới.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: `ai_team_defaults` là setting write-only — fix WR-03 không có consumer runtime

**File:** `src/services/configProfiles/importProfile.ts:18,94-99`; `src/services/configProfiles/catalog.ts:50`; `src/components/settings/PostProfileImportChecklist.tsx:81-85`

**Issue:** Fix WR-03 ghi `config.teamDefaults` vào khóa `ai_team_defaults` nhưng **không có bất kỳ đoạn code nào trong `src/` đọc lại khóa này**. Grep toàn repo cho literal `ai_team_defaults` và `AI_TEAM_DEFAULTS_SETTING_KEY` chỉ trả về: định nghĩa constant (`importProfile.ts:18`), chính lệnh ghi (`:98`), phân loại catalog (`catalog.ts:50`) và chuỗi hướng dẫn trong checklist (`PostProfileImportChecklist.tsx:83`). Không có `db.settings.get('ai_team_defaults')` ở bất cứ đâu, kể cả luồng tạo team (`teamRunCoordinator.ts`, `TeamEditorDrawer.tsx`, `TeamSettingsDrawer.tsx`). Checklist nói "hãy chỉnh thủ công khi tạo team mới", nhưng giá trị nằm trong một setting row vô hình, không có UI nào hiển thị để người dùng "chỉnh thủ công". Kết quả: fix WR-03 chỉ chuyển từ *silent drop* sang *silent write* — kỳ vọng của người dùng rằng profile mang defaults cho team vẫn không được đáp ứng, và giờ còn có dữ liệu chết tích lũy trong db.

**Fix:** Chọn một trong hai hướng và làm triệt để:
- Nếu `ai_team_defaults` là template thật: đọc khóa này trong luồng tạo team (`TeamEditorDrawer` / `TeamSettingsDrawer` / service tạo team) để seed các field `budgetTokens`, `concurrencyLimit`, `autoSplitEnabled`, …; thêm test assert team mới nhận giá trị sau import.
- Nếu chỉ là tài liệu tham khảo: bỏ hẳn lệnh `incoming.push` ở `importProfile.ts:98` (quay về document-only), và trong checklist ghi rõ "section này KHÔNG được áp dụng, chỉ để tham khảo" thay vì hướng dẫn "chỉnh thủ công khi tạo team mới" — đồng thời bỏ khóa khỏi `PROFILE_KEY_CATALOG`.

### WR-02: `normaliseDraft` âm thầm thay ngày ngoại lệ không hợp lệ bằng ngày hôm nay — nguy cơ ghi đè override

**File:** `src/views/ConfigProfilesView.tsx:200-206` (cụ thể `:202-204`)

**Issue:** Fix WR-04 thay `date: ''` bằng `new Date().toISOString().slice(0, 10)`, nhưng áp dụng cho **mọi** date không khớp `DATE_PATTERN`, không chỉ ngày rỗng từ nút "Thêm ngoại lệ" (`:567-580`). Người dùng gõ nhầm `2026-13-99` hoặc `2026-1-5` → profile lưu với ngày hôm nay, không có thông báo nào. Khi người nhận import, `applyConfigProfile` upsert theo natural key `date` (`importProfile.ts:124-142`) → `workMinutes` của **ngày hôm nay** bị ghi đè bằng giá trị của ngoại lệ gõ nhầm. Đây là silent data corruption, đúng hành vi mà phase muốn tránh. Test WR-04 (`ConfigProfilesView.test.tsx:108-151`) chỉ cover ngày rỗng nên không phát hiện nhánh này.

**Fix:** Phân biệt hai trường hợp — chỉ tự động điền ngày hôm nay cho bản ghi mới do nút "Thêm ngoại lệ" tạo (gán ngày hợp lệ ngay tại `:574`); với date do người dùng gõ mà không khớp pattern, giữ nguyên và để `ConfigProfileEnvelopeSchema.safeParse` ở `handleSave` (`:300-308`) chặn lại, hiển thị inline `Alert` "Profile chưa hợp lệ" kèm path `capacityOverrides.N.date`:

```ts
// normaliseDraft: bỏ fallback âm thầm
capacityOverrides: config.capacityOverrides.map((override) => ({
  ...override,
  workMinutes: clampInt(fieldValue(override.workMinutes), 0, 1440, 0),
})),
// tại nút "Thêm ngoại lệ" (:574):
{ date: new Date().toISOString().slice(0, 10), workMinutes: 0, note: '' },
```

Thêm test: gõ date sai format → `handleSave` không ghi db và hiển thị `draftError`, ngày hôm nay của recipient không đổi sau import.

## Info

### IN-01: `rejectedSecretKeys` là nhánh chết — không thể nonzero, và fix report khẳng nhận sai về UI warning

**File:** `src/services/configProfiles/importProfile.ts:39-40,78-86,160`; `src/validation/configProfileSchemas.ts:57-71`

**Issue:** `ApplyProfileResult.rejectedSecretKeys` được định nghĩa, push tại `:81` và return tại `:160`, nhưng **không có caller nào đọc** (grep toàn repo chỉ thấy trong chính file này; `ImportProfilePreviewModal.tsx:143` và `SettingsView.tsx:205` chỉ dùng `skippedBlankSecrets`). Quan trọng hơn: nhánh `else rejectedSecretKeys.push(key)` là **không bao giờ chạy**. Predicate `isBlankSecretKey` (`importProfile.ts:44-46`) và `isSecretLikeSettingKey` (`configProfileSchemas.ts:69-71`) là cùng một biểu thức; refine schema ở `:57-66` đã từ chối mọi payload có secret-like key mang value ≠ `''` trước khi `applyConfigProfile` tới vòng lặp (early return ở `:60-68`). Với payload hợp lệ, mọi secret-like key đều có value `''` → chỉ đi vào `skippedBlankSecrets`. `46-REVIEW-FIX.md:63` viết "trả về trong ApplyProfileResult để UI cảnh báo" — cảnh báo đó không tồn tại. Không có rủi ro bảo mật thực tế (schema chặn và modal hiện lỗi), nhưng API surface và ghi chú fix gây hiểu lầm.

**Fix:** Xóa field `rejectedSecretKeys`, nhánh `else` tại `:81` và các khởi tạo liên quan (`:66,77,160`); hoặc nếu muốn giữ làm defense-in-depth, gọi `announceToScreenReader` / `notification.warning` với nội dung tiếng Việt tại `ImportProfilePreviewModal.handleApply` khi mảng này nonzero, và sửa fix report cho đúng. Thêm test assert payload secret non-blank bị chặn ở schema (đã có) thay vì kỳ vọng `rejectedSecretKeys`.

### IN-02: `defaults.ts` gán `mcp_servers` vào settings nhưng `normaliseDraft` luôn xóa — giá trị chết, có chứa dữ liệu nội bộ

**File:** `src/services/configProfiles/defaults.ts:35`; `src/views/ConfigProfilesView.tsx:146-148`; `src/services/configProfiles/catalog.ts:67`

**Issue:** `buildDefaultProfileConfig()` gán `mcp_servers: DEFAULT_MCP_SERVERS` vào `settings`. `mcp_servers` được catalog phân loại `secret-blank` (`catalog.ts:67`), và `normaliseDraft` xóa **mọi** secret-like key khỏi settings trước khi lưu (`ConfigProfilesView.tsx:146-148`). Vì `handleSave` luôn gọi `normaliseDraft` (`:299`), giá trị này không bao giờ lọt vào profile đã lưu hay file export — nên **không có secret leak thực tế**, nhưng dòng `defaults.ts:35` là code chết và gây hiểu lầm. `DEFAULT_MCP_SERVERS` thực tế chứa URL nội bộ và instruction dài; nếu sau này có path export bỏ qua `normaliseDraft`, đây sẽ là kênh rò rỉ. Test purity (`configProfileSchemas.test.ts:133-147`) không kiểm tra điều này.

**Fix:** Trong `buildDefaultProfileConfig`, thay `mcp_servers: DEFAULT_MCP_SERVERS` bằng `''` (hoặc bỏ hẳn key, vì `secretFields` đã có `mcp_servers: ''`), và bỏ import `DEFAULT_MCP_SERVERS` ở `defaults.ts:7` nếu không còn dùng. Thêm assert default config pass `ConfigProfileEnvelopeSchema.safeParse` **trực tiếp** (không qua `normaliseDraft`) vào test purity.

### IN-03: `envelopeForDraft` hardcode marker/version thay vì dùng constant

**File:** `src/views/ConfigProfilesView.tsx:212-219`; `src/validation/configProfileSchemas.ts:12-13`

**Issue:** `envelopeForDraft` ghi cứng `'taskmate-config-profile'` và `1`, trong khi `exportProfile.ts:3-5` và schema dùng `CONFIG_PROFILE_APP_MARKER` / `CONFIG_PROFILE_SCHEMA_VERSION`. Hiện tại cùng giá trị nên validation ở `handleSave` pass, nhưng khi bump schema version, draft vẫn tự validate ở v1 rồi export ở v2 → profile tự soạn có thể không tự import được — đúng lớp lỗi mà WR-04 đang muốn phòng tránh.

**Fix:** Import và dùng constant:

```ts
import { ConfigProfileEnvelopeSchema, CONFIG_PROFILE_APP_MARKER, CONFIG_PROFILE_SCHEMA_VERSION } from '../validation/configProfileSchemas';
// trong envelopeForDraft:
app: CONFIG_PROFILE_APP_MARKER,
profileSchemaVersion: CONFIG_PROFILE_SCHEMA_VERSION,
```

### IN-04: Checklist/preview vẫn liệt kê toàn bộ machine-specific catalog, không phải field profile khai báo

**File:** `src/components/settings/ImportProfilePreviewModal.tsx:101-104`; `src/components/settings/PostProfileImportChecklist.tsx:52`

**Issue:** Fix IN-01 chỉ thu hẹp danh sách **secret** qua `getDeclaredProfileSecretFields`; danh sách machine-specific vẫn dùng `getMachineSpecificFields()` trả về toàn bộ catalog (~7 field + `ghostDevConfig.claudePath`) bất kể profile có chứa field đó hay không. Import profile chỉ có `github_owner` vẫn hiện `ninerouter_endpoint`, `image_endpoint`, `knowledge_server_base_url`, … cần rà soát — cùng dạng alert fatigue mà IN-01 đã sửa cho secret. Không có note giải thích "chỉ kiểm tra nếu dùng dịch vụ tương ứng" như phần secret (`:228-231`, `:70-73`).

**Fix:** Thêm helper `getDeclaredProfileMachineFields(config)` trong `catalog.ts` tương tự `getDeclaredProfileSecretFields`, intersect với: `Object.keys(config.settings)` + (`config.ghostDevConfig?.claudePath !== undefined` ? `['ghostDevConfig.claudePath']` : []). Dùng ở preview `:102` và checklist `:52`, kèm ghi chú "các field khác chỉ cần kiểm tra nếu bạn dùng dịch vụ tương ứng". Cập nhật test `ImportProfilePreviewModal.test.tsx:81-84` / `PostProfileImportChecklist.test.tsx:65-68` để assert field machine-specific không khai báo không xuất hiện.

---

_Reviewed: 2026-11-19T09:18:24Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
