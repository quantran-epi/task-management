---
phase: quick-261117-tpk
plan: '01'
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/quick/261117-tpk-t-ch-c-l-i-m-n-h-nh-settings-taskmate-th/261117-tpk-settings-audit.md
  - src/views/SettingsView.tsx
  - tests/views/SettingsView.test.tsx
autonomous: true
requirements: []
must_haves:
  truths:
    - "Mỗi tab trong SettingsView (capacity, data, jira, notifications, ai, ssh) vẫn giữ nguyên key, label, icon và defaultActiveTab='capacity' — người dùng vẫn thấy đúng 6 tab như cũ"
    - "Mọi card component con hiện có vẫn được render đúng số lượng và đúng tab như trước (data: BackupExport/BackupImport/SnapshotRollback/GitHubConfig/GitHubSync/LocalSqlitePersistence/PwaStatus/StoragePersistence + Danger Zone; ai: GlobalConventions/Mcp/OracleAiTool/SshFsAiTool/GhostDev/NineRouter/BudgetWarnThreshold/KnowledgeServer; ssh: Ssh + SystemTypeOptions; capacity: WeeklyCapacityForm + OverridesTable; jira: Jira; notifications: NotificationSettingsCard) — chỉ thay đổi cách NHÓM/SẮP XẾP và tiêu đề nhóm"
    - "KHÔNG đổi storage key, field name, default value, validation, luồng đọc/ghi hay logic hành vi: mọi prop truyền vào card con giữ nguyên; mọi callback (handleRestoreSuccess, handleRemotePullSuccess, handleBannerRollback, handleBannerDownload, onChange tab, ResetDbModal, ImportPreviewModal) giữ nguyên thân hàm"
    - "Diff trên production code chỉ nằm trong src/views/SettingsView.tsx và chỉ là sắp xếp lại JSX/CSS layout + thêm nhóm tiêu đề; mọi file dưới src/components/settings/**, src/services/**, src/db.*, src/types/** và package.json/src-tauri/Cargo.toml đều KHÔNG đổi"
    - "Tất cả test có sẵn trong tests/views/SettingsView.test.tsx vẫn pass nguyên vẹn; focused test mới kiểm tra việc nhóm không làm mất/khop sai card và không làm đổi tab mặc định"
  artifacts:
    - .planning/quick/261117-tpk-t-ch-c-l-i-m-n-h-nh-settings-taskmate-th/261117-tpk-settings-audit.md
    - src/views/SettingsView.tsx
    - tests/views/SettingsView.test.tsx
  key_links:
    - "src/views/SettingsView.tsx là file COMPOSE chứa mảng items (dòng 135-261) với 6 tab; toàn bộ storage key/default/validation/read-write nằm trong card con ở src/components/settings/** và src/services/** — vì vậy tổ chức lại giao diện chỉ cần đụng đúng file compose này"
    - "Giữ nguyên import danh sách card và từng lời gọi <XxxCard db={db} .../> — chỉ bọc nhóm bằng Card/Typography/Divider thuần antd (vốn đã được import sẵn: Button, Tabs, Space, Card, Modal, Typography) và có thể bổ sung icon có sẵn từ @ant-design/icons; không thêm dependency mới"
    - "Nhóm tiêu đề phải tránh trùng chuỗi với text mà test hiện tại truy vấn bằng getByText/getByLabelText/getByRole (ví dụ 'Sao lưu dữ liệu', 'Khu vực nguy hiểm (Danger Zone)', 'Mẫu công suất cơ bản hàng tuần', 'Cài đặt thông báo & cảnh báo') để không làm fail test do trùng khớp text"
    - "Verified tại planning time: git diff --name-only HEAD -- src/ và -- tests/ đều rỗng (HEAD bccd832f) → gate diff-scope có baseline sạch; 'npx vitest run tests/views/SettingsView.test.tsx' pass 5/5 (~35s); 'npx tsc --noEmit' exit 0"
---

<objective>
Tổ chức lại màn hình Settings của TaskMate thành các nhóm chức năng rõ ràng (section có tiêu đề + nhóm card liên quan, sắp xếp lại thứ tự cho hợp lý, label dễ hiểu) mà KHÔNG thay đổi bất kỳ cấu hình, storage key, field name, default value, validation, luồng đọc/ghi hay logic hành vi nào.

