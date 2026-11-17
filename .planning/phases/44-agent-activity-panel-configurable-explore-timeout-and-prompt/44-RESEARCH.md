# Phase 44: Agent Activity Panel, Configurable Explore Timeout and Prompt Log - Research

**Researched:** 2026-11-17
**Domain:** React 19 / TypeScript 7 / Ant Design 6 desktop (Tauri) UI + AI-Office runtime telemetry
**Confidence:** HIGH (codebase-grounded; all decisions locked upstream; no new dependencies)

## Summary

Phase 44 delivers three tightly scoped changes to the running AI-Office workbench, all verified against source files read this session. **(1) Configurable explore timeout:** `runRemoteExplore` currently arms a single hard-coded 300 s wall-clock timer (`EXPLORE_DEFAULT_TIMEOUT_MS = 300_000`) at `src/services/remoteExploreService.ts:308`. The value must become a per-call `timeoutMs` (sourced from an `explore_repo` `timeoutSeconds` arg, integer-clamped 60..900, default 300) that flows through the existing deps object into that one timer — the JS watchdog, stream cancel, abort wiring, late-cancel guard, 4× stdout buffer and 12 000-char report cap all stay byte-for-byte in place. **(2) Agent Activity Panel:** the coordinator's `onToolEvent` handler currently discards `result` events (`if (event.phase !== 'call') return`) and funnels `call` events into a label-deduplicated `pushStep` popover list. The panel needs both phases upserted by tool-event **id** into `AgentRunState.steps`, with capped args/result previews and payload-derived status. **(3) Debug Prompt migration:** the `debugLogs` capture and `TeamDebugLog` shape stay untouched; only the display moves from an antd `Modal` + dropdown item into a second "Prompt log" tab in a new right-side rail.

The dominant risk is not new code but **preserving existing behavior**: the compact `TeamActivityIndicator` popover reads the same `AgentRunState.steps` (`label`/`detail`/`at`) and must keep working; the tool result is a JSON **string** so status must be derived by parsing `event.result`, not by reading a structured field; and removing the debug modal also makes the antd `Modal` import and `BugOutlined` import dead. All three are concrete, verified findings below.

**Primary recommendation:** Implement as three vertical slices in dependency order — timeout plumbing (service + tool def + handler + focused tests), then the additive `AgentLiveStep` type + id-based upsert in the coordinator (with tests), then the presentational `AgentActivityPanel` component + third `Splitter.Panel` + Prompt-log tab and the exact Modal/menu removal. Keep everything runtime-only; touch no Dexie/backup schema and add no npm package.

## Project Constraints (from CLAUDE.md)

Actionable directives extracted from `CLAUDE.md` (treat with authority equal to locked decisions):

- **Runtime focus:** Tauri is the primary and only supported app runtime for current work. Prefer Tauri APIs/native paths; do not add, debug, or validate PWA/GitHub Pages behavior unless explicitly requested. (Reinforced by CONTEXT.md out-of-scope and UI-SPEC.)
- **UI:** Ant Design is fixed. Use installed `antd` 6.6.5 + `@ant-design/icons` 6.3.4 via `AntdThemeAdapter`; no new CSS framework, no `@types/antd`, import icons individually.
- **Persistence:** IndexedDB (Dexie) is the working store. Phase 44 inspection state is explicitly runtime-only (D-07) — no Dexie table, no backup schema.
- **Identifiers:** stable client-generated UUIDs (`crypto.randomUUID()`); no `uuid` package.
- **Data safety:** untrusted tool output must be validated/bounded and never rendered as instructions.
- **Testing rule (memory/profile):** do NOT run the full Vitest suite (over an hour); run focused test files only. Typecheck with `npx tsc --noEmit -p tsconfig.json`.
- **Anti-read-loop / single-read-before-edit:** read each target block once with a wide range, then act; no repeated reads of the same range.
- **GSD enforcement:** all edits through a GSD workflow; commit_docs is true (research file must be committed).
- **TypeScript strictness:** `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` all enabled (`tsconfig.json:14-16`) — optional fields must be conditionally spread, never set to `undefined`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** `explore_repo` gains `timeoutSeconds`, integer-clamped to 60..900, default 300. Invalid or out-of-range input falls back to 300 rather than refusing — it is a tuning knob, not a security boundary. Keep `EXPLORE_DEFAULT_TIMEOUT_MS = 300_000` as the default exported contract.
- **D-02:** The value flows `teamTools.ts` → `runRemoteExplore(..., { timeoutMs })` → the existing JS watchdog. Do **not** add a remote `timeout(1)` command: stock macOS lacks it and the current portable cancel design is load-bearing (Phase 43 D-03). Abort handling, late-cancel, 4x stdout buffer, and 12 000-char report cap are unchanged.
- **D-03:** The tool definition description states the accepted range and default; a focused test asserts (a) the schema advertises the property, (b) clamping at both boundaries, and (c) the watchdog receives the derived milliseconds. Zero hits/absence of CLI behavior stays as in Phase 43.
- **D-04:** Keep `AgentRunState.steps` / `AgentLiveStep` (`src/types/aiOffice.ts`) as the office runtime source. Extend it additively: `toolName?`, `phase?: 'call' | 'result'`, `startedAt?`, `endedAt?`, `durationMs?`, `status?: 'running' | 'done' | 'error'`, `resultPreview?`. Existing fields `id`, `label`, `at`, `detail?` remain so the small activity popover can keep working unchanged if needed.
- **D-05:** Consume **both** `phase === 'call'` and `phase === 'result'` from `onToolEvent` in `teamRunCoordinator.ts`. A call creates/updates one row keyed by tool event id; a result updates that same row with duration, status, and a bounded preview. Replace the current label-based dedup (`pushStep`) with id-based upsert. Do not throw away result events as today (`if (event.phase !== 'call') return`).
- **D-06:** Arguments and result preview are serialized strings, capped before storing in runtime state: arguments at 8 000 chars, result preview at 8 000 chars. The cap is a UI preview; the model still receives the full tool result. Content is untrusted data — render as text/sanitized markdown only, never as instructions, and never auto-expand details.
- **D-07:** Runtime-only, capped timeline (max 200 rows, matching existing `MAX_LIVE_STEPS`). No Dexie table, no backup schema, no persisted transcript extension. Reset on requeue/team teardown as existing agent state does.
- **D-08:** A tool result that carries `{ refused: true, code }`, `error`, or a thrown tool error is shown with error status; successful results are done; a call without result is running. Status must be derived from the event payload, not inferred from a name.
- **D-09:** Add a right-side rail to the existing `Splitter` in `TeamWorkspace.tsx:790-830`, alongside the 300px `TeamSidebar` and center transcript. Precedent: `AgentControlView.tsx:148-215` uses a 3-pane Splitter. Prefer this over a modal/Drawer so transcript and inspection are visible together on desktop.
- **D-10:** The rail has an explicit open/close control in its header and an "Activity" affordance in the workspace header. Default state: **open** on desktop, because the user wants the detail visible; remember the per-user open state via existing local UI-state patterns only if already present — do not add a new persistence mechanism for it.
- **D-11:** Follow the approved draft structure: header + agent filter pills (`all` + current roster), two tabs (`Timeline`, `Prompt log`), progress card for running `explore_repo`, then reverse-chronological event rows. Row shows status icon, tool name, agent, timestamp, duration. Expanding a row reveals args and result preview in capped `<pre>`/`Typography.Text code`, with `aria-expanded`/`aria-controls` and keyboard parity.
- **D-12:** The panel reuses Ant Design tokens/components already in the app (Button, Tabs/Segmented or accessible equivalent, Tag, Empty, Tooltip). No new CSS framework. Long values wrap/scroll inside their own container; the rail never causes horizontal page overflow. Use `renderSafeMarkdown` or plain text for previews; never `dangerouslySetInnerHTML` on raw tool output.
- **D-13:** UI-SPEC is required for this phase (`/gsd-ui-phase`). The draft HTML is the design reference; the UI-SPEC must record token mapping, states, responsive behavior, accessibility and the exact tab migration decision before planning. (Satisfied — `44-UI-SPEC.md` approved.)
- **D-14:** Keep the existing `debugLogs` capture and data shape unchanged. Move its display into the rail's **Prompt log** tab; preserve clear logs and copy/inspect behavior already present in the modal where practical.
- **D-15:** Remove the `Debug Prompt (${debugLogs.length})` dropdown item (`TeamWorkspace.tsx:894-899`) and the `<Modal title="Debug: Lịch sử Prompt gửi tới AI trong nhóm">` (`TeamWorkspace.tsx:1111-1124`), plus now-unused state/handlers/imports. Do **not** touch `AIDebugModal.tsx` used by the ordinary chat drawer (`AIChatDrawer.tsx:2282`).
- **D-16:** If the panel is closed, Prompt log is not reachable from the dropdown anymore — this is intentional; the Activity affordance opens the rail. Tests must cover that the menu item is gone and that the tab renders preserved log content.
- **D-17:** Required verification: focused Vitest suites for coordinator event upsert, tool timeout schema/clamping/watchdog, and new panel component behavior with fixture events; `npx tsc --noEmit -p tsconfig.json`; `/gsd-code-review`, `/gsd-ui-review`, and `/gsd-verify-work`. Fix all critical and warning findings; info findings may remain only with an explicit rationale in the phase docs.
- **D-18:** Push is a separate final step after verification is green: one `git push` to `feature/intellij-workbench` carrying the whole phase. No push halfway through.

