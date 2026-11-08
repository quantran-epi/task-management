# Phase 34: AI Office — AI Employees, Teams, and Skills — Research

**Researched:** 2026-11-08
**Domain:** Multi-agent orchestration on an existing headless single-turn AI runtime (React 19 / Ant Design 6 / Dexie 4 / Tauri)
**Confidence:** HIGH on codebase seams, MEDIUM on multi-agent orchestration heuristics, HIGH on "no new dependency needed"

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Team Coordination**
- **D-01 (Lead orchestrates):** The user selects one lead per team. The lead decomposes the request and dispatches work. Employees never choose the next speaker; there is no round-robin.
- **D-02 (Parallel batches):** The lead calls a single `delegate_batch([{ agentId, instruction }, ...])` tool. Agents in the batch run **concurrently** (true independence), and the lead waits for the whole batch before synthesizing. Cap concurrent agents per batch at 3.
- **D-03 (No peer-to-peer):** Employees cannot talk to each other directly. There is no `ask_colleague`. An employee that needs a colleague's result states the question in its report to the lead; the lead decides whether to dispatch a follow-up batch. Agents in the same batch see each other's results only after the batch completes.
- **D-04 (Lead context):** The lead sees the original user request, the employee roster (name + role + capability description, never their full system prompt), the summarized results of prior batches, every mutation it performed, plus the recent-window memory described in D-10. It never sees an employee's internal tool trace.
- **D-05 (Employee context):** Each employee sees its own system prompt (persona + role + assigned skill description), the lead's instruction for the current turn, the original user request, the results of the other agents in the same batch, its **full assignment history from this lead** (every instruction ever given to it), plus the recent-window memory in D-10.
- **D-06 (Assignment confirmation):** Before dispatching a batch, the lead emits an assignment plan (which agent, which skill, which task) rendered as a confirmation card. The user approves, and only then does the batch run. A per-team **bypass toggle** ("Tự động chia việc") skips the card and dispatches immediately.

**Transcript and Memory**
- **D-07 (Single shared transcript):** One transcript per team, with every message tagged by `agentId` (or lead/user). The user reads it as one continuous channel. Reuse `ChatMessageList` with added avatar and agent name.
- **D-08 (@mention addressing):** The user addresses any agent directly with `@agent` in the team composer. Without a mention, the message goes to the lead.
- **D-09 (Live streaming):** Agents currently running stream their text into the shared transcript as their own bubble, with a status badge. Reuse `aiTurnManager` and `useChatTurn({ background: true })`.
- **D-10 (Externalized memory):** The transcript is the team's external memory, not per-agent context. Default context window is the **recent N turns** (N = 10) plus the agent's own full assignment history. Everything older is retrieved on demand — mirroring how a person remembers roughly and searches the group chat for details.
- **D-11 (Search tools):** Two BM25-backed tools over the team transcript, using the existing `src/utils/bm25.ts`:
  - `search_team_history({ query, limit? })` returns compact hits (turn id, agent, timestamp, kind, excerpt).
  - `read_team_turn({ turnId })` returns the full text of one turn.
  Search never depends on the Knowledge Server or any network — offline-first is preserved.

**Write Authority and Approval**
- **D-12 (Lead-only writes):** Employee agents are strictly read-only (all read-only DB tools, knowledge retrieval, file reads). Only the lead may mutate the database.
- **D-13 (Per-mutation approval):** Every lead mutation parks on the existing `MutationApprovalCard` for explicit approve/reject. The team's auto-approve toggle still wins when enabled — matching the Analysis Mode change shipped in this same session.
- **D-14 (Two stop controls):** Each running agent's bubble has its own Stop button; a stopped agent returns a summary to the lead explicitly marked as **incomplete / stopped mid-work**. A global Stop on the status bar aborts the entire team run (lead + every running agent).

**Lifecycle and Budget**
- **D-15 (Fixed teams, 3 active):** Teams are durable entities (name, lead, roster, settings). At most **3 teams** may be in the `active` state at once; the rest are `idle`. Reactivating an idle team resumes its accumulated work.
- **D-16 (Roster limits):** One lead and at most **3 employees** per team. No cap on tool rounds per employee.
- **D-17 (Accumulating transcript):** Reactivating a team continues the same transcript; agents remember prior work through it. No per-activation session reset.
- **D-18 (Global employees):** Employees are global entities reused across teams. Editing a persona updates it everywhere it is used. A lead is a **separate entity** (its own table), managed in its own section, and selected per team.
- **D-19 (Team budget + per-agent budget):** The user sets a **team token budget**; the app **suggests an even split** across the lead plus every employee (editable per row), like a company allocating a department budget. There is no hardcoded default — the user sets it in team settings. Budgets accumulate for the life of the team; the user may top up at any time.
- **D-20 (80% pause, never auto-stop):** At 80% of the **team** budget or of an **agent's** budget, that scope **pauses** and notifies the user. Nothing is auto-aborted. The user either grants more tokens (the scope resumes) or stops it. Each additional 80% crossing of the newly granted total notifies again.
- **D-21 (Pause granularity):** An agent pauses **between tool rounds** — the in-flight tool call completes, then the turn parks. Context is preserved so resuming continues exactly where it stopped. Only the paused agent pauses; other agents in the same batch keep running. The lead receives a marker that the agent is paused awaiting user token approval, and the run stays in a waiting state rather than appearing hung.
- **D-22 (Background execution):** Team runs continue when the user leaves the tab or switches views. Returning shows the full result.

**Skill Manager**
- **D-23 (Skills are prompt templates):** A skill is a Claude-Code-style custom skill: `name`, `description`, `body` (Markdown). Managed globally in its own surface and assignable to an agent.
- **D-24 (Progressive disclosure):** An agent's system prompt receives the skill's `description`. The full `body` is read on demand through a `read_skill` tool — never pasted wholesale into the prompt.
- **D-25 (One skill per agent):** An agent has at most one skill, chosen in the agent editor. An agent with no skill runs on its plain persona prompt. Skills are global and reusable across agents and teams.

**Team Links and Context Retrieval**
- **D-26 (Linkable items):** A team links to N items of type **CR, task, system, note, or document**.
- **D-27 (Lead retrieval tools):** The lead receives the **entire existing read-only tool set** (`query_tasks`, `query_change_requests`, `query_systems`, `query_notes`, `get_item_details`, `retrieve_knowledge`, `read_file`, …) plus two link-scoped tools:
  - `list_linked_items()` — compact list of the team's linked items.
  - `get_linked_context({ itemId })` — full retrievable context for one linked item (note body, document content, CR tasks, system details), not just metadata.
  The lead must be able to reach the **full content** of every linked item, not merely a summary.

**UI Surfaces**
- **D-28 (Employee tab + team page):** A new **employee tab** in the workbench lists and edits employees (the existing `EditorViewType` `'agents'` is the natural home; a separate section covers leads). A new **team page** (`EditorViewType` `'teams'`) lists teams and opens a team workspace with the shared transcript.

### Claude's Discretion
- Exact card layout for the assignment plan, budget top-up dialog, and paused-agent banner — follow the existing IntelliJ ExpUI Islands Light standards used by `MutationApprovalCard` and `ArtifactDiffApprovalCard`.
- Avatar/icon treatment per employee.
- Exact BM25 tokenization and excerpt length for `search_team_history`.
- Whether the employee tab and lead management live as two sub-tabs or one list with a type filter.

> All four discretion items are **already resolved** in `34-UI-SPEC.md` (approved 2026-11-08). Treat the UI-SPEC as binding for layout/copy/testids; do not re-derive.

### Deferred Ideas (OUT OF SCOPE)
- **`ask_colleague` (direct peer-to-peer agent conversation)** — considered and rejected for this phase. Would break the batch model, introduce uncontrolled recursion, and make token accounting and stopping unreliable. Revisit only if the lead-mediated flow proves insufficient in practice.
- **Semantic transcript search via the Knowledge Server embedding model** — rejected because it makes an optional Docker dependency mandatory and violates the offline-first constraint. BM25 local search is the chosen path.
- **Per-agent tool allowlist beyond the skill assignment** — the user chose per-agent tool allowlists during discussion, but the final decision is that employees are uniformly read-only and the lead holds the full read-only set. A finer per-agent allowlist is a future refinement.
- **Multiple skills per agent** — explicitly capped at one skill per agent for this phase.
- **More than 3 active teams / more than 3 employees per team** — limits are fixed for this phase; raising them is a settings change later.
- **Skill authoring assistance (AI-generated skill bodies, skill versioning UI)** — the phase stores and assigns skills; authoring help and version history are separate capabilities.
</user_constraints>

---

## Summary

Phase 34 does **not** need a new AI runtime, a new orchestration library, a new search engine, or a new UI kit. Every capability it needs already exists in the repo as a seam that was built for exactly this kind of extension:

- `createChatTurnRuntime` is already **headless** (no React import, `chatTurnRuntime.ts:1-19`) and already parameterized by `systemMessages` / `history` / `tools` / `model` per call. An employee turn is a second `start()` on a **second runtime instance**, not a new subsystem.
- `aiOrchestratorLoop` is a plain `while (loopCount < maxLoops)` loop (`aiOrchestratorLoop.ts:220`) with a tool-call `for` loop inside (`:362`) and a clean round boundary at `:467`. That boundary is the exact place D-21 wants a pause.
- Token usage is **already** accumulated per round and reported through `onUsage` (`aiOrchestratorLoop.ts:291-300`), then re-accumulated per turn in the runtime (`chatTurnRuntime.ts:316-322`). Budget accounting is a listener, not new plumbing.
- `MutationApprovalCard` + `awaiting-approval` parking already exists (`chatTurnRuntime.ts:395-403`). Lead mutations need zero new approval machinery.
- `rankBM25` + `extractRelevantSnippet` already exist and are already used for offline document search (`aiTools.ts:4508`, `localGroundedRetrieval.ts:260`). `search_team_history` is a `BM25Document[]` mapping plus a `limit`.

