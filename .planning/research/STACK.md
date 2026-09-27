# Stack Research: Banking IT Enhancements & Jira Integration

**Domain:** Personal Task & Workload Planner (Banking IT Extension & Jira Cloud Integration)
**Researched:** 2026-09-27
**Confidence:** HIGH

## Executive Recommendation

Milestone v1.1 requires **ZERO new npm packages**. All planned capabilities—Jira Cloud REST API v3 integration, CORS proxy support, Ops Owner / BA field indexing, date-range task search, and workload/burndown analytics—can and should be implemented using the existing validated runtime:

1. **Jira Cloud REST API v3 & CORS Proxy:** Native browser `fetch` + Web API Base64 encoding + Zod response validation. No external Jira client SDK.
2. **Ops Owner & BA Fields:** Native TypeScript interfaces + Zod schemas + Dexie multi-entry indexes (`*opsOwners`, `*businessAnalysts`).
3. **Date-Range Task Indexing:** Dexie 4 compound & range queries on existing `plannedAllocations` table (`date`) and updated `tasks` table (`deadline`, `actualStartDate`, `actualEndDate`).
4. **Analytics & Burndown Visualizations:** Existing Ant Design 6 components (`<Progress>`, `<Statistic>`, `<Table>`, `<Segmented>`, `<Tooltip>`) combined with lightweight native SVG components (<100 LOC) for burndown lines and trends. Avoid heavy charting packages.

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| Native `fetch` + Web Crypto / Base64 | Browser Native (ES2024) | Jira Cloud REST API v3 HTTP requests & Basic Auth | Native `fetch` handles all REST calls. Basic Auth credentials (`email:api_token`) encoded via standard `btoa` / `Uint8Array`. No third-party HTTP client or Jira SDK needed. | HIGH |
| Dexie | 4.4.6 (Installed) | IndexedDB schema v2 with multi-entry & range indexing | Dexie supports multi-entry array indexing (`*opsOwners`, `*businessAnalysts`) and range queries (`.between()`). Schema upgrade from v1 to v2 handles migration without data loss. | HIGH |
| Zod | 4.6.5 (Installed) | Schema validation for Jira API payloads, search filters, and backup import/export v2 | Validates Atlassian Document Format (ADF) payloads, Jira issue and transition schemas, and enforces strict types at external boundaries. | HIGH |
| Ant Design | 6.6.5 (Installed) | Dashboard analytics, filter bars, tags, and progress displays | Provides `<Progress>`, `<Statistic>`, `<Table>`, `<Badge>`, `<Segmented>`, and `<Tooltip>` out-of-the-box. Fully styled, accessible, dark-mode aware. | HIGH |
| Native React SVG | React 19 Native | Burndown charts, burnup trends, workload distribution bars | Custom SVG (<100 LOC) renders scalable vector lines and area fills with zero runtime bundle bloat, zero React 19 compatibility hurdles, and zero test shimming. | HIGH |
| Dayjs | 1.11.23 (Installed) | Date-range calculations, burndown date steps, ISO/YYYY-MM-DD parsing | Existing standard for all date operations across the planner. Keeps dates as `YYYY-MM-DD` strings to avoid timezone drift. | HIGH |

### Supporting Libraries (Already Present in Project)

| Library | Version | Purpose | When to Use | Confidence |
|---------|---------|---------|-------------|------------|
| `@ant-design/icons` | 6.3.4 (Installed) | Icons for Jira links, Ops Owner/BA avatars, trends, and filter tags | UI actions, external link indicators, analytics status badges. | HIGH |
| `dexie-react-hooks` | 4.4.0 (Installed) | Reactive data queries (`useLiveQuery`) | Reactively binds filtered task lists and analytics aggregations to local IndexedDB changes. | HIGH |
| `fake-indexeddb` | 6.2.5 (Dev, Installed) | Dexie v2 migration and query testing | Unit and integration testing of Dexie schema upgrades and multi-entry search queries in Vitest. | HIGH |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Vitest 5.0.2 | Test Dexie v2 migrations, date-range search utilities, Jira API mock calls | Run with existing `npm test` pipeline. |
| TypeScript 7.0.2 | Enforce strict typing on Banking IT fields, ADF payloads, Jira API contracts | Enforces `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`. |

---

## Installation

No new dependencies required. Package manifest remains untouched:

```bash
# Verify existing installation integrity
npm ls --depth=0
```

---

## Alternatives Considered

