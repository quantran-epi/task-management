# Project Research Summary

**Project:** TaskMate — Milestone v1.4 "Unified AI Office"
**Domain:** Chat-first multi-agent workspace (leader + N agents, hard token budgets, versioned skills) built inside an existing offline-first React 19 / TypeScript / Ant Design 6 / Dexie 4 / Tauri app; simultaneous removal of the SDLC Studio feature
**Researched:** 2026-11-09
**Confidence:** HIGH on code facts (every claim traced to `file:line`), MEDIUM on design recommendations, LOW on several values the user has explicitly left open (R-03/R-04/R-05/R-06/R-15/R-19)

**Authority note:** `C-01..C-15` in `.planning/MILESTONE-CONTEXT.md` are LOCKED user decisions. `R-01..R-21` are OPEN. Nothing in this summary converts an R-item into a decision. Where research recommends a value, it is labelled a recommendation, not a decision.

---

## Executive Summary

v1.4 is not a greenfield build. The AI Office runtime, budget gate, coordinator, prompt layer and transcript already exist and are structurally sound; the milestone is **subtraction (delete SDLC Studio), correction (fix live defects in the runtime and budget), and completion (skill versioning, concurrency, two-section explorer)**. Research converges on one hard conclusion: the existing architecture should be kept and hardened, not rewritten. `teamRunCoordinator` (headless) → `ChatTurnRuntime` → `runAiOrchestratorLoop` with `executeToolFn` interception for `delegate_batch` is the correct seam, and rewriting it is the single largest regression risk in the milestone. STACK.md adds a second hard conclusion: **zero new npm dependencies** — every capability needed (semaphore, skill versions, diff approval, virtualization, budget display) is covered by installed packages plus platform primitives.

The dominant risk is not design, it is the quality baseline. Phase 34 was marked complete with **zero automated tests referencing any AI Office module** and at least five live defects verified by reading shipped code: a batch run that hangs permanently when one agent's `start()` throws (`teamRunCoordinator.ts:563-567` + `:758-763`), an unguarded `void coordinator.send()` that corrupts run state on double-submit (`TeamWorkspace.tsx:317-324`), a `teamTurnId` registered and never finished so the status indicator never clears (`:462-471`), a budget that is only enforced at tool-round boundaries and therefore not hard (`aiOrchestratorLoop.ts:232`), and a non-transactional `addUsedTokens` that loses updates under concurrency (`aiTeamRepo.ts`). "Phase 34 complete" must not be used as evidence of anything.

The second risk is the SDLC deletion. SDLC is a *layer on top of* the shared chat engine, not a leaf: seven surviving modules import SDLC code on their hot path (`chatTurnRuntime.ts:19`, `aiTools.ts:74`, `AiChatWidget.tsx:491`, `AIChatDrawer.tsx:51`, `RemoteFileViewer.tsx:17`, `knowledgeSchemas.ts:3`, `chatTurnTools.ts:66`). Deleting by file list produces a green build and silently degraded ordinary chat. Extraction must precede deletion, and four persisted schema modules must be kept as type-only legacy because backup envelope v11 validates them.

---

## Key Findings

### Recommended Stack (STACK.md)

**Zero new dependencies, zero version bumps.** Node 24 / Vite 8 / React 19.3 / antd 6.6.5 / Dexie 4.4.6 / zod 4.6.5 / Vitest 5 / TypeScript 7 stay as-is.