### Claude's Discretion

- Exact component filenames and whether the rail is a dedicated `AgentActivityPanel.tsx` plus a small wrapper in `TeamWorkspace.tsx`.
- Whether AntD `Tabs` or a small accessible custom tab strip matches the surrounding code best; the draft uses a simple tab strip.
- Exact Vietnamese microcopy, as long as “Timeline”, “Prompt log”, status and duration are recognizable in the UI and tests.
- Whether the current small activity popover remains as a compact fallback; if it does, it must not duplicate the new data path or become a second source of truth.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.

- Streaming nested remote Claude Code tool steps into the panel.
- Persisting inspection history across app restarts.
- Renaming or relocating the ordinary chat drawer's `AIDebugModal`.

</user_constraints>

<phase_requirements>
## Phase Requirements

> No Phase-44-specific REQ ids exist in `REQUIREMENTS.md`: the ROADMAP Phase 44 entry reads "**Goal:** [To be planned] / **Requirements**: TBD" (`.planning/ROADMAP.md:351-359`). The nearest requirements are `AIO-READ-09`/`AIO-READ-10` (Phase 43, already `[x]`) and the milestone verification-honesty rule `C-15`: "No requirement is satisfied by reading code. Every acceptance criterion must be observable in a real UI walkthrough" (`.planning/REQUIREMENTS.md:9`). The IDs below are decision-derived labels for planner traceability, not REQUIREMENTS.md ids.

| ID | Description | Research Support |
|----|-------------|------------------|
| TO-01 (D-01..D-03) | `explore_repo` `timeoutSeconds` 60..900 clamp/default 300, watchdog receives derived ms | `remoteExploreService.ts:20,56-60,223-308`; `teamTools.ts:381-408,1492-1499`; timeout test seam at `remoteExploreService.test.ts:188-265` |
| PANEL-01 (D-04..D-08) | Additive `AgentLiveStep` fields; id-based call+result upsert with capped previews and payload-derived status | `aiOffice.ts:261-281`; `teamRunCoordinator.ts:870-903,1458-1465`; `chatTurnRuntime.ts:33-41,386-405`; `AiChatWidget.tsx:149-156` |
| UI-01 (D-09..D-13) | Right rail in TeamWorkspace Splitter, filter tabs, progress card, expandable rows, accessible & overflow-safe | `TeamWorkspace.tsx:794-830,832-918`; `AgentControlView.tsx:148-215`; `44-UI-SPEC.md`; draft HTML |
| LOG-01 (D-14..D-16) | Debug Prompt display → Prompt log tab; keep `debugLogs`, remove Modal/menu + dead imports | `TeamWorkspace.tsx:120-129,166-167,353-365,889-918,1111-1175`; |
| VERIFY-01 (D-17, C-15) | Focused tests + typecheck + code/UI review + real UI walkthrough | `vite.config.ts:65-80` (Vitest 5.0.2/jsdom); focused-test memory rule; `teamTools.test.ts:81-101` |
</phase_requirements>

## Standard Stack

No new dependencies (locked by CONTEXT.md out-of-scope and UI-SPEC). All versions confirmed from installed `node_modules` this session (`node -e "require(p+'/package.json').version"`).

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.3.0 | UI runtime | Installed; existing `TeamWorkspace`/`AiChatWidget` are function components with hooks |
| TypeScript | 7.0.2 | Types + `tsc --noEmit` gate | Installed; strict flags on (`tsconfig.json:14-16`) |
| antd | 6.6.5 | Panel primitives (Splitter, Tabs, Tag, Empty, Tooltip, Progress, Popconfirm, Typography) | Fixed by CLAUDE.md + UI-SPEC; exports verified present this session |
| @ant-design/icons | 6.3.4 | Status icons, Activity affordance | Fixed; import individually |
| Dexie / dexie-react-hooks | existing | Not used by Phase 44 (runtime-only state) | `useLiveQuery` already in TeamWorkspace for settings; no new table |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Vitest | 5.0.2 | Focused unit/component tests | `vitest run <files>`; jsdom + globals configured (`vite.config.ts:65-80`) |
| @testing-library/react | 16.3.3 | Component tests | `render`/`screen`/`fireEvent`; note `user-event` is NOT installed → use `fireEvent` |
| dayjs | 1.11.23 | Timestamp (`HH:mm:ss`) + elapsed formatting | Already used by `TeamActivityIndicator.tsx:3,71` |
| `renderSafeMarkdown` | in-repo (`src/utils/markdown.ts:137`) | Sanitized preview rendering | Escapes raw HTML via `escapeHtml` (`markdown.ts:7-14`); plain-text `<pre>` is even simpler |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Add `timeoutMs` to `RunRemoteExploreDeps` (recommended) | Add `timeoutMs` to `ExploreRequest` | Request is the CLI/prompt payload; deps is the existing seam that already carries `signal`. D-02 explicitly says `{ timeoutMs }` as a deps argument — follow it. |
| Plain-text `<pre>` for previews | `renderSafeMarkdown` + `dangerouslySetInnerHTML` (as `ToolEventBadge` does) | Both safe; plain text matches the current debug modal (`TeamWorkspace.tsx:1148-1150`) and removes any XSS surface. Recommend plain text. |
| AntD `Tabs` (recommended) | Custom accessible tab strip | Both permitted; antd `Tabs` already in the app and gives keyboard parity for free. |
| New dedicated `AgentActivityPanel.tsx` (recommended) | Inline all JSX in TeamWorkspace | Dedicated component enables fixture-driven component tests (D-17) without mounting the whole workspace. |