Purpose: người dùng hiện thấy danh sách card dài, phẳng trong 2 tab `data` (9 mục) và `ai` (8 mục) — khó quét và dễ nhầm giữa "cấu hình" và "đồng bộ". Việc nhóm lại bằng tiêu đề section thuần UI giúp định hướng mà vẫn giữ y nguyên mọi giá trị và hành vi đã lưu.

Output: `src/views/SettingsView.tsx` được tổ chức lại (UI-only), 1 file audit chứng minh diff chỉ là sắp xếp, và test bổ sung khóa chặt "không mất card / không đổi tab / không đổi prop".

OWNER HARD CONSTRAINT (từ coordinator, ưu tiên cao nhất): CHỈ tổ chức lại giao diện (nhóm/sắp xếp section, label rõ ràng). TUYỆT ĐỐI không đổi storage key, field name, default value, validation, luồng đọc/ghi hay logic hành vi. Acceptance criteria PHẢI kiểm tra điều này bằng diff only UI arrangement. Nếu phát sinh ý định đổi cấu hình/logic, Task 3 (gate kiểm toán cuối) sẽ đỏ — dừng lại và báo orchestrator/owner, KHÔNG tự áp dụng.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@src/views/SettingsView.tsx
@tests/views/SettingsView.test.tsx
@src/components/settings/BackupExportCard.tsx
</context>

