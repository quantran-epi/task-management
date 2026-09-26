# Phase 1: Foundation & Deployment Shell - Pattern Map

**Mapped:** 2026-09-26
**Files analyzed:** 30
**Analogs found:** 0 / 30 (greenfield repository — baseline patterns sourced from canonical specifications and 01-RESEARCH.md)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `package.json` | config | file-I/O | none (greenfield) | research-spec |
| `tsconfig.json` | config | file-I/O | none (greenfield) | research-spec |
| `vite.config.ts` | config | file-I/O | none (greenfield) | research-spec |
| `index.html` | component | request-response | none (greenfield) | research-spec |
| `.github/workflows/deploy.yml` | config | batch | none (greenfield) | research-spec |
| `src/types/models.ts` | model | transform | none (greenfield) | research-spec |
| `src/types/navigation.ts` | model | transform | none (greenfield) | research-spec |
| `src/utils/uuid.ts` | utility | request-response | none (greenfield) | research-spec |
| `src/utils/date.ts` | utility | transform | none (greenfield) | research-spec |
| `src/db/schema.ts` | model | request-response | none (greenfield) | research-spec |
| `src/db/index.ts` | service | event-driven | none (greenfield) | research-spec |
| `src/db/seeds.ts` | service | batch | none (greenfield) | research-spec |
| `src/db/migrations.ts` | service | event-driven | none (greenfield) | research-spec |
| `src/hooks/useNetworkStatus.ts` | hook | event-driven | none (greenfield) | research-spec |
| `src/hooks/useHashRoute.ts` | hook | event-driven | none (greenfield) | research-spec |
| `src/hooks/useThemeMode.ts` | hook | event-driven | none (greenfield) | research-spec |
| `src/components/shell/AppShell.tsx` | component | request-response | none (greenfield) | research-spec |
| `src/components/shell/Navigation.tsx` | component | request-response | none (greenfield) | research-spec |
| `src/components/shell/StatusBadge.tsx` | component | event-driven | none (greenfield) | research-spec |
| `src/components/shell/UpgradeModal.tsx` | component | event-driven | none (greenfield) | research-spec |
| `src/components/common/ResetDbModal.tsx` | component | request-response | none (greenfield) | research-spec |
| `src/components/common/EmptyState.tsx` | component | request-response | none (greenfield) | research-spec |
| `src/App.tsx` | provider | request-response | none (greenfield) | research-spec |
| `src/main.tsx` | utility | request-response | none (greenfield) | research-spec |
| `tests/setup.ts` | test | batch | none (greenfield) | research-spec |
| `tests/uuid.test.ts` | test | request-response | none (greenfield) | research-spec |
| `tests/db.test.ts` | test | CRUD | none (greenfield) | research-spec |
| `tests/schema.test.ts` | test | transform | none (greenfield) | research-spec |
| `tests/migrations.test.ts` | test | event-driven | none (greenfield) | research-spec |
| `tests/shell.test.tsx` | test | request-response | none (greenfield) | research-spec |

## Pattern Assignments

### `src/utils/uuid.ts` (utility, request-response)

**Analog:** Greenfield specification (CLAUDE.md DATA-01, RFC 4122 v4)

**Core pattern:**
```typescript
/**
 * Generates an RFC 4122 v4 UUID using native browser Web Crypto API.
 * Guarantees zero-dependency, stable identifier creation.
 */
export function generateId(): string {
  return crypto.randomUUID();
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(id: string): boolean {
  return UUID_REGEX.test(id);
}
```

---

### `src/utils/date.ts` (utility, transform)

**Analog:** Greenfield specification (CLAUDE.md DATA-03, 01-RESEARCH.md lines 220-242)

**Imports pattern:**
```typescript
import dayjs from 'dayjs';
```

**Core validation and formatting pattern:**
```typescript
export const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates strict YYYY-MM-DD calendar date string.
 * Rejects ISO timestamps, Date objects, or time-bearing strings.
 */
export function isValidCalendarDate(val: string): boolean {
  if (!DATE_REGEX.test(val)) return false;
  return dayjs(val, 'YYYY-MM-DD', true).isValid();
}

/**
 * Returns today's date formatted as strict YYYY-MM-DD.
 */
export function getTodayDateString(): string {
  return dayjs().format('YYYY-MM-DD');
}

/**
 * Validates non-negative integer minutes.
 */
export function isValidMinutes(minutes: number): boolean {
  return Number.isInteger(minutes) && minutes >= 0;
}
```

