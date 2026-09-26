# Walking Skeleton — Personal Task & Workload Planner

**Phase:** 1
**Generated:** 2026-09-26

## Capability Proven End-to-End

A user opening the application at `/task-management/` loads the Ant Design responsive shell, observes seeded baseline weekly capacity (480 minutes Monday–Friday) queried reactively from browser IndexedDB, navigates across view tabs via hash routing without 404 errors, and can verify the build passes automated CI/CD checks for GitHub Pages.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework & Bundler | React 19.3.0 + Vite 8.3.1 | Current LTS-compatible static SPA stack; fast ESM development and tree-shaken static production output for GitHub Pages. |
| Persistence Layer | IndexedDB via Dexie 4.4.6 | Zero-backend local data store; typed tables, declarative schema migrations, transactional safety, and multi-tab `useLiveQuery` reactivity. |
| UI Component System | Ant Design 6.6.5 + `@ant-design/icons` | Fixed specification decision; comprehensive accessible components (Layout, Sider, Drawer, Modal, Input, Empty), design tokens, and bundled TypeScript definitions. |
| Routing Strategy | Native Hash Routing (`/#/route`) | 100% immune to GitHub Pages static subpath 404 rewrite pitfalls without requiring SPA 404 redirect workarounds. |
| Identifier Generation | Native Web Crypto `crypto.randomUUID()` | Built-in browser cryptographic UUIDs (RFC 4122 v4) with zero external dependency weight. |
| Temporal & Unit Models | Calendar date `YYYY-MM-DD` strings + integer minutes | Eliminates timezone drift across daylight savings and UTC conversions; preserves exact duration arithmetic without float rounding errors. |
| Deployment Pipeline | GitHub Actions `actions/deploy-pages` | Standard automated static build and deploy workflow running tests and deploying `dist/` with subpath `/task-management/`. |
| Directory Layout | Feature-organized modular directories under `src/` (`src/components/`, `src/db/`, `src/hooks/`, `src/types/`, `src/utils/`) | Clear separation of persistence, presentation, state hooks, and data models. |

## Stack Touched in Phase 1

- [ ] Project scaffold (Node 24 LTS target, Vite 8, React 19, TypeScript strict mode, Vitest with fake-indexeddb)
- [ ] Routing — typed hash router hook (`useHashRoute`) tracking `#/tasks`, `#/projects`, `#/planner`, `#/settings`
- [ ] Database — Dexie schema v1 with all 8 core tables (`projects`, `milestones`, `tasks`, `capacityRules`, `capacityOverrides`, `plannedAllocations`, `settings`, `backupMetadata`), default capacity rules seed write, reactive read via `useLiveQuery`
- [ ] UI — Responsive Ant Design `AppShell` with collapsible desktop `Sider`, mobile `Drawer` (<768px), `UpgradeModal` concurrency alert, and guarded `ResetDbModal`
- [ ] Deployment — `.github/workflows/deploy.yml` GitHub Actions pipeline producing static Pages artifact at subpath `/task-management/`

## Out of Scope (Deferred to Later Slices)

- Projects and milestones creation or hierarchy management (deferred to Phase 2)
- Task CRUD, reparenting, status transitions, search, and filtering (deferred to Phase 2)
- Weekly capacity templates configuration UI and date overrides (deferred to Phase 3)
- Feasibility calculation and automated allocation distribution engine (deferred to Phase 4)
- Dashboard projection views and urgent task aggregations (deferred to Phase 5)
- JSON backup file export, structural validation, and restore (deferred to Phase 6)
- PWA manifest installation prompts and Workbox offline caching (deferred to Phase 7)
- Web Crypto PBKDF2/AES-GCM encryption and GitHub Contents API sync (deferred to Phase 8)

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without altering its architectural decisions:

- Phase 2: Work Hierarchy & Fast Task Management (Project/Milestone/Task CRUD and reparenting in IndexedDB)
- Phase 3: Capacity Model & Daily Planning Ledger (Template configuration UI and daily task minute allocations)
- Phase 4: Feasibility Engine & Workload Distribution (Range feasibility checks and lowest-load distribution engine)
- Phase 5: Actionable Dashboard & Workload Forecasting (Today, urgent, 7-day, 14-day, and next-month views)
- Phase 6: Safe Local Backup & Restore (JSON backup export, Zod structural validation, and safe restore)
- Phase 7: PWA Offline Capability & Lifecycle Hardening (Service worker offline cache, install banner, update prompts)
- Phase 8: Optional Encrypted GitHub Backup (Client-side PBKDF2/AES-GCM encryption and GitHub Contents API sync)