The hard part is **not** features — it is four structural facts about the current code that will silently break a naive multi-agent implementation:

1. `chatTurnRuntime.start()` **throws `TURN_IN_PROGRESS`** if the same runtime instance is already running (`chatTurnRuntime.ts:199`). Concurrency therefore requires **one runtime instance per agent**, which means one `scopeKey` per agent and a registry — `createTabTurnRegistry` (`tabRuntimes.ts:27-60`) is the exact template.
2. Every turn **writes a `role:'user'` message** before it starts (`chatTurnRuntime.ts:237-243`). Three concurrent employee turns would inject three fake user bubbles into the shared transcript. The runtime needs an opt-out.
3. Employee read-only is **not** structural today. `getToolsForTurn` can withhold mutation tools, but if the model hallucinates `update_task`, `isMutationTool` still matches (`aiTools.ts:4762-4805`) and the runtime **parks an approval card the user could approve** (`chatTurnRuntime.ts:389-404`). D-12 requires a hard refusal, not a withheld payload.
4. New tool names must be registered in **both** `AI_DATABASE_TOOLS` and the `executeAiTool` switch. Anything unregistered falls through `dispatchAiToolCall` to `executeDynamicMcpTool` (`aiOrchestratorLoop.ts:32-48`) and throws a confusing MCP error instead of failing cleanly.

**Primary recommendation:** Build one headless `TeamRunCoordinator` that owns a `Map<agentId, ChatTurnRuntime>` (mirroring `createTabTurnRegistry`), intercepts `delegate_batch` inside the lead's injected `executeToolFn`, and pauses turns via a new optional `beforeToolRound` callback in `runAiOrchestratorLoop`. Add five additive fields to the runtime request (`agentId`, `agentName`, `agentKind`, `messageKind`, `persistUserMessage`) and one `mutationPolicy: 'read-only'` flag. Do **not** touch `ChatTurnStatus`, `ACTIVE_AI_STATUSES`, `TURN_STATUS_TO_TAB`, or `AiChatWidget`'s stage machine — the team page owns its own phase union.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Employee / lead / skill / team CRUD | Database / Storage (Dexie) | Browser / Client (drawers) | Durable entities; IndexedDB is canonical. UI is a thin form over a repo. |
| Team run orchestration (decompose → plan → batch → synthesize) | Browser / Client (headless service) | — | No server exists. The coordinator is a plain TS module, not a React component, so it survives unmount (D-22). |
| Per-agent turn execution | Browser / Client (existing `createChatTurnRuntime`) | — | Already headless; one instance per agent. |
| Token accounting + budget pause | Browser / Client (loop callback + team row) | Database / Storage (accumulated `usedTokens`) | Usage arrives from the provider stream; persistence is a Dexie write on the team/member row. |
| Transcript persistence + search | Database / Storage (Dexie `chatMessages`) | Browser / Client (BM25 in-memory) | Transcript is the external memory (D-10). BM25 runs in-process, offline. |
| Mutation approval | Browser / Client (existing runtime park + `MutationApprovalCard`) | Database / Storage (write on approve) | Existing seam; unchanged. |
| Employee read-only enforcement | Browser / Client (request-level policy) | — | Must be a runtime-level refusal, not a prompt preference. |
| Linked-item retrieval | Database / Storage (existing read tools) | — | D-27 reuses the existing read-only tool implementations verbatim. |
| Workbench surfaces (`agents` shell, `teams` page) | Browser / Client (workbench routing) | — | `EditorViewType` + `EditorArea.renderViewContent`. |
| Backup / restore of new tables | Database / Storage (export/validate/restore) | — | Five-file change; see Pitfall 5. |

---

<phase_requirements>
## Phase Requirements

> ROADMAP §Phase 34 lists `Requirements: TBD`. The IDs below are **derived from D-01..D-28** and are proposed for registration in `.planning/REQUIREMENTS.md`. The planner must register them (or an approved equivalent) before plans reference them.

| ID | Description | Research Support |
|----|-------------|------------------|
| AIOFF-01 | Employee, lead, skill, team and team-member entities persist in Dexie with additive `version(17)`; employees/leads/skills are global and reusable (D-18, D-23, D-25). | §Dexie Migration; `schema.ts:112-117`, `db/index.ts:316-473` |
| AIOFF-02 | A team run is led by one lead that decomposes the request and dispatches work; no round-robin, no peer-to-peer (D-01, D-03). | §Pattern 1 (coordinator), §Pattern 4 (anti-patterns) |
| AIOFF-03 | `delegate_batch` runs up to 3 employee turns truly concurrently and the lead waits for the whole batch before synthesizing (D-02). | §Concurrency Findings; `chatTurnRuntime.ts:199`, `tabRuntimes.ts:27-60` |
| AIOFF-04 | The lead emits an assignment plan rendered as a confirmation card; a per-team bypass toggle dispatches immediately (D-06). | §Pattern 2 (`delegate_batch` interception) |
| AIOFF-05 | One shared team transcript; every message tagged by `agentId`; `ChatMessageList` renders avatar + name + per-agent status/stop (D-07, D-09, D-14). | §Transcript Attribution; `ChatMessageList.tsx:139-203`, `ChatMessageBubble.tsx:81-93` |
| AIOFF-06 | Employees are structurally read-only; only the lead mutates, and every lead mutation parks on `MutationApprovalCard` unless the team auto-approve toggle is on (D-12, D-13). | §Pattern 3 (read-only policy); `chatTurnRuntime.ts:348-404` |
| AIOFF-07 | Agents see a recent-N-turn window (N=10) plus their own full assignment history; older transcript is retrieved via `search_team_history` / `read_team_turn` (BM25, offline) (D-10, D-11). | §Memory & Search; `bm25.ts:52-213` |
| AIOFF-08 | Team and per-agent token budgets accumulate for the team's life; at 80% the scope pauses between tool rounds with context preserved, never auto-stops, and resumes on top-up (D-19, D-20, D-21). | §Pattern 5 (budget gate); `aiOrchestratorLoop.ts:220,291-300,467` |
| AIOFF-09 | At most 3 teams are `active`; roster is 1 lead + ≤3 employees; reactivating a team resumes its accumulated transcript (D-15, D-16, D-17). | §Dexie Migration, §Common Pitfalls 6 |
| AIOFF-10 | Skills are `{name, description, body}` prompt templates with progressive disclosure — only `description` enters the prompt, `body` is read via `read_skill` (D-23, D-24, D-25). | §Pattern 6 (skill disclosure) |
| AIOFF-11 | A team links to CR / task / system / note / document items; the lead has the full read-only tool set plus `list_linked_items` and `get_linked_context` returning full content (D-26, D-27). | §Pattern 7 (linked context); `aiTools.ts:2482-2600` |
| AIOFF-12 | Employee management lives in the existing `'agents'` view (as a segmented shell with Ghost Dev) and a new `'teams'` view hosts the team list + workspace; team runs continue in the background across view switches (D-22, D-28). | §Workbench Wiring; `layoutStore.ts:6-21`, `EditorArea.tsx:496-520` |
| AIOFF-13 | New tables and new chat-message attribution fields survive backup export → validate → restore round-trip without bumping the backup envelope version (D-07). | §Pitfall 5; `exportBackup.ts:7`, `backupSchemas.ts:298-328` |
</phase_requirements>

---

## Standard Stack

### Core (all already installed — **zero new dependencies**)

| Library | Installed version | Purpose in this phase | Why standard |
|---------|------------------|----------------------|--------------|
| `dexie` | 4.4.6 `[VERIFIED: node_modules]` | New tables + additive `version(17)` | Project-canonical store; migrations already additive. |
| `dexie-react-hooks` | 4.4.0 `[VERIFIED: node_modules]` | `useLiveQuery` for employee/team lists and the transcript | Already used in 10+ views. |
| `antd` | 6.6.5 `[VERIFIED: node_modules]` | Drawers, `Segmented`, `Table`, `Progress`, `Mentions`, `Popconfirm`, `Alert`, `Avatar`, `Splitter` | Project-mandated UI kit; UI-SPEC pins exact components. |
| `@ant-design/icons` | 6.3.4 `[VERIFIED: node_modules]` | `TeamOutlined`, `CrownOutlined`, `PauseCircleOutlined`, `StopOutlined`, … | Bundled icon set. |
| `zod` | 4.6.5 `[VERIFIED: node_modules]` | Backup record schemas for the new tables | Existing boundary-validation standard. |
| `react` / `react-dom` | 19.3.0 `[VERIFIED: node_modules]` | Views | Project stack. |
| `src/utils/bm25.ts` | in-repo | `rankBM25`, `tokenize`, `extractRelevantSnippet` | Already the offline search engine (D-11 mandates it). |
| `src/components/ai/runtime/chatTurnRuntime.ts` | in-repo | Per-agent turn execution | Headless; no React import. |
| `src/services/ai/aiOrchestratorLoop.ts` | in-repo | Tool loop + usage reporting | Already reports `onUsage` per round. |

### Supporting (in-repo, extended not replaced)

| Module | Purpose in this phase | When to use |
|--------|----------------------|-------------|
| `createTabTurnRegistry` (`tabRuntimes.ts`) | Template for the per-agent runtime map | Copy its `get`/`peek`/`discard`/`abortAll` shape; do not import it directly (it is tab-keyed). |
| `aiTurnManager` (`aiTurnManager.ts`) | Bottom status indicator + per-agent abort | Register one turn per agent (`id = team:<id>:agent:<aid>`) and one team-level turn (`id = team:<id>`). |
| `MutationApprovalCard` | Lead mutation approval | Reuse verbatim. |
| `AiChatWidget` | Team workspace transcript shell | Reuse; pass `transcriptExtensions` / `messageListExtensions` for the attribution layer. |
| `sanitizeHistoryTurns` (`contextCompaction.ts:205`) | Build the recent-N window | Reuse; it already drops orphaned/trailing user turns. |
| `extractRelevantSnippet` (`bm25.ts:143`) | `search_team_history` excerpts | Reuse; do not hand-roll excerpt extraction. |