---

### `src/db/schema.ts` & `src/types/models.ts` (model, request-response)

**Analog:** Greenfield specification (01-RESEARCH.md lines 364-440, CLAUDE.md)

**Core types & table definitions:**
```typescript
export interface Project {
  id: string; // crypto.randomUUID()
  name: string;
  description?: string;
  deadline?: string; // YYYY-MM-DD
  notes?: string;
  status: 'Open' | 'In Progress' | 'Done' | 'Cancelled';
  createdAt: string; // ISO string for metadata only
  updatedAt: string;
}

export interface Milestone {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  deadline?: string; // YYYY-MM-DD
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
  deadline?: string; // YYYY-MM-DD
  notes?: string;
  actualStartDate?: string; // YYYY-MM-DD
  actualEndDate?: string; // YYYY-MM-DD
  status: 'Open' | 'In Progress' | 'Resolved' | 'In Review' | 'Done' | 'Cancelled';
  progress: number; // 0 - 100
  priority: 'Low' | 'Medium' | 'High' | 'Urgent';
  estimateMinutes: number; // Integer minutes
  documentLinks?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CapacityRule {
  id: string;
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  workMinutes: number; // Integer minutes, e.g., 480 for 8h
}

export interface CapacityOverride {
  id: string;
  date: string; // YYYY-MM-DD
  workMinutes: number; // Integer minutes: 0 for holiday, >0 for adjusted
  note?: string;
}

export interface PlannedAllocation {
  id: string;
  taskId: string;
  date: string; // YYYY-MM-DD
  allocatedMinutes: number; // Integer minutes
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
```

---

### `src/db/index.ts` (service, event-driven)

**Analog:** Greenfield specification (01-RESEARCH.md lines 248-269, lines 441-465)

**Imports pattern:**
```typescript
import Dexie, { type Table } from 'dexie';
import type {
  Project,
  Milestone,
  Task,
  CapacityRule,
  CapacityOverride,
  PlannedAllocation,
  Setting,
  BackupMetadata,
} from '../types/models';
```

**Core database class and multi-tab conflict handling:**
```typescript
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
      backupMetadata: 'id, timestamp',
    });

    // Multi-tab concurrency handlers (DATA-04, D-09, D-10)
    this.on('blocked', () => {
      window.dispatchEvent(new CustomEvent('db-upgrade-blocked'));
    });

    this.on('versionchange', (event) => {
      window.dispatchEvent(new CustomEvent('db-version-changed', { detail: event }));
      this.close();
    });
  }
}

export const db = new TaskPlannerDatabase();
```

---

### `src/db/seeds.ts` (service, batch)

**Analog:** Greenfield specification (01-RESEARCH.md lines 468-484, CONTEXT.md D-05)

**Core initialization pattern:**
```typescript
import { db } from './index';
import { generateId } from '../utils/uuid';
import type { CapacityRule } from '../types/models';

export async function initializeDatabaseDefaults(): Promise<void> {
  const existingRules = await db.capacityRules.count();
  if (existingRules === 0) {
    // Mon-Fri: 8 hours (480 mins), Sat-Sun: 0 hours
    const defaultRules: CapacityRule[] = [
      { id: generateId(), dayOfWeek: 1, workMinutes: 480 },
      { id: generateId(), dayOfWeek: 2, workMinutes: 480 },
      { id: generateId(), dayOfWeek: 3, workMinutes: 480 },
      { id: generateId(), dayOfWeek: 4, workMinutes: 480 },
      { id: generateId(), dayOfWeek: 5, workMinutes: 480 },
      { id: generateId(), dayOfWeek: 6, workMinutes: 0 },
      { id: generateId(), dayOfWeek: 0, workMinutes: 0 },
    ];
    await db.capacityRules.bulkAdd(defaultRules);
  }
}

export async function resetDatabaseToDefaults(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()));
    // Mon-Fri: 8 hours (480 mins), Sat-Sun: 0 hours
    const defaultRules: CapacityRule[] = [
      { id: generateId(), dayOfWeek: 1, workMinutes: 480 },
      { id: generateId(), dayOfWeek: 2, workMinutes: 480 },
      { id: generateId(), dayOfWeek: 3, workMinutes: 480 },
      { id: generateId(), dayOfWeek: 4, workMinutes: 480 },
      { id: generateId(), dayOfWeek: 5, workMinutes: 480 },
      { id: generateId(), dayOfWeek: 6, workMinutes: 0 },
      { id: generateId(), dayOfWeek: 0, workMinutes: 0 },
    ];
    await db.capacityRules.bulkAdd(defaultRules);
  });
}
```

