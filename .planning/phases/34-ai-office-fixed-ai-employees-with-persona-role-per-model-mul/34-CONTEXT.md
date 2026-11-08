# Phase 34: AI Office — AI Employees, Teams, and Skills - Context

**Gathered:** 2026-11-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver an in-app **AI Office**: reusable AI employees (name, role, persona, per-agent model, one assigned skill), a separate lead entity, and fixed teams that a user activates to accomplish work. A team run is led by a lead agent that decomposes the user's request, proposes an assignment plan (agent + skill + task) for user confirmation, then dispatches **parallel batches** of employee turns. Employees work read-only and report summaries back to the lead; only the lead may mutate the database, and every lead mutation still parks on the existing approval card. The team transcript is the shared memory: agents do not carry the whole conversation in context — they see a recent window plus their own full assignment history, and retrieve older turns through BM25 search tools.

Also in scope: a **skill manager** (SKILL.md-style prompt templates with progressive disclosure, one skill per agent), **team-to-item links** (CR / task / system / note / document) with lead-side retrieval tools, per-team and per-agent **token budgets** with 80% pause-and-notify, and two new workbench surfaces (employee tab, team page).

</domain>

<decisions>
## Implementation Decisions

### Team Coordination
- **D-01 (Lead orchestrates):** The user selects one lead per team. The lead decomposes the request and dispatches work. Employees never choose the next speaker; there is no round-robin.
- **D-02 (Parallel batches):** The lead calls a single `delegate_batch([{ agentId, instruction }, ...])` tool. Agents in the batch run **concurrently** (true independence), and the lead waits for the whole batch before synthesizing. Cap concurrent agents per batch at 3.
- **D-03 (No peer-to-peer):** Employees cannot talk to each other directly. There is no `ask_colleague`. An employee that needs a colleague's result states the question in its report to the lead; the lead decides whether to dispatch a follow-up batch. Agents in the same batch see each other's results only after the batch completes.
- **D-04 (Lead context):** The lead sees the original user request, the employee roster (name + role + capability description, never their full system prompt), the summarized results of prior batches, every mutation it performed, plus the recent-window memory described in D-10. It never sees an employee's internal tool trace.
- **D-05 (Employee context):** Each employee sees its own system prompt (persona + role + assigned skill description), the lead's instruction for the current turn, the original user request, the results of the other agents in the same batch, its **full assignment history from this lead** (every instruction ever given to it), plus the recent-window memory in D-10.
- **D-06 (Assignment confirmation):** Before dispatching a batch, the lead emits an assignment plan (which agent, which skill, which task) rendered as a confirmation card. The user approves, and only then does the batch run. A per-team **bypass toggle** ("Tự động chia việc") skips the card and dispatches immediately.

### Transcript and Memory
- **D-07 (Single shared transcript):** One transcript per team, with every message tagged by `agentId` (or lead/user). The user reads it as one continuous channel. Reuse `ChatMessageList` with added avatar and agent name.
- **D-08 (@mention addressing):** The user addresses any agent directly with `@agent` in the team composer. Without a mention, the message goes to the lead.
- **D-09 (Live streaming):** Agents currently running stream their text into the shared transcript as their own bubble, with a status badge. Reuse `aiTurnManager` and `useChatTurn({ background: true })`.
- **D-10 (Externalized memory):** The transcript is the team's external memory, not per-agent context. Default context window is the **recent N turns** (N = 10) plus the agent's own full assignment history. Everything older is retrieved on demand — mirroring how a person remembers roughly and searches the group chat for details.
- **D-11 (Search tools):** Two BM25-backed tools over the team transcript, using the existing `src/utils/bm25.ts`:
  - `search_team_history({ query, limit? })` returns compact hits (turn id, agent, timestamp, kind, excerpt).
  - `read_team_turn({ turnId })` returns the full text of one turn.
  Search never depends on the Knowledge Server or any network — offline-first is preserved.

