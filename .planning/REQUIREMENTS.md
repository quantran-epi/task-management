# Milestone v1.4 Requirements

**Milestone:** v1.4 Unified AI Office
**Goal:** Hợp nhất SDLC Studio và AI Office thành một workspace AI duy nhất dạng chat-first, free-style; xóa hoàn toàn SDLC Studio; đội ngũ AI leader + agent với kỹ năng chuyên biệt, token budget cứng, concurrency cấu hình được, và skill enrichment có duyệt version.
**Defined:** 2026-11-09
**Source of truth:** `.planning/MILESTONE-CONTEXT.md` — C-01..C-15 are LOCKED; R-01..R-21 are OPEN.
**Research:** `.planning/research/SUMMARY.md`

> **Rule (C-15):** No requirement is satisfied by reading code. Every acceptance criterion must be observable in a real UI walkthrough.

---

## Requirements

### SDLC Studio Removal (AIO-REMOVE)

- [x] **AIO-REMOVE-01**: Shared primitives are extracted *before* any SDLC file is deleted — `buildConventionsSegment` → `services/ai/conventionsSegment.ts`, `DiffSyntaxHighlighter` → `components/common/`, the `sdlcArtifactTools` patch core → `services/ai/patchProposal.ts`, and `ArtifactDiffApprovalCard` → `PatchDiffApprovalCard`. (C-02, R-13; coordinator registry relocation removed — `TeamWorkspace.tsx` has zero SDLC code.)
- [x] **AIO-REMOVE-02**: Every SDLC behavior entry point is gone — `ChangeRequestSdlcView`, `components/sdlc/**`, `components/ai/wizard/**`, all six launch points (TitleBar, CRExplorer, ChangeRequestsView, SystemDetailView, ChangeRequestDetailView, ChangeRequestTable), and the `sdlc` member of `EditorViewType`. `grep -rn "sdlc\|Sdlc" src` matches the enumerated residual list exactly (Dexie migration history, Dexie upgrade hooks, neutral identifiers). No stubs, no `as any`. (C-02; residual-list clause restated under C-16.)
- [x] **AIO-REMOVE-03**: No SDLC schema module survives — all four schema modules, `wizard/changePack.ts`, and `reconciliation.ts` are deleted along with the feature (C-16: no data preservation, no `types/legacySdlc.ts` shim). Ordinary chat, knowledge publish, and backup round-trip still pass after deletion. (C-02, C-16)
- [x] **AIO-REMOVE-04**: A persisted `viewType:'sdlc'` layout tab is dropped on launch and `activeTabId` re-points to a valid tab — never silently rendered as Tasks. `LAYOUT_STORAGE_KEY` is bumped and `partialize` filters unknown view types. (C-02)
- [x] **AIO-REMOVE-05**: `restoreBackup` no longer *creates* SDLC chat tabs when `chatTabs` is absent, and `validateBackup` no longer enforces SDLC invariants. Backup schemas are import-tolerant and export-strict. (C-02, R-02)

### Navigation & Explorer (AIO-NAV)

- [ ] **AIO-NAV-01**: Exactly one sidebar trigger named "AI Office" opens the workspace. The separate `ai_staff` trigger is removed from `DEFAULT_BOTTOM_LEFT_ITEMS`. (C-14, R-21)
- [ ] **AIO-NAV-02**: The explorer has two sections — leaders + agents on top, group conversations below — with the conversation list virtualized because group count is unbounded. (C-14, C-08)
- [ ] **AIO-NAV-03**: Clicking a leader, agent, or conversation opens its detail as a center-editor tab. Switching tool windows and relaunching the app does not lose the open tab or its state. (C-14)
- [ ] **AIO-NAV-04**: Empty states exist for both sections with a create call-to-action; the explorer shows live run status for a running group without mounting its workspace. (C-14)
- [ ] **AIO-NAV-05**: Alt+7 actually opens AI Office — it is registered in `actionRegistry` and `useGlobalKeymap`, not merely documented. (R-21)

### Group Chat Model (AIO-GROUP)

