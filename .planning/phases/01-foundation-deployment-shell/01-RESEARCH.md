# Phase 1: Foundation & Deployment Shell - Research

**Researched:** 2026-09-26
**Domain:** Client-side static PWA runtime, IndexedDB persistence with Dexie, Ant Design shell, GitHub Pages CI/CD
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Use a collapsible sidebar layout (`Layout.Sider` with standard Ant Design trigger/toggle) for primary navigation across main views.
- **D-02:** Track view navigation via browser hash routing (`/#/tasks`, `/#/projects`, `/#/planner`, etc.) to guarantee zero 404 rewrite issues on GitHub Pages project subpaths.
- **D-03:** On mobile/narrow screens (<768px), collapse the sidebar into a slide-over `Drawer` opened by a hamburger icon in the header.
- **D-04:** Top header contains app title, current breadcrumb/view label, and a subtle status indicator for online/offline and DB state.
- **D-05:** Database initializes with clean defaults only: baseline weekly capacity rules (Mon-Fri 8 hours, Sat-Sun 0 hours) and default settings. Zero sample projects, milestones, or tasks.
- **D-06:** Empty states use standard Ant Design `Empty` component with clean iconography and brief prompt text.
- **D-07:** Provide an explicit "Reset Database" action in settings/about dialog to return the DB to fresh baseline defaults during development and testing.
- **D-08:** Guard database reset behind a modal requiring the user to type "RESET" into an input field before the destructive action button enables.
- **D-09:** When a database schema upgrade or lock is blocked by another open browser tab, present a blocking `Modal` dialog explaining the conflict and offering an immediate reload action.
- **D-10:** Automatically dismiss the blocking upgrade modal if the competing tab is closed.
- **D-11:** Multi-tab reactive updates use native Dexie `useLiveQuery`, which automatically reacts to IndexedDB mutations across tabs without custom messaging overhead.
- **D-12:** Display network connection state via a subtle dot/badge in the header breadcrumb area (green for online, muted orange for offline).
- **D-13:** Configure Ant Design `ConfigProvider` with system auto-detect theme mode (`matchMedia('prefers-color-scheme: dark')`) with a manual override toggle stored in settings.
- **D-14:** Use Ant Design standard density algorithm for clean, accessible touch targets across desktop and mobile screens.
- **D-15:** Primary brand color token set to Ant Design Classic Blue (`#1677ff`).
- **D-16:** Use system font stack (`system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`) with zero web font download overhead.

### Claude's Discretion
- Exact layout breakpoints follow Ant Design grid standards (`xs: 480`, `sm: 576`, `md: 768`, `lg: 992`, `xl: 1200`).
- Exact Dexie database schema table declarations follow requirements DATA-01 through DATA-04 and CLAUDE.md architecture table layout.

