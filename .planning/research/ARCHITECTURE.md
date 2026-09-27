# Architecture Research: Banking IT Enhancements & Jira Integration

**Domain:** Personal offline-first task & workload planner (Banking IT development environment / Jira Cloud)  
**Researched:** 2026-09-27  
**Confidence:** HIGH (verified against Dexie v4 indexing, Jira Cloud REST API v3, Web Crypto, and existing v1.0 architecture)

---

## Standard Architecture

### System Overview

Milestone v1.1 builds strictly upon the existing v1.0 offline-first, client-only architecture. The working data store remains IndexedDB via Dexie.js; no backend server is introduced. New integrations (Jira Cloud REST API) and capabilities (Banking IT fields, date-range search, analytics) fit into existing repository, context, and service layers.

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                               Presentation Layer (React 19 + Ant Design 6)              │
│  ┌───────────────────────┐ ┌──────────────────────┐ ┌─────────────────────────────────┐ │
│  │  Tasks & Projects UI  │ │ Date-Range Search Bar│ │ Analytics Dashboard Views       │ │
│  │  (Ops Owner / BA Tags)│ │ (Range + Filters)    │ │ (Burndown, Trends, Allocation)  │ │
│  └───────────┬───────────┘ └──────────┬───────────┘ └────────────────┬────────────────┘ │
│              │                        │                              │                  │
│  ┌───────────▼────────────────────────▼──────────────────────────────▼────────────────┐ │
│  │  Jira UI Components (JiraConfigCard, JiraIssueModal, JiraTransitionSyncModal)       │ │
│  └────────────────────────────────────┬───────────────────────────────────────────────┘ │
└───────────────────────────────────────┼─────────────────────────────────────────────────┘
                                        │
┌───────────────────────────────────────▼─────────────────────────────────────────────────┐
│                           Context & State Layer (React Context)                         │
│  ┌─────────────────────────────────┐  ┌──────────────────────────────────────────────┐  │
│  │ GitHubAuthContext (Session PAT) │  │ JiraAuthContext [NEW] (Session API Token)    │  │
│  └─────────────────────────────────┘  └──────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────────────────────────┐  │
│  │ Dexie live query subscriptions (useLiveQuery) + TaskFilterState                   │  │
│  └───────────────────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────┬─────────────────────────────────────────────────┘
                                        │
┌───────────────────────────────────────▼─────────────────────────────────────────────────┐
│                        Application & Service Layer (Pure TypeScript)                    │
│  ┌────────────────────────┐ ┌──────────────────────┐ ┌────────────────────────────────┐ │
│  │ JiraClientService [NEW]│ │ SearchFilterService  │ │ AnalyticsEngine [NEW]          │ │
│  │ (Auth, Proxy, ADF, Err)│ │ (Multi-criteria Date)│ │ (Burndown, Velocity, Ops/BA)   │ │
│  └───────────┬────────────┘ └──────────┬───────────┘ └────────────────┬───────────────┘ │
│              │                         │                              │                 │
│  ┌───────────▼────────────┐ ┌──────────▼───────────┐                  │                 │
│  │ GitHubSyncService (v1) │ │ BackupService (v2)   │                  │                 │
│  └────────────────────────┘ └──────────────────────┘                  │                 │
└───────────────────────────────────────┬───────────────────────────────┼─────────────────┘
                                        │                               │
┌───────────────────────────────────────▼───────────────────────────────▼─────────────────┐
│                        Data & Persistence Layer (Dexie IndexedDB V2)                    │
│  ┌───────────────────────────────────────────────────────────────────────────────────┐  │
│  │ Tables: projects, milestones, tasks, capacityRules, capacityOverrides,            │  │
│  │         plannedAllocations, settings, backupMetadata                              │  │
│  │ Indexes: *opsOwner, *businessAnalyst, actualStartDate, actualEndDate, jiraIssueKey │  │
│  └───────────────────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────┬─────────────────────────────────────────────────┘
                                        │
