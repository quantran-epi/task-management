# Phase 11: Jira Cloud Integration & Task Lifecycle - Pattern Map

**Mapped:** 2026-09-28
**Files analyzed:** 14
**Analogs found:** 14 / 14

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/types/models.ts` | model | CRUD | `src/types/models.ts` | exact |
| `src/db/schema.ts` | config | CRUD | `src/db/schema.ts` | exact |
| `src/db/index.ts` | model / migration | CRUD | `src/db/index.ts` | exact |
| `src/validation/schemas.ts` | validation | request-response | `src/validation/schemas.ts` | exact |
| `src/services/jira/types.ts` | model | request-response | `src/services/github/types.ts` | exact |
| `src/services/jira/jiraApi.ts` | service | request-response | `src/services/github/githubApi.ts` | exact |
| `src/services/jira/adf.ts` | utility | transform | `src/services/crypto/base64.ts` | role-match |
| `src/services/jira/statusMapping.ts` | utility | transform | `src/utils/filter.ts` | role-match |
| `src/components/settings/JiraConfigCard.tsx` | component | request-response | `src/components/settings/GitHubConfigCard.tsx` | exact |
| `src/views/SettingsView.tsx` | component | request-response | `src/views/SettingsView.tsx` | exact |
| `src/components/tasks/TaskJiraSection.tsx` | component | request-response | `src/components/tasks/TaskDrawerPlanning.tsx` | exact |
| `src/components/tasks/CreateJiraIssueModal.tsx` | component | request-response | `src/components/settings/ImportPreviewModal.tsx` | role-match |
| `src/components/tasks/TaskDrawer.tsx` | component | CRUD | `src/components/tasks/TaskDrawer.tsx` | exact |
| `src/components/tasks/TaskTable.tsx` | component | CRUD | `src/components/tasks/TaskTable.tsx` | exact |
| `src/components/planner/TaskAllocationCard.tsx` | component | CRUD | `src/components/planner/TaskAllocationCard.tsx` | exact |
| `src/components/tasks/TaskFilterBar.tsx` | component | request-response | `src/components/tasks/TaskFilterBar.tsx` | exact |
| `src/utils/filter.ts` | utility | transform | `src/utils/filter.ts` | exact |
| `src/utils/standup.ts` | utility | transform | `src/utils/standup.ts` | exact |

---

## Pattern Assignments

### `src/services/jira/jiraApi.ts` (service, request-response)

**Analog:** `src/services/github/githubApi.ts`

**Imports pattern:**
```typescript
import type { JiraConfig, JiraMyselfResponse, JiraIssueResponse, JiraTransitionsResponse } from './types';
```

**Token Redaction & Sanitization pattern** (`src/services/github/githubApi.ts` lines 8-11):
```typescript
function sanitizeErrorMessage(errorMsg: string, token?: string): string {
  if (!token) return errorMsg;
  return errorMsg.replaceAll(token, '[REDACTED]');
}
```

**HTTP Fetch with Basic Auth, Timeout, and Proxy URL pattern:**
```typescript
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
    throw new Error('Không thể kết nối đến Jira');
  }
}
```

---

### `src/services/jira/adf.ts` (utility, transform)

**Analog:** Native JSON structure transform without external libraries

**Core ADF v3 generator pattern:**
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

---

### `src/services/jira/statusMapping.ts` (utility, transform)

**Analog:** `src/utils/filter.ts` mapping rules

**Core Pattern:**
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

  // Safe fallback: null indicates unchanged
  return null;
}
```

---

### `src/components/settings/JiraConfigCard.tsx` (component, request-response)

**Analog:** `src/components/settings/GitHubConfigCard.tsx`

**LiveQuery & Form state pattern** (`src/components/settings/GitHubConfigCard.tsx` lines 33-52):
```typescript
const jiraSettings = useLiveQuery(async () => {
  const [domainRec, emailRec, tokenRec, proxyRec, projRec, issueTypeRec] = await Promise.all([
    db.settings.get('jira_domain'),
    db.settings.get('jira_email'),
    db.settings.get('jira_api_token'),
    db.settings.get('jira_cors_proxy'),
    db.settings.get('jira_default_project'),
    db.settings.get('jira_default_issue_type'),
  ]);
  return {
    domain: (domainRec?.value as string) || '',
    email: (emailRec?.value as string) || '',
    apiToken: (tokenRec?.value as string) || '',
    corsProxy: (proxyRec?.value as string) || '',
    defaultProjectKey: (projRec?.value as string) || '',
    defaultIssueType: (issueTypeRec?.value as string) || 'Task',
  };
}, [db]);
```

