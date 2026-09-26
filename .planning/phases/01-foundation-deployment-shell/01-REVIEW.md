---
phase: 01-foundation-deployment-shell
reviewed: 2026-09-26T14:55:00Z
depth: standard
files_reviewed: 26
files_reviewed_list:
  - tests/setup.ts
  - src/types/models.ts
  - src/types/navigation.ts
  - src/utils/uuid.ts
  - src/utils/date.ts
  - src/db/schema.ts
  - src/db/index.ts
  - src/db/seeds.ts
  - tests/uuid.test.ts
  - tests/schema.test.ts
  - tests/db.test.ts
  - src/components/shell/UpgradeModal.tsx
  - src/components/common/ResetDbModal.tsx
  - src/components/shell/StatusBadge.tsx
  - src/components/shell/Navigation.tsx
  - src/components/shell/AppShell.tsx
  - src/components/common/EmptyState.tsx
  - src/hooks/useNetworkStatus.ts
  - src/hooks/useThemeMode.ts
  - src/hooks/useHashRoute.ts
  - src/App.tsx
  - src/main.tsx
  - tests/migrations.test.tsx
  - tests/shell.test.tsx
  - public/manifest.json
  - .github/workflows/deploy.yml
findings:
  critical: 2
  warning: 5
  info: 3
  total: 10
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-09-26T14:55:00Z
**Depth:** standard
**Files Reviewed:** 26
**Status:** issues_found

## Summary

Code review completed across core data models, Dexie IndexedDB persistence, seed scripts, shell navigation components, routing, theme hooks, and build/deploy pipelines. Two blocker/critical issues identified: dark mode header contrast failure (white-on-white text) and concurrency TOCTOU race in database initialization leading to duplicate capacity rules. Five warnings and three info items identified.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Hardcoded Header Background Causes Invisible White-on-White Text in Dark Mode

**File:** `src/components/shell/AppShell.tsx:60`
**Issue:** `Header` inline styles force `background: '#fff'`. When `isDark` is true, Ant Design `ConfigProvider` activates `darkAlgorithm`, turning `Typography.Title` and child typography text white/light grey (`rgba(255, 255, 255, 0.85)`). The white text rendered over `#fff` background renders the application title and header text completely unreadable. Additionally, `<Sider>` on line 31 hardcodes `theme="light"`, causing the sidebar to clash with dark mode content.
**Fix:**
Use Ant Design's `theme.useToken()` to dynamically consume `token.colorBgContainer` or remove the hardcoded background override so the header respects dark mode:
```tsx
import { theme } from 'antd';

export const AppShell: React.FC<AppShellProps> = ({ currentRoute, onNavigate, children }) => {
  const { token } = theme.useToken();
  // ...
  <Header
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px',
      background: token.colorBgContainer,
    }}
  >
```

### CR-02: TOCTOU Concurrency Race and Missing Unique Constraint in `initializeDatabaseDefaults` Creates Duplicate Capacity Rules

**File:** `src/db/seeds.ts:9-23` and `src/db/schema.ts:5`
**Issue:** `initializeDatabaseDefaults` checks `count() === 0` outside of an atomic Dexie transaction before executing `bulkAdd`. In React 19 `<React.StrictMode>` (which runs effects concurrently on mount) or multi-tab scenarios, concurrent calls see count `0` before either finishes inserting. Furthermore, `SCHEMA_V1.capacityRules` defines `'id, dayOfWeek'` without a unique index on `dayOfWeek`. As a result, both concurrent calls generate distinct UUIDs and insert 14 duplicate capacity rules (two per day of week), corrupting capacity calculations.
**Fix:**
Add unique index `&dayOfWeek` to `capacityRules` schema and execute the initialization inside an atomic Dexie readwrite transaction:
```typescript
// src/db/schema.ts:5
capacityRules: 'id, &dayOfWeek',

// src/db/seeds.ts:9-23
export async function initializeDatabaseDefaults(targetDb: TaskPlannerDatabase = db): Promise<void> {
  await targetDb.transaction('rw', targetDb.capacityRules, async () => {
    const existingRules = await targetDb.capacityRules.count();
    if (existingRules === 0) {
      const defaultRules: CapacityRule[] = [
        { id: generateId(), dayOfWeek: 1, workMinutes: 480 },
        { id: generateId(), dayOfWeek: 2, workMinutes: 480 },
        { id: generateId(), dayOfWeek: 3, workMinutes: 480 },
        { id: generateId(), dayOfWeek: 4, workMinutes: 480 },
        { id: generateId(), dayOfWeek: 5, workMinutes: 480 },
        { id: generateId(), dayOfWeek: 6, workMinutes: 0 },
        { id: generateId(), dayOfWeek: 0, workMinutes: 0 },
      ];
      await targetDb.capacityRules.bulkAdd(defaultRules);
    }
  });
}
```

