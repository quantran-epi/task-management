---
phase: quick
plan: 261119-tai
type: execute
wave: 1
depends_on: []
files_modified:
  - src/views/ConfigProfilesView.tsx
  - tests/views/ConfigProfilesView.test.tsx
autonomous: true
requirements:
  - PROFILE-SETTINGS-COMPACT
must_haves:
  truths:
    - "Authoring view renders no blank secret input boxes and no profile-secrets-section; secrets are handled only by the Import preview + post-import checklist"
    - "notification_settings and system_type_options render as readable pretty JSON, never as [object Object] or comma-joined text"
    - "Editing a structured field commits only a parsed object (notification_settings) or array (system_type_options); invalid JSON or wrong shape shows a visible inline error and blocks save, and no string is ever stored for these keys"
    - "All setting fields are condensed into AntD Collapse panels while every field, aria-label, data-testid and machine-specific marker stays in the DOM and queryable"
    - "Secret blanking in export/import, schema validation, and the post-import checklist remain unchanged and their tests pass"
  artifacts:
    - path: "src/views/ConfigProfilesView.tsx"
      provides: "Compact authoring view: no secret inputs, structured JSON editors with parse-or-block, Collapse-grouped fields"
    - path: "tests/views/ConfigProfilesView.test.tsx"
      provides: "Regression tests for removed secret section, structured JSON round-trip, and preserved DOM hooks after grouping"
  key_links:
    - from: "src/views/ConfigProfilesView.tsx structured textarea onChange"
      to: "draft.settings via setSetting"
      via: "JSON.parse + object/array shape check before setSetting; save-time re-parse guard"
      pattern: "JSON\\.parse|setSetting\\(key, parsed\\)"
    - from: "src/views/ConfigProfilesView.tsx Collapse items"
      to: "existing fields and section Cards"
      via: "items[].forceRender keeps all children mounted with original aria-labels and data-testid"
      pattern: "forceRender: true|<Collapse"
    - from: "src/views/ConfigProfilesView.tsx handleSave guard"
      to: "ConfigProfileEnvelopeSchema.safeParse"
      via: "structured error / re-parse check runs before validation so no string reaches settings"
      pattern: "structuredErrors|structuredText"
---

<objective>
Rút gọn màn hình soạn Config Profiles: bỏ section secret read-only, sửa hai field có cấu trúc hiển thị sai thành `[object Object]`, và gộp các nhóm field vào Collapse gọn gàng.

Purpose: Giảm nhiễu trên authoring view, tránh lưu sai kiểu dữ liệu cho `notification_settings` / `system_type_options`, mà không làm suy yếu bảo đảm an toàn secret (schema, export blank, import skip, checklist nhập lại) hay làm mất test hook hiện hữu.

Output: `ConfigProfilesView.tsx` gọn hơn + `ConfigProfilesView.test.tsx` cập nhật; export/import/schema/checklist không đổi.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@src/views/ConfigProfilesView.tsx
@src/services/configProfiles/catalog.ts
@src/services/configProfiles/defaults.ts
@src/services/configProfiles/exportProfile.ts
@src/services/configProfiles/importProfile.ts
@src/validation/configProfileSchemas.ts
@src/components/settings/ImportProfilePreviewModal.tsx
@src/components/settings/PostProfileImportChecklist.tsx
@tests/views/ConfigProfilesView.test.tsx
@tests/services/configProfiles/exportProfile.test.ts
@tests/services/configProfiles/importProfile.test.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Bỏ section secret read-only khỏi authoring view, cập nhật test tương ứng</name>
  <files>src/views/ConfigProfilesView.tsx, tests/views/ConfigProfilesView.test.tsx</files>
  <action>
    Trong `src/views/ConfigProfilesView.tsx`: xóa hoàn toàn khối tiêu đề `Secrets (sẽ để trống khi xuất)` và `<Card size="small" data-testid="profile-secrets-section">…</Card>` gồm Alert info và vòng lặp `secretFields.map(...)` render các `<Input readOnly value="" data-secret-field={key} />` (khoảng dòng 767-789). Không thay đổi gì khác liên quan đến secret: giữ nguyên `getSecretFields()` import, `SECRET_LABELS`, `secretFields` trong `cloneConfig`/`buildDefaultProfileConfig`, bước xóa secret-like key khỏi `settings` trong `normaliseDraft`, và KHÔNG sửa `catalog.ts`, `defaults.ts`, `exportProfile.ts`, `importProfile.ts`, `configProfileSchemas.ts`, `ImportProfilePreviewModal.tsx`, `PostProfileImportChecklist.tsx`.

    Trong `tests/views/ConfigProfilesView.test.tsx`: thay test `renders secret fields blank with an export-blank placeholder` bằng test tên `does not render blank secret inputs in authoring view (secrets handled by Import UI + checklist)`: render view, khẳng định `screen.queryByTestId('profile-secrets-section')` là null và `document.querySelectorAll('[data-secret-field]').length === 0`. Bỏ import `getSecretFields` nếu test mới không còn dùng; giữ nguyên các test export/import blank secret trong `tests/services/configProfiles/*.test.ts` (không sửa các file đó).
  </action>
  <verify>
    <automated>npx vitest run tests/views/ConfigProfilesView.test.tsx tests/services/configProfiles/exportProfile.test.ts tests/services/configProfiles/importProfile.test.ts</automated>
  </verify>
  <done>
    Không còn `profile-secrets-section` hay input `data-secret-field` nào trên authoring view; các test blank-secret ở export/import vẫn đọc được và pass; schema/export/import/checklist file không bị sửa.
  </done>