### Alternatives Considered

| Instead of | Could use | Tradeoff |
|------------|-----------|----------|
| Per-agent `createChatTurnRuntime` instances | One runtime with a queue | Impossible: `start()` throws `TURN_IN_PROGRESS` (`chatTurnRuntime.ts:199`) and there is one `AbortController` per runtime. Serializing would violate D-02. |
| New `TeamRunPhase` union in the coordinator | Extend `ChatTurnStatus` with `awaiting-budget` / `awaiting-plan` | Extending `ChatTurnStatus` ripples into `TURN_STATUS_TO_TAB` (`AIChatDrawer.tsx:124`), `ACTIVE_AI_STATUSES` (`aiTurnManager.ts:4`), `AiChatWidget`'s `ACTIVE_STAGES` (`AiChatWidget.tsx:119`), and `stageLabelFor`. A separate union costs one type and zero regression surface. **Use the separate union.** |
| New `beforeToolRound` loop callback | Wrap `executeToolFn` to park | A wrapper parks *before* the tool result is appended, and only fires on rounds that have tool calls. A round-boundary callback is exact and testable. |
| Reuse `chatMessages` for the transcript | New `aiTeamMessages` table | New table duplicates `saveMessage`, BM25 mapping, backup coverage and `ChatMessageList`'s input type. Reuse is strictly less code. |
| Bump backup envelope to v12 | Keep v11, add tables as optional | Bumping rejects every existing backup (`validateBackup.ts:90-95`) and breaks `tests/services/backup/v2Compatibility.test.ts`. Keep 11. |
| LangGraph / AutoGen / CrewAI | — | Wrong runtime: these are Python/Node server-side graphs. This app is offline-first, no server, and already has a working tool loop. Adding one would be the largest possible diff for zero capability. |

**Installation:** none.

```bash
# No new packages. Verify nothing was added:
git diff --stat package.json package-lock.json   # must be empty for this phase
```

**Version verification:** all versions read from `node_modules/*/package.json` in this session (dexie 4.4.6, antd 6.6.5, zod 4.6.5, vitest 5.0.2). No registry lookup needed because nothing new is installed.

---

## Package Legitimacy Audit

**Not applicable — this phase installs zero external packages.**

Every capability maps to an already-installed dependency or an in-repo module (see Standard Stack). The planner must not add `langgraph`, `autogen`, `crewai`, `ai`, `openai`, `events`, `p-queue`, `nanoid`, or `uuid`; each is either wrong-runtime, wrong-layer, or already covered by `crypto.randomUUID()` (`src/utils/uuid.ts:5`).

If a future revision wants a concurrency helper, `Promise.allSettled` (native) already covers the batch semantics — see §Don't Hand-Roll.

---

## Architecture Patterns

### System Architecture Diagram

```
                         ┌──────────────────────────────────────────┐
  user types in          │  TeamWorkspace (React view)              │
  team composer ────────►│  · reads transcript via useLiveQuery     │
  (@agent optional)      │  · renders AssignmentPlanCard / banners  │
                         │  · renders MutationApprovalCard          │
                         └───────────────┬──────────────────────────┘
                                         │ send(text) / stop(agentId) / topUp()
                                         ▼
                         ┌──────────────────────────────────────────┐
                         │  TeamRunCoordinator  (headless module)   │
                         │  · Map<agentId, ChatTurnRuntime>         │
                         │  · TeamRunPhase state machine            │
                         │  · per-agent + team token accumulators   │
                         │  · budget gates (Promise per scope)      │
                         └───┬───────────────┬──────────────┬───────┘
                             │               │              │
              lead turn      │        batch  │              │  persists
                             ▼               ▼              ▼
                 ┌───────────────────┐  ┌────────────────┐  ┌──────────────────┐
                 │ runtime[lead]     │  │ runtime[emp-1] │  │ chatRepo.saveMsg │
                 │ tools: full read  │  │ runtime[emp-2] │  │ (agentId tagged) │
                 │  + delegate_batch │  │ runtime[emp-3] │  └────────┬─────────┘
                 │  + team tools     │  │ tools: READ-ONLY│          │
                 │ mutationPolicy:   │  │ mutationPolicy: │          ▼
                 │  'approve'        │  │  'read-only'    │  ┌──────────────────┐
                 └─────────┬─────────┘  └───────┬────────┘  │ Dexie chatMessages│
                           │                    │           │ (team thread)     │
                           ▼                    ▼           └────────┬─────────┘
                 ┌──────────────────────────────────────┐           │
                 │ runAiOrchestratorLoop (per turn)     │           │ BM25
                 │  round → usage → tools → round …     │           ▼
                 │  ▲ beforeToolRound()  ← BUDGET GATE  │  ┌──────────────────┐
                 └──────────────────────────────────────┘  │ search_team_     │
                                                           │ history /        │
                 lead's executeToolFn intercepts:          │ read_team_turn   │
                 name === 'delegate_batch'                 └──────────────────┘
                   → emit plan card (unless bypass)
                   → await user decision
                   → Promise.allSettled(3 employee turns)
                   → return [{agentId, status, report}] as tool result
```

**Reading the diagram for the primary use case:** user types → coordinator starts the lead turn → lead calls `delegate_batch` → coordinator parks on the plan card → user approves → three employee runtimes start concurrently → each writes its own tagged transcript row → all settle → the JSON report array becomes the lead's tool result → the lead continues its loop and synthesizes → the synthesis is saved as a lead-attributed transcript row.

### Recommended Project Structure

```
src/
├── db/
│   ├── schema.ts                    # + SCHEMA_V17 (extends V16)
│   ├── index.ts                     # + this.version(17).stores(SCHEMA_V17)
│   └── repositories/
│       ├── aiOfficeRepo.ts          # NEW: employees, leads, skills CRUD
│       ├── aiTeamRepo.ts            # NEW: teams, members, budgets, links
│       └── teamTranscriptRepo.ts    # NEW: tagged messages, recent window,
│                                    #      assignment history, BM25 docs
├── services/ai/office/
│   ├── teamRunCoordinator.ts        # NEW: headless orchestrator (the core)
│   ├── teamRunRegistry.ts           # NEW: Map<agentId, ChatTurnRuntime>
│   ├── budgetGate.ts                # NEW: promise gate + 80% crossing detection
│   ├── teamTools.ts                 # NEW: delegate_batch, search_team_history,
│   │                                #      read_team_turn, read_skill,
│   │                                #      list_linked_items, get_linked_context
│   └── teamPrompts.ts               # NEW: lead/employee prompt assembly
├── components/ai/office/
│   ├── AiOfficeView.tsx             # NEW: 'agents' shell (Segmented)
│   ├── EmployeeCard.tsx / LeadCard.tsx / SkillCard.tsx
│   ├── EmployeeEditorDrawer.tsx / LeadEditorDrawer.tsx / SkillEditorDrawer.tsx
│   ├── TeamsView.tsx                # NEW: 'teams' page
│   ├── TeamCard.tsx / TeamEditorDrawer.tsx / TeamSettingsDrawer.tsx
│   ├── TeamWorkspace.tsx / TeamSidebar.tsx
│   ├── AssignmentPlanCard.tsx
│   ├── AgentPausedBanner.tsx / BudgetTopUpModal.tsx
│   ├── LinkedItemsList.tsx / LinkedItemPicker.tsx
│   └── AgentAttributionRow.tsx      # consumed by ChatMessageList extension
└── types/
    └── aiOffice.ts                  # NEW: AiEmployee, AiLead, AiSkill, AiTeam,
                                     #      AiTeamMember, TeamRunPhase, AgentRunState
```

### Pattern 1: One runtime per agent (concurrency without touching the runtime)

**What:** A module-level `Map<string, ChatTurnRuntime>` keyed by `agentId`, created lazily with `createChatTurnRuntime(createDefaultChatTurnDeps(db) + callbacks)`.
**When to use:** Every agent turn, including the lead.
**Why:** `start()` refuses a second concurrent turn on the same instance (`chatTurnRuntime.ts:199`). Separate instances give separate `AbortController`s, separate `approvalResolver`s, separate status streams — which is exactly what D-02, D-14 and D-21 need.

```typescript
// Source: src/components/ai/runtime/tabRuntimes.ts:27-60 (shape), chatTurnRuntime.ts:157-514
import { createChatTurnRuntime, type ChatTurnRuntime, type ChatTurnRuntimeDeps } from '../../components/ai/runtime/chatTurnRuntime';

export function createTeamRunRegistry(createDeps: (agentId: string) => ChatTurnRuntimeDeps) {
  const entries = new Map<string, ChatTurnRuntime>();
  return {
    get(agentId: string) {
      const existing = entries.get(agentId);
      if (existing) return existing;
      const runtime = createChatTurnRuntime(createDeps(agentId));
      entries.set(agentId, runtime);
      return runtime;
    },
    abort(agentId: string) { entries.get(agentId)?.abort(); },
    abortAll() { for (const r of entries.values()) r.abort(); },
    clear() { for (const r of entries.values()) r.abort(); entries.clear(); },
  };
}
```

**Concurrency truth (what actually happens today with two `start()` calls in flight):** on **two different instances** nothing conflicts — each has its own controller, its own loop invocation, its own `streamChatEvents` generator. The only shared state is (a) `aiTurnManager`'s `Map` (keyed by id — safe), (b) `nineRouterClient`'s `capabilityCache` (`nineRouterClient.ts:798`, read-mostly, benign), and (c) Dexie itself, where `saveMessage` opens a `rw` transaction over `chatMessages`+`chatThreads` (`chatRepo.ts:170-173`) so three simultaneous completions serialize their writes at the millisecond scale. On the **same instance**, the second call throws `TURN_IN_PROGRESS` and writes nothing (`tests/ai/chatTurnRuntime.test.ts:683-698` pins this).

