# Phase 35 — Checkpoint (plan-phase paused mid-verification)

**Date:** 2026-11-10
**Branch:** `feature/intellij-workbench`
**State:** Planning complete, plan-checker iteration 2/3 returned 8 blockers. Not yet executed.

---

## Resume here

```
/gsd-plan-phase 35
```

The workflow will detect the 12 existing plans and offer: 1) Add more plans, 2) View existing, 3) Replan from scratch. Choose **1 (Add more plans)** and instruct the planner to apply the round-2 checker fixes below. Do not replan from scratch — the wave structure is correct.

---

## What exists

| Artifact | State |
|---|---|
| `35-CONTEXT.md` | Locked. D-01..D-12 keep/delete inventory. |
| `35-RESEARCH.md` | Complete. §4 import map, §8 deletion order (rewritten), Open Questions all `(RESOLVED)`. |
| `35-PATTERNS.md` | Complete. 8 analogs mapped. |
| `35-VALIDATION.md` | Complete. Per-task map renumbered to match plans. |
| `35-01..12-PLAN.md` | 12 plans, 7 waves. Structure verified good; 8 task-level defects remain. |
| `ROADMAP.md` | Phase 35 criteria 1–2 corrected; Phase 36 Dexie V18 → V19; plan list updated. |
| `REQUIREMENTS.md` | AIO-REMOVE-01/02/03 restated under C-16. |

## Wave structure (verified correct — do not change)

| Wave | Plans |
|---|---|
| 1 | 01 patchProposal, 02 conventionsSegment + DiffSyntaxHighlighter |
| 2 | 03 PatchDiffApprovalCard |
| 3 | 04 tool rescope |
| 4 | 05 test deletions + safety-gate rewrite |
| 5 | 06 delete-set, 07 view+layout, 08 chat-UI, 09 domain types, 10 backup — **atomic cut, zero file overlap** |
| 6 | 11 Dexie V18 purge |
| 7 | 12 acceptance sweep |

Wave 5 is atomic because delete-set files read fields that plan 09 removes, and `backupSchemas.ts:9-13` imports the modules plan 06 deletes. Neither direction can precede the other.

---

## Decisions locked this session

1. **Dexie V18 belongs to Phase 35** (SDLC purge). Phase 36's `aiSkillVersions` becomes V19.
2. **Delete** `ChatMessage.artifactEvent`, `ChatArtifactEvent`, `ArtifactEventCard.tsx`.
3. **Trim, keep** `InterruptedBanner` — `AIChatDrawer.tsx:2580` uses it for the non-SDLC `interrupted` runtime path.
4. **Delete** `RestoredSourceNotice` / `deriveMissingSources` / `BackupRecoveryInfo`.
5. **Delete** all of `src/services/export/**` (7 files); keep the `docx` npm dependency (`src/utils/dynamicFileSandbox.ts:10`).
6. **Delete** 4 orphans CONTEXT.md missed: `researchService.ts`, `wizardService.ts`, `wizardPrompts.ts`, `sdlcSolutionParser.ts`.
7. **Sixth launch point**: `ChangeRequestTable.tsx:47,99,144-149,412-420`.
8. **Delete** `SafeMarkdown` with `components/sdlc/**`.
9. `DiffSyntaxHighlighter.tsx` moves; export name stays `DiffLineCodeRenderer`.
10. AIO-REMOVE-04 = key bump `_v3` **and** `partialize` filter **and** `merge` hydration guard.

---

## Round-2 blockers still open (8)

| # | Plan/Task | Defect | Fix |
|---|---|---|---|
| 1 | 02 T1 | Renames `sdlcConventionsExemplar.test.ts` but the file uses `composeSdlcTurn` (9 call sites) + `SHARED_EVIDENCE_POLICY`, neither exported by `conventionsSegment.ts` → `tsc` + vitest fail at wave-1 boundary | Rewrite the test to exercise `buildConventionsSegment` only |
| 2 | 02 T2 | Moves `DiffSyntaxHighlighter` but `src/components/sdlc/diff/RemoteDiffViewer.tsx:6` still imports `./DiffSyntaxHighlighter` (not deleted until plan 06) → `tsc` fails at wave 1 | Re-point `RemoteDiffViewer.tsx:6` to `../../../components/common/DiffSyntaxHighlighter` |
| 3 | 10 T2 | Action adds `if (thread.scopeKey.endsWith(':sdlc')) continue;` but acceptance demands `grep -c "sdlc..." restoreBackup.ts` = 0 | Express the skip without an `sdlc` literal, or add the file to the Gate C residual list |
| 4 | 12 Gate C | Gate is `grep -rn "sdlc\|Sdlc" src \| grep -v "^src/db/index.ts:"` → 0, but plan 07 T3 **mandates** `new Set<string>(['sdlc'])` in `src/workbench/store/layoutStore.ts` | Add `layoutStore.ts` (and `restoreBackup.ts` if #3 keeps a literal) to the residual list |
| 5 | 12 Gate F | `git diff master --name-only -- src \| xargs -r grep "as any\|@ts-expect-error"` returns 85 pre-existing hits against `master` — can never be 0 | Diff against the phase-base commit and grep only added lines |
| 6 | 11 T2 Test 1 | `chatTabs.where('type').equals('sdlc')` — no `type` index in `SCHEMA_V14`/`V17`; Dexie throws `SchemaError` | Use `(await db.chatTabs.toArray()).filter(t => t.type === 'sdlc')` |
| 7 | 01 T2 | `db.notes.add({ id, title, body, createdAt, updatedAt })` omits required `Note.isPinned` → `tsc` fails at wave 1 | Add `isPinned: false` (and `type` if still required) |
| 8 | 04 T2 | Acceptance grep `artifactContext` in `src tests` still hits 4 test files deleted later by plan 05 | Scope the gate to `src` only |

## Round-2 warnings still open (5)

| # | Plan/Task | Defect |
|---|---|---|
| 1 | 08 T3 | `AiChatWidget.test.tsx` has `kind: 'sdlc'` at `:243` **and** `:456` (plan names only `:449`), plus `scopeKey: 'sdlc:p:cr:INTAKE'` at `:243` and an assertion at `:254` |
| 2 | 10 T3 | Says "four cases" then lists five bullets (7 − 2 deleted = 5) |
| 3 | 12 T1 | Re-deletes `chatTurnRuntime.test.ts` blocks plan 04 already deleted; stale line refs (`:456-700` is actually 8 blocks) |
| 4 | 12 | Scoped-suite command covers nearly every test file — violates the project rule "never run the full vitest suite" |
| 5 | 08 T3 | `AIChatDrawerTabs.test.tsx` "delete the `getOrCreateSdlcTab` `it` block (`:81-83`)" — block spans `:75-111` and also asserts ordinary-tab persistence; state exactly which assertions stay |

## Info (1)

- Plan 02 `files_modified` omits the `git mv` source `tests/ai/sdlcConventionsExemplar.test.ts`.

---

## Verification commands after fixes

```bash
npx tsc --noEmit
npx vitest run <touched paths>     # NEVER npm test — >1 hour
```

Manual-only check (carried from VALIDATION.md): set `localStorage['taskmate:layout:v2']` to a blob with an `sdlc` tab as `activeTabId`, reload, expect no `sdlc` tab and `activeTabId` on a valid tab.