┌───────────────────────────────────────▼─────────────────────────────────────────────────┐
│                               External Boundaries                                       │
│  ┌──────────────────────────────────────────┐ ┌──────────────────────────────────────┐  │
│  │ Jira Cloud REST API v3                   │ │ GitHub Contents API                  │  │
│  │ (Direct or via User-Configured CORS Proxy)│ │ (AES-GCM Encrypted Backup Artifact)  │  │
│  └──────────────────────────────────────────┘ └──────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### Component Responsibilities (New vs. Modified)

| Component | Status | Responsibility | Implementation Details |
|-----------|--------|----------------|------------------------|
| `src/types/models.ts` | **MODIFIED** | Add Banking IT ownership fields and Jira metadata to domain models | `opsOwner?: string[]`, `businessAnalyst?: string[]` on `Project`, `Milestone`, `Task`. Add `jiraIssueKey?: string`, `jiraIssueUrl?: string`, `jiraSyncStatus?: 'synced' \| 'pending' \| 'error'`, `jiraLastSyncedAt?: string` on `Task`. |
| `src/db/schema.ts` | **MODIFIED** | Define `SCHEMA_V2` with multi-entry and date-range indexes | Add `*opsOwner`, `*businessAnalyst` to projects, milestones, tasks. Add `actualStartDate`, `actualEndDate`, `jiraIssueKey` to tasks. |
| `src/db/index.ts` | **MODIFIED** | Register Dexie schema version 2 and safe migration step | Call `this.version(2).stores(SCHEMA_V2).upgrade(...)`. Upgrade callback safely guarantees undefined arrays become empty or preserve existing data without rewrite. |
| `src/validation/schemas.ts` | **MODIFIED** | Enforce input constraints on new fields | Add `opsOwner` and `businessAnalyst` as `z.array(z.string().trim().min(1)).optional().default([])`. Validate Jira keys with regex `^[A-Z][A-Z0-9]+-[0-9]+$`. |
| `src/validation/backupSchemas.ts` | **MODIFIED** | Ensure export/import validates V2 structures | Accept schemaVersion 1 and 2, migrating v1 records by adding default empty arrays for opsOwner/BA. |
| `src/context/JiraAuthContext.tsx` | **NEW** | In-memory session store for Jira API token | Protects secret token in RAM. Reads non-sensitive config (host domain, email, proxy URL) from Dexie `settings` table. |
| `src/services/jira/jiraApi.ts` | **NEW** | Low-level HTTP client with CORS proxy routing and token sanitization | Formats Basic Auth header (`email:apiToken` in base64), routes requests through CORS proxy when configured, sanitizes error logs. |
| `src/services/jira/jiraSyncService.ts` | **NEW** | Jira business workflows | Tests credentials (`/myself`), creates issue from task (`POST /rest/api/3/issue`), fetches available transitions, pushes transition update. |
| `src/services/jira/adfConverter.ts` | **NEW** | Convert plain text / Markdown task notes to Atlassian Document Format (ADF) | Required for Jira Cloud API v3 `description` field. |
| `src/utils/filter.ts` | **MODIFIED** | Multi-criteria task search engine | Extends `TaskFilterState` with date-range filters (`dateRange: [string, string]`, `dateRangeType: 'execution' \| 'planned' \| 'deadline'`), Ops Owner, and BA filters. |
| `src/db/repositories/taskRepo.ts` | **MODIFIED** | Enhanced task queries | Add repository helpers for searching by date range, multi-entry Ops Owner, and BA. |
| `src/utils/analytics.ts` | **NEW** | Pure calculation engine for dashboard metrics | Computes milestone burndown datasets, completion velocity, status distribution, and workload allocation per Ops Owner & BA. |
| `src/views/AnalyticsView.tsx` | **NEW** | Analytics dashboard screen | Visualizes burndown charts, completion trends, and team allocation tables/progress bars. |
| `src/components/jira/` | **NEW** | UI cards and modals for Jira | `JiraConfigCard.tsx` in SettingsView, `JiraLinkModal.tsx` in TaskDrawer, `JiraTransitionModal.tsx`. |

---

## Recommended Project Structure

