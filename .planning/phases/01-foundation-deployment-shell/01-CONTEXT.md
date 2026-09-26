# Phase 1: Foundation & Deployment Shell - Context

**Gathered:** 2026-09-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 1 establishes the repository build and runtime environment, GitHub Pages CI/CD workflow, Dexie-backed IndexedDB persistence layer, UUID generation, migration and multi-tab conflict handling, and an Ant Design responsive application shell. It covers requirements DATA-01, DATA-02, DATA-03, DATA-04, PWA-04, PWA-05, and UX-01.

</domain>

<decisions>
## Implementation Decisions

### App Shell Layout
- **D-01:** Use a collapsible sidebar layout (`Layout.Sider` with standard Ant Design trigger/toggle) for primary navigation across main views.
- **D-02:** Track view navigation via browser hash routing (`/#/tasks`, `/#/projects`, `/#/planner`, etc.) to guarantee zero 404 rewrite issues on GitHub Pages project subpaths.
- **D-03:** On mobile/narrow screens (<768px), collapse the sidebar into a slide-over `Drawer` opened by a hamburger icon in the header.
- **D-04:** Top header contains app title, current breadcrumb/view label, and a subtle status indicator for online/offline and DB state.

### Sample Seed Data
- **D-05:** Database initializes with clean defaults only: baseline weekly capacity rules (Mon-Fri 8 hours, Sat-Sun 0 hours) and default settings. Zero sample projects, milestones, or tasks.
- **D-06:** Empty states use standard Ant Design `Empty` component with clean iconography and brief prompt text.
- **D-07:** Provide an explicit "Reset Database" action in settings/about dialog to return the DB to fresh baseline defaults during development and testing.
- **D-08:** Guard database reset behind a modal requiring the user to type "RESET" into an input field before the destructive action button enables.

### Tab Conflict UX
- **D-09:** When a database schema upgrade or lock is blocked by another open browser tab, present a blocking `Modal` dialog explaining the conflict and offering an immediate reload action.
- **D-10:** Automatically dismiss the blocking upgrade modal if the competing tab is closed.
- **D-11:** Multi-tab reactive updates use native Dexie `useLiveQuery`, which automatically reacts to IndexedDB mutations across tabs without custom messaging overhead.
- **D-12:** Display network connection state via a subtle dot/badge in the header breadcrumb area (green for online, muted orange for offline).

### Theme & Spacing
- **D-13:** Configure Ant Design `ConfigProvider` with system auto-detect theme mode (`matchMedia('prefers-color-scheme: dark')`) with a manual override toggle stored in settings.
- **D-14:** Use Ant Design standard density algorithm for clean, accessible touch targets across desktop and mobile screens.
- **D-15:** Primary brand color token set to Ant Design Classic Blue (`#1677ff`).
- **D-16:** Use system font stack (`system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`) with zero web font download overhead.

### Claude's Discretion
- Exact layout breakpoints follow Ant Design grid standards (`xs: 480`, `sm: 576`, `md: 768`, `lg: 992`, `xl: 1200`).
- Exact Dexie database schema table declarations follow requirements DATA-01 through DATA-04 and CLAUDE.md architecture table layout.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture & Tech Stack
- `CLAUDE.md` — Complete architecture specification, approved dependencies, and GitHub Pages configuration.
- `.planning/ROADMAP.md` — Phase 1 scope, requirements mapping, and success criteria.
- `.planning/REQUIREMENTS.md` — Detailed acceptance criteria for DATA-01, DATA-02, DATA-03, DATA-04, PWA-04, PWA-05, UX-01.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None yet — Phase 1 creates the initial application scaffolding.

### Established Patterns
- Client-side only static bundle hosted on GitHub Pages subpath `/task-management/`.
- Dexie 4 as the sole IndexedDB client with `db.version(n).stores(...)`.
- Canonical calendar dates stored strictly as `YYYY-MM-DD` strings; time durations stored strictly as integer minutes.
- Cryptographic UUID generation via native `crypto.randomUUID()`.

### Integration Points
- `.github/workflows/deploy.yml` — GitHub Actions deployment workflow targeting GitHub Pages.
- `vite.config.ts` — Base subpath configuration and build output definition.
- `src/db/` — Database schema, migration handlers, and repository hooks.
- `src/components/shell/` — Ant Design responsive shell layout and hash navigation wrapper.

</code_context>

<specifics>
## Specific Ideas
- Clean, focused planner aesthetic without visual clutter.
- Responsive sidebar that tucks into drawer smoothly on mobile.
- Zero sample task noise on fresh install.

</specifics>

<deferred>
## Deferred Ideas
- None — all discussed topics remained strictly within Phase 1 foundation boundaries.

</deferred>

---

*Phase: 1-Foundation & Deployment Shell*
*Context gathered: 2026-09-26*