| Recommended | Alternative | Why Not Recommended |
|-------------|-------------|---------------------|
| Native `fetch` with Basic Auth | `jira-client` or `@atlassian/jira-cloud-rest-client` | Most Jira SDKs are Node.js-only (rely on `fs`, `http`, or Node streams). They do not run in a browser PWA, require heavy polyfills, and fail under Vite build. |
| User-configured CORS Proxy URL via `fetch` | Bundled serverless proxy or backend service | Violates constraint: 100% local static PWA hosted on GitHub Pages. App cannot host a centralized backend. Users supply their own proxy URL (e.g. Cloudflare Worker or local reverse proxy) or intranet gateway. |
| Dexie multi-entry index (`*opsOwners`) | Serialized string search (`opsOwners.includes(...)` in JS memory) | In-memory filtering works for small datasets but misses indexed performance on larger sets and prevents fast IndexedDB compound queries. Dexie multi-entry indexes are native to IndexedDB. |
| Ant Design 6 + Native SVG | `@ant-design/plots` (`@antv/g2plot`) | `@ant-design/plots` adds 5–10MB to the bundle, depends on heavy canvas engines that require canvas mocks in jsdom/Vitest, and has known peer-dependency frictions with React 19. |
| Ant Design 6 + Native SVG | `recharts` / `chart.js` | Adds 400KB–1MB dependency footprint for 2–3 simple line/bar graphs. Native SVG takes <100 lines of code, renders instantly, supports CSS dark mode natively, and tests easily in Vitest without canvas mocking. |
| ADF 5-line generator helper | `@atlaskit/adf-utils` | Atlaskit packages pull in massive Atlassian ecosystem dependencies, styled-components, and webpack-era globals incompatible with modern Vite + React 19. REST API v3 description requires only a simple JSON tree. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `@ant-design/plots` / `@antv/*` | Massive bundle size (>5MB), canvas dependency breaks jsdom tests without canvas binary shims, frequent React 19 peer warnings. | Ant Design 6 native components (`<Progress>`, `<Table>`) + lightweight custom React `<svg>`. |
| `jira-client` / Node Jira SDKs | Built for Node.js runtimes; crashes in browser due to missing Node builtins (`net`, `tls`, `stream`). | Native browser `fetch` with typed REST API v3 service module. |
| `@atlaskit/editor-core` / `@atlaskit/adf-utils` | Huge dependency trees, React 18/19 peer issues, tightly coupled to Atlassian design system. | Plain TypeScript factory helper producing standard ADF v1 JSON structure. |
| Storing Jira API Tokens in `localStorage` or unencrypted IndexedDB | High security risk. Violates project credential safety invariant (Phase 8 established PAT/secret security model). | In-memory session-only storage (React Context) with option to include in client-side encrypted backup artifact. |
| Hardcoding a public CORS proxy | Public CORS proxies (e.g. `cors-anywhere.herokuapp.com`) leak Jira API tokens and sensitive company issue data to third-party logs. | Allow user to specify custom CORS proxy endpoint (e.g., private Cloudflare Worker or company intranet proxy) and default to direct fetch. |
| Changing existing `SCHEMA_V1` in place without migration | In-place schema edits corrupt existing IndexedDB data for users upgrading from v1.0. | Declare `this.version(2).stores(SCHEMA_V2)` in Dexie with backward-compatible migration. |

---

## Stack Patterns by Feature

### 1. Jira Cloud REST API v3 & CORS Proxy Architecture

#### Authentication & Endpoint Contracts
- Jira Cloud REST API v3 uses HTTP Basic Authentication with user's Atlassian account email and API token:
  ```typescript
  const credentials = btoa(`${email}:${apiToken}`);
  const headers = {
    'Authorization': `Basic ${credentials}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };
  ```
- **Connection Test:** `GET /rest/api/3/myself` (validates domain, email, and token).
- **Issue Creation:** `POST /rest/api/3/issue` with ADF v1 formatted description.
- **Issue Transitions:**
  - `GET /rest/api/3/issue/{issueIdOrKey}/transitions` (fetches available target statuses).
  - `POST /rest/api/3/issue/{issueIdOrKey}/transitions` with `{ "transition": { "id": transitionId } }`.

#### Browser CORS Handling
- Atlassian Jira Cloud REST API v3 does **not** emit permissive CORS headers (`Access-Control-Allow-Origin: *`) for browser origins outside Atlassian domains.
- A direct browser `fetch` to `https://<domain>.atlassian.net` from `https://<username>.github.io` or `http://localhost:5173` fails with a CORS network error.
- **Pattern:**
  ```typescript
  function buildJiraUrl(baseUrl: string, endpoint: string, corsProxyUrl?: string): string {
    const rawTargetUrl = `${baseUrl.replace(/\/+$/, '')}${endpoint}`;
    if (!corsProxyUrl || !corsProxyUrl.trim()) {
      return rawTargetUrl;
    }
    // If proxy URL ends with query param (e.g. https://my-worker.dev/?url=)
    if (corsProxyUrl.includes('?')) {
      return `${corsProxyUrl}${encodeURIComponent(rawTargetUrl)}`;
    }
    // If proxy URL is path prefix (e.g. https://my-proxy.dev/https://domain.atlassian.net)
    return `${corsProxyUrl.replace(/\/+$/, '')}/${rawTargetUrl}`;
  }
  ```
- **Error Handling:** When `fetch` throws `TypeError: Failed to fetch` on direct call, provide specific UI guidance in Ant Design Modal/Alert pointing user to configure CORS proxy in Settings.

#### Atlassian Document Format (ADF) Helper
Jira REST API v3 requires `description` as ADF JSON. Keep it minimalist:
```typescript
export function textToAdf(text: string) {
  if (!text.trim()) return undefined;
  return {
    type: 'doc',
    version: 1,
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text }],
      },
    ],
  };
}
```

