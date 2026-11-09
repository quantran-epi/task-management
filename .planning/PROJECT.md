# Personal Task & Workload Planner

## What This Is

A private, offline-first web application for one person to manage projects, milestones, and tasks while planning work against daily capacity. It combines fast task management with workload forecasting, feasibility checks, and suggested daily hour allocation, and runs as an installable PWA hosted on GitHub Pages.

## Core Value

Make planned work realistically fit available time by exposing overload early and suggesting feasible daily workload distributions.

## Current State

Shipped **v1.0 MVP** on 2026-09-27 with all 8 foundational phases complete. Shipped v1.1 Banking IT Enhancements. Phase 16 knowledge server foundation and Phase 17 pilot ontology & Neo4j graph projection complete (all 5 plans in Phase 17 executed, GRAPH-01..GRAPH-06 satisfied). Codebase features closed ontology contracts, deterministic AST extraction, bounded LLM prose fallback, factKey deduplication, parameterized Neo4j adapter, Fastify inspection endpoints, and DocumentSetDrawer graph controls with PlannerMate offline isolation.

## Current Milestone: v1.4 Unified AI Office

**Goal:** Hợp nhất SDLC Studio và AI Office thành một workspace AI duy nhất (Unified AI Office) dạng chat-first, free-style; loại bỏ hoàn toàn SDLC Studio; quản lý đội ngũ AI leader và agent với kỹ năng chuyên biệt, điều phối công việc linh hoạt kèm cơ chế token budget cứng và luyện tập kỹ năng (skill enrichment).

**Target features:**
- **Trụ 1 — Xóa bỏ SDLC Studio & Tái cấu trúc Navigation**: Audit shared-service trước, tách phần AI Office thực sự dùng, rồi xóa mọi entry point/view/state machine/wizard route của SDLC Studio; thanh điều hướng chỉ còn một trigger "AI Office"; explorer 2 tầng (tầng trên: Leader & Agent; tầng dưới: Danh sách nhóm chat/hội thoại); click mở chi tiết tại center editor.
- **Trụ 2 — Mô hình Nhóm chat Chat-First & Phân công Free-style**: Tạo nhóm chat không giới hạn; mỗi nhóm gồm 1 Leader và N Agent tùy ý; Leader tự động phân tích yêu cầu từ người dùng và phân công cho Agent phù hợp theo skill; user vẫn có thể @mention agent trực tiếp; CR và tài liệu SDLC chỉ là context tùy chọn — thiếu context không chặn và không giảm chất lượng.
- **Trụ 3 — Token Budget cứng & Kiểm soát chi phí**: Cấp token budget chia đều cho Leader và các Agent khi bắt đầu nhóm; đo lường chính xác cả input + output token trên từng request; pause giữa các tool round khi chạm ngưỡng; cảnh báo ngưỡng; cho phép cấp thêm token cho từng agent và tự động tăng tổng ngân sách nhóm (chi tiết top-up cho Leader còn mở — R-12).
- **Trụ 4 — Quản lý Kỹ năng & Làm giàu Skill (Skill Enrichment)**: CRUD Leader, Agent, Skill phải hoạt động đúng theo tiêu chí verify quan sát được (không tuyên bố "không lỗi" khi chưa walkthrough thực tế); cơ chế học hỏi và bổ sung kinh nghiệm sau các lượt chạy (Agent đề xuất bài học, User duyệt version Markdown mới).
- **Trụ 5 — Concurrency Control & Thực thi ổn định**: Giới hạn số lượng Agent chạy song song để bảo vệ tài nguyên; xử lý lỗi vặt và cải thiện toàn diện UX AI Office.

## Requirements

### Validated

