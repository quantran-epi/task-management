---
phase: 46-configuration-profiles
reviewed: 2026-11-19T00:00:00Z
depth: standard
files_reviewed: 28
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
findings:
  critical: 2
  warning: 5
  info: 2
  total: 9
  necessity: 0
status: issues_found
---

# Phase 46: Code Review Report

**Reviewed:** 2026-11-19T00:00:00Z
**Depth:** standard
**Files Reviewed:** 28
**Status:** issues_found

## Summary

Đã review 28 file nguồn của phase configuration profiles ở độ sâu standard, bao gồm trace chéo sang `restoreBackup.ts`, `SnapshotRollbackCard.tsx`, `Navigation.tsx`, `TitleBar.tsx`, `SearchEverywhereModal.tsx`, `ghostDevConfig.ts`, `keyringService.ts` và `types/backup.ts`.

Telegram exclusion, six-tab Settings lock, secret-blank on export và purity của authoring screen nhìn chung được triển khai đúng và có test bao phủ. Tuy nhiên có 2 lỗi BLOCKER: (1) profile import ghi một snapshot **không tương thích** với cơ chế rollback dùng chung, làm hỏng hoàn toàn rollback/download snapshot và có thể xóa mất rollback point hợp lệ của backup import trước đó; (2) route `config-profiles` được đăng ký nhưng **không có bất kỳ điểm vào UI nào**, khiến toàn bộ màn hình authoring/export không thể truy cập trong runtime Tauri. Ngoài ra có các lỗi về secret trust boundary, snapshot chứa secret plaintext, teamDefaults bị bỏ qua khi import, authoring UI tạo dữ liệu vi phạm chính schema import của nó, và FileReader thiếu onerror.

## Critical Issues

### CR-01: Profile import ghi snapshot sai định dạng, phá hỏng rollback và gây mất rollback point

**File:** `src/services/configProfiles/importProfile.ts:67-72,96` (liên quan `src/services/backup/restoreBackup.ts:361-367`, `src/types/backup.ts:140-144`, `src/views/SettingsView.tsx:121-142`, `src/components/settings/SnapshotRollbackCard.tsx:21-27`)

**Issue:** `applyConfigProfile` ghi vào khóa dùng chung `last_pre_import_snapshot` một object có dạng `{ timestamp, settings, capacityRules, capacityOverrides }`. Nhưng mọi consumer của khóa này đều kỳ vọng `SnapshotData = { timestamp, tables, counts }`:

- `rollbackToSnapshot` (restoreBackup.ts:364-365): `const snapshot = snapshotSetting.value as SnapshotData; await replaceTables(targetDb, snapshot.tables, prepareAttachments(snapshot.tables.noteAttachments))`. Vì `snapshot.tables` là `undefined`, biểu thức `snapshot.tables.noteAttachments` ném `TypeError` ngay trước khi vào `replaceTables`.
- `downloadSnapshotFile` (restoreBackup.ts:373): `snapshot.tables.settings` — cùng lỗi `TypeError`.
- `SnapshotRollbackCard` (dùng `useLiveQuery`, luôn mount trong data tab) sẽ hiển thị nút "Hoàn tác" và "Tải snapshot" cho snapshot rỗng này; bấm vào chỉ báo lỗi.

Hậu quả nghiêm trọng hơn: khóa `last_pre_import_snapshot` là **singleton** dùng chung với backup import/GitHub restore. Nếu người dùng nhập backup (tạo rollback point hợp lệ) rồi sau đó nhập profile, rollback point hợp lệ đó bị **ghi đè** bằng object không dùng được → mất hoàn toàn khả năng khôi phục dữ liệu trước đó. Đây là data-loss risk. Test hiện tại (`importProfile.test.ts:73-75`) chỉ kiểm tra snapshot có chứa setting cũ, không hề khớp với `SnapshotData`, nên không phát hiện lỗi.

**Fix:** Không ghi snapshot profile vào khóa dùng chung. Thêm một khóa riêng, hoặc tốt nhất bỏ hẳn việc ghi snapshot vì `applyConfigProfile` là key-by-key merge (không clear bảng, không ghi đè secret) nên không cần rollback toàn cục. Nếu vẫn cần rollback, tạo đúng `SnapshotData` qua `captureSnapshot()` và lưu ở khóa riêng `last_profile_import_snapshot`:

```ts
// importProfile.ts — xóa dòng 96:
// await db.settings.put({ key: 'last_pre_import_snapshot', value: snapshot });

// Nếu cần rollback point riêng:
await db.settings.put({ key: 'last_profile_import_snapshot', value: snapshot });
```

Cần cập nhật test để khẳng định `last_pre_import_snapshot` **không** bị ghi bởi profile import, và assert mọi snapshot consumer đều nhận được object có `.tables`/`.counts`.

### CR-02: Route `config-profiles` không có điểm vào UI — màn hình authoring/export không thể truy cập

**File:** `src/App.tsx:120-121`, `src/components/shell/Navigation.tsx:29-92`, `src/workbench/TitleBar.tsx:195-285`, `src/workbench/search/SearchEverywhereModal.tsx`

**Issue:** Phase đăng ký route `config-profiles` ở mọi nơi cần thiết để render (`App.tsx`, `useHashRoute.ts:18`, `navigation.ts:8`, `EditorArea.tsx:581-582`, `layoutStore.ts:12`, `WorkbenchLayout.tsx:271` title map). Tuy nhiên không có **call site nào** điều hướng tới nó:

- `Navigation.tsx` (sidebar của classic shell) không có menu item `config-profiles` (chỉ có dashboard/tasks/planner/analytics/notes/mermaid/telegram/settings).
- `TitleBar.tsx` — nơi duy nhất gọi `onOpenView` trong IntelliJ shell — chỉ có 5 mục: `dashboard`, `tasks`, `planner`, `telegram`, `analytics`.
- `SearchEverywhereModal.tsx` không sinh action `config-profiles`.
- `SettingsView.tsx` có `ConfigProfileImportCard` (nhập) nhưng **không có link** tới màn hình authoring/export. `ConfigProfilesView` chỉ có nút một chiều "Quay lại Cài đặt".

Với cấu hình Tauri-only và `main.tsx:47` mặc định `useIntelliJ`, người dùng không có cách nào mở `ConfigProfilesView` (700 dòng) — trừ khi tự sửa hash `#/config-profiles` trong classic shell, điều không khả thi trong webview IntelliJ mặc định. Toàn bộ năng lực "soạn & xuất profile" (D-01..D-06) vì thế không dùng được.

**Fix:** Thêm một điểm vào rõ ràng. Ví dụ trong `SettingsView` data tab hoặc `PageHeader`:

```tsx
<Button icon={<EditOutlined />} onClick={() => onNavigate?.('config-profiles')}>
  Soạn & xuất Profile
</Button>
```

và/hoặc thêm `config-profiles` vào menu `TitleBar.onOpenView` (`handleOpenView` trong `WorkbenchLayout.tsx` đã có title map sẵn). Bổ sung test assert menu item tồn tại ở shell mặc định.

## Warnings

### WR-01: Giá trị secret không rỗng trong `settings` của profile có thể ghi đè secret thật của người nhận

**File:** `src/services/configProfiles/importProfile.ts:76-82`, `src/validation/configProfileSchemas.ts:47`

**Issue:** `ProfileConfigSchema.settings` là `z.record(z.string(), z.unknown())` — không ràng buộc secret key. Vòng lặp import chỉ bỏ qua secret key khi **giá trị bằng `''`**:

```ts
if (value === '' && isBlankSecretKey(key)) { skippedBlankSecrets.push(key); continue; }
incoming.push({ key, value });
```

Do đó một file profile畸形/độc hại (trust boundary: file do người dùng chọn) có thể chứa `settings: { github_pat: "giá_trị_kẻ_tấn_công" }`. Vì `isBlankSecretKey('github_pat') === true` nhưng giá trị không rỗng, dòng này sẽ `incoming.push` và `db.settings.put` → **ghi đè token thật** của người nhận. Điều này trái trực tiếp với constraint "profile secrets must never be overwritten" và khác với `secretFields` (được schema ép `z.literal('')`). Export chuẩn không tạo ra trường hợp này, nhưng import là unbounded input nên phải tự phòng vệ.

**Fix:** Bỏ qua **mọi** secret-like key bất kể giá trị, đồng thời từ chối chúng ở schema:

```ts
for (const [key, value] of Object.entries(config.settings)) {
  if (isBlankSecretKey(key)) {
    if (value === '') skippedBlankSecrets.push(key);
    continue; // không bao giờ ghi secret từ profile vào db
  }
  incoming.push({ key, value });
}
```

