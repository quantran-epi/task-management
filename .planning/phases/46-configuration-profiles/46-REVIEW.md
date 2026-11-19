---
phase: 46-configuration-profiles
reviewed: 2026-11-19T10:14:57Z
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
  warning: 0
  info: 0
  total: 0
  necessity: 0
status: clean
---

# Phase 46: Code Review Report

**Reviewed:** 2026-11-19T10:14:57Z
**Depth:** standard
**Files Reviewed:** 32
**Status:** clean

## Summary

Re-review vòng cuối sau 6 commit fix vòng 2 (`405b52af`, `df923b52`, `a7b4cd35`, `9bcccbf9`, `4948f499`, `ae167ee3`). Phạm vi 32 file source/test được xác định từ `git diff 4bbca8d5^..HEAD` (khớp đúng `files_reviewed_list`), khớp với phạm vi review các vòng trước. Mọi kết luận dưới đây đều dựa trên **source hiện tại**, không dựa vào tuyên bố trong `46-REVIEW-FIX.md`.

**Xác minh 6 finding vòng 2 — tất cả đã FIXED trong source hiện tại:**

- **WR-01** (`ai_team_defaults` write-only): `src/services/configProfiles/importProfile.ts` không còn export constant hay lệnh `incoming.push` ghi khóa này; `catalog.ts:49` không còn entry; `PostProfileImportChecklist.tsx:84-87` ghi rõ template "chỉ để tham khảo: KHÔNG được áp dụng tự động, không ghi vào cài đặt và không đổi team hiện hữu". Grep `ai_team_defaults` trên `src/` chỉ còn 1 comment giải thích; test `importProfile.test.ts:106-124` và `ConfigProfilesView.test.tsx:154` assert `db.settings.get('ai_team_defaults')` là `undefined`. ✓
- **WR-02** (âm thầm đổi ngày sai): `normaliseDraft` (`ConfigProfilesView.tsx:146-210`) không còn nhánh fallback ngày; `capacityOverrides` chỉ clamp `workMinutes`, giữ nguyên `date`. Schema `configProfileSchemas.ts:20-36` thêm `isRealCalendarDate` refine. Nút "Thêm ngoại lệ" (`:574`) khởi tạo ngày hôm nay. Test `ConfigProfilesView.test.tsx:161-184` gõ `2026-13-99`, assert save bị từ chối, input giữ nguyên, override `recipient-today` (480 phút) không đổi. ✓
- **IN-01** (`rejectedSecretKeys` nhánh chết): grep `rejectedSecretKeys` trên `src/` + `tests/` trả về **không có kết quả**; `ApplyProfileResult` (`:29-34`) chỉ còn `skippedBlankSecrets`. ✓
- **IN-02** (`defaults.ts` MCP nội bộ): `defaults.ts:34` là `mcp_servers: ''`, không còn import `DEFAULT_MCP_SERVERS`; test purity `configProfileSchemas.test.ts:167-168,182` assert `=== ''`, JSON không chứa `mcpServers`, envelope dựng trực tiếp pass `safeParse`. ✓
- **IN-03** (hardcode marker/version): `envelopeForDraft` (`ConfigProfilesView.tsx:212-219`) dùng `CONFIG_PROFILE_APP_MARKER` / `CONFIG_PROFILE_SCHEMA_VERSION` import từ schema (`:28-32`), cùng nguồn với `exportProfile.ts`. ✓
- **IN-04** (machine field helper): `catalog.ts:116-128` định nghĩa `getDeclaredProfileMachineFields`, được dùng ở `ImportProfilePreviewModal.tsx:101-110` và `PostProfileImportChecklist.tsx:52-54`, kèm note tại `:247` / `:90`. ✓

**Xác minh lại 9 finding vòng 1 — vẫn giữ nguyên trạng thái FIXED:**