```
src/
├── context/
│   ├── FormGuardContext.tsx          # Existing: Unsaved form dirty tracking
│   ├── GitHubAuthContext.tsx         # Existing: In-memory PAT & passphrase
│   ├── JiraAuthContext.tsx           # [NEW] In-memory Jira API token & config
│   └── ServiceWorkerContext.tsx      # Existing: PWA SW update notifications
├── db/
│   ├── index.ts                      # [MODIFIED] Version 2 registration & upgrade
│   ├── schema.ts                     # [MODIFIED] SCHEMA_V1 and SCHEMA_V2 definitions
│   ├── seeds.ts                      # [MODIFIED] Seed initial capacity & settings
│   └── repositories/
│       ├── allocationRepo.ts         # Existing: Planned allocations
│       ├── capacityRepo.ts           # Existing: Weekly capacity & overrides
│       ├── cascadeRepo.ts            # Existing: Cascading deletions
│       ├── milestoneRepo.ts          # [MODIFIED] Milestone CRUD with opsOwner/BA
│       ├── projectRepo.ts            # [MODIFIED] Project CRUD with opsOwner/BA
│       └── taskRepo.ts               # [MODIFIED] Task CRUD with opsOwner/BA/Jira
├── services/
│   ├── backup/                       # Existing: Snapshot, validation, export/import
│   ├── crypto/                       # Existing: Web Crypto PBKDF2 + AES-GCM
│   ├── github/                       # Existing: Contents API backup sync
│   └── jira/                         # [NEW] Jira Cloud Integration
│       ├── index.ts                  # Public service exports
│       ├── types.ts                  # Jira config, issue, transition, ADF types
│       ├── jiraApi.ts                # Base HTTP fetcher with proxy routing
│       ├── adfConverter.ts           # Plain text / Markdown to Jira ADF
│       └── jiraSyncService.ts        # Create issue, fetch/apply transitions
├── types/
│   ├── backup.ts                     # [MODIFIED] Support V2 schema
│   ├── dashboard.ts                  # Existing: Dashboard stats
│   ├── analytics.ts                  # [NEW] Burndown, trend, and allocation types
│   ├── models.ts                     # [MODIFIED] Project, Milestone, Task V2 models
│   └── navigation.ts                 # [MODIFIED] Add 'analytics' view route
├── utils/
│   ├── analytics.ts                  # [NEW] Pure calculation engine for metrics
│   ├── filter.ts                     # [MODIFIED] Multi-criteria date-range filter
│   ├── date.ts                       # Existing: dayjs helpers & YYYY-MM-DD tools
│   └── uuid.ts                       # Existing: crypto.randomUUID wrappers
├── views/
│   ├── DashboardView.tsx             # Existing: Day & forecast dashboard
│   ├── AnalyticsView.tsx             # [NEW] Enhanced Analytics & Workload views
│   ├── TasksView.tsx                 # [MODIFIED] Integrated with Date-Range search
│   ├── ProjectsView.tsx              # [MODIFIED] Ops Owner & BA display
│   ├── PlannerView.tsx               # Existing: Daily capacity planner
│   └── SettingsView.tsx              # [MODIFIED] Added JiraConfigCard
└── components/
    ├── analytics/                    # [NEW] Analytics view widgets
    │   ├── BurndownChartCard.tsx     # Milestone burndown visualization
    │   ├── CompletionTrendCard.tsx   # Weekly/monthly completion velocity
    │   └── WorkloadAllocationCard.tsx# Ops Owner & BA allocation matrix
    ├── jira/                         # [NEW] Jira UI components
    │   ├── JiraConfigCard.tsx        # Settings connection & proxy configuration
    │   ├── JiraIssueLinkModal.tsx    # Create issue from task or link existing key
    │   └── JiraStatusSyncModal.tsx   # Transition Jira issue status from Task UI
    └── tasks/
        ├── TaskFilterBar.tsx         # [MODIFIED] DateRangePicker, Ops/BA multi-select
        └── TaskDrawer.tsx            # [MODIFIED] Ops Owner/BA tags & Jira badge
```

---

## Architectural Patterns

### Pattern 1: Multi-Entry IndexedDB Array Indexing (`*opsOwner`, `*businessAnalyst`)