</task>

<task type="auto">
  <name>Task 2: Sửa notification_settings & system_type_options thành JSON editor parse-hoặc-chặn</name>
  <files>src/views/ConfigProfilesView.tsx, tests/views/ConfigProfilesView.test.tsx</files>
  <action>
    Trong `src/views/ConfigProfilesView.tsx`:

    1. Thêm nhãn cho hai key vào `SETTING_FIELDS`: `notification_settings: 'Cài đặt thông báo'`, `system_type_options: 'Tùy chọn loại hệ thống'` (để `displayLabel` trả về nhãn có ý nghĩa làm aria-label).

    2. Thêm hằng số kiểu dữ liệu kỳ vọng: `const JSON_SETTINGS: Record<string, 'object' | 'array'> = { notification_settings: 'object', system_type_options: 'array' };` và helper `structuredTextFor(config: ProfileConfig): Record<string, string>` trả về map hai key với giá trị `JSON.stringify(config.settings[key] ?? (key === 'system_type_options' ? [] : {}), null, 2)`.

    3. Thêm state: `const [structuredText, setStructuredText] = useState<Record<string, string>>(() => structuredTextFor(draft));` (đặt sau khai báo `draft`) và `const [structuredErrors, setStructuredErrors] = useState<Record<string, string>>({});`. Trong `resetDraft` và `handleSelect`, goị `setStructuredText(structuredTextFor(configMới))` và `setStructuredErrors({})` để đồng bộ khi tạo mới/chọn profile.

    4. Trong `renderSetting(key)`: ngay sau `const label = displayLabel(key)`, thêm nhánh `if (key in JSON_SETTINGS)` trả về `<div key={key}>` chứa `<Text strong>{label}</Text>`, `<Input.TextArea aria-label={label} rows={6} value={structuredText[key] ?? ''} onChange={...} />`, và `<Text type="danger">` hiển thị `structuredErrors[key]` khi có lỗi (kèm `role="alert"`). `onChange`: cập nhật `structuredText[key]` bằng text người dùng nhập; sau đó `JSON.parse(text)` và kiểm tra shape — `Array.isArray(parsed)` nếu kind là `'array'`, hoặc `parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)` nếu kind là `'object'`. Hợp lệ → `setSetting(key, parsed)` và xóa lỗi của key đó. Không hợp lệ (parse throw hoặc sai shape) → lưu thông báo lỗi tiếng Việt vào `structuredErrors[key]` (ví dụ `"JSON không hợp lệ hoặc sai kiểu (cần object/array)."`) và KHÔNG gọi `setSetting`, tức là `draft.settings[key]` vẫn giữ giá trị object/array hợp lệ trước đó — không bao giờ gán chuỗi. Giữ nguyên machine-warning và các nhánh Switch/InputNumber/TextArea/Input cho các key khác.

    5. Trong `handleSave`, TRƯỚC khi gọi `normaliseDraft`/`ConfigProfileEnvelopeSchema.safeParse`: nếu `Object.values(structuredErrors).some(Boolean)` → `setDraftError('Cài đặt thông báo / Tùy chọn loại hệ thống: JSON chưa hợp lệ. Sửa trước khi lưu.')` rồi return. Ngoài ra, phòng vệ: với mỗi key trong `JSON_SETTINGS`, parse lại `structuredText[key]` và kiểm tra shape như bước 4; nếu lỗi → setDraftError tương tự rồi return; nếu ok → đảm bảo `normalised.settings[key]` là giá trị đã parse (gán lại nếu cần). Kết quả: mọi giá trị lưu cho hai key này luôn là object/array, không phải string.

    Trong `tests/views/ConfigProfilesView.test.tsx`, thêm các test:
    - Render mặc định: textarea có aria-label 'Cài đặt thông báo' chứa chuỗi JSON đẹp (có `"browserNotificationsEnabled"`), textarea 'Tùy chọn loại hệ thống' chứa `"LOGICAL_GROUP"`; `expect(screen.queryByText('[object Object]')).toBeNull()`.
    - Sửa `Cài đặt thông báo` thành JSON object hợp lệ (ví dụ đổi `dueSoonDays` thành 5), nhập 'Tên profile', bấm Lưu; đọc `db.settings.get(CONFIGURATION_PROFILES_SETTING_KEY)` trong `waitFor`, khẳng định `typeof saved.config.settings.notification_settings === 'object'` và `.dueSoonDays === 5`, không phải string. Tương tự cho `system_type_options` với một array có phần tử `{value:'API',label:'API',color:'#1890ff'}` → khẳng định `Array.isArray(...)`.
    - Nhập JSON sai (`'{'` hoặc object cho `system_type_options`), bấm Lưu → xuất hiện thông báo lỗi (`role="alert"` hoặc 'Profile chưa hợp lệ'), `db.settings.get(CONFIGURATION_PROFILES_SETTING_KEY)` vẫn undefined, và không có giá trị string nào được lưu.
  </action>
  <verify>
    <automated>npx vitest run tests/views/ConfigProfilesView.test.tsx</automated>
  </verify>
  <done>
    Hai field hiển thị JSON dễ đọc; sửa hợp lệ lưu object/array đúng kiểu; JSON sai hoặc sai kiểu hiện lỗi nhìn thấy được và chặn lưu; không có string nào được ghi vào `settings[notification_settings|system_type_options]`.
  </done>