---

### `src/hooks/useHashRoute.ts` (hook, event-driven)

**Analog:** Greenfield specification (01-CONTEXT.md D-02, 01-RESEARCH.md line 198)

**Core pattern:**
```typescript
import { useState, useEffect } from 'react';

export type AppRoute = 'tasks' | 'projects' | 'planner' | 'settings';

export function useHashRoute(defaultRoute: AppRoute = 'tasks') {
  const getRouteFromHash = (): AppRoute => {
    const hash = window.location.hash.replace(/^#\/?/, '').trim();
    if (hash === 'projects' || hash === 'planner' || hash === 'settings') {
      return hash;
    }
    return defaultRoute;
  };

  const [route, setRoute] = useState<AppRoute>(getRouteFromHash);

  useEffect(() => {
    const onHashChange = () => setRoute(getRouteFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [defaultRoute]);

  const navigate = (nextRoute: AppRoute) => {
    window.location.hash = `#/${nextRoute}`;
  };

  return { route, navigate };
}
```

---

### `src/components/shell/AppShell.tsx` (component, request-response)

**Analog:** Greenfield specification (01-RESEARCH.md lines 275-321, 01-UI-SPEC.md)

**Imports pattern:**
```typescript
import React, { useState } from 'react';
import { Layout, Drawer, Grid, Button, Typography, Space } from 'antd';
import { MenuOutlined } from '@ant-design/icons';
import { Navigation } from './Navigation';
import { StatusBadge } from './StatusBadge';
import { UpgradeModal } from './UpgradeModal';
import { ResetDbModal } from '../common/ResetDbModal';
import type { AppRoute } from '../../hooks/useHashRoute';
```

**Responsive breakpoint switch & shell structure:**
```typescript
const { Header, Sider, Content } = Layout;
const { useBreakpoint } = Grid;
const { Title } = Typography;

interface AppShellProps {
  currentRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ currentRoute, onNavigate, children }) => {
  const screens = useBreakpoint();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const isMobile = !screens.md; // md breakpoint is 768px

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {!isMobile ? (
        <Sider collapsible breakpoint="lg" theme="light">
          <Navigation currentRoute={currentRoute} onNavigate={onNavigate} />
        </Sider>
      ) : (
        <Drawer
          placement="left"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          styles={{ body: { padding: 0 } }}
        >
          <Navigation
            currentRoute={currentRoute}
            onNavigate={(route) => {
              onNavigate(route);
              setDrawerOpen(false);
            }}
          />
        </Drawer>
      )}

      <Layout>
        <Header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 16px',
            background: '#fff',
          }}
        >
          <Space>
            {isMobile && (
              <Button
                icon={<MenuOutlined />}
                onClick={() => setDrawerOpen(true)}
                aria-label="Open menu"
                style={{ minHeight: 44, minWidth: 44 }}
              />
            )}
            <Title level={4} style={{ margin: 0 }}>
              Task Planner
            </Title>
          </Space>
          <Space orientation="horizontal" size="middle">
            <StatusBadge />
            <Button onClick={() => setResetModalOpen(true)} danger size="small">
              Reset DB
            </Button>
          </Space>
        </Header>

        <Content style={{ margin: 16 }}>{children}</Content>
      </Layout>

      <UpgradeModal />
      <ResetDbModal open={resetModalOpen} onClose={() => setResetModalOpen(false)} />
    </Layout>
  );
};
```

---

### `src/components/common/ResetDbModal.tsx` (component, request-response)

**Analog:** Greenfield specification (01-CONTEXT.md D-07, D-08, 01-UI-SPEC.md line 99)

**Imports pattern:**
```typescript
import React, { useState } from 'react';
import { Modal, Input, Typography, Alert } from 'antd';
import { resetDatabaseToDefaults } from '../../db/seeds';

const { Text } = Typography;
```

**Core guarded reset pattern:**
```typescript
interface ResetDbModalProps {
  open: boolean;
  onClose: () => void;
}

