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
| 35-01-* | 01 | 1 | AIO-REMOVE-01 | T-35-01..04 | safeParse on every patch call | unit | `npx vitest run tests/services/ai/patchProposal.test.ts` | ❌ W0 | ⬜ pending |
| 35-02-* | 02 | 1 | AIO-REMOVE-01 | — | N/A | static | `grep -n "services/ai/conventionsSegment" src/components/ai/AIChatDrawer.tsx` → 1 hit | ❌ W0 | ⬜ pending |
| 35-02-* | 02 | 1 | AIO-REMOVE-01 | — | N/A | static | `grep -n "components/common/DiffSyntaxHighlighter" src/workbench/editor/RemoteFileViewer.tsx` → 1 hit | ❌ W0 | ⬜ pending |
| 35-03-* | 03 | 2 | AIO-REMOVE-01 | T-35-07..08 | approval card never writes | component | `npx vitest run tests/ai/PatchDiffApprovalCard.test.tsx` | ❌ W0 | ⬜ pending |
| 35-04-* | 04 | 3 | AIO-REMOVE-01/02 | T-35-09..12 | mutation gate intact | unit | `npx vitest run tests/ai/aiTools.test.ts tests/ai/chatTurnRuntime.test.ts tests/ai/chatTurnTools.test.ts` | ✅ | ⬜ pending |
| 35-05-* | 05 | 4 | AIO-REMOVE-02/03 | T-35-13..14 | structural gate preserved | structural | `npx vitest run tests/phase25_1SafetyGates.test.ts` | ✅ rewritten | ⬜ pending |
| 35-06-* | 06 | 5 | AIO-REMOVE-02/03 | T-35-15..17 | no dependency dropped; `escapeShellArg` survives | static | `ls src/components/sdlc src/components/ai/wizard src/services/wizard src/services/sdlc src/services/export 2>&1 \| grep -c "No such file"` → 5 | ✅ | ⬜ pending |
| 35-07-* | 07 | 5 | AIO-REMOVE-02/04 | T-35-18..20 | persisted blob filtered on write and hydration | unit | `npx vitest run src/workbench/__tests__/layoutStore.test.ts` — `sdlc` tab dropped, `activeTabId` re-points | ❌ W0 | ⬜ pending |
| 35-07-* | 07 | 5 | AIO-REMOVE-02 | — | N/A | static | `grep -rn "viewType: 'sdlc'\|onOpenView?.('sdlc')\|open-sdlc\|titlebar-btn-sdlc\|onOpenSdlcStudio" src` → 0 hits | ✅ | ⬜ pending |
| 35-08-* | 08 | 5 | AIO-REMOVE-02/03 | T-35-31..33, T-35-37 | interrupted notice + allowlist still observed | component | `npx vitest run src/components/ai/__tests__/InterruptedBanner.test.tsx tests/ai/artifactToolAccess.test.ts` | ❌ W0 | ⬜ pending |
| 35-08-* | 08 | 5 | AIO-REMOVE-03 | — | N/A | integration | `npx vitest run src/components/ai/__tests__/ChatTabBar.test.tsx tests/ai/AiChatWidget.test.tsx tests/ai/useChatTurn.test.tsx` | ✅ trimmed | ⬜ pending |
| 35-09-* | 09 | 5 | AIO-REMOVE-03/05 | T-35-21..23 | strict `DocumentSetSchema` stays consistent | unit | `npx vitest run tests/knowledge src/validation` | ✅ | ⬜ pending |
| 35-10-* | 10 | 5 | AIO-REMOVE-05 | T-35-24..27 | `z.enum(['chat'])` rejects, never coerces | unit | `npx vitest run tests/services/backup/validateBackup.test.ts` — `chatTabs[0].type='sdlc'` → `valid === false` | ❌ W0 | ⬜ pending |
| 35-10-* | 10 | 5 | AIO-REMOVE-05 | — | N/A | integration | `npx vitest run tests/backup/tabCheckpointBackup.test.ts` — legacy `cr:<id>:sdlc` thread, no `chatTabs` → 1 ordinary tab, 0 `sdlc` | ❌ W0 | ⬜ pending |
| 35-11-* | 11 | 6 | AIO-REMOVE-05 | T-35-28..30 | malformed rows cannot throw mid-upgrade | unit | `npx vitest run tests/db/sdlcPurgeMigration.test.ts` — seed SDLC rows, reopen → gone, ordinary rows intact | ❌ W0 | ⬜ pending |
| 35-12-* | 12 | 7 | AIO-REMOVE-02..05 | T-35-34..36 | no escape hatches; residual set exact | gate | `npx tsc --noEmit && npm run build` + Gates A-G | ✅ | ⬜ pending |

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
- [ ] `tests/backup/tabCheckpointBackup.test.ts` — rewrite the whole file (all 7 `it` blocks build `makeTab()` with `type:'sdlc'`)
- [ ] `src/components/ai/__tests__/InterruptedBanner.test.tsx` (new — replaces the deleted `tests/ai/AIChatDrawerCheckpoint.test.tsx`)
- [ ] `tests/ai/artifactToolAccess.test.ts` (recreated — replaces the deleted SDLC-flavoured version)
- [ ] Framework install: none — Vitest, jsdom, fake-indexeddb, Testing Library all present

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Launch with a real persisted `_v2` layout blob containing an `sdlc` tab | AIO-REMOVE-04 | Zustand `partialize` runs on *write*, not hydration — a unit test can prove the filter but not the real localStorage upgrade path | 1. In devtools set `localStorage['taskmate_workbench_layout_v2']` to a blob with an `sdlc` tab as `activeTabId`. 2. Reload. 3. Expect no `sdlc` tab, `activeTabId` on a valid tab, no Tasks render. |

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
