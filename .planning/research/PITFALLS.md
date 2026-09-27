# Pitfalls Research: Banking IT Enhancements & Jira Integration

**Domain:** Banking IT Task Management, Jira Cloud REST API, Date-Range Workload Search & Workload Analytics
**Researched:** 2026-09-27
**Confidence:** HIGH

---

## Critical Pitfalls

### Pitfall 1: Browser CORS Rejection on Direct Jira Cloud REST API Calls

**What goes wrong:**
Calling Jira Cloud REST API (`https://<domain>.atlassian.net/rest/api/3/...`) directly from browser `fetch` throws `TypeError: Failed to fetch` or `Access to fetch at ... from origin 'https://...' has been blocked by CORS policy`. Network tab displays red preflight OPTIONS failure with no `Access-Control-Allow-Origin` header.

**Why it happens:**
Atlassian Jira Cloud REST API explicitly disallows arbitrary cross-origin browser requests. Atlassian server returns no CORS headers for non-Atlassian origins. Static PWA on GitHub Pages runs in browser without backend; direct browser fetch fails by web security specification.

**How to avoid:**
1. Support configurable CORS Proxy URL in Jira Settings (default empty).
2. For local dev, provide Vite `server.proxy` configuration targeting Jira Cloud.
3. For production PWA, provide clear setup documentation for private reverse proxy (e.g., private Cloudflare Worker, nginx intranet gateway).
4. Detect CORS preflight failure explicitly in API client: wrap error, identify `TypeError: Failed to fetch` with 0 status, display actionable notification explaining CORS proxy requirement with setup link.

**Warning signs:**
- Connection test button immediately throws `Failed to fetch` on HTTPS GitHub Pages but succeeds in curl or Postman.
- Console shows `No 'Access-Control-Allow-Origin' header is present on the requested resource`.

**Phase to address:**
Phase: Jira Integration Foundation (Settings & API Client)

---

### Pitfall 2: Token Leakage via Third-Party Public CORS Proxies

**What goes wrong:**
Developer or user configures public CORS proxy (e.g. `cors-anywhere.herokuapp.com`, `allorigins.win`) to bypass Atlassian CORS restrictions. Jira Basic Auth header (`Authorization: Basic base64(email:api_token)`) and corporate banking ticket metadata transit third-party proxy logs, exposing banking credentials and issue content to unknown servers.

**Why it happens:**
Developer seeks quickest path to solve Pitfall 1 without running server. In banking IT environment (SHB), passing auth tokens through public proxies breaches enterprise information security policies.

**How to avoid:**
1. Reject known public proxy domains at validation level in Settings form schema (`cors-anywhere`, `allorigins`, etc.).
2. Display prominent security callout in Jira Settings: explain proxy receives credentials; insist on personal/company-controlled proxy.
3. Support custom header forwarding options so private proxy can use pre-shared secret or run as isolated worker.

**Warning signs:**
- Settings input allows arbitrary URLs without warning about credential transmission.
- Outbound network requests send `Authorization` headers to unverified third-party hosts.

**Phase to address:**
Phase: Jira Integration Foundation (Settings & API Client)

---

### Pitfall 3: In-Memory Plaintext Jira API Token Storage vs. Backup Exposure

**What goes wrong:**
Jira API token stored unencrypted in IndexedDB or `localStorage`. Any malicious script, browser extension, or unencrypted backup export exposes Jira credentials. Alternatively, token omitted from encrypted backup forces user to re-enter credentials every time they switch machines.

**Why it happens:**
Treating Jira credentials like ordinary user preferences rather than sensitive secrets. Existing app stores settings in Dexie `settings` table unencrypted.

**How to avoid:**
1. Follow Phase 8 established pattern: Jira API token kept in session memory by default (ephemeral React state/Context).
2. If persisted locally, encrypt token using Web Crypto AES-GCM keyed from user master passphrase, or store in browser session storage only.
3. When exporting backup, ensure unencrypted token never serializes into plaintext JSON. If included in encrypted backup artifact, ensure backup password protects it.