- **Dexie 4.4.6** — new `aiSkillVersions` store in `SCHEMA_V18`; additive index adds on `aiTeams`/`aiTeamMembers`; no `.upgrade()` needed for pure additions.
- **Hand-rolled semaphore (~40 lines, `src/services/ai/office/semaphore.ts`)** — not `p-limit`/`p-queue`/`async-mutex`. None offer abort-aware `acquire`, live `setLimit` with FIFO drain, and idempotent release; the contract mirrors the already-proven `BudgetGate.wait`.
- **Existing `createUnifiedLineDiff` (`src/utils/lineDiff.ts:110`) + `renderSafeMarkdown`** — skill-version diff approval needs no diff or markdown library.
- **`@tanstack/react-virtual` (installed)** — C-08 removes the team cap, so the conversation list must be virtualized.
- **`antd` `Progress`/`Statistic`/`Alert` + `formatTokenCount`** — budget display.
- **`settings` table** — threshold and concurrency live here (`ai_office_budget_threshold`, `ai_office_concurrency`), not in localStorage.
- **Explicitly rejected:** `js-tiktoken` (22 MB, provider already reports exact usage), LangChain/LangGraph, Vercel AI SDK, `openai` SDK, `xstate`, tokenizer libraries, `react-query`, `diff`, `marked`, `dexie-cloud`.
- **Non-obvious data-safety constraint:** `FORBIDDEN_BACKUP_KEYS` (`backupSchemas.ts:200-221`) recursively rejects keys matching `prompt`, `error`, `stack`, `token`, `runtime`, `raw*response`. No persisted field may be named `proposedPrompt`, `errorMessage`, `stackTrace`, `runtimeInfo` — export will refuse the record.

### Expected Features (FEATURES.md)

**Must have (P1, v1.4):**
- SDLC removal + shared-service audit (unblocks everything)
- Two-section explorer + center-editor detail (C-14)
- Chat-first creation + post-creation roster editing (C-03, C-09) — today the roster is frozen at `createTeam`
- Leader delegation with visible plan + per-agent attribution (C-05, C-06)
- Input+output token accounting, threshold warning, per-agent top-up raising group total (C-11, C-12)
- Per-agent stop + global abort, stopped work marked incomplete
- Configurable concurrency with a real scheduler (C-10)
- CRUD leader/agent/skill with confirmation, in-use guards, empty/error states (C-14, C-15)
- Backup coverage for all new tables

**Should have (P2, immediately after P1 stabilizes):**
- Skill enrichment: proposal → diff review → approved version (C-13). Largest net-new build; zero code exists today.

**Defer (P3 / v2+):** skill version restore (R-12), multi-threshold warnings (R-04), per-agent tool allowlist (R-17), semantic transcript search, multiple skills per agent (R-11), peer-to-peer agent chat (R-10), cross-chat shared memory.

**Anti-features to refuse explicitly:** peer-to-peer agent messaging, auto-abort at 100% budget, auto-applied skill lessons, semantic/embedding search, per-message approval of every action, nested teams, round-robin speaker selection, global cross-chat memory, always-on background agents, a `ChatGroup` container wrapping `AiTeam`.

### Architecture Approach (ARCHITECTURE.md)

`AiTeam` **is** the group chat (C-04) — do not add a container entity. Its transcript is `ChatThread` with `scopeKey = 'team:<teamId>'`.

**Major components and their state:**
1. `teamRunCoordinator` (headless, no React) — orchestration policy; intercepts `delegate_batch` inside `executeToolFn`. **Keep.**
2. `teamRunRegistry` — one `ChatTurnRuntime` per agent. **Keep.**
3. `budgetGate` — pure pause gate. **Keep, parameterize threshold.**
4. `TeamWorkspace.tsx` module-level `coordinatorRegistry` — **MOVE** to `src/services/ai/office/teamRunManager.ts` so the explorer can show live run status without mounting the workspace.
5. `AiOfficeExplorer` — becomes two panes (staff on top, conversations below) reusing existing list bodies.

**Required changes, dependency-ordered:** relocate registry → concurrency semaphore in `runBatch` → budget pre-flight + `maxTokens` clamp → decouple plan-size cap from `MAX_BATCH_SIZE` → delete roster caps (`MAX_ACTIVE_TEAMS`, `MAX_EMPLOYEES_PER_TEAM` contradict C-08/C-09).

**SDLC shared-service audit verdicts (per module):**

