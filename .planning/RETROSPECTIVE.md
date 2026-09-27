# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — v1.0 MVP

**Shipped:** 2026-09-27
**Phases:** 8 | **Plans:** 28 | **Tasks:** 69

### What Was Built
- Dexie IndexedDB persistence layer with UUID retention, canonical dates, and migration safety.
- Hierarchical work management (Projects, Milestones, Tasks) with reparenting and cascade delete protections.
- Weekly capacity templates, date overrides, and interactive daily planning ledger with dual-encoded load status indicators.
- Feasibility evaluation engine and deterministic lowest-load candidate distribution.
- Multi-horizon workload forecasting dashboard (today attention, 7d/14d/30d horizons) with deep links.
- Safe versioned JSON backup export/import with pre-import snapshot and rollback.
- Installable PWA with offline ServiceWorker caching, active form reload guard, and cross-browser hardening.
- Browser-side Web Crypto PBKDF2/AES-GCM-256 encrypted GitHub Contents API backup sync with memory-only credentials and SHA conflict detection.

### What Worked
- Pure domain logic separation: pure calculation functions (feasibility, capacity, validation, encryption) separated from React components made testing fast, complete, and reliable (386 passing unit/integration tests).
- Pre-import snapshot mechanism in Phase 6 and Phase 8 provided zero-risk database restores with instant rollback.
- FormGuardContext intercepting PWA updates prevented data loss while editing forms.
- Dual-encoding accessibility pattern across all visual badges (icon + text + color) ensured accessibility and clarity.

### What Was Inefficient
- TypeScript `exactOptionalPropertyTypes: true` required careful handling of optional properties throughout forms and repositories, causing small deviations in multiple phases.
- CSS layout squashing on the 7-day planner required a dedicated gap-closure plan (03-04) to establish a 180px min-width standard.

### Patterns Established
- Standardized canonical dates as `YYYY-MM-DD` strings and time quantities as integer minutes.
- Pure engine + repository + hook + component architecture.
- Transient in-memory credential storage pattern (`GitHubAuthContext`) to completely avoid storing tokens or passphrases in persistent storage or logs.

### Key Lessons
1. Pure functions for scheduling math and crypto eliminate race conditions and make comprehensive testing straightforward.
2. In-memory safety snapshots before any destructive IndexedDB write provide bulletproof user confidence.
3. Decoupling UI update banners from active edit states is essential for offline PWAs to avoid silent work loss.

### Cost Observations
- Sessions: 8 phases executed smoothly in focused waves
- Test suite: 63 test files, 386 tests, 100% pass rate
- Zero production backend dependencies: 100% client-side execution on GitHub Pages

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|---|---|---|---|
| v1.0 | 8 | 28 | Initial full lifecycle from foundation to encrypted backup sync |

### Cumulative Quality

| Milestone | Tests | Files | LOC | Pass Rate |
|---|---|---|---|---|
| v1.0 | 386 | 324 | 14,384 | 100% |

### Top Lessons (Verified Across Milestones)

1. Pure mathematical / business logic engines without DOM or React dependencies yield high test coverage and zero regression bugs.
2. Transient memory isolation for security-sensitive tokens completely eliminates accidental persistent leakage.