### Write Authority and Approval
- **D-12 (Lead-only writes):** Employee agents are strictly read-only (all read-only DB tools, knowledge retrieval, file reads). Only the lead may mutate the database.
- **D-13 (Per-mutation approval):** Every lead mutation parks on the existing `MutationApprovalCard` for explicit approve/reject. The team's auto-approve toggle still wins when enabled — matching the Analysis Mode change shipped in this same session.
- **D-14 (Two stop controls):** Each running agent's bubble has its own Stop button; a stopped agent returns a summary to the lead explicitly marked as **incomplete / stopped mid-work**. A global Stop on the status bar aborts the entire team run (lead + every running agent).

### Lifecycle and Budget
- **D-15 (Fixed teams, 3 active):** Teams are durable entities (name, lead, roster, settings). At most **3 teams** may be in the `active` state at once; the rest are `idle`. Reactivating an idle team resumes its accumulated work.
- **D-16 (Roster limits):** One lead and at most **3 employees** per team. No cap on tool rounds per employee.
- **D-17 (Accumulating transcript):** Reactivating a team continues the same transcript; agents remember prior work through it. No per-activation session reset.
- **D-18 (Global employees):** Employees are global entities reused across teams. Editing a persona updates it everywhere it is used. A lead is a **separate entity** (its own table), managed in its own section, and selected per team.
- **D-19 (Team budget + per-agent budget):** The user sets a **team token budget**; the app **suggests an even split** across the lead plus every employee (editable per row), like a company allocating a department budget. There is no hardcoded default — the user sets it in team settings. Budgets accumulate for the life of the team; the user may top up at any time.
- **D-20 (80% pause, never auto-stop):** At 80% of the **team** budget or of an **agent's** budget, that scope **pauses** and notifies the user. Nothing is auto-aborted. The user either grants more tokens (the scope resumes) or stops it. Each additional 80% crossing of the newly granted total notifies again.
- **D-21 (Pause granularity):** An agent pauses **between tool rounds** — the in-flight tool call completes, then the turn parks. Context is preserved so resuming continues exactly where it stopped. Only the paused agent pauses; other agents in the same batch keep running. The lead receives a marker that the agent is paused awaiting user token approval, and the run stays in a waiting state rather than appearing hung.
- **D-22 (Background execution):** Team runs continue when the user leaves the tab or switches views. Returning shows the full result.

### Skill Manager
- **D-23 (Skills are prompt templates):** A skill is a Claude-Code-style custom skill: `name`, `description`, `body` (Markdown). Managed globally in its own surface and assignable to an agent.
- **D-24 (Progressive disclosure):** An agent's system prompt receives the skill's `description`. The full `body` is read on demand through a `read_skill` tool — never pasted wholesale into the prompt.
- **D-25 (One skill per agent):** An agent has at most one skill, chosen in the agent editor. An agent with no skill runs on its plain persona prompt. Skills are global and reusable across agents and teams.

### Team Links and Context Retrieval
- **D-26 (Linkable items):** A team links to N items of type **CR, task, system, note, or document**.
- **D-27 (Lead retrieval tools):** The lead receives the **entire existing read-only tool set** (`query_tasks`, `query_change_requests`, `query_systems`, `query_notes`, `get_item_details`, `retrieve_knowledge`, `read_file`, …) plus two link-scoped tools:
  - `list_linked_items()` — compact list of the team's linked items.
  - `get_linked_context({ itemId })` — full retrievable context for one linked item (note body, document content, CR tasks, system details), not just metadata.
  The lead must be able to reach the **full content** of every linked item, not merely a summary.

### UI Surfaces
- **D-28 (Employee tab + team page):** A new **employee tab** in the workbench lists and edits employees (the existing `EditorViewType` `'agents'` is the natural home; a separate section covers leads). A new **team page** (`EditorViewType` `'teams'`) lists teams and opens a team workspace with the shared transcript.

### Claude's Discretion
- Exact card layout for the assignment plan, budget top-up dialog, and paused-agent banner — follow the existing IntelliJ ExpUI Islands Light standards used by `MutationApprovalCard` and `ArtifactDiffApprovalCard`.
- Avatar/icon treatment per employee.
- Exact BM25 tokenization and excerpt length for `search_team_history`.
- Whether the employee tab and lead management live as two sub-tabs or one list with a type filter.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & Roadmap
- `.planning/PROJECT.md` — Local-first, no-backend, Tauri-primary constraints; IndexedDB is canonical
- `.planning/ROADMAP.md` §Phase 34 — Phase entry and success criteria
- `.planning/REQUIREMENTS.md` — v1.3 milestone requirements