### Deferred Ideas (OUT OF SCOPE)
- None — all discussed topics remained strictly within Phase 1 foundation boundaries.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DATA-01 | User-created projects, milestones, tasks, capacity overrides, and task allocations each retain a stable UUID across edits, moves, exports, imports, and synchronization. | Native `crypto.randomUUID()` provides RFC 4122 v4 UUIDs client-side in secure context without external packages. Tables use `id: string` primary key. |
| DATA-02 | User data persists locally in IndexedDB across reloads and browser restarts. | Dexie 4.4.6 provides typed tables, transactions, and schema persistence in browser IndexedDB. Verified across reloads via unit tests with `fake-indexeddb`. |
| DATA-03 | Planning dates persist as calendar-date values independent of timezone, while estimates, capacity, and allocations persist as integer minutes. | Persist calendar days as strict `YYYY-MM-DD` string literals. Durations and capacity stored as non-negative integer minutes. Zod schemas enforce types. |
| DATA-04 | Application upgrades migrate supported existing data without silent loss and explain when another open tab blocks an upgrade. | Dexie `db.version(n).stores(...).upgrade(...)` executes schema changes. `db.on('blocked')` triggers user alert modal, and `db.on('versionchange')` gracefully releases old connection. |
| PWA-04 | Production assets, manifest, navigation, and service-worker scope work under the GitHub Pages `/task-management/` repository path. | Vite `base: '/task-management/'` configures asset bundling, static chunks, and HTML script/link tags. Hash routing ensures deep links work without server rewrite. |
| PWA-05 | Application is deployed from the requested GitHub repository using GitHub Actions and GitHub Pages. | GitHub Actions workflow `.github/workflows/deploy.yml` with `actions/upload-pages-artifact` and `actions/deploy-pages` deploys `dist/` on push to main/master. |
| UX-01 | Application uses Ant Design and responsive layouts for desktop and mobile-width screens. | Ant Design 6.6.5 `Layout`, `Layout.Sider`, `Drawer`, and `Grid.useBreakpoint` provide responsive navigation. `ConfigProvider` sets theme algorithm and tokens. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Target Audience:** One personal user — no auth server, no backend, no multi-user roles.
- **Runtime:** 100% local in-browser execution.
- **Hosting:** GitHub Pages with `base: '/task-management/'`.
- **Database:** IndexedDB via Dexie 4.4.6 with `dexie-react-hooks`.
- **Tables:** `projects`, `milestones`, `tasks`, `capacityRules`, `capacityOverrides`, `plannedAllocations`, `settings`, `backupMetadata`.
- **IDs:** Native `crypto.randomUUID()`.
- **Date Format:** Canonical `YYYY-MM-DD` string representations.
- **Duration Format:** Integer minutes.
- **Transactions:** Wrap multi-table operations in Dexie transactions.
- **UI:** Ant Design 6.6.5 with `@ant-design/icons` 6.3.4. Bundled types only, no `@types/antd`.
- **Validation:** Zod at trust boundaries.
- **Dates:** Dayjs for formatting/ranges.

## Summary

Phase 1 constructs the entire scaffolding and durable substrate for the Personal Task & Workload Planner. The core objective is establishing a zero-backend, offline-first client architecture deployed to GitHub Pages at `/task-management/` that persists structured data locally in IndexedDB with zero risk of timezone drift or accidental data loss during upgrades.

The application leverages Vite 8 + React 19 + TypeScript + Ant Design 6. Navigation is managed via hash routing (`window.location.hash` or lightweight router) to completely bypass GitHub Pages 404 rewrite pitfalls on static subpaths. Data persistence uses Dexie 4 with explicit multi-version schema upgrades and multi-tab versionchange handlers.

The resulting foundation delivers an accessible desktop-and-mobile layout, system-responsive dark/light theme switching, connection status detection, a verified initial database seed (baseline 8h Mon-Fri capacity rules), a protected "RESET" database safeguard, and a functioning GitHub Actions build pipeline.