- **CR-01 / WR-02 (snapshot):** `importProfile.ts:88-97` không ghi `last_pre_import_snapshot`; comment giải thích rõ; test seed snapshot hợp lệ và assert nguyên vẹn. ✓
- **CR-02 (entry point):** `TitleBar.tsx:307-319` button "Profiles" → `onOpenView('config-profiles')`; `SettingsView.tsx:189-197` button "Soạn & xuất Profile" → `onNavigate('config-profiles')`; `WorkbenchLayout.tsx:169,272` title map; `EditorArea.tsx:581-582` render `ConfigProfilesView`; `App.tsx:120` route. Test `ConfigProfilesEntryPoint.test.tsx` xác nhận, 6-tab contract giữ nguyên. ✓
- **WR-01 (secret overwrite):** schema refine `configProfileSchemas.ts:72-81` chặn secret-like key có value ≠ `''`; `importProfile.ts:36-39,69-77` bỏ qua mọi secret-like key. ✓
- **WR-03 (teamDefaults):** giờ reference-only (xem WR-01 vòng 2). ✓
- **WR-04 (clamping):** `normaliseDraft` clamp mọi numeric field; `handleSave:300-308` validate envelope trước khi ghi. ✓
- **WR-05 (FileReader onerror):** `ConfigProfileImportCard.tsx:54-62` có `reader.onerror` reset state + notification. ✓
- **IN-01 (declared secrets):** `getDeclaredProfileSecretFields` được dùng ở preview/checklist. ✓
- **IN-02 (tooltip focusable):** `ConfigProfilesView.tsx:364-374` warning icon có `tabIndex={0}`, `role="img"`, `aria-label` tiếng Việt. ✓

**Điều tra flake `tests/views/SettingsView.test.tsx` (test "coordinates remote pull into ImportPreviewModal…"):**

Không phải regression của phase 46. Bằng chứng: (1) file test lần cuối đổi ở `89caa88b` (chính là commit "stabilize focused gate under full-phase load" — đã thêm `afterEach(cleanup)` tại dòng 62-64 và tên DB ngẫu nhiên tại dòng 41 để chống flake); (2) `git diff 5df8f63e^ 5df8f63e -- src/views/SettingsView.tsx` cho thấy thay đổi duy nhất là **+10 dòng** (import `EditOutlined` + một button `aria-label="Soạn & xuất Profile"` trong data tab), không đụng luồng GitHub sync/auth/restore mà test này dùng, và không trùng selector nào của test (test query "Tải từ GitHub", "Xem trước & Xác nhận Khôi phục", "Xác nhận từ khóa RESTORE", …). (3) Test này thực chất dùng **backup-restore** `ImportPreviewModal` (từ khóa RESTORE), không phải `ImportProfilePreviewModal` của config profile. (4) Chạy `npx vitest run tests/views/SettingsView.test.tsx --bail=1` **hai lần liên tiếp đều xanh 9/9** (56.12s và 42.06s). Kết luận: flake timing có từ trước, không có file:line nào của phase 46 gây ra → không xếp thành finding.

**Kiểm chứng bổ sung:** `npx tsc --noEmit -p tsconfig.json` exit 0; focused gate 9 file / 39 test passed. Không chạy full suite theo rule của dự án.

**Đánh giá necessity (standard depth):** Đã đối chiếu rubric `necessity-review.md`. Không có guard nào thỏa mãn định nghĩa impossible-state / already-defended-elsewhere / cargo-cult / phantom / generality-without-instantiation trong phạm vi review. Các guard tồn tại (`typeof window !== 'undefined'` và try/catch quanh `setGhostDevConfig` trong `applyConfigProfile:134-140`, `if (!db) return null` trong `ConfigProfileImportCard:37`) đều là trust boundary thực (localStorage có thể vắng mặt trong jsdom/Node; prop `db` là optional) nên không phải necessity finding. `necessity: 0`.

## Narrative Findings (AI reviewer)

Không có finding mới. Tất cả 15 finding từ các vòng trước (9 vòng 1 + 6 vòng 2) đã được đối chiếu trực tiếp với source hiện tại và xác nhận đã sửa; không phát hiện issue mới do các fix vòng 2 đưa vào.

## Structural Findings (fallow)

Không có `<structural_findings>` được cung cấp cho lượt review này.

---

_Reviewed: 2026-11-19T10:14:57Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