**Save to `db.settings` pattern** (`src/components/settings/GitHubConfigCard.tsx` lines 75-79):
```typescript
await db.transaction('rw', db.settings, async () => {
  await db.settings.put({ key: 'jira_domain', value: domain.trim() });
  await db.settings.put({ key: 'jira_email', value: email.trim() });
  await db.settings.put({ key: 'jira_api_token', value: apiToken.trim() });
  await db.settings.put({ key: 'jira_cors_proxy', value: corsProxy.trim() });
  await db.settings.put({ key: 'jira_default_project', value: defaultProjectKey.trim().toUpperCase() });
  await db.settings.put({ key: 'jira_default_issue_type', value: defaultIssueType.trim() || 'Task' });
});
```

**Diagnostic test connection handler:**
```typescript
const handleTestConnection = async () => {
  setTesting(true);
  setDiagnosticResult(null);
  try {
    const user = await testJiraConnection({
      domain,
      email,
      apiToken,
      corsProxy,
    });
    setDiagnosticResult({
      status: 'success',
      message: `Kết nối thành công! Đã xác thực người dùng: ${user.displayName} (${user.emailAddress})`,
    });
  } catch (err: any) {
    if (err.message === 'CORS_BLOCKED') {
      setDiagnosticResult({
        status: 'cors_blocked',
        message: 'Trình duyệt đã chặn truy vấn trực tiếp đến Atlassian (CORS). Vui lòng điền địa chỉ CORS Proxy.',
      });
    } else {
      setDiagnosticResult({
        status: 'error',
        message: err.message || 'Lỗi xác thực hoặc không thể kết nối tới Jira.',
      });
    }
  } finally {
    setTesting(false);
  }
};
```

---

### `src/components/tasks/TaskJiraSection.tsx` (component, request-response)

**Analog:** `src/components/tasks/TaskDrawerPlanning.tsx`

**Drawer section card & update pattern:**
```typescript
export interface TaskJiraSectionProps {
  task: Task;
  onUpdateTask: (patch: Partial<Task>) => Promise<void>;
  db?: TaskPlannerDatabase;
}
```

**Unlinked view with regex validation:**
```typescript
const JIRA_KEY_REGEX = /^[A-Z][A-Z0-9]+-[0-9]+$/;

const handleLinkKey = async () => {
  const trimmed = inputKey.trim().toUpperCase();
  if (!JIRA_KEY_REGEX.test(trimmed)) {
    message.error('Mã Jira Key không hợp lệ. Ví dụ đúng: SHB-1234');
    return;
  }
  await onUpdateTask({ jiraKey: trimmed });
  message.success(`Đã liên kết mã Jira ${trimmed}`);
};
```

**Linked view with external URL, transition dropdown, and unlink button:**
```typescript
const jiraBrowseUrl = `https://${domain}.atlassian.net/browse/${task.jiraKey}`;

// External link tag
<Tag color="#1677ff" style={{ cursor: 'pointer' }}>
  <a href={jiraBrowseUrl} target="_blank" rel="noopener noreferrer">
    {task.jiraKey} <LinkOutlined />
  </a>
</Tag>

// Unlink confirmation
<Popconfirm
  title="Hủy liên kết Jira Key?"
  description="Thao tác này chỉ gỡ mã Jira khỏi tác vụ nội bộ, không xóa issue trên Jira."
  onConfirm={async () => {
    await onUpdateTask({ jiraKey: undefined });
    message.success('Đã hủy liên kết Jira');
  }}
>
  <Button danger size="small">Hủy liên kết</Button>
