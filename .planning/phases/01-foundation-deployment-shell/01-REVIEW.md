---
phase: 01-foundation-deployment-shell
reviewed: 2026-09-26T16:45:00Z
depth: standard
files_reviewed: 26
files_reviewed_list:
  - .github/workflows/deploy.yml
  - public/manifest.json
  - src/App.tsx
  - src/components/common/EmptyState.tsx
  - src/components/common/ResetDbModal.tsx
  - src/components/shell/AppShell.tsx
  - src/components/shell/Navigation.tsx
  - src/components/shell/StatusBadge.tsx
  - src/components/shell/UpgradeModal.tsx
  - src/db/index.ts
  - src/db/schema.ts
  - src/db/seeds.ts
  - src/hooks/useHashRoute.ts
  - src/hooks/useNetworkStatus.ts
  - src/hooks/useThemeMode.ts
  - src/main.tsx
  - src/types/models.ts
  - src/types/navigation.ts
  - src/utils/date.ts
  - src/utils/uuid.ts
  - tests/db.test.ts
  - tests/migrations.test.tsx
  - tests/schema.test.ts
  - tests/setup.ts
  - tests/shell.test.tsx
  - tests/uuid.test.ts
findings:
  critical: 0
  warning: 4
  info: 4
  total: 8
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-09-26T16:45:00Z
**Depth:** standard
**Files Reviewed:** 26
**Status:** issues_found

## Summary

Follow-up code review completed across the 26 source and test files following gap closure plan 01-04. Previous blockers CR-01 (dark mode header contrast failure) and CR-02 (concurrency TOCTOU race on capacity rule initialization) are verified resolved. Schema uniqueness on `&dayOfWeek`, atomic Dexie readwrite transactions, and dynamic theme token integration are functioning correctly with all 30 tests passing.

Zero critical blockers remain. Four warnings and four info items require tracking for robustness, accurate UI state reflection, and test coverage completeness.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: `useHashRoute` Parser Fails on Trailing Slashes and Query Parameters

**File:** `src/hooks/useHashRoute.ts:7-14`
**Issue:** `hash = window.location.hash.replace(/^#\/?/, '').trim()` relies on strict equality against `'projects'`, `'planner'`, `'settings'`, and `'tasks'`. Navigation with a trailing slash (e.g. `#/projects/`) or URL parameters (e.g. `#/tasks?view=all`) causes equality checks to fail and silently falls back to `defaultRoute` ('tasks'), causing unintended navigation resets.
**Fix:**
Parse and isolate the base route segment prior to matching:
```typescript
const getRouteFromHash = (): AppRoute => {
  if (typeof window === 'undefined') return defaultRoute;
  const hash = window.location.hash.replace(/^#\/?/, '').split(/[?#/]/)[0]?.trim().toLowerCase();
  if (hash === 'projects' || hash === 'planner' || hash === 'settings') {
    return hash;
  }
  if (hash === 'tasks') {
    return 'tasks';
  }
  return defaultRoute;
};
```

### WR-02: Misleading Persistence Layer Description in `StatusBadge` Tooltip

**File:** `src/components/shell/StatusBadge.tsx:9`
**Issue:** Tooltip displays `'Offline (Local storage active)'` when offline and `'Online (IndexedDB connected)'` when online. The application uses IndexedDB (Dexie) as its durable local store in both online and offline modes; `localStorage` is explicitly forbidden by architecture guidelines. Describing IndexedDB as "connected online" misleadingly implies it is a remote cloud service rather than an in-browser offline database.
**Fix:**
Update tooltip to reflect network status without misrepresenting the underlying storage mechanism:
```tsx
<Tooltip title={isOnline ? 'Online (Local IndexedDB active)' : 'Offline (Local IndexedDB active)'}>
  <Badge
    status={isOnline ? 'success' : 'warning'}
    text={isOnline ? 'Online' : 'Offline'}
    style={{ cursor: 'pointer' }}
  />
</Tooltip>
```

### WR-03: Relative Manifest Link in `index.html` Breaks on GitHub Pages Root Subpath