- [ ] **AIO-GROUP-01**: Chat-first creation — a user can create an empty group chat, then add exactly one leader and any number of agents. No form requires name + leader + budget up front. (C-03, C-04)
- [x] **AIO-GROUP-02**: `AiTeam` *is* the group chat; no new container entity wraps it. The transcript stays a `ChatThread` with `scopeKey = 'team:<teamId>'`. (C-04)
- [x] **AIO-GROUP-03**: The group roster is editable after creation — add and remove agents at any time. `MAX_ACTIVE_TEAMS` and `MAX_EMPLOYEES_PER_TEAM` are removed from `aiTeamRepo`, `teamTools`, and `TeamEditorDrawer`. (C-08, C-09)
- [x] **AIO-GROUP-04**: `MAX_BATCH_SIZE` no longer doubles as a concurrency cap; assignments-per-batch and agents-running-at-once are two separate controls. (C-09, C-10)
- [x] **AIO-GROUP-05**: Deleting a leader, agent, or skill with live references either refuses with a clear message or cascades in one transaction. The user's own next backup export must validate. (C-14)

### Leader Orchestration (AIO-LEAD)

- [ ] **AIO-LEAD-01**: The leader analyzes a free-style request, selects agents by their skill, splits the work, and synthesizes the result. No CR, PL01, or PL02 is required to run. (C-05, C-06)
- [ ] **AIO-LEAD-02**: The delegation plan is visible to the user with per-agent attribution on every message. The transcript distinguishes user, leader, and each agent. (C-05, R-09)
- [ ] **AIO-LEAD-03**: The user can @mention an agent directly; agents otherwise receive work only from the leader. (C-05)
- [ ] **AIO-LEAD-04**: CR and PL documents are optional attachments. With no attachment the group still runs at full quality; with one, the leader and agents read it through the existing tools. (C-07)
- [x] **AIO-LEAD-05**: Per-agent stop and a global abort both work, and stopped work is marked incomplete rather than silently dropped. (R-18)

### Runtime Reliability (AIO-RUNTIME)

- [x] **AIO-RUNTIME-01**: A throwing agent `start()` settles that agent as an error row and the batch resolves. A run can never hang in `batch-running`. (Pitfall 7)
- [ ] **AIO-RUNTIME-02**: A second submit while a turn is running is rejected visibly at the composer — one user message, one turn, phase returns to `ready`. No `TURN_IN_PROGRESS` thrown into the void. (Pitfall 8)
- [x] **AIO-RUNTIME-03**: Every registered `teamTurnId` is finished in `finally`; `getActiveTurns()` is empty after a run and the status indicator clears. (Pitfall 9)
- [ ] **AIO-RUNTIME-04**: Deleting a group mid-run tears down its coordinator and registry — no active turns, no further writes. (Pitfall 25)
- [x] **AIO-RUNTIME-05**: Concurrency is a real scheduler — with limit 2 and a batch of 5, at most 2 agents run at once and all 5 settle. The limit is a persisted setting, not a constant. (C-10, R-05)

### Token Budget (AIO-BUDGET)

- [ ] **AIO-BUDGET-01**: Budget is enforced before each model call, not only at tool-round boundaries. A turn whose prompt already exceeds the remaining budget is refused, not run. (C-11)
- [ ] **AIO-BUDGET-02**: Input and output tokens are both charged on every request. A response with no usage still increments the ledger under a stated policy — it is never free. (C-11, R-15)
- [ ] **AIO-BUDGET-03**: Retries are charged per attempt; a retried turn is not free. (R-15)
- [ ] **AIO-BUDGET-04**: Token increments are atomic — 20 concurrent increments sum correctly with no lost update. (R-15)
- [ ] **AIO-BUDGET-05**: Starting a group splits the total budget evenly across the leader and every agent, with the remainder handled deterministically. (C-12, R-15)
- [ ] **AIO-BUDGET-06**: A threshold warning fires when a member approaches its share; the threshold value is configurable, not hard-coded. (C-12, R-03, R-04)
- [ ] **AIO-BUDGET-07**: Topping up one agent raises that agent's share *and* the group total in a single transaction. (C-12)
- [ ] **AIO-BUDGET-08**: The budget display shows granted, used, and remaining for the group and per member, with input and output shown separately. (R-19)
- [ ] **AIO-BUDGET-09**: Reaching the threshold pauses between tool rounds and resumes when the user tops up — the pause is visible, not a hang. (C-11, R-06)

