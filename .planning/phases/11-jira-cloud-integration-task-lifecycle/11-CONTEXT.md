# Phase 11: Jira Cloud Integration & Task Lifecycle - Context

**Gathered:** 2026-09-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Connect the offline-first task planner to Jira Cloud via Jira REST API v3 to enable issue creation, key linking, and status transitions directly from task details. Delivers a dedicated Jira Cloud Settings tab with CORS proxy support and connection diagnostics, ADF (Atlassian Document Format) v3 issue generation modal, manual issue key linking/unlinking, transition execution with smart status mapping to local tasks, Jira Key badge display across TaskTable and PlannerView, and Jira Key inclusion in Markdown standup exports.

</domain>

<decisions>
## Implementation Decisions

### Xác thực & Cấu hình Jira (Settings & Credentials)
- **D-01:** Lưu trữ thông tin kết nối Jira (Domain `xxx.atlassian.net`, Email, API Token, CORS Proxy URL tùy chọn, Default Project Key, Default Issue Type) trực tiếp trong IndexedDB `db.settings`. Đảm bảo trải nghiệm offline-first cá nhân, không phải nhập lại token mỗi khi F5 hoặc mở lại trình duyệt.
- **D-02:** Bổ sung tab thứ 3 "Tích hợp Jira" (`jira`) trong `SettingsView` (bên cạnh "Công suất làm việc" và "Sao lưu & Dữ liệu"), cung cấp form cấu hình rõ ràng, tách bạch với phần sao lưu và công suất.
- **D-03:** Hỗ trợ cấu hình CORS Proxy URL tùy chọn (VD: Cloudflare Worker, cors-anywhere). Nút "Kiểm tra kết nối" gửi request chẩn đoán đến `GET /rest/api/3/myself` và phản hồi trạng thái chi tiết: Đang kết nối -> Bị chặn CORS (gợi ý điền CORS Proxy) -> Lỗi xác thực 401/403 -> Kết nối thành công (hiển thị tên người dùng và email Jira).
- **D-04:** Cho phép lưu sẵn Default Project Key (VD: `SHB`) và Default Issue Type (VD: `Task`) trong Settings để tăng tốc tạo issue từ task chỉ trong 1-click.

### Tạo & Liên kết Issue trong TaskDrawer (Issue Creation & Linking)
- **D-05:** Bổ sung Section "Tích hợp Jira" riêng biệt trong `TaskDrawer`:
  - Khi chưa liên kết: Hiển thị nút "Tạo Jira Issue mới" và form "Gắn Jira Key có sẵn".
  - Khi đã liên kết: Hiển thị badge Jira Key (bấm mở tab mới đến Jira web), trạng thái hiện tại, khu vực chuyển workflow transition, và nút "Hủy liên kết" (Unlink).
- **D-06:** Luồng tạo Jira Issue mới: Bấm "Tạo Jira Issue" sẽ mở một Modal nhỏ (`CreateJiraIssueModal`) điền sẵn Summary (từ `task.name`), Description (từ `task.description`), Project Key & Issue Type (từ Default Settings). Người dùng có thể chỉnh sửa nhanh trước khi gửi `POST /rest/api/3/issue`. Sau khi tạo thành công, tự động gắn `jiraKey` mới vào task.
- **D-07:** Định dạng Atlassian Document Format (ADF): Xây dựng bộ chuyển đổi tối giản (minimal ADF converter) tự động chuyển đổi `task.description` (chuỗi văn bản/xuống dòng) thành tài liệu ADF v3 hợp lệ (`type: 'doc', version: 1, content: [...]`) với các node paragraph chuẩn, không cần phụ thuộc thư viện bên ngoài nặng nề.
- **D-08:** Liên kết thủ công & Hủy liên kết: Ô nhập Jira Key có kiểm tra regex `^[A-Z][A-Z0-9]+-[0-9]+$`. Cho phép bấm "Hủy liên kết" để gỡ `jiraKey` khỏi task nội bộ (không xóa issue trên Jira). Badge Jira Key render kèm icon link ngoài, click vào mở trực tiếp `https://{domain}.atlassian.net/browse/{jiraKey}` trong tab mới (`target="_blank" rel="noopener noreferrer"`).

