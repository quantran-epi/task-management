# Phase 11: Jira Cloud Integration & Task Lifecycle - Research

**Researched:** 2026-09-28  
**Domain:** Jira Cloud REST API v3, Atlassian Document Format (ADF), Client-side CORS Proxying, Offline-first Issue Lifecycle  
**Confidence:** HIGH  

## Summary

Phase 11 connects the offline-first personal task planner to Jira Cloud (`xxx.atlassian.net`) via the Jira REST API v3. The integration empowers a developer/operator to create issues directly from local tasks, link existing Jira issue keys, inspect workflow status transitions, execute transitions with smart status mapping back to local tasks, and display Jira Key tags across task tables, weekly planner cards, and standup markdown exports.

Because the task planner is a static client-side web application hosted on GitHub Pages without a backend server, direct browser `fetch` requests to `https://xxx.atlassian.net` will be blocked by default browser CORS (Cross-Origin Resource Sharing) policies. Atlassian does not send permissive CORS headers for arbitrary browser origins. The architecture provides native connection testing with immediate diagnostic feedback and support for an optional user-defined CORS Proxy URL (such as a Cloudflare Worker or reverse proxy). All credentials (domain, email, API token) are persisted safely in local IndexedDB `db.settings`, adhering to the offline-first personal tool model without requiring third-party cloud backends.

The technical design mandates zero new npm dependencies. By utilizing native browser `fetch`, standard Basic Authentication (`btoa`), native regex, and a custom minimal ADF v3 serializer, the application avoids introducing bulky third-party libraries (such as `@atlaskit/adf-utils`), keeping the bundle lean and fast.

**Primary recommendation:** Implement a dedicated `jiraApi.ts` client with Basic Auth and token redaction, a lightweight native ADF v3 paragraph converter in `adf.ts`, an extensible regex-based status mapper in `statusMapping.ts`, and persist settings in `db.settings` while extending the `Task` model with `jiraKey?: string`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Xác thực & Cấu hình Jira (Settings & Credentials)
- **D-01:** Lưu trữ thông tin kết nối Jira (Domain `xxx.atlassian.net`, Email, API Token, CORS Proxy URL tùy chọn, Default Project Key, Default Issue Type) trực tiếp trong IndexedDB `db.settings`. Đảm bảo trải nghiệm offline-first cá nhân, không phải nhập lại token mỗi khi F5 hoặc mở lại trình duyệt.
- **D-02:** Bổ sung tab thứ 3 "Tích hợp Jira" (`jira`) trong `SettingsView` (bên cạnh "Công suất làm việc" và "Sao lưu & Dữ liệu"), cung cấp form cấu hình rõ ràng, tách bạch với phần sao lưu và công suất.
- **D-03:** Hỗ trợ cấu hình CORS Proxy URL tùy chọn (VD: Cloudflare Worker, cors-anywhere). Nút "Kiểm tra kết nối" gửi request chẩn đoán đến `GET /rest/api/3/myself` và phản hồi trạng thái chi tiết: Đang kết nối -> Bị chặn CORS (gợi ý điền CORS Proxy) -> Lỗi xác thực 401/403 -> Kết nối thành công (hiển thị tên người dùng và email Jira).
- **D-04:** Cho phép lưu sẵn Default Project Key (VD: `SHB`) và Default Issue Type (VD: `Task`) trong Settings để tăng tốc tạo issue từ task chỉ trong 1-click.

#### Tạo & Liên kết Issue trong TaskDrawer (Issue Creation & Linking)
- **D-05:** Bổ sung Section "Tích hợp Jira" riêng biệt trong `TaskDrawer`:
  - Khi chưa liên kết: Hiển thị nút "Tạo Jira Issue mới" và form "Gắn Jira Key có sẵn".
  - Khi đã liên kết: Hiển thị badge Jira Key (bấm mở tab mới đến Jira web), trạng thái hiện tại, khu vực chuyển workflow transition, và nút "Hủy liên kết" (Unlink).