**Primary recommendation:** Initialize Vite 8 with React 19 and TypeScript, configure Dexie 4 with the full target schema version 1, configure Ant Design 6 `ConfigProvider` with responsive layout hooks, and set up the GitHub Actions Pages deployment workflow.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Shell Layout & Navigation | Browser / Client | — | Responsive sidebar/drawer, hash routing, theme switching, and connection status belong entirely in UI components. |
| Persistence & Indexing | Database (IndexedDB) | Browser / Client (Dexie) | Local storage of projects, tasks, capacity rules, and settings in browser IndexedDB. Dexie manages connections and queries. |
| Schema Migration & Concurrency | Database (Dexie) | Browser / Client (UI Modal) | Dexie handles database version upgrade lifecycle. UI displays blocking modal when versionchange or blocked events fire. |
| UUID & Canonical Data Formatting | Browser / Client | — | Native `crypto.randomUUID()`, `YYYY-MM-DD` date validation, and minute calculation run in local TypeScript helpers. |
| Static Bundle & CI/CD Deployment | CDN / Static (GitHub Pages) | Build Pipeline (GitHub Actions) | Vite builds static assets with base `/task-management/`; GitHub Actions uploads and deploys the artifact. |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `react` | 19.3.0 | UI runtime | Current stable release with React DOM 19 [VERIFIED: npm registry]. |
| `react-dom` | 19.3.0 | DOM renderer | Paired with React 19 [VERIFIED: npm registry]. |
| `antd` | 6.6.5 | UI component system | Fixed UI specification, accessible forms, responsive layout, bundled types [VERIFIED: npm registry]. |
| `@ant-design/icons` | 6.3.4 | Icon library | Official Ant Design icon set [VERIFIED: npm registry]. |
| `dexie` | 4.4.6 | IndexedDB client | Typed tables, transactions, versioning, reactive hooks [VERIFIED: npm registry]. |
| `dexie-react-hooks` | 4.4.0 | React IndexedDB reactivity | `useLiveQuery` hook updates React components on DB changes [VERIFIED: npm registry]. |
| `dayjs` | 1.11.23 | Date utilities | Fast, immutable date formatting for `YYYY-MM-DD` [VERIFIED: npm registry]. |
| `zod` | 4.6.5 | Schema validation | Runtime validation of records and settings [VERIFIED: npm registry]. |
| `typescript` | 7.0.2 | Static type checker | Strict type validation for schema and planning math [VERIFIED: npm registry]. |
| `vite` | 8.3.1 | Build tool & dev server | Fast ESM development and static GitHub Pages build [VERIFIED: npm registry]. |
| `@vitejs/plugin-react` | 6.1.1 | Vite React plugin | Standard React JSX/TSX compilation for Vite [VERIFIED: npm registry]. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | 5.0.2 | Test framework | Unit and integration testing [VERIFIED: npm registry]. |
| `@testing-library/react` | 16.3.3 | React testing | Testing UI components in jsdom [VERIFIED: npm registry]. |
| `@testing-library/jest-dom` | 7.0.1 | DOM matchers | Jest/Vitest DOM assertions [VERIFIED: npm registry]. |
| `fake-indexeddb` | 6.2.5 | IndexedDB test mock | In-memory IndexedDB for testing Dexie repositories in Node/Vitest [VERIFIED: npm registry]. |
| `jsdom` | 30.1.1 | DOM environment | Node test DOM environment [VERIFIED: npm registry]. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hash Routing | BrowserRouter | BrowserRouter requires SPA 404 hacks on GitHub Pages; hash routing works natively on static project subpaths without 404 errors. |
| Dexie 4 | idb / raw IndexedDB | Raw IndexedDB requires hundreds of lines of boilerplate for schema migrations, transactions, and live reactivity. Dexie is safe and compact. |
| Ant Design | Tailwind / Custom CSS | Ant Design provides ready-to-use accessible layout, drawers, modals, tables, forms, and color tokens matching user requirements. |

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `react` | npm | 14 yrs | >25M/wk | github.com/react/react | [OK] | Approved |
| `react-dom` | npm | 12 yrs | >25M/wk | github.com/react/react | [OK] | Approved |
| `antd` | npm | 11 yrs | >1.5M/wk | github.com/ant-design/ant-design | [OK] | Approved |
| `@ant-design/icons` | npm | 8 yrs | >1.8M/wk | github.com/ant-design/ant-design-icons | [OK] | Approved |
| `dexie` | npm | 12 yrs | >500k/wk | github.com/dexie/Dexie.js | [OK] | Approved |
| `dexie-react-hooks` | npm | 5 yrs | >200k/wk | github.com/dexie/Dexie.js | [OK] | Approved |
| `dayjs` | npm | 8 yrs | >15M/wk | github.com/iamkun/dayjs | [OK] | Approved |
| `zod` | npm | 6 yrs | >15M/wk | github.com/colinhacks/zod | [OK] | Approved |
| `vite` | npm | 6 yrs | >15M/wk | github.com/vitejs/vite | [OK] | Approved |
| `@vitejs/plugin-react` | npm | 5 yrs | >10M/wk | github.com/vitejs/vite-plugin-react | [OK] | Approved |
| `typescript` | npm | 14 yrs | >40M/wk | github.com/microsoft/TypeScript | [OK] | Approved |
| `vitest` | npm | 4 yrs | >5M/wk | github.com/vitest-dev/vitest | [OK] | Approved |
| `@testing-library/react` | npm | 7 yrs | >10M/wk | github.com/testing-library/react-testing-library | [OK] | Approved |
| `@testing-library/jest-dom` | npm | 7 yrs | >8M/wk | github.com/testing-library/jest-dom | [OK] | Approved |
| `fake-indexeddb` | npm | 11 yrs | >400k/wk | github.com/dumbmatter/fakeIndexedDB | [OK] | Approved |
| `jsdom` | npm | 14 yrs | >25M/wk | github.com/jsdom/jsdom | [OK] | Approved |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none
**Postinstall script review:** All packages verified clean (zero malicious postinstall hooks).