**Installation:** none — no packages added.

**Version verification:** `antd 6.6.5`, `@ant-design/icons 6.3.4`, `react 19.3.0`, `typescript 7.0.2`, `vitest 5.0.2`, `@testing-library/react 16.3.3`, `dayjs 1.11.23` all confirmed from installed manifests this session. Node v26.13.0 / npm 11.20.0 present (CLAUDE.md/stack targets Node 24 LTS, but tsc/Vitest run fine here).

## Package Legitimacy Audit

Not applicable — this phase installs **no** external packages (CONTEXT.md out-of-scope: "New npm dependencies" explicitly excluded; UI-SPEC registry safety gate "not triggered"). No Package Legitimacy Gate run needed.

**Packages removed due to SLOP verdict:** none.
**Packages flagged as suspicious (SUS):** none.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `explore_repo` timeout clamp + watchdog ms | API / Backend (service layer `remoteExploreService.ts`) | Tool surface (`teamTools.ts`) | Wall clock and cancel live in the service; tool only supplies a clamped value. No UI/render concern. |
| Tool call/result → agent-visible state (id upsert, cap, status) | API / Backend (`teamRunCoordinator.ts`) | Types (`aiOffice.ts`) | Coordinator is the sole place tool events become `AgentRunState`; must stay single-source so the popover and rail agree. |
| Activity rail render (tabs, filter, progress, expandable rows) | Browser / Client (`AgentActivityPanel.tsx` inside `TeamWorkspace`) | — | Pure presentation of runtime snapshot + `debugLogs`; no persistence, no backend. |
| Prompt log display migration | Browser / Client (new tab) | — | `debugLogs` already captured in TeamWorkspace; only presentation moves. |
| Untrusted output containment | API / Backend (cap before storing) + Browser / Client (safe render) | — | Cap at write (coordinator), escape at render — defense in depth. |

## Architecture Patterns

### System Architecture Diagram

```text
                    ┌───────────────────────── Tauri desktop (only runtime) ─────────────────────────┐
                    │                                                                               │
  user prompt ─────►│  TeamWorkspace                                                                │
                    │   ├─ runLoop override captures debugLogs  (UNCHANGED — D-14)                   │
                    │   ├─ createTeamRunCoordinator({...})                                          │
                    │   └─ <Splitter> [ TeamSidebar | transcript+TeamActivityIndicator | NEW RAIL ]  │
                    │                                                    │                          │
                    │                                          AgentActivityPanel (NEW)             │
                    │                                          ├─ tabs: Timeline | Prompt log        │
                    │                                          ├─ filter pills (all + roster)        │
                    │                                          ├─ explore_repo progress card         │
                    │                                          └─ expandable event rows              │
                    │                                                    ▲                          │
                    │                          snapshot.agents[].steps ───┘ (runtime-only)          │
                    │                          debugLogs ───────────────────┘ (runtime-only)          │
                    └──────────────────────────────▲────────────────────────────────────────────────┘
                                                   │ notify() / useSyncExternalStore
  ┌────────────────────────────────────────────────┴───────────────────────────────────────────────┐
  │  teamRunCoordinator (API/backend tier)                                                          │
  │   ├─ onToolEvent(call)  ─► upsert row by event.id, cap args 8k, startedAt, status=running        │
  │   └─ onToolEvent(result) ─► same row: durationMs, status from payload, resultPreview cap 8k      │
  │        writes AgentRunState.steps (max 200) ─ runtime-only ─ never Dexie/backup                  │
  └──────────────────────────────────▲─────────────────────────────────────────────────────────────┘
                                     │ onToolEvent from chatTurnRuntime
  ┌──────────────────────────────────┴──────────────────────────────────────────────────────────────┐
  │  chatTurnRuntime → executeTeamTool → teamTools.exploreRepo                                       │
  │   ├─ clamp timeoutSeconds (60..900, default 300) ─► timeoutMs                                   │
  │   └─ runRemoteExplore(..., { signal, timeoutMs }) ─► JS watchdog ─► cancel stream (SSH)         │
  │        (no new remote timeout(1); abort/late-cancel/buffer/cap unchanged)                        │
  └─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Primary use case trace: user sends a prompt → leader/employee turn runs → each tool call/result becomes an upserted row in `snapshot.agents[].steps` via `onToolEvent` → `notify()` re-renders TeamWorkspace → the new rail shows the row; `explore_repo` additionally surfaces a running progress card driven by the call's `startedAt` + `timeoutSeconds` (elapsed/deadline). Prompt log reads `debugLogs` directly, never a second event path.

### Recommended Project Structure

```text
src/
├── services/
│   └── remoteExploreService.ts        # MODIFY: add timeoutMs seam + clamp helper; one timer uses it
├── services/ai/office/
│   ├── teamTools.ts                   # MODIFY: tool def property + handler clamp/pass + description
│   └── teamRunCoordinator.ts          # MODIFY: id-based call/result upsert into AgentRunState.steps
├── types/
│   └── aiOffice.ts                    # MODIFY: additive optional fields on AgentLiveStep
├── components/ai/office/
│   ├── TeamWorkspace.tsx              # MODIFY: 3rd Splitter.Panel, Activity affordance, remove Modal/menu
│   ├── AgentActivityPanel.tsx         # NEW (recommended): rail + Timeline + Prompt log tabs
│   └── TeamActivityIndicator.tsx      # KEEP unchanged if upsert preserves label/at/detail (see Pitfall 3)
tests/
├── services/
│   ├── remoteExploreService.test.ts   # MODIFY: derived-ms watchdog + clamp-boundary cases
│   └── ai/office/
│       ├── teamTools.test.ts          # MODIFY: schema advertises timeoutSeconds (count stays 12)
│       ├── teamToolsGitRead.test.ts   # MODIFY: runRemoteExplore receives derived timeoutMs
│       └── teamRunCoordinator.test.ts # MODIFY: id upsert, result phase, status, caps
└── components/ai/office/
    ├── AgentActivityPanel.test.tsx    # NEW: fixture events, tabs, filter, expansion, caps
    └── TeamWorkspaceDebugMenu.test.tsx# NEW (or extend existing): menu item gone, tab shows logs
