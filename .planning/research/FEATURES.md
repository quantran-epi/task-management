# Feature Research

**Domain:** Local-first multi-agent chat workspace with a leader orchestrator (AI Office, Milestone v1.4)
**Researched:** 2026-11-09
**Confidence:** MEDIUM-HIGH (codebase facts HIGH; external product patterns MEDIUM; user-decided scope HIGH)

**Scope note:** This file covers only the v1.4 Unified AI Office milestone. The previous FEATURES.md (GraphRAG pilot) is superseded.

**Ground rule for this document:** every row is traced to either a confirmed user decision (C-xx from `.planning/MILESTONE-CONTEXT.md`) or an explicitly stated open question (R-xx). Phase 34 decisions (D-xx) are treated as **hypotheses**, not requirements — see "Phase 34 Behaviors: Unproven, Re-decide".

---

## Feature Landscape

### Table Stakes (Users Expect These)

Missing any of these and the feature reads as broken, not merely limited.

| Feature | Why Expected | Complexity | Notes / Existing State | Traced To |
|---------|--------------|------------|------------------------|-----------|
| Chat-first group creation | User's stated mental model: open a chat, then staff it. Creating a "team" first and a chat second inverts the product | MEDIUM | Current `TeamEditorDrawer` requires `name` + `leadId` + `budgetTokens` before saving and seeds members in one transaction (`createTeam`). Chat-first means: create empty chat → add leader → add agents. Needs a create-then-configure path, not a bigger form | C-03, C-04 |
| Membership editing after creation (add/remove agents, swap leader) | Unlimited agents per group is useless if the roster is frozen at creation | MEDIUM | `aiTeamRepo.addTeamMember` exists with lead-uniqueness guard; no roster editor in `TeamSettingsDrawer` (it edits budgets + links only). Removal must also reconcile `aiTeamMembers` rows and any in-flight run | C-09, C-05 |
| Shared transcript with per-agent attribution | The transcript is the product surface. Unattributed bubbles make a 6-agent run unreadable | LOW | Exists: `ChatMessage` has `agentId/agentName/agentKind/messageKind/targetAgentId`; `ChatMessageBubble` takes `agent`; `AgentAttributionRow` supplies deterministic color + initials | C-14, R-09 |
| Leader delegation visible as an explicit plan | User must see *who* was assigned *what* before tokens burn; invisible delegation is indistinguishable from a hang | MEDIUM | Exists: `AssignmentPlanCard` + `awaiting-plan` phase + instruction rows (`messageKind: 'instruction'`, `targetAgentId`). Bypass toggle exists (`autoSplitEnabled`) — whether it survives is R-08-adjacent, open | C-05, C-06 |
| Per-agent run status + per-agent stop | With N agents in flight, "is it working or stuck?" is the #1 question | LOW | Exists: `AgentRunStatus` (queued/running/paused/stopped/error/done), `stopAgent`, live bubbles with stop buttons, keyboard arrow navigation between stop buttons | R-18 |
| Global stop / abort entire run | Escape hatch must be one click, always reachable | LOW | Exists: `abortAll()`, wired to widget `onStop`; `aiTurnManager` registers an abortable turn per agent and one for the team | R-18 |
| Token usage measured per request, input + output | User explicitly asked for "đo lường chính xác". A budget that only counts output is a fake budget | MEDIUM | Exists: `onUsage` → `normalizeUsageTotal` (sums prompt+completion when `totalTokens` absent) → `memberUsed` + `teamUsed` + `addUsedTokens`. Gaps: cache tokens, retries, missing-usage responses — all R-15, unresolved | C-11, R-15 |
| Budget visible per agent and for the group | "Hiển thị chuẩn chỉ" — user must see remaining headroom without opening a dialog | LOW | Partially exists: `TeamSidebar` shows member rows; `TeamsView` computes `usedByTeam`. Needs a defined unit/precision/realtime policy (R-19) | C-12, R-19 |
| Threshold warning + top-up flow | The whole point of a hard budget is a controlled stop, not a surprise failure | MEDIUM | Exists: `budgetGate` (park at tool-round boundary), `AgentPausedBanner`, `BudgetTopUpModal`, `topUp({kind:'agent'|'team'})`. Threshold 80% is Phase 34 residue → R-03; number of thresholds → R-04 | C-12, R-03, R-04 |
| Top-up of one agent raises the group total | User stated this explicitly; without it the group total drifts below the sum of member budgets and the team gate fires early | LOW | Exists: `topUp` agent branch updates the member row **and** `updateTeam({budgetTokens: base + amount})`. Verify the team gate bucket is recomputed after (it is: `lastTeamBucket = bucketOf(teamUsed, teamBudget)`) | C-12 |
| Conversation history browsing (list → open → read) | Unlimited chats need a findable list; a chat you cannot reopen is a chat you will not create | MEDIUM | Exists: `AiOfficeExplorer` lists teams, opens `team_workspace:<id>` tab; `teamTranscriptRepo` accumulates transcript across reactivation. Missing: leader/agent section above the chat list (C-14) | C-08, C-14 |
| Explorer with two sections, detail in center editor | Explicit user UX requirement; also the only way one trigger covers staff + chats | MEDIUM | Partially exists: `AiOfficeExplorer` is one flat chat list; `AiOfficeView` is a separate segmented page (employees/leads/skills) opened as an `'agents'` tab. Must merge into one explorer: top = leaders + agents, bottom = chats; click → center tab | C-14 |
| Leader / agent / skill CRUD that does not break | User's words: "CRUD ... hoạt động chuẩn xác, không lỗi". Delete currently fires with no confirmation in `AiOfficeView` (`handleDeleteEmployee` calls `deleteEmployee` directly) | LOW | Exists: `AiOfficeView`, `StaffDetailView`, `EmployeeEditorDrawer`, `LeadEditorDrawer`, `SkillEditorDrawer`, zod schemas `AiEmployeeInputSchema`/`AiLeadInputSchema`. Needs: delete confirmation + referential messaging (employee in N teams, skill used by N agents — counts already computed) | C-14, C-15 |
| Deleting an entity that is in use degrades safely | One user, no roles: an accidental delete must not orphan a chat's roster | MEDIUM | `countTeamsUsingEmployee` exists; `deleteEmployee` behavior on live membership is unverified. Define: block, cascade, or soft-delete | C-15 |
| Errors surfaced, never silent | A run that dies quietly is worse than one that errors | LOW | Partially: `SANITIZED_TURN_ERROR`, `configError` alert, `team-workspace-missing` empty state. Audit needed for: provider timeout mid-batch, usage-accounting write failure (currently swallowed by design), tool refusal paths | C-15 |
| Backup coverage for all new tables | Local-first app; a chat history that does not survive backup is not durable | MEDIUM | New tables must be optional-absent in the backup envelope so old backups still validate. Envelope version is R-02, NOT the Phase 34 v11 answer | R-02 |