## Architecture Patterns

### System Architecture Diagram

```
User Browser Window (Desktop / Mobile)
   │
   ├─► Hash Navigation (window.location.hash: #/tasks, #/projects, #/planner, #/settings)
   │     │
   │     ▼
   ├─► Ant Design Application Shell
   │     ├─ Header (Breadcrumb, Online/Offline Badge, DB Status, Mobile Drawer Toggle)
   │     ├─ Responsive Sider (Collapsible sidebar >= 768px; Slide-over Drawer < 768px)
   │     └─ Content Area (Route Views + Empty State Fallbacks)
   │
   ├─► Application State & Services
   │     ├─ Theme Provider (Auto dark/light detection + manual override)
   │     ├─ Network Status Hook (navigator.onLine + online/offline events)
   │     └─ Concurrency & Upgrade Manager (Dexie blocked / versionchange listeners)
   │
   └─► Dexie IndexedDB Database (AppDatabase: 'PersonalTaskPlannerDB')
         ├─ Stores: projects, milestones, tasks, capacityRules, capacityOverrides,
         │          plannedAllocations, settings, backupMetadata
         ├─ Migration Framework: version(1).stores(...).upgrade(...)
         └─ Reactive Live Queries: useLiveQuery() across components and browser tabs
```

### Recommended Project Structure

```
task-management/
├── .github/
│   └── workflows/
│       └── deploy.yml              # GitHub Actions deploy to GitHub Pages
├── src/
│   ├── assets/                     # App icons and static logos
│   ├── components/
│   │   ├── shell/
│   │   │   ├── AppShell.tsx        # Main Ant Design Layout, Sider, Header, Content
│   │   │   ├── Navigation.tsx      # Menu items and hash routing bindings
│   │   │   ├── StatusBadge.tsx     # Network online/offline + DB status
│   │   │   └── UpgradeModal.tsx    # Multi-tab conflict / upgrade alert modal
│   │   └── common/
│   │       ├── ResetDbModal.tsx    # Guarded "RESET" confirmation modal
│   │       └── EmptyState.tsx      # Standard Ant Design Empty wrapper
│   ├── db/
│   │   ├── index.ts                # AppDatabase Dexie instance export
│   │   ├── schema.ts               # Store definitions, indexes, TypeScript models
│   │   ├── seeds.ts                # Default capacity rules (Mon-Fri 8h) & settings
│   │   └── migrations.ts           # Version definitions and upgrade handlers
│   ├── hooks/
│   │   ├── useNetworkStatus.ts     # navigator.onLine listener
│   │   ├── useHashRoute.ts         # Lightweight hash routing hook
│   │   └── useThemeMode.ts         # System matchMedia + setting override
│   ├── types/
│   │   ├── models.ts               # Core entity types (Project, Task, Capacity, etc.)
│   │   └── navigation.ts           # Route identifiers and navigation types
│   ├── utils/
│   │   ├── date.ts                 # YYYY-MM-DD validators and helpers
│   │   └── uuid.ts                 # crypto.randomUUID wrapper
│   ├── App.tsx                     # ConfigProvider, theme wrapping, root layout
│   └── main.tsx                    # React DOM root entry
├── tests/
│   ├── setup.ts                    # fake-indexeddb setup and vitest config
│   ├── db.test.ts                  # Dexie persistence, seeds, and CRUD tests
│   ├── migrations.test.ts          # Schema upgrade and migration safety tests
│   └── shell.test.tsx              # Responsive shell and navigation tests
├── index.html                      # HTML entry with viewport meta
├── vite.config.ts                  # base: '/task-management/', plugins, test setup
├── tsconfig.json                   # Strict TypeScript compiler options
└── package.json                    # Dependencies, engines, scripts
```