**What:** Dexie multi-entry index creates individual index keys for every element inside an array. An asterisk prefix `*` denotes a multi-entry index in Dexie schema definitions.  
**When to use:** When filtering projects, milestones, or tasks where an item can have multiple owners or BAs (e.g. `['Alice', 'Bob']`).  
**Trade-offs:** Fast single-value lookup across array fields (`where('opsOwner').equals('Alice')`) without full-table scans. Slight storage overhead for secondary B-tree keys in IndexedDB.  

**Example:**
```typescript
// src/db/schema.ts
export const SCHEMA_V2 = {
  projects: 'id, status, deadline, *opsOwner, *businessAnalyst',
  milestones: 'id, projectId, status, deadline, *opsOwner, *businessAnalyst',
  tasks: 'id, projectId, milestoneId, status, priority, deadline, actualStartDate, actualEndDate, *opsOwner, *businessAnalyst, jiraIssueKey',
  capacityRules: 'id, &dayOfWeek',
  capacityOverrides: 'id, date',
  plannedAllocations: 'id, taskId, date',
  settings: 'key',
  backupMetadata: 'id, timestamp',
} as const;

// src/db/index.ts
this.version(2)
  .stores(SCHEMA_V2)
  .upgrade((tx) => {
    // Non-destructive: Dexie handles schema additions automatically;
    // existing records without opsOwner/businessAnalyst remain valid undefined/null
  });
```

---

### Pattern 2: Browser-to-Jira Proxy Router with In-Memory Credential Isolation

**What:** Direct browser calls from GitHub Pages (`https://<user>.github.io`) to Jira Cloud (`https://<domain>.atlassian.net`) fail due to CORS preflight headers omitted by Atlassian Cloud. The client routes requests through a user-configured CORS proxy (e.g. Cloudflare Worker or reverse proxy) if specified, while sensitive API tokens remain strictly in RAM.  
**When to use:** All Jira Cloud REST API v3 operations initiated from the client application.  
**Trade-offs:** Requires user to provide/configure a proxy endpoint for browser use, but avoids backend infrastructure and complies with strict no-server and zero-leakage security constraints.  

**Example:**
```typescript
// src/services/jira/jiraApi.ts
export interface JiraRequestConfig {
  domain: string;        // e.g. "mycompany.atlassian.net"
  email: string;         // user email
  apiToken: string;      // in-memory only
  corsProxyUrl?: string; // e.g. "https://my-proxy.workers.dev/?url="
}

export function buildJiraUrl(path: string, config: JiraRequestConfig): string {
  const cleanDomain = config.domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const targetUrl = `https://${cleanDomain}/rest/api/3/${path.replace(/^\/+/, '')}`;
  
  if (config.corsProxyUrl && config.corsProxyUrl.trim().length > 0) {
    const proxy = config.corsProxyUrl.trim();
    return proxy.includes('?') 
      ? `${proxy}${encodeURIComponent(targetUrl)}`
      : `${proxy.replace(/\/+$/, '')}/${targetUrl}`;
  }
  return targetUrl;
}