### Workflow Transition & Đồng bộ Trạng thái (Lifecycle & Status Mapping)
- **D-09:** Giao diện Transition: Khi task đã gắn Jira Key, `TaskDrawer` tự động truy vấn các transition hợp lệ từ `GET /rest/api/3/issue/{jiraKey}/transitions`, hiển thị dạng Dropdown Select kèm nút "Thực hiện chuyển trạng thái".
- **D-10:** Đồng bộ trạng thái thông minh (Smart Status Mapping): Khi chuyển trạng thái Jira thành công (`POST /rest/api/3/issue/{jiraKey}/transitions`), hệ thống tự động cập nhật `task.status` cục bộ theo bảng quy tắc:
  - Jira status category 'To Do' hoặc tên chứa `to do`, `open`, `backlog` -> `Open`
  - Jira status category 'In Progress' hoặc tên chứa `in progress`, `developing`, `doing` -> `In Progress`
  - Jira status tên chứa `review`, `pr`, `peer review` -> `In Review`
  - Jira status tên chứa `test`, `qa`, `uat`, `resolved`, `verify` -> `Resolved`
  - Jira status category 'Done' hoặc tên chứa `done`, `closed`, `complete` -> `Done`
  - Jira status tên chứa `cancel`, `reject`, `won't do` -> `Cancelled`
  - Fallback an toàn: Nếu trạng thái Jira không khớp quy tắc nào thì giữ nguyên trạng thái Task nội bộ hiện tại.
- **D-11:** Làm mới & Xử lý lỗi: Tự động fetch trạng thái và transitions khi mở `TaskDrawer` (có nút refresh thủ công). Nếu transition thất bại (do workflow Jira bắt buộc nhập Resolution/Screen), hiển thị Ant Design Alert với lỗi chi tiết và nút "Mở trên Jira Web" để người dùng thao tác trực tiếp trên Jira.

### Hiển thị Bảng, Bộ lọc & Báo cáo Standup (UI & Standup Integration)
- **D-12:** Hiển thị trên TaskTable: Render Jira Key dưới dạng một Ant Design `Tag` màu xanh dương kèm `<LinkOutlined />` ngay trong cột "Tên tác vụ". Click vào Tag mở tab Jira web mới và kích hoạt `e.stopPropagation()` để không làm mở TaskDrawer.
- **D-13:** Tìm kiếm & Bộ lọc nâng cao:
  - Ô tìm kiếm từ khóa hiện tại (`searchQuery`) tự động tìm kiếm trên cả trường `jiraKey` (gõ "SHB-123" tìm được ngay).
  - Thêm tùy chọn lọc "Trạng thái Jira" (`all` | `linked` | `unlinked`) trong bảng Bộ lọc nâng cao của `TaskFilterBar`.
- **D-14:** Định dạng xuất Standup (Phase 10): Cập nhật hàm `formatStandupSummary` bổ sung `[JiraKey]` ngay sau `[WorkType]` nếu task có gắn Jira:
  `- [Lập trình][SHB-1234] Tên Task (Dự án: ProjectName | Hạn: YYYY-MM-DD | Phụ trách: Ops / BA)`
- **D-15:** Hiển thị trên thẻ tuần PlannerView: Thêm micro-badge Jira Key trên `TaskAllocationCard` trên lưới lịch `/planner` để dễ đối chiếu khi theo dõi kế hoạch ngày.

### Claude's Discretion
- Chi tiết layout, flex wrap, và loading spinner cho các thao tác mạng với Jira REST API.
- Cấu hình timeout mặc định (10 giây) và cơ chế che giấu token (redaction) trong error message phòng ngừa lộ token trong log hoặc UI.
- Thêm trường `jiraKey?: string` vào model `Task` và cập nhật Dexie schema v3 nếu cần index tìm kiếm nhanh.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Jira Integration Requirements & Specifications
- `.planning/REQUIREMENTS.md` §Jira Cloud Integration — Requirements JIRA-01 through JIRA-05.
- `.planning/ROADMAP.md` §Phase 11 — Goals, dependencies, and success criteria for Phase 11.
- `https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/` — Jira Cloud REST API v3 documentation (Basic auth, issue creation, ADF format, transitions).