| Module | Verdict |
|---|---|
| `views/ChangeRequestSdlcView.tsx`, `components/sdlc/**` (except diff), `components/ai/wizard/SdlcWorkflowHub.tsx` + 12 siblings, `services/wizard/*` (except schemas), `changePackPackager`, `export/wizardDocx`, `sdlcSolutionParser`, `researchService`, `wizardService`, `groundingBuilder` | **DELETE NOW** |
| `sdlcPromptComposer.buildConventionsSegment` | **EXTRACT FIRST** → `services/ai/conventionsSegment.ts` (used by `AIChatDrawer.tsx:51`) |
| `components/sdlc/diff/DiffSyntaxHighlighter.tsx` | **EXTRACT FIRST** → `components/common/` (used by `RemoteFileViewer.tsx:17`) |
| `sdlcArtifactTools` patch core (`locateSection`, `applyOperation`, `detectEol`, `createUnifiedLineDiff` wiring) | **EXTRACT FIRST** → `services/ai/patchProposal.ts` (skill enrichment needs it) |
| `ArtifactDiffApprovalCard` + `chatTurnRuntime` patch branch | **KEEP + generalize** → `PatchDiffApprovalCard` |
| `workflowSchemas.ts`, `wizardSchemas.ts` (`SdlcArtifactKind`, `SdlcArtifactMetadata`, `SdlcDocumentSetMetadata`, `WizardSnapshot`) | **KEEP** as type-only legacy (`types/legacySdlc.ts`) — backup v11 validates them |
| `wizard/changePack.ts`, `reconciliation.ts` | **KEEP** — `validateBackup.ts` and persisted note bodies depend on them |
| `DocumentPreviewCard`, `SolutionReviewCard`, `GapFillQuestionCard` | **KEEP**, move to `components/ai/legacy/` — historical `ChatMessage.wizard` rows render them |
| `services/ai/office/*` | **KEEP** — the target feature |

**Deletion blocker:** "delete SDLC completely" is achievable for *behavior* but not for the four persisted schema modules. Those become type-only legacy.

### Critical Pitfalls (PITFALLS.md)

Twenty-five code-verified pitfalls. Top five by blast radius:

1. **Pitfall 7 — hung batch run (live defect).** Deferred created before `registry.start()` which may throw; `Promise.allSettled` swallows it; `await Promise.all(deferreds)` never resolves. Lead's `delegate_batch` never returns; `phase` stuck `batch-running`; no error surfaced. Fix: `try/catch/finally` → `settleAgent(id,'error',...)` + delete deferred; bounded wait; watchdog.
2. **Pitfall 15 — "hard budget" is not hard (live defect).** `beforeToolRound` awaited only when `loopCount > 1` (`aiOrchestratorLoop.ts:232`), so round 1 is unguarded, the crossing round completes in full, and a tool-free turn never hits a gate. Overshoot up to `concurrency × one round`. Fix: reservation before each model call + pre-flight refusal + `maxTokens = min(cfg, remaining)`.
3. **Pitfall 1 — deleting SDLC files instead of auditing shared services.** Produces stubs/`as any`/dead allowlist entries and silently degrades ordinary chat. Audit must be plan 1 of the removal phase.
4. **Pitfall 2/3 — persisted SDLC rows + backup enum.** `validateBackup.ts:392-418` still enforces SDLC invariants; `restoreBackup.ts` *creates* SDLC tabs for every CR when `chatTabs` is absent. Tightening `type: z.enum(['chat','sdlc'])` to `['chat']` invalidates every existing backup. Backup schemas must be **import-tolerant, export-strict**.
5. **Pitfall 22 — `targetAgentId` missing from `BackupChatMessageRecordSchema` (live data-loss bug).** Silently stripped on import; every agent loses its assignment history after a restore. Fix immediately, before any migration work.