**Warning signs:**
- Inspecting IndexedDB `settings` table shows raw Atlassian API token string.
- Exporting JSON backup reveals `jiraApiToken` in plaintext.

**Phase to address:**
Phase: Jira Integration Foundation (Settings & API Client)

---

### Pitfall 4: Atlassian Document Format (ADF) Payload Rejection in Jira REST API v3

**What goes wrong:**
Creating issue via Jira Cloud REST API v3 (`POST /rest/api/3/issue`) fails with HTTP 400 Bad Request: `{"errorMessages":[],"errors":{"description":"Operation value must be an Atlassian Document (ADF)"}}`.

**Why it happens:**
Jira REST API v2 accepted plain string/markdown in `description`. REST API v3 strictly mandates Atlassian Document Format (ADF) JSON structure (`{ type: "doc", version: 1, content: [...] }`). Passing string causes instant schema rejection.

**How to avoid:**
1. Write minimal, pure-TypeScript ADF builder helper (<40 LOC) converting plain text or basic Markdown lines into compliant ADF paragraphs.
2. Avoid importing bulky `@atlaskit/adf-utils` (>2MB bundle bloat, React 19 incompatibilities).
3. Validate outbound request body with Zod before dispatching fetch.

**Warning signs:**
- Issue creation succeeds in API v2 or Postman with string, fails in API v3 with HTTP 400.
- `description` field passed as string primitive in `POST` payload.

**Phase to address:**
Phase: Jira Task Creation & Transition Sync

---

### Pitfall 5: Hardcoded Jira Workflow Transition IDs

**What goes wrong:**
App assumes status transition "Done" has ID "31" or "5". Calling `POST /rest/api/3/issue/{key}/transitions` fails with HTTP 400: `Transition ID 'X' is not valid for this issue in its current state`.

**Why it happens:**
Jira workflow transition IDs are dynamic, project-specific, and issue-type-specific. Different banking projects have custom workflows (e.g. `Open -> In Progress -> Ready for Test -> UAT -> Done`). A transition valid from `In Progress` is invalid from `Open`.

**How to avoid:**
1. Never hardcode numeric transition IDs.
2. Query `GET /rest/api/3/issue/{key}/transitions` dynamically when user opens transition menu or updates local status.
3. Present available transitions returned by Jira API for that specific issue.
4. Support configurable default transition name mapping in Settings (e.g. map local "Resolved" to transition named "Resolve" or "Ready for Test").

**Warning signs:**
- Transition works on test project but fails with HTTP 400 on real bank project issue.
- Code contains constants like `const JIRA_DONE_TRANSITION_ID = 41`.

**Phase to address:**
Phase: Jira Task Creation & Transition Sync

---

### Pitfall 6: Dexie Schema Version Upgrade Breaking Existing v1.0 Databases & Backups

**What goes wrong:**
Incrementing Dexie database version from 1 to 2 with new indexes (`*opsOwners`, `*businessAnalysts`) causes app crashes or silent data omission:
1. Multi-tab upgrade blocks and hangs if another tab remains open.
2. Existing tasks/milestones/projects created in v1 have `undefined` for `opsOwners` and `businessAnalysts`; querying `.where('opsOwners')` ignores records with missing properties.
3. Restoring v1 backup file into v2 app fails Zod validation with `Required field missing: opsOwners` or `Invalid schema version`.

**Why it happens:**
Adding fields to TypeScript interface without migration transform in Dexie `.upgrade()`, and updating Zod schemas to require arrays instead of making them optional/defaulted.

**How to avoid:**
1. In Dexie schema v2, define `.version(2).stores(SCHEMA_V2).upgrade(async tx => { ... })`.
2. Inside `upgrade()`, populate existing `projects`, `milestones`, and `tasks` records with `opsOwners: []` and `businessAnalysts: []` if missing.
3. In backup validation schemas (`BackupTaskRecordSchema`, etc.), define fields as `z.array(z.string()).default([])` or optional with empty array fallback.
4. Update `CURRENT_SCHEMA_VERSION = 2` in `exportBackup.ts` while keeping `validateBackupPayload` backward-compatible with `schemaVersion === 1`.