- **D-06:** Luồng tạo Jira Issue mới: Bấm "Tạo Jira Issue" sẽ mở một Modal nhỏ (`CreateJiraIssueModal`) điền sẵn Summary (từ `task.name`), Description (từ `task.description`), Project Key & Issue Type (từ Default Settings). Người dùng có thể chỉnh sửa nhanh trước khi gửi `POST /rest/api/3/issue`. Sau khi tạo thành công, tự động gắn `jiraKey` mới vào task.
- **D-07:** Định dạng Atlassian Document Format (ADF): Xây dựng bộ chuyển đổi tối giản (minimal ADF converter) tự động chuyển đổi `task.description` (chuỗi văn bản/xuống dòng) thành tài liệu ADF v3 hợp lệ (`type: 'doc', version: 1, content: [...]`) với các node paragraph chuẩn, không cần phụ thuộc thư viện bên ngoài nặng nề.
- **D-08:** Liên kết thủ công & Hủy liên kết: Ô nhập Jira Key có kiểm tra regex `^[A-Z][A-Z0-9]+-[0-9]+$`. Cho phép bấm "Hủy liên kết" để gỡ `jiraKey` khỏi task nội bộ (không xóa issue trên Jira). Badge Jira Key render kèm icon link ngoài, click vào mở trực tiếp `https://{domain}.atlassian.net/browse/{jiraKey}` trong tab mới (`target="_blank" rel="noopener noreferrer"`).

#### Workflow Transition & Đồng bộ Trạng thái (Lifecycle & Status Mapping)
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

#### Hiển thị Bảng, Bộ lọc & Báo cáo Standup (UI & Standup Integration)
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

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed strictly within the boundary of Phase 11.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| JIRA-01 | User can configure Jira Cloud domain (`xxx.atlassian.net`), email, API token, and optional CORS Proxy URL in Settings. | Verified IndexedDB `db.settings` persistence pattern; clean form integration in new `SettingsView` third tab `'jira'`. |
| JIRA-02 | User can test Jira Cloud connection with immediate diagnostic feedback (authenticating, CORS detection, success/failure). | Verified `GET /rest/api/3/myself` endpoint; detection logic distinguishing `TypeError` (CORS/offline), 401/403 (auth), and 200 OK. |
| JIRA-03 | User can create a new Jira issue directly from a local task with summary and minimal ADF description, auto-linking the Jira key. | Verified `POST /rest/api/3/issue` schema; custom minimal ADF v3 generator; modal prefill from task name and description; auto-attaching generated key to task. |
| JIRA-04 | User can manually link an existing Jira issue key to a local task and open the Jira web URL in one click. | Verified regex `^[A-Z][A-Z0-9]+-[0-9]+$`; external URL pattern `https://{domain}.atlassian.net/browse/{key}`; `stopPropagation` in table; manual unlink flow. |
| JIRA-05 | User can inspect and execute Jira status transitions directly from the task detail modal. | Verified `GET` and `POST /rest/api/3/issue/{key}/transitions`; Smart Status Mapping table; error alert with fallback link to Jira web UI when screen/resolution required. |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Jira Credentials & Config Storage | Database / Storage (`db.settings`) | Browser / Client UI | Sensitive tokens and project defaults persist in local IndexedDB so the user never re-authenticates on browser reload. |
| Jira Connection Diagnostics | Client Service (`jiraApi.ts`) | Browser / Client UI (`JiraConfigCard`) | Diagnostic API calls against `GET /rest/api/3/myself` classify network, CORS, and auth errors to guide proxy configuration. |
| Minimal ADF v3 Conversion | Client Utility (`adf.ts`) | — | Pure function converting plain multiline text to valid Jira v3 ADF document schema without heavy external dependencies. |
| Jira Issue Creation | Client Service (`jiraApi.ts`) | UI Modal (`CreateJiraIssueModal`) | Form prefill, POST request dispatch to Jira REST API v3, and database update linking `jiraKey` to the local task. |
| Issue Key Linking & Unlinking | Browser / Client UI (`TaskJiraSection`) | Storage (`taskRepo.ts`) | Key input validation via regex, storage update, and external browser link rendering. |
| Transitions & Smart Status Mapping | Client Service (`statusMapping.ts`, `jiraApi.ts`) | Browser / Client UI (`TaskJiraSection`) | Queries transitions from Jira, posts transition ID, and updates local task status based on status categories and naming conventions. |
| Jira Tag Rendering & Filtering | Browser / Client UI (`TaskTable`, `TaskAllocationCard`) | Client Filter & Standup Engine | Renders blue tags in table and calendar, extends search to `jiraKey`, and adds Jira status filter options. |