### Pattern 2: `delegate_batch` as an intercepted tool, not a loop feature

**What:** The lead's injected `executeToolFn` checks for `delegate_batch` and hands it to the coordinator; everything else falls through to `dispatchAiToolCall`.
**When to use:** The single batch entry point (D-02) and the plan-confirmation park (D-06).
**Why:** The loop already `await`s `executeToolFn` (`aiOrchestratorLoop.ts:402-408`) and appends its return value as the tool result (`:459-464`). Parking inside that await gives the plan card, the batch, and the report array for free — no new loop state.

```typescript
// Source: chatTurnRuntime.ts:288-299 (the existing interception precedent: preparedPatches)
executeToolFn: async (name, args, toolDb, signal) => {
  if (normalizeToolName(name) === 'delegate_batch') {
    return coordinator.runBatch(args.assignments, signal); // plan → approve → allSettled → JSON
  }
  return dispatchAiToolCall(name, args, toolDb, signal, { allowMutation: request.autoApprove });
},
```

**Batch semantics:** `Promise.allSettled` over ≤3 employee `runtime.start()` promises. A rejected/settled-with-`phase:'error'` agent becomes `{agentId, status:'error', report: <sanitized>}`; an aborted agent becomes `{agentId, status:'stopped', report: <streamed-so-far>, incomplete: true}` (D-14). The lead must never see a partial report presented as final — set `incomplete: true` in the JSON, not just in prose.

**Paused agent (D-21):** the batch promise must **not** resolve while an agent is parked at a budget gate. If it resolved, the lead would move on and the preserved context would be discarded. The batch settles only when every agent reaches a terminal state (`complete` | `stopped` | `error`); a paused agent is non-terminal. The run therefore sits in `TeamRunPhase = 'awaiting-budget'` with the paused banner, which is precisely "waiting, not hung".

### Pattern 3: Read-only employees as a request-level policy (D-12)

**What:** `ChatTurnRequest.mutationPolicy?: 'approve' | 'read-only'`. When `'read-only'`, `onMutationCheck` returns `{proceed:false, cancellationResult: READ_ONLY_REFUSAL}` **before** the artifact branch and before the auto-approve branch.
**When to use:** Every employee turn. The lead uses `'approve'` (the default).
**Why:** Withholding mutation tools is necessary but not sufficient — a hallucinated `update_task` still matches `MUTATION_TOOLS` (`aiTools.ts:4762-4805`), so the loop calls `onMutationCheck` (`aiOrchestratorLoop.ts:375-395`) and the runtime parks a card the user could approve. That would be an employee write. The refusal must be unconditional.

```typescript
// Source: chatTurnRuntime.ts:348-404 (guard order is fixed — insert the policy check FIRST)
onMutationCheck: async (toolName, args) => {
  if (request.mutationPolicy === 'read-only') {
    return { proceed: false, cancellationResult: READ_ONLY_REFUSAL }; // never parks, never writes
  }
  // …existing artifact-patch → auto-approve → explicit-wait order, unchanged…
},
```

Defense in depth, all three layers:
1. **Payload:** employee `tools` = `getToolsForTurn(true, dynamicMcpTools, EMPLOYEE_READ_ONLY_ALLOWLIST)` — `analysisMode: true` + explicit allowlist drops every `isMutationTool` entry and every non-read-only MCP tool (`chatTurnTools.ts:26-35`).
2. **Policy:** `mutationPolicy: 'read-only'` refuses at `onMutationCheck`.
3. **Dispatch:** employee `executeToolFn` never sets `allowMutation`, so `executeDynamicMcpTool`'s fail-closed gate holds (`mcpClient.ts:527-529`).

### Pattern 4: Anti-patterns to avoid

- **Do not add `ask_colleague` or any employee→employee tool.** Deferred for cause: it breaks the batch model, makes recursion unbounded, and destroys token attribution. The lead is the only router (D-01, D-03).
- **Do not extend `ChatTurnStatus`.** It is consumed by `TURN_STATUS_TO_TAB` (`AIChatDrawer.tsx:124-135`), `ACTIVE_AI_STATUSES` (`aiTurnManager.ts:4-10`), `stageLabelFor` (`useChatTurn.ts:33-49`), `AiChatWidget`'s `ACTIVE_STAGES` (`AiChatWidget.tsx:119-124`) and `stagedStageFor` (`:126-140`). A team-only phase union is one file.
- **Do not run the coordinator inside a React component or hook.** D-22 requires the run to survive view switches. `useChatTurn` is a hook; the coordinator must call `createChatTurnRuntime` directly and register with `aiTurnManager` for the global indicator.
- **Do not let the lead see an employee's tool trace.** `onToolEvent` for an employee must be routed to the UI only, never appended to the lead's message list (D-04).
- **Do not put a `systemPrompt` / `prompt` key on any new persisted row.** `backupSchemas.ts:202-208` rejects forbidden keys and `FORBIDDEN_TAB_BACKUP_KEY` (`exportBackup.ts:120`) matches `prompt` as a whole segment. Name the field `persona` and the skill body `body`.
- **Do not bump `CURRENT_SCHEMA_VERSION`.** See Pitfall 5.
- **Do not create a `ChatTab` row for the team thread.** Tabs are the AI-drawer's tab bar; a phantom `team:` tab would appear there.

### Pattern 5: Budget gate at the round boundary (D-20, D-21)

**What:** A new optional `beforeToolRound?: (round: number) => Promise<void>` on `AiOrchestratorLoopOptions`, awaited at the top of each iteration after the first.
**When to use:** Every team turn (lead and employees).
**Why:** The boundary at `aiOrchestratorLoop.ts:467` is after every tool result has been appended and before the next model call — so the in-flight tool completes, the message list is intact, and resuming continues exactly where it stopped.

```typescript
// Source: aiOrchestratorLoop.ts:220-250 (insertion point), 467-468 (round end)
while (loopCount < maxLoops) {
  loopCount++;
  if (loopCount > 1 && beforeToolRound) {
    await beforeToolRound(loopCount);          // parks here when a budget gate is closed
    signal?.throwIfAborted();                  // Stop while parked must exit the loop
  }
  // …existing compaction → stream → tool loop…
}
```

Gate implementation (no dependency): a `Promise` per scope plus an abort race.

```typescript
// Source: pattern derived from chatTurnRuntime.ts:374-378 (resolver installed before publish)
export function createBudgetGate() {
  let resolver: (() => void) | null = null;
  let closed = false;
  return {
    close() { closed = true; },
    open() { closed = false; resolver?.(); resolver = null; },
    isClosed: () => closed,
    wait(signal?: AbortSignal): Promise<void> {
      if (!closed) return Promise.resolve();
      return new Promise<void>((resolve, reject) => {
        resolver = resolve;
        signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      });
    },
  };
}
```

**80% crossing rule:** compare `Math.floor(used / budget * 10)` before and after each round; notify when the bucket reaches 8 and the previous bucket was < 8. After a top-up the budget grows, so the bucket drops below 8 and a later crossing re-notifies — exactly D-20 without extra state.

**Scope semantics:** a closed **agent** gate parks only that agent; a closed **team** gate parks every turn at its next boundary (lead included), which produces "the run stays waiting" without aborting anyone.

### Pattern 6: Skill progressive disclosure (D-24)

**What:** The employee's system prompt contains `skill.description` only. `read_skill()` returns `skill.body`.
**When to use:** Every employee turn whose agent has a skill.
**Why:** Pasting a 14-row Markdown body into every turn's system prompt is the single largest avoidable token cost in this phase, and it is what D-24 forbids.

```typescript
// Source: D-24 + aiTools.ts:1581-1600 (read_file's shape is the template)
{ type: 'function', function: {
    name: 'read_skill',
    description: 'Đọc toàn văn nội dung Markdown của kỹ năng được gán cho bạn. Gọi khi cần quy trình chi tiết.',
    parameters: { type: 'object', properties: {}, required: [] },
} }
```

### Pattern 7: Linked-item full context (D-27)

**What:** `list_linked_items()` returns `[{itemId, itemType, name, code?}]`; `get_linked_context({itemId})` returns the **full** body.
**When to use:** Lead turns only.
**Why:** D-27 explicitly requires full content, not metadata. The existing `get_item_details` already resolves task/CR/system with notes, worklogs and allocations (`aiTools.ts:2482-2600`) — reuse its resolution logic rather than writing a parallel path. For `note`/`document` items, return `note.body` whole (the same "entire document retained without truncation" precedent as the conventions segment, STATE.md D-12 of Phase 31).

### Pattern 8: Prompt assembly per agent (D-04, D-05, D-10)

`ChatTurnRequest` gives exactly two buckets: `systemMessages: {role:'system'}[]` and `history: {role:'user'|'assistant'}[]`, and the runtime appends `text` as the final user message (`chatTurnRuntime.ts:270-274`). Map the decisions onto them directly:

| Agent | `systemMessages` | `history` | `text` |
|-------|------------------|-----------|--------|
| Lead | lead persona + role + team operating rules + roster (`name`/`role`/capability description only) + linked-items index + write-authority note + language rule | recent N=10 transcript turns (mapped: lead/employee → `assistant`, user → `user`) | the user's message |
| Employee | persona + role + skill `description` + read-only policy + original user request + "other agents in this batch" results | own assignment history (instruction → `user`, own prior report → `assistant`), then recent N=10 window | the lead's instruction for this turn |