### Pattern 1: Canonical Date & Integer Minute Modeling
**What:** Date fields stored strictly as `YYYY-MM-DD` strings; time quantities stored strictly as integer minutes.
**When to use:** All database schemas, models, and calculation boundaries. Never store JavaScript `Date` objects in IndexedDB.
**Example:**
```typescript
// Source: Project specification & CLAUDE.md architecture rules
export interface CapacityRule {
  id: string; // crypto.randomUUID()
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  workMinutes: number; // e.g. 480 for 8 hours, 0 for weekend
}

export interface CapacityOverride {
  id: string;
  date: string; // Canonical format: 'YYYY-MM-DD'
  workMinutes: number; // Integer minutes: 0 for leave, >0 for overtime/adjusted
  note?: string;
}

export const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
export function isValidCalendarDate(val: string): boolean {
  return DATE_REGEX.test(val);
}
```

### Pattern 2: Dexie Multi-Tab Conflict and Upgrade Handling
**What:** Handling IndexedDB `blocked` and `versionchange` events gracefully so concurrent tabs do not crash or corrupt database state.
**When to use:** Database initialization.
**Example:**
```typescript
// Source: Dexie.js official documentation on concurrency & versionchange
import Dexie from 'dexie';

export class AppDatabase extends Dexie {
  constructor() {
    super('PersonalTaskPlannerDB');

    this.on('blocked', () => {
      // Another tab has this DB open with an older version, blocking this tab's upgrade
      window.dispatchEvent(new CustomEvent('db-upgrade-blocked'));
    });

    this.on('versionchange', (event) => {
      // Another tab is attempting to upgrade the DB version
      window.dispatchEvent(new CustomEvent('db-version-changed', { detail: event }));
      // Optionally close connection to allow the upgrade in the other tab
      this.close();
    });
  }
}
```

### Pattern 3: Responsive Ant Design Layout with Drawer Switch
**What:** Ant Design `Layout.Sider` on desktop screens switching to `Drawer` on mobile screens (<768px).
**When to use:** Main application shell.
**Example:**
```typescript
// Source: Ant Design Layout and Grid responsive documentation
import React, { useState } from 'react';
import { Layout, Drawer, Grid, Button } from 'antd';
import { MenuOutlined } from '@ant-design/icons';

const { Header, Sider, Content } = Layout;
const { useBreakpoint } = Grid;

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const screens = useBreakpoint();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const isMobile = !screens.md; // md breakpoint is 768px

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {!isMobile ? (
        <Sider collapsible breakpoint="lg">
          {/* Navigation Menu */}
        </Sider>
      ) : (
        <Drawer
          placement="left"
          open={mobileDrawerOpen}
          onClose={() => setMobileDrawerOpen(false)}
          styles={{ body: { padding: 0 } }}
        >
          {/* Navigation Menu */}
        </Drawer>
      )}
      <Layout>
        <Header style={{ display: 'flex', alignItems: 'center' }}>
          {isMobile && (
            <Button
              icon={<MenuOutlined />}
              onClick={() => setMobileDrawerOpen(true)}
              aria-label="Open menu"
            />
          )}
          {/* App title and status */}
        </Header>
        <Content style={{ margin: 16 }}>{children}</Content>
      </Layout>
    </Layout>
  );
};
```

### Anti-Patterns to Avoid
- **Avoid JavaScript `Date` persistence:** Persisting `Date` instances in IndexedDB causes local timezone shifts across daylight savings time boundaries and machine locales. Store only `YYYY-MM-DD`.
- **Avoid Float or Fractional Hours:** Storing hours as floats (e.g. `1.5` hours) causes floating-point precision issues during summing and feasibility distribution. Store exact integer minutes (e.g. `90`).
- **Avoid Browser History Routing without SPA fallback:** GitHub Pages serves static files; requesting `/task-management/tasks` directly returns 404. Always use hash routing (`/#/tasks`).
- **Avoid Unprompted DB Reset:** Never reset or clear IndexedDB tables on simple button click; enforce modal with typed text confirmation ("RESET").

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| UUID generation | Custom math/random generator | Native `crypto.randomUUID()` | Built into standard modern browsers, cryptographically secure RFC 4122 v4 UUID, 0kb bundle. |
| IndexedDB schema & migrations | Raw `indexedDB.open` version listener | Dexie 4.4.6 (`db.version().stores().upgrade()`) | Raw IndexedDB requires recursive cursor loops, tedious transaction management, and complex objectStore creation. |
| Multi-tab database reactivity | BroadcastChannel / WebSockets / polling | Dexie `useLiveQuery` | Dexie automatically listens to IndexedDB changes across browser tabs and triggers React component re-renders. |
| Responsive navigation drawers | Custom CSS media queries & transition divs | Ant Design `Layout.Sider` + `Drawer` + `Grid.useBreakpoint` | Ant Design provides battle-tested accessibility, keyboard focus traps, backdrop dismissal, and smooth animations. |

