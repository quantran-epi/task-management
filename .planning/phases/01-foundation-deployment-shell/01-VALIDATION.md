---
phase: 1
slug: foundation-deployment-shell
status: draft
nyquist_compliant: false
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
| 01-01-01 | 01 | 1 | DATA-01 | — | N/A | unit | `npx vitest run tests/uuid.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 1 | DATA-02 | T-01-01 | React DOM automatic string escaping; schema validation | integration | `npx vitest run tests/db.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-03 | 01 | 1 | DATA-03 | — | Canonical dates stored as YYYY-MM-DD string, minutes as integer | unit | `npx vitest run tests/schema.test.ts` | ❌ W0 | ⬜ pending |
| 01-02-01 | 02 | 1 | DATA-04 | T-01-02 | Graceful multi-tab versionchange and blocked handling | integration | `npx vitest run tests/migrations.test.ts` | ❌ W0 | ⬜ pending |
| 01-02-02 | 02 | 1 | UX-01 | — | Responsive Ant Design layout and hash navigation | component | `npx vitest run tests/shell.test.tsx` | ❌ W0 | ⬜ pending |
| 01-03-01 | 03 | 2 | PWA-04 | — | Static dist build with /task-management/ subpath base | build check | `npm run build` | ❌ W0 | ⬜ pending |
| 01-03-02 | 03 | 2 | PWA-05 | — | GitHub Actions deployment config valid | CI config | `test -f .github/workflows/deploy.yml` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/setup.ts` — fake-indexeddb and DOM testing setup
- [ ] `tests/uuid.test.ts` — validates UUID generator behavior (DATA-01)
- [ ] `tests/db.test.ts` — validates Dexie store creation, default capacity rules seed, and CRUD (DATA-02)
- [ ] `tests/schema.test.ts` — validates date string YYYY-MM-DD and integer minutes schema constraints (DATA-03)
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

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending 2026-09-26
