# Project Research Summary

**Project:** Personal Task & Workload Planner (Milestone v1.1 Banking IT Enhancements & Jira Integration)
**Domain:** Personal offline-first task & capacity planning (Banking IT development / Jira Cloud)
**Researched:** 2026-09-27
**Confidence:** HIGH

## Executive Summary

Milestone v1.1 extends personal workload planner with Banking IT operational fields (Ops Owner and Business Analyst tracking), Jira Cloud REST API v3 two-way bridge, execution date-range search, and stakeholder workload analytics. Architecture remains 100% offline-first and client-side, running on GitHub Pages without application server. Dexie IndexedDB remains authoritative local data store.

Key technical decision: **Zero new npm packages**. All capabilities build directly on existing runtime (React 19, Ant Design 6, Dexie 4, Zod 4, Dayjs, Web Crypto). Jira REST API v3 integration uses native browser fetch with Basic Auth. Analytics and burndown charts use existing Ant Design components combined with lightweight (<100 LOC) native SVG vector paths, avoiding heavy charting dependencies and canvas test shims.

Primary technical risks: Atlassian browser CORS restrictions, secret token safety, Dexie v2 schema migration regressions, and conflating task deadlines with planned daily execution dates. All risks have verified mitigations: user-configurable CORS proxy routing with security domain filtering, in-memory session token isolation, backward-compatible Dexie v2 upgrade transforms with Zod fallback defaults, and two-phase allocation-to-task index joins.

## Key Findings

### Recommended Stack

Existing project stack fully satisfies v1.1 requirements without package manifest changes. Full analysis in `.planning/research/STACK.md`.

**Core technologies:**
- **Native fetch + Web Crypto / Base64:** Jira Cloud REST API v3 HTTP client — Basic Auth encoding via btoa, native browser requests without third-party Node-dependent Jira SDKs.
- **Dexie 4.4.6 (Installed):** Schema v2 migration with multi-entry indexing — enables *opsOwners and *businessAnalysts array queries and date range lookups.
- **Zod 4.6.5 (Installed):** Runtime schema validation — validates Jira REST API payloads, Atlassian Document Format (ADF) output, and v1/v2 backup imports.
- **Ant Design 6.6.5 (Installed):** UI presentation — native <Progress>, <Statistic>, <Table>, <Segmented>, <Tooltip>, and tag-based selectors.
- **Native React SVG (ES2024 / React 19):** Burndown and velocity visualizations — lightweight vector rendering under 100 LOC, zero bundle bloat, zero jsdom canvas mocking.
- **Dayjs 1.11.23 (Installed):** Date math — ISO date ranges and YYYY-MM-DD step calculations preventing timezone drift.

### Expected Features

Detailed feature landscape in `.planning/research/FEATURES.md`.

**Must have (table stakes):**
- **Ops Owner & BA fields across hierarchy:** Project, Milestone, and Task attribution supporting multiple stakeholders with inheritance and visual parent fallback pills.
- **Jira Cloud connection & test:** Domain, email, session API token, and CORS proxy configuration with GET /rest/api/3/myself diagnostic test.
- **Create Jira issue from Task:** Generates Jira Cloud ticket via POST /rest/api/3/issue with ADF description; links back key and browse URL.
- **Link existing Jira issue:** Associates task to issue key (e.g. SHB-1234), caching summary and status.
- **Jira status transition execution:** Dynamic fetch of valid transitions via GET /rest/api/3/issue/{key}/transitions and one-click execution.
- **Execution date-range task search:** Queries plannedAllocations table across selected date window to find tasks scheduled for work, distinct from deadline dates.
- **Multi-criteria task filtering:** Compound filter bar covering status, priority, project, milestone, Ops Owner, BA, and Jira link state.
- **Milestone burndown & status distribution:** Status distribution bars and completion tracking against milestone scope.
- **Workload distribution by BA & Ops Owner:** Pivot breakdown of planned hours and active tasks grouped by stakeholder.
- **Standup summary clipboard exporter:** One-click Markdown/text export of planned/completed work for banking standup updates.

**Should have (competitive differentiators):**
- **Planned Execution Date vs. Deadline Date separation:** Independent filtering modes for when work is executed versus when deliverables are due.
- **Stakeholder capacity allocation matrix:** Single-developer bottleneck identification across multiple banking stakeholders without enterprise BI tools.
- **Local-first Jira bridge with private proxy support:** Direct private sync without third-party multi-tenant SaaS intermediation.

**Defer (v2+):**
- **Bulk Jira transitions:** Batch status updates across multiple tasks after milestone completion.
- **Custom Jira field mapping:** Mapping arbitrary corporate Jira custom fields to local task attributes.
- **Saved filter combinations:** Persisting named filter presets in IndexedDB.
- **Real-time Jira background webhooks:** Excluded (anti-feature; violates offline/no-backend constraints).
- **Full ADF WYSIWYG editor:** Excluded (anti-feature; use plain text/Markdown to ADF conversion).

### Architecture Approach