### Prior phase decisions that constrain this one
- `.planning/phases/32-external-research-via-claude-code-headless/32-CONTEXT.md` — D-01..D-14: SSH execution, artifact persistence, prompt segment, dual trigger, multi-system targeting; the pattern for a tool that parks work behind user confirmation
- `.planning/phases/25.3-sdlc-workflow-hardening-common-ai-chat-widget/25.3-07-PLAN.md` — `ChatTurnRequest` / `ChatTurnRuntime` contract and the fixed `onMutationCheck` guard order
- `.planning/phases/25.2-fix-taskmate-mutation-flow-standardize-ai-core-engine-for-sdlc-studio/25.2-02-PLAN.md` — Per-tab toolbox state (`analysisMode`, `autoApproveMutations`, `mcpEnabled`, `model`) and the SDLC step default

### Code the phase builds on
- `src/components/ai/runtime/chatTurnRuntime.ts` — Headless turn runtime; `ChatTurnRequest`, `ChatTurnRuntimeDeps`, `createChatTurnRuntime`, `createDefaultChatTurnDeps`
- `src/components/ai/runtime/useChatTurn.ts` — `useChatTurn({ scopeKey, deps, background })`, module-level registry for background runtimes
- `src/components/ai/runtime/tabRuntimes.ts` — `createTabTurnRegistry`, per-tab runtime isolation
- `src/services/ai/aiTurnManager.ts` — `aiTurnManager`, `useActiveAiTurns`, `ActiveAiTurn`, abort/finish lifecycle
- `src/services/ai/aiOrchestratorLoop.ts` — `runAiOrchestratorLoop`, `dispatchAiToolCall`, `onMutationCheck`, `DEFAULT_MAX_TOOL_ROUNDS`
- `src/services/ai/chatTurnTools.ts` — `getToolsForTurn` (Analysis Mode now keeps mutation tools in ordinary chat; explicit allowlists stay read-only)
- `src/services/ai/aiTools.ts` — `AI_DATABASE_TOOLS`, `isMutationTool`, `MUTATION_TOOLS`, `normalizeToolName`, `describeToolMutationWithContext`
- `src/components/ai/AiChatWidget.tsx` — Shared chat widget: `AiChatScope`, `AiChatToolboxProps`, message list + composer + approval cards
- `src/components/ai/ChatMessageList.tsx` — Transcript renderer to extend with agent attribution
- `src/components/ai/widget/MutationApprovalCard.tsx` — Approval card to reuse for lead mutations
- `src/components/ai/ActiveAiTurnIndicator.tsx` — Bottom status indicator for running turns
- `src/db/repositories/chatRepo.ts` — `ChatThread`, `ChatMessage`, `createOrGetThread`, `saveMessage`, `buildScopeKey`
- `src/db/repositories/chatTabRepo.ts` — `createChatTab`, `getOrCreateActiveChatTab`, `updateChatTab`, `setActiveTab`
- `src/db/schema.ts` — `SCHEMA_V16`; new tables require a `version(17)` migration in `src/db/index.ts`
- `src/types/models.ts` — `ChatThread`, `ChatScopeType`, `ChatTab`, `ChatTabConfig`
- `src/utils/bm25.ts` — `rankBM25`, `tokenize`, `BM25Document` — the offline search engine for D-11
- `src/workbench/store/layoutStore.ts` — `EditorViewType` (`'agents'` exists; add `'teams'`), `EditorTab`
- `src/workbench/EditorArea.tsx` — View-type → component routing

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`createChatTurnRuntime`** — Already fully headless (no React import). A team employee turn is just another `start(request)` call with its own `systemMessages`, `history`, `tools`, and `model`. No new runtime needed.
- **`useChatTurn({ background: true })` + `aiTurnManager`** — Background execution and the bottom status indicator already exist; team runs inherit them.
- **`createTabTurnRegistry`** — The per-tab runtime map is the model for a per-agent runtime map inside a team run.
- **`MutationApprovalCard`** — Reuse verbatim for lead mutations; the runtime already parks on `awaiting-approval`.
- **`ChatMessageList` + `ChatInputBar` + `ChatTabToolbox`** — The team workspace is the shared `AiChatWidget` with an agent-attribution layer, not a new chat UI.
- **`src/utils/bm25.ts`** — `rankBM25`/`tokenize` are already used for document search; the team transcript search reuses them directly.
- **`getToolsForTurn`** — Employee read-only tool sets come from this function with an explicit allowlist; lead tool set is the ordinary-chat set plus the team tools.