**Warning signs:**
- Opening app after code update hangs at blank screen waiting for database.
- Importing an exported v1 backup fails validation with schema errors.
- Filter by Ops Owner excludes all pre-existing tasks even when "Unassigned" selected.

**Phase to address:**
Phase: Banking IT Domain Fields & Schema Migration

---

### Pitfall 7: Invalid Dexie Compound Indexing with Multi-Entry Arrays

**What goes wrong:**
Developer attempts to declare compound index combining scalar status with array tags in Dexie: `tasks: 'id, [status+*opsOwners]'`. Dexie throws error on initialization: `SchemaError: Unsupported index type for compound index`.

**Why it happens:**
IndexedDB and Dexie do NOT support compound multi-entry indexes. Multi-entry index (`*field`) can only exist as a single-property index. Combining array multi-entry indexing with another field in one native index is impossible in browser IndexedDB.

**How to avoid:**
1. Define separate single indexes: `tasks: 'id, projectId, milestoneId, status, priority, deadline, *opsOwners, *businessAnalysts'`.
2. In query layer, execute indexed query on most selective criteria first (e.g. status or date range), then filter secondary criteria (Ops Owner, BA) in-memory on the retrieved array.
3. For small-to-medium personal dataset (<10,000 tasks), in-memory predicate matching after indexed primary fetch is sub-millisecond.

**Warning signs:**
- App fails to start with Dexie `SchemaError`.
- Unit tests with `fake-indexeddb` crash on database instantiation.

**Phase to address:**
Phase: Banking IT Domain Fields & Schema Migration

---

### Pitfall 8: Conflating "Planned Execution Date" with "Task Deadline" in Search

**What goes wrong:**
User filters by date range `2026-10-01` to `2026-10-07` expecting tasks they plan to work on this week. App queries `tasks.deadline` instead of `plannedAllocations.date`. Result: tasks planned for work this week but due on `2026-10-31` are excluded; tasks due this week with zero hours planned are included.

**Why it happens:**
In typical task managers, "Date" only means Due Date. In this capacity planning app, work is planned across days via the `plannedAllocations` table. Date range search has two completely different meanings.

**How to avoid:**
1. Explicitly separate search modes in UI: "Planned Execution Window" vs "Task Deadline" vs "Actual Execution Dates".
2. When searching by Planned Execution Date:
   - Query `plannedAllocations.where('date').between(startDate, endDate, true, true)`.
   - Extract unique `taskId` list.
   - Fetch matching `tasks` by ID batch (`tasks.where('id').anyOf(taskIds)`).
3. Combine results according to active filter criteria.

**Warning signs:**
- Workload planner shows 16 hours planned for this week, but date-range search returns 0 tasks.
- Tasks with no allocations appear in "tasks planned for this week" view.

**Phase to address:**
Phase: Date-Range Task Search & Multi-Criteria Filtering

---

### Pitfall 9: Double-Counting Hours in Stakeholder Workload Aggregations

**What goes wrong:**
Task has 8 planned hours and 2 Business Analysts: `['Alice', 'Bob']`. Analytics dashboard calculates total BA workload by summing Alice (8h) + Bob (8h) = 16h total planned work. Overall capacity gauge shows 16h consumed when user only planned 8h of developer effort.

**Why it happens:**
Summing grouped sub-totals across multi-valued array tags. One task belongs to multiple stakeholders simultaneously.

**How to avoid:**
1. Separate stakeholder attribution from total capacity consumption:
   - "Capacity Consumed": sum of unique `PlannedAllocation.allocatedMinutes` (deduplicated by allocation ID). Always equals actual planned hours.
   - "Stakeholder Workload Distribution": show each BA's tagged task volume and hours as relative stakeholder engagement metric, clearly labeled as non-additive or tagged share.
2. In UI, display total planned hours once at top; show BA breakdown as separate ranking or percentage of tagged work.

**Warning signs:**
- Sum of individual BA hours in breakdown table exceeds 100% of user's total weekly capacity.
- User capacity shows overloaded (16h in 8h day) solely because task has 2 BAs.