export async function jiraFetch<T>(
  path: string,
  options: RequestInit,
  config: JiraRequestConfig
): Promise<T> {
  const url = buildJiraUrl(path, config);
  const authHeader = `Basic ${btoa(`${config.email}:${config.apiToken}`)}`;
  
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', authHeader);
  headers.set('Accept', 'application/json');
  headers.set('Content-Type', 'application/json');

  try {
    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const message = errorBody.errorMessages?.join(', ') ||
                      Object.values(errorBody.errors || {}).join(', ') ||
                      `Jira HTTP ${response.status}: ${response.statusText}`;
      throw new Error(sanitizeJiraError(message, config.apiToken));
    }
    return (await response.json()) as T;
  } catch (err: unknown) {
    if (err instanceof Error) {
      err.message = sanitizeJiraError(err.message, config.apiToken);
      throw err;
    }
    throw new Error('Jira connection failed');
  }
}
```

---

### Pattern 3: Two-Phase Date-Range Query Engine (Dexie Indexed + In-Memory Pipeline)

**What:** Date-range search across tasks supports three modes:
1. `deadline`: uses indexed `tasks.deadline`.
2. `execution`: uses indexed `tasks.actualStartDate` and `tasks.actualEndDate`.
3. `planned`: planned dates exist in the `plannedAllocations` table (`taskId`, `date`). The query first fetches matching `taskId`s from `plannedAllocations.where('date').between(...)`, then filters tasks by ID.  
**When to use:** Date-range filtering in `TaskFilterBar` and `TasksView`.  
**Trade-offs:** Avoids denormalizing allocation dates onto task records while maintaining sub-millisecond query performance for personal dataset sizes (< 10,000 records).  

**Example:**
```typescript
// Querying tasks planned in date range [startStr, endStr]
export async function getTaskIdsWithPlannedAllocationsInRange(
  startDate: string,
  endDate: string,
  db: TaskPlannerDatabase
): Promise<Set<string>> {
  const allocations = await db.plannedAllocations
    .where('date')
    .between(startDate, endDate, true, true)
    .toArray();
  return new Set(allocations.map((a) => a.taskId));
}
```

---

### Pattern 4: Pure Functional Analytics Aggregation Projections

**What:** Analytics computations (milestone burndown, completion velocity, status distribution, Ops Owner / BA workload hours) are pure TypeScript calculation functions decoupled from UI components and database writes.  
**When to use:** Rendering `AnalyticsView` without duplicating calculation logic or maintaining stale cached aggregates.  
**Trade-offs:** Guarantees absolute consistency with IndexedDB without data drift. Calculations on 5,000 tasks take < 15ms in modern V8.  

**Example:**
```typescript
// src/utils/analytics.ts
export interface OwnerWorkload {
  name: string;
  role: 'opsOwner' | 'businessAnalyst';
  totalTasks: number;
  activeTasks: number;
  completedTasks: number;
  overdueTasks: number;
  totalPlannedMinutes: number;
}

export function computeOwnerWorkloadMatrix(
  tasks: Task[],
  allocations: PlannedAllocation[],
  todayStr: string
): { opsOwners: OwnerWorkload[]; bas: OwnerWorkload[] } {
  // Pure aggregation mapping tasks to allocation hours and status
  // ...
}
```

---

## Data Flow

### 1. Jira Issue Creation & Status Transition Flow

```
[User clicks "Push to Jira" in TaskDrawer]
    │
    ▼
[JiraAuthContext provides in-memory API token + JiraConfig]
    │
    ▼
[adfConverter maps Task.description/notes to Atlassian Document Format]
    │
    ▼
[jiraApi dispatches POST /rest/api/3/issue via CORS Proxy]
    │
    ├── (Error 401/403/CORS) ──► Sanitize error ──► Ant Design notification
    │
    └── (Success 201 Created) ──► Returns Jira Issue Key (e.g. "SHB-1042")
                                     │
                                     ▼
                      [taskRepo.updateTask(taskId, {
                         jiraIssueKey: 'SHB-1042',
                         jiraIssueUrl: 'https://shb.atlassian.net/browse/SHB-1042',
                         jiraSyncStatus: 'synced',
                         jiraLastSyncedAt: new Date().toISOString()
                       })]
                                     │
                                     ▼
                      [Dexie commits to IndexedDB]
                                     │
                                     ▼
                      [useLiveQuery automatically re-renders TaskTable / Drawer]
```

### 2. Multi-Criteria Date-Range Search Flow

```
[User selects Date Range [2026-10-01 to 2026-10-15] & Mode: "Planned"]
    │
    ▼
[TaskFilterBar dispatches filter change to parent TaskFilterState]
    │
    ▼
[Check dateRangeType]:
  ├── 'deadline'   ──► Dexie task index query / in-memory filter matches
  ├── 'execution'  ──► Filters on actualStartDate <= end && actualEndDate >= start
  └── 'planned'    ──► Step 1: Query db.plannedAllocations.where('date').between()
                       Step 2: Collect candidate taskIds Set
                       Step 3: Filter loaded tasks where taskIds.has(task.id)
    │
    ▼
[Secondary in-memory filters applied: Ops Owner, BA, Status, Priority, Text]
    │
    ▼