**Batch results for employees (D-05):** "results of the other agents in the same batch" cannot be in `history` — they do not exist when the turns start. Put them in the **system prompt** as a clearly delimited, untrusted-data-framed block, or (better) accept that D-03 says same-batch agents see each other's results only *after* the batch completes, i.e. on their **next** assignment. Recommend the latter: it is what D-03 actually says, and it avoids a batch-wide barrier before any agent can start.

**Recent-window construction:** `sanitizeHistoryTurns` (`contextCompaction.ts:205-259`) already drops orphaned and trailing user turns; feed it the last N transcript rows. Do not hand-roll the pairing.

### Pattern 9: Transcript attribution (D-07, D-09)

Extend, do not replace:
- `ChatMessage` gains `agentId?`, `agentName?`, `agentKind?: 'lead'|'employee'`, `messageKind?: 'instruction'|'report'|'synthesis'|'plan'`.
- `ChatTurnRequest` gains `agentId?`, `agentName?`, `agentKind?`, `messageKind?`, `persistUserMessage?: boolean`.
- `chatTurnRuntime` forwards those into the `saveMessage` call at `chatTurnRuntime.ts:456-466` and skips the user-message write at `:237-243` when `persistUserMessage === false`.
- `ChatMessageList` gains `agentDirectory?: Map<string, AgentIdentity>` and passes `agent` to `ChatMessageBubble` (`ChatMessageList.tsx:163-175`); `ChatMessageBubble` gains `agent?`, `agentStatus?`, `onStopAgent?` (`ChatMessageBubble.tsx:81-93`).
- `renderUserMessageWithMentions` (`ChatMessageBubble.tsx:122`) gains an `agent:` pill target for `@[Name](agent:{id})`.

**Streaming N bubbles:** `ChatMessageList` renders exactly one streaming bubble today (`ChatMessageList.tsx:191-203`). For N concurrent agents, the team workspace must render the live bubbles from the coordinator's per-agent state (a `transcriptExtensions` node) rather than from `ChatMessageList`'s single `streamingText` prop. Persisted rows render through the normal `messages.map`. On completion the coordinator's `onCompleted` triggers `useLiveQuery` to re-read, so the live bubble is replaced by the persisted one — no duplicate, provided the live bubble is keyed by `agentId` and removed on settle.

### Pattern 10: Background execution (D-22)

Register each agent turn in `aiTurnManager` with `id = team:<teamId>:agent:<agentId>` and the team run with `id = team:<teamId>`; `abort: () => registry.abort(agentId)` / `() => coordinator.abortAll()`. `ActiveAiTurnIndicator` already renders one capsule, a multi-turn dropdown with per-turn abort, and an "abort all" item (`ActiveAiTurnIndicator.tsx:1-259`) — no changes needed beyond the UI-SPEC's `TeamOutlined` icon and `Popconfirm` on global stop.

---

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---------|-------------|-------------|-----|
| Concurrent agent execution | A queue/scheduler | `Promise.allSettled` over N `runtime.start()` calls | Native, already gives per-agent settled/rejected results. |
| Per-agent runtime isolation | A new multi-turn runtime | `createChatTurnRuntime` × N | The runtime is already headless and single-turn by design; N instances is the supported shape. |
| Approval parking | New promise plumbing | Existing `approvalResolver` + `awaiting-approval` (`chatTurnRuntime.ts:374-403`) | Fixed guard order is pinned by tests (`tests/ai/chatTurnRuntime.test.ts:219-240`). |
| Mutation summary text | New diff/description code | `describeToolMutationWithContext` | Already used by both hosts. |
| Transcript search | A new index or embedding store | `rankBM25` + `tokenize` + `extractRelevantSnippet` | D-11 mandates it; already offline and Vietnamese-normalized (`bm25.ts:23-44`). |
| Excerpt extraction | Character slicing | `extractRelevantSnippet(body, query, maxChars)` | Handles headings, match density and truncation (`bm25.ts:143-213`). |
| Recent-window sanitization | Manual pairing | `sanitizeHistoryTurns` | Already drops orphaned/trailing user turns. |
| History pruning / context compaction | New truncator | `pruneToolOutputsInMessages` + `compactMessagesInLoop` (already wired in the loop) | Pass `contextWindowTokens` and the loop handles overflow. |
| UUIDs | `uuid` package | `crypto.randomUUID()` via `generateId()` (`src/utils/uuid.ts:5`) | Project rule. |
| Date math | New helpers | `dayjs` (already a dependency) | Project rule. |
| Validation of new rows | Ad-hoc checks | `zod` schemas in `src/validation/` | Project boundary standard. |
| Drawers / tables / progress / mentions | Custom components | antd 6 `Drawer`, `Table`, `Progress`, `Mentions`, `Segmented`, `Popconfirm`, `Alert` | UI-SPEC pins them. |
| Multi-agent framework | LangGraph / AutoGen / CrewAI | Nothing — the loop already exists | Wrong runtime (server-side graphs), adds a dependency, and the phase's orchestration is ~300 lines. |

**Key insight:** every "orchestration" primitive this phase needs (turn execution, tool loop, usage reporting, approval parking, background status, offline search, BM25 excerpts) is already implemented and tested. The phase's real work is **wiring and persistence**, not algorithms. Any plan task that writes a new loop, a new search index, or a new approval mechanism is a red flag.

---

## Common Pitfalls

### Pitfall 1: `TURN_IN_PROGRESS` from a shared runtime
**What goes wrong:** The coordinator creates one runtime and calls `start()` three times for a batch; the 2nd and 3rd throw and those agents silently never run.
**Why it happens:** `start()` guards on a single `running` flag (`chatTurnRuntime.ts:199`).
**How to avoid:** One runtime per `agentId` via the registry (Pattern 1). Assert it in a test: three concurrent `start()` calls on three registry entries all reach `phase:'complete'`.
**Warning signs:** a batch of 3 returns 1 report; console shows `TURN_IN_PROGRESS`.

### Pitfall 2: Fake user bubbles in the shared transcript
**What goes wrong:** Every employee turn writes a `role:'user'` row with the lead's instruction (`chatTurnRuntime.ts:237-243`), so the shared channel shows three right-aligned accent bubbles that look like the human typed the lead's instructions.
**Why it happens:** the runtime always persists the request text as a user message.
**How to avoid:** `persistUserMessage: false` on employee (and lead) turns; the coordinator persists the instruction itself as an `assistant` row with `messageKind:'instruction'` + `agentKind:'lead'`.
**Warning signs:** duplicate instructions in the transcript; user bubbles containing text the user never typed.

### Pitfall 3: Employee mutation via a hallucinated tool name
**What goes wrong:** An employee with a read-only payload hallucinates `update_task`; `isMutationTool` matches, `onMutationCheck` parks a card, the user approves, and an employee writes to the DB — violating D-12.
**Why it happens:** withholding tools is a payload decision; `onMutationCheck` is a separate gate that only knows the tool name.
**How to avoid:** `mutationPolicy: 'read-only'` refuses before the approval branch (Pattern 3). Test: an employee turn whose scripted loop calls `onMutationCheck('update_task')` must return `proceed:false` and must never publish `awaiting-approval`.
**Warning signs:** an approval card appearing during a batch with no lead turn running.

### Pitfall 4: Unregistered team tools fall through to MCP
**What goes wrong:** `delegate_batch` / `search_team_history` / `read_team_turn` / `read_skill` / `list_linked_items` / `get_linked_context` are advertised in the payload but not handled; `dispatchAiToolCall` finds no local match and calls `executeDynamicMcpTool`, which throws `Máy chủ MCP … không cung cấp công cụ …` (`mcpClient.ts:524`).
**Why it happens:** `dispatchAiToolCall` routes on membership in `AI_DATABASE_TOOLS` (`aiOrchestratorLoop.ts:32-38`), and `executeAiTool`'s `default:` returns `Unknown tool` (`aiTools.ts:4744-4745`).
**How to avoid:** register each tool in `AI_DATABASE_TOOLS` **and** add a `case` in `executeAiTool` (or intercept in `executeToolFn` for `delegate_batch`). Test: every advertised team tool name resolves to a handler.
**Warning signs:** MCP errors mentioning a team tool name.

### Pitfall 5: New tables silently missing from backup
**What goes wrong:** Employees/teams/skills/links persist locally but vanish on export→import, or a restore wipes them.
**Why it happens:** backup is a 5-file contract — `exportBackup.ts` (tables + counts), `types/backup.ts` (`BackupTableData`), `validation/backupSchemas.ts` (record schemas), `validateBackup.ts` (`validateTable` calls + referential checks), `restoreBackup.ts` (`RESTORE_TABLES`, clear list, `add` list, `captureSnapshot`). Missing any one is silent.
**How to avoid:** add all five. **Do not bump `CURRENT_SCHEMA_VERSION`** (`exportBackup.ts:7`) — `validateBackup.ts:90-95` rejects any `schemaVersion < CURRENT`, which would invalidate the user's existing backups. Add the new tables as **optional-absent** (the existing `rawTables.X !== undefined ? validate : undefined` pattern) and mirror `clearKnowledge`'s "absent means the payload predates them" rule (`restoreBackup.ts:230-234`).
**Warning signs:** `tests/services/backup/v2Compatibility.test.ts:24` failing (it asserts `CURRENT_SCHEMA_VERSION === 11`); imported team list empty.

### Pitfall 6: New `ChatMessage` fields stripped on restore
**What goes wrong:** `agentId` survives export but is gone after import, so every restored message renders unattributed.
**Why it happens:** `BackupChatMessageRecordSchema` is a plain `z.object` (`backupSchemas.ts:298`), not `.passthrough()` — unknown keys are **stripped** by `safeParse`, and `validateBackup` returns the parsed data.
**How to avoid:** add explicit optional fields (`agentId`, `agentName`, `agentKind`, `messageKind`) to the schema. Test: export a tagged message, validate, assert the tags survive.
**Warning signs:** attribution present before a restore and absent after.

