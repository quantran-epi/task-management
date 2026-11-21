---
phase: 49
slug: design-system-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-11-21
---

# Phase 49 — Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.2 + jsdom + @testing-library/react 16.3.3; ESLint 10 flat config with Babel parser |
| **Config file** | `vite.config.ts` (`test` block, setupFiles `./tests/setup.ts`); `eslint.config.mjs` (new) |
| **Quick run command** | `npx vitest run <scoped-paths> --bail=1` |
| **Full suite command** | `npm run lint && npm run build` (NOT full Vitest suite — project rule) |
| **Estimated runtime** | ~30-90s scoped |

## Sampling Rate

- **After every task commit:** `npx vitest run <scoped paths> --bail=1` + `npm run lint`
- **After every plan wave:** `npm run lint && npm run build`
- **Before `/gsd-verify-work`:** lint + build + all scoped tests green
- **Max feedback latency:** ~90s

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------------|-----------|-------------------|-------------|--------|
| 49-01-01 | 01 | 1 | SHELL-01..02 | No shell flag or PWA prompts remain | source assert | `npx vitest run src/workbench/__tests__/shellRemoval.test.ts --bail=1` | ❌ W0 | ⬜ pending |
| 49-02-01 | 02 | 2 | TOKEN-01..04 | Light/dark tokens single source, instant switch | unit | `npx vitest run src/components/ui/__tests__/tokens.test.ts --bail=1` | ❌ W0 | ⬜ pending |
| 49-03-01 | 03 | 3 | CTRL-01..06 | Every used AntD component has a wrapper | unit/source | `npx vitest run src/components/ui/__tests__/coverage.test.ts --bail=1` | ❌ W0 | ⬜ pending |
| 49-04-01 | 04 | 4 | GUARD-01..03 | ESLint blocks direct imports; wrappers behave | lint + unit | `npm run lint && npx vitest run src/components/ui/__tests__/controls.test.tsx --bail=1` | ❌ W0 | ⬜ pending |

## Wave 0 Requirements

- [ ] `src/components/ui/__tests__/tokens.test.ts` — token source/light-dark assertions
- [ ] `src/components/ui/__tests__/coverage.test.ts` — wrapper coverage scanner
- [ ] `src/components/ui/__tests__/controls.test.tsx` — wrapper policy tests (aria-label, modal footer, status map)
- [ ] `eslint.config.mjs` with `@babel/eslint-parser` + `no-restricted-imports`
- [ ] `npm run lint` script in `package.json`

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Chrome light/dark walkthroughs | ADOPT-03 | Phase 50 scope; foundation verified by unit/build | Deferred to Phase 50 |

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending 2026-11-21