**Key insight:** Custom IndexedDB transaction and migration management is notoriously bug-prone, especially during version transitions or multi-tab concurrency. Dexie solves schema versioning, transaction boundaries, and multi-tab live queries declaratively.

## Common Pitfalls

### Pitfall 1: GitHub Pages Asset Base Path Mismatch
**What goes wrong:** Built application loads as a blank white page on GitHub Pages with 404 errors for JS/CSS chunks (`/assets/index-xxx.js` not found).
**Why it happens:** Vite defaults `base: '/'`, but GitHub Pages project repositories are served at `/<repository-name>/` (e.g., `/task-management/`).
**How to avoid:** Explicitly configure `base: '/task-management/'` in `vite.config.ts`.
**Warning signs:** Works locally at `http://localhost:5173/` but fails on remote deployment with 404 console errors.

### Pitfall 2: IndexedDB Multi-Tab Upgrade Deadlock
**What goes wrong:** User has the app open in Tab A, opens Tab B with a newly deployed version. Tab B hangs indefinitely on database open. Tab A continues with stale schema.
**Why it happens:** Tab B initiates an IndexedDB `versionchange` transaction, but Tab A still holds an open connection and blocks the upgrade.
**How to avoid:** Handle `db.on('blocked')` in the upgrading tab (Tab B) to show an alert modal, and handle `db.on('versionchange')` in existing tabs (Tab A) to close the stale connection or prompt immediate reload.
**Warning signs:** IndexedDB open promises never resolve; `Blocked` event logged in browser console.

### Pitfall 3: Timezone Creep on Planning Dates
**What goes wrong:** A task planned for `2026-10-01` suddenly displays as `2026-09-30` or `2026-10-02` when viewed across daylight savings or by a user in another timezone.
**Why it happens:** Converting `YYYY-MM-DD` to a Javascript `new Date('2026-10-01')` parses as UTC midnight, which translates to the prior evening in Western timezones.
**How to avoid:** Treat calendar dates purely as strings (`YYYY-MM-DD`). Use Dayjs strictly for formatting or date math with explicit format strings, never storing or transmitting ISO timestamps for day-level calendar planning.
**Warning signs:** Date values shift by +/- 1 day depending on local machine timezone.

## Code Examples