</task>

<task type="auto">
  <name>Task 3: Gộp các nhóm field vào Collapse, giữ nguyên mọi test hook</name>
  <files>src/views/ConfigProfilesView.tsx, tests/views/ConfigProfilesView.test.tsx</files>
  <action>
    Trong `src/views/ConfigProfilesView.tsx`: thêm `Collapse` vào import `antd` hiện có. Thay toàn bộ khối `<Space direction="vertical" style={{ width: '100%' }} size="middle">` chứa các nhóm field (từ 'Thông báo & hệ thống' đến hết card secrets đã bị xóa ở Task 1) bằng một `<Collapse ghost defaultActiveKey={[]} items={[...]} />` duy nhất. Mỗi item có `{ key, label, forceRender: true, children }` với thứ tự:

    - `{ key: 'thong-bao-he-thong', label: 'Thông báo & hệ thống', children: <Card size="small">{renderSetting('notification_settings')}{renderSetting('system_type_options')}</Card> }`
    - Ba item từ `SETTING_GROUPS.map(...)`, mỗi item `key` là slug của `group.title`, `label: group.title`, `forceRender: true`, `children: <Card size="small">{group.keys.map(renderSetting)}</Card>`.
    - `{ key: 'capacity', label: 'Công suất làm việc (capacity)', children: <Card size="small" data-testid="profile-capacity-section">…nội dung capacity nguyên vẹn…</Card> }`
    - `{ key: 'ghost-dev', label: 'Ghost Dev config', children: <Card size="small" data-testid="profile-ghost-dev-section">…nội dung Ghost Dev nguyên vẹn…</Card> }`
    - `{ key: 'ai-team', label: 'Mẫu defaults cho đội AI (AI-team template)', children: <Card size="small" data-testid="profile-ai-team-section">…nội dung AI-team nguyên vẹn…</Card> }`

    Bắt buộc: đặt `forceRender: true` trên MỌI item để rc-collapse giữ toàn bộ children trong DOM dù panel đóng — nhờ đó mọi `aria-label`, `data-machine-specific`, `data-machine-specific-row`, `data-testid` và `getByText` hiện hữu vẫn hoạt động dù collapse đóng mặc định. Xóa các `<Typography.Text strong>` tiêu đề cũ nằm ngoài Card cho capacity / Ghost Dev / AI-team / 'Thông báo & hệ thống' vì giờ tiêu đề đã là Collapse label; giữ lại mọi `<Text strong>` bên trong Card (ví dụ 'Model chính (master)', 'Token budget mỗi team', placeholder Select 'Kế thừa global'). Không đổi nội dung các field, không thêm/bớt field, không dùng `destroyOnHidden`. Bỏ import `Fragment` nếu sau khi đổi cấu trúc không còn dùng.

    Trong `tests/views/ConfigProfilesView.test.tsx`: giữ nguyên các test hiện có và thêm test `keeps all grouped fields and DOM hooks reachable after collapsing`: render view, khẳng định `screen.getByLabelText('9Router endpoint')`, `screen.getByLabelText('Team budget warn threshold')`, `screen.getByTestId('profile-capacity-section')`, `screen.getByTestId('profile-ghost-dev-section')`, `screen.getByTestId('profile-ai-team-section')` vẫn hiện diện và truy vấn được dù Collapse đóng; kiểm tra `document.querySelector('[data-machine-specific-row="github_owner"] [data-machine-specific]')` không null. Nếu test `getByText('Ghost Dev config')` / `'Công suất làm việc (capacity)'` trùng do header + inner label, đảm bảo chỉ còn đúng một nguồn hiển thị cho mỗi chuỗi đó (xóa inner strong tương ứng).
  </action>
  <verify>
    <automated>npx vitest run tests/views/ConfigProfilesView.test.tsx</automated>
  </verify>
  <done>
    Các nhóm field gộp thành Collapse gọn gàng; mọi field, aria-label, test ID, marker machine-specific vẫn nằm trong DOM và các test cũ lẫn test mới đều pass; không field nào bị mất.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Authoring JSON textarea → profile draft | User-typed JSON for notification_settings / system_type_options crosses into `draft.settings` |