**Phase to address:**
Phase: Enhanced Analytics & Dashboard

---

### Pitfall 10: Milestones Burndown Calculation from Point-in-Time Data

**What goes wrong:**
Burndown chart renders flat line or erratic jumps because the app has no backend event store recording task status history for every past calendar date.

**Why it happens:**
PWA is static local-first with no continuous server-side snapshotting. Existing `tasks` table stores only current `status`, `progress`, and optional `actualEndDate`.

**How to avoid:**
1. Build burndown from deterministic, locally available facts:
   - Scope line: total estimated minutes of all tasks belonging to milestone.
   - Ideal burndown line: linear slope from milestone creation/earliest task date to milestone deadline.
   - Planned burndown: cumulative subtraction of `PlannedAllocation` minutes by date.
   - Actual burndown: tasks marked `Done`/`Resolved` plotted on their `actualEndDate` (or `updatedAt` date).
2. Avoid claiming historical precision for dates before feature was introduced; fall back cleanly when `actualEndDate` is unrecorded.

**Warning signs:**
- Burndown line drops straight down to zero on today's date regardless of when tasks were actually finished.
- Tasks finished weeks ago appear as if burned down today.

**Phase to address:**
Phase: Enhanced Analytics & Dashboard

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Jira polling on interval (e.g. `setInterval` every 30s) | Keeps Jira statuses fresh without manual click | Hits Atlassian 429 rate limits; drains client battery; causes background network churn | NEVER. Use on-demand user refresh or refresh on task drawer open |
| In-memory filtering instead of Dexie indexes for dates | Quick to implement; avoids Dexie queries | Unusable on large allocation tables (>10,000 allocations); freezes UI thread | NEVER for `plannedAllocations.date`; acceptable only for secondary array tags (`opsOwners`) |
| Free-text string for Ops Owner & BA instead of array | Simple input field; no tag selector UI | Cannot filter by individual person when multiple names entered (e.g., "Alice / Bob"); corrupts analytics | NEVER. Must be `string[]` from day one |
| Storing Jira API token in `localStorage` | Survives page reload without credential prompting | Plaintext secret readable by any script/extension; violates security constraint | NEVER. Session memory or encrypted backup only |
| Skipping ADF builder and using Jira REST API v2 | Avoids writing ADF JSON document structure | Jira API v2 is deprecated for Cloud; description formatting inconsistent; breaks future Cloud migration | Only for temporary throwaway POC; production must use v3 ADF |
| Heavy charting library (`recharts`, `@ant-design/plots`) | Pre-packaged charts with animations | 1–5MB bundle bloat, React 19 peer conflict, broken jsdom unit tests | NEVER. Ant Design native components + custom SVG (<100 LOC) are sufficient |

