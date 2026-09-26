# Architecture Research

**Domain:** Personal offline-first task and workload planning PWA
**Researched:** 2026-09-26
**Confidence:** HIGH for browser/PWA/GitHub Pages constraints, MEDIUM for product-specific workload model

## Standard Architecture

### System Overview

Use a small local-first layered app. IndexedDB is the source of truth. Domain services are pure TypeScript where possible. UI never mutates IndexedDB directly. Dashboard, feasibility, and workload status are derived projections, not persisted state.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           React + Ant Design UI                             │
│  Projects  Milestones  Tasks  Capacity  Planner  Dashboard  Backup/Restore  │
└───────────────┬─────────────────────────────────────────────────────────────┘
                │ user commands + query subscriptions
┌───────────────▼─────────────────────────────────────────────────────────────┐
│                         Application Services                                │
│  commandService  queryService  backupService  githubBackupService  pwa hooks │
└───────────────┬─────────────────────────────────────────────────────────────┘
                │ validated commands / read models
┌───────────────▼─────────────────────────────────────────────────────────────┐
│                            Domain Core                                      │
│  hierarchy rules  planned-hours ledger  capacity engine  feasibility engine  │
│  dashboard projections  import validation  schema migration contracts        │
└───────────────┬─────────────────────────────────────────────────────────────┘
                │ repository interface
┌───────────────▼─────────────────────────────────────────────────────────────┐
│                           Local Persistence                                 │
│  IndexedDB object stores: projects, milestones, tasks, plannedHours,         │
│  weeklyCapacity, dateOverrides, settings, backupMeta, appMeta                │
└───────────────┬─────────────────────────────────────────────────────────────┘
                │ optional encrypted backup artifact only
┌───────────────▼─────────────────────────────────────────────────────────────┐
│                          External Boundary                                  │
│  GitHub Contents API: encrypted backup JSON, never plaintext task data       │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| UI routes/pages | Render screens, collect user input, show validation errors and derived read models | React route components using Ant Design |
| Feature components | Task tables/forms, capacity calendar, feasibility planner, dashboard cards, backup settings | Small React components grouped by feature |
| Command service | Own write use cases and transactions: create task, move task, allocate hours, import backup | TypeScript functions calling repositories inside one IndexedDB transaction where needed |
| Query service | Return read models for screens and invalidate/reload after writes | Thin hooks over repositories plus selector functions |
| Hierarchy domain | Enforce project, milestone, task containment rules and status rollups | Pure TypeScript functions |
| Planned-hours ledger | Store planned work by task and date; provide daily planned totals | IndexedDB rows keyed by UUID with unique logical key `taskId + date` |
| Capacity engine | Compute effective capacity for each date from weekly defaults plus overrides | Pure TypeScript functions over capacity records |
| Feasibility engine | Test whether unplanned estimated work fits a date range; suggest allocations to lowest-load eligible days | Pure deterministic function, no IndexedDB writes |
| Dashboard projection engine | Build today, urgent, overdue, 7-day, 14-day, and next-month views | Pure selectors over tasks, plannedHours, capacity |
| Backup service | Export/import full local snapshot, validate schema, run migrations, require confirmation before destructive restore | Browser-only TypeScript service |
| Crypto boundary | Encrypt/decrypt backup snapshots before file download or GitHub upload | Web Crypto `crypto.subtle`, PBKDF2, AES-GCM |
| GitHub backup adapter | PUT encrypted backup artifact to GitHub Contents API and track remote `sha` | Fetch wrapper isolated from domain |
| PWA shell | Manifest, installability, offline app shell cache, update prompt | Vite PWA/Workbox or hand-written service worker |
| Routing shell | Static-host compatible navigation under GitHub Pages repository subpath | `HashRouter` plus Vite `base: '/<repo>/'` |

## Recommended Project Structure

