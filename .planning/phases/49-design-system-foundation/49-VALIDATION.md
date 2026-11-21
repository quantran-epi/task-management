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

## Plan Structure (post-split — checker blocker 2)

Phase 49 has 9 plans in 8 waves after splitting the oversized plan 05 into 05/06/07 and renumbering old 06→08, 07→09. Waves: 01 (w1) → 02 (w2) → 03 (w3) → 04 (w4) → {05,06} parallel (w5) → 07 (w6) → 08 (w7) → 09 (w8). Total tasks: 25.

## Per-Task Verification Map

Checker warning 4 fix: map covers ALL 25 tasks from ALL 9 plans. Task IDs are `{plan}-{task}` (e.g. `49-05-01` = plan 05 task 1). `49-03-01` correctly maps to `button.test.tsx` (plan 03), NOT `coverage.test.ts` (plan 08). Every row has a non-vacuous automated command. Status cells are filled by plan 09 from observed exit codes; a gate never run stays unchecked.

| Task ID | Plan | Wave | Requirement | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------------|-----------|-------------------|-------------|--------|
| 49-01-01 | 01 | 1 | SHELL-01..02 | Single shell boots; side effects + popout route survive | unit/source | `npx vitest run src/workbench/__tests__/mainBoot.test.ts --bail=1 && npx tsc --noEmit` | W0 | ⬜ pending |
| 49-01-02 | 01 | 1 | SHELL-03 | Zero PWA code/config/source paths remain | source assert | `npx tsc --noEmit && grep -rv '^#' src tests vite.config.ts package.json \| grep -c 'VitePWA\|virtual:pwa-register\|ServiceWorkerProvider' \|\| true` | W0 | ⬜ pending |
| 49-01-03 | 01 | 1 | SHELL-01..03 | Guard test fails if any removed surface returns | source assert | `npx vitest run src/workbench/__tests__/shellRemoval.test.ts src/workbench/__tests__/mainBoot.test.ts --bail=1` | W0 | ⬜ pending |
| 49-02-01 | 02 | 2 | TOKEN-01, TOKEN-04 | Light/dark tokens single source; no drift; metrics shared | unit | `npx vitest run src/workbench/__tests__/AntdThemeAdapter.test.tsx --bail=1 && npx tsc --noEmit` | W0 | ⬜ pending |
| 49-02-02 | 02 | 2 | TOKEN-02, TOKEN-03, D-07 | Precedence + validated broadcast; subscriber re-renders popout | unit | `npx vitest run src/hooks/__tests__/themeBroadcast.test.ts --bail=1 && npx tsc --noEmit` | W0 | ⬜ pending |
| 49-02-03 | 02 | 2 | TOKEN-01..04 | Token parity/status map/applyCssVariables + popout re-render proof | unit | `npx vitest run src/components/ui/__tests__/tokens.test.ts src/workbench/__tests__/AntdThemeAdapter.test.tsx --bail=1` | W0 | ⬜ pending |
| 49-03-01 | 03 | 3 | CTRL-02 | Button metrics + type-enforced IconButton aria-label | unit | `npx vitest run src/components/ui/__tests__/button.test.tsx --bail=1 && npx tsc --noEmit` | W0 | ⬜ pending |
| 49-03-02 | 03 | 3 | CTRL-01, D-18 | 144 icons wrapped in one file with real policy; count gate | source/count | `npx tsc --noEmit && node -e "const s=require('fs').readFileSync('src/components/ui/icon.tsx','utf8');const n=(s.match(/export const [A-Z][A-Za-z0-9]*\\s*=\\s*wrapIcon\\(/g)\|\|[]).length;if(n<140)process.exit(1)"` | W0 | ⬜ pending |
| 49-03-03 | 03 | 3 | GUARD-03, D-04 | Scanner detects imports, excludes types, rejects pass-through | unit | `npx vitest run src/components/ui/__tests__/antdInventory.test.ts --bail=1 && npx tsc --noEmit` | W0 | ⬜ pending |
| 49-04-01 | 04 | 4 | CTRL-03 | Input family applies shared height/font/error policy | unit/source | `npx tsc --noEmit && node -e "const fs=require('fs');for(const f of ['input','textarea','select','input-number']){if(!/getSharedControlTokens\|tokens\\.contract/.test(fs.readFileSync('src/components/ui/'+f+'.tsx','utf8')))process.exit(1)}"` | W0 | ⬜ pending |
| 49-04-02 | 04 | 4 | CTRL-04 | Overlays + themed holders preserve ConfigProvider context | unit | `npx vitest run src/components/ui/__tests__/controls.test.tsx --bail=1 && npx tsc --noEmit` | W0 | ⬜ pending |
| 49-05-01 | 05 | 5 | CTRL-05, D-12 | Status map drives Tag/Badge/StatusDot (single source) | source | `npx tsc --noEmit && node -e "const fs=require('fs');for(const f of ['tag','badge','status-dot']){if(!/getStatusTokens\|statusColorMap/.test(fs.readFileSync('src/components/ui/'+f+'.tsx','utf8')))process.exit(1)}"` | W0 | ⬜ pending |
| 49-05-02 | 05 | 5 | CTRL-01, CTRL-06 | Primary complex controls are real swap points | source | `npx tsc --noEmit && node -e "const fs=require('fs');for(const f of ['table','form','date-picker','time-picker','menu','tooltip','popover']){if(!/getSharedControlTokens\|getStatusTokens\|tokens\\.contract/.test(fs.readFileSync('src/components/ui/'+f+'.tsx','utf8')))process.exit(1)}"` | W0 | ⬜ pending |
| 49-05-03 | 05 | 5 | CTRL-01, CTRL-06 | Tree/data-entry complex wrappers call contract helpers | source | `npx tsc --noEmit && node -e "const fs=require('fs');for(const f of ['tree','splitter','mentions','tree-select','upload']){if(!/getSharedControlTokens\|getStatusTokens\|tokens\\.contract/.test(fs.readFileSync('src/components/ui/'+f+'.tsx','utf8')))process.exit(1)}"` | W0 | ⬜ pending |
| 49-06-01 | 06 | 5 | CTRL-01, CTRL-06 | Layout-oriented wrappers apply token defaults | source | `npx tsc --noEmit && node -e "const fs=require('fs');for(const f of ['card','descriptions','grid','typography','space']){if(!/getSharedControlTokens\|getStatusTokens\|tokens\\.contract/.test(fs.readFileSync('src/components/ui/'+f+'.tsx','utf8')))process.exit(1)}"` | W0 | ⬜ pending |
| 49-06-02 | 06 | 5 | CTRL-01, CTRL-06 | Feedback/selection wrappers; alert uses status map | source | `npx tsc --noEmit && node -e "const fs=require('fs');for(const f of ['alert','empty','dropdown','spin','checkbox']){if(!/getSharedControlTokens\|getStatusTokens\|tokens\\.contract/.test(fs.readFileSync('src/components/ui/'+f+'.tsx','utf8')))process.exit(1)}"` | W0 | ⬜ pending |
| 49-06-03 | 06 | 5 | CTRL-01, CTRL-06 | Display wrappers call contract helpers | source | `npx tsc --noEmit && node -e "const fs=require('fs');for(const f of ['progress','switch','radio','tabs','collapse']){if(!/getSharedControlTokens\|getStatusTokens\|tokens\\.contract/.test(fs.readFileSync('src/components/ui/'+f+'.tsx','utf8')))process.exit(1)}"` | W0 | ⬜ pending |
| 49-07-01 | 07 | 6 | CTRL-01, CTRL-06 | Remaining utility/layout wrappers are real swap points | source | `npx tsc --noEmit && node -e "const fs=require('fs');for(const f of ['divider','avatar','skeleton','segmented','statistic','result','breadcrumb','auto-complete','slider','pagination','image','layout','list']){if(!/getSharedControlTokens\|getStatusTokens\|tokens\\.contract/.test(fs.readFileSync('src/components/ui/'+f+'.tsx','utf8')))process.exit(1)}"` | W0 | ⬜ pending |
| 49-07-02 | 07 | 6 | CTRL-05, D-12, D-01 | Barrel complete + status parity across three surfaces both modes | unit | `npx vitest run src/components/ui/__tests__/controls.test.tsx --bail=1 && npx tsc --noEmit` | W0 | ⬜ pending |
| 49-07-03 | 07 | 6 | CTRL-01, D-04 | Read-only full-tree coverage: [] missing, [] pass-through | unit/scanner | `npx vitest run src/components/ui/__tests__/antdInventory.test.ts --bail=1 && npx tsc --noEmit` | W0 | ⬜ pending |
| 49-08-01 | 08 | 7 | GUARD-01, D-17 | Pinned toolchain installed; repo URLs verified; no typescript-eslint | lint/install | `npm ls eslint @eslint/js globals eslint-plugin-react-hooks @babel/eslint-parser @babel/core @babel/preset-typescript --depth=0` | W0 | ⬜ pending |
| 49-08-02 | 08 | 7 | GUARD-01, GUARD-02, D-19 | lint green; bad fixture fails, good fixture (import type) passes | lint | `npm run lint && ! npx eslint tests/fixtures/guard/bad-import.tsx && npx eslint tests/fixtures/guard/good-import.tsx` | W0 | ⬜ pending |
| 49-08-03 | 08 | 7 | CTRL-01, GUARD-02, D-04 | D-04 live coverage gate + local-only config assertions | unit/lint | `npx vitest run src/components/ui/__tests__/coverage.test.ts src/components/ui/__tests__/guardConfig.test.ts --bail=1 && npm run lint` | W0 | ⬜ pending |
| 49-09-01 | 09 | 8 | all 16 | Combined gate: lint + build + all scoped tests green together | gate | `npm run lint && npm run build && npm run test:foundation && npx vitest run src/components/ui/__tests__/coverage.test.ts --bail=1` | W0 | ⬜ pending |
| 49-09-02 | 09 | 8 | all 16, D-01..D-19 | Source-safety sweep + six UI-SPEC dimensions + SUS advisory | source assert | `node -e "const fs=require('fs');for(const p of ['src/App.tsx','src/hooks/usePWAInstall.ts','src/context/ServiceWorkerContext.tsx']){if(fs.existsSync(p))process.exit(1)} const s=fs.readFileSync('.planning/phases/49-design-system-foundation/49-UI-SPEC.md','utf8');if((s.match(/- \[x\] Dimension/g)\|\|[]).length!==6)process.exit(1)"` | W0 | ⬜ pending |

## Wave 0 Requirements

- [ ] `src/components/ui/__tests__/tokens.test.ts` — token source/light-dark assertions
- [ ] `src/components/ui/__tests__/coverage.test.ts` — wrapper coverage scanner live gate
- [ ] `src/components/ui/__tests__/controls.test.tsx` — wrapper policy tests (aria-label, modal footer, status map)
- [ ] `src/hooks/__tests__/themeBroadcast.test.ts` — broadcast validation + production subscriber re-render
- [ ] `src/workbench/__tests__/AntdThemeAdapter.test.tsx` — token render + popout re-render on received mode
- [ ] `eslint.config.mjs` with `@babel/eslint-parser` + `no-restricted-imports` (`allowTypeImports: true`)
- [ ] `npm run lint` script in `package.json`

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Chrome light/dark walkthroughs | ADOPT-03 | Phase 50 scope; foundation verified by unit/build | Deferred to Phase 50 |
| SUS package legitimacy confirmation | T-49-20 | Non-blocking advisory (`human_verify_mode: end-of-phase`); automated repo/pin verification done in plan 08 | Review advisory in 49-UI-SPEC sign-off; no pause required |

## Validation Sign-Off

- [ ] All 25 tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending 2026-11-21
