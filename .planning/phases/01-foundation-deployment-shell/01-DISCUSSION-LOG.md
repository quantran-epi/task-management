# Phase 1: Foundation & Deployment Shell - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-26
**Phase:** 1-Foundation & Deployment Shell
**Areas discussed:** App Shell Layout, Sample Seed Data, Tab Conflict UX, Theme & Spacing

---

## App Shell Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Collapsible Sidebar (Recommended) | Standard desktop planner feel. Collapses to icons or mobile drawer. Clear hierarchy for views. | ✓ |
| Top Header Navigation | Leaves full screen width for tables and daily planning grids. Items fit in top header. | |
| Mobile-style Bottom Nav | Minimal header on desktop; tab bar fixed at bottom on small screens. Good for mobile touch. | |

**User's choice:** Collapsible Sidebar (Recommended)
**Notes:** Provides a standard, scalable desktop planner layout.

| Option | Description | Selected |
|--------|-------------|----------|
| Hash Routing (Recommended) | Browser back/forward and deep bookmarks work on GitHub Pages without 404 rewrite issues. | ✓ |
| In-Memory View State | No router library needed. Current view stored in React/Zustand state; refresh resets to home view. | |

**User's choice:** Hash Routing (Recommended)
**Notes:** Hash routing avoids deep reload 404s on GitHub Pages static hosting.

| Option | Description | Selected |
|--------|-------------|----------|
| Slide-over Drawer (Recommended) | Sidebar hides on mobile screens; tap hamburger button in header to open slide-out Drawer. | ✓ |
| Compact Icon Rail | Sidebar shrinks to 48px-64px icon bar on mobile. Visible at all times, no drawer. | |
| Responsive Bar Switch | Sidebar disabled on mobile; switches to top or bottom bar below 768px. | |

**User's choice:** Slide-over Drawer (Recommended)
**Notes:** Standard mobile pattern for responsive dashboards.

| Option | Description | Selected |
|--------|-------------|----------|
| Status & Breadcrumb (Recommended) | App title, active view name, and subtle offline/online connection badge. Clean and focused. | ✓ |
| Header with Quick Action | Includes title, connection badge, plus persistent Quick Add button slot for subsequent phases. | |
| Minimal Title Only | App title and sidebar toggle button only. No extra status badges or action buttons in header. | |

**User's choice:** Status & Breadcrumb (Recommended)
**Notes:** Keeps header clean and focused.

---

## Sample Seed Data

| Option | Description | Selected |
|--------|-------------|----------|
| Clean Defaults Only (Recommended) | Create only baseline weekly capacity (Mon-Fri 8h, Sat-Sun 0h). Zero sample projects or tasks. | ✓ |
| Optional Demo Loader Button | Start empty, but provide a 'Load Demo Data' button in Settings/shell to populate test data on demand. | |
| Auto-populate Demo Dataset | Automatically populate sample project, milestones, and tasks on first launch. User must delete later. | |

**User's choice:** Clean Defaults Only (Recommended)
**Notes:** Avoids unwanted fake task clutter on first use.

| Option | Description | Selected |
|--------|-------------|----------|
| Ant Design Empty (Recommended) | Use standard Ant Design Empty component with concise contextual prompt and subtle illustration. | ✓ |
| Minimal Text Prompt | Minimal muted one-line text centered on screen. No illustration, lowest visual weight. | |
| Feature Summary Card | Structured card detailing upcoming capabilities for that section with links to settings. | |

**User's choice:** Ant Design Empty (Recommended)
**Notes:** Native Ant Design empty state representation.

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit UI Reset (Recommended) | Settings/About drawer includes 'Reset Database' button requiring explicit confirmation dialog. | ✓ |
| Defer to Phase 6 | No reset controls in the UI until Phase 6 (Safe Local Backup & Restore). Users clear via DevTools. | |
| Dev-only Hidden Trigger | Hidden developer shortcut (e.g. click version tag or DevTools function). | |

**User's choice:** Explicit UI Reset (Recommended)
**Notes:** Useful for manual testing and baseline verification in Phase 1.

| Option | Description | Selected |
|--------|-------------|----------|
| Typed Confirmation (Recommended) | Modal requires typing the word 'RESET' into a text box before destructive action button unlocks. | ✓ |
| Standard Confirm Modal | Standard Ant Design Modal.confirm dialog with red Danger button and warning icon. | |
| Two-step Dialog | Two-step confirmation: dialog warning followed by Popconfirm popover on the final button. | |