### Pitfall 7: Batch resolves while an agent is budget-paused
**What goes wrong:** The paused agent's context is discarded and the lead synthesizes an incomplete answer as if final.
**Why it happens:** resolving the batch on "all currently-settled" instead of "all terminal".
**How to avoid:** a paused agent is non-terminal; the batch awaits the gate. Only `complete` / `stopped` / `error` settle an entry (Pattern 2).
**Warning signs:** lead synthesis appears while the paused banner is still shown.

### Pitfall 8: Stop while parked leaves the turn hung
**What goes wrong:** The user hits Stop on a paused agent; `abort()` fires but the round-boundary await never resolves, so the runtime never publishes `aborted` and the capsule stays forever.
**Why it happens:** a bare `await gate.wait()` has no abort path.
**How to avoid:** race the gate against the turn's `AbortSignal` and `signal.throwIfAborted()` after it (Pattern 5). Test: pause → abort → `getStatus() === 'aborted'`.
**Warning signs:** a stuck `ActiveAiTurn` capsule; `isRunning()` true with no streaming.

### Pitfall 9: Unbounded assignment history
**What goes wrong:** D-05 wants *every* instruction ever given; after 200 assignments the employee's `history` is larger than the recent window and the turn cost climbs monotonically.
**Why it happens:** the requirement is literally unbounded.
**How to avoid:** include assignment history newest-first up to a cap (recommend 50 instruction/report pairs) and note in the prompt that older work is retrievable via `search_team_history`. Flag for user confirmation (see Open Questions).
**Warning signs:** prompt token counts growing turn over turn for the same agent.

### Pitfall 10: `delegate_batch` recursion
**What goes wrong:** An employee somehow receives `delegate_batch` and spawns its own batch.
**Why it happens:** a shared tool-payload builder.
**How to avoid:** `delegate_batch` is in the **lead allowlist only**; the employee allowlist is an explicit read-only set. Assert in a test that the employee payload contains no `delegate_batch`.
**Warning signs:** nested team runs; token usage exploding in one batch.

### Pitfall 11: `aiTurnManager` id collision with drawer tabs
**What goes wrong:** A team run registers under an id that a drawer tab also uses, so the indicator shows one and aborts the other.
**Why it happens:** `aiTurnManager` is a flat `Map<string, ActiveAiTurn>` (`aiTurnManager.ts:31`).
**How to avoid:** namespace team ids (`team:<teamId>` and `team:<teamId>:agent:<agentId>`). Never reuse a `scopeKey` as a turn id for a team.
**Warning signs:** aborting a team run kills a chat tab's turn.

### Pitfall 12: `@mention` parsing collides with entity mentions
**What goes wrong:** `@[Name](agent:id)` is rendered as plain text or mis-parsed as an entity pill.
**Why it happens:** `renderUserMessageWithMentions` (`ChatMessageBubble.tsx:122`) knows task/CR/system targets only.
**How to avoid:** extend the parser with an `agent:` target and keep the existing entity syntax untouched; add a rendering test for both forms in one message.

---

## Code Examples

### Token accounting: the minimal accumulation point

```typescript
// Source: aiOrchestratorLoop.ts:291-300 (per-round) and chatTurnRuntime.ts:316-322 (per-turn)
// The loop already sums every round's usage into `accumulatedTokenUsage` and calls onUsage.
// The runtime already re-sums into `tokenUsage` and returns it on result.tokenUsage.
// MISSING: a way to observe usage on turns that never reach onCompleted (aborted/stopped).
// Minimal fix — one optional dep, forwarded from the loop's onUsage:
export interface ChatTurnRuntimeDeps {
  // …existing…
  onUsage?: (usage: ChatTokenUsage) => void;
}

// inside start(), alongside the existing onUsage handler:
onUsage: (usage) => {
  tokenUsage = { /* existing accumulation, unchanged */ };
  deps.onUsage?.(tokenUsage);   // cumulative, so the coordinator never re-sums
},
```

Normalize before comparing to a budget: `total = usage.totalTokens ?? (usage.promptTokens ?? 0) + (usage.completionTokens ?? 0)` — some providers omit `total_tokens`.

### `search_team_history` over the transcript

```typescript
// Source: bm25.ts:52-136 (rankBM25), bm25.ts:143-213 (extractRelevantSnippet),
//         aiTools.ts:4490-4520 (existing BM25 tool usage), telegramHeadlessWorker.ts:320-345
import { rankBM25, extractRelevantSnippet, type BM25Document } from '../../../utils/bm25';

const rows = await db.chatMessages.where('threadId').equals(teamThreadId).toArray(); // indexed
const docs: BM25Document[] = rows.map((m) => ({
  id: m.id,
  title: m.agentName ?? (m.role === 'user' ? 'Người dùng' : 'Trợ lý'),
  tags: [m.messageKind ?? m.role],
  body: m.content,
  updatedAt: m.createdAt,
}));

const hits = rankBM25(query, docs, { limit: Math.min(limit ?? 8, 20) });
return JSON.stringify(hits.map((h) => ({
  turnId: h.doc.id,
  agent: h.doc.title,
  timestamp: h.doc.updatedAt,
  kind: h.doc.tags[0],
  excerpt: extractRelevantSnippet(h.doc.body, query, 400),
})));
```