---

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Jira Cloud REST API | Using `/rest/api/2/issue` expecting long-term Cloud support | Use `/rest/api/3/issue` with ADF v1 payload structure |
| Jira Cloud REST API | Missing `Accept: application/json` and `Content-Type: application/json` headers | Explicitly set both headers on all requests to prevent HTML error responses |
| Jira Cloud REST API | Basic Auth using Atlassian Account Password instead of API Token | Atlassian Cloud deprecated passwords in 2019; user must generate and supply API Token |
| Jira Cloud REST API | Querying `/rest/api/3/issue/{key}` with invalid project permissions | Catch 403 Forbidden; notify user token lacks browse permissions for specific Jira project |
| Jira Cloud REST API | Submitting `POST /rest/api/3/issue` without required custom fields configured in Jira project | Catch 400 Bad Request; parse Atlassian field error dictionary; highlight missing fields in UI |
| Jira Cloud CORS Proxy | Passing Basic Auth credentials through unencrypted HTTP proxy | Enforce HTTPS protocol on configured CORS proxy URL; disallow `http://` |
| Atlassian Rate Limiting | Firing parallel requests for 50 linked Jira tasks simultaneously | Implement concurrency queue (max 3 concurrent requests) with exponential backoff on HTTP 429 (`Retry-After` header) |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Live allocation table scan inside React component render | UI freezes on typing in search box; dropped frames | Wrap search and aggregation calculations in `useMemo` or run in Web Worker; query Dexie indexed keys | > 1,000 planned allocations |
| Re-fetching Jira issue details on every task table row render | Immediate Atlassian HTTP 429 Rate Limit; UI stutter | Cache Jira issue summary and status locally on `Task` record; fetch Jira API only on explicit user request | > 20 linked Jira tasks |
| Deep multi-criteria filter without debounce | Search input lags by 200–500ms per keystroke | Debounce text search by 250ms before executing Dexie query | > 300 tasks |
| Full table re-render on Ops Owner tag selection | Multi-select dropdown stutters when picking tags | Use React memoization on TaskTable rows and stable callback references | > 200 tasks in table |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Plaintext Jira token in unencrypted backup JSON | Exporting backup writes banking credentials to disk in cleartext | Exclude Jira token from export, OR require backup encryption with passphrase before serializing credentials |
| Token retention in Git or Vite environment files | Committing `VITE_JIRA_TOKEN` exposes personal banking credentials in repository | User enters token at runtime via Settings; zero tokens in build or env files |
| Logging full Jira HTTP headers in console | Debug `console.log(headers)` prints `Authorization: Basic ...` into browser logs | Sanitize/mask auth headers in all network logging utilities |
| Permissive CORS proxy accepting open relay | Private CORS proxy abused as open internet proxy | Advise user to restrict Cloudflare Worker CORS proxy to GitHub Pages origin (`https://<user>.github.io`) |
| Unsanitized Jira summary/description insertion | Potential stored XSS if Jira ticket content contains malicious script tags | Render Jira text content via standard React JSX text nodes (automatic HTML escaping) |