### Established Patterns
- **Runtime owns the turn, host owns the request** — hosts compose `systemMessages`/`history`/`tools` and call `runtime.start(...)`. A team coordinator must follow the same split.
- **Mutation guard order is fixed** — artifact patch → auto-approve → explicit wait. Adding an analysis-mode branch was removed this session; do not reintroduce a hard block.
- **Per-tab config is the only durable settings source** — a global localStorage fallback must never auto-approve. Team settings must live in IndexedDB on the team row.
- **Dexie migrations are additive** — add `version(17)` with new tables (`aiEmployees`, `aiLeads`, `aiTeams`, `aiSkills`, plus a team-run/assignment table) rather than altering existing rows.
- **No server, no network for core behavior** — search, memory, and orchestration must all work with the Knowledge Server stopped and offline.

### Integration Points
- `src/db/index.ts` — `version(17)` migration and new `Table<>` declarations.
- `src/db/schema.ts` — `SCHEMA_V17` extending `SCHEMA_V16`.
- `src/workbench/store/layoutStore.ts` + `src/workbench/EditorArea.tsx` — register `'teams'` view type and route it.
- `src/services/ai/aiTools.ts` — register `delegate_batch`, `search_team_history`, `read_team_turn`, `read_skill`, `list_linked_items`, `get_linked_context` in `AI_DATABASE_TOOLS` and classify mutation vs read-only.
- `src/services/ai/chatTurnTools.ts` — employee allowlist and lead tool set.
- `src/components/ai/runtime/chatTurnRuntime.ts` — budget pause must hook the loop boundary (between tool rounds), which means a new callback or an `executeToolFn` wrapper rather than an abort.
- `src/services/backup/exportBackup.ts` + `src/validation/backupSchemas.ts` — new tables need backup export/import coverage.

</code_context>

<specifics>
## Specific Ideas

- **"Giống một văn phòng AI"** — the mental model is a real workplace: employees have fixed roles, a lead assigns work, and people search the group chat when they need to recall something rather than holding the whole history in their head.
- **"Như công ty giao chi phí cho một nhóm"** — the budget UX should feel like allocating a department budget, with the app proposing an even split that the user can override per person.
- **"Skill giống Claude Code custom skill"** — SKILL.md shape (`name` + `description` + `body`), with progressive disclosure so the body is only read when needed.
- **Stopped agent reports must be explicitly marked incomplete** so the lead never treats a partial result as final.
- **Pause must never look like a hang** — the run stays in a visible waiting state with a clear "cần cấp thêm token" call to action.

</specifics>

<deferred>
## Deferred Ideas

- **`ask_colleague` (direct peer-to-peer agent conversation)** — considered and rejected for this phase. Would break the batch model, introduce uncontrolled recursion, and make token accounting and stopping unreliable. Revisit only if the lead-mediated flow proves insufficient in practice.
- **Semantic transcript search via the Knowledge Server embedding model** — rejected because it makes an optional Docker dependency mandatory and violates the offline-first constraint. BM25 local search is the chosen path.
- **Per-agent tool allowlist beyond the skill assignment** — the user chose per-agent tool allowlists during discussion, but the final decision is that employees are uniformly read-only and the lead holds the full read-only set. A finer per-agent allowlist is a future refinement.
- **Multiple skills per agent** — explicitly capped at one skill per agent for this phase.
- **More than 3 active teams / more than 3 employees per team** — limits are fixed for this phase; raising them is a settings change later.
- **Skill authoring assistance (AI-generated skill bodies, skill versioning UI)** — the phase stores and assigns skills; authoring help and version history are separate capabilities.

</deferred>

---

*Phase: 34-AI Office*
*Context gathered: 2026-11-08*