`read_team_turn({turnId})` = `db.chatMessages.get(turnId)` + a threadId check (never read another team's row).

**Memory ceiling:** `rankBM25` tokenizes every document on every call — O(total transcript characters). For a personal team transcript this is fine; note it with a `ponytail:` comment and, if it ever bites, cap the candidate set to the last 2 000 rows before ranking.

### Budget gate wiring at the round boundary

```typescript
// Source: aiOrchestratorLoop.ts:220 (loop head) and :467 (round end)
const beforeToolRound = async () => {
  if (agentGate.isClosed()) await agentGate.wait(signal);
  if (teamGate.isClosed()) await teamGate.wait(signal);
  signal?.throwIfAborted();
  const agentBucket = bucketOf(agentUsed, agentBudget);
  if (agentBucket >= 8 && lastAgentBucket < 8) coordinator.notifyAgentPaused(agentId);
  lastAgentBucket = agentBucket;
};
```

### Dexie `version(17)` — additive only

```typescript
// Source: db/schema.ts:112-117 (V16 shape), db/index.ts:316-473 (hook pattern)
export const SCHEMA_V17 = {
  ...SCHEMA_V16,
  aiEmployees: 'id, name, skillId, model, createdAt',
  aiLeads: 'id, name, model, createdAt',
  aiSkills: 'id, name, createdAt',
  aiTeams: 'id, name, leadId, status, createdAt',
  aiTeamMembers: 'id, teamId, agentId, role',
  aiTeamLinks: 'id, teamId, itemType, itemId',
} as const;

// src/db/index.ts
this.version(17).stores(SCHEMA_V17);   // no .upgrade(): purely additive, no backfill
```

**Do not** add an index to the existing `chatMessages` store (`SCHEMA_V16.chatMessages = 'id, threadId, role, createdAt'`). Changing an existing store's index spec forces Dexie to rebuild that index over the whole table on upgrade. `where('threadId').equals(...)` is already indexed; filter `agentId` / `messageKind` in JS.

**Tauri local SQLite mirror:** `SQLITE_DOMAIN_TABLES` (`localSqlitePersistence.ts:14-27`) and Rust `ALLOWED_TABLES` (`src-tauri/src/sqlite_persistence.rs:6-20`) are hardcoded allowlists. Unlisted tables are silently skipped by `enqueueLocalSqliteChange` (`:156`) — data still lives in IndexedDB (canonical), but the mirror is incomplete. Add the new tables to both lists (one line each) or accept IndexedDB-only; the Rust change requires a Tauri rebuild. Recommend adding, and note that the mirror is a mirror.

### Workbench wiring

```typescript
// Source: layoutStore.ts:6-21, EditorArea.tsx:496-520, WorkbenchLayout.tsx:174-197
// 1. layoutStore: add 'teams' to EditorViewType.
// 2. EditorArea.renderViewContent: case 'teams': return <TeamsView {...dbProp} />;
//    case 'agents': return <AiOfficeView />;   // new shell, Ghost Dev behind a Segmented
// 3. EditorArea.getEditorTabIcon: case 'teams': return <JetBrainsAgentsIcon size={size} />;
// 4. WorkbenchLayout.handleOpenView titles: teams: 'AI Office — Nhóm'
// 5. TitleBar: "AI Office" button (<TeamOutlined size={14}/>) right after "Ghost Dev".
```

---

## State of the Art

| Old approach | Current approach | When changed | Impact |
|--------------|------------------|--------------|--------|
| Single agent with a long tool loop | Orchestrator–worker with parallel subagents | 2025 (Anthropic multi-agent research write-up) | Parallel subagents cut wall-clock dramatically but cost ~15× the tokens of a single chat turn; the lead must persist its plan to external memory because a long run can blow the context window. Both facts validate D-10 (externalized memory) and D-19 (token budgets) as necessary, not optional. `[CITED: anthropic.com/engineering/multi-agent-research-system]` |
| Peer-to-peer agent chatter | Lead-mediated delegation with a synchronous batch barrier | 2025–2026 | Uncontrolled recursion ("spawning 50 subagents for simple queries") and unreliable token attribution are the documented failure modes; D-03's rejection of `ask_colleague` matches the literature. `[CITED: anthropic.com/engineering/multi-agent-research-system]` |
| Pasting a whole skill into the system prompt | Progressive disclosure (`description` up front, `body` on demand) | 2025 (Claude Code custom skills) | D-24. The body is the largest avoidable per-turn cost. `[ASSUMED]` |
| Semantic/embedding transcript search | Lexical BM25 over the transcript | this phase | D-11: embeddings would make the optional Docker Knowledge Server mandatory, breaking offline-first. `[VERIFIED: src/utils/bm25.ts + CONTEXT.md D-11]` |

**Deprecated/outdated in this codebase (do not reintroduce):**
- A hard Analysis-Mode block on mutation tools — removed this session; approval parking is the gate (`chatTurnTools.ts:26-31` comment).
- `projects` / `milestones` tables — dropped in V16; do not reference them in new team-link types (D-26 lists CR, not project).
- Global `localStorage` fallbacks for auto-approve — per-tab/per-team config only (`AIChatDrawer.tsx:1491-1493` comment).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A paused agent's batch must stay pending (not resolve) so its context survives | Pattern 2, Pitfall 7 | If the user actually wants the lead to continue with a partial marker, the coordinator needs a second resolution path and the UI needs a "resume later" queue. Confirm with the user. |
| A2 | Assignment history should be capped (~50 pairs) with older work reachable via search | Pitfall 9, Open Q1 | Uncapped history grows cost monotonically and contradicts the spirit of D-10. Confirm the cap. |
| A3 | Same-batch agents see each other's results on their **next** assignment, not during the current one | Pattern 8 | D-03 says "only after the batch completes"; if the intent was "in the next batch's system prompt", that is what is described. If the intent was a mid-batch barrier, the batch model changes materially. |
| A4 | Backup envelope stays at v11 with new tables optional-absent | Pitfall 5 | If the user prefers a clean break, bump to 12 and accept that all existing backups are rejected. |
| A5 | New tables should also be mirrored to local SQLite (TS + Rust allowlists) | Dexie Migration | If skipped, the mirror is incomplete but IndexedDB remains canonical; no data loss. |
| A6 | Employee prompt gets the original user request verbatim | Pattern 8 | Grows every employee turn's prompt; alternative is a lead-written summary of the request. D-05 says "the original user request", so verbatim is the literal reading. |
| A7 | `TeamRunPhase` should be a new union rather than extending `ChatTurnStatus` | Pattern 4 | Extending would ripple through 5 consumers and `AiChatWidget`'s stage machine. Low risk, but the planner should not silently extend `ChatTurnStatus`. |

**If this table is non-empty:** A1, A2, A3 and A4 are worth one confirmation pass in discuss-phase before they become locked plan decisions.

---

## Open Questions

1. **Assignment-history cap**
   - What we know: D-05 says "every instruction ever given to it"; D-10 says the transcript is external memory and older content is searched.
   - What's unclear: whether "every" is literal or means "not truncated by the recent-window rule".
   - Recommendation: cap at the 50 most recent instruction/report pairs, state in the employee prompt that older work is retrievable via `search_team_history`, and record the cap as a constant the user can raise.

2. **Batch resolution under a pause**
   - What we know: D-21 says the run "stays in a waiting state rather than appearing hung".
   - What's unclear: whether the lead's `delegate_batch` tool call should remain pending (context preserved) or resolve with a paused marker (lead continues).
   - Recommendation: remain pending. Resolving discards the paused agent's loop state, which contradicts "resuming continues exactly where it stopped".

3. **Team thread scope type**
   - What we know: `ChatScopeType` is `'global'|'task'|'cr'|'system'|'document'` (`models.ts:223`) and `BackupChatThreadRecordSchema.scopeType` is a strict enum (`backupSchemas.ts:181`).
   - What's unclear: whether to add `'team'` to both (5 touch points: `models.ts`, backup enum, `threadScopeParts` whitelist `chatTabRepo.ts:31-39`, `ScopePickerModal.tsx:30`, `AIPopoutView.tsx:33`) or to store the team thread as `scopeType:'global'` with a `team:` scopeKey.
   - Recommendation: add `'team'`. The `global` alias would make the drawer's scope picker and `createOrGetThread` treat team threads as the shared global conversation.

4. **Where per-agent budgets live**
   - What we know: D-19 wants an even split that the user can edit per row, and budgets accumulate for the team's life.
   - What's unclear: array on the team row vs a member table.
   - Recommendation: `aiTeamMembers` table (`id, teamId, agentId, role, budgetTokens, usedTokens`). It is indexed by `teamId`, survives roster edits, and makes "used" a single-row update instead of a read-modify-write of a JSON array under concurrency (three agents finishing at once).

5. **`delegate_batch` tool schema shape**
   - What we know: D-02 fixes `delegate_batch([{ agentId, instruction }, ...])`.
   - What's unclear: whether the plan card needs a `skill` and `task` field per row (D-06 says "which agent, which skill, which task").
   - Recommendation: `{ assignments: [{ agentId, skillId?, task }] }` — `skillId` is informational (the agent's assigned skill is authoritative per D-25), `task` is the instruction text. Validate `agentId ∈ team roster` and `assignments.length ≤ 3` server-side (in the handler) and return a structured refusal otherwise, mirroring the artifact tools' `{refused:true, code, message}` shape.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build/test | ✓ | 24.16.0 | — |
| npm | Install/scripts | ✓ | 11.13.0 | — |
| TypeScript | `npm run build` | ✓ | 7.0.2 | — |
| Vitest | Tests | ✓ | 5.0.2 (installed) | — |
| Cargo / Tauri CLI | Only if the SQLite mirror allowlist changes | ✓ | cargo 1.98.1; `src-tauri/tauri.conf.json` present | Skip the Rust change; IndexedDB stays canonical |
| Knowledge Server (Docker) | **Not required** | — | — | Correct by design: D-11 mandates BM25, not embeddings |
| Network / provider endpoint | Live AI turns only | user-configured | — | All tests inject `runLoop`/`streamChatEvents`; no network in CI |

**Missing dependencies with no fallback:** none.

**Missing dependencies with fallback:** none. The phase is offline-complete by construction.

---

## Validation Architecture

`workflow.nyquist_validation` is `true` in `.planning/config.json` → this section is required.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.2 (jsdom, `globals: true`, `fileParallelism: false`, `testTimeout: 15000`) |
| Config file | `vite.config.ts` → `test:` block (lines 65-80); setup `tests/setup.ts` (fake-indexeddb + jest-dom + Blob/ResizeObserver shims) |
| Quick run command | `npx vitest run tests/services/ai/office tests/ai/chatTurnRuntime.test.ts` |
| Full suite command | **Do not run the whole suite** (memory: >1 hour). Always pass scoped paths. |

### Phase Requirements → Test Map

| Req ID | Behavior | Test type | Automated command | File exists? |
|--------|----------|-----------|-------------------|--------------|
| AIOFF-01 | `version(17)` adds the six tables; V16 data survives | migration | `npx vitest run tests/db/schemaV17Migration.test.ts` | ❌ Wave 0 |
| AIOFF-02 | Lead-only dispatch; no round-robin path exists | unit | `npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts` | ❌ Wave 0 |
| AIOFF-03 | 3 concurrent employee turns all complete; batch waits for all | unit | same file (`Promise.allSettled` + fake runLoop) | ❌ Wave 0 |
| AIOFF-04 | Plan card parks; approve runs the batch; bypass skips the card | unit | same file | ❌ Wave 0 |
| AIOFF-05 | Messages persist with `agentId`/`messageKind`; no fake user rows | unit + component | `npx vitest run tests/ai/chatTurnRuntime.test.ts tests/ai/ChatMessageListAttribution.test.tsx` | ⚠️ runtime file exists; attribution test ❌ |
| AIOFF-06 | Employee turn refuses `update_task` without parking; lead still parks | unit | `npx vitest run tests/ai/chatTurnRuntime.test.ts` (extend) | ✅ file exists |
| AIOFF-07 | BM25 hits return turnId/agent/excerpt; `read_team_turn` is team-scoped | unit | `npx vitest run tests/services/ai/office/teamTools.test.ts` | ❌ Wave 0 |
| AIOFF-08 | 80% pauses at the round boundary; in-flight tool completes; resume continues; stop while parked aborts | unit | `npx vitest run tests/services/ai/aiOrchestratorLoop.test.ts tests/services/ai/office/budgetGate.test.ts` | ✅ loop file exists; gate ❌ |
| AIOFF-09 | 4th activation rejected; roster >3 rejected; reactivation keeps the transcript | unit | `npx vitest run tests/services/ai/office/aiTeamRepo.test.ts` | ❌ Wave 0 |
| AIOFF-10 | Only `description` enters the prompt; `read_skill` returns the body | unit | `npx vitest run tests/services/ai/office/teamPrompts.test.ts` | ❌ Wave 0 |
| AIOFF-11 | `get_linked_context` returns full note/document body, not metadata | unit | `npx vitest run tests/services/ai/office/teamTools.test.ts` | ❌ Wave 0 |
| AIOFF-12 | `'teams'` routes to `TeamsView`; `'agents'` shell defaults to Văn phòng AI | component | `npx vitest run tests/views/TeamsView.test.tsx tests/views/AiOfficeView.test.tsx` | ❌ Wave 0 |
| AIOFF-13 | Export → validate → restore round-trips the new tables **and** message attribution; v11 payload without them still restores | integration | `npx vitest run tests/services/backup/officeBackup.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** the single scoped file(s) the task touched, e.g. `npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts`
- **Per wave merge:** `npx vitest run tests/services/ai/office tests/ai tests/db tests/services/backup tests/views`
- **Phase gate:** the wave-merge set green, plus `npx tsc --noEmit`

### Wave 0 Gaps
- [ ] `tests/services/ai/office/teamRunCoordinator.test.ts` — AIOFF-02/03/04/05 (fake `runLoop` per agent, like `tests/ai/chatTurnRuntime.test.ts:36-60`)
- [ ] `tests/services/ai/office/budgetGate.test.ts` — AIOFF-08 (gate open/close/crossing/abort)
- [ ] `tests/services/ai/office/teamTools.test.ts` — AIOFF-07/11
- [ ] `tests/services/ai/office/aiTeamRepo.test.ts` — AIOFF-09
- [ ] `tests/services/ai/office/teamPrompts.test.ts` — AIOFF-10
- [ ] `tests/db/schemaV17Migration.test.ts` — AIOFF-01 (pattern: `tests/db/schemaV16Migration.test.ts:1-40`)
- [ ] `tests/services/backup/officeBackup.test.ts` — AIOFF-13
- [ ] `tests/ai/ChatMessageListAttribution.test.tsx` — AIOFF-05
- [ ] `tests/views/TeamsView.test.tsx`, `tests/views/AiOfficeView.test.tsx` — AIOFF-12
- [ ] Extend `tests/ai/chatTurnRuntime.test.ts` — AIOFF-05/06 (`persistUserMessage:false`, `mutationPolicy:'read-only'`, `onUsage`)
- [ ] Extend `tests/services/ai/aiOrchestratorLoop.test.ts` — `beforeToolRound` ordering + abort
- [ ] **Update** `tests/db.test.ts:20-45` — the exact-table-list assertion will fail when six tables are added
- [ ] No framework install needed.

---

## Security Domain

`security_enforcement: true`, `security_asvs_level: 1`.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard control |
|---------------|---------|-----------------|
| V2 Authentication | no | No accounts; single local user. |
| V3 Session Management | no | No sessions. |
| V4 Access Control | **yes** | Lead-only writes enforced at three layers: employee tool payload, `mutationPolicy:'read-only'` refusal, and `allowMutation` never set (`mcpClient.ts:527-529`). Team-scoped tool reads must verify `threadId`/`teamId` before returning a row. |
| V5 Input Validation | **yes** | `zod` schemas for `AiEmployee`/`AiLead`/`AiSkill`/`AiTeam`/`AiTeamMember`/`AiTeamLink` at the repo boundary and in backup schemas; `delegate_batch` validates `agentId ∈ roster` and `length ≤ 3`; `get_linked_context` validates `itemId ∈ team links`. |
| V6 Cryptography | no | No new crypto. Do not add any. |
| V7 Error handling & logging | **yes** | Reuse `SANITIZED_TURN_ERROR` (`chatTurnRuntime.ts:134`) for provider failures; never surface raw provider text in the transcript. |
| V12 Files & resources | **yes** | `read_file` is reachable by employees; it is already in the read-only set. No new path surface. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard mitigation |
|---------|--------|---------------------|
| Prompt injection via skill `body`, linked note/document content, or transcript rows | Tampering / Elevation | Frame all retrieved content as untrusted data in a delimited segment (precedent: the Phase 31 conventions segment, STATE.md D-09/D-11). Never let retrieved text redefine the read-only policy or the write-authority rule. |
| Employee escalation via a hallucinated mutation tool name | Elevation of privilege | `mutationPolicy:'read-only'` refuses before the approval branch (Pattern 3). |
| Approval fatigue → blanket auto-approve | Repudiation | Auto-approve is a per-team stored flag (D-13), never a global `localStorage` default (`AIChatDrawer.tsx:1491-1493` precedent). |
| Budget bypass by spawning nested batches | Denial of service (cost) | `delegate_batch` is lead-only; employee payloads are explicit read-only allowlists; token accumulation is per-agent and persisted. |
| Cross-team transcript read via `read_team_turn` / `search_team_history` | Information disclosure | Both tools take the team id from the **request-bound context**, never from model arguments (precedent: `artifactContext` is trusted and request-bound, `chatTurnRuntime.ts:74-75`). |
| Secrets leaking into new backup tables | Information disclosure | No secret-bearing fields on the new rows. Avoid field names matching `FORBIDDEN_BACKUP_KEYS` (`backupSchemas.ts:202-208`) — use `persona`, not `systemPrompt`. |
| Unbounded token spend from a runaway lead | Denial of service (cost) | Team budget is mandatory at creation (D-19, no default), and the 80% gate parks the run. |

---

## Sources

### Primary (HIGH confidence — read in this session)
- `src/components/ai/runtime/chatTurnRuntime.ts` — `ChatTurnStatus`, `ChatTurnRequest`, `ChatTurnRuntimeDeps`, `start()` guard, approval park, usage accumulation, `saveMessage` call sites.
- `src/components/ai/runtime/useChatTurn.ts` — module-level background registry, `stageLabelFor`.
- `src/components/ai/runtime/tabRuntimes.ts` — per-key runtime registry shape.
- `src/services/ai/aiTurnManager.ts` — flat turn map, `ACTIVE_AI_STATUSES`, `finishTurn` purge.
- `src/services/ai/aiOrchestratorLoop.ts` — loop head, round end, `executeToolFn`, `onUsage`, `onMutationCheck` call site, compaction.
- `src/services/ai/chatTurnTools.ts` — `getToolsForTurn` allowlist semantics.
- `src/services/ai/aiTools.ts` — `AI_DATABASE_TOOLS`, `MUTATION_TOOLS`, `executeAiTool` default branch, `get_item_details`, `read_file`, BM25 knowledge tool.
- `src/services/ai/mcpClient.ts` — `allowMutation` fail-closed gate.
- `src/components/ai/AiChatWidget.tsx`, `ChatMessageList.tsx`, `ChatMessageBubble.tsx`, `ChatInputBar.tsx`, `ActiveAiTurnIndicator.tsx`, `widget/MutationApprovalCard.tsx`.
- `src/db/schema.ts`, `src/db/index.ts`, `src/db/repositories/chatRepo.ts`, `chatTabRepo.ts`.
- `src/types/models.ts`, `src/types/backup.ts`.
- `src/utils/bm25.ts`, `src/services/ai/contextCompaction.ts`.
- `src/services/backup/exportBackup.ts`, `validateBackup.ts`, `restoreBackup.ts`, `src/validation/backupSchemas.ts`.
- `src/services/localSqlitePersistence.ts`, `src-tauri/src/sqlite_persistence.rs`.
- `src/workbench/store/layoutStore.ts`, `src/workbench/EditorArea.tsx`, `src/workbench/WorkbenchLayout.tsx`, `src/workbench/TitleBar.tsx`.
- `.planning/phases/34-.../34-CONTEXT.md`, `34-DISCUSSION-LOG.md`, `34-UI-SPEC.md`.
- `tests/ai/chatTurnRuntime.test.ts`, `tests/ai/tabTurnRegistry.test.ts`, `tests/ai/useChatTurn.test.tsx`, `tests/ai/aiTurnManager.test.ts`, `tests/services/ai/aiOrchestratorLoop.test.ts`, `tests/db/schemaV16Migration.test.ts`, `tests/services/backup/v2Compatibility.test.ts`, `tests/db.test.ts`.

### Secondary (MEDIUM confidence)
- Anthropic engineering, "How we built our multi-agent research system" — orchestrator–worker decomposition, 3–5 parallel subagents, ~15× token cost vs. single chat, context-bloat and unbounded-recursion failure modes. `[CITED: anthropic.com/engineering/multi-agent-research-system]`

### Tertiary (LOW confidence — flagged for validation)
- Claude Code custom-skill progressive disclosure (`name` + `description` + `body`, body loaded on demand) as the model for D-23/D-24. `[ASSUMED]` — the shape matches D-23/D-24 verbatim, but no doc was fetched this session.

---

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — zero new packages; every version read from `node_modules` in this session.
- Architecture: **HIGH** — every seam was read directly (runtime, loop, registry, approval park, usage, BM25, backup chain). The four structural blockers (Pitfall 1-4) are each backed by a specific line.
- Pitfalls: **HIGH** for codebase-specific ones (1-6, 8, 10-12); **MEDIUM** for the multi-agent heuristics (7, 9) which rest on one cited engineering write-up plus D-10/D-19 reasoning.
- Multi-agent prior art: **MEDIUM** — one authoritative source; the phase's own decisions already align with it.

**Research date:** 2026-11-08
**Valid until:** 2026-12-08 (stable — the runtime, loop and backup chain change slowly; re-check if `chatTurnRuntime.ts` or `aiOrchestratorLoop.ts` is modified before planning).

---

## Project Constraints (from CLAUDE.md)

Directives the planner must verify in every plan:

1. **Tauri is the only supported runtime.** Do not propose PWA, service-worker, GitHub Pages or `base: '/task-management/'` work. Do not debug PWA behavior.
2. **Offline-first, no application server.** Team runs, transcript search, and memory must all work with the Knowledge Server stopped and the network absent. BM25 only — no embeddings, no network search.
3. **IndexedDB (Dexie) is the canonical store.** New entities go in Dexie. `localStorage` is only for ephemeral layout/UI state (`layoutStore`), never for domain data or approval flags.
4. **Dexie migrations are additive.** `this.version(17).stores(SCHEMA_V17)` with no destructive changes; do not alter existing store index specs.
5. **Stable client-generated UUIDs** via `crypto.randomUUID()` (`generateId()`); no `uuid` package.
6. **Ant Design 6** for all UI; inline `style` + `theme.useToken()`; no new CSS file, no CSS-in-JS library, no Tailwind/shadcn. Follow `34-UI-SPEC.md` exactly (spacing, typography 400/600 only, accent reserved list, `data-testid` names).
7. **No new dependency** unless a few lines of stdlib/native cannot do it. This phase needs none.
8. **Data safety:** backup import must validate and must not replace good local data without confirmation; new tables must round-trip through export/validate/restore.
9. **Never store secrets in source, config, or the bundle.** No token/passphrase fields on any new row.
10. **Anti-read-loop rule:** read a file once with a wide range (100–300+ lines) and act immediately; never re-read the same small window.
11. **Test scope:** never run the full Vitest suite (>1 hour). Always pass scoped paths.
12. **GSD workflow enforcement:** all edits go through a GSD command (`/gsd-execute-phase`), not ad-hoc edits.
