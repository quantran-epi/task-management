---
phase: "47"
slug: "ssh-remote-explorer-ai-code-understanding"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-19"
---

# Phase 47 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Focused tests only — project rule forbids the full Vitest suite.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.2 + jsdom / Testing Library where needed |
| **Config file** | `vite.config.ts` |
| **Quick run command** | `npx vitest run <focused-file...>` |
| **Full suite command** | Not used — focused files only |
| **Estimated runtime** | < 2 minutes per focused batch |

---

## Sampling Rate

- **After every task commit:** Run the focused file(s) mapped to that task plus `npx tsc --noEmit -p tsconfig.json` when types/schema change.
- **After every plan wave:** Run all focused files touched in that wave.
- **Before `/gsd-verify-work`:** All focused files green plus typecheck; full suite explicitly not run.
- **Max feedback latency:** 2 minutes.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 47-01-01 | 01 | 1 | D-06 | — | `remote:<uuid>` survives scope key, thread parsing, backup schema, restore | unit | `npx vitest run tests/ai/chatRepo.test.ts tests/validation/backupSchemas.test.ts` | ✅ | ⬜ pending |
| 47-01-02 | 01 | 1 | D-11 | — | Remote selection anchor carries target/path/line/text, never fake doc entity | unit | `npx vitest run src/utils/selectionContext.test.ts tests/ai/remoteScope.test.ts` | ❌ W0 | ⬜ pending |
| 47-02-01 | 02 | 2 | D-02/D-03/D-04 | T-47-01 | Search results are `path:line:text`, bounded, click opens `remote:` tab at line | component | `npx vitest run src/workbench/__tests__/RemoteGitExplorer.test.tsx` | ✅ | ⬜ pending |
| 47-02-02 | 02 | 2 | D-04/D-12 | — | Viewer accepts one-shot `initialLine`, highlight/scroll works, reopen clears line | component | `npx vitest run src/workbench/__tests__/RemoteFileViewer.test.tsx` | ✅ | ⬜ pending |
| 47-03-01 | 03 | 3 | D-13/D-14 | T-47-02 | SSH tools and `git_read` accept explicit remote target; no global fallback; read-only and confined | unit | `npx vitest run tests/ai/chatTurnTools.test.ts tests/services/__tests__/gitRemoteReadPipeline.test.ts` | ✅ | ⬜ pending |
| 47-03-02 | 03 | 3 | D-05/D-08 | — | Remote scope reuses drawer tabs/threads; manual scope choice still wins | unit/component | `npx vitest run tests/ai/AIChatDrawerIsolation.test.tsx tests/ai/chatRepo.test.ts` | ✅ | ⬜ pending |
| 47-04-01 | 04 | 4 | D-09/D-10/D-11 | T-47-03 | Remote selection activates inline toolbar, popover answer and Open in Chat carry structured anchor | component | `npx vitest run src/workbench/__tests__/RemoteFileViewer.test.tsx tests/ai/AIChatDrawerToolbox.test.tsx` | ✅ | ⬜ pending |
| 47-04-02 | 04 | 4 | D-12 | — | Remote citation chip opens file tab at `path:line` | component | `npx vitest run tests/ai/AIChatDrawerToolbox.test.tsx src/workbench/__tests__/RemoteFileViewer.test.tsx` | ✅ | ⬜ pending |
| 47-05-01 | 05 | 5 | ALL | T-47-01..03 | Combined focused tests + typecheck green; no shared planning files modified | unit/shell | `npx tsc --noEmit -p tsconfig.json && npx vitest run <all focused files listed in plan>` | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/ai/remoteScope.test.ts` — new: UUID scope key, whitelists, backup round-trip, activation precedence.
- [ ] Extend `src/workbench/__tests__/RemoteFileViewer.test.tsx` — initial line highlight + structured selection anchor.
- [ ] Extend `src/workbench/__tests__/RemoteGitExplorer.test.tsx` — name/content search modes and result-click tab params.
- [ ] Extend `tests/ai/chatTurnTools.test.ts` / `tests/services/__tests__/gitRemoteReadPipeline.test.ts` — explicit-target dispatch.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live SSH repo search + inline AI on a real remote file | D-02..D-14 | Requires configured SSH host and Tauri runtime | Open remote explorer, search by name and content, click result, select code, run Explain/Ask, Open in Chat, ask a cross-file question, click a `path:line` citation. Verify target never changes to another host and no write occurs. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 2 minutes
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