### Differentiators (Competitive Advantage)

These are the reasons this feature beats "just use a chat window with a prompt".

| Feature | Value Proposition | Complexity | Notes / Existing State | Traced To |
|---------|-------------------|------------|------------------------|-----------|
| Hard budget gate that **parks** instead of aborting | Preserves in-flight work; a budget stop becomes a decision point, not a data loss event. No mainstream multi-agent framework ships this (CrewAI/AutoGen expose message-count caps and usage reporting, not per-agent parked budgets) | HIGH | Exists: `createBudgetGate` + `beforeToolRoundFor` + abort-aware `wait(signal)`; paused agent's deferred stays pending so the lead cannot synthesize past it. Semantics (batch stays pending? other agents continue? resume exactness?) = R-06, unproven | C-11, C-12, R-06 |
| Even split with remainder on the leader, editable per row | Mirrors "allocate a department budget"; no magic defaults to argue with | LOW | Exists: `splitBudget` floors per row, remainder to lead row; `TeamSettingsDrawer` edits per-member budgets | C-12 |
| Per-agent top-up that increases the group total | Lets the user unblock one expensive specialist without inflating everyone | LOW | Exists (see table stakes). Differentiator only because it is coupled to the group total; keep that invariant tested | C-12 |
| Externalized team memory: recent window + own assignment history + BM25 transcript search | Keeps per-turn prompt cost flat as the chat grows — the only way unlimited-length chats stay affordable under a hard budget | MEDIUM-HIGH | Exists: `RECENT_WINDOW_TURNS=10`, `ASSIGNMENT_HISTORY_CAP=50`, `search_team_history` / `read_team_turn` over `src/utils/bm25.ts`, fully offline. Unproven: whether 10/50 are the right numbers, whether agents actually use the search tools (R-09) | R-09, C-11 |
| Progressive-disclosure skills (description in prompt, body via `read_skill`) | Same idea as Claude Code skills: cheap until needed. Keeps N-agent prompts small | LOW-MEDIUM | Exists: `teamPrompts` injects skill name + description + "call read_skill"; `readSkill` returns the body wrapped as untrusted data. One skill per agent = R-11, unproven | R-11 |
| **Skill enrichment with user-approved Markdown versions** | The stated long-term value: agents get better at this user's work over time, under human control. **No code exists today** — this is the largest net-new build in the milestone | HIGH | Nothing in `src/` for lessons, proposals, or skill versions (grep: zero hits). Needs: proposal capture after a run, a review surface (diff + approve/reject), a version record, and a restore-or-not decision (R-12) | C-13, R-12 |
| Free-style generic work with optional CR/PL/document context | Removes the SDLC gate that made the old feature unusable for ad-hoc work; context becomes an attachment, not a prerequisite | LOW-MEDIUM | Exists: `aiTeamLinks` (cr/task/system/note/document), `list_linked_items`, `get_linked_context` (full body, not a summary). The "optional" half is a UX claim: verify a chat with zero links runs identically | C-06, C-07 |
| Configurable concurrency limit | Protects CPU/API/token spend when a group has 10 agents. **Does not exist**: dispatch is `Promise.allSettled` over the whole batch, capped only by `MAX_BATCH_SIZE=3` | MEDIUM | Needs a real scheduler (queue + N workers) plus a setting. Default value and semantics = R-05. Note: with unlimited agents per group, batch size and concurrency are now two different knobs — decide whether both survive | C-10, R-05 |
| Per-agent model choice | Cheap model for narrow skills, strong model for the leader | LOW | Exists: `AiEmployee.model`, `AiLead.model`, model picker in `StaffDetailView` fed by `fetchAvailableModels` | C-05 |
| Background execution across view switches | Long runs must not die when the user looks at a task | MEDIUM | Exists: module-level `coordinatorRegistry` keyed by `db.name:teamId`, survives component unmount. Risk: registry is unbounded and never disposed on team delete (only on delete per comment — verify) | R-18 |
| Two-section explorer + center-editor detail (IDE pattern) | Matches the JetBrains workbench the app already imitates; one trigger, one mental model | MEDIUM | Partially exists: `AiOfficeExplorer` (chats only), `AiStaffExplorer` (staff), `AiOfficeView` page, `StaffDetailView`, `TeamWorkspaceView`. Consolidation, not invention | C-14, R-21 |