System architecture strictly extends v1.0 offline-first patterns. Detailed component diagrams and data flows in `.planning/research/ARCHITECTURE.md`.

**Major components:**
1. **Dexie Data Layer V2 (`src/db/`):** Upgrades database schema to version 2; adds *opsOwners, *businessAnalysts, actualStartDate, actualEndDate, jiraIssueKey indexes; maintains non-destructive backward compatibility.
2. **Jira Service & Context Layer (`src/services/jira/`, `src/context/`):** JiraAuthContext isolates API token in session RAM; jiraApi routes requests via user-configured CORS proxy and sanitizes error logs; adfConverter formats ADF JSON; jiraSyncService manages issue lifecycle.
3. **Search & Filter Engine (`src/utils/filter.ts`, `taskRepo.ts`):** Two-phase query engine joining indexed plannedAllocations date ranges with task models and secondary in-memory multi-owner predicates.
4. **Analytics Calculation Engine (`src/utils/analytics.ts`):** Pure functional aggregations for milestone burndowns, completion velocities, and deduplicated stakeholder workload allocations.
5. **Presentation Components (`src/views/`, `src/components/`):** AnalyticsView, JiraConfigCard, JiraIssueLinkModal, JiraStatusSyncModal, and updated TaskFilterBar.

### Critical Pitfalls

Complete analysis in `.planning/research/PITFALLS.md`.

1. **Browser CORS rejection on direct Jira Cloud calls:** Atlassian Cloud blocks browser cross-origin requests. *Prevention:* Support user-configured CORS proxy URL (e.g. private Cloudflare Worker); detect CORS preflight failures (TypeError: Failed to fetch); display actionable diagnostic alert with setup documentation.
2. **Token leakage via public CORS proxies:** Public proxies inspect auth headers. *Prevention:* Reject known public proxy hosts in validation schemas (cors-anywhere, allorigins); require user-controlled proxy; keep token in session RAM.
3. **ADF JSON schema rejection in Jira API v3:** API v3 rejects string descriptions with HTTP 400. *Prevention:* Lightweight pure-TS helper formatting plain text/Markdown into ADF v1 doc paragraphs; validate payload with Zod before fetch.
4. **Hardcoded Jira workflow transition IDs:** Dynamic workflows across banking Jira projects break on hardcoded IDs. *Prevention:* Fetch valid transitions dynamically for specific issue via GET /rest/api/3/issue/{key}/transitions; render dynamic action dropdown.
5. **Dexie v2 migration regressions & backup incompatibility:** Adding fields without migration transforms breaks v1 database instances and backup imports. *Prevention:* Provide Dexie .upgrade() transform setting empty arrays for missing fields; update Zod backup schemas with .default([]) fallback; verify importing v1 backup into v2 schema.
6. **Conflating planned execution dates with deadlines:** Searching task deadlines misses scheduled daily allocations. *Prevention:* Explicit 3-way toggle in UI (Planned Execution, Deadline, Actual Dates); use plannedAllocations.date range join for execution searches.
7. **Double-counting hours in multi-stakeholder analytics:** Tasks with multiple BAs inflate capacity totals. *Prevention:* Keep overall developer capacity calculation strictly tied to unique allocation records; render stakeholder workload distribution as relative tagged engagement share.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Banking IT Domain Fields & Schema Migration
**Rationale:** Database schema and domain models form foundation for all subsequent search, Jira, and analytics features. Must guarantee zero data loss for existing v1.0 data.
**Delivers:** Dexie SCHEMA_V2 registration with multi-entry indexes, migration upgrade logic, updated domain interfaces (opsOwners, businessAnalysts), Zod schema validation, and backward-compatible backup export/import.
**Addresses:** Ops Owner & BA domain fields across Project, Milestone, and Task models.
**Avoids:** Pitfall 6 (Dexie upgrade regressions and backup import failures) and Pitfall 7 (invalid compound array indexes).

### Phase 2: Banking IT UI Fields & Multi-Criteria Date-Range Search
**Rationale:** Extends UI to populate new fields and implements two-phase date search using existing allocation tables before adding external integrations.
**Delivers:** Ant Design tag inputs for Ops Owner & BA on Project/Milestone/Task forms; visual inheritance badge display; TaskFilterBar with Date Range picker (Planned Execution, Deadline, Actual); updated filterTasks engine; Standup Summary clipboard exporter.
**Addresses:** Execution date-range search, multi-criteria task filtering, quick date presets, standup markdown copy.
**Avoids:** Pitfall 8 (conflating planned execution dates with deadlines).

### Phase 3: Jira Cloud Integration Foundation (Auth, Proxy & Settings)
**Rationale:** External API communication requires isolated credentials and proxy routing infrastructure before building interactive task actions.
**Delivers:** JiraAuthContext (session-only RAM token storage), Settings view JiraConfigCard, proxy URL routing logic with HTTPS enforcement, public proxy domain rejection, error sanitization, and authenticated connection test (GET /rest/api/3/myself).
**Addresses:** Jira credentials, connection testing, CORS proxy configuration.
**Avoids:** Pitfall 1 (CORS rejection), Pitfall 2 (public proxy leakage), Pitfall 3 (plaintext token storage).