### Initializing Dexie Database with Stores and Seeds
```typescript
// Source: Dexie.js official documentation
import Dexie, { type Table } from 'dexie';

export interface Project {
  id: string;
  name: string;
  description?: string;
  deadline?: string;
  notes?: string;
  status: 'Open' | 'In Progress' | 'Done' | 'Cancelled';
  createdAt: string;
  updatedAt: string;
}

export interface Milestone {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  deadline?: string;
  notes?: string;
  status: 'Open' | 'In Progress' | 'Done' | 'Cancelled';
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  projectId?: string;
  milestoneId?: string;
  name: string;
  description?: string;
  deadline?: string;
  notes?: string;
  actualStartDate?: string;
  actualEndDate?: string;
  status: 'Open' | 'In Progress' | 'Resolved' | 'In Review' | 'Done' | 'Cancelled';
  progress: number;
  priority: 'Low' | 'Medium' | 'High' | 'Urgent';
  estimateMinutes: number;
  documentLinks?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CapacityRule {
  id: string;
  dayOfWeek: number; // 0-6
  workMinutes: number; // integer minutes
}

export interface CapacityOverride {
  id: string;
  date: string; // YYYY-MM-DD
  workMinutes: number;
  note?: string;
}

export interface PlannedAllocation {
  id: string;
  taskId: string;
  date: string; // YYYY-MM-DD
  allocatedMinutes: number;
}

export interface Setting {
  key: string;
  value: unknown;
}

export interface BackupMetadata {
  id: string;
  timestamp: string;
  appVersion: string;
  recordCount: number;
}

export class TaskPlannerDatabase extends Dexie {
  projects!: Table<Project, string>;
  milestones!: Table<Milestone, string>;
  tasks!: Table<Task, string>;
  capacityRules!: Table<CapacityRule, string>;
  capacityOverrides!: Table<CapacityOverride, string>;
  plannedAllocations!: Table<PlannedAllocation, string>;
  settings!: Table<Setting, string>;
  backupMetadata!: Table<BackupMetadata, string>;

  constructor() {
    super('PersonalTaskPlannerDB');
    this.version(1).stores({
      projects: 'id, status, deadline',
      milestones: 'id, projectId, status, deadline',
      tasks: 'id, projectId, milestoneId, status, priority, deadline',
      capacityRules: 'id, dayOfWeek',
      capacityOverrides: 'id, date',
      plannedAllocations: 'id, taskId, date',
      settings: 'key',
      backupMetadata: 'id, timestamp'
    });
  }
}

export const db = new TaskPlannerDatabase();

export async function initializeDatabaseDefaults(): Promise<void> {
  const existingRules = await db.capacityRules.count();
  if (existingRules === 0) {
    // Mon-Fri: 8 hours (480 mins), Sat-Sun: 0 hours
    const defaultRules: CapacityRule[] = [
      { id: crypto.randomUUID(), dayOfWeek: 1, workMinutes: 480 },
      { id: crypto.randomUUID(), dayOfWeek: 2, workMinutes: 480 },
      { id: crypto.randomUUID(), dayOfWeek: 3, workMinutes: 480 },
      { id: crypto.randomUUID(), dayOfWeek: 4, workMinutes: 480 },
      { id: crypto.randomUUID(), dayOfWeek: 5, workMinutes: 480 },
      { id: crypto.randomUUID(), dayOfWeek: 6, workMinutes: 0 },
      { id: crypto.randomUUID(), dayOfWeek: 0, workMinutes: 0 }
    ];
    await db.capacityRules.bulkAdd(defaultRules);
  }
}
```

### GitHub Actions Deployment Workflow
```yaml
# Source: Vite static deploy guide & GitHub Pages documentation
name: Deploy to GitHub Pages

on:
  push:
    branches: [main, master]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build-and-deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test -- --run

      - name: Build static site
        run: npm run build

      - name: Setup Pages
        uses: actions/configure-pages@v5

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: dist/

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `gh-pages` branch push scripts | GitHub Actions `actions/deploy-pages` | 2023 | Reproducible CI builds, zero local git branch pollution, official artifact deployment. |
| Raw IndexedDB callbacks | Dexie 4.x + `useLiveQuery` | 2024 | Eliminates callback boilerplate, reactive cross-tab UI synchronization. |
| Browser History Routing with 404 hacks | Native Hash Routing (`/#/path`) | Evergreen | 100% reliable on static CDNs/GitHub Pages without routing workarounds. |
| UUID npm packages (`uuid`) | Native `crypto.randomUUID()` | Modern browsers / Node 16+ | Zero dependency weight, native performance, RFC 4122 standard. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | GitHub Actions runner supports Node 22/24 with standard npm build steps | Architecture Patterns | Low; Node 22 is widely supported in `actions/setup-node`. |

## Open Questions

1. **Lightweight hash routing implementation vs React Router:**
   - What we know: CLAUDE.md notes that if views are tabs or top-level pages, React Router is optional and hash routing can be handled with standard `window.location.hash` or `react-router@8`.
   - Recommendation: Implement a lightweight, typed hash router hook (`useHashRoute`) or React Router hash provider to keep bundle lean and zero-friction.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Development & testing runtime | ✓ | 20.19.5 (local), 22/24 (CI) | Node 20 works for local dev; CI uses 22/24. |