### Anti-Features (Commonly Requested, Often Problematic)

| Anti-Feature | Why Requested | Why Problematic | Alternative |
|--------------|---------------|-----------------|-------------|
| Free-for-all agent chat / peer-to-peer messaging | Looks more "alive"; Claude Code agent teams do allow teammate-to-teammate messages | Breaks batch semantics, makes token accounting and stopping non-deterministic, invites unbounded recursion. Claude Code itself lists "no nested teams" and "lead is fixed" as deliberate limits | Leader-mediated batches; an agent states a question in its report and the lead decides on a follow-up batch (Phase 34 D-03 — keep, but re-confirm) |
| Auto-stop or hard-abort at 100% budget | Simpler to implement than parking | Destroys in-flight work and produces a transcript with no usable result | Park at threshold, resume exactly where stopped, user decides |
| Auto-applying agent-proposed skill lessons | "Self-improving agents" is the obvious pitch | A model writing its own future system prompt is an unreviewed prompt-injection channel; a bad lesson silently degrades every future run | Propose → user reviews diff → approve creates a new version (C-13) |
| Semantic / embedding transcript search | Better recall than BM25 | Requires the optional knowledge server, which violates the offline-first constraint and adds a Docker dependency to core chat | Local BM25 over the transcript (already implemented) |
| Per-message approval of every agent action | Maximum control | Approval fatigue; with 5 agents × 20 rounds the user becomes a rubber stamp, which is worse than no gate | Approve the delegation plan once per batch; mutations still park on the existing approval card (re-confirm R-07/R-08) |
| Nested teams / agents spawning agents | Scales "infinitely" | Token accounting, budget gates, and stop semantics all break; Claude Code ships this as an explicit non-feature | Flat roster: one leader, N agents, one level of delegation |
| Round-robin or model-selected speaker turns | Less prompt engineering | No user control over cost; the lead becomes decorative; conversation drifts | Leader plans and dispatches; the user can `@mention` any agent directly |
| Global memory shared across all chats | "The AI should remember everything" | Cross-chat contamination, budget leakage between unrelated work, and privacy surprises in a personal tool | Per-chat transcript as memory; explicit links for shared context |
| Persisting agents as always-on background workers | Feels like real employees | Idle teammates keep consuming tokens (Claude Code documents this cost explicitly) | Runs are user-initiated and terminate; the coordinator is idle between sends |
| Multiple skills per agent (in this milestone) | More capability per agent | Combinatorial prompt growth, unclear precedence, harder to attribute a bad result | One skill per agent (R-11) — revisit only with evidence |
| A separate "team" container entity wrapping multiple chats | Feels more organized | User already rejected it: team == chat. Two entities means two lifecycle states to keep in sync | One entity; the chat *is* the group (C-04) |
| Storing per-agent budgets as a JSON array on the team row | One row, simpler read | Read-modify-write race when N agents finish simultaneously; roster edits rewrite the blob | `aiTeamMembers` row per member (Phase 34 D-32 — keep) |
| Requiring a CR / PL01 / PL02 before a chat can run | Matches the old SDLC flow | Contradicts the confirmed free-style model; makes the feature unusable for ad-hoc work | Context links are optional attachments |