---

### 2. Dexie Schema v2 & Multi-Entry Indexing

#### Schema Upgrade Definition
In `src/db/schema.ts`:
```typescript
export const SCHEMA_V1 = {
  projects: 'id, status, deadline',
  milestones: 'id, projectId, status, deadline',
  tasks: 'id, projectId, milestoneId, status, priority, deadline',
  capacityRules: 'id, &dayOfWeek',
  capacityOverrides: 'id, date',
  plannedAllocations: 'id, taskId, date',
  settings: 'key',
  backupMetadata: 'id, timestamp',
} as const;

export const SCHEMA_V2 = {
  ...SCHEMA_V1,
  projects: 'id, status, deadline, *opsOwners, *businessAnalysts',
  milestones: 'id, projectId, status, deadline, *opsOwners, *businessAnalysts',
  tasks: 'id, projectId, milestoneId, status, priority, deadline, actualStartDate, actualEndDate, jiraIssueKey, *opsOwners, *businessAnalysts',
} as const;
```

In `src/db/index.ts`:
```typescript
this.version(1).stores(SCHEMA_V1);
this.version(2).stores(SCHEMA_V2).upgrade((tx) => {
  // Dexie automatically indexes existing records.
  // Optional migration defaults can be placed here if necessary.
});
```

#### Multi-Entry Index Mechanism
- Prefixing an index with `*` (`*opsOwners`) creates a multi-entry index in IndexedDB.
- When `task.opsOwners = ['Alice', 'Bob']`, Dexie indexes both `'Alice'` and `'Bob'`.
- Querying by owner:
  ```typescript
  // Return all tasks assigned to Alice
  const aliceTasks = await db.tasks.where('opsOwners').equals('Alice').toArray();
  ```

---

### 3. Date-Range Task Search Strategy

To search tasks across execution and planned dates:
1. **Planned Execution Date Range:**
   Query `plannedAllocations` table:
   ```typescript
   const allocations = await db.plannedAllocations
     .where('date')
     .between(startDate, endDate, true, true)
     .toArray();
   const taskIdsFromPlanned = new Set(allocations.map(a => a.taskId));
   ```
2. **Task Deadline & Actual Dates:**
   Indexed on `tasks` table:
   - `deadline` range: `db.tasks.where('deadline').between(startDate, endDate, true, true)`
   - `actualStartDate` range: `db.tasks.where('actualStartDate').between(startDate, endDate, true, true)`
3. **Compound In-Memory Filtering:**
   For multi-criteria filters (Dates AND Status AND Project AND Ops Owner AND BA), use Dexie index for the narrowest filter (or date-matched IDs), then apply clean in-memory predicate matching with existing `filterTasks` utility.

---

### 4. Analytics & Burndown Visualizations

Avoid heavy third-party charting libraries. Use:

1. **Status Distribution & Ratios:**
   - Ant Design `<Progress type="line" percent={completedPct} success={{ percent: resolvedPct }} />`
   - Multi-segment progress bar or color-coded Ant Design `<Tag>` summaries.
2. **Workload Allocation by Person (Ops Owner / BA):**
   - Ant Design `<Table>` with custom column rendering `<Progress percent={personHours / totalHours * 100} />`.
3. **Burndown & Completion Trend Chart:**
   - A lightweight (<100 LOC) pure React SVG component:
     - Inputs: array of `{ date: string, plannedHours: number, remainingEstimate: number, completedCount: number }`.
     - SVG `<svg viewBox="0 0 600 240">` with `<polyline points="..." fill="none" stroke="#1677ff" />`.
     - Tooltips rendered using Ant Design's `<Tooltip>` or native SVG `<title>`.
     - 0 dependencies, 0 extra KB in bundle, 100% testable in Vitest.

---

## Version Compatibility

| Package | Version | Compatibility Notes |
|---------|---------|---------------------|
| Dexie | 4.4.6 | Supports schema versioning (`version(2)`), multi-entry indexes (`*fieldName`), and range queries (`between`). |
| React | 19.3.0 | Compatible with all native SVG rendering, Ant Design 6.6.5, and existing hook architecture. |
| Ant Design | 6.6.5 | Fully supports React 19. Component suite covers all UI requirements for settings, tables, progress bars, and modals. |
| Zod | 4.6.5 | Runtime parsing for Jira v3 response schemas and backup migration v2 validation. |
| Dayjs | 1.11.23 | Compatible with all date calculations for burndown horizons and date-range filters. |

---

## Sources

- https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/ — Jira Cloud REST API v3 overview & API contracts.
- https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/ — Issue creation, transitions, and field structures.
- https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/ — Atlassian Document Format (ADF) schema specification.
- https://dexie.org/docs/MultiEntry-Index — Dexie multi-entry array indexing specification (`*field`).
- https://dexie.org/docs/Tutorial/Design#database-versioning — Dexie database upgrade and version migration guide.
- https://ant.design/components/progress/ — Ant Design Progress component documentation and custom styling.

---
*Stack research for: Personal Task & Workload Planner (v1.1 Banking IT Enhancements & Jira Integration)*
*Researched: 2026-09-27*