```
src/
├── app/                    # App bootstrap, router, providers, PWA registration
│   ├── App.tsx
│   ├── router.tsx
│   └── pwa.ts
├── db/                     # IndexedDB-only code
│   ├── schema.ts           # Store names, indexes, DB version
│   ├── migrations.ts       # Versioned DB upgrades
│   ├── repositories.ts     # Typed CRUD and transactions
│   └── snapshot.ts         # Export/import raw store snapshots
├── domain/                 # Pure business logic, no React, no IndexedDB, no fetch
│   ├── types.ts
│   ├── hierarchy.ts
│   ├── plannedHours.ts
│   ├── capacity.ts
│   ├── feasibility.ts
│   ├── projections.ts
│   └── validation.ts
├── services/               # Side-effect orchestration
│   ├── commands.ts
│   ├── queries.ts
│   ├── backup.ts
│   ├── cryptoBackup.ts
│   ├── githubContents.ts
│   └── storagePersistence.ts
├── features/               # Screen-level UI by product area
│   ├── projects/
│   ├── tasks/
│   ├── capacity/
│   ├── planner/
│   ├── dashboard/
│   └── backup/
├── ui/                     # Shared layout and small reusable controls
└── main.tsx
```

### Structure Rationale

- **domain/** stays dependency-free because feasibility and capacity rules need cheap tests and stable behavior.
- **db/** is the only IndexedDB boundary because schema/migration mistakes cause data loss.
- **services/** coordinates side effects because UI should not know transaction, encryption, or GitHub API details.
- **features/** groups React code by user workflow because this app is small and personal; a large cross-feature abstraction layer is waste.
- **ui/** contains only shared presentational pieces. Do not create generic form/table frameworks until duplication hurts.

## Local Data Boundaries

### Entity Boundary

Use normalized records with stable UUIDs. Store references, not nested copies. Hierarchy changes must update foreign keys only, never IDs.

| Store | Owns | Key fields | Notes |
|-------|------|------------|-------|
| `projects` | Project identity, status, dates, notes, document links | `id`, `name`, `status`, `startDate`, `targetDate`, `actualStartDate`, `actualEndDate`, `updatedAt` | No embedded milestones or tasks |
| `milestones` | Milestone identity within project | `id`, `projectId`, `name`, `status`, `targetDate`, `updatedAt` | `projectId` required |
| `tasks` | Task identity, estimate, status, priority, progress, hierarchy placement | `id`, `projectId?`, `milestoneId?`, `status`, `priority`, `estimateMinutes`, `deadline?`, `progress`, `updatedAt` | v1 task belongs to milestone, project, or neither. No task-to-task nesting. |
| `plannedHours` | Planned workload ledger at date granularity | `id`, `taskId`, `date`, `minutes`, `updatedAt` | Source for daily load; no derived totals stored |
| `weeklyCapacity` | Normal weekly capacity | `weekday`, `minutes` | Seven rows or one settings object; seven rows easier to query |
| `dateOverrides` | Per-date capacity exceptions | `date`, `capacityMinutes`, `reason`, `updatedAt` | Absolute capacity for date. Leave = 0, meeting day = reduced minutes, overtime = increased minutes |
| `settings` | User preferences and local-only sync config | `key`, `value` | GitHub owner/repo/path may live here; token/passphrase should not be persisted by default |
| `backupMeta` | Last backup state | `lastSnapshotAt`, `lastRemoteSha`, `lastRemotePath`, `lastLocalRevision` | Needed because GitHub updates require current `sha` |
| `appMeta` | DB/schema metadata | `schemaVersion`, `dataRevision`, `createdAt`, `updatedAt` | Increment `dataRevision` on every successful write |

### Boundary Rules

1. `milestone.projectId` must reference an existing project.
2. `task.milestoneId` implies `task.projectId` equals that milestone's `projectId`.
3. Standalone task has neither `projectId` nor `milestoneId`.
4. Project-level task has `projectId` and no `milestoneId`.
5. Deleting a project should be soft-delete or require explicit cascade confirmation. Default: block delete while milestones/tasks exist.
6. Completed/cancelled tasks can keep planned-hour rows for history, but dashboard projections should exclude `Done` and `Cancelled` unless explicitly showing history.
7. Derived values such as daily load, overload status, remaining estimate, and dashboard counts must not be stored.

## Planned-Hours Ledger

Use one row per task per date. This is minimal and enough for editable plans.

```ts
type PlannedHour = {
  id: string;
  taskId: string;
  date: string; // YYYY-MM-DD local date
  minutes: number;
  note?: string;
  createdAt: string;
  updatedAt: string;
};
```

Ledger rules:

- `minutes` must be a positive integer. Delete row when planned minutes become `0`.
- Enforce one logical allocation per `taskId + date`. If IndexedDB wrapper cannot enforce compound uniqueness cleanly, enforce in repository transaction.
- Daily planned load is `sum(plannedHours.minutes where date = X and task.status not Done/Cancelled)`.
- Task planned total is `sum(plannedHours.minutes where taskId = X)`.
- Remaining unplanned estimate is `max(task.estimateMinutes - plannedTotal, 0)`.
- Manual edits beat suggestions. Feasibility suggestions return proposed rows; command service writes only after user accepts.

Do not build append-only accounting in v1. Add immutable ledger events only if audit/history becomes a real requirement.

## Capacity and Feasibility Engine

### Effective Capacity

```
effectiveCapacity(date) = dateOverride.capacityMinutes ?? weeklyCapacity[weekday(date)].minutes
availableMinutes(date) = effectiveCapacity(date) - plannedMinutes(date)
loadStatus(date) = available / busy / overloaded
```

Suggested thresholds:

- `available`: `plannedMinutes < effectiveCapacity`
- `busy`: `plannedMinutes === effectiveCapacity`
- `overloaded`: `plannedMinutes > effectiveCapacity`
- `no-capacity`: `effectiveCapacity === 0`

### Feasibility Function

Make feasibility pure and deterministic.

```ts
type FeasibilityInput = {
  taskId: string;
  requiredMinutes: number;
  startDate: string;
  endDate: string;
  existingPlannedByDate: Record<string, number>;
  capacityByDate: Record<string, number>;
};

type FeasibilityResult = {
  feasible: boolean;
  shortageMinutes: number;
  proposedAllocations: Array<{ date: string; minutes: number }>;
};
```

Algorithm:

1. Build eligible dates from `startDate` through `endDate` inclusive.
2. For each date, compute `free = max(capacity - planned, 0)`.
3. Sort dates by lowest current load ratio first, then earliest date.
4. Allocate minutes into free capacity until required minutes reaches zero or no free capacity remains.
5. Return `feasible = remaining === 0`, shortage, and proposal.

This matches product value: expose overload early, suggest lowest-load eligible days. Keep scheduling greedy until it fails real use. Optimization solvers are overkill for one person and no dependencies/recurring tasks.

## Dashboard Projections

Dashboard is read-only projection layer. It should query raw records, then derive view models in memory.

| Projection | Input | Output |
|------------|-------|--------|
| Today | tasks, plannedHours for today, capacity today | planned work, free minutes, overdue items, started items |
| Urgent | open/in-progress tasks with deadline soon or overdue | sorted action list by overdue, deadline, priority |
| 7-day load | date range, plannedHours, capacity | daily planned/capacity/status bars |
| 14-day load | date range, plannedHours, capacity | same as 7-day, broader warning horizon |
| Next-month load | next calendar month or next 30 days | coarse workload map and overload count |
| Feasibility warnings | tasks with estimate/deadline and insufficient allocated/free time | warning list with shortage minutes |

Projection rule: stale projections are worse than slower views. Recompute from IndexedDB after each write or use an invalidation counter. Only cache if measured slow with thousands of rows.

## Data Flow

### Write Flow

```
[User action]
    ↓
[React feature component]
    ↓
[commandService]
    ↓
[domain validation: hierarchy/capacity/ledger rules]
    ↓
[IndexedDB transaction through repositories]
    ↓
[increment appMeta.dataRevision]
    ↓
[invalidate queries]
    ↓
[UI reloads read model]
```

### Read/Projection Flow

```
[Dashboard route]
    ↓
[queryService loads records]
    ↓
[domain projection functions compute load/urgent/feasibility]
    ↓
[React renders Ant Design cards/tables/calendar]
```

### Feasibility Planning Flow

```
[User chooses task/date range]
    ↓
[queryService loads task, plannedHours, capacity]
    ↓
[feasibility engine returns proposal]
    ↓
[UI shows feasible/shortage + proposed daily minutes]
    ↓
[user accepts]
    ↓
[commandService writes plannedHours rows]
```

### Backup Export Flow

```
[User requests backup]
    ↓
[backupService reads all stores]
    ↓
[validate snapshot envelope + schemaVersion]
    ↓
[JSON serialize]
    ↓
[encrypt with Web Crypto]
    ↓
[download file OR upload encrypted base64 content to GitHub]
```

### Backup Import Flow

```
[User selects encrypted backup]
    ↓
[decrypt locally]
    ↓
[parse and validate snapshot]
    ↓
[migrate snapshot to current schema in memory]
    ↓
[show destructive restore confirmation with counts]
    ↓
[replace stores in one transaction]
    ↓
[increment dataRevision and reload app]
```

Never merge GitHub backup automatically in v1. Treat GitHub as encrypted off-device backup, not collaborative sync.

## Schema and Migration Strategy

### IndexedDB Schema Versioning

- Use a single database, for example `taskPlannerDb`.
- Increment IndexedDB version for every object-store or index change.
- Keep migration functions ordered and idempotent where possible: `1 -> 2`, `2 -> 3`.
- On startup, open DB and run IndexedDB upgrade before rendering data-dependent routes.
- Store app-level `schemaVersion` in `appMeta` so export/import can validate snapshot compatibility.

### Snapshot Envelope

```ts
type BackupSnapshot = {
  format: "personal-task-planner-backup";
  snapshotVersion: number;
  appVersion: string;
  createdAt: string;
  dataRevision: number;
  stores: {
    projects: Project[];
    milestones: Milestone[];
    tasks: Task[];
    plannedHours: PlannedHour[];
    weeklyCapacity: WeeklyCapacity[];
    dateOverrides: DateOverride[];
    settings: Setting[];
    backupMeta: BackupMeta[];
    appMeta: AppMeta[];
  };
};
```

### Migration Rules

1. App migrations upgrade local IndexedDB in place.
2. Snapshot migrations upgrade imported backups in memory before replace.
3. Backup import validates required stores, UUID shape, date strings, non-negative minutes, enum values, and hierarchy references.
4. Failed import must leave existing local data unchanged.
5. Keep one pre-seeded default weekly capacity migration so first run has usable planning data.
6. Add a tiny migration self-check for each schema version because data loss here is expensive.

## Architectural Patterns

### Pattern 1: Pure Domain, Side-Effect Shell

**What:** Capacity, feasibility, hierarchy, and dashboard projection code accepts plain objects and returns plain objects. IndexedDB, React, and fetch live outside.

**When to use:** Every business rule that can be tested without browser APIs.

**Trade-offs:** Slight mapping code, much easier tests and safer migrations.

**Example:**

```ts
export function effectiveCapacity(date: string, weekly: WeeklyCapacity[], overrides: DateOverride[]) {
  const override = overrides.find((row) => row.date === date);
  if (override) return override.capacityMinutes;
  return weekly.find((row) => row.weekday === weekday(date))?.minutes ?? 0;
}
```

### Pattern 2: Repository-Owned Transactions

**What:** UI and domain never call IndexedDB directly. Repositories expose use-case-sized operations or transaction helpers.

**When to use:** Any write touching multiple stores, such as moving a task into a milestone or restoring a backup.

**Trade-offs:** More disciplined than direct calls, less ceremony than CQRS/event sourcing.

**Example:**

```ts
await db.transaction("readwrite", ["tasks", "plannedHours", "appMeta"], async (tx) => {
  await taskRepo.put(tx, updatedTask);
  await plannedHourRepo.replaceTaskPlan(tx, taskId, rows);
  await appMetaRepo.bumpRevision(tx);
});
```

### Pattern 3: Derived Read Models, Not Stored Aggregates

**What:** Daily load, overload flags, dashboard counts, remaining estimate, and feasibility warnings are computed from source records.

**When to use:** All dashboard and planning views in v1.

**Trade-offs:** Recompute cost rises with data size, but personal data volume is small. Avoids stale aggregate bugs.

### Pattern 4: Encrypted Backup Adapter

**What:** Export snapshot, encrypt in browser, then write opaque encrypted artifact to GitHub Contents API.

**When to use:** Manual backup, restore, and optional GitHub sync.

**Trade-offs:** User must manage passphrase. Losing passphrase means backup is unrecoverable. This is acceptable because plaintext must not enter a public repo.

## Encrypted GitHub Backup Boundary

### Artifact Shape

Store encrypted payload as JSON so future restore can identify parameters without source-code archaeology.

```ts
type EncryptedBackupFile = {
  format: "personal-task-planner-encrypted-backup";
  version: 1;
  kdf: { name: "PBKDF2"; hash: "SHA-256"; iterations: number; saltBase64: string };
  cipher: { name: "AES-GCM"; ivBase64: string };
  createdAt: string;
  ciphertextBase64: string;
};
```

### GitHub Contents API Flow

1. User provides owner, repo, path, token, and passphrase at runtime.
2. App exports snapshot and encrypts locally with Web Crypto.
3. App base64-encodes encrypted JSON file content.
4. App calls `PUT /repos/{owner}/{repo}/contents/{path}`.
5. If updating existing file, include last known or freshly fetched blob `sha`.
6. Store only non-secret sync metadata locally: path, last `sha`, last backup time. Do not commit or bundle token/passphrase.

Conflict policy for v1:

- If remote `sha` differs from local `backupMeta.lastRemoteSha`, stop and ask user to overwrite or download remote backup.
- Do not auto-merge encrypted backups.

## PWA Lifecycle

### Install and Offline

- Include a web app manifest linked from app HTML.
- Provide `name` or `short_name`, `start_url`, display mode, and 192/512 icons.
- Serve over HTTPS. GitHub Pages satisfies this.
- Service worker should precache the app shell so installed app opens offline.
- IndexedDB remains the working data store. Service worker cache is only for static assets, not source-of-truth data.

### Update Safety

Recommended v1 policy: prompt before applying a waiting service worker.

Reason: an automatic app-shell update can load code expecting a newer schema while a tab still has old in-memory state. Prompted reload after migrations is safer and still simple.

Flow:

```
[new service worker found]
    ↓
[show "Update available" banner]
    ↓
[user clicks reload]
    ↓
[activate new worker]
    ↓
[reload app]
    ↓
[open IndexedDB, run migrations]
    ↓
[render app]
```

Cache policy:

- Precache built static assets and offline fallback.
- Do not cache GitHub API responses with Cache API in v1. Use network fetch and clear errors.
- Do not cache decrypted backup content.
- On `QuotaExceededError`, show storage warning and recommend export backup.
- Request persistent storage with `navigator.storage.persist()` after first meaningful data exists.

## GitHub Pages Routing

Use hash routing for v1.

Why:

- GitHub Pages does not provide arbitrary SPA rewrite rules like Netlify `_redirects`.
- Hash route state is not sent to the server, so reloads do not 404.
- It is less elegant than clean URLs but removes a fragile `404.html` fallback hack.

Routing/deploy rules:

- Vite config uses `base: '/<repo>/'` for project Pages URL `https://<user>.github.io/<repo>/`.
- React uses `HashRouter`; routes look like `https://<user>.github.io/<repo>/#/tasks`.
- Manifest `start_url` should point at the repository base path, for example `/task-management/` or `./` after testing built output.
- Asset URLs must be relative to Vite base, not hard-coded to `/`.
- If clean URLs become mandatory later, add a GitHub Pages `404.html` fallback. Do not start there.

## Scaling Considerations

This product scales by record count and browser storage, not by users.

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-1k tasks | Current architecture. Recompute projections in memory. Block destructive deletes. Manual backup enough. |
| 1k-10k tasks | Add IndexedDB indexes for `deadline`, `status`, `projectId`, `milestoneId`, `date`, `taskId`. Memoize projection by `dataRevision + dateRange`. |
| 10k-100k tasks | Move heavy projections to Web Worker, paginate task tables, virtualize long lists, compact old completed plans. |
| Backup > 10 MB | Stream/chunk export if memory becomes visible problem. Still encrypt before upload. |
| Backup near 100 MB | GitHub Contents API becomes wrong storage; switch to GitHub Releases, Git LFS, or another user-owned storage. |

### Scaling Priorities

1. **First bottleneck:** dashboard projection over too many rows. Fix with indexes and range queries before adding state libraries.
2. **Second bottleneck:** large Ant Design tables. Fix with pagination/virtualization.
3. **Third bottleneck:** backup size and encryption memory. Fix with compression/chunking only after measured need.

## Anti-Patterns

### Anti-Pattern 1: UI Writes Directly to IndexedDB

**What people do:** Components call IndexedDB/object-store methods during button handlers.

**Why it's wrong:** Validation, migration assumptions, and revision updates scatter across UI. Data loss bugs become hard to audit.

**Do this instead:** Route all writes through command service and repository transactions.

### Anti-Pattern 2: Store Derived Dashboard State

**What people do:** Persist daily load, overload flags, or remaining estimate.

**Why it's wrong:** Every task estimate, status, capacity override, or planned-hour edit can make aggregates stale.

**Do this instead:** Persist source facts only. Compute projections on read.

### Anti-Pattern 3: Treat GitHub Sync as Live Multi-Device Database

**What people do:** Merge remote encrypted backup and local changes automatically.

**Why it's wrong:** Contents API stores files, not a conflict-free database. Encrypted blobs cannot be merged safely without decrypting both and resolving conflicts.

**Do this instead:** Treat GitHub as manual encrypted backup. Detect `sha` mismatch and ask user.

### Anti-Pattern 4: BrowserRouter on GitHub Pages Without Fallback

**What people do:** Use clean `/tasks` URLs on static GitHub Pages and expect reload to work.

**Why it's wrong:** Direct navigation requests `/tasks` from server, which returns 404 without rewrite support.

**Do this instead:** Use `HashRouter` for v1 with Vite `base` set to the repository subpath.

### Anti-Pattern 5: Auto-Apply Service Worker Updates Without Schema Plan

**What people do:** Force `skipWaiting` and reload tabs while old code/data assumptions are active.

**Why it's wrong:** App shell and IndexedDB schema can get out of sync, especially during migrations.

**Do this instead:** Prompt for update, reload cleanly, run migrations before rendering.

### Anti-Pattern 6: Persist Secrets in Source or Plain Settings

**What people do:** Put GitHub token or encryption passphrase into env files, source, local export, or backup metadata.

**Why it's wrong:** GitHub Pages bundles public client code, and a public repo can expose committed secrets.

**Do this instead:** Ask at runtime. If persistence is later needed, use browser credential/password manager patterns, not committed config.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| GitHub Pages | Static asset hosting under repository subpath | Requires Vite `base: '/<repo>/'`; use hash routing to avoid static route 404s |
| GitHub Contents API | Optional encrypted backup upload/download | `PUT /repos/{owner}/{repo}/contents/{path}` with base64 content; `sha` required for update |
| Browser Web Crypto | Client-side snapshot encryption | `crypto.subtle`; use PBKDF2 + AES-GCM; secure context required |
| Browser IndexedDB | Local source of truth | Async transactional object stores; quota/eviction varies by browser |
| Browser Storage API | Persistence/quota checks | Request persistent storage; handle `QuotaExceededError` |
| Service Worker / Cache API | Offline app shell | Cache built assets only; do not cache plaintext backup or GitHub API responses |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| UI to services | Function calls/hooks | UI receives view models and calls commands |
| Services to domain | Plain objects | Domain stays pure and testable |
| Services to repositories | Typed repository calls | Repositories own IndexedDB details and transactions |
| Domain to persistence | None | Avoid importing db/fetch/browser APIs into domain |
| Backup to GitHub | Encrypted artifact only | Plain snapshot exists only in memory during export/import |
| PWA to data | None | Service worker must not manage IndexedDB business data in v1 |

## Dependency-Driven Build Order

1. **Project shell and static hosting path**
   - Vite + React + Ant Design skeleton.
   - Vite `base` configured for GitHub Pages.
   - `HashRouter` proves reload-safe routes under repo subpath.
   - Reason: broken routing/deploy path poisons every later feature.

2. **IndexedDB schema, repositories, migrations, UUIDs**
   - Create stores, appMeta, dataRevision, default weekly capacity.
   - Add export-only raw snapshot early.
   - Reason: every feature depends on durable IDs and safe persistence.

3. **Hierarchy CRUD**
   - Projects, milestones, tasks, statuses, dates, notes, document links.
   - Enforce reference rules.
   - Reason: capacity planning needs tasks with estimates and deadlines.

4. **Planned-hours ledger**
   - Add plannedHours rows, daily totals, task planned total.
   - Reason: capacity and dashboard both depend on planned load.

5. **Capacity configuration**
   - Weekly defaults and date overrides.
   - Reason: feasibility engine needs effective capacity by date.

6. **Feasibility engine and planner UI**
   - Pure engine first, then accept-proposal write flow.
   - Reason: core product value depends on fit/shortage and suggested allocation.

7. **Dashboard projections**
   - Today, urgent, 7-day, 14-day, next-month.
   - Reason: projections need tasks, ledger, and capacity complete.

8. **Backup import/export**
   - Snapshot validation, migration, destructive restore confirmation.
   - Reason: data safety needed before broad use and before cloud backup.

9. **Encrypted GitHub backup**
   - Web Crypto envelope, Contents API adapter, `sha` conflict handling.
   - Reason: builds on local backup and must never upload plaintext.

10. **PWA install/offline/update hardening**
    - Manifest, icons, service worker precache, update prompt, persistent storage request.
    - Reason: after core shell paths and data safety exist, make install/offline reliable.

## Sources

- MDN IndexedDB API: `https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API` — HIGH confidence. IndexedDB supports large structured client-side data, async transactions, object stores, indexes, structured clone, and worker/window access.
- MDN Storage quotas and eviction criteria: `https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria` — HIGH confidence. Browser storage can be best-effort or persistent; eviction varies; `navigator.storage.persist()` and `estimate()` should be used for data-safety UX.
- MDN Making PWAs installable: `https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable` — HIGH confidence. Manifest requirements, HTTPS/local install constraints, and service worker relationship verified.
- MDN Web Crypto API: `https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API` — HIGH confidence. `crypto.subtle`, secure context, PBKDF2, and AES-GCM support verified.
- GitHub REST API Contents documentation: `https://docs.github.com/en/rest/repos/contents?apiVersion=2022-11-28` — HIGH confidence. `PUT /repos/{owner}/{repo}/contents/{path}`, base64 content, update `sha`, token use, and Contents API size caveat verified.
- Vite static deploy guide for GitHub Pages: `https://vite.dev/guide/static-deploy.html#github-pages` — HIGH confidence. GitHub Pages repo subpath requires Vite `base: '/<REPO>/'`; build output defaults to `dist`.
- Vite PWA guide: `https://vite-pwa-org.netlify.app/guide/` — MEDIUM confidence. Plugin role, Workbox generation, registration, and update behavior verified from official project docs.
- React Router HashRouter API: `https://api.reactrouter.com/v8/functions/react-router.HashRouter.html` — HIGH confidence. Hash location remains client-side and avoids server rewrite needs.
- React Router prerendering/static hosting guidance: `https://reactrouter.com/how-to/pre-rendering` — MEDIUM confidence. Useful for static fallback concepts, but hash routing is simpler for this GitHub Pages app.

---
*Architecture research for: Personal offline-first task and workload planning PWA*
*Researched: 2026-09-26*