---

## Phase 34 Behaviors: Unproven, Re-decide

These are shipped in code but were **not** confirmed for v1.4. Treat each as a hypothesis with a default, not a requirement.

| # | Behavior | Current implementation | Why unproven | Decision needed |
|---|----------|------------------------|--------------|-----------------|
| 1 | `MAX_ACTIVE_TEAMS = 3` | `types/aiOffice.ts`, enforced in `createTeam`/`activateTeam` | C-08 only says "unlimited chats"; the 3-active cap is Phase 34 residue and directly limits the new model | Keep, raise, or remove (and if removed, what protects the runtime?) |
| 2 | `MAX_EMPLOYEES_PER_TEAM = 3` | Constant + `TeamEditorDrawer` | Directly contradicts C-09 | Remove; replace with a soft warning |
| 3 | `MAX_BATCH_SIZE = 3` | `delegate_batch` validator | Was a proxy for concurrency; C-10 makes concurrency a setting | Split into "assignments per batch" (unbounded?) and "agents running at once" (setting) |
| 4 | 80% pause threshold | `BUDGET_PAUSE_THRESHOLD = 0.8`, `bucketOf`/`shouldNotifyPause` | R-03: only "there is a warning" is confirmed | Pick value(s); decide single vs multi-threshold (50/80/100) |
| 5 | Pause parks the batch, other agents continue | `budgetGate` + `beforeToolRoundFor` | R-06: semantics never confirmed | Confirm; also decide what the lead sees and whether a paused agent blocks synthesis |
| 6 | Lead-only writes, employees read-only | `chatTurnTools` allowlists | R-07: unconfirmed | Confirm; if employees may write, the approval model changes |
| 7 | Per-mutation approval + auto-approve toggle | `MutationApprovalCard`, `autoApproveMutations` | R-08: unconfirmed | Confirm the toggle exists at all; a personal single-user tool may prefer one global setting |
| 8 | Shared transcript + attribution model | `chatMessages` + agent fields | R-09: unconfirmed | Confirm one-channel vs per-agent threads |
| 9 | No peer-to-peer agent chat | No `ask_colleague` tool | R-10: unconfirmed | Confirm (recommended: keep) |
| 10 | One skill per agent | `AiEmployee.skillId` scalar | R-11: unconfirmed | Confirm |
| 11 | Assignment history cap 50 / recent window 10 | `ASSIGNMENT_HISTORY_CAP`, `RECENT_WINDOW_TURNS` | Numbers were research-resolved, not user-chosen | Validate against real transcript sizes; expose as constants |
| 12 | Leader as a separate table | `aiLeads` | R-01: domain separation confirmed, storage not | Decide table vs `aiEmployees` with `kind: 'lead'` |
| 13 | Backup envelope stays v11 | Phase 34 D-34 | R-02: explicitly reopened | Decide after final schema |
| 14 | `TeamRunPhase` union | `types/aiOffice.ts` | Derived from the old batch model; concurrency + enrichment may add states | Re-derive from the new state machine |
| 15 | Background execution via module registry | `TeamWorkspace.tsx` `coordinatorRegistry` | R-18: unconfirmed; registry lifetime vs team deletion unverified | Confirm behavior + define disposal |
| 16 | Team links are required for context | `list_linked_items` / `get_linked_context` | C-07 says optional; verify a zero-link chat behaves identically | Add an explicit "no links" test |
| 17 | Delete without confirmation | `AiOfficeView` delete handlers | C-15 demands "no errors"; silent destructive action is a UX defect | Add confirmation + in-use guard |