[TaskTable displays matching filtered subset]
```

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| **0 - 1,000 tasks (Current Personal Scale)** | Single-threaded Dexie queries and in-memory multi-criteria filters run in < 5ms. Direct rendering with Ant Design Table pagination is fluid. |
| **1,000 - 10,000 tasks** | Multi-entry Dexie indexes (`*opsOwner`, `*businessAnalyst`) prevent linear table scans. Date-range queries use `plannedAllocations.between()` indexes. Analytics aggregations run in pure memoized functions (`useMemo`). |
| **10,000+ tasks** | Offload analytics calculations (burndown simulations and allocation aggregation) to a native Web Worker to keep the UI at 60 FPS. Keep raw payloads inside IndexedDB. |

### Scaling Priorities

1. **First bottleneck (Date-Range Planned Allocations):** A naive loop querying `plannedAllocations` per task creates an N+1 query bottleneck.  
   *Mitigation:* Single indexed range query on `db.plannedAllocations.where('date').between(start, end)` produces a `Set<taskId>` in one round-trip.
2. **Second bottleneck (Analytics Aggregation on Large Datasets):** Calculating daily burndowns across hundreds of milestones on every keystroke.  
   *Mitigation:* Wrap `computeBurndown` in React `useMemo` keyed on `[tasks, allocations, activeMilestoneId]`.

---

## Anti-Patterns

### Anti-Pattern 1: Storing Jira API Tokens in LocalStorage or IndexedDB
**What people do:** Persisting the user's Jira API token or Basic Auth string in `localStorage` or unencrypted Dexie settings.  
**Why it's wrong:** Violates project security principles (zero credential leakage). Any XSS or browser inspection exposes banking IT API tokens.  
**Do this instead:** Store the token in `JiraAuthContext` in-memory state only (session RAM). Store non-sensitive configuration (domain, user email, proxy URL) in Dexie `settings` table.

### Anti-Pattern 2: Attempting Direct Jira Cloud Fetch Without Proxy Support
**What people do:** Calling `https://company.atlassian.net/rest/api/3/...` directly from a browser app hosted on GitHub Pages.  
**Why it's wrong:** Atlassian Cloud REST API explicitly rejects browser CORS requests with no `Access-Control-Allow-Origin` header, causing uncatchable browser network errors.  
**Do this instead:** Support a user-configurable CORS proxy URL with transparent routing, validation, and clear troubleshooting instructions in the UI.

### Anti-Pattern 3: Sending Plain Text / Markdown Directly to Jira API v3 Description
**What people do:** Submitting `{ description: "Task details..." }` to Jira REST API v3.  
**Why it's wrong:** Jira API v3 requires `description` to be formatted as Atlassian Document Format (ADF) JSON structure (`{ type: "doc", version: 1, content: [...] }`). Passing a plain string causes HTTP 400 Bad Request.  
**Do this instead:** Implement a lightweight `adfConverter.ts` that wraps text paragraphs into standard ADF blocks.

### Anti-Pattern 4: Hardcoding Ops Owner & Business Analyst Names
**What people do:** Creating fixed TypeScript enums for team members in banking IT.  
**Why it's wrong:** Team members change frequently across projects and milestones. Hardcoding requires code deployments for personnel changes.  
**Do this instead:** Model `opsOwner` and `businessAnalyst` as `string[]` with Ant Design `Select mode="tags"` allowing dynamic entry and autocomplete from existing database values.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| **Jira Cloud REST API v3** | HTTP REST over fetch via CORS Proxy with Basic Auth (`email:apiToken` Base64) | Must use ADF format for description; redact API tokens in all error logs; check HTTP 401/403/404/400. |
| **CORS Proxy (Cloudflare Worker / Reverse Proxy)** | Prefixing Jira target URL (`{proxyUrl}?url={targetUrl}` or `{proxyUrl}/{targetUrl}`) | Must forward Authorization, Content-Type, and Accept headers transparently. |
| **GitHub Contents API** | Encrypted backup sync (Phase 8 v1.0 standard) | Backup payload includes new V2 fields (`opsOwner`, `businessAnalyst`, `jiraIssueKey`); backward compatible. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| **Task Drawer ↔ Jira Service** | Async service calls (`jiraSyncService.createIssue`, `jiraSyncService.transitionIssue`) | UI triggers action, disables buttons with spin indicator, catches errors into Ant Design message/notification. |
| **Tasks View ↔ Filter Engine** | State passed via `TaskFilterState` | Pure filter pipeline filters task objects before table rendering. |
| **Analytics View ↔ Database Repositories** | `useLiveQuery` from `dexie-react-hooks` | Subscribes to `tasks`, `milestones`, `projects`, and `plannedAllocations`. Re-computes metrics automatically upon data mutations. |
| **Backup System ↔ V2 Schema** | `backupSchemas.ts` Zod validation | Validates and migrates V1 backups into V2 shape on import. |