</Popconfirm>
```

---

### `src/components/tasks/CreateJiraIssueModal.tsx` (component, request-response)

**Analog:** `src/components/settings/ImportPreviewModal.tsx`

**Modal with prefilled form & active editing guard:**
```typescript
export interface CreateJiraIssueModalProps {
  open: boolean;
  task: Task;
  defaultProjectKey?: string;
  defaultIssueType?: string;
  onClose: () => void;
  onCreated: (jiraKey: string) => void;
  jiraConfig: JiraConfig;
}
```

---

### `src/components/tasks/TaskTable.tsx` & `src/components/planner/TaskAllocationCard.tsx` (component, UI)

**Analog:** `src/components/tasks/TaskTable.tsx` lines 238-259

**TaskTable Jira Tag rendering with `e.stopPropagation()`:**
```typescript
{record.jiraKey && (
  <Tag
    color="blue"
    style={{ margin: 0, cursor: 'pointer' }}
    onClick={(e) => {
      e.stopPropagation();
      const domain = jiraDomain || 'atlassian.net';
      window.open(`https://${domain}.atlassian.net/browse/${record.jiraKey}`, '_blank', 'noopener,noreferrer');
    }}
  >
    <Space orientation="horizontal" size={2}>
      <span>{record.jiraKey}</span>
      <LinkOutlined style={{ fontSize: 10 }} />
    </Space>
  </Tag>
)}
```

**TaskAllocationCard micro-badge:**
```typescript
{task.jiraKey && (
  <Tag
    color="blue"
    style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px', margin: 0 }}
  >
    {task.jiraKey}
  </Tag>
)}
```

---

### `src/utils/filter.ts` (utility, transform)

**Analog:** `src/utils/filter.ts` lines 120-127 and filter criteria

**Jira Key text search:**
```typescript
if (searchTerm) {
  const matchName = task.name.toLowerCase().includes(searchTerm);
  const matchDesc = (task.description ?? '').toLowerCase().includes(searchTerm);
  const matchNotes = (task.notes ?? '').toLowerCase().includes(searchTerm);
  const matchJira = (task.jiraKey ?? '').toLowerCase().includes(searchTerm);
  if (!matchName && !matchDesc && !matchNotes && !matchJira) {
    return false;
  }
}
```

**Jira linked filter (`all` | `linked` | `unlinked`):**
```typescript
if (filterState.jiraFilter && filterState.jiraFilter !== 'all') {
  if (filterState.jiraFilter === 'linked' && !task.jiraKey) {
    return false;
  }
  if (filterState.jiraFilter === 'unlinked' && task.jiraKey) {
    return false;
  }
}
```

---

### `src/utils/standup.ts` (utility, transform)

**Analog:** `src/utils/standup.ts` lines 49-76

**Format task line with `[JiraKey]`:**
```typescript
function formatTaskLine(task: Task): string {
  const workTypeLabel = task.workType ? VIETNAMESE_WORK_TYPE_LABELS[task.workType] : 'Khác';
  const jiraPart = task.jiraKey ? `[${task.jiraKey}] ` : '';
  const projectName = (task.projectId ? projectMap?.get(task.projectId)?.name : undefined) ?? 'Cá nhân';
  const deadline = task.deadline || 'Không có';

  // Format line:
  let line = `- [${workTypeLabel}]${jiraPart}${task.name} (Dự án: ${projectName} | Hạn: ${deadline} | Phụ trách: ${assigneeStr})`;
  ...
}
```

---

## Shared Patterns

### Persistence in `db.settings`
**Source:** `src/components/settings/GitHubConfigCard.tsx`
**Apply to:** `JiraConfigCard.tsx`, `jiraApi.ts`
```typescript
await db.settings.put({ key: 'jira_domain', value: domain.trim() });
await db.settings.put({ key: 'jira_email', value: email.trim() });
await db.settings.put({ key: 'jira_api_token', value: apiToken.trim() });
await db.settings.put({ key: 'jira_cors_proxy', value: corsProxy.trim() });
```

### Token Redaction in Error Messages
**Source:** `src/services/github/githubApi.ts`
**Apply to:** All Jira network calls and user error notifications
```typescript
function sanitizeErrorMessage(errorMsg: string, token?: string): string {
  if (!token) return errorMsg;
  return errorMsg.replaceAll(token, '[REDACTED]');
}
```

### FormGuard & Focus Management
**Source:** `src/components/tasks/TaskDrawer.tsx`
**Apply to:** `CreateJiraIssueModal.tsx`
```typescript
useRegisterActiveForm('create-jira-issue', open);
```

### Accessible Feedback via `announceToScreenReader`
**Source:** `src/components/common/AriaLiveRegion.tsx`
**Apply to:** Jira connection test results, issue creation, transition executions
```typescript
announceToScreenReader('Đã chuyển trạng thái tác vụ Jira thành công.');
```

---

## No Analog Found

None. All required features have existing direct analogs in the codebase.

---

## Metadata

**Analog search scope:** `src/services/`, `src/components/`, `src/views/`, `src/utils/`, `tests/`
**Files scanned:** 68
**Pattern extraction date:** 2026-09-28