**User's choice:** Typed Confirmation (Recommended)
**Notes:** Prevents accidental wiping of local database data.

---

## Tab Conflict UX

| Option | Description | Selected |
|--------|-------------|----------|
| Blocking Modal Dialog (Recommended) | Modal dialog or full-page block explaining another tab is open, with a 'Reload' button. Prevents race conditions. | ✓ |
| Top Banner Alert | Persistent yellow Alert banner at top of viewport. User can still inspect current view, but writes are disabled. | |
| Notification Toast | Corner notification toast with warning icon and reload action button. | |

**User's choice:** Blocking Modal Dialog (Recommended)
**Notes:** Safely prevents data mutation and race conditions during schema upgrade locks.

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-dismiss on Close (Recommended) | Listen for unblock/resume events; automatically dismiss modal or reload immediately once competing tab closes. | ✓ |
| Manual Reload Click | Keep modal open with 'Reload Page' button until user explicitly clicks it. | |
| Countdown Timer | Show 5-second countdown timer before automatic reload, with immediate 'Reload Now' button. | |

**User's choice:** Auto-dismiss on Close (Recommended)
**Notes:** Seamless recovery once user closes the competing tab.

| Option | Description | Selected |
|--------|-------------|----------|
| Native useLiveQuery (Recommended) | Dexie useLiveQuery automatically reacts across tabs on modern browsers without extra code. Use native behavior. | ✓ |
| Explicit BroadcastChannel | Add custom BroadcastChannel messages to ping other tabs when writes happen. | |

**User's choice:** Native useLiveQuery (Recommended)
**Notes:** Built into Dexie; zero extra plumbing required.

| Option | Description | Selected |
|--------|-------------|----------|
| Subtle Status Badge (Recommended) | Subtle green dot/cloud icon for online, muted orange dot for offline in header breadcrumb area. Tooltip on hover. | ✓ |
| Top Disconnect Banner | Prominent top alert strip appear only when disconnected ('Offline - Changes saved locally'). | |
| No Network Indicator | No offline indicator. The app is offline-first by design so network state is irrelevant in Phase 1. | |

**User's choice:** Subtle Status Badge (Recommended)
**Notes:** Low-profile status representation.

---

## Theme & Spacing

| Option | Description | Selected |
|--------|-------------|----------|
| System Auto with Toggle (Recommended) | Matches user's OS preference by default, with an explicit toggle button in sidebar/settings. | ✓ |
| Light Theme Only | Clean, crisp high-contrast light theme only for v1. Dark mode deferred. | |
| Dark Theme Only | Dark mode permanently enabled by default. | |

**User's choice:** System Auto with Toggle (Recommended)
**Notes:** Automatic system preference detection plus user override toggle.

| Option | Description | Selected |
|--------|-------------|----------|
| Standard Density (Recommended) | Ant Design standard algorithm. Balanced touch targets, comfortable reading for desktop and mobile. | ✓ |
| Compact Density | Ant Design compact algorithm. Tighter tables and forms, fits more rows on screen without scrolling. | |
| Toggleable Density | Toggle in settings or header allowing user to switch between compact and comfortable density. | |

**User's choice:** Standard Density (Recommended)
**Notes:** High accessibility and balanced touch target dimensions.

| Option | Description | Selected |
|--------|-------------|----------|
| Classic Blue (Recommended) | Ant Design default classic blue (#1677ff). Clean, trusted, high-contrast, productive. | ✓ |
| Slate / Modern Dark Blue | Deep slate or dark graphite (#2c3e50 / #1890ff). Modern SaaS aesthetic. | |
| Calm Teal | Earthy teal or emerald green (#0d9488). Fresh, calm workload focus. | |

**User's choice:** Classic Blue (Recommended)
**Notes:** Default Ant Design primary palette.

| Option | Description | Selected |
|--------|-------------|----------|
| System Font Stack (Recommended) | Standard modern system UI font stack (Inter, -apple-system, BlinkMacSystemFont, Segoe UI). Zero web font network overhead. | ✓ |
| Bundled Inter Font | Include Inter font package bundled locally. Consistent typography across OS. | |

**User's choice:** System Font Stack (Recommended)
**Notes:** Native OS UI font rendering with zero bundle/network payload.

---

## Claude's Discretion

- Standard Ant Design grid breakpoints (`xs`, `sm`, `md`, `lg`, `xl`).
- Dexie schema index definitions following `CLAUDE.md`.

## Deferred Ideas

None.
