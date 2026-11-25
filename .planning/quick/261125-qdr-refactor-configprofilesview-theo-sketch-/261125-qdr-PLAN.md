---
phase: quick
plan: 261125-qdr
type: execute
wave: 1
depends_on: []
files_modified:
  - src/views/ConfigProfilesView.tsx
  - src/services/configProfiles/types.ts
  - src/services/configProfiles/exportProfile.ts
  - tests/views/ConfigProfilesView.test.tsx
  - tests/services/configProfiles/exportProfile.test.ts
autonomous: true
requirements:
  - PROFILE-RAIL-SEARCH-DUPLICATE
  - PROFILE-RECIPIENT-LOCAL
  - PROFILE-4-TABS
  - PROFILE-REVIEW-PANEL
user_setup: []
must_haves:
  truths:
    - "Rail trái liệt kê mọi profile đã lưu, có ô tìm kiếm theo tên/người nhận và nút Mới + Nhân bản; chọn profile sửa được; đổi tên không đổi id"
    - "Editor có ô 'Người nhận' là metadata nội bộ, lưu cùng profile nhưng KHÔNG bao giờ xuất vào file JSON"
    - "Editor gom 4 tab Cơ bản / Kết nối / AI & Team / Công suất; mọi field cũ, data-testid và aria-label vẫn reachable"
    - "Panel phải hiện checklist 3 mục + cảnh báo giá trị theo máy + preview JSON của đúng bản đang soạn; tick checkbox KHÔNG chặn Xuất"
    - "Không đọc live settings của chủ máy; draft vẫn chỉ seed từ buildDefaultProfileConfig() hoặc profile đã chọn"
    - "Focused Vitest và tsc --noEmit xanh; không chạy full suite"
  artifacts:
    - path: src/services/configProfiles/types.ts
      provides: "recipient?: string trên ConfigurationProfile — metadata local-only, optional nên profile cũ vẫn hợp lệ"
      contains: "recipient?: string"
    - path: src/services/configProfiles/exportProfile.ts
      provides: "buildProfileExportPayload tách recipient khỏi profile trước khi dựng envelope"
      contains: "recipient"
    - path: src/views/ConfigProfilesView.tsx
      provides: "Shell 220px rail / editor 4 tab / panel review 296px, lưu nhiều profile, nhân bản, tìm kiếm"
      contains: "profile-export-preview"
    - path: tests/views/ConfigProfilesView.test.tsx
      provides: "Regression recipient-local, id ổn định, nhân bản, tìm kiếm, tab, panel review"
      contains: "profile-search"
    - path: tests/services/configProfiles/exportProfile.test.ts
      provides: "Regression export payload không chứa recipient"
      contains: "recipient"
  key_links:
    - from: src/views/ConfigProfilesView.tsx (recipient input)
      to: src/services/configProfiles/types.ts (ConfigurationProfile.recipient)
      via: "state `recipient` cạnh `name`, ghi vào bản lưu; envelopeForDraft vẫn dựng profile không có recipient"
    - from: src/services/configProfiles/exportProfile.ts (buildProfileExportPayload)
      to: file JSON xuất
      via: "destructure bỏ `recipient` trước khi `{ ...rest, config }` — schema strictObject không đổi"
    - from: src/views/ConfigProfilesView.tsx (panel preview)
      to: src/services/configProfiles/exportProfile.ts
      via: "buildProfileExportPayload(profileSoạn) → JSON.stringify(preview) trong <pre data-testid=profile-export-preview>"
    - from: src/views/ConfigProfilesView.tsx (review checkbox)
      to: ConfigProfileExportButton
      via: "checkbox chỉ là UI state; button không đọc checkbox, vẫn bật khi có profile"
---

<objective>
Refactor màn hình "Cấu hình cho người khác" (`ConfigProfilesView`) theo sketch 005 winner C + 006 winner B: rail trái nhiều profile (tìm kiếm / Mới / Nhân bản), editor giữa gồm tên + "người nhận" + 4 tab nhóm field, panel phải preview JSON + checklist rà soát secret/path máy.