**File:** `index.html:8`
**Issue:** `<link rel="manifest" href="manifest.json" />` uses a relative path without Vite's `%BASE_URL%`. On GitHub Pages project sites (`/task-management/`), visiting the URL without a trailing slash causes the browser to resolve `manifest.json` against the user origin root (`https://<user>.github.io/manifest.json`), producing 404 errors.
**Fix:**
Prefix the href attribute with Vite's `%BASE_URL%`:
```html
<link rel="manifest" href="%BASE_URL%manifest.json" />
```

### WR-04: `ResetDbModal` Lacks Error Feedback and Mask Dismissal Guard During Reset

**File:** `src/components/common/ResetDbModal.tsx:16-27` and `31-41`
**Issue:** If `resetDatabaseToDefaults()` throws an error (e.g. database blocked or quota error), the exception is logged to `console.error` but the UI displays no error state; the button simply re-enables with the modal still open. Additionally, `maskClosable` is not disabled while `loading` is true, permitting accidental dismissal or uncoordinated background operations while database purge is active.
**Fix:**
Add local error state to display an alert on failure, and guard modal closure during loading:
```tsx
export const ResetDbModal: React.FC<ResetDbModalProps> = ({ open, onClose }) => {
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleReset = async () => {
    if (confirmText !== 'RESET') return;
    setLoading(true);
    setErrorMessage(null);
    try {
      await resetDatabaseToDefaults();
      setConfirmText('');
      onClose();
    } catch (err) {
      console.error('Failed to reset database:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Database reset failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="Reset Database"
      open={open}
      maskClosable={!loading}
      closable={!loading}
      onCancel={() => {
        if (loading) return;
        setConfirmText('');
        setErrorMessage(null);
        onClose();
      }}
      onOk={handleReset}
      okText="Confirm Reset"
      okButtonProps={{ danger: true, disabled: confirmText !== 'RESET', loading }}
    >
      {errorMessage && (
        <Alert type="error" message="Reset Failed" description={errorMessage} showIcon style={{ marginBottom: 16 }} />
      )}
      {/* ... existing alert and inputs */}
    </Modal>
  );
};
```

## Info

### IN-01: Code Duplication for Baseline Capacity Rules in `seeds.ts`

**File:** `src/db/seeds.ts:13-21` and `src/db/seeds.ts:43-51`
**Issue:** The 7-element default capacity rules array is declared identically in both `initializeDatabaseDefaults` and `resetDatabaseToDefaults`.
**Fix:** Extract the array generation into a shared helper function:
```typescript
function createDefaultCapacityRules(): CapacityRule[] {
  return [
    { id: generateId(), dayOfWeek: 1, workMinutes: 480 },
    { id: generateId(), dayOfWeek: 2, workMinutes: 480 },
    { id: generateId(), dayOfWeek: 3, workMinutes: 480 },
    { id: generateId(), dayOfWeek: 4, workMinutes: 480 },
    { id: generateId(), dayOfWeek: 5, workMinutes: 480 },
    { id: generateId(), dayOfWeek: 6, workMinutes: 0 },
    { id: generateId(), dayOfWeek: 0, workMinutes: 0 },
  ];
}
```

### IN-02: Node Version Specification in CI Deployment Workflow

**File:** `.github/workflows/deploy.yml:30`
**Issue:** Workflow configures `node-version: 22`. `CLAUDE.md` specifies Node.js 24 LTS as the tooling runtime standard.
**Fix:** Update `node-version: 22` to `node-version: 24` in `.github/workflows/deploy.yml`.

### IN-03: Empty Icons Array in Web App Manifest

**File:** `public/manifest.json:10`
**Issue:** `"icons": []` prevents the web app manifest from satisfying Chromium PWA installability requirements. Tracked for asset population during PWA phase.
**Fix:** Add 192x192 and 512x512 icon assets when PWA icons are generated.

### IN-04: Test Coverage Gap for Mobile Navigation Drawer in `AppShell`

**File:** `tests/shell.test.tsx`
**Issue:** `tests/setup.ts` shims `matchMedia` to desktop breakpoints (`min-width: 768px`). As a result, the mobile drawer navigation branch (`screens.md === false`) in `src/components/shell/AppShell.tsx` has zero test coverage for drawer opening, clicking navigation links, and drawer auto-dismissal.
**Fix:** Add a test case in `tests/shell.test.tsx` that simulates mobile viewport breakpoint (`screens.md === false`) and exercises the `Drawer` component interaction.

---

_Reviewed: 2026-09-26T16:45:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