## Warnings

### WR-01: Capacity Rules Display Order is Unordered and Scrambled Across Renders

**File:** `src/App.tsx:26`
**Issue:** `useLiveQuery(() => db.capacityRules.toArray(), [])` queries records by primary key. Because `id` is a random UUID (`crypto.randomUUID()`), Dexie returns records ordered by UUID string hash rather than day order. The weekly schedule renders in arbitrary, randomized day order on every fresh database initialization.
**Fix:**
Order query results by `dayOfWeek`:
```tsx
const capacityRules = useLiveQuery(() => db.capacityRules.orderBy('dayOfWeek').toArray(), []) ?? [];
```

### WR-02: Missing Error Handling in `ResetDbModal.handleReset` Causes Unhandled Rejection

**File:** `src/components/common/ResetDbModal.tsx:16-26`
**Issue:** `handleReset` executes `await resetDatabaseToDefaults()` with `try ... finally` but lacks a `catch` block. If IndexedDB operations fail (e.g. database blocked, quota exceeded), the exception is thrown as an unhandled promise rejection in the React event loop. The modal remains stuck open without user feedback.
**Fix:**
Catch errors and notify user or display error alert:
```tsx
const handleReset = async () => {
  if (confirmText !== 'RESET') return;
  setLoading(true);
  try {
    await resetDatabaseToDefaults();
    setConfirmText('');
    onClose();
  } catch (err) {
    console.error('Failed to reset database:', err);
  } finally {
    setLoading(false);
  }
};
```

### WR-03: `useHashRoute` Parser Fails on Trailing Slashes or Query Parameters

**File:** `src/hooks/useHashRoute.ts:7-14`
**Issue:** `hash = window.location.hash.replace(/^#\/?/, '').trim()` uses strict equality checks against `'tasks'`, `'projects'`, `'planner'`, and `'settings'`. Navigation with trailing slash (e.g. `#/projects/`) or search params (e.g. `#/tasks?view=all`) causes equality checks to fail and silently fall back to `defaultRoute` ('tasks').
**Fix:**
Normalize route key before route matching:
```typescript
const hash = window.location.hash.replace(/^#\/?/, '').split(/[?#/]/)[0]?.trim().toLowerCase();
```

### WR-04: Misleading Persistence Layer Description in `StatusBadge` Tooltip

**File:** `src/components/shell/StatusBadge.tsx:9`
**Issue:** Tooltip displays `'Offline (Local storage active)'`. The application uses IndexedDB (Dexie) as its durable local store, not `localStorage`. Project guidelines explicitly forbid `localStorage` for database persistence. The label is inaccurate.
**Fix:**
Update tooltip text:
```tsx
<Tooltip title={isOnline ? 'Online (IndexedDB connected)' : 'Offline (Local IndexedDB active)'}>
```

### WR-05: Missing `%BASE_URL%` Prefix for Manifest in `index.html`

**File:** `index.html:8`
**Issue:** `<link rel="manifest" href="manifest.json" />` uses a relative path without Vite's `%BASE_URL%`. On GitHub Pages subpaths (`/task-management/`), visiting without a trailing slash causes the browser to resolve relative URLs against repository root (`/manifest.json`), producing 404s.
**Fix:**
```html
<link rel="manifest" href="%BASE_URL%manifest.json" />
```

## Info

### IN-01: Code Duplication for Baseline Capacity Rules in `seeds.ts`

**File:** `src/db/seeds.ts:12-20` and `src/db/seeds.ts:33-41`
**Issue:** Default 7-rule capacity array is defined twice identically in `initializeDatabaseDefaults` and `resetDatabaseToDefaults`.
**Fix:** Extract into private helper `createDefaultCapacityRules()`.

### IN-02: Node Version Mismatch in CI Deployment Workflow

**File:** `.github/workflows/deploy.yml:30`
**Issue:** Workflow specifies `node-version: 22`. `CLAUDE.md` specifies Node.js 24 LTS as the target runtime engine.
**Fix:** Change `node-version: 22` to `node-version: 24` in `deploy.yml`.

### IN-03: Empty Icons Array in `manifest.json`

**File:** `public/manifest.json:10`
**Issue:** `"icons": []` prevents browser PWA installability prompt from triggering. Noted as stub for Phase 7, but tracked for installability requirement.
**Fix:** Add standard 192x192 and 512x512 PWA app icon assets when assets are ready.

---

_Reviewed: 2026-09-26T14:55:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