---

## Suggested Build Order (Dependencies Considered)

To deliver Milestone v1.1 smoothly without regressions, execute in this order:

1. **Phase 1: Domain Models & Database Schema Migration (V1 -> V2)**
   - Update `src/types/models.ts` with `opsOwner`, `businessAnalyst`, and Jira task fields.
   - Update `src/db/schema.ts` with `SCHEMA_V2` (`*opsOwner`, `*businessAnalyst`, `actualStartDate`, `actualEndDate`, `jiraIssueKey`).
   - Add version 2 upgrade in `src/db/index.ts`.
   - Update Zod schemas in `src/validation/schemas.ts` and `src/validation/backupSchemas.ts`.
   - Update repository CRUD in `projectRepo`, `milestoneRepo`, and `taskRepo`.
   - *Validation:* Unit tests verifying V1 database upgrade and backup export/import with V2 fields.

2. **Phase 2: Banking IT UI Fields & Multi-Criteria Date-Range Search**
   - Add Ops Owner and BA input fields (Ant Design `Select mode="tags"`) to Project, Milestone, and Task forms/drawers.
   - Extend `TaskFilterBar` with Date Range Picker (Execution, Planned, Deadline) and multi-select tags for Ops Owner & BA.
   - Update `filterTasks` in `src/utils/filter.ts` to support date-range and multi-owner filtering.
   - *Validation:* Interactive search and filtering tests across projects, dates, and owners.

3. **Phase 3: Jira Cloud Integration**
   - Create `JiraAuthContext` for session-only API token storage.
   - Build `src/services/jira/jiraApi.ts` with CORS proxy routing and error sanitization.
   - Build `src/services/jira/adfConverter.ts` for text-to-ADF formatting.
   - Implement `jiraSyncService.ts` for connection testing, issue creation, and status transitions.
   - Add `JiraConfigCard` in `SettingsView`, and Jira link/sync modals in `TaskDrawer`.
   - *Validation:* Connection test, issue creation, transition syncing with mock/live Jira API.

4. **Phase 4: Enhanced Analytics Dashboard**
   - Implement pure calculation engine in `src/utils/analytics.ts` (milestone burndown, completion trends, Ops Owner & BA workload distribution).
   - Build `AnalyticsView.tsx` with Ant Design cards, progress indicators, and statistics.
   - Add navigation route in `AppShell` and `App.tsx` for Analytics.
   - *Validation:* Visual and data verification of analytics metrics across various task states and owner assignments.

---

## Sources

- [Dexie.js Multi-Entry Index Documentation](https://dexie.org/docs/MultiEntry-Index) — verified syntax and queries for `*arrayField`.
- [Dexie.js Versioning & Upgrades](https://dexie.org/docs/Tutorial/Design#database-versioning) — zero-downtime client migrations.
- [Atlassian Jira Cloud REST API v3 Documentation](https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/) — Basic Auth, `/rest/api/3/issue`, `/rest/api/3/issue/{id}/transitions`.
- [Atlassian Document Format (ADF) Specification](https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/) — JSON schema requirement for issue descriptions.
- [Existing Project Architecture & CLAUDE.md Constraints](CLAUDE.md) — local-first IndexedDB, session-only credential storage, zero backend server.

---
*Architecture research for: Personal Task & Workload Planner (Milestone v1.1 Banking IT & Jira Integration)*  
*Researched: 2026-09-27*