- ✓ Manage projects, milestones, and standalone or nested tasks through fast, simple interactions. — v1.0
- ✓ Give every project, milestone, task, and planning record a stable identifier. — v1.0
- ✓ Record item details, dates, notes, statuses, task priority, progress, document links, and actual start/end dates. — v1.0
- ✓ Configure normal weekly work capacity with per-date overrides for leave, meetings, overtime, and other exceptions. — v1.0
- ✓ Allocate planned task hours to individual dates and show daily load as available, busy, or overloaded. — v1.0
- ✓ Evaluate whether estimated work fits a date range or deadline and suggest a distribution favoring lowest-load eligible days. — v1.0
- ✓ Show actionable dashboard views for today, urgent work, and workload over 7-day, 14-day, and next-month horizons. — v1.0
- ✓ Persist application data locally in IndexedDB and remain usable offline after installation. — v1.0
- ✓ Export and import complete local backups. — v1.0
- ✓ Synchronize a client-side encrypted backup file through the GitHub Contents API in the same repository. — v1.0
- ✓ Provide a responsive, accessible, productive interface using Ant Design. — v1.0
- ✓ Deploy the static PWA through GitHub Pages. — v1.0
- ✓ Track Banking IT domain fields (Ops Owner, BA, Work Type) across projects, milestones, tasks. — Phase 9 (SHB-01..SHB-05)
- ✓ Connect to Jira Cloud REST API v3, create issues, link keys, execute transitions, filter tasks by Jira key/status, and format standup exports. — Phase 11 (JIRA-01..JIRA-05)
- ✓ AI Chat Drawer with 9router API integration, scoped item context grounding, local file head extraction, and Claude Code CLI terminal bridge. — Phase 13.2 (AI-01..AI-05)
- ✓ Publish normalized Markdown to an optional knowledge server without breaking local/offline document use. — Phase 16 (INGEST-01..INGEST-05)
- ✓ Incrementally project changed Markdown sections through shared AST chunking and SHA-256 comparison. — Phase 16 (INGEST-03..INGEST-04)
- ✓ Build a rebuildable Neo4j knowledge graph for process 60000006 using collision-safe composite identities, deterministic table extraction, and explicit evidence classification. — Phase 17 (GRAPH-01..GRAPH-06)
- ✓ Query process flow, call chain, dependencies, data objects, cycles, statuses, and diagnostics through multi-modal hybrid retrieval. — Phase 18 (RETR-01..RETR-05)
- ✓ Return AI answers with source citations, graph paths, conflicts, and explicit missing-evidence handling with offline fallback. — Phase 19 (ANSWER-01..ANSWER-07)

### Active

- [ ] v1.4: Xóa bỏ hoàn toàn SDLC Studio và tái cấu trúc điều hướng thành trigger duy nhất "AI Office" với Explorer 2 tầng (Leader/Agent + Nhóm chat).
- [ ] v1.4: Triển khai mô hình nhóm chat chat-first, free-style với 1 Leader và N Agent, không giới hạn số nhóm/agent, CR và docs là context tùy chọn.
- [ ] v1.4: Enforce token budget cứng tính toán cả input + output token, cảnh báo ngưỡng, và hỗ trợ top-up per-agent tăng tổng ngân sách nhóm.
- [ ] v1.4: Quản lý kỹ năng chuyên biệt và cơ chế làm giàu skill (skill enrichment) có user phê duyệt version Markdown.
- [ ] v1.4: Runtime concurrency control và xử lý triệt để toàn bộ lỗi lớn, lỗi vặt UX trong AI Office.

### Out of Scope

- Collaboration, shared workspaces, and multi-user permissions — application is strictly for personal use.
- Authentication and an application backend — all product behavior remains local-first and static-host compatible.
- Recurring tasks — deferred until core scheduling proves useful.
- Subtasks and task dependencies — excluded from v1 to keep planning interactions direct.
- External calendar integrations — manual capacity overrides cover current need.
- Push or email notifications — no backend and not essential to core value.
- Timers and actual-hours tracking — planned hours plus actual start/end dates remain sufficient.
- Native mobile applications — installable responsive PWA is sufficient.

## Context

Current task tools often separate task organization from realistic capacity planning. This product answers not only what needs doing, but whether work can fit before its deadline and where it should be placed. The primary user values quick actions, low UI complexity, clear workload signals, and durable ownership of local data.

Projects contain multiple milestones. Milestones belong to projects. Tasks may belong to a milestone, belong directly to a project, or remain standalone. Project and milestone statuses are Open, In Progress, Done, and Cancelled. Task statuses are Open, In Progress, Resolved, In Review, Done, and Cancelled.

GitHub synchronization is backup synchronization, not collaborative live sync. Backup content is encrypted in the browser before upload because the GitHub Pages repository may be public. GitHub access credentials and the encryption passphrase never enter source control, persistent storage, or the deployed bundle.

## Constraints

