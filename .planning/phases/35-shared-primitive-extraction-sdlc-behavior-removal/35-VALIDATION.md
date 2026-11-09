---
phase: 35
slug: shared-primitive-extraction-sdlc-behavior-removal
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-11-09
---

# Phase 35 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.2 (jsdom, `globals: true`) |
| **Config file** | `vite.config.ts` — `test:` block |
| **Quick run command** | `npx vitest run <touched paths>` |
| **Full suite command** | **Never `npm test`** — project memory: >1 hour. Use `npx vitest run src tests/services tests/ai tests/backup tests/workbench src/workbench` |
| **Typecheck** | `npx tsc --noEmit` |
| **Estimated runtime** | ~30–90s scoped; ~5–10 min wave-scoped |

**No lint gate exists.** CLAUDE.md names ESLint 10.11.0 but it is not installed and `package.json` has no `lint` script. Do not plan one.

---

## Sampling Rate

- **After every task commit:** `npx tsc --noEmit` + `npx vitest run <files that task touched>`
- **After every plan wave:** `npx vitest run src tests/services tests/ai tests/backup tests/workbench src/workbench`
- **Before `/gsd-verify-work`:** `npx tsc --noEmit` clean + the §11 grep equal to the enumerated residual list + scoped suites green
- **Max feedback latency:** 90 seconds per task

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 35-01-* | 01 | 1 | AIO-REMOVE-01 | — | N/A | unit | `npx vitest run tests/services/ai/patchProposal.test.ts` | ❌ W0 | ⬜ pending |
| 35-01-* | 01 | 1 | AIO-REMOVE-01 | — | N/A | static | `grep -n "services/ai/conventionsSegment" src/components/ai/AIChatDrawer.tsx` → 1 hit | ❌ W0 | ⬜ pending |
| 35-01-* | 01 | 1 | AIO-REMOVE-01 | — | N/A | static | `grep -n "components/common/DiffSyntaxHighlighter" src/workbench/editor/RemoteFileViewer.tsx` → 1 hit | ❌ W0 | ⬜ pending |
| 35-01-* | 01 | 1 | AIO-REMOVE-01 | — | N/A | component | `npx vitest run tests/ai/PatchDiffApprovalCard.test.tsx` | ❌ W0 | ⬜ pending |
| 35-02-* | 02 | 2 | AIO-REMOVE-02 | — | N/A | static | `grep -rn "viewType: 'sdlc'\|onOpenView?.('sdlc')\|open-sdlc\|titlebar-btn-sdlc" src` → 0 hits | ✅ | ⬜ pending |
| 35-02-* | 02 | 2 | AIO-REMOVE-02 | — | N/A | static | `ls src/components/sdlc src/components/ai/wizard src/services/wizard src/services/sdlc src/services/export src/views/ChangeRequestSdlcView.tsx 2>&1 \| grep -c "No such file"` → 6 | ✅ | ⬜ pending |
| 35-02-* | 02 | 2 | AIO-REMOVE-02 | — | No stubs / no `as any` | static | `git diff --name-only \| xargs grep -n "as any\|@ts-expect-error\|TODO: replace"` → 0 new hits | ✅ | ⬜ pending |
| 35-03-* | 03 | 3 | AIO-REMOVE-03 | — | N/A | integration | `npx vitest run tests/ai/AiChatWidget.test.tsx tests/ai/AIChatDrawerTabs.test.tsx tests/ai/chatTurnRuntime.test.ts tests/ai/chatTurnTools.test.ts` | ✅ trimmed | ⬜ pending |
| 35-03-* | 03 | 3 | AIO-REMOVE-03 | — | N/A | unit | `npx vitest run tests/knowledge src/validation` | ✅ | ⬜ pending |
| 35-03-* | 03 | 3 | AIO-REMOVE-03 | — | N/A | integration | `npx vitest run tests/services/backup tests/backup` | ✅ trimmed | ⬜ pending |
| 35-04-* | 04 | 4 | AIO-REMOVE-04 | — | N/A | unit | `npx vitest run src/workbench/__tests__/layoutStore.test.ts` — hydrate `[{id:'sdlc-x',viewType:'sdlc'},{id:'tasks',viewType:'tasks'}]`, `activeTabId:'sdlc-x'` → 1 tab, `activeTabId==='tasks'` | ❌ W0 | ⬜ pending |
| 35-04-* | 04 | 4 | AIO-REMOVE-04 | — | N/A | component | `npx vitest run src/workbench/__tests__/EditorArea.test.tsx` | ✅ | ⬜ pending |
| 35-05-* | 05 | 5 | AIO-REMOVE-05 | — | N/A | integration | `npx vitest run tests/backup/tabCheckpointBackup.test.ts` — legacy `cr:<id>:sdlc` thread, no `chatTabs` → 1 ordinary tab, 0 `type:'sdlc'` | ❌ W0 | ⬜ pending |
| 35-05-* | 05 | 5 | AIO-REMOVE-05 | — | N/A | unit | `npx vitest run tests/services/backup/validateBackup.test.ts` — `chatTabs[0].type='sdlc'` → `valid === false` | ❌ W0 | ⬜ pending |
| 35-05-* | 05 | 5 | AIO-REMOVE-05 | — | N/A | static | `grep -n "sdlcByScope\|Duplicate SDLC tab\|wizard.changeRequestId\|sdlcArtifact" src/services/backup/validateBackup.ts` → 0 hits | ✅ | ⬜ pending |
| 35-05-* | 05 | 5 | AIO-REMOVE-05 | — | N/A | unit | `npx vitest run tests/db/sdlcPurgeMigration.test.ts` — seed SDLC rows, reopen → gone, ordinary rows intact | ❌ W0 | ⬜ pending |
| 35-05-* | 05 | 5 | — | — | N/A | structural | `npx vitest run tests/phase25_1SafetyGates.test.ts` | ✅ rewritten | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/services/ai/patchProposal.ts` + `tests/services/ai/patchProposal.test.ts` (rewritten from `sdlcArtifactTools.test.ts`)
- [ ] `src/services/ai/conventionsSegment.ts` + renamed `tests/ai/conventionsSegment.test.ts`
- [ ] `src/components/common/DiffSyntaxHighlighter.tsx`
- [ ] `src/components/ai/widget/PatchDiffApprovalCard.tsx` + `tests/ai/PatchDiffApprovalCard.test.tsx`
- [ ] `tests/db/sdlcPurgeMigration.test.ts` (new `tests/db/` directory — `tests/db.test.ts` is a file, confirm no name clash)
- [ ] `src/workbench/__tests__/layoutStore.test.ts` — new persisted-`sdlc`-tab case
- [ ] `tests/services/backup/validateBackup.test.ts` — new `sdlc`-tab-rejected case
- [ ] `tests/backup/tabCheckpointBackup.test.ts` — rewrite the legacy-tab case
- [ ] Framework install: none — Vitest, jsdom, fake-indexeddb, Testing Library all present

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Launch with a real persisted `_v2` layout blob containing an `sdlc` tab | AIO-REMOVE-04 | Zustand `partialize` runs on *write*, not hydration — a unit test can prove the filter but not the real localStorage upgrade path | 1. In devtools set `localStorage['taskmate:layout:v2']` to a blob with an `sdlc` tab as `activeTabId`. 2. Reload. 3. Expect no `sdlc` tab, `activeTabId` on a valid tab, no Tasks render. |

*All other phase behaviors have automated verification.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