### Skill Management & Enrichment (AIO-SKILL)

- [ ] **AIO-SKILL-01**: Leader, agent, and skill CRUD all work with validation, empty states, and error handling — no crash on network or AI failure. (C-14)
- [ ] **AIO-SKILL-02**: After a run, an agent can propose a lesson. The proposal is stored as a pending version; it changes nothing until the user approves it. (C-13)
- [ ] **AIO-SKILL-03**: The user reviews a proposed version as a diff and approves or rejects it. Approval creates exactly one new approved version; the previous version remains retrievable. (C-13)
- [ ] **AIO-SKILL-04**: No AI tool can write an approved skill version. Only the user's approval action can. (C-13)
- [ ] **AIO-SKILL-05**: A mid-batch approval does not change the skill of an agent already running — the assignment pins its version. (C-13)
- [ ] **AIO-SKILL-06**: Skill bodies, including approved ones, are wrapped as untrusted data in the prompt. (C-13)

### Data & Backup (AIO-DATA)

- [x] **AIO-DATA-01**: `aiSkillVersions` is added to Dexie (V18) and covered by export, restore, validate, and the Tauri SQLite flush. Adding a table updates all five coordinated lists. (R-02)
- [x] **AIO-DATA-02**: `targetAgentId` survives export → restore. Agent assignment history is no longer stripped. (Pitfall 22)
- [x] **AIO-DATA-03**: Export → validate → restore round-trips both a pre-v1.4 fixture and a v1.4 fixture with matching counts. (R-02, R-14)
- [x] **AIO-DATA-04**: A backup produced by the previous build still imports; a backup produced by this build is read by the previous build without corruption. (R-02)
- [x] **AIO-DATA-05**: Persisted SDLC rows are handled non-destructively — filtered from the UI, not silently deleted — unless a decision in Phase 36 says otherwise. (R-16)

### Verification (AIO-VERIFY)

- [ ] **AIO-VERIFY-01**: Automated tests cover the coordinator, budget gate, team tools, and team repository — the modules that currently have zero coverage. (C-15)
- [ ] **AIO-VERIFY-02**: Each of the five live defects found in research is reproduced by a failing test before it is fixed. (C-15)
- [ ] **AIO-VERIFY-03**: The milestone closes on a real UI walkthrough: create a group, staff it, assign free-style work, watch delegation, hit the budget warning, top up, approve a skill version, restore a backup. No item is confirmed by reading code. (C-15)

---

## Open Decisions (must be resolved in phase discuss, not assumed)

| ID | Decision | Blocks |
|----|----------|--------|
| R-01 | Leader gets its own DB table or a `role='lead'` member row | Phase 36 |
| R-02 | Backup envelope version bump | Phase 36, 39 |
| R-03 | Threshold value | Phase 38 |
| R-04 | One threshold or several | Phase 38 |
| R-05 | Concurrency default and scope (per-group vs global) | Phase 37 |
| R-06 | Pause/resume/batch semantics at threshold | Phase 38 |
| R-09 | Transcript model — one channel vs per-agent threads | Phase 39, 40 |
| R-11 | One skill per agent or many | Phase 39 |
| R-12 | Skill version restore | Phase 39 |
| R-14 | Migration from team-scoped transcript to many chats | Phase 36 |
| R-15 | Cache tokens, retries, missing usage, split remainder, mid-run membership | Phase 38 |
| R-16 | Keep SDLC-specific PL/CAB/change-pack state or drop it | Phase 36 |
| R-17 | Which tools an agent may use in free-style mode | Phase 37 |
| R-19 | Budget display unit, precision, realtime vs per-turn | Phase 38 |
| R-21 | Exact trigger name and stripe position | Phase 40 |

## Out of Scope

- PWA / GitHub Pages behavior.
- Multi-user collaboration or any role system.
- Restoring SDLC step gating in any form.
- Peer-to-peer agent chat (R-10) — leader-mediated only for now.
- Semantic/embedding search over transcripts.
- Global cross-chat memory.
- Always-on background agents.