---

## Feature Dependencies

```
Explorer 2-section + center editor (C-14)
    └──requires──> Chat entity exists independent of a "team" container (C-04)
    └──requires──> Chat list query + staff list query (exist)

Chat-first creation (C-03)
    └──requires──> Create-chat-then-add-leader flow
                       └──requires──> Membership editing after creation (C-09)
                                          └──requires──> Leader swap semantics

Leader delegation (C-05)
    └──requires──> Agent roster + capability text (exists)
    └──requires──> Concurrency scheduler (C-10)  [for N > batch size]
    └──enhances──> Assignment plan card (exists)

Hard token budget (C-11)
    └──requires──> Per-request usage capture incl. input (exists)
    └──requires──> Per-agent budget rows (exists)
    └──requires──> Threshold policy (R-03/R-04)  ← BLOCKER for phase planning
    └──requires──> Pause/resume semantics (R-06) ← BLOCKER for phase planning

Top-up per agent → raises group total (C-12)
    └──requires──> Hard token budget
    └──requires──> Budget display policy (R-19)

Skill enrichment (C-13)
    └──requires──> Skill entity + assignment (exists)
    └──requires──> Run transcript + per-agent attribution (exists)
    └──requires──> Version record + approval surface (NEW)
    └──requires──> Decision: restore old version? (R-12)

Concurrency setting (C-10)
    └──requires──> Scheduler replacing Promise.allSettled
    └──conflicts──> MAX_BATCH_SIZE=3 as a concurrency proxy

SDLC Studio removal (C-02)
    └──blocks──> Explorer consolidation (shared 'sdlc' view type, shared prompt composer)
    └──requires──> Audit of shared services (R-13, R-20)
```

### Dependency Notes

- **Explorer consolidation requires C-04's single-entity model.** As long as a "team" row is the only chat container, the top section (staff) and bottom section (chats) have different detail surfaces. Merging them is cheap once the entity is settled and expensive before.
- **Chat-first creation requires post-creation membership editing.** Today the roster is fixed at `createTeam`. Without an add-member surface, "create chat first" cannot produce a usable chat.
- **Skill enrichment requires the transcript and attribution model to be stable.** Enrichment reads past runs to propose lessons. If R-09 changes the transcript shape, enrichment is rebuilt.
- **Concurrency setting conflicts with `MAX_BATCH_SIZE`.** Both currently cap "how much runs at once". Pick one owner; otherwise two settings silently fight.
- **SDLC removal blocks the explorer work.** `'sdlc'` is still in `EditorViewType` and `EditorArea`; the shared prompt composer and artifact tools are still imported by chat paths. Deleting before auditing breaks AI Office.