Purpose: hiện màn hình chỉ có rail danh sách thô và 5 `Collapse` (+ sinh ra bản soạn mới), không có metadata người nhận, không có preview, không rà soát secrets trước khi xuất. Sếp cần soạn/sửa nhiều profile gửi cho người khác mà vẫn thấy ngôn ngữ "profile cho người khác" và nội dung export ngay lúc sửa. Không đụng schema/validation/import, không đọc cấu hình máy chủ.

Output: shell 3 vùng, metadata `recipient` local-only, 4 tab (forceRender), review panel không chặn export, focused regression tests. Không thêm dependency, không đổi Dexie schema, không đụng PWA/GitHub Pages.

Quyết định (Claude's discretion, không có CONTEXT.md locked decisions cho quick task này):
- `recipient` là optional field trên `ConfigurationProfile`, lưu trong cùng một settings row; `ConfigurationProfileSchema` giữ nguyên `strictObject` và KHÔNG nhận `recipient` — `envelopeForDraft` vẫn dựng envelope 4 field cũ nên validation/save/import không đổi. Export tách trường này ra trước khi đóng gói. Đây là cách nhỏ nhất để backward-compatible với profile cũ (không có `recipient`).
- Dùng AntD `Tabs` với `forceRender: true` thay `Collapse`: đúng 4 tab theo sketch, DOM hook vẫn có sẵn; test đổi helper `openPanel` sang bấm tab và bấm tab 'Công suất' trước khi thao tác với nút bên trong (tab pane inactive có `hidden`, `getByRole` mặc định bỏ qua).
- Giữ `ConfigProfileExportButton` nguyên vẹn: checkbox checklist là chỉ báo, không phải gate (006B, không phải 006C).
- Không thêm ô nhập secret vào editor: test hiện tại chặn `profile-secrets-section` / `[data-secret-field]`; panel phải liệt kê secret đã khai báo là `''` thay vì render ô nhập.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/STATE.md
@.planning/sketches/MANIFEST.md
@.claude/skills/sketch-findings-task-management/references/profile-authoring-review.md
@src/views/ConfigProfilesView.tsx
@src/services/configProfiles/types.ts
@src/services/configProfiles/exportProfile.ts

Quan sát lúc lập plan:
- `ConfigProfilesView.tsx`: draft luôn seed từ `newDraftFromDefaults()` → `cloneConfig(buildDefaultProfileConfig())`; `useEffect` chỉ gọi `getProfiles(db)` (key `configuration_profiles`), không đọc live settings. Giữ nguyên bất biến này.
- Hiện rail là `<Col md={7} lg={6}>` với danh sách `data-testid="profile-list-item-${id}"`; editor `<Col md={17} lg={18}>` có ô `aria-label="Tên profile"`, `Lưu profile`, `ConfigProfileExportButton`, `Xóa profile`; 5 Collapse item (`Thông báo & hệ thống`, GitHub, Jira, `AI toàn cục & Knowledge`, `Công suất làm việc (capacity)`, `Ghost Dev config`, `AI-team template`) đều `forceRender: true`.
- `normaliseDraft` đã clamp numeric/date; `handleSave` validate bằng `envelopeForDraft(name, normalised, id, now)` rồi upsert theo `existing?.id ?? generateId()` — id ổn định khi đổi tên đã đúng, chỉ cần thêm recipient vào bản lưu.
- `exportProfile.ts:68` dựng `profile: { ...profile, config }` — sẽ rò rỉ `recipient` nếu không tách ra; `ConfigProfileEnvelopeSchema` là `strictObject` nên không được đưa `recipient` vào envelope validation.
- `catalog.ts` đã có `getMachineSpecificFields()`, `getDeclaredProfileMachineFields(config)`, `getDeclaredProfileSecretFields(declared)` — dùng lại, không viết catalog mới.
- `src/components/ui/index.ts` export `Tabs`, `Checkbox`, `Tag`, `useAntdToken`; `ConfigProfileExportButton` nhận `profile: ConfigurationProfile | null` và tự gọi `exportProfileToFile`.
- Tests hiện tại: `tests/views/ConfigProfilesView.test.tsx` (11 ca) dùng helper `openPanel(label)` bấm `.ant-collapse-header`, và bấm nút trong tab 'Công suất' sau khi mở panel; các field bị ẩn vẫn đọc được bằng `getByLabelText`. Helper pass db riêng (`new TaskPlannerDatabase(...)`), dọn trong `afterEach`. `tests/services/configProfiles/exportProfile.test.ts` đã test payload secrets trống — thêm 1 ca recipient ở đó.
- Token màu lấy từ `useAntdToken()` / biến CSS có sẵn (`ui-tokens.css`); không thêm màu hardcode mới. Không chạy full `npm test` (project memory: >1 tiếng).
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Shell 3 vùng + metadata người nhận + quản lý nhiều profile</name>
  <files>src/views/ConfigProfilesView.tsx, src/services/configProfiles/types.ts, src/services/configProfiles/exportProfile.ts, tests/views/ConfigProfilesView.test.tsx, tests/services/configProfiles/exportProfile.test.ts</files>
  <behavior>
    - Thêm profile A có recipient 'Nam', lưu; bấm Mới rồi lưu profile B có recipient 'Lan' — rail hiện 2 dòng, mỗi dòng có tên + recipient; chọn lại A sửa tên thành 'A mới', giữ recipient, Lưu → id không đổi, B vẫn nguyên.
    - Ô tìm kiếm 'Tìm profile' lọc rail theo tên hoặc recipient; 'Nhân bản' tạo profile mới có id khác, config/recipient sao chép, profile gốc không đổi.
    - Export profile có recipient: `buildProfileExportPayload(...).profile` không có key `recipient`, envelope vẫn pass `ConfigProfileEnvelopeSchema.safeParse`, mọi secret vẫn `''`.
    - `db.settings` có giá trị bất kỳ (vd `ninerouter_endpoint = 'http://evil'`) thì ô '9Router endpoint' trong editor vẫn là DEFAULT_NINEROUTER_ENDPOINT — không đọc live settings.
  </behavior>
  <action>
    Viết test trước cho 4 ca trên (đỏ), rồi sửa production:

    Trong `types.ts`: thêm `recipient?: string` vào `ConfigurationProfile` với comment ngắn: metadata nội bộ, không export, optional để profile cũ hợp lệ. Không sửa `ProfileConfig` hay schema.

    Trong `exportProfile.ts`: trong `buildProfileExportPayload`, tách `const { recipient: _recipient, ...profileFields } = profile;` rồi trả `profile: { ...profileFields, config }` (giữ nguyên mọi logic blank secret / capacity / optional field khác). `exportProfileToFile` không đổi.

    Trong `ConfigProfilesView.tsx`: thêm state `recipient`; `resetDraft` xóa cả recipient; `handleSelect` nạp `profile.recipient ?? ''`; `handleSave` thêm `...(recipient.trim() ? { recipient: recipient.trim() } : {})` vào object `saved` (KHÔNG đưa vào `envelopeForDraft`), giữ nguyên `existing?.id ?? generateId()` và `createdAt`. Thêm `handleDuplicate`: nhân bản profile đang chọn với id mới `generateId()`, tên `${name} (copy)`, copy `config` qua `cloneConfig` và giữ recipient, lưu qua `saveProfiles`, select bản mới. Không nhân bản khi chưa có profile chọn.

    Đổi layout vùng trên thành shell 3 cột grid: rail trái 220px, editor giữa `minmax(0,1fr)`, panel phải 296px (Task 2 dựng nội dung panel; Task 1 chỉ cần chỗ đứng + border/background bằng token). Rail: ô `Input` `aria-label="Tìm profile"` + `data-testid="profile-search"` lọc `profiles` theo `name` + `recipient` (case-insensitive, `String(...)` an toàn cho profile cũ thiếu recipient); giữ nút Mới `aria-label="Mới (từ mặc định)"`; thêm nút `aria-label="Nhân bản profile"` gọi `handleDuplicate`. Mỗi dòng giữ `data-testid="profile-list-item-${id}"`, role/tabIndex/click/keydown cũ, thêm dòng meta `recipient · ngày` (ngày = `updatedAt.slice(0,10)`).

    Editor head: giữ `aria-label="Tên profile"` nguyên vẹn, thêm ô `aria-label="Người nhận"` cạnh tên với hint "Chỉ là metadata — không xuất vào file JSON". Footer dính dưới editor: Xóa profile / Nhân bản profile / ConfigProfileExportButton / Lưu profile (primary), giữ nguyên aria-label và thứ tự tương đối của các nút cũ; toàn bộ controls vẫn bật đúng điều kiện `selectedProfile` như cũ.

    Test: trong `tests/views/ConfigProfilesView.test.tsx` giữ nguyên 11 ca cũ, cập nhật helper `openPanel` để bấm tab (xong ở Task 2) và thêm 4 ca mới theo behavior; trong `exportProfile.test.ts` thêm ca assert `!('recipient' in payload.profile)` + envelope parse success.
  </action>
  <verify>
    <automated>npx vitest run tests/views/ConfigProfilesView.test.tsx tests/services/configProfiles/exportProfile.test.ts --bail=1 && npx tsc --noEmit</automated>
  </verify>
  <done>Rail tìm được profile theo tên/người nhận, Mới/Nhân bản/Lưu nhiều profile với id ổn định khi đổi tên; recipient lưu local và không xuất ra JSON; targeted Vitest + tsc xanh.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: 4 tab nhóm field + panel rà soát/preview không chặn Export</name>
  <files>src/views/ConfigProfilesView.tsx, tests/views/ConfigProfilesView.test.tsx</files>
  <behavior>
    - 4 tab `Cơ bản` / `Kết nối` / `AI & Team` / `Công suất` bấm được; mọi field cũ vẫn có trong DOM nhờ forceRender (kể cả tab inactive), testid `profile-capacity-section`, `profile-ghost-dev-section`, `profile-ai-team-section` và aria-label cũ không đổi.
    - Panel phải có 3 checkbox `data-testid=review-check-machine` / `review-check-secret` / `review-check-preview`, `<pre data-testid="profile-export-preview">` chứa JSON export của đúng draft đang sửa: có `"github_owner"`, secret luôn `''`, KHÔNG có `recipient`. Cảnh báo vàng hiện số field theo máy có giá trị (dùng `getDeclaredProfileMachineFields`).
    - Tick/bỏ tick checkbox không làm `ConfigProfileExportButton` disabled; nhấn Xuất vẫn gọi export bình thường.
    - Sửa field ở tab 'Công suất' (Thêm ngoại lệ, Ghost Dev concurrency cap = 0, Team concurrency limit = 0) rồi Lưu vẫn clamp và validate như cũ (WR-04); ngày sai vẫn bị chặn (WR-02).
  </behavior>
  <action>
    Viết test trước (đỏ), rồi đổi production:

    Thay 5 Collapse item bằng AntD `Tabs` (import từ `'../components/ui'`) với đúng 4 item, mỗi item `forceRender: true`, `key` ổn định `co-ban` / `ket-noi` / `ai-team` / `cong-suat`. Phân nhóm không mất field:
    - Cơ bản: `notification_settings`, `system_type_options` + các key GitHub + Jira (giữ nguyên `renderSetting`).
    - Kết nối: nhóm `AI toàn cục & Knowledge` hiện tại (global_conventions, ai_budget_warn_threshold_pct, ninerouter_*, image_*, graphiti_*, knowledge_server_*).
    - AI & Team: nội dung Ghost Dev + AI-team template hiện tại, giữ nguyên tiêu đề 'Ghost Dev config' và testid.
    - Công suất: nội dung capacity hiện tại, giữ nguyên tiêu đề 'Công suất làm việc (capacity)' và testid.
    Giữ `draftError` Alert bên ngoài Tabs để hiện mọi lỗi validate; binding state/field/onChange y hệt hiện tại — chỉ đổi vỏ nhóm.

    Dựng panel phải:
    - Tính `previewProfile` từ state hiện tại: `{ id: selectedId ?? 'draft', name, createdAt: selectedProfile?.createdAt ?? now, updatedAt: ..., config: normalisedDraft }` trong đó `normalisedDraft` áp dụng `normaliseDraft(draft)` + structuredText đã parse (dùng chung helper tách ra từ `handleSave` để preview khớp bản sẽ lưu; không đọc db/keyring). Gọi `buildProfileExportPayload(previewProfile)` và `JSON.stringify(..., null, 2)` vào `<pre data-testid="profile-export-preview">` (render bằng text node React, không innerHTML).
    - Checkbox state cục bộ `reviewChecks: { machine, secret, preview }` (mặc định false), mỗi cái có `data-testid` như trên và `aria-label` tiếng Việt rõ ràng; dùng `Checkbox` từ `../components/ui`. Không lưu vào profile, không gated `ConfigProfileExportButton`.
    - Số machine field có giá trị lấy từ `getDeclaredProfileMachineFields(draft)` lọc theo value không rỗng; khi > 0 render `Alert type="warning"` kiểu "Đã đổi N giá trị theo máy. Người nhận sẽ cần tự chỉnh lại sau import." Dòng secret hiển thị số `getDeclaredProfileSecretFields(draft.secretFields).length` kèm chú thích "để trống". Không render ô nhập secret mới.

    Test: đổi helper `openPanel(label)` thành bấm tab theo mapping ('Công suất làm việc (capacity)' → tab 'Công suất'); trong các ca WR-04/WR-02 bấm tab 'Công suất' trước khi bấm 'Thêm ngoại lệ'. Thêm ca: bấm từng tab assert field/testid cũ vẫn present; panel preview chứa JSON đúng + không có recipient/secret value; tick checkbox rồi assert export button không disabled; cảnh báo theo máy đổi khi sửa `github_owner`.
  </action>
  <verify>
    <automated>npx vitest run tests/views/ConfigProfilesView.test.tsx tests/services/configProfiles/exportProfile.test.ts --bail=1 && npx tsc --noEmit</automated>
  </verify>
  <done>4 tab thay Collapse mà không mất field/hook; panel review hiện checklist + cảnh báo + preview JSON của draft; checkbox không chặn Export; mọi validation clamp/date cũ và 11 ca cũ vẫn xanh.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| recipient input → profile row → export payload | Metadata do người soạn nhập, lưu local; phải tách trước khi đóng gói JSON gửi người khác. |
| draft config → preview JSON → DOM | Giá trị do người dùng gõ, render dưới dạng text node trong `<pre>`. |
| machine-specific values → review panel | Giá trị path/host của máy soạn bị giữ lại trong export; cần cảnh báo nhưng không được chặn export. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-qdr-01 | I (Information disclosure) | `buildProfileExportPayload` | high | mitigate | Destructure bỏ `recipient` khỏi profile trước khi spread; test pin `!('recipient' in payload.profile)`; secrets vẫn blank qua catalog. |
| T-qdr-02 | I (Information disclosure) | review panel | medium | mitigate | Cảnh báo field theo máy có giá trị bằng `getDeclaredProfileMachineFields`; preview lấy từ draft (không đọc live settings/db/keyring). |
| T-qdr-03 | T (Tampering) | preview JSON render | low | mitigate | `JSON.stringify` + React text node trong `<pre>`, không `dangerouslySetInnerHTML`; schema strictObject giữ nguyên cho import. |
| T-qdr-SC | Tampering | npm installs | high | accept | Không cài package; chỉ dùng AntD/components có sẵn. |
</threat_model>

<verification>
1. `npx vitest run tests/views/ConfigProfilesView.test.tsx tests/services/configProfiles/exportProfile.test.ts --bail=1` — pass (không chạy full suite).
2. `npx tsc --noEmit` — clean.
3. `git diff --name-only` — đúng 5 file trong `files_modified`; `configProfileSchemas.ts`, `importProfile.ts`, `catalog.ts` không đổi.
4. `grep -n "recipient" src/services/configProfiles/exportProfile.ts` — có destructuring tách; `grep -n "recipient" src/validation/configProfileSchemas.ts` — không có kết quả.
5. Kiểm tra tay trong Chrome (nếu có harness): 3 cột hiển thị đúng, đổi tab không mất field, tick checkbox rồi bấm Xuất vẫn mở file picker.
</verification>

<success_criteria>
- Màn hình là shell 005C: rail 220px với tìm kiếm/Mới/Nhân bản, editor 4 tab, panel phải preview + checklist 006B.
- Nhiều profile lưu/sửa được; đổi tên giữ nguyên id; nhận bản metadata local-only, không bao giờ xuất ra JSON.
- Mọi data-testid / aria-label cũ và validation WR-02/WR-04/D-01 được giữ; export không bị gate bởi checkbox.
- Focused Vitest và tsc xanh; không commit/push trong plan; không đụng PWA/GitHub Pages hay import/schema.
</success_criteria>

<output>
Create `.planning/quick/261125-qdr-refactor-configprofilesview-theo-sketch-/261125-qdr-SUMMARY.md` when done
</output>