Thêm rule refine trong `ProfileConfigSchema` để reject secret-like key xuất hiện trong `settings` (dùng `isSafeBackupSetting`), và test với payload secret có giá trị không rỗng.

### WR-02: Snapshot của profile import lưu secret plaintext, vi phạm mô hình snapshot an toàn

**File:** `src/services/configProfiles/importProfile.ts:62-72,96` (so sánh `src/services/backup/restoreBackup.ts:202-204,372-376`)

**Issue:** `settingsBefore = await db.settings.toArray()` lấy **toàn bộ** settings, kể cả `jira_api_token`, `github_pat`, `backup_passphrase`, `ssh_configurations`, Oracle connection string. Object này được lưu nguyên vẹn vào `last_pre_import_snapshot`. Trong khi đó backup snapshot (`captureSnapshot`, restoreBackup.ts:204) chủ động lọc: `const safeSettings = settings.filter(isSafeBackupSetting)` với comment *"Never persist secrets ... in a snapshot the UI offers"*, và `downloadSnapshotFile` còn có lớp phòng vệ thứ hai. Profile import bypass cả hai lớp này. Dù khóa này nằm trong denylist xuất backup (exportBackup.ts:35), việc lưu secret plaintext vào một khóa vốn được thiết kế là "snapshot có thể tải về" là một lỗ hổng bảo mật, nhất là khi CR-01 đã làm cho luồng tải về bị lỗi — use-case dự kiến của snapshot hoàn toàn vỡ.

**Fix:** Khi tạo snapshot, lọc secret giống `captureSnapshot`:

```ts
const settings = settingsBefore.filter((s) => isSafeBackupSetting(s.key));
```

(`isSafeBackupSetting` đã được import sẵn ở dòng 5). Ưu tiên xử lý chung với CR-01 bằng cách tái dùng `captureSnapshot()` thay vì tự dựng snapshot.

### WR-03: `teamDefaults` được export/import nhưng không bao giờ được áp dụng

**File:** `src/services/configProfiles/importProfile.ts:46-148`, `src/views/ConfigProfilesView.tsx:561-651`, `src/validation/configProfileSchemas.ts:51`

**Issue:** `ConfigProfilesView` cho người dùng chỉnh sửa toàn bộ AI-team template (`budgetTokens`, `concurrencyLimit`, `autoSplitEnabled`, `autoApproveMutations`, `mcpEnabled`, `sshFsToolsEnabled`, `oracleToolsEnabled`, `budgetWarnThresholdPct`); schema định nghĩa `AiTeamDefaultsTemplateSchema`; export giữ nguyên section. Nhưng `applyConfigProfile` chỉ đọc `config.settings`, `config.secretFields`, `config.capacityRules`, `config.capacityOverrides`, `config.ghostDevConfig` — **không đụng tới `config.teamDefaults`**. Hệ quả: phần cấu hình này được ghi vào file và sau đó bị bỏ qua lặng lẽ khi nhập;PostProfileImportChecklist cũng không nhắc người dùng phải cấu hình lại. Người dùng có cơ sở tin rằng profile của họ chứa và sẽ áp dụng các default này.

**Fix:** Quyết định rõ vai trò của `teamDefaults`:
- Nếu là template áp dụng được: map các field sang các setting key tương ứng trong `incoming` (hoặc ghi vào storage riêng) trong `applyConfigProfile`, và thêm test round-trip assert giá trị sau import.
- Nếu chỉ là tài liệu tham khảo: ghi rõ trong UI/checklist rằng section này **không** được áp dụng tự động, và cân nhắc bỏ khỏi schema/export để tránh hiểu lầm.

### WR-04: Authoring UI tạo ra giá trị vi phạm chính schema import — profile tự export có thể không tự import được

**File:** `src/views/ConfigProfilesView.tsx:398-466,518-533,584-598` (đối chiếu `src/validation/configProfileSchemas.ts:14-29`)

**Issue:** Nhiều control trong màn hình soạn profile cho phép tạo giá trị mà `ConfigProfileEnvelopeSchema` sẽ từ chối:

- Ngoại lệ công suất mới được khởi tạo với `date: ''` (dòng 460). Schema `CapacityOverrideProfileSchema.date` bắt `/^\d{4}-\d{2}-\d{2}$/`. Người dùng bấm "Thêm ngoại lệ", không kịp điền ngày, lưu rồi export → file bị schema đánh dấu **không hợp lệ**, import bị chặn.
- `concurrencyCap` gán `text === '' ? 0 : Number(text)` (dòng 527) nhưng schema `GhostDevProfileSchema.concurrencyCap` bắt `min(1).max(12)`; giá trị 0 hoặc >12 làm profile vô hiệu.
- `workMinutes` của rule và override dùng `Number(text)` không clamp (dòng 386, 420), schema bắt `0..1440`.
- `teamDefaults.concurrencyLimit` cũng dùng `Number(text)` không clamp (dòng 593), schema `min(1)`.

Không có bước validate trước khi `handleSave`/export, nên lỗi chỉ bùng phát ở máy người nhận — rất khó chẩn đoán.

**Fix:** Validate draft bằng `ConfigProfileEnvelopeSchema` (hoặc schema từng phần) trước khi lưu/export và hiển thị lỗi tại chỗ; đồng thời clamp giá trị ngay tại control:

```ts
// date: không khởi tạo rỗng
{ date: new Date().toISOString().slice(0, 10), workMinutes: 0 }
// concurrencyCap
concurrencyCap: Math.max(1, Math.min(12, text === '' ? 6 : Number(text)))
// workMinutes
Math.max(0, Math.min(1440, text === '' ? 0 : Number(text)))
```

### WR-05: `FileReader` trong import card thiếu `onerror` — đọc tệp thất bại im lặng

**File:** `src/components/settings/ConfigProfileImportCard.tsx:53-67`

**Issue:** `reader.onload` được xử lý (kể cả `try/catch` cho `JSON.parse`), nhưng không có `reader.onerror`. Nếu việc đọc tệp thất bại (quyền truy cập, tệp bị khóa/lỗi I/O — có thể xảy ra khi chọn tệp từ đường dẫn lạ trong Tauri), `readAsText` reject mà không có callback nào chạy: không notification, không reset loading, người dùng bấm chọn tệp và **không thấy phản hồi nào**, không biết tại sao import không mở.

**Fix:** Thêm handler và đóng modal state:

```ts
reader.onerror = () => {
  notification.error({
    message: 'Không đọc được tệp',
    description: 'Không thể đọc nội dung tệp cấu hình. Vui lòng thử lại.',
  });
};
```

## Info

### IN-01: Checklist liệt kê toàn bộ secret catalog thay vì những secret thực sự có trong profile

**File:** `src/components/settings/ImportProfilePreviewModal.tsx:86-91,219-226`, `src/components/settings/PostProfileImportChecklist.tsx:40-44`

**Issue:** Cả preview lẫn checklist đều lấy `getSecretFields()` — **mọi** secret trong catalog — rồi hiển thị hết, thay vì chỉ các secret mà profile thực sự khai báo (`envelope.profile.config.secretFields`). Kết quả: import một profile chỉ chứa `github_owner` vẫn hiện danh sách ~15 secret "cần nhập lại", phần lớn profile không hề có. Dù an toàn theo hướng bảo thủ, thông tin này gây nhiễu và làm người dùng chủ quan với cảnh báo (alert fatigue).

**Fix:** Giao Intersection giữa catalog và `Object.keys(envelope.profile.config.secretFields)` (giữ catalog để đảm bảo không sót secret bị thiếu khai báo nhưng vẫn thuộc diện cần rà soát), hoặc ghi chú rõ "kiểm tra nếu bạn dùng các dịch vụ này".

### IN-02: Tooltip cảnh báo machine-specific gắn trên icon không thể focus bằng bàn phím

**File:** `src/views/ConfigProfilesView.tsx:259-263,539`

**Issue:** `machineWarning` bọc `<WarningOutlined />` bằng `<Tooltip>`. Ant Design Tooltip chỉ kích hoạt qua hover/focus trên phần tử con có thể tương tác; `WarningOutlined` render thành `<span>` không có `tabIndex`, nên người dùng bàn phím/không dùng chuột không bao giờ đọc được nội dung giải thích "giá trị path được giữ lại... cần rà soát". Các input thì có `aria-label` tốt, riêng thông tin cảnh báo này bị loại khỏi luồng accessibility.

**Fix:** Thêm `tabIndex={0}` và `aria-label` trên icon, hoặc dùng `<Tooltip><button type="button" aria-label="..."><WarningOutlined /></button></Tooltip>`.

---

_Reviewed: 2026-11-19T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