| npm | Package installation & build | ✓ | 10.8.2 | — |
| git | Version control & deploy | ✓ | 2.53.0.windows.1 | — |
| Python / slopcheck | Package verification | ✓ | Python 3.14 / slopcheck 0.6.1 | Checked via npm registry metadata. |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.2 + @testing-library/react 16.3.3 |
| Config file | `vite.config.ts` (integrated test config) |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DATA-01 | UUID stability and RFC 4122 v4 compliance | unit | `npx vitest run tests/uuid.test.ts` | ❌ Wave 0 |
| DATA-02 | Dexie persistence across database reopening | integration | `npx vitest run tests/db.test.ts` | ❌ Wave 0 |
| DATA-03 | Calendar dates stored as YYYY-MM-DD and minutes as integers | unit | `npx vitest run tests/schema.test.ts` | ❌ Wave 0 |
| DATA-04 | Migration executes cleanly and triggers blocked/versionchange events | integration | `npx vitest run tests/migrations.test.ts` | ❌ Wave 0 |
| PWA-04 | Vite builds static output with `/task-management/` base | build check | `npm run build && test -d dist` | ❌ Wave 0 |
| PWA-05 | GitHub Actions deploy workflow exists and validates | CI config | `test -f .github/workflows/deploy.yml` | ❌ Wave 0 |
| UX-01 | Shell renders responsive Ant Design layout and hash navigation | component | `npx vitest run tests/shell.test.tsx` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run`
- **Per wave merge:** `npm run build && npx vitest run`
- **Phase gate:** Full test suite green + static build passing before phase completion.

### Wave 0 Gaps
- [ ] `tests/setup.ts` — fake-indexeddb and DOM testing setup.
- [ ] `tests/uuid.test.ts` — validates UUID generator behavior.
- [ ] `tests/db.test.ts` — validates Dexie store creation, default capacity rules seed, and CRUD.
- [ ] `tests/migrations.test.ts` — validates multi-tab blocked/versionchange event dispatch.
- [ ] `tests/shell.test.tsx` — validates Ant Design shell rendering, drawer switching, and hash navigation.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Single-user personal local application without backend or user accounts. |
| V3 Session Management | no | Local client only; no server-side sessions. |
| V4 Access Control | no | Origin-isolated browser IndexedDB storage. |
| V5 Input Validation | yes | Strict Zod schema validation for database objects, date string regexes (`YYYY-MM-DD`), and non-negative integer minutes. |
| V6 Cryptography | yes (partial) | Cryptographically secure UUIDs via `crypto.randomUUID()`. Web Crypto utilized in later phase for backup encryption. |

### Known Threat Patterns for Static PWA + IndexedDB

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-Site Scripting (XSS) injecting malicious data into IndexedDB | Tampering / Information Disclosure | React DOM automatic string escaping; strict Zod schema validation on record writes; zero `dangerouslySetInnerHTML`. |
| Unintended database destruction | Denial of Service | Require user to type exact uppercase string "RESET" inside an Ant Design modal before executing database wipe. |
| Stale / Broken DB upgrade locking out user | Denial of Service | Graceful `versionchange` event handling and non-destructive schema migrations. |

## Sources

### Primary (HIGH confidence)
- `https://registry.npmjs.org/` — Verified latest package versions, publish dates, and dependencies for React 19, Ant Design 6, Dexie 4, Vite 8, Vitest 5, Zod 4.
- `CLAUDE.md` — Project canonical architecture guidelines, approved stack, and GitHub Pages requirements.
- `https://dexie.org/docs/` — Dexie versioning, table declaration, transaction, and concurrency documentation.
- `https://vite.dev/guide/static-deploy.html` — Official Vite documentation for GitHub Pages deployment.

### Secondary (MEDIUM confidence)
- Ant Design 6 official responsive layout and `Grid.useBreakpoint` documentation.
- MDN Web Docs: `crypto.randomUUID()`, `IndexedDB API`, `Navigator.onLine`.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Verified directly against npm registry and official docs.
- Architecture: HIGH — Follows strict CLAUDE.md specifications, CONTEXT.md decisions, and Dexie best practices.
- Pitfalls: HIGH — Specific failure modes for GitHub Pages subpath routing and IndexedDB multi-tab locking documented.

**Research date:** 2026-09-26
**Valid until:** 2026-10-26