- **Audience**: One personal user — no collaboration model or role system.
- **Runtime**: 100% local application behavior — no application server.
- **Hosting**: GitHub Pages — production build supports repository subpath (`/task-management/`) and static routing.
- **Persistence**: IndexedDB is the working data store — app functions offline.
- **Synchronization**: GitHub Contents API stores only an encrypted backup artifact — secrets remain client-side and session-only.
- **UI**: Ant Design — interactions remain simple, fast, responsive, and accessible.
- **PWA**: Installable and offline-capable — service worker updates do not cause data loss.
- **Data safety**: Backup import validates format and avoids replacing good local data without explicit confirmation.
- **Identifiers**: Stable client-generated UUIDs — hierarchy changes do not alter IDs.
- **Knowledge source**: Markdown remains canonical; Neo4j and retrieval indexes must be fully rebuildable from published documents.
- **Offline behavior**: Existing local document editing and search remain available when the optional knowledge server is unavailable.
- **Evidence integrity**: Every extracted relationship must retain document, section, and source-range provenance plus evidence classification.
- **Pilot scope**: MVP targets only `docs/sample-markdown-flow/60000006-SHB-Credit-calculations/`; broader card-system ingestion is deferred.
- **Sensitive data**: Every publish attempt must scan for PAN, CVV, PIN/PIN block, HSM keys, credentials, and customer PII before content leaves PlannerMate. Findings require masked details and fresh explicit confirmation; no trust bypass persists.
- **Artifact writes**: Chat-driven artifact edits are proposals. The editor changes only after explicit user approval of a diff; no tool may commit a version or claim approval.
- **Skill writes**: No AI tool may write an approved skill version. Only the user's explicit approval action creates one.
- **Repository autonomy**: Every filesystem/process operation on a real repository runs through the external fs-gw gateway — TaskMate never spawns repo processes itself. Missing fs-gw degrades to the manual change-pack fallback, never to a silent failure.
- **Retrieve coupling**: Retrieval requests carry a query, not a locally-derived set ID list. A device with no published documents locally must still retrieve from the server.
- **Hard budget**: Token budget is enforced before each model call, measured on input + output, and charged per attempt including retries. A response without usage data is never free.
- **Optional context**: CR, PL01, PL02, and documents are optional attachments for a group chat. Their absence must not block a run or degrade output quality.
- **Verification honesty**: No phase is complete on code reading alone. Every claim of correctness requires an observed walkthrough.
- **No data preservation (C-16)**: The app has never run in production — every row in Dexie, SQLite, and backup is test data. Deleting a feature deletes its data, schema, types, backup fields, and migration path. Keep only code whose *functionality* the new feature reuses. Never keep a schema, type, or migration solely to import an old backup or preserve old rows.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Build a React, TypeScript, and Vite static PWA | Fits Ant Design, GitHub Pages, and rich local interactions without a backend | ✓ Validated — Phase 1 & 7 |
| Use IndexedDB as source of truth | Supports structured local persistence and offline use | ✓ Validated — Phase 1 & 6 |
| Model weekly capacity plus per-date overrides | Low maintenance while supporting holidays and exceptional workload | ✓ Validated — Phase 3 |
| Suggest work on lowest-load eligible days first | Balances workload and directly supports overload prevention | ✓ Validated — Phase 4 |
| Keep actual-hours tracking outside v1 | Protects focus on planning rather than timekeeping | ✓ Validated — Phase 2 & 3 |
| Encrypt GitHub backup in the browser | Prevents readable personal data entering a potentially public repository | ✓ Validated — Phase 8 |
| Keep direct GitHub sync optional | Local data and export/import must work without a token or network connection | ✓ Validated — Phase 8 |
| Session-only in-memory storage for PAT and passphrase | Eliminates credential leak surface in localStorage, IndexedDB, or logs | ✓ Validated — Phase 8 |
| Pre-import snapshots with one-click rollback | Prevents accidental data replacement during restore | ✓ Validated — Phase 6 & 8 |
| ActiveFormGuard reload interception | Prevents service worker updates from destroying dirty form state | ✓ Validated — Phase 7 |
| Keep Markdown as canonical knowledge source | Human-readable documents remain reviewable and portable; graph/indexes can be rebuilt | ✓ Validated — Phase 16 |
| Use collision-safe composite graph identities | Prevents namespace collisions such as `PRC_PROCESS:60000006` and `PRC_CONTAINER:60000006` | ✓ Validated — Phase 17 |
| Start with scheduled process `60000006` as pilot corpus | Small enough to validate, rich enough for scheduler, call-chain, data, and diagnostic multi-hop queries | ✓ Validated — Phase 17 |
| Synthesize grounded answers with closure validation | Prevents hallucination, enforces exact source ranges and graph paths | ✓ Validated — Phase 19 |
| Automatic local BM25 fallback on daemon unavailability | Guarantees zero downtime and zero egress for local Markdown searches | ✓ Validated — Phase 19 |
| Enterprise System Catalog with hierarchical physical subsystems | Models real enterprise systems owning SSH/repo paths and multi-repo SDLC context | ✓ Validated — Phase 31.1 |
| Transform Project to Change Request impacting 1..N systems | Aligns personal workload with enterprise change management and multi-system delivery | ✓ Validated — Phase 31.1 |
| Artifact edits from chat return a diff the user approves before the editor changes (v1.3) | Keeps "never claim a document was approved or saved" true; AI never overwrites work in progress | Planned — v1.3 |
| Knowledge retrieve is query-only; the server owns set selection (v1.3) | A fresh install has no local document set to send, so client-side `setId` coupling breaks retrieval | Planned — v1.3 |
| Repository autonomy goes through Claude Code headless via fs-gw (v1.3) | TaskMate must not re-implement an agent harness; Claude Code already owns file/tool orchestration inside the repo | Planned — v1.3 |
| Manual change-pack script remains as explicit fallback (v1.3) | Repo autonomy must degrade safely when fs-gw is not running | Planned — v1.3 |


## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-11-09 for Milestone v1.4 Unified AI Office kickoff*