## Project Constraints (from CLAUDE.md)

- **Zero application server:** 100% local application behavior running as a static PWA on GitHub Pages. Direct client-to-Jira API calls or user-configured client proxy only.
- **Persistence:** Local IndexedDB via Dexie is the source of truth. All Jira configuration is saved directly in `db.settings`.
- **UI Framework:** Ant Design 6 (`antd@6.6.5`) with `@ant-design/icons`. All forms, modals, tags, alerts, and feedback must use Ant Design primitives.
- **Strict typing & Data Safety:** TypeScript with `strict` and `exactOptionalPropertyTypes`. Partial updates to tasks must not write `undefined` properties into IndexedDB.
- **Zero new dependencies:** Milestone v1.1 mandates zero new npm dependencies. Native `fetch`, `btoa`, and regex suffice.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Native Fetch API | Browser built-in | HTTP client for Jira REST API v3 | Zero bundle size, supported in all modern browsers, supports `AbortSignal.timeout(10000)`. [VERIFIED: MDN] |
| Native Web Crypto / `btoa` | Browser built-in | Basic Auth base64 encoding | Standard RFC 7617 HTTP Basic Auth header generation (`btoa(`${email}:${apiToken}`)`). [VERIFIED: MDN] |
| Ant Design | 6.6.5 | UI components (Tabs, Modal, Select, Tag, Alert) | Existing project UI system; already provides all necessary interactive components. [VERIFIED: package.json] |
| Dexie & dexie-react-hooks | 4.4.6 / 4.4.0 | Local storage & reactive queries | Primary persistence layer for settings and task models. [VERIFIED: package.json] |
| Zod | 4.6.5 | Schema validation | Validates Jira Key format, proxy URLs, and backup data structures. [VERIFIED: package.json] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Dayjs | 1.11.23 | Date formatting & standup generation | Used in standup summaries and date formatting. [VERIFIED: package.json] |
| `@ant-design/icons` | 6.3.4 | Icons (`LinkOutlined`, `CloudSyncOutlined`, etc.) | Visual indicators for external Jira links and sync status. [VERIFIED: package.json] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native minimal ADF converter | `@atlaskit/adf-utils` | Third-party Atlaskit packages add >500KB to bundle size and often have React 19 compatibility issues. Minimal native converter handles paragraphs in <40 lines of code. |
| Native `fetch` with Basic Auth | `jira.js` SDK | Jira client SDKs are bloated (>2MB unpacked), contain Node-specific dependencies, and add maintenance overhead. Native fetch is ~100 lines for the 4 required endpoints. |
| IndexedDB `db.settings` | `sessionStorage` | Session storage is wiped on browser tab close, degrading UX by forcing the user to re-enter Jira domain and API tokens repeatedly. |

**Installation:**
No installation needed. Zero new npm dependencies required.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| None (Zero new packages) | — | — | — | — | [OK] | Approved |

**Packages removed due to [SLOP] verdict:** None  
**Packages flagged as suspicious [SUS]:** None  

## Architecture Patterns

### System Architecture Diagram