---

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Silent CORS failure | User clicks "Test Jira Connection", nothing happens or generic "Error" toast appears; user thinks app is broken | Display explicit diagnostic dialog: "Browser CORS blocked request. Configure CORS proxy URL in Settings" with copyable proxy template |
| Unclear inherited Ops Owner / BA | User looks at task, sees blank Ops Owner, doesn't realize task inherits "Alice" from Milestone | Display inherited tags with visual badge (e.g. `[Inherited: Alice]` in muted grey with tooltip) |
| Hard status mapping without override | App tries to auto-close Jira issue when task completed; fails or picks wrong workflow state | Present confirmation popover with dropdown of currently available Jira transitions before syncing |
| Overloaded date-range search inputs | Six separate date pickers confuse user ("Start date", "End date", "Planned start", "Planned end", "Deadline") | Single unified Date Range picker with a clear 3-way toggle: "Planned Execution" (default) / "Deadline" / "Actual Dates" |
| Empty analytics charts on fresh installation | Blank or broken dashboard charts when no historical data exists | Render helpful Ant Design empty states (`<Empty description="No tasks planned in this horizon" />`) with quick action to add task |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Jira Connection Test:** Often only tests valid URL syntax — verify actual authenticated `GET /rest/api/3/myself` call succeeds through proxy.
- [ ] **Create Jira Issue:** Often works for projects with default fields — verify error handling when target Jira project requires custom fields.
- [ ] **Jira Status Transition:** Often hardcodes transition name — verify dynamic transition list fetched from `/rest/api/3/issue/{key}/transitions`.
- [ ] **Dexie v2 Upgrade:** Often works on fresh DB — verify upgrade succeeds on database already filled with 50+ v1 tasks without losing existing data.
- [ ] **Backup Import Backward Compatibility:** Often only tests v2 backups — verify importing a v1.0 backup file succeeds without Zod validation failure.
- [ ] **Ops Owner / BA Filter:** Often only searches task level — verify filter includes tasks inheriting Ops Owner/BA from parent Milestone or Project.
- [ ] **Date Range Filter:** Often filters by task creation date or deadline — verify filtering by `PlannedAllocation` dates correctly isolates work scheduled in that window.
- [ ] **Analytics Workload Distribution:** Often double-counts multi-BA tasks — verify total developer hours match actual planned allocation sum.

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Dexie DB version upgrade hangs due to open tabs | LOW | Instruct user to close other open tabs of the app; reload page. Catch `on('blocked')` and show Ant Design alert banner. |
| Corrupt backup import due to schema mismatch | MEDIUM | Use pre-import snapshot rollback mechanism established in Phase 6/8 to immediately revert database state. |
| Atlassian HTTP 429 Rate Limit triggered | LOW | Back off network calls; clear auto-sync queue; show retry timer in UI based on `Retry-After` header. |
| CORS proxy URL misconfigured or offline | LOW | Fall back to offline mode for Jira features; allow user to edit or clear proxy URL in Settings; preserve local task data. |
| Unassigned tasks missed in Ops Owner analytics | LOW | Include explicit "Unassigned / No Stakeholder" category in breakdown charts so hours are never lost. |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Pitfall 6: Dexie Schema Version Upgrade & Backup Compatibility | Phase 1: Banking IT Domain Fields & Schema Migration | Automated test upgrading mock v1 DB to v2; test importing real v1 backup JSON into v2 schema |
| Pitfall 7: Invalid Dexie Compound Indexing with Arrays | Phase 1: Banking IT Domain Fields & Schema Migration | Verify Dexie schema definition contains only supported indexes; run unit tests in `fake-indexeddb` |
| Pitfall 1: Browser CORS Rejection on Jira Calls | Phase 2: Jira Integration Foundation (Settings & API Client) | Test connection with and without proxy; verify diagnostic error UI appears on CORS block |
| Pitfall 2: Token Leakage via Public CORS Proxies | Phase 2: Jira Integration Foundation (Settings & API Client) | Form validation test rejects known public proxy domains; verify security notice renders |
| Pitfall 3: Plaintext Jira Token Storage | Phase 2: Jira Integration Foundation (Settings & API Client) | Verify token absent from unencrypted IndexedDB export; verify session storage isolation |
| Pitfall 4: Atlassian Document Format (ADF) Rejection | Phase 3: Jira Task Creation & Transition Sync | Unit test ADF builder against Atlassian REST API v3 schema; mock HTTP 201 issue creation |
| Pitfall 5: Hardcoded Jira Workflow Transition IDs | Phase 3: Jira Task Creation & Transition Sync | Mock dynamic transitions response; verify UI renders available transitions from Jira payload |
| Pitfall 8: Conflating Planned Execution Date with Deadline | Phase 4: Date-Range Task Search & Multi-Criteria Filtering | Search query tests verify allocations joined with tasks; separate execution date from deadline |
| Pitfall 9: Double-Counting Hours in Stakeholder Analytics | Phase 5: Enhanced Analytics & Dashboard | Unit test aggregation math with multi-BA tasks; verify total planned hours invariant holds |
| Pitfall 10: Milestones Burndown Calculation Issues | Phase 5: Enhanced Analytics & Dashboard | Test burndown calculation with various task completion states and unrecorded end dates |

---

## Sources

- Atlassian Developer Documentation: [Jira Cloud REST API v3](https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/)
- Atlassian Developer Documentation: [Atlassian Document Format (ADF)](https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/)
- Atlassian Developer Documentation: [Security & API Tokens](https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/)
- Atlassian Developer Documentation: [Rate Limiting in Jira Cloud](https://developer.atlassian.com/cloud/jira/platform/rate-limiting/)
- Dexie.js Documentation: [Multi-entry Indexes and Version Upgrades](https://dexie.org/docs/MultiEntry-Index)
- Dexie.js Documentation: [Upgrading Database Schema](https://dexie.org/docs/Tutorial/Design#database-upgrades)
- MDN Web Docs: [Cross-Origin Resource Sharing (CORS)](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- Existing Codebase v1.0: `src/db/schema.ts`, `src/services/backup/validateBackup.ts`, `src/validation/backupSchemas.ts`

---
*Pitfalls research for: Banking IT Task Management, Jira Cloud REST API, Date-Range Workload Search & Workload Analytics*
*Researched: 2026-09-27*