<read_first>
- `src/views/SettingsView.tsx` dòng 1-320 (đọc 1 lần, toàn file) — cấu trúc `items` (135-261): 6 tab `capacity`/`data`/`jira`/`notifications`/`ai`/`ssh`, mỗi tab là `<Space direction="vertical">` chứa các card con; state `activeTab` (60), các handler (74-133), `PageHeader` (265-279), `<Tabs activeKey/onChange>` (281-285), `ResetDbModal` (287-290), `ImportPreviewModal` (292-317). Đây là file DUY NHẤT được phép sửa production.
- `tests/views/SettingsView.test.tsx` dòng 1-228 — 5 test có sẵn; các chuỗi được truy vấn trực tiếp: 'Sao lưu dữ liệu' (59), 'Nhập & Khôi phục dữ liệu' (60), 'Bản sao an toàn trước khi nhập (Pre-Import Snapshot)' (62), 'Cấu hình kho lưu trữ GitHub' (66), 'Đồng bộ sao lưu GitHub' (67), 'Khu vực nguy hiểm (Danger Zone)' (70), 'Cấu hình tích hợp Jira Cloud' (80), 'Chưa có token' (94), 'Mẫu công suất cơ bản hàng tuần' (100), 'Ngoại lệ theo ngày cụ thể' (101), tab name /Công suất làm việc/, 'Xem trước & Xác nhận Khôi phục' (172), 'Cài đặt thông báo & cảnh báo' (225). Tiêu đề nhóm MỚI phải khác các chuỗi này.
- `src/components/settings/` — các file card con. CHỈ ĐỌC để biết tên/tiêu đề; KHÔNG sửa. Tiêu đề card đã xác nhận: BackupExportCard 'Sao lưu dữ liệu'; LocalSqlitePersistenceCard 'Lưu cục bộ SQLite cho desktop'; GlobalConventionsCard 'Quy ước tổ chức (Global Conventions)'; McpConfigCard 'Cấu hình Máy chủ MCP (Model Context Protocol)'; OracleAiToolConfigCard 'Cấu hình Oracle SQLcl (AI Tool Loop)'; SshFsAiToolConfigCard 'Cấu hình SSH File System (AI Tool Loop)'; GhostDevConfigCard 'Ghost Dev Agent Configuration'; NineRouterConfigCard 'Cấu hình Trợ lý AI (9router API)'; BudgetWarnThresholdCard 'Ngưỡng cảnh báo ngân sách token'; KnowledgeServerConfigCard 'Knowledge Server'; SystemTypeOptionsCard 'Loại hệ thống'. Dùng các nhãn có sẵn này làm căn cứ đặt tên nhóm cho khớp ngữ cảnh.
- Baseline đã verify tại planning time (2026-11-17): `git diff --name-only HEAD -- src/` rỗng, `git diff --name-only HEAD -- tests/` rỗng, HEAD = bccd832f.

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Kiểm toán trước khi sửa — khóa danh sách card, prop, storage key và baseline diff</name>
  <files>.planning/quick/261117-tpk-t-ch-c-l-i-m-n-h-nh-settings-taskmate-th/261117-tpk-settings-audit.md</files>
  <action>
    Tạo file audit (append-only artifact, không phải báo cáo gửi orchestrator) ghi lại TRƯỚC khi đụng code:
    Step 1 — liệt kê nguyên vẹn 6 tab của `items` trong `src/views/SettingsView.tsx` với key, label text, icon, và thứ tự card con trong từng tab, kèm prop chính xác truyền vào mỗi card (`db={db}`, `onRestoreSuccess={handleRestoreSuccess}`, `onPullSuccess={handleRemotePullSuccess}`). Đây là "danh sách cam kết" để Task 2 phải khớp 100%.
    Step 2 — lưu kết quả `git diff --name-only HEAD -- src/`, `git diff --name-only HEAD -- tests/`, `git rev-parse --short HEAD`, `npx tsc --noEmit` và `npx vitest run tests/views/SettingsView.test.tsx --reporter=dot` (đã biết: rỗng/rỗng/bccd832f/exit 0/5 passed). Ghi rõ baseline sạch để gate diff có ý nghĩa.
    Step 3 — ghi danh sách chuỗi bị test khóa (xem `<read_first>`) làm "vùng cấm trùng text" cho tiêu đề nhóm mới.
    Step 4 — ghi rõ ranh giới: file được phép sửa DUY NHẤT là `src/views/SettingsView.tsx`; mọi path `src/components/settings/**`, `src/services/**`, `src/db.*`, `src/types/**`, `package.json`, `src-tauri/Cargo.toml` là KHÔNG ĐỤNG. Không chạy audit tự động trên cả repo; chỉ các lệnh trên.
    Không viết code production ở task này. Không dùng heredoc để tạo file — dùng Write tool.
  </action>
  <verify>
    <automated>test -f .planning/quick/261117-tpk-t-ch-c-l-i-m-n-h-nh-settings-taskmate-th/261117-tpk-settings-audit.md && grep -q 'capacity' .planning/quick/261117-tpk-t-ch-c-l-i-m-n-h-nh-settings-taskmate-th/261117-tpk-settings-audit.md && grep -q 'bccd832f' .planning/quick/261117-tpk-t-ch-c-l-i-m-n-h-nh-settings-taskmate-th/261117-tpk-settings-audit.md</automated>
  </verify>
  <done>File audit tồn tại, chứa đủ 6 tab + danh sách card/prop + baseline sạch (HEAD bccd832f, diff src/tests rỗng, tsc exit 0, 5 test pass) + vùng cấm trùng text + ranh giới file được phép sửa.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2 (required): Tổ chức SettingsView thành nhóm chức năng rõ ràng — UI arrangement ONLY, zero config/behavior change</name>
  <files>src/views/SettingsView.tsx, tests/views/SettingsView.test.tsx</files>
  <action>
    Chỉnh sửa `src/views/SettingsView.tsx` — HÀNH VI GIỮ NGUYÊN, CHỈ ĐỔI CÁCH TRÌNH BÀY:
    Step 1 — Giữ nguyên toàn bộ phần LOGIC: imports, interface `SettingsViewProps`, kiểu union của `activeTab` và `defaultActiveTab`, mọi `useState`, `React.useEffect`, các handler `handleRestoreSuccess`/`handleRemotePullSuccess`/`handleBannerRollback`/`handleBannerDownload`, `PageHeader`, `<Tabs activeKey={activeTab} onChange={...}>`, `ResetDbModal`, `ImportPreviewModal` (kể cả `db.settings.put({ key: 'last_synced_sha', ...})` và `'last_synced_at'`). KHÔNG đổi một dòng logic nào trong các khu vực này — kể cả việc "dọn dẹp" hay đổi tên biến.
    Step 2 — Trong mảng `items`, giữ nguyên 6 key/label/icon/thứ tự tab. Nhóm các card phẳng thành các section có tiêu đề bằng `Card`/`Divider`/`Typography` (ant design có sẵn) + icon có sẵn từ `@ant-design/icons`, gợi ý (có thể tinh chỉnh nhãn nhưng KHÔNG dùng chuỗi nằm trong "vùng cấm trùng text" ở file audit):
      - tab `data`: nhóm "Sao lưu & khôi phục" (BackupExportCard, BackupImportCard, SnapshotRollbackCard), "Đồng bộ GitHub" (GitHubConfigCard, GitHubSyncCard), "Lưu trữ & môi trường" (LocalSqlitePersistenceCard, PwaStatusCard, StoragePersistenceCard), và giữ `PostRestoreBanner` + Danger Zone Card nguyên vị trí/data-testid. KHÔNG đổi prop `onRestoreSuccess`/`onPullSuccess` hay thứ tự render của banner so với các card (banner phải render trước để hành vi restore/rollback y hệt).
      - tab `ai`: nhóm "Quy ước & công cụ AI" (GlobalConventionsCard, McpConfigCard, OracleAiToolConfigCard, SshFsAiToolConfigCard), "Trợ lý & Ghost Dev" (GhostDevConfigCard, NineRouterConfigCard), "Ngân sách & Knowledge" (BudgetWarnThresholdCard, KnowledgeServerConfigCard).
      - tab `ssh`: nhóm "Kết nối SSH" (SshConfigCard) và "Phân loại hệ thống" (SystemTypeOptionsCard).
      - tab `capacity`, `jira`, `notifications`: giữ card nguyên vẹn; nếu thêm tiêu đề nhóm thì chỉ thêm text mới, không đổi prop/component.
    Step 3 — MỌI lời gọi card con giữ NGUYÊN prop: `<WeeklyCapacityForm db={db}/>`, `<OverridesTable db={db}/>`, `<BackupExportCard db={db}/>`, `<BackupImportCard db={db} onRestoreSuccess={handleRestoreSuccess}/>`, `<GitHubSyncCard db={db} onPullSuccess={handleRemotePullSuccess}/>`... Chỉ được THÊM wrapper (Card/Divider/Space/Typography) quanh chúng, KHÔNG đổi/sửa/xóa prop, KHÔNG đổi storage key hay default value (các giá trị đó nằm trong card con — không đụng).
    Step 4 — Bổ sung vào `tests/views/SettingsView.test.tsx` (THÊM `it(...)` mới, KHÔNG sửa 5 test có sẵn): một test render từng tab và assert mọi card con vẫn mount (dùng text/title đã có từ file audit) + số lượng card đúng + `defaultActiveTab` vẫn là 'capacity' + tab labels đúng 6 + prop callbacks vẫn truyền (assert bằng hành vi có sẵn, ví dụ tab data vẫn hiện 'Chưa có token' và nút xuất bản sao lưu enable). Mục đích: nếuTask 2 lỡ xóa/nhầm card hoặc đổi tab thì test đỏ.
    Step 5 — Chạyverify trong thẻ `<verify>`; fix cho đến khi xanh. TUYỆT ĐỐI không chạm file cấu hình/storage/service.

    ĐIỀU CẤM (nếu phát sinh nhu cầu → Task 3 gate sẽ đỏ, dừng và báo owner, không tự làm): đổi key bất kỳ trong `db.settings.put/get`, đổi field name/default/validation trong `src/components/settings/**` hay `src/services/**`, đổi `CURRENT_SCHEMA_VERSION`, đổi package.json/Cargo.toml, thêm dependency, đổi luồng đọc/ghi hoặc logic restore/rollback/sync. Đây là màn hình tổ chức giao diện, không phải task cấu hình.
  </action>
  <verify>
    <automated>set -o pipefail; npx vitest run tests/views/SettingsView.test.tsx --reporter=dot 2>&1 | tail -8 && npx tsc --noEmit && echo TSC_OK && echo '=== diff scope (src + tests) ===' && git diff --name-only HEAD -- src/ tests/ && echo '=== forbidden-file diff (must be empty) ===' && git diff --name-only HEAD -- src/components/settings/ src/services/ src/db.ts src/types/ package.json src-tauri/Cargo.toml && echo '=== changed lines in SettingsView (deletions should be layout-only reorder) ===' && git diff --numstat -- src/views/SettingsView.tsx</automated>
  </verify>
  <done>6 tab giữ nguyên key/label/icon/thứ tự; mọi card render đúng tab và prop; mọi handler/state logic byte-identical so với HEAD; diff scope chỉ `src/views/SettingsView.tsx` + `tests/views/SettingsView.test.tsx` (+ file audit); không có thay đổi nào ở `src/components/settings/**`, `src/services/**`, `src/db.*`, `src/types/**`, `package.json`, `src-tauri/Cargo.toml`; `npx vitest run tests/views/SettingsView.test.tsx` pass (≥5 test) và `npx tsc --noEmit` exit 0.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Kiểm toán cuối — khóa chặt diff chỉ là UI arrangement (config/behavior gate)</name>
  <files>.planning/quick/261117-tpk-t-ch-c-l-i-m-n-h-nh-settings-taskmate-th/261117-tpk-settings-audit.md</files>
  <action>
    Sau khi Task 2 xanh, chạy gate trong `<verify>`. Nó FAIL (exit khác 0) nếu bất kỳ file config/service/storage/type/dependency nào đổi, hoặc nếu bất kỳ dòng bị xóa/thêm trong `src/views/SettingsView.tsx` chạm vào identifier logic (`db.settings.get`, `db.settings.put`, `setActiveTab`, `setResetModalOpen`, `setRemote`, `Modal.confirm`, `onOk`, `announceToScreenReader`, `rollbackToSnapshot`, `downloadSnapshotFile`). Nếu gate FAIL: DỪNG, ghi chi tiết vi phạm vào file audit dưới mục "VI PHẠM — cần owner quyết" và KHÔNG tự sửa logic — báo orchestrator. Nếu gate PASS: append vào file audit một dòng "Đã kiểm tra: diff only UI arrangement, zero config/behavior change" kèm số test pass và kết quả tsc.
    Đây chính là acceptance criteria mà owner nhấn mạnh: bằng chứng cơ khí rằng diff CHỈ là sắp xếp giao diện, không đụng cấu hình hay hành vi.
  </action>
  <verify>
    <automated>AUDIT=.planning/quick/261117-tpk-t-ch-c-l-i-m-n-h-nh-settings-taskmate-th/261117-tpk-settings-audit.md; git rev-parse --verify HEAD >/dev/null || exit 1; FORBIDDEN=$(git diff --name-only HEAD -- src/components/settings/ src/services/ src/db.ts src/types/ package.json src-tauri/Cargo.toml) || exit 1; if [ -n "$FORBIDDEN" ]; then echo "GATE FAIL forbidden files changed:"; echo "$FORBIDDEN"; exit 1; fi; VIEW_DIFF=$(git diff -U0 HEAD -- src/views/SettingsView.tsx) || exit 1; LOGIC=$(printf '%s\n' "$VIEW_DIFF" | grep '^[+-]' | grep -vE '^(---|\+\+\+)' | grep -E 'db\.settings\.(get|put)|setActiveTab|setResetModalOpen|setRemote|Modal\.confirm|onOk|announceToScreenReader|rollbackToSnapshot|downloadSnapshotFile' || true); if [ -n "$LOGIC" ]; then echo "GATE FAIL logic line touched:"; echo "$LOGIC"; exit 1; fi; printf '%s\n' 'Đã kiểm tra: diff only UI arrangement, zero config/behavior change' >> "$AUDIT"; grep -q 'diff only UI arrangement, zero config/behavior change' "$AUDIT"</automated>
  </verify>
  <done>Gate chạy xanh: không file config/service/storage/type/dependency nào đổi, không dòng logic nào trong SettingsView bị đụng, và file audit có dòng xác nhận "diff only UI arrangement, zero config/behavior change" kèm kết quả test/tsc. Nếu có vi phạm, gate đỏ và dừng có ghi chú cho owner.</done>