```
                     +---------------------------------------+
                     |      TaskPlannerDatabase (Dexie)       |
                     |  - db.settings: JiraConfig            |
                     |  - db.tasks: Task (jiraKey?)          |
                     +-------------------+-------------------+
                                         |
                       Load / Save       | Reactive LiveQuery
                                         v
+------------------------+   +-----------------------+   +------------------------+
|   SettingsView (Tab 3) |   |   TaskDrawer Details  |   | TaskTable / PlannerView|
| - JiraConfigCard       |   | - TaskJiraSection     |   | - Jira Key Tag (#1677ff|
| - Diagnostic Test      |   | - CreateJiraIssueModal|   | - stopPropagation link |
+-----------+------------+   +-----------+-----------+   +-----------+------------+
            |                            |                           |
            +-------------+--------------+                           |
                          | (API Requests)                           |
                          v                                          |
             +--------------------------+                            |
             |   jiraApi.ts Service     |                            |
             | - Basic Auth Builder     |                            |
             | - Token Redaction Engine |                            |
             | - 10s Timeout Handler    |                            |
             | - Proxy URL Formatter    |                            |
             +------------+-------------+                            |
                          |                                          |
            +-------------+-------------+                            |
            |                           |                            |
 (No CORS Proxy)             (With CORS Proxy)                       |
            |                           |                            |
            v                           v                            |
+-----------------------+   +-----------------------+                |
| Direct Jira Cloud API |   | User CORS Proxy       |                |
| *.atlassian.net       |   | (Cloudflare Worker)   |                |
| (Blocked by browser   |   +-----------+-----------+                |
| CORS policy)          |               | (Forward)                  |
+-----------------------+               v                            |
                            +-----------------------+                |
                            | Jira Cloud REST v3    |                |
                            | - GET /myself         |                |
                            | - POST /issue         |                |
                            | - GET /transitions    |                |
                            | - POST /transitions   |                |
                            +-----------+-----------+                |
                                        | (Response)                 |
                                        v                            |
                            +-----------------------+                |
                            | Smart Status Mapping  |                |
                            | (Maps Jira Category   |                |
                            | to local task.status) |                |
                            +-----------+-----------+                |
                                        |                            |
                                        +----------------------------+
```

### Recommended Project Structure

```
src/
├── services/
│   └── jira/
│       ├── types.ts              # JiraConfig, JiraIssue, JiraTransition, ADF types
│       ├── adf.ts                # Minimal ADF v3 serializer & parser
│       ├── statusMapping.ts      # Smart status mapping rules & category matching
│       ├── jiraApi.ts            # Client HTTP functions, timeout, token redaction
│       └── __tests__/            # Unit tests for API, ADF, and status mapping
├── components/
│   ├── settings/
│   │   └── JiraConfigCard.tsx    # Tab 3 Settings configuration & test connection
│   └── tasks/
│       ├── TaskJiraSection.tsx   # Drawer Jira block (unlinked vs linked views)
│       └── CreateJiraIssueModal.tsx # Modal to create issue from task
├── validation/
│   └── schemas.ts                # Add JIRA_KEY_REGEX and jiraKey to task schemas
└── utils/
    ├── filter.ts                 # Support jiraKey in text search & jiraFilter
    └── standup.ts                # Include [JiraKey] in standup markdown output
```

### Pattern 1: Jira Cloud REST API v3 Client with CORS Proxy Support and Token Redaction
**What:** Client-side HTTP service communicating with Jira Cloud REST API v3 using HTTP Basic Auth, handling optional CORS proxies, enforcing a 10s request timeout, and systematically redacting tokens from all error messages.  
**When to use:** All Jira Cloud interactions (diagnostic check, issue creation, transition query, transition execution).  
**Example:**
```typescript
export interface JiraConfig {
  domain: string;
  email: string;
  apiToken: string;
  corsProxy?: string;
  defaultProjectKey?: string;
  defaultIssueType?: string;
}

export function buildJiraUrl(config: JiraConfig, path: string): string {
  const cleanDomain = config.domain.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const targetUrl = `https://${cleanDomain}${path.startsWith('/') ? path : `/${path}`}`;
  
  if (!config.corsProxy || !config.corsProxy.trim()) {
    return targetUrl;
  }
  
  const proxy = config.corsProxy.trim();
  if (proxy.endsWith('=')) {
    return `${proxy}${encodeURIComponent(targetUrl)}`;
  }
  if (proxy.endsWith('/')) {
    return `${proxy}${targetUrl}`;
  }
  return `${proxy}/${targetUrl}`;
}