export const ResetDbModal: React.FC<ResetDbModalProps> = ({ open, onClose }) => {
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    if (confirmText !== 'RESET') return;
    setLoading(true);
    try {
      await resetDatabaseToDefaults();
      setConfirmText('');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="Reset Database"
      open={open}
      onCancel={() => {
        setConfirmText('');
        onClose();
      }}
      onOk={handleReset}
      okText="Confirm Reset"
      okButtonProps={{ danger: true, disabled: confirmText !== 'RESET', loading }}
    >
      <Alert
        type="error"
        message="Destructive Action"
        description="Type RESET to confirm complete database purge. This action cannot be undone."
        showIcon
        style={{ marginBottom: 16 }}
      />
      <Text strong>Type "RESET" below:</Text>
      <Input
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        placeholder="RESET"
        style={{ marginTop: 8 }}
      />
    </Modal>
  );
};
```

---

### `src/components/shell/UpgradeModal.tsx` (component, event-driven)

**Analog:** Greenfield specification (01-CONTEXT.md D-09, D-10, 01-UI-SPEC.md line 98)

**Core multi-tab blocking modal pattern:**
```typescript
import React, { useState, useEffect } from 'react';
import { Modal, Alert } from 'antd';

export const UpgradeModal: React.FC = () => {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const handleBlocked = () => setBlocked(true);
    const handleVersionChanged = () => setBlocked(true);

    window.addEventListener('db-upgrade-blocked', handleBlocked);
    window.addEventListener('db-version-changed', handleVersionChanged);

    return () => {
      window.removeEventListener('db-upgrade-blocked', handleBlocked);
      window.removeEventListener('db-version-changed', handleVersionChanged);
    };
  }, []);

  return (
    <Modal
      title="Database Upgrade Blocked"
      open={blocked}
      closable={false}
      footer={[
        <button
          key="reload"
          type="button"
          className="ant-btn ant-btn-primary"
          onClick={() => window.location.reload()}
        >
          Reload Page
        </button>,
      ]}
    >
      <Alert
        type="warning"
        message="Conflicting Browser Tab"
        description="Database upgrade blocked by another tab. Close competing tabs and reload to continue."
        showIcon
      />
    </Modal>
  );
};
```

---

### `tests/setup.ts` (test, batch)

**Analog:** Greenfield test infrastructure (fake-indexeddb + @testing-library/jest-dom)

**Imports & setup pattern:**
```typescript
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom';
```

---

### `tests/db.test.ts` (test, CRUD)

**Analog:** Greenfield test specification (DATA-02, DATA-03, 01-VALIDATION.md)

**Test suite pattern:**
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db';
import { initializeDatabaseDefaults } from '../src/db/seeds';
import { generateId } from '../src/utils/uuid';

describe('Dexie Database Persistence & Seeds', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('initializes default capacity rules (DATA-02)', async () => {
    await initializeDatabaseDefaults();
    const rules = await db.capacityRules.toArray();
    expect(rules).toHaveLength(7);
    const monday = rules.find((r) => r.dayOfWeek === 1);
    expect(monday?.workMinutes).toBe(480);
    const sunday = rules.find((r) => r.dayOfWeek === 0);
    expect(sunday?.workMinutes).toBe(0);
  });

  it('persists tasks with UUID and integer minutes (DATA-01, DATA-03)', async () => {
    const id = generateId();
    await db.tasks.add({
      id,
      name: 'Initial task',
      status: 'Open',
      progress: 0,
      priority: 'Medium',
      estimateMinutes: 120,
      deadline: '2026-10-01',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const stored = await db.tasks.get(id);
    expect(stored).toBeDefined();
    expect(stored?.id).toBe(id);
    expect(stored?.estimateMinutes).toBe(120);
    expect(stored?.deadline).toBe('2026-10-01');
  });
});
```

---

### `.github/workflows/deploy.yml` (config, batch)

**Analog:** Greenfield specification (01-RESEARCH.md lines 487-541)