```

### Verbatim in-repo contracts (read this session — quote exactly when coding)

These discrete values are quoted verbatim from source-of-truth files opened this session. Any code example in this document that uses them uses exactly these spellings.

- Timeout constants — `[VERIFIED: src/services/remoteExploreService.ts:19-22]`:
  ```ts
  export const EXPLORE_REPORT_MAX_CHARS = 12_000;
  export const EXPLORE_DEFAULT_TIMEOUT_MS = 300_000;
  export const EXPLORE_DEFAULT_MAX_TURNS = 20;
  export const EXPLORE_MAX_TURNS_CAP = 40;
  ```
- `ExploreRequest` — `[VERIFIED: src/services/remoteExploreService.ts:27-32]`: `repoPath: string; question: string; model: string; maxTurns: number;` (note: no `timeoutMs` here — it belongs in deps per D-02).
- `RunRemoteExploreDeps` — `[VERIFIED: src/services/remoteExploreService.ts:210-217]`: `stream?: typeof execRemoteCommandStream;` and `signal?: AbortSignal | undefined;` (no `now`, no `timeoutMs` today).
- `AgentLiveStep` — `[VERIFIED: src/types/aiOffice.ts:265-271]`:
  ```ts
  export interface AgentLiveStep {
    id: string;
    label: string;
    at: string;
    /** Serialized tool arguments from `ChatTurnToolEvent.args`; absent for status steps. */
    detail?: string | undefined;
  }
  ```
- `AgentRunState` — `[VERIFIED: src/types/aiOffice.ts:273-281]`: fields `agentId: string; status: AgentRunStatus; streamingText: string; startedAt?: string | undefined; incomplete?: boolean | undefined; steps?: AgentLiveStep[] | undefined;`
- `ChatTurnToolEvent` — `[VERIFIED: src/components/ai/runtime/chatTurnRuntime.ts:33-41]`:
  ```ts
  export interface ChatTurnToolEvent {
    id: string;
    name: string;
    phase: 'call' | 'result';
    durationMs?: number;
    args?: string;
    result?: string;
  }
  ```
- Step ceiling — `[VERIFIED: src/services/ai/office/teamRunCoordinator.ts:381]`: `const MAX_LIVE_STEPS = 200;`
- `TeamDebugLog` — `[VERIFIED: src/components/ai/office/TeamWorkspace.tsx:120-129]`: `timestamp: string; agentId: string; agentName: string; agentKind: string; model: string; text: string; systemMessages: string[]; toolNames: string[];`
- Refusal shape — `[VERIFIED: src/services/ai/office/teamTools.ts:120-128]`: `{ refused: true; code: TeamToolRefusalCode; message: string }` via `function refuse(code, message) { return { refused: true, code, message }; }`
- Tool result is a JSON **string** — `[VERIFIED: src/services/ai/office/teamTools.ts:1530-1559]`: `executeTeamTool(...): Promise<string>` and every path returns `JSON.stringify(...)`.

### Pattern 1: Configurable watchdog via deps (timeout slice)

**What:** Add `timeoutMs: number` to `RunRemoteExploreDeps`, default it to `EXPLORE_DEFAULT_TIMEOUT_MS` at the top of `runRemoteExplore`, and replace the single `EXPLORE_DEFAULT_TIMEOUT_MS` in the `setTimeout` call (`:308`) with that variable. Add an exported `clampExploreTimeoutSeconds(value: unknown): number` beside `clampExploreMaxTurns` (`:56-60`) that floors, rejects non-finite → 300, and clamps to `[60, 900]`. In `teamTools.ts` add a `timeoutSeconds` number property to the `explore_repo` definition (`:381-408`) and update its description with range + default; the handler computes `const timeoutMs = clampExploreTimeoutSeconds(args.timeoutSeconds) * 1000` and passes `{ ...(ctx.signal ? { signal: ctx.signal } : {}), timeoutMs }` — but only change the existing signal spread shape if strictly needed (see Pitfall 5).

**When to use:** exactly D-01/D-02. Do not add a `timeout` command to `buildExploreCommand`; its current flags are load-bearing and verified in Phase 43 (`--restricted`, prompt after `--`).

**Example (structure only; values quoted above):**
```ts
// src/services/remoteExploreService.ts — additive, mirrors clampExploreMaxTurns at :56-60
export const EXPLORE_MIN_TIMEOUT_SECONDS = 60;   // [ASSUMED name] value 60 from D-01
export const EXPLORE_MAX_TIMEOUT_SECONDS = 900;  // [ASSUMED name] value 900 from D-01
export function clampExploreTimeoutSeconds(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return EXPLORE_DEFAULT_TIMEOUT_MS / 1000; // 300
  return Math.min(Math.max(EXPLORE_MIN_TIMEOUT_SECONDS, n), EXPLORE_MAX_TIMEOUT_SECONDS);
}
// runRemoteExplore: const timeoutMs = (deps.timeoutMs ?? EXPLORE_DEFAULT_TIMEOUT_MS);
// timer = setTimeout(() => { ...unchanged... }, timeoutMs);
```
`[VERIFIED: src/services/remoteExploreService.ts:19-22,56-60,223-308]` for the surrounding constants/pattern/timer; the constant *names* `EXPLORE_MIN/MAX_TIMEOUT_SECONDS` are `[ASSUMED]` (planner may choose different names).

### Pattern 2: id-based call/result upsert (panel data slice)

**What:** Replace the label-dedup `pushStep` (`:887-903`) with an id-keyed upsert used only by `onToolEvent`. A `call` creates a step with `toolName = event.name`, `phase: 'call'`, `startedAt`, `status: 'running'`, `detail = cap(event.args, 8000)`. A `result` finds the existing row by `event.id` and fills `phase: 'result'`, `durationMs`, `status` from payload, `resultPreview = cap(event.result, 8000)`, `endedAt`. Keep `label`/`at`/`detail` populated so `TeamActivityIndicator.StepRow` still renders. Cap the array with `.slice(-MAX_LIVE_STEPS)` exactly as today.

**When to use:** D-05/D-06/D-07/D-08. `mergeToolEvents` in `AiChatWidget.tsx:149-156` is the canonical precedent: `byId.set(event.id, { ...previous, ...event })`.

**Example (shape; caps/status values from D-06/D-08 — `[VERIFIED: ...44-CONTEXT.md:34-38]` as locked decisions):**
```ts
// upsert by id, both phases (replaces the label check at pushStep :891)
function upsertToolStep(agentId: string, event: ChatTurnToolEvent): void {
  const state = agents.get(agentId);
  if (!state) return; // mirror pushStep's guard
  const steps = state.steps ?? [];
  const idx = steps.findIndex((s) => s.id === event.id);
  const prev = idx >= 0 ? steps[idx] : undefined;
  const nextRow = event.phase === 'call'
    ? { id: event.id, label: 'đang gọi tool ' + event.name, at: new Date().toISOString(),
        detail: event.args?.slice(0, 8000), toolName: event.name, phase: 'call' as const,
        startedAt: new Date().toISOString(), status: 'running' as const }
    : { ...prev!, phase: 'result' as const, durationMs: event.durationMs,
        endedAt: new Date().toISOString(), status: deriveStatus(event.result),
        resultPreview: event.result?.slice(0, 8000) };
  // ... write nextRow into steps at idx or append, then updateAgent(agentId, { steps: steps.slice(-MAX_LIVE_STEPS) })
}
```
`deriveStatus(result?: string)`: parse `result` defensively (JSON string) → `'error'` if `parsed.refused === true || parsed.error` (also consider `parsed.outcome === 'error'` for `explore_repo`), else `'done'`; unparseable/non-JSON result → `'done'` (treat as plain text, never throw). `[VERIFIED: src/services/ai/office/teamTools.ts:120-128,1501-1512,1558]` for the refuse/error shapes; `deriveStatus` name is `[ASSUMED]`.

### Anti-Patterns to Avoid

- **Discarding result events** (`if (event.phase !== 'call') return` at `:1459`) — this is the exact bug D-05 removes; a result-only upsert that never pairs leaves every row "running".
- **Inferring status from tool name** (e.g. name includes "error") — D-08 forbids it; parse the payload.
- **Storing un-capped tool output** — an 8 000-char cap must happen before writing to `AgentRunState.steps`, not at render (D-06).
- **Rendering raw tool text with `dangerouslySetInnerHTML`** — use plain-text `<pre>` or `renderSafeMarkdown` (which escapes HTML at `markdown.ts:7-14`).
- **Adding a second event/data path for the compact popover** — keep one upsert path (UI-SPEC §Compact fallback).
- **Setting optional fields to `undefined` explicitly** — `exactOptionalPropertyTypes` is on (`tsconfig.json:16`); use conditional spread (`...(detail ? { detail } : {})`, as in `pushStep :899` and `teamTools :1499`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Remote wall-clock timeout | A `timeout(1)` SSH command or a new shell wrapper | Existing JS `setTimeout` + stream `cancel` handle in `runRemoteExplore` (`:294-308`) | Phase 43 verified `timeout(1)` absent on stock macOS; portable cancel design + late-cancel guard is load-bearing (D-02) |
| Pairing call+result events | A new pairing reducer from scratch | `mergeToolEvents` id-map pattern (`AiChatWidget.tsx:149-156`) | Canonical precedent already in app; one-line `{...previous, ...event}` upsert |
| Safe preview rendering | Custom HTML sanitizer or `dangerouslySetInnerHTML` on tool text | Plain-text `<pre>` / `Typography.Text code`; or `renderSafeMarkdown` (`markdown.ts:137`) which escapes HTML | Avoids XSS from untrusted tool output (D-06/D-12) |
| Panel layout shell | A new Modal/Drawer or new app shell | Third `Splitter.Panel` in existing `TeamWorkspace` Splitter (`:794`) + `AgentControlView` 3-pane precedent (`:148-215`) | Keeps transcript + inspection visible together; no new layout concepts (D-09) |
| Number clamping | Ad-hoc `if/else` in the handler A model-first validation schema | `clampExploreMaxTurns` sibling helper (`remoteExploreService.ts:56-60`) | Mirrors proven clamp; invalid → default, never refuse (D-01) |
| Persistence of inspection state | New Dexie table / backup schema / `localStorage` | Runtime arrays (`AgentRunState.steps`, `debugLogs`) | Explicitly runtime-only (D-07); no schema/backup churn |
| Debug prompt modal removal | Deleting `AIDebugModal.tsx` | Only remove `TeamWorkspace` Modal/dropdown; leave chat-drawer modal untouched | D-15 — `AIDebugModal` belongs to ordinary chat (`AIChatDrawer.tsx:2282`) |

**Key insight:** every mechanism this phase needs already exists in the codebase (watchdog, upsert precedent, Splitter, safe renderer, debug capture). The work is wiring and presentation, not new infrastructure.

## Runtime State Inventory

This phase is **not** a rename/rebrand/migration. It changes one value's *source* (timeout) and moves one UI surface (debug prompt). No runtime state carries a renamed string. All five categories answered explicitly:

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | None — inspection state (`AgentRunState.steps`, `debugLogs`) is runtime-only and never in Dexie/backup. Verified: no Dexie table for steps (`aiOffice.ts:261-281` doc "Runtime-only — never persisted"); `debugLogs` is `useState` (`TeamWorkspace.tsx:166`). | None — no data migration. |
| Live service config | None — the timeout is an in-process call argument, not a stored setting. Verified: no settings key referenced for timeout (`remoteExploreService.ts` has no settings import). | None. |
| OS-registered state | None — no scheduler/service registration touched. | None. |
| Secrets/env vars | None — GitHub token/passphrase model unchanged; no new env var. Verified: phase scope excludes sync/security changes. | None. |
| Build artifacts / installed packages | None — no new dependency, no compiled artifact carries the timeout literal. | None. |

**Nothing found in category:** all five categories above state "None — verified by <file>" explicitly. Note the one behavioral reset requirement: `AgentRunState.steps` must be cleared on requeue/teardown exactly as today (`teamRunCoordinator.ts:2019-2024,3174,2243` set `steps: []`) — this is existing runtime reset, not a migration.

## Common Pitfalls

### Pitfall 1: Tool result is a JSON string, not a structured object
**What goes wrong:** `deriveStatus` reads `event.result.refused` directly; `event.result` is `string | undefined`, so this is either a type error or (after `any`) always undefined → every result shows "done" even for refusals/errors.
**Why it happens:** `executeTeamTool` returns `Promise<string>` and every handler returns `JSON.stringify(...)` (`teamTools.ts:1530-1559`); the `chatTurnRuntime` passes that string through as `result` (`chatTurnRuntime.ts:397-405`).
**How to avoid:** `JSON.parse` the result inside a try/catch, then inspect `refused === true`, `error`, `outcome === 'error'`; on parse failure treat as plain-text success, never throw.
**Warning signs:** a fixture with `{refused:true,code:'INVALID_ARGUMENT'}` renders done; tsc error about indexing a string.

### Pitfall 2: Result arrives before/alongside call, or duplicates
**What goes wrong:** an id-keyed result upsert with no existing row spreads `undefined` (`{...prev!}`) and drops the tool name/args; or a second `result` re-appends a duplicate row.
**Why it happens:** `call` and `result` are separate events (`:390-405`); the current code assumes calls only. Streams/aborts can interleave.
**How to avoid:** guard both phases — for a `result` with no prior row, create a minimal row from `event.name` + `at`; for an existing id, merge in place (never append). Preserve `args`/`toolName` from the prior row.
**Warning signs:** two rows for one tool call, or a result row with blank tool name.

### Pitfall 3: Breaking the compact TeamActivityIndicator popover
**What goes wrong:** replacing `pushStep` such that `label`/`at`/`detail` are no longer populated makes `StepRow` (`TeamActivityIndicator.tsx:44-88`) show empty rows or lose argument expansion.
**Why it happens:** the popover reads exactly those three fields; D-04 requires they remain. UI-SPEC says the popover may stay only if it is not a second data path.
**How to avoid:** keep writing `label` (e.g. `'đang gọi tool ' + event.name`, matching current `:1462`), `at`, and `detail` (= capped args) on every row. Prefer leaving `TeamActivityIndicator.tsx` byte-unchanged.
**Warning signs:** existing coordinator tests / popover fixtures assert step labels; a blank popover after a run.

### Pitfall 4: Losing the load-bearing watchdog cancel semantics
**What goes wrong:** refactoring the timeout touches `cancelOnArrival`, the abort listener, or `capReport` on the timeout path and reintroduces Phase 43 post-review bugs (48k wedge leak, un-killed late process, cached-negative probe, prompt-as-option).
**Why it happens:** the timer callback at `:294-308` interleaves with abort (`:252-256`) and late handle arrival (`:310-316`).
**How to avoid:** change ONLY the timer duration source; leave the callback body, `finish`, `onAbort`, `onData`, `onExit`, and buffer/cap code untouched. Reuse the existing `300_000`-based fake-timer tests (`remoteExploreService.test.ts:188-265`) and add derived-ms cases around them.
**Warning signs:** any diff in `remoteExploreService.ts` beyond the constant/deps/timer-duration lines.

### Pitfall 5: exactOptionalPropertyTypes with the signal/timeout deps spread
**What goes wrong:** writing `{ signal: ctx.signal, timeoutMs }` when `ctx.signal` is `undefined` fails tsc; or passing `timeoutMs` into `ExploreRequest` by mistake.
**Why it happens:** `exactOptionalPropertyTypes` is on; current code deliberately spreads `ctx.signal ? { signal: ctx.signal } : {}` (`teamTools.ts:1499`).
**How to avoid:** keep the conditional signal spread and add `timeoutMs` as a plain required deps field: `runRemoteExplore(config, secret, {repoPath,question,model,maxTurns}, { timeoutMs, ...(ctx.signal ? { signal: ctx.signal } : {}) })`. Define `timeoutMs` as required in `RunRemoteExploreDeps` (defaulted inside the service) so no optional-spread issue.
**Warning signs:** tsc errors on `signal`/`timeoutMs` at the call site.

### Pitfall 6: Dead imports/state after debug modal removal
**What goes wrong:** removing the Modal/menu but leaving `Modal` (antd import, `:2`), `BugOutlined` (`:3`), `debugModalOpen` state (`:167`) and `setDebugModalOpen` (`:898,1114,1119`) causes lint/tsc "unused" failures or a dangling reference.
**Why it happens:** `Modal` from antd is used ONLY by the debug modal (verified: all `Modal` tokens at `:2,1111,1113-1114,1119,1175`; the other modals are `TeamSettingsDrawer`/`BudgetTopUpModal`/`McpSettingsModal`). `BugOutlined` is used only at `:896`.
**How to avoid:** delete those imports/state/handlers in the same task; keep `debugLogs`/`setDebugLogs` and `TeamDebugLog` (still captured at `:353-365`). Do NOT delete `AIDebugModal.tsx`.
**Warning signs:** grep for `debugModalOpen` / `BugOutlined` / `<Modal` in TeamWorkspace returns hits.

### Pitfall 7: Horizontal overflow / auto-expanding untrusted content
**What goes wrong:** long args/result or tool names widen the rail and the document; or a preview expands on mount, showing injected text as visible instructions.
**Why it happens:** UI draft uses illustrative 10-14px paddings; flex children without `min-width: 0` overflow (UI-SPEC §Responsive). Tool output is untrusted.
**How to avoid:** `minWidth: 0` on every flex child, `whiteSpace: 'pre-wrap'`, `wordBreak: 'break-word'`, own `maxHeight`/`overflow: auto` on `<pre>`; details collapsed by default (`useState(false)` as in `ToolEventBadge :164`); ellipsis + Tooltip for long names.
**Warning signs:** narrow-window visual check shows a horizontal scrollbar; a fixture preview is expanded on first render.

### Pitfall 8: Tool count assertion drift
**What goes wrong:** adding `timeoutSeconds` as a property changes nothing about tool count, but a planner might bump `TEAM_TOOL_DEFINITIONS` length 12→13 thinking a new tool was added.
**Why it happens:** `teamTools.test.ts:81-82` pins `expect(names).toHaveLength(12)` and lists `explore_repo` among names. `timeoutSeconds` is a parameter property, not a tool.
**How to avoid:** keep count at 12; add only a schema-property assertion (D-03a) inside the existing definition test.
**Warning signs:** a changed length assertion.

## Code Examples

Verified patterns from this codebase (read this session, not external docs):

### Current watchdog to modify (single timer line)
```ts
// src/services/remoteExploreService.ts:294-308 — change ONLY the duration source
timer = setTimeout(() => {
  cancelOnArrival = true;
  void cancel?.().catch(() => undefined);
  finish(capReport({ report: stdout.trim(), truncated: false, outcome: 'error', detail: 'timeout' }));
}, EXPLORE_DEFAULT_TIMEOUT_MS);   // → }, timeoutMs); where timeoutMs defaults to EXPLORE_DEFAULT_TIMEOUT_MS
```
`[VERIFIED: src/services/remoteExploreService.ts:294-308]`

### Current event consumption to replace
```ts
// src/services/ai/office/teamRunCoordinator.ts:1458-1465
onToolEvent: (event) => {
  if (event.phase !== 'call') return;              // D-05: remove this discard
  pushStep(agentId,
    event.name === 'read_skill' ? 'đã đọc skill' : 'đang gọi tool ' + event.name,
    event.args);
},
```
`[VERIFIED: src/services/ai/office/teamRunCoordinator.ts:1458-1465]`

### Id-merge precedent to follow
```ts
// src/components/ai/AiChatWidget.tsx:149-156
function mergeToolEvents(events: ChatTurnToolEvent[]): ChatTurnToolEvent[] {
  const byId = new Map<string, ChatTurnToolEvent>();
  for (const event of events) {
    const previous = byId.get(event.id);
    byId.set(event.id, { ...previous, ...event });
  }
  return [...byId.values()];
}
```
`[VERIFIED: src/components/ai/AiChatWidget.tsx:149-156]`

### Safe collapsed preview precedent
```tsx
// src/components/ai/AiChatWidget.tsx:162-230 (abridged) — collapsed by default, capped, safe render
const [expanded, setExpanded] = useState(false);
const detailsId = `tool-event-${event.id.replace(/[^A-Za-z0-9_-]/g, '-')}`;
<button type="button" aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpanded(p => !p)}>…</button>
{expanded && <pre style={{ whiteSpace: 'pre-wrap' }}>{event.args}</pre>}
```
`[VERIFIED: src/components/ai/AiChatWidget.tsx:162-230]`. For the new panel prefer a plain-text `<pre>{cappedPreview}</pre>` (no `dangerouslySetInnerHTML`), which matches the current debug modal (`TeamWorkspace.tsx:1148-1150`) and removes any XSS surface.

### Exact debug-modal/menu code to remove
```ts
// imports — TeamWorkspace.tsx:2-3
import { Alert, Avatar, Button, Dropdown, Modal, Splitter, Tag, Typography, theme } from 'antd';
import { BugOutlined, SettingOutlined } from '@ant-design/icons';
// state — :166-167
const [debugLogs, setDebugLogs] = useState<TeamDebugLog[]>([]);
const [debugModalOpen, setDebugModalOpen] = useState<boolean>(false);
// dropdown item — :894-899  |  modal — :1111-1175
```
Remove `Modal`, `BugOutlined`, `debugModalOpen`, the dropdown item and the whole `<Modal>` block; KEEP `debugLogs`/`setDebugLogs`/`TeamDebugLog`. `[VERIFIED: src/components/ai/office/TeamWorkspace.tsx:2-3,120-129,166-167,894-899,1111-1175]`

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Fixed 300 s wall clock | Per-call `timeoutSeconds` (60..900) → derived `timeoutMs` | Phase 44 (D-01/D-02) | Tunable exploration deadline; default behavior unchanged. |
| `call`-only steps, label dedup, results discarded | id-keyed call+result upsert with capped previews + payload status | Phase 44 (D-05) | Timeline shows real durations/status; popover still works if fields preserved. |
| Debug Prompt in Modal + dropdown | Prompt log tab in always-visible rail | Phase 44 (D-14/D-15) | Logs readable beside tool history; menu item intentionally gone. |
| `--allowedTools` alone (insecure) | `--restricted` headless run | Phase 43 post-review | Not touched by Phase 44; do not regress. |

**Deprecated/outdated:** none introduced. `--restricted`, prompt-after-`--`, JS-side watchdog, late-cancel guard and probe cache are current Phase-43 contracts and stay.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Concrete constant names `EXPLORE_MIN_TIMEOUT_SECONDS` / `EXPLORE_MAX_TIMEOUT_SECONDS` and helper name `clampExploreTimeoutSeconds` are planner choices, not existing names. | Standard Stack / Pattern 1 | Low — only naming; values 60/900/300 from D-01 are locked. |
| A2 | `explore_repo` result JSON uses `outcome: 'error'` / `detail: 'timeout'` fields (seen in `teamTools.ts:1506-1507` and service outcomes) for error-status derivation; exact keys should be confirmed against a fixture. | Pattern 2 / Pitfall 1 | Medium — a different key could render timeouts as "done"; a focused status test (D-17) catches it. |
| A3 | "Activity affordance in workspace header" can be a Button added beside the status chip / dropdown area (`TeamWorkspace.tsx:863-918`); exact placement is Claude's Discretion per D-10. | Architecture / UI-01 | Low — no locked position. |
| A4 | Tool-count stays 12 (no new tool). | Pitfall 8 | Low — verified from `teamTools.test.ts:81-82` and source. |

Note: environment is Node v26.13.0 / npm 11.20.0 here, while CLAUDE.md stack targets Node 24 LTS. Both satisfy Vitest 5 / tsc 7 engines; flagged for awareness, not a blocker.

## Open Questions

1. **Exact Vietnamese microcopy**
   - What we know: UI-SPEC §Copywriting Contract fixes the key strings (e.g. "Mở activity", "Chưa có tool call nào", "Hoạt động agent", status labels "xong/đang chạy/lỗi").
   - What's unclear: minor row-level copy (placeholder text for a running row's result) is left to discretion.
   - Recommendation: copy UI-SPEC verbatim for the pinned strings; use any clear phrasing for unpinned placeholders, and let tests assert only the recognizable tokens ("Timeline", "Prompt log", status, duration) per D-63 discretion.

2. **Whether the compact indicator popover stays**
   - What we know: it is not required to be removed; UI-SPEC prefers leaving it unchanged if not a second data path.
   - What's unclear: owner discretion (CONTEXT Discretion bullet 4) is unresolved.
   - Recommendation: leave `TeamActivityIndicator.tsx` unchanged and preserve `label`/`at`/`detail` in the upsert so it remains a thin reader of the same state — no second source of truth.

3. **Progress card elapsed/deadline source for `explore_repo`**
   - What we know: call event carries `startedAt` and the call args include `timeoutSeconds` (in capped `detail`/args); D-11 requires elapsed ÷ timeout bar.
   - What's unclear: whether to parse `timeoutSeconds` from the serialized args string or add a dedicated optional field to `AgentLiveStep` for the deadline.
   - Recommendation: add an additive optional field (e.g. `timeoutSeconds?`) to the step on the `explore_repo` call — but note this field name is NOT in the D-04 enumerated add-list, so either extend D-04 in phase docs or derive from args to avoid an unlisted value. Prefer deriving from args to stay within locked fields; flag as a discuss-point if the planner wants a dedicated field.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | tsc/Vitest tooling | ✓ | v26.13.0 (stack targets 24 LTS) | — |
| npm | scripts | ✓ | 11.20.0 | — |
| TypeScript (`npx tsc`) | typecheck gate | ✓ | 7.0.2 | — |
| Vitest | focused tests | ✓ | 5.0.2 (jsdom, globals) | — |
| @testing-library/react | component tests | ✓ | 16.3.3 | — |
| antd / icons | panel UI | ✓ | 6.6.5 / 6.3.4 | — |
| @testing-library/user-event | keyboard interaction tests | ✗ | — | Use `fireEvent` from @testing-library/react (already used across existing tests) |
| Tauri runtime | app runtime (only supported) | N/A for unit tests | — | UI walkthrough (D-17) needs a running desktop app; not required for focused Vitest/tsc gates |

**Missing dependencies with fallback:** `user-event` not installed → use `fireEvent` (fallback available).
**Missing dependencies with no fallback:** none for the automated gates.

## Validation Architecture

> Nyquist validation is enabled (`workflow.nyquist_validation: true` in `.planning/config.json`). This section supplies the data for Nyquist artifacts.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.2 + @testing-library/react 16.3.3 (jsdom) |
| Config file | `vite.config.ts` (`test` block at :65-80: jsdom, globals, setupFiles `./tests/setup.ts`, fileParallelism false) |
| Quick run command | `npx vitest run <one focused test file>` (per project memory: never run full suite) |
| Full suite command | `npx vitest run` (exists but DON'T run — over an hour per project memory) |
| Typecheck | `npx tsc --noEmit -p tsconfig.json` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TO-01 (D-01) | clamp 60/900/default 300; non-integer/out-of-range → 300 | unit | `npx vitest run tests/services/remoteExploreService.test.ts -t timeout` | ✅ (extend) |
| TO-01 (D-03a) | tool def advertises `timeoutSeconds` property + range/default in description | unit | `npx vitest run tests/services/ai/office/teamTools.test.ts -t timeoutSeconds` | ✅ (extend) |
| TO-01 (D-03b/c) | watchdog timer receives derived ms; cancel still fires | unit (fake timers) | `npx vitest run tests/services/remoteExploreService.test.ts -t timeout` | ✅ (extend, uses `:188-265` seam) |
| TO-01 (D-02 wiring) | handler passes derived `timeoutMs` to `runRemoteExplore` | unit (mock) | `npx vitest run tests/services/ai/office/teamToolsGitRead.test.ts -t explore_repo` | ✅ (extend Block E) |
| PANEL-01 (D-05) | call+result upsert into one row by id; result no longer discarded | unit | `npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts -t "tool event"` | ✅ (extend) |
| PANEL-01 (D-06/D-07) | args/result capped at 8000; max 200 rows | unit | `npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts -t "tool event"` | ✅ (extend) |
| PANEL-01 (D-08) | status from payload: refused/error → error, success → done, call-only → running | unit | `npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts -t status` | ✅ (extend) |
| UI-01 (D-09..D-12) | rail renders tabs/filter/progress/rows; details collapsed; long previews no overflow; a11y attrs | component | `npx vitest run tests/components/ai/office/AgentActivityPanel.test.tsx` | ❌ Wave 0 |
| LOG-01 (D-14) | Prompt log tab renders preserved log fields; clear action present | component | `npx vitest run tests/components/ai/office/AgentActivityPanel.test.tsx -t "Prompt log"` | ❌ Wave 0 |
| LOG-01 (D-15/D-16) | debug dropdown item gone; debug Modal gone | component | `npx vitest run tests/components/ai/office/TeamWorkspaceSteer.test.tsx` (or new `TeamWorkspaceDebugMenu.test.tsx`) | ⚠️ extend existing / ❌ new |
| VERIFY-01 (C-15) | real UI walkthrough — panel + timeout observable | manual (Tauri) | `/gsd-verify-work` — no automated command | manual |

### Sampling Rate

- **Per task commit:** `npx vitest run <focused files touched>` + `npx tsc --noEmit -p tsconfig.json`
- **Per wave merge:** all focused files for the phase in one `npx vitest run <files>` invocation + typecheck
- **Phase gate:** all focused suites green + typecheck + `/gsd-code-review` + `/gsd-ui-review` before `/gsd-verify-work` (D-17)

### Wave 0 Gaps

- [ ] `tests/components/ai/office/AgentActivityPanel.test.tsx` — fixture-driven panel tests (tabs, filter, progress card, collapsed expansion, 8000-char cap no-overflow, a11y attributes) covering UI-01/LOG-01.
- [ ] Coordinator "tool event" test block — id-upsert, both phases, status derivation, caps (no new file needed; extend `teamRunCoordinator.test.ts`).
- [ ] `timeoutSeconds` schema/clamp/watchdog cases in `remoteExploreService.test.ts` / `teamTools.test.ts` / `teamToolsGitRead.test.ts`.
- [ ] Debug-menu-removal assertion (extend an existing `TeamWorkspace*.test.tsx` or add `TeamWorkspaceDebugMenu.test.tsx`).
- [ ] No new framework/config install needed (Vitest + RTL present).

## Security Domain

`security_enforcement` is enabled (absent = enabled; config sets `true`, ASVS level 1, block on high). This phase renders untrusted tool output and moves a debug surface, so the section is required.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no | No auth surface; Tauri local single user |
| V3 Session Management | no | No sessions introduced |
| V4 Access Control | no | No roles/permissions; single-user app |
| V5 Input Validation | yes | Clamp `timeoutSeconds` to 60..900 at the tool trust boundary (non-finite/invalid → 300, never refuse — D-01); defensively `JSON.parse` tool result payloads in try/catch (Pitfall 1) |
| V6 Cryptography | no | No crypto touched; existing backup encryption unchanged |

### Known Threat Patterns for React/TypeScript + untrusted AI tool output

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via tool args/result rendered as HTML | Tampering | Plain-text `<pre>` / `Typography.Text code` for previews; never `dangerouslySetInnerHTML` on raw tool output (D-06/D-12). If markdown is used, `renderSafeMarkdown` escapes raw HTML (`markdown.ts:7-14,137`). |
| Prompt-injection text inside tool output treated as instructions | Tampering / Elevation | Render as **data only**; never auto-expand (D-06); labels like "Tham số"/"Kết quả" mark it as displayed content. Owner already wraps remote reports with `wrapUntrusted` (`teamTools.ts:1508-1511`). |
| DoS via oversized tool output / unbounded timeline | Denial of service | Cap args + result preview at 8 000 chars before storing (D-06); cap timeline at `MAX_LIVE_STEPS = 200` (`:381`); own `maxHeight`/`overflow:auto` on `<pre>` (UI-SPEC). |
| Long timeout weaponized to strand a turn | Denial of service | Hard upper bound 900 s at clamp (D-01); JS watchdog + abort still cancel the remote (D-02); no remote command injection — timeout never enters the shell string. |
| Debug prompt / system prompt disclosure | Information disclosure | Prompt log stays local runtime-only (D-07); no new export/Dexie/backup path; removing the menu item reduces casual exposure but is intentional (D-16). No data leaves the app. |

**Key security invariant:** Phase 44 adds no new data egress. The only new input is a numeric tuning knob (clamped, never passed to a shell); the only new rendering is untrusted text shown as escaped/capped data. Do not regress Phase 43's `--restricted` remote contract.

## Sources

### Primary (HIGH confidence — source-of-truth files opened this session)
- `src/services/remoteExploreService.ts:19-32,56-60,210-217,223-329` — timeout constant, clamp pattern, deps seam, watchdog/cancel/abort/cap (all `[VERIFIED]`).
- `src/services/ai/office/teamTools.ts:30-42,57-128,381-408,1453-1524,1526-1559` — tool context, refusal shape, `explore_repo` definition/handler, string return contract.
- `src/services/ai/office/teamRunCoordinator.ts:131-164,375-381,870-903,1298-1313,1438-1465,2019-2024` — snapshot, step ceiling, pushStep, deps builder, onToolEvent, state resets.
- `src/types/aiOffice.ts:261-281` — `AgentLiveStep`/`AgentRunState` runtime-only contract.
- `src/components/ai/runtime/chatTurnRuntime.ts:33-41,386-405` — `ChatTurnToolEvent` shape + call/result emission.
- `src/components/ai/AiChatWidget.tsx:145-234` — `mergeToolEvents`, collapsed capped `ToolEventBadge`.
- `src/components/ai/office/TeamWorkspace.tsx:2-3,115-167,340-365,755-787,794-830,832-918,1052-1175` — debug log capture/shape, Splitter, header/menu, debug modal.
- `src/components/ai/office/TeamActivityIndicator.tsx:44-88,98-211` — compact popover fields consumed.
- `src/views/AgentControlView.tsx:148-215` — 3-pane Splitter precedent.
- `src/utils/markdown.ts:7-14,137` — `renderSafeMarkdown` HTML escaping.
- `.planning/phases/44-.../44-CONTEXT.md`, `44-UI-SPEC.md`, `agent-activity-panel-draft.html` — locked decisions + approved design contract.
- `.planning/phases/43-.../43-04-SUMMARY.md` — watchdog origin + post-review pitfalls.
- `.planning/config.json`, `tsconfig.json:14-16`, `vite.config.ts:65-80`, `package.json` — gates, strictness, test infra, versions.

### Installed-version verification (HIGH confidence)
- `node -e "require('<pkg>/package.json').version"` this session: antd 6.6.5, @ant-design/icons 6.3.4, react/react-dom 19.3.0, typescript 7.0.2, vitest 5.0.2, @testing-library/react 16.3.3, dayjs 1.11.23.

### Tertiary (LOW confidence — flagged, see Assumptions Log)
- Constant/helper **names** for the timeout clamp, `deriveStatus` naming, and the `explore_repo` result-key assumption for status (A1/A2) — planner should confirm against a result fixture.

No external web docs were consulted: this is a code-only phase with all decisions locked upstream and no new dependencies; every claim above is grounded in files read this session.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions from installed manifests; no new deps.
- Timeout plumbing: HIGH — exact timer/clamp/deps lines read; boundary values locked in D-01.
- Coordinator upsert: HIGH — event shape, current handler, merge precedent and caps all read; one LOW note on result-key (A2).
- Panel UI: HIGH — integration lines, token system, a11y/overflow contract from approved UI-SPEC + draft; exact microcopy is discretion.
- Pitfalls: HIGH — derived from Phase 43 post-review defects and verified code paths.

**Research date:** 2026-11-17
**Valid until:** 2026-12-17 (stable codebase patterns; re-check if Phase 43 service or antd version changes)