export function sanitizeErrorMessage(errorMsg: string, token?: string): string {
  if (!token) return errorMsg;
  return errorMsg.replaceAll(token, '[REDACTED]');
}
```

### Pattern 2: Minimal Atlassian Document Format (ADF) v3 Serializer
**What:** Pure TypeScript serializer that converts multiline plaintext descriptions into Atlassian Document Format v3 JSON objects (`type: 'doc', version: 1, content: [...]`).  
**When to use:** Creating new issues via `POST /rest/api/3/issue`.  
**Example:**
```typescript
export interface AdfDoc {
  version: 1;
  type: 'doc';
  content: Array<{
    type: 'paragraph';
    content?: Array<{
      type: 'text';
      text: string;
    }>;
  }>;
}

export function textToAdf(text?: string): AdfDoc {
  if (!text || !text.trim()) {
    return {
      version: 1,
      type: 'doc',
      content: [],
    };
  }

  const lines = text.split('\n');
  return {
    version: 1,
    type: 'doc',
    content: lines.map((line) => {
      const trimmed = line.trimEnd();
      if (!trimmed) {
        return { type: 'paragraph', content: [] };
      }
      return {
        type: 'paragraph',
        content: [{ type: 'text', text: trimmed }],
      };
    }),
  };
}
```

### Pattern 3: Smart Status Mapping Engine
**What:** Pure rule-based matcher mapping Jira workflow status categories and status names into the local application's `TaskStatus` enum (`Open`, `In Progress`, `In Review`, `Resolved`, `Done`, `Cancelled`).  
**When to use:** Executing status transitions on Jira.  
**Example:**
```typescript
import type { TaskStatus } from '../../types/models';

