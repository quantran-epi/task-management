# Quick 261117-tpk — SettingsView UI arrangement audit

Append-only artifact. Records the pre-change commitment (Task 1) and the post-change
mechanistic gate result (Task 3). Not a report sent to the orchestrator.

## Task 1 — Baseline trước khi đụng code

Recorded 2026-11-17, before any production edit.

| Check | Result |
|-------|--------|
| `git rev-parse --short HEAD` | `bccd832f` |
| Branch / worktree | `feature/intellij-workbench`, isolated worktree `task-management-intellij` |
| `git diff --name-only HEAD -- src/` | (empty) |
| `git diff --name-only HEAD -- tests/` | (empty) |
| `npx tsc --noEmit` | exit 0 (`TSC_OK`) |
| `npx vitest run tests/views/SettingsView.test.tsx --reporter=dot` | 1 file passed, 5 tests passed, ~36s |

Baseline sạch — gate diff ở Task 2/3 có ý nghĩa so sánh.

## Task 1 — Danh sách cam kết: 6 tab, key / label / icon / card order / props

Nguồn: `src/views/SettingsView.tsx` dòng 135–261 (`items`), đọc trọn file 1 lần.
Thứ tự tab dưới đây là thứ tự render trong mảng `items` và PHẢI giữ nguyên.

### Tab 1 — key `capacity`
- label JSX: `<ScheduleOutlined style={{ marginRight: 8 }} /> Công suất làm việc`
- icon: `ScheduleOutlined`; text: `Công suất làm việc`
- card order (trong `<Space direction="vertical" style={{ width: '100%' }} size="middle">`):
  1. `<WeeklyCapacityForm db={db} />`
  2. `<OverridesTable db={db} />`

### Tab 2 — key `data`
- label JSX: `<DatabaseOutlined style={{ marginRight: 8 }} /> Sao lưu & Dữ liệu`
- icon: `DatabaseOutlined`; text: `Sao lưu & Dữ liệu`
- card order:
  0. `{showPostRestoreBanner && <PostRestoreBanner onRollback={handleBannerRollback} onDownloadSnapshot={handleBannerDownload} onClose={() => setShowPostRestoreBanner(false)} />}` — PHẢI render TRƯỚC các card; không đổi prop/thứ tự.
  1. `<BackupExportCard db={db} />`
  2. `<BackupImportCard db={db} onRestoreSuccess={handleRestoreSuccess} />`
  3. `<SnapshotRollbackCard db={db} />`
  4. `<GitHubConfigCard db={db} />`
  5. `<GitHubSyncCard db={db} onPullSuccess={handleRemotePullSuccess} />`
  6. `<LocalSqlitePersistenceCard db={db} />`
  7. `<PwaStatusCard />`
  8. `<StoragePersistenceCard />`
  9. Danger Zone `<Card title={<span style={{ color: '#ff4d4f' }}><WarningOutlined style={{ marginRight: 8 }} /> Khu vực nguy hiểm (Danger Zone)</span>}>` — chứa `<Paragraph type="secondary">…</Paragraph>` và `<Button danger onClick={() => setResetModalOpen(true)}>Đặt lại toàn bộ cơ sở dữ liệu</Button>`. Giữ nguyên title/ndung/data-testid (không có testid cũ).

Prop cam kết: `db={db}` mọi card nhận db; `onRestoreSuccess={handleRestoreSuccess}` chỉ trên BackupImportCard; `onPullSuccess={handleRemotePullSuccess}` chỉ trên GitHubSyncCard.

### Tab 3 — key `jira`
- label JSX: `<CloudSyncOutlined style={{ marginRight: 8 }} /> Tích hợp Jira`
- icon: `CloudSyncOutlined`; text: `Tích hợp Jira`
- card order:
  1. `<JiraConfigCard db={db} />`

### Tab 4 — key `notifications`
- label JSX: `<BellOutlined style={{ marginRight: 8 }} /> Thông báo`
- icon: `BellOutlined`; text: `Thông báo`
- card order:
  1. `<NotificationSettingsCard db={db} />`

### Tab 5 — key `ai`
- label JSX: `<RobotOutlined style={{ marginRight: 8 }} /> Trợ lý AI & Ghost Dev`
- icon: `RobotOutlined`; text: `Trợ lý AI & Ghost Dev`
- card order:
  1. `<GlobalConventionsCard db={db} />`
  2. `<McpConfigCard db={db} />`
  3. `<OracleAiToolConfigCard db={db} />`
  4. `<SshFsAiToolConfigCard db={db} />`
  5. `<GhostDevConfigCard />`
  6. `<NineRouterConfigCard db={db} />`
  7. `<BudgetWarnThresholdCard db={db} />`
  8. `<KnowledgeServerConfigCard />`