</task>

</tasks>

<threat_model>
| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-quick-01 | Tampering / data integrity | Việc bọc nhóm UI vô tình đổi prop `db`/callback hoặc thứ tự render của `PostRestoreBanner`, `ResetDbModal`, `ImportPreviewModal` | high | mitigate | Task 1 khóa danh sách card+prop làm baseline; Task 2 chỉ THÊM wrapper quanh card, giữ nguyên prop/component; test mới assert mọi card mount đúng tab; focused test có sẵn (restore/sync/banner) vẫn pass |
| T-quick-02 | Configuration drift | Đổi nhầm storage key (`last_synced_sha`, `last_synced_at`, `github_owner`, ...), field name, default value hoặc validation trong lúc "dọn" code | high | mitigate | Ranh giới file: chỉ `src/views/SettingsView.tsx`; gate `git diff --name-only HEAD -- src/components/settings/ src/services/ src/db.ts src/types/ package.json src-tauri/Cargo.toml` phải RỖNG; Task 3 gate dừng lại nếu phát sinh ý định đổi config |
| T-quick-03 | Information disclosure | Tiêu đề nhóm mới trùng/kéo theo text nhạy cảm hoặc làm lệch aria-label | low | mitigate | Dùng nhãn gợi ý đã có trong UI; tránh chuỗi trong "vùng cấm trùng text"; không đổi aria-label/role của nút hiện có; test `getByRole`/`getByLabelText` có sẵn vẫn pass |
| T-quick-SC | Tampering | npm/cargo installs | high | mitigate | Không thêm dependency — dùng lại `antd` `Card`/`Divider`/`Typography`/`Space` và icon `@ant-design/icons` có sẵn; `git diff -- package.json src-tauri/Cargo.toml` phải rỗng |
</threat_model>