---

## MVP Definition

### Launch With (v1.4)

- [ ] **Chat-first creation + full roster editing** — without it the confirmed interaction model does not exist. (C-03, C-04, C-09)
- [ ] **Two-section explorer + center-editor detail** — the confirmed UX; also the acceptance surface for everything else. (C-14)
- [ ] **Leader delegation with visible plan and per-agent attribution** — the core value loop. (C-05, C-06)
- [ ] **Hard token budget: input+output accounting, threshold warning, per-agent top-up raising the group total** — the confirmed cost-control pillar. (C-11, C-12)
- [ ] **Per-agent stop + global abort, with stopped work marked incomplete** — safety floor for a system that spends money. (R-18)
- [ ] **Configurable concurrency limit with a real scheduler** — required the moment agents per group are unbounded. (C-10)
- [ ] **CRUD leader/agent/skill with confirmation, in-use guards, and empty/error states** — the user's explicit "must not break" bar. (C-14, C-15)
- [ ] **SDLC Studio removed, shared services audited** — pillar 1; also unblocks explorer work. (C-02)
- [ ] **Backup coverage for new tables** — local-first durability. (R-02)

### Add After Validation (v1.4.x)

- [ ] **Skill enrichment: proposal → review → approved version** — highest-value differentiator, but it depends on a stable transcript and a version model. Add once a real run has produced a transcript worth learning from. (C-13)
- [ ] **Skill version restore** — only if the user asks; R-12 leaves it open.
- [ ] **Multi-threshold budget warnings (e.g. 50/80/100)** — after the single-threshold flow proves usable. (R-04)
- [ ] **Per-agent tool allowlist** — Phase 34 deferred; revisit if read-only-everywhere proves too blunt.

### Future Consideration (v2+)

- [ ] **Semantic transcript search** — only if the knowledge server stops being optional.
- [ ] **Multiple skills per agent** — needs evidence that one is insufficient.
- [ ] **Peer-to-peer agent messaging** — only if leader mediation demonstrably fails.
- [ ] **Cross-chat shared memory** — needs a privacy and budget model first.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| SDLC removal + shared-service audit | HIGH (unblocks everything) | HIGH | P1 |
| Two-section explorer + center detail | HIGH | MEDIUM | P1 |
| Chat-first creation + roster editing | HIGH | MEDIUM | P1 |
| Leader delegation + plan card | HIGH | LOW (exists) | P1 |
| Shared transcript + attribution | HIGH | LOW (exists) | P1 |
| Input+output token accounting | HIGH | MEDIUM | P1 |
| Threshold warning + top-up (incl. group total) | HIGH | MEDIUM | P1 |
| Stop agent / abort all | HIGH | LOW (exists) | P1 |
| Concurrency setting + scheduler | MEDIUM-HIGH | MEDIUM | P1 |
| CRUD correctness (confirm, in-use guard, empty states) | HIGH | LOW | P1 |
| Backup coverage | HIGH | MEDIUM | P1 |
| Skill enrichment + version approval | HIGH (strategic) | HIGH | P2 |
| Skill version restore | LOW-MEDIUM | MEDIUM | P3 |
| Multi-threshold warnings | MEDIUM | LOW | P3 |
| Per-agent tool allowlist | MEDIUM | MEDIUM | P3 |

**Priority key:** P1 = required for v1.4 to be usable; P2 = the differentiator, add immediately after P1 stabilizes; P3 = future.

---

## Competitor / Reference Feature Analysis