| Saved profile → export/import | Profile JSON travels to file and back through untrusted import preview |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-quick-01 | Tampering | Structured JSON textarea in ConfigProfilesView | mitigate | `JSON.parse` + exact shape check (object for notification_settings, array for system_type_options) before `setSetting`; existing `normaliseDraft` still strips secret-like keys; `ConfigProfileEnvelopeSchema.safeParse` gates save |
| T-quick-02 | Denial of Service | Oversized/deeply nested pasted JSON | accept | Author is sole local user pasting own text into a controlled textarea; untrusted file content stays gated by ConfigProfileEnvelopeSchema on the import path, unchanged here |
| T-quick-03 | Information Disclosure | Secret fields on authoring screen | accept | Removing blank secret inputs reduces surface; real secret blanking still enforced in exportProfile/importProfile/checklist and their tests; no secret value is ever rendered |
| T-quick-SC | Tampering | npm dependencies | accept | No new dependencies; uses existing Ant Design `Collapse` and React state only |

</threat_model>

<verification>
Chạy scoped tests (KHÔNG chạy full suite — repo rule: `npx vitest run` toàn repo mất >1 giờ):

`npx vitest run tests/views/ConfigProfilesView.test.tsx tests/services/configProfiles/exportProfile.test.ts tests/services/configProfiles/importProfile.test.ts`

Sau đó `npx tsc --noEmit` để bảo đảm kiểu dữ liệu object/array và props Collapse `items[].forceRender` đúng với Ant Design 6.6.5.
</verification>

<success_criteria>
- Không còn read-only secret input nào trên authoring view; secret vẫn blank ở export/import và vẫn nhắc nhập lại ở checklist.
- `notification_settings` / `system_type_options` hiển thị JSON dễ đọc, sửa hợp lệ lưu đúng kiểu object/array, sai định dạng hiện lỗi và chặn lưu.
- Mọi field được gộp vào Collapse nhưng aria-label, data-testid, machine marker và nội dung không đổi; test hook đầy đủ.
- Các test scoped và `tsc --noEmit` đều pass; không thêm dependency.
</success_criteria>

<output>
Create .planning/quick/261119-tai-r-t-g-n-profile-setting-ch-gi-field-setu/261119-tai-PLAN.md
</output>