<verification>
- `npx vitest run tests/views/SettingsView.test.tsx --reporter=dot` — 5 test có sẵn + test mới về nhóm card/tab, all pass (~35s). Không chạy full suite (quy tắc dự án: >1 tiếng).
- `npx tsc --noEmit` — exit 0 (strict / noUncheckedIndexedAccess / exactOptionalPropertyTypes). Cả hai lệnh đã verify sạch ở baseline HEAD bccd832f trước khi sửa.
- `git diff --name-only HEAD -- src/ tests/` — CHỈ chứa `src/views/SettingsView.tsx` và `tests/views/SettingsView.test.tsx` (cộng file audit nằm ngoài src/tests).
- `git diff --name-only HEAD -- src/components/settings/ src/services/ src/db.ts src/types/ package.json src-tauri/Cargo.toml` — RỖNG. Đây là bằng chứng "không đổi storage key / field / default / validation / read-write / dependency".
- `git diff -- src/views/SettingsView.tsx` — phần bị xóa/chèn lại (`-`) chỉ là thứ tự JSX và text nhóm; KHÔNG có dòng nào chứa `db.settings.get/put`, `setActiveTab`, `setResetModalOpen`, `setRemote*`, `Modal.confirm`, `onOk`, or `announceToScreenReader` bị đổi. Nếu có → checkpoint chặn.
- File audit có dòng "diff only UI arrangement, zero config/behavior change".
</verification>

<success_criteria>
- Màn hình Settings có nhóm/section rõ ràng hơn (tiêu đề nhóm + card liên quan được gom lại) ở các tab từng phẳng (`data`, `ai`, `ssh`), trong khi `capacity`/`jira`/`notifications` giữ nguyên nội dung.
- Diff trên production là UI arrangement thuần túy: `src/views/SettingsView.tsx` thay đổi layout/JSX, mọi file cấu hình/service/storage/types/dependency giữ y hệt HEAD.
- Mọi test SettingsView có sẵn pass và test mới khóa được số card/tab; `npx tsc --noEmit` sạch.
- Có dòng xác nhận trong file audit rằng diff chỉ là sắp xếp giao diện, zero config/behavior change — đúng yêu cầu nhấn mạnh của owner.
</success_criteria>

<output>
Create `.planning/quick/261117-tpk-t-ch-c-l-i-m-n-h-nh-settings-taskmate-th/261117-tpk-SUMMARY.md` when done
</output>