**Additional live defects to reproduce then fix:** Pitfall 8 (`void send()` reentrancy), 9 (phantom `teamTurnId`), 11 (two coordinators double-spend), 12 (missing usage = unlimited spend), 13 (retry resets baseline → retried turns free), 14 (cache tokens double-counted or dropped), 16 (fire-and-forget `addUsedTokens`), 17 (non-atomic top-up), 18 (skill body mutated in place mid-batch), 24 (bare deletes leave dangling refs that make the user's own export invalid), 25 (coordinator never torn down on delete).

**Cross-cutting structural hazard (Pitfall 23):** adding a table requires **five** coordinated edits across TS and Rust (`schema.ts`, `exportBackup.ts` ×3 lists, `restoreBackup.ts`, `validateBackup.ts`, `localSqlitePersistence.ts` + `sqlite_persistence.rs`). Miss one and the table silently vanishes on restore or the Tauri flush fails.

---

## Implications for Roadmap

Both ARCHITECTURE.md and PITFALLS.md independently converge on the same dependency order. Phase numbering starts at **Phase 35** (C-01). Six phases, each with an observable user-verifiable acceptance criterion (C-15).

### Phase 35: Shared-primitive extraction + SDLC behavior removal
**Rationale:** Extraction must precede deletion (7 surviving modules import SDLC on the hot path). Deletion must precede everything else because the SDLC views are the largest source of shared-import pressure, and the extracted primitives are what AI Office reuses.
**Delivers:** `conventionsSegment.ts`, `components/common/DiffSyntaxHighlighter.tsx`, `patchProposal.ts`, `types/legacySdlc.ts`, `teamRunManager.ts` (registry relocated out of `TeamWorkspace.tsx`); all SDLC entry points removed (TitleBar, CRExplorer, ChangeRequestsView, SystemDetailView, ChangeRequestDetailView); `EditorViewType` pruned; `LAYOUT_STORAGE_KEY` → `_v3` + `partialize` view-type filter; SDLC chat-tab creation removed.
**Addresses:** C-02, R-13, R-20. **Avoids:** Pitfalls 1, 4, 6.
**Acceptance:** `grep -rn "sdlc\|Sdlc" src` returns only legacy-schema and migration hits; no stubs, no `as any`; knowledge publish still green; launch with a persisted `viewType:'sdlc'` tab drops it and re-points `activeTabId`.
**Research flag:** needs `--research-phase` — the audit verdicts must be re-verified against the live tree before deletion.

### Phase 36: Data model, multi-chat identity, backup/migration
**Rationale:** Multi-chat identity decides whether budget is per-team or per-chat, so it must precede the runtime work. Backup coverage must land in the same phase as the table or history is lost.
**Delivers:** Dexie V18 (`aiTeams.updatedAt` index, `aiTeamMembers [teamId+agentId]` non-unique compound, `aiSkillVersions` store); `targetAgentId` added to the backup message schema; one `backupTableRegistry.ts` deriving all five lists + TS⊆Rust assertion test; delete cascades (refuse or cascade in one transaction, using the existing unused `countTeamsUsingEmployee`/`countAgentsUsingSkill`); multi-chat thread identity (`team:<id>:chat:<uuid>`, adopting the legacy thread for the first chat); memory scoping decision (chat-scoped vs team-scoped with chat filter); SDLC row disposition.
**Addresses:** C-04, C-08, C-09, R-02, R-14, R-16. **Avoids:** Pitfalls 2, 3, 5, 11 (decision half), 21, 22, 23, 24.
**Acceptance:** export → validate → restore on both a pre-v1.4 fixture and a v1.4 fixture, counts match, `targetAgentId` survives; post-delete export validates; Tauri flush succeeds with no `SQLITE_INVALID_TABLE`.
**Research flag:** needs `--research-phase` — R-14 (migration) and R-02 (envelope version) are unresolved.

### Phase 37: Runtime reliability + concurrency
**Rationale:** A hung run cannot be budget-tested. All five live runtime defects must be fixed before concurrency or budget work, and concurrency must precede budget enforcement because the overshoot bound is `concurrency × one round`.
**Delivers:** deferred-lifecycle fix (Pitfall 7), `send()` reentrancy guard + real error propagation (Pitfall 8), `teamTurnId` finished in `finally` (Pitfall 9), per-team run queue `queued → running → settled` with the semaphore releasing after `settleAgent` (Pitfall 10), `concurrencyLimit` setting, plan-size cap decoupled from `MAX_BATCH_SIZE`, coordinator `dispose()` + registry teardown on delete (Pitfall 25).
**Addresses:** C-10, R-05, R-18. **Avoids:** Pitfalls 7, 8, 9, 10, 25.
**Acceptance:** inject a throwing `registry.start` → batch resolves with an error row, not a hang; double-submit → one user message, one turn, phase `ready`; `getActiveTurns()` empty after a run; limit 2 / batch 5 → at most 2 running, all 5 settle; delete a team mid-run → no active turns, no further writes.
**Research flag:** standard patterns (semaphore, queue) — skip research-phase; the defects are already specified to `file:line`.

### Phase 38: Hard token budget + accurate measurement
**Rationale:** Gates must sit on the final dispatch path or the concurrency rewrite bypasses them.
**Delivers:** pre-flight refusal, `maxTokens` clamp, reservation before each model call (Pitfall 15), atomic transactional `addUsedTokens` (Pitfall 16), per-attempt delta accounting so retries are charged (Pitfall 13), canonical usage normalization with cache-token semantics documented per provider (Pitfall 14), unknown-usage policy (Pitfall 12), atomic `applyBudgetPlan` for top-up/edit (Pitfall 17), per-agent top-up raising `aiTeams.budgetTokens` in one transaction (C-12), configurable warn ratio, input+output display.
**Addresses:** C-11, C-12, R-03, R-04, R-06, R-15, R-19. **Avoids:** Pitfalls 12–17.
**Acceptance:** no-usage stream still increments and pauses; retry charges both attempts; budget below one round's prompt → call refused, not run; 20 concurrent increments sum correctly; two provider usage shapes produce one canonical total; top-up raises the group total.
**Research flag:** needs `--research-phase` — R-03/R-04/R-06/R-15/R-19 are all open and block acceptance criteria.

### Phase 39: Skill versioning + enrichment approval
**Rationale:** Enrichment runs cost tokens, so it follows the budget phase; it needs the versions table (Phase 36) and the bounded turn path (Phase 38).
**Delivers:** `aiSkillVersions` repo (list/approve/supersede, transactional), proposal capture after a run, diff review via `patchProposal` + generalized `PatchDiffApprovalCard`, version pinning on the assignment so a mid-batch approval cannot change a running agent's skill (Pitfall 18), no AI tool may write an approved version (Pitfall 19), `wrapUntrusted` on every skill body including approved ones, backup schema evolution without breaking old builds (Pitfall 20).
**Addresses:** C-13, R-11, R-12. **Avoids:** Pitfalls 18, 19, 20.
**Acceptance:** agent proposes → version count unchanged → user approves → exactly one new approved version, previous still retrievable; approve mid-batch → running agents keep the pinned version; old build reads new backup.
**Research flag:** needs `--research-phase` — R-11/R-12 are open and the feature has zero existing code.

### Phase 40: Explorer UX, CRUD correctness, observed walkthrough
**Rationale:** Last; sweeps the whole surface. Explicitly the phase that replaces "Phase 34 complete" as the quality gate.
**Delivers:** two-section `AiOfficeExplorer` (staff top / conversations bottom, virtualized, empty states with create CTA), single AI Office trigger (`ai_staff` removed from `DEFAULT_BOTTOM_LEFT_ITEMS`, Alt+7 actually bound in `actionRegistry` + `useGlobalKeymap` — it is dead today), live run badge via `peekRun`, CRUD confirmation + in-use guards + error states, i18n copy, a11y, dead-code removal.
**Addresses:** C-14, R-21. **Avoids:** the UX pitfalls table (paused run looks like a hang, composer enabled during run, `error={null}`, budget with no breakdown, two AI entry points).
**Acceptance:** the full "Looks Done But Isn't" checklist executed as a real UI walkthrough — no item may be confirmed by reading code (C-15).
**Research flag:** standard patterns — skip research-phase.

### Phase Ordering Rationale

- **Extraction before deletion** — seven surviving modules import SDLC on the hot path; deleting first produces stubs and silent chat degradation.
- **Data model before runtime** — multi-chat identity decides budget scope; changing it after the budget ledger ships means rewriting the ledger.
- **Runtime reliability before budget** — a hung run cannot be budget-tested, and the budget overshoot bound is a function of concurrency.
- **Budget before skills** — enrichment spends tokens and must be bounded by the gate.
- **Walkthrough last, and it is the only completion criterion** — the milestone brief forbids declaring "no more bugs" without observed verification.

### Research Flags

Needs deeper research during planning: **Phase 35** (audit verdicts vs live tree), **Phase 36** (R-14 migration, R-02 envelope), **Phase 38** (R-03/R-04/R-06/R-15/R-19 all open), **Phase 39** (R-11/R-12, no existing code).

Standard patterns, skip research-phase: **Phase 37** (semaphore/queue, defects specified to `file:line`), **Phase 40** (UX consolidation).

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Zero-new-dependency verdict traced to existing modules; every rejected alternative has a named replacement. Only concurrency default (R-05) is LOW and it is a proposal, not a decision. |
| Features | MEDIUM-HIGH | Existing-capability inventory read from source (HIGH); external competitor comparison from vendor docs only (MEDIUM); skill enrichment scope MEDIUM (no code exists). |
| Architecture | HIGH on facts / MEDIUM on recommendations | Every claim traced to a file. Recommendations (keep coordinator, don't add container entity) are judgment calls backed by the code. |
| Pitfalls | HIGH for code-verified findings | All 25 pitfalls cite `file:line`. General multi-agent/budget patterns applied from domain knowledge are MEDIUM. |

**Overall confidence:** HIGH on "what is broken and where"; MEDIUM on "what the right values are" — because the user has deliberately left those open.

### Gaps to Address

- **R-03/R-04 threshold value(s) and count** — blocks Phase 38 acceptance criteria.
- **R-06 pause/resume/batch semantics** — blocks Phase 38 and the coordinator rewrite's state machine.
- **R-05 concurrency default + semantics (per-team vs global)** — blocks Phase 37; research proposes 3, clamp 1–12, but that is not a decision.
- **R-09 transcript model (one channel vs per-agent threads)** — blocks Phase 39 and the explorer detail surface.
- **R-12 skill version restore** — blocks the Phase 39 data model shape.
- **R-15 token accounting edge cases** (cache tokens, retries, missing usage, split remainder, mid-run membership change) — blocks "measure accurately".
- **R-19 budget display form** (unit, precision, realtime vs per-turn) — blocks "hiển thị chuẩn chỉ".
- **R-14 multi-chat migration** — blocks Phase 36.
- **R-02 backup envelope version** — blocks Phase 36 and Phase 39.

### Conflicts Between Research Files (must be resolved in discuss, not silently)

1. **SDLC data disposition.** PITFALLS.md Pitfall 2 says ship a Dexie migration that *deletes* `chatTabs.type='sdlc'`, `cr:*:sdlc` threads and `sdlc_workflow:*` settings. ARCHITECTURE.md §2.4 says the *opposite*: do not destructively delete those rows; filter them out of the UI and leave them in place, because `exportBackup` only filters settings by secret-key name and destructive cleanup risks user data. **Recommendation:** defer the decision to Phase 36 and default to ARCHITECTURE's non-destructive stance (keep rows, filter UI), with the migration limited to what is provably safe. This is an open decision, not a settled one.
2. **Backup schema version.** PITFALLS.md Pitfall 3 says never bump `CURRENT_SCHEMA_VERSION` (currently 11) for an additive change. STACK.md says bump it for `aiSkillVersions`. **Recommendation:** prefer optional-absent fields so no bump is needed; if a bump is unavoidable, accept both versions on import. Resolve in Phase 36 (R-02).
3. **`SafeMarkdown`.** STACK.md says relocate `components/sdlc/common/SafeMarkdown.tsx` to `components/common/`. ARCHITECTURE.md says delete it (only `Step2SolutionView` uses it; everything else calls `renderSafeMarkdown` directly). **Recommendation:** follow ARCHITECTURE (delete) — verify with a grep in Phase 35.
4. **`aiTeamMembers [teamId+agentId]` index.** ARCHITECTURE.md says non-unique (an upgrade fails if legacy rows contain duplicates). STACK.md's `aiSkillVersions` uses `&[skillId+version]` unique. Both are consistent — different tables — but enforce uniqueness in `addTeamMember`'s transaction, not the index.

---

## Sources

### Primary (HIGH confidence — code-verified in this repository, 2026-11-09)
- `src/services/ai/office/{teamRunCoordinator,teamRunRegistry,teamTools,teamPrompts,budgetGate}.ts`
- `src/components/ai/runtime/chatTurnRuntime.ts`, `src/services/ai/{aiOrchestratorLoop,aiTools,chatTurnTools,nineRouterClient,aiTurnManager}.ts`
- `src/db/{schema,index}.ts`, `src/db/repositories/{aiTeamRepo,aiOfficeRepo,teamTranscriptRepo,chatTabRepo,chatRepo}.ts`
- `src/validation/{backupSchemas,aiOfficeSchemas,knowledgeSchemas}.ts`, `src/types/{models,aiOffice,backup}.ts`
- `src/services/backup/{exportBackup,restoreBackup,validateBackup}.ts`, `src/services/localSqlitePersistence.ts`, `src-tauri/src/sqlite_persistence.rs`
- `src/workbench/{store/layoutStore.ts,EditorArea.tsx,WorkbenchLayout.tsx,TitleBar.tsx}`, `src/workbench/toolwindows/{AiOfficeExplorer,AiStaffExplorer,CRExplorer,Stripe}.tsx`
- `src/services/ai/sdlcPromptComposer.ts`, `src/services/ai/sdlcArtifactTools.ts`, `src/services/wizard/*`, `src/components/sdlc/**`, `src/components/ai/wizard/**`
- `src/utils/{agentMetrics,lineDiff,markdown,uuid}.ts`, `package.json`
- `.planning/MILESTONE-CONTEXT.md` (C-01..C-15, R-01..R-21), `.planning/phases/34-.../34-CONTEXT.md` (D-xx treated as hypotheses)

### Secondary (MEDIUM confidence — vendor docs, fetched 2026-11-09)
- Claude Code subagents — https://code.claude.com/docs/en/sub-agents
- Claude Code agent teams — https://code.claude.com/docs/en/agent-teams
- Claude Code cost management — https://code.claude.com/docs/en/costs
- AutoGen selector group chat — https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/selector-group-chat.html
- CrewAI processes — https://docs.crewai.com/en/concepts/processes
- OpenAI Agents SDK handoffs — https://openai.github.io/openai-agents-python/handoffs/
- npm registry (rejected alternatives only): `p-limit@7.3.3`, `p-queue@10.0.0`, `js-tiktoken@1.0.21`, `async-mutex@0.5.0`

### Tertiary (LOW confidence — needs validation)
- Concurrency default of 3 with clamp 1–12 — a proposal, not a decision (R-05).
- Whether 9router emits Anthropic-style cache-token fields — unverified; determines whether `ChatTokenUsage` needs the extension.
- `RECENT_WINDOW_TURNS=10` / `ASSIGNMENT_HISTORY_CAP=50` — Phase 34 research values, never validated against real transcript sizes.

---
*Research completed: 2026-11-09*
*Ready for roadmap: yes — with R-03/R-04/R-05/R-06/R-14/R-15/R-19 flagged as discuss items before their phases are planned*