| Feature | Claude Code subagents | Claude Code agent teams | AutoGen `SelectorGroupChat` | CrewAI hierarchical | Our approach |
|---------|----------------------|------------------------|-----------------------------|---------------------|--------------|
| Delegation trigger | Model picks from each subagent's `description` | Lead spawns named teammates | Model selects next speaker from history + names/descriptions | Manager agent plans, delegates, validates | Leader plans a batch; user approves the plan |
| Context isolation | Separate window; only a summary returns | Separate window per teammate; lead history not inherited | Shared broadcast history | Task output passed as context | Recent window + own assignment history + BM25 search over the shared transcript |
| Observability | Agent panel, per-agent transcript | Agent panel, per-agent transcript, split panes | Console stream | Not specified in docs | Shared transcript with attribution + per-agent status badges |
| Stop control | Per-subagent | Per-teammate (`x`), shutdown request | Termination conditions (`MaxMessageTermination`) | Not documented | Per-agent stop + global abort |
| Budget control | Cost guidance only (model choice, team size) | "Tokens scale with teammates"; shut down idle teammates | `models_usage` per result; message-count termination | Not documented | Hard per-agent + per-group token budget with park-and-resume |
| Peer messaging | Optional (named subagents) | Yes, by design | Broadcast | Manager-mediated | Deliberately not supported |
| Team size guidance | — | 3-5 teammates typical | — | — | Unlimited roster, user-set concurrency |

**Takeaway:** every reference implementation gives you *observability* and *stop*, and none gives you a *hard per-agent budget with resume*. That is the defensible differentiator. Conversely, all of them treat "how many run at once" as a real control — our `MAX_BATCH_SIZE=3` is a stand-in that must become a setting.

---

## Sources

- Codebase (HIGH confidence, read directly): `src/types/aiOffice.ts`, `src/services/ai/office/{teamRunCoordinator,teamTools,budgetGate,teamPrompts}.ts`, `src/db/repositories/{aiTeamRepo,teamTranscriptRepo}.ts`, `src/components/ai/office/*`, `src/views/{AiOfficeView,TeamsView,TeamWorkspaceView,StaffDetailView}.tsx`, `src/workbench/toolwindows/AiOfficeExplorer.tsx`, `src/workbench/{WorkbenchLayout.tsx,store/layoutStore.ts}`, `.planning/phases/34-.../34-CONTEXT.md`, `.planning/MILESTONE-CONTEXT.md`.
- Claude Code subagents — https://code.claude.com/docs/en/sub-agents (MEDIUM: vendor docs, fetched 2026-11-09)
- Claude Code agent teams — https://code.claude.com/docs/en/agent-teams (MEDIUM: vendor docs, experimental feature)
- Claude Code cost management — https://code.claude.com/docs/en/costs (MEDIUM: vendor docs; confirms token scaling with team size, idle-teammate cost, per-user attribution)
- AutoGen selector group chat — https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/selector-group-chat.html (MEDIUM: vendor docs)
- CrewAI processes — https://docs.crewai.com/en/concepts/processes (MEDIUM: vendor docs; no token controls documented)
- OpenAI Agents SDK handoffs — https://openai.github.io/openai-agents-python/handoffs/ (MEDIUM: vendor docs)

**Confidence assessment**

| Area | Level | Reason |
|------|-------|--------|
| Existing capability inventory | HIGH | Read from source, not inferred |
| Table-stakes list | HIGH | Derived from confirmed C-xx decisions + working code |
| Differentiator list | MEDIUM-HIGH | Code-backed; external comparison from vendor docs only |
| Anti-features | MEDIUM | Judgment + vendor-documented limits; not user-tested |
| Phase 34 unproven flags | HIGH | Directly traceable to R-01..R-21 |
| Skill enrichment scope | MEDIUM | No implementation exists; design space open (R-12) |

**Gaps to resolve in discuss/research (blocking phase planning)**

- R-03/R-04 threshold value(s) and count — blocks the budget phase.
- R-06 pause/resume/batch semantics — blocks the budget phase and the coordinator rewrite.
- R-05 concurrency default + semantics — blocks the scheduler phase.
- R-09 transcript model (one channel vs per-agent threads) — blocks enrichment and explorer detail.
- R-12 skill version restore — blocks the enrichment data model.
- R-15 token accounting edge cases (cache tokens, retries, missing usage, remainder on split, mid-run membership changes) — blocks "measure accurately".
- R-19 budget display form (unit, precision, realtime vs per-turn) — blocks the "hiển thị chuẩn chỉ" acceptance criterion.

---

*Feature research for: Unified AI Office (leader-orchestrated multi-agent chat workspace)*
*Researched: 2026-11-09*