export function mapJiraStatusToLocalTaskStatus(
  statusName: string,
  categoryKey?: string
): TaskStatus | null {
  const normName = statusName.toLowerCase();
  const normCat = (categoryKey || '').toLowerCase();

  // 1. Cancelled
  if (normName.includes('cancel') || normName.includes('reject') || normName.includes("won't do")) {
    return 'Cancelled';
  }

  // 2. Done
  if (normCat === 'done' || normName.includes('done') || normName.includes('closed') || normName.includes('complete')) {
    return 'Done';
  }

  // 3. Resolved / Testing
  if (normName.includes('test') || normName.includes('qa') || normName.includes('uat') || normName.includes('resolved') || normName.includes('verify')) {
    return 'Resolved';
  }

  // 4. In Review
  if (normName.includes('review') || normName.includes('pr') || normName.includes('peer review')) {
    return 'In Review';
  }

  // 5. In Progress
  if (normCat === 'indeterminate' || normName.includes('in progress') || normName.includes('developing') || normName.includes('doing')) {
    return 'In Progress';
  }

  // 6. Open / To Do
  if (normCat === 'new' || normName.includes('to do') || normName.includes('open') || normName.includes('backlog')) {
    return 'Open';
  }

  // Fallback: null means leave local status unchanged
  return null;
}
```

### Anti-Patterns to Avoid
- **Hardcoding Jira API Tokens in `.env` or Vite configs:** Vite bundles `VITE_*` variables into client-side JS bundles. Tokens must be entered by the user at runtime and stored only in IndexedDB.
- **Installing heavy Atlassian SDKs:** Packages like `@atlaskit/adf-utils` or `jira.js` carry hundreds of transitive dependencies and break React 19 builds. Use lightweight native functions.
- **Assuming direct browser fetch to Jira Cloud works without proxy:** Browsers block cross-origin requests to `atlassian.net` due to missing CORS headers. Always guide the user to configure a CORS proxy if a network `TypeError` is detected.
- **Losing user task data when unlinking:** Unlinking must remove `jiraKey` from the local task record only; it must NEVER delete or alter the remote Jira issue.
- **Failing silently on transition screens:** If a transition fails because the Jira workflow requires a screen/resolution field, display a clear alert with a direct link to open the issue on Jira web UI.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Basic Authentication Base64 | Custom bit-shifting encoding | `window.btoa(unescape(encodeURIComponent(str)))` | Standard, fast, built into all modern browsers. |
| Jira Key Regex Validation | Ad-hoc string split checking | `/^[A-Z][A-Z0-9]+-[0-9]+$/` | Official Atlassian issue key syntax standard. |
| Timeouts on Network Fetch | Manual `setTimeout` / `clearTimeout` race | `AbortSignal.timeout(10000)` | Native Web API in modern browsers and Node 18+; automatically aborts fetch cleanly. |
| React Live State for Settings | Custom EventEmitter or Polling | `useLiveQuery` from `dexie-react-hooks` | Automatically re-renders settings cards when `db.settings` updates across tabs. |

## Runtime State Inventory

> Greenfield feature additions only (no legacy rename or data migration required).

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Existing tasks in `db.tasks` do not have `jiraKey` | None — `jiraKey` is optional (`undefined`); Dexie schema v3 optional or backward compatible. |
| Live service config | None | None |
| OS-registered state | None | None |
| Secrets/env vars | New `jira_*` settings in IndexedDB | Written via `db.settings.put({ key, value })`. |
| Build artifacts | None | None |

## Common Pitfalls

### Pitfall 1: Browser CORS Rejection on Direct Fetch
**What goes wrong:** Calling `fetch('https://my-org.atlassian.net/rest/api/3/myself')` throws `TypeError: Failed to fetch`.
**Why it happens:** Atlassian Cloud servers do not return `Access-Control-Allow-Origin: *` headers to browser clients.
**How to avoid:** Detect `TypeError` when `window.navigator.onLine` is true and `corsProxy` is not configured. Display an informative warning Alert advising the user to provide a CORS Proxy URL (e.g., Cloudflare Worker).
**Warning signs:** Immediate network error with zero HTTP response status in the browser console.

### Pitfall 2: Accidental Token Exposure in Error Alerts
**What goes wrong:** A failed fetch error message containing the request headers or URL includes the user's API token.
**Why it happens:** Third-party errors or raw fetch exceptions might echo the authorization header.
**How to avoid:** Pass every error message through `sanitizeErrorMessage(msg, config.apiToken)` before rendering in notifications, alerts, or console logs.

### Pitfall 3: Transition Fails Due to Mandatory Screens / Resolution
**What goes wrong:** User clicks "Thực hiện chuyển trạng thái" and Jira returns `400 Bad Request` with `{"errorMessages":[],"errors":{"resolution":"Resolution is required"}}`.
**Why it happens:** Jira workflows can enforce transition screens requiring input fields that the simplified client UI does not support.
**How to avoid:** Catch HTTP 400 errors from `/transitions`, extract error messages, and display a helpful Alert explaining that the workflow requires a screen, providing an instant link to perform the transition on Jira Web.

### Pitfall 4: Stale Status Discrepancies
**What goes wrong:** Local task status shows `Open`, but the issue was moved to `In Progress` directly on Jira.
**Why it happens:** Personal offline-first tool does not have incoming webhooks.
**How to avoid:** Whenever `TaskDrawer` opens for a task with a `jiraKey`, automatically fetch the current Jira status and available transitions in the background, updating the UI.

## Code Examples

### 1. Jira REST API v3 Fetcher with Redaction and Timeout
```typescript
// Source: https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/
export async function callJiraApi<T>(
  config: JiraConfig,
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = buildJiraUrl(config, path);
  const credentials = `${config.email}:${config.apiToken}`;
  const authHeader = `Basic ${btoa(unescape(encodeURIComponent(credentials)))}`;

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: authHeader,
    ...(options.headers as Record<string, string>),
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      signal: options.signal ?? AbortSignal.timeout(10000),
    });

    if (response.status === 204) {
      return {} as T;
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg =
        errorData.errorMessages?.join(', ') ||
        (errorData.errors ? Object.values(errorData.errors).join(', ') : '') ||
        `Lỗi Jira API: HTTP ${response.status}`;
      throw new Error(sanitizeErrorMessage(errorMsg, config.apiToken));
    }

    return (await response.json()) as T;
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.name === 'AbortError' || err.name === 'TimeoutError') {
        throw new Error('Hết thời gian chờ phản hồi từ Jira API (Timeout 10s).');
      }
      if (err.name === 'TypeError') {
        if (!config.corsProxy) {
          throw new Error('CORS_BLOCKED');
        }
        throw new Error('Không thể kết nối đến máy chủ Jira hoặc CORS Proxy.');
      }
      err.message = sanitizeErrorMessage(err.message, config.apiToken);
      throw err;
    }
    throw new Error('Lỗi không xác định khi kết nối với Jira.');
  }
}
```

### 2. Issue Creation Payload with ADF v3 Description
```typescript
// Source: https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-post
export async function createJiraIssue(
  config: JiraConfig,
  data: {
    projectKey: string;
    issueType: string;
    summary: string;
    description?: string;
  }
): Promise<{ id: string; key: string }> {
  const body = {
    fields: {
      project: { key: data.projectKey },
      issuetype: { name: data.issueType },
      summary: data.summary,
      ...(data.description ? { description: textToAdf(data.description) } : {}),
    },
  };

  return callJiraApi<{ id: string; key: string }>(config, '/rest/api/3/issue', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Jira REST API v2 (`/rest/api/2/...`) | Jira REST API v3 (`/rest/api/3/...`) | Atlassian deprecation | v3 requires ADF (Atlassian Document Format) for rich text/descriptions instead of wiki markup. |
| Server-side OAuth proxy | Client-side API Token with optional user CORS proxy | Modern static PWA pattern | No backend infrastructure to host; user controls their own token and proxy. |
| Heavy SDKs (`jira-client`, `jira.js`) | Native `fetch` + TypeScript interfaces | Modern ESM/Vite | Zero dependencies, instant startup, no Node buffer/stream polyfills needed. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Jira Cloud basic authentication accepts `email:apiToken` Base64 header on REST v3. | Standard Stack | High: Atlassian docs cite this as official auth for personal automation. Verified. |
| A2 | Browser fetch will be CORS-blocked without user CORS proxy. | Architecture Patterns | Low: Standard browser security behavior for Jira Cloud; handled gracefully by prompt. |

## Open Questions

1. **What if the user's Jira instance has customized Issue Types (e.g. "Story" instead of "Task")?**
   - What we know: Users can configure Default Issue Type in Settings, and edit it inside the `CreateJiraIssueModal`.
   - Recommendation: Default to "Task", but let the modal render an editable input or predefined select with options `['Task', 'Bug', 'Story', 'Sub-task']`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Modern Browser (Fetch API, btoa) | Network layer | ✓ | Native | — |
| IndexedDB | Settings & task persistence | ✓ | Native / Dexie 4.4.6 | — |
| Jira Cloud instance | Remote issue management | ✓ (external) | Cloud REST v3 | User configures credentials |
| CORS Proxy (e.g., Cloudflare Worker) | Cross-origin browser requests | Optional | User hosted | App alerts user if missing |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.2 |
| Config file | `vite.config.ts` |
| Quick run command | `npm test -- src/services/jira` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| JIRA-01 | Configure Jira credentials in Settings | unit/component | `npm test -- src/components/settings/__tests__/JiraConfigCard.test.tsx` | ❌ Wave 0 |
| JIRA-02 | Test connection with diagnostic feedback | unit/component | `npm test -- src/services/jira/__tests__/jiraApi.test.ts` | ❌ Wave 0 |
| JIRA-03 | Create Jira issue with minimal ADF description | unit/component | `npm test -- src/services/jira/__tests__/adf.test.ts src/components/tasks/__tests__/CreateJiraIssueModal.test.tsx` | ❌ Wave 0 |
| JIRA-04 | Link / unlink Jira issue key and open URL | unit/component | `npm test -- src/components/tasks/__tests__/TaskJiraSection.test.tsx` | ❌ Wave 0 |
| JIRA-05 | Inspect and execute status transitions | unit/component | `npm test -- src/services/jira/__tests__/statusMapping.test.ts` | ❌ Wave 0 |
| D-12..15 | Table tag, search filter, standup summary | unit | `npm test -- src/utils/__tests__/filter.test.ts src/utils/__tests__/standup.test.ts` | ✅ (needs extension) |

### Sampling Rate
- **Per task commit:** `npm test -- src/services/jira`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green (447+ tests passing) before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `src/services/jira/__tests__/jiraApi.test.ts` — Tests for Jira API endpoints, CORS error detection, token redaction, timeout handling.
- [ ] `src/services/jira/__tests__/adf.test.ts` — Tests for plaintext <-> ADF v3 serialization.
- [ ] `src/services/jira/__tests__/statusMapping.test.ts` — Tests for Smart Status Mapping rules.
- [ ] `src/components/settings/__tests__/JiraConfigCard.test.tsx` — Tests for settings persistence and diagnostic feedback.
- [ ] `src/components/tasks/__tests__/TaskJiraSection.test.tsx` — Tests for Jira section in TaskDrawer.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Jira API Token via HTTP Basic Auth header; credentials stored strictly in local IndexedDB `db.settings`, never in git or `.env`. |
| V3 Session Management | no | Local single-user offline client. |
| V4 Access Control | yes | Client-side operations inherit user permissions from Jira API token. |
| V5 Input Validation | yes | Regex validation `^[A-Z][A-Z0-9]+-[0-9]+$` for Jira Key; URL sanitization for proxy. |
| V6 Cryptography | yes | Token redaction (`replaceAll(token, '[REDACTED]')`) prevents credential leaks in error alerts and logs. |

### Known Threat Patterns for Jira REST API v3

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Token exposure in browser error logs / UI | Information Disclosure | `sanitizeErrorMessage` removes token string from all error descriptions and toasts. |
| Malicious CORS proxy sniffing credentials | Tampering / Information Disclosure | User provides own private proxy (e.g. Cloudflare Worker); public proxies strongly warned against. |
| Cross-site Scripting via Jira Summary / Description | Tampering | Ant Design components auto-escape HTML text nodes; ADF uses structured JSON objects. |

## Sources

### Primary (HIGH confidence)
- [Official Atlassian Jira Cloud REST API v3 Documentation](https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/) — Basic auth, issue creation, transitions, and user endpoints.
- [Atlassian Document Format (ADF) Specification](https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/) — Document structure, paragraph node, and text node format.
- Codebase inspection: `src/types/models.ts`, `src/db/schema.ts`, `src/db/index.ts`, `src/views/SettingsView.tsx`, `src/components/tasks/TaskDrawer.tsx`, `src/utils/filter.ts`, `src/utils/standup.ts`.

### Secondary (MEDIUM confidence)
- MDN Web Docs: Fetch API, Basic Authentication, `btoa`, `AbortSignal.timeout`.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Zero new dependencies; built on native Web APIs and existing Ant Design / Dexie stack.
- Architecture: HIGH — Validated client-side CORS proxy patterns, minimal ADF serializer, and Dexie settings storage.
- Pitfalls: HIGH — Clear diagnostic separation between CORS blocked, 401/403 auth errors, and Jira workflow screen validation errors.

**Research date:** 2026-09-28  
**Valid until:** 2026-12-31 (Stable Jira Cloud REST API v3)  
