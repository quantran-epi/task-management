---
phase: 1
slug: foundation-deployment-shell
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-26
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.2 + @testing-library/react 16.3.3 |
| **Config file** | `vite.config.ts` |
| **Quick run command** | `npx vitest run` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run`
- **After every plan wave:** Run `npm run build && npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | DATA-01 | — | N/A | config check | `npx vitest --version` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 1 | DATA-01, DATA-03 | T-01-01 | Strict calendar date regex & dayjs strict parse | unit | `npx vitest run tests/uuid.test.ts tests/schema.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-03 | 01 | 1 | DATA-02 | T-01-02 | Atomic Dexie transaction for purge & baseline seed | integration | `npx vitest run tests/db.test.ts` | ❌ W0 | ⬜ pending |
| 01-02-01 | 02 | 2 | DATA-04 | T-01-03, T-01-04 | Guarded reset typed input & multi-tab upgrade modal | integration | `npx vitest run tests/migrations.test.ts` | ❌ W0 | ⬜ pending |
| 01-02-02 | 02 | 2 | UX-01 | — | Responsive Ant Design layout, Sider/Drawer breakpoint | component | `npx vitest run tests/shell.test.tsx` | ❌ W0 | ⬜ pending |
| 01-02-03 | 02 | 2 | UX-01, DATA-02 | T-01-05 | Whitelist-sanitized hash routing & reactive Dexie query | component | `npx vitest run tests/shell.test.tsx` | ❌ W0 | ⬜ pending |
| 01-03-01 | 03 | 3 | PWA-04 | — | Static dist build with /task-management/ subpath base | build check | `npm run build` | ❌ W0 | ⬜ pending |
| 01-03-02 | 03 | 3 | PWA-05 | T-01-06, T-01-07 | Least-privilege GitHub Actions workflow for Pages | CI config | `node -e "const fs = require('fs'); const content = fs.readFileSync('.github/workflows/deploy.yml', 'utf8'); if (!content.includes('actions/deploy-pages')) process.exit(1);"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/setup.ts` — fake-indexeddb and DOM testing setup
- [ ] `tests/uuid.test.ts` — validates UUID generator behavior (DATA-01)
- [ ] `tests/schema.test.ts` — validates date string YYYY-MM-DD and integer minutes schema constraints (DATA-03)
- [ ] `tests/db.test.ts` — validates Dexie store creation, default capacity rules seed, and CRUD (DATA-02)
- [ ] `tests/migrations.test.ts` — validates multi-tab blocked/versionchange event dispatch (DATA-04)
- [ ] `tests/shell.test.tsx` — validates Ant Design shell rendering, drawer switching, and hash navigation (UX-01)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Responsive drawer toggle | UX-01 | Visual touch interaction on mobile viewport (<768px) | Resize browser window to <768px, click hamburger icon in header, verify drawer slides open and closes on backdrop click |
| Multi-tab upgrade blocking modal | DATA-04 | Requires two real browser tabs concurrently accessing different schema versions | Open Tab A, bump DB version in Tab B, verify Tab B displays blocking upgrade modal |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-09-26