### Phase 4: Jira Task Creation & Transition Sync
**Rationale:** Builds on Phase 3 connection client to provide interactive task drawer capabilities.
**Delivers:** Pure-TS Atlassian Document Format (ADF) converter; POST /rest/api/3/issue issue creation modal; manual Jira issue key linkage; dynamic transition fetcher and execution modal; task drawer Jira status badges and sync timestamps.
**Addresses:** Create Jira issue from task, link existing Jira issue, execute status transitions.
**Avoids:** Pitfall 4 (ADF schema rejection) and Pitfall 5 (hardcoded transition IDs).

### Phase 5: Enhanced Workload & Stakeholder Analytics Dashboard
**Rationale:** Analytics consumes aggregated data across domain fields (Phase 1), date ranges (Phase 2), and task statuses. Builds view layer last.
**Delivers:** Pure functional analytics.ts calculation engine; AnalyticsView with navigation route; milestone burndown vector chart; completion velocity trends; stakeholder workload distribution matrix (Ops Owner / BA); Ant Design progress bars and statistic cards.
**Addresses:** Milestone burndown, stakeholder workload distribution, delivery health metrics.
**Avoids:** Pitfall 9 (double-counting hours on multi-BA tasks) and Pitfall 10 (point-in-time burndown distortion).

### Phase Ordering Rationale

- **Data first (Phase 1):** Every feature requires opsOwners, businessAnalysts, or Jira metadata on records.
- **Local workflows second (Phase 2):** Date-range search and UI tag inputs operate entirely locally using existing IndexedDB data, establishing solid testing ground.
- **Integration infrastructure third (Phase 3):** Security boundaries, credential isolation, and CORS proxy routing verified before touching issue data.
- **Integration actions fourth (Phase 4):** Issue creation and transition synchronization depend directly on verified Phase 3 client.
- **Analytics fifth (Phase 5):** Aggregation projections depend on all data attributes being present and populating correctly.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3 (Jira Auth & Proxy):** Verify CORS headers and preflight behavior across different proxy environments (Cloudflare Workers vs local Vite proxy); test error response sanitization.
- **Phase 4 (Jira Task Sync):** Verify exact minimal ADF v1 payload structure accepted by Jira Cloud API v3 issue creation; verify field schema handling for standard vs custom issue types.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Schema & Models):** Dexie schema versioning and Zod schema defaults follow established patterns from v1.0.
- **Phase 2 (UI Fields & Search):** Standard Ant Design tag selectors and two-phase in-memory filter pipelines.
- **Phase 5 (Analytics Dashboard):** Standard pure TypeScript aggregation math with Ant Design statistics and SVG rendering.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified 0 new dependencies needed; all APIs supported by existing React 19, Ant Design 6, Dexie 4, Zod 4. |
| Features | HIGH | Detailed breakdown of banking IT workflow expectations, differentiators, and explicit anti-features. |
| Architecture | HIGH | Clean component boundaries extending existing repository, context, and service layers without architectural debt. |
| Pitfalls | HIGH | Verified Atlassian CORS restrictions, ADF requirements, Dexie array indexing rules, and credential threat models. |

**Overall confidence:** HIGH

### Gaps to Address

- **Jira Project-Specific Required Fields:** Jira Cloud instances often configure custom required fields on issue creation (e.g. Components, Environment). *Handling during planning:* Phase 4 must parse Jira 400 error responses and present clear messages when a project requires fields beyond summary/description/issueType.
- **CORS Proxy Deployment Documentation:** Users need clear guidance on setting up their private reverse proxy. *Handling during planning:* Include a ready-to-use Cloudflare Worker snippet (5 lines) in settings documentation and test instructions.

## Sources

### Primary (HIGH confidence)
- [Atlassian Jira Cloud REST API v3 Documentation](https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/) — Basic Auth, /rest/api/3/issue, /rest/api/3/issue/{id}/transitions.
- [Atlassian Document Format (ADF) Specification](https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/) — JSON schema requirement for issue descriptions.
- [Dexie.js Multi-Entry Index Documentation](https://dexie.org/docs/MultiEntry-Index) — verified syntax and queries for *arrayField.
- [Dexie.js Versioning & Upgrades](https://dexie.org/docs/Tutorial/Design#database-versioning) — zero-downtime client migrations.
- [Ant Design 6 Component Suite](https://ant.design/) — <Progress>, <Statistic>, <Table>, <Select mode="tags">.
- Existing Codebase v1.0: src/db/schema.ts, src/services/backup/, CLAUDE.md.

### Secondary (MEDIUM confidence)
- [Atlassian Developer Community: CORS and Basic Authentication](https://community.atlassian.com/t5/Jira-questions/CORS-issue-with-Jira-REST-API/qa-q/1381387) — Browser CORS limitations on Jira Cloud API token requests and proxy requirement.

---
*Research completed: 2026-09-27*
*Ready for roadmap: yes*