**Workflow pattern:**
```yaml
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

## Shared Patterns

### Native UUID Generation
**Apply to:** All entity models (`src/types/models.ts`), seeders (`src/db/seeds.ts`), task creation, tests
```typescript
// Uses native Web Crypto API in secure context; zero npm dependency
const id: string = crypto.randomUUID();
```

### Strict Calendar Date & Integer Minute Standard
**Apply to:** All database schemas, models, mutations, queries, and UI forms
```typescript
// Strict YYYY-MM-DD calendar date strings — never Date objects or ISO timestamps in storage
export const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
// Integer minutes for durations and capacity — never floating-point hours
export function toMinutes(hours: number): number {
  return Math.round(hours * 60);
}
```

### Multi-Tab Concurrency Event Dispatch
**Apply to:** `src/db/index.ts` and `src/components/shell/UpgradeModal.tsx`
```typescript
// Custom window events decouple database core from UI modal presentation
window.dispatchEvent(new CustomEvent('db-upgrade-blocked'));
window.dispatchEvent(new CustomEvent('db-version-changed', { detail: event }));
```

### Ant Design Responsive Breakpoints
**Apply to:** `src/components/shell/AppShell.tsx` and all responsive layouts
```typescript
// Breakpoint standard: md = 768px. Desktop uses Sider, mobile (<768px) uses Drawer.
const screens = useBreakpoint();
const isMobile = !screens.md;
```

## No Analog Found

Greenfield repository — all 30 files are newly planned for Phase 1. Pattern sources correspond directly to `01-RESEARCH.md`, `CLAUDE.md`, and `01-UI-SPEC.md`.

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `package.json` | config | file-I/O | Greenfield repository; initial Vite 8 + React 19 configuration |
| `tsconfig.json` | config | file-I/O | Greenfield repository; TypeScript strict config |
| `vite.config.ts` | config | file-I/O | Greenfield repository; base `/task-management/` config |
| `index.html` | component | request-response | Greenfield repository; SPA entry HTML |
| `.github/workflows/deploy.yml` | config | batch | Greenfield repository; GitHub Pages deployment workflow |
| `src/types/models.ts` | model | transform | Greenfield repository; entity definitions |
| `src/types/navigation.ts` | model | transform | Greenfield repository; navigation route types |
| `src/utils/uuid.ts` | utility | request-response | Greenfield repository; native crypto wrapper |
| `src/utils/date.ts` | utility | transform | Greenfield repository; calendar date helpers |
| `src/db/schema.ts` | model | request-response | Greenfield repository; Dexie table schemas |
| `src/db/index.ts` | service | event-driven | Greenfield repository; Dexie connection & multi-tab handlers |
| `src/db/seeds.ts` | service | batch | Greenfield repository; default capacity rules & reset logic |
| `src/db/migrations.ts` | service | event-driven | Greenfield repository; Dexie migration definitions |
| `src/hooks/useNetworkStatus.ts` | hook | event-driven | Greenfield repository; navigator.onLine listener |
| `src/hooks/useHashRoute.ts` | hook | event-driven | Greenfield repository; lightweight hash router |
| `src/hooks/useThemeMode.ts` | hook | event-driven | Greenfield repository; dark/light mode toggle |
| `src/components/shell/AppShell.tsx` | component | request-response | Greenfield repository; responsive Ant Design layout |
| `src/components/shell/Navigation.tsx` | component | request-response | Greenfield repository; menu and hash routing |
| `src/components/shell/StatusBadge.tsx` | component | event-driven | Greenfield repository; online/offline and DB status |
| `src/components/shell/UpgradeModal.tsx` | component | event-driven | Greenfield repository; multi-tab upgrade alert modal |
| `src/components/common/ResetDbModal.tsx` | component | request-response | Greenfield repository; guarded database purge modal |
| `src/components/common/EmptyState.tsx` | component | request-response | Greenfield repository; Ant Design Empty wrapper |
| `src/App.tsx` | provider | request-response | Greenfield repository; Ant Design ConfigProvider root |
| `src/main.tsx` | utility | request-response | Greenfield repository; React 19 createRoot entrypoint |
| `tests/setup.ts` | test | batch | Greenfield repository; fake-indexeddb environment |
| `tests/uuid.test.ts` | test | request-response | Greenfield repository; UUID unit test |
| `tests/db.test.ts` | test | CRUD | Greenfield repository; Dexie DB integration test |
| `tests/schema.test.ts` | test | transform | Greenfield repository; date and minute validation test |
| `tests/migrations.test.ts` | test | event-driven | Greenfield repository; schema migration test |
| `tests/shell.test.tsx` | test | request-response | Greenfield repository; AppShell render test |

## Metadata

**Analog search scope:** Whole repository (`D:\personal\task-management`)
**Files scanned:** 0 existing code files (greenfield repository)
**Pattern extraction date:** 2026-09-26