### Domain & Data Models
- `src/types/models.ts` — Task interface to be extended with `jiraKey?: string`.
- `src/db/schema.ts` — Dexie schema versioning (v1, v2, and adding v3 migration if indexing `jiraKey`).
- `src/db/index.ts` — Database migration runner and upgrade handling.

### Existing UI & Services Integration Points
- `src/views/SettingsView.tsx` — SettingsView tab definitions and settings card mounting.
- `src/components/tasks/TaskDrawer.tsx` — TaskDrawer form, layout, and sections where Jira Section will be embedded.
- `src/components/tasks/TaskTable.tsx` — TaskTable column definitions for rendering Jira Key tag with stopPropagation.
- `src/components/tasks/TaskFilterBar.tsx` — Advanced filter bar and filter state for Jira linked/unlinked option.
- `src/utils/filter.ts` — Multi-criteria task filtering logic including `searchQuery` and Jira status filtering.
- `src/utils/standup.ts` — Daily standup Markdown formatter for banking IT standup reports.
- `src/components/planner/TaskAllocationCard.tsx` — Weekly grid task allocation card.
- `src/services/github/githubApi.ts` — Reference implementation for client-side API calls, fetch wrappers, and token redaction.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/types/models.ts`: `Task` interface cleanly accommodates optional `jiraKey?: string`.
- `src/db/repositories/taskRepo.ts`: `updateTask(id, changes)` handles partial task updates for attaching/detaching `jiraKey` and status updates.
- `src/utils/filter.ts`: `matchesTaskFilter` already handles multi-criteria filtering; easily extended with Jira link status filter and key text search.
- `src/utils/standup.ts`: `formatStandupSummary` formats tasks into Markdown groups; easily updated to include `[JiraKey]`.
- Ant Design 6 components: `Card`, `Form`, `Input`, `Select`, `Button`, `Tag`, `Alert`, `Modal`, `notification` already standard across the app.

### Established Patterns
- **Local Persistence via Dexie `db.settings`**: Non-sensitive settings and API tokens are read and written using `db.settings.get(key)` / `db.settings.put({ key, value })`.
- **Token Redaction in Error Messages**: Patterns from `githubApi.ts` sanitizing error messages so tokens are never exposed in error alerts or logs.
- **FormGuard Integration**: Active form editing registration in modals and drawers using `useRegisterActiveForm` to prevent accidental data loss.
- **Accessible Screen Reader Announcements**: `announceToScreenReader` from `src/components/common/AriaLiveRegion.tsx` for asynchronous operation feedback.

### Integration Points
- `src/views/SettingsView.tsx`: Add tab `'jira'` with `JiraConfigCard` component.
- `src/components/tasks/TaskDrawer.tsx`: Mount `TaskJiraSection` inside drawer.
- `src/components/tasks/TaskTable.tsx`: Render Jira Key tag in title column.
- `src/components/planner/TaskAllocationCard.tsx`: Render compact Jira badge.
- `src/components/tasks/TaskFilterBar.tsx` & `src/utils/filter.ts`: Add `jiraFilter: 'all' | 'linked' | 'unlinked'`.
- `src/utils/standup.ts`: Add `jiraKey` to standup markdown item format.

</code_context>

<specifics>
## Specific Ideas

- Basic Auth format for Jira Cloud REST API v3: `btoa(`${email}:${apiToken}`)` sent in `Authorization: Basic ...` header.
- Atlassian Document Format (ADF) v3 structure for task description:
  ```json
  {
    "version": 1,
    "type": "doc",
    "content": [
      {
        "type": "paragraph",
        "content": [
          {
            "type": "text",
            "text": "Task description content..."
          }
        ]
      }
    ]
  }
  ```
- Smart Status Mapping table:
  - 'To Do' / 'Open' -> `Open`
  - 'In Progress' / 'Developing' -> `In Progress`
  - 'In Review' / 'PR' -> `In Review`
  - 'Testing' / 'Resolved' / 'QA' -> `Resolved`
  - 'Done' / 'Closed' -> `Done`
  - 'Cancelled' / 'Won't Do' -> `Cancelled`

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed strictly within the boundary of Phase 11.

</deferred>

---

*Phase: 11-Jira Cloud Integration & Task Lifecycle*
*Context gathered: 2026-09-28*