### Tab 6 — key `ssh`
- label JSX: `<CloudServerOutlined style={{ marginRight: 8 }} /> Remote SSH`
- icon: `CloudServerOutlined`; text: `Remote SSH`
- card order:
  1. `<SshConfigCard db={db} />`
  2. `<SystemTypeOptionsCard db={db} />`

### Logic phải giữ byte-identical (không đụng, kể cả "dọn dẹp"/đổi tên biến)
imports/interface `SettingsViewProps` · union type của `activeTab`/`defaultActiveTab` ·
`useState` (activeTab, resetModalOpen, showPostRestoreBanner, remotePayload, remoteSha,
remoteExportedAt, remotePreviewOpen) · `React.useEffect` · `handleRestoreSuccess` ·
`handleRemotePullSuccess` · `handleBannerRollback` (`Modal.confirm` + `onOk` +
`rollbackToSnapshot` + `announceToScreenReader` + notification) · `handleBannerDownload`
(`db.settings.get('last_pre_import_snapshot')` + `downloadSnapshotFile`) · `PageHeader` ·
`<Tabs activeKey={activeTab} onChange={...} items={items} />` · `ResetDbModal` ·
`ImportPreviewModal` (kể cả `db.settings.put({ key: 'last_synced_sha' | 'last_synced_at', … })`).

## Task 1 — Vùng cấm trùng text (tiêu đề nhóm mới KHÔNG được trùng các chuỗi này)

Test hiện tại truy vấn trực tiếp bằng `getByText` / `getByLabelText` / `getByRole`:

- `Sao lưu dữ liệu`
- `Nhập & Khôi phục dữ liệu`
- `Bản sao an toàn trước khi nhập (Pre-Import Snapshot)`
- `Cấu hình kho lưu trữ GitHub`
- `Đồng bộ sao lưu GitHub`
- `Khu vực nguy hiểm (Danger Zone)`
- `Cấu hình tích hợp Jira Cloud`
- `Chưa có token`
- `Mẫu công suất cơ bản hàng tuần`
- `Ngoại lệ theo ngày cụ thể`
- `Xem trước & Xác nhận Khôi phục`
- `Cài đặt thông báo & cảnh báo`
- tab name `/Công suất làm việc/`

Card title khác dùng làm anchor cho test mới (cũng tránh trùng exact): `Lưu cục bộ SQLite
cho desktop`, `Trạng thái PWA & Ngoại tuyến`, `Dung lượng lưu trữ & Tính bền vững`,
`Quy ước tổ chức (Global Conventions)`, `Cấu hình Máy chủ MCP (Model Context Protocol)`,
`Cấu hình Oracle SQLcl (AI Tool Loop)`, `Cấu hình SSH File System (AI Tool Loop)`,
`Ghost Dev Agent Configuration`, `Cấu hình Trợ lý AI (9router API)`,
`Ngưỡng cảnh báo ngân sách token`, `Knowledge Server`, `Cấu hình Remote SSH / Workspace`,
`Loại hệ thống`.

Lưu ý: `Knowledge Server` xuất hiện 15 lần và `Loại hệ thống` 3 lần trong file card tương ứng
→ test mới dùng `queryAllByText(...)` (không `getByText`) cho 2 chuỗi này.
Tiêu đề nhóm chọn: `Sao lưu & khôi phục`, `Đồng bộ GitHub`, `Lưu trữ & môi trường`,
`Quy ước & công cụ AI`, `Trợ lý & Ghost Dev`, `Ngân sách & Knowledge`, `Kết nối SSH`,
`Phân loại hệ thống` — đều KHÔNG trùng exact với chuỗi ở trên.

## Task 1 — Ranh giới file

- ĐƯỢC SỬA: `src/views/SettingsView.tsx` (production, UI arrangement), `tests/views/SettingsView.test.tsx` (thêm test), và file audit này (artifact).
- KHÔNG ĐỤNG: `src/components/settings/**`, `src/services/**`, `src/db.*`, `src/types/**`, `package.json`, `src-tauri/Cargo.toml`. Không thêm dependency. Không chạy audit tự động toàn repo.

## Ghi chú từ coordinator (SQLcl password có dấu @)

User cần dùng cú pháp `user/"pass@word"@host:port/service` khi password Oracle có dấu `@`.
Đã verify SQLcl parse đúng cú pháp này; `\@` KHÔNG hoạt động. **CHỈ ghi chú tại đây** —
KHÔNG sửa `src/components/settings/OracleAiToolConfigCard.tsx` (nằm trong vùng cấm của plan)
và không sửa code ngoài phạm vi `src/views/SettingsView.tsx` / test đã khai báo.
Đã kiểm tra: diff only UI arrangement, zero config/behavior change (9/9 focused tests pass, tsc exit 0)
