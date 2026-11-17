# Phase 44: Agent Activity Panel, Configurable Explore Timeout and Prompt Log - Context

**Gathered:** 2026-11-17
**Status:** Ready for planning
**Owner decision:** One phase, full quality pipeline, zero critical and zero warning findings; push once to `feature/intellij-workbench` only after review and verification are clean. UI reference is `.planning/agent-activity-panel-draft.html` — treat it as the approved visual direction, not as pixel-perfect production code.

## Phase Boundary

In scope:

- `explore_repo` accepts an optional `timeoutSeconds` (60..900, default 300). The existing JS-side watchdog, stream cancellation and abort wiring are kept; only the deadline becomes call-configurable.
- A collapsible right-side Agent Activity Panel inside `TeamWorkspace` shows a live tool-call/result timeline per agent: status, tool name, timestamp, duration, serialized arguments, bounded result preview, agent filter, and an `explore_repo` progress/deadline card.
- The existing Debug Prompt data (`debugLogs`) remains available but moves from the `Modal` + dropdown item into a **Prompt log** tab inside the same panel. Removing the standalone modal/menu is part of the phase.
- Tests, typecheck, code review, UI review and verification required by GSD quality gates; fix every critical and warning finding before completion.

Out of scope:

- Persisting tool events or prompt logs to Dexie/backup. All new inspection state stays runtime-only.
- Streaming the remote headless Claude's internal steps. The panel shows the app-level `explore_repo` call and its deadline, not which file the nested CLI is reading.
- Changing `git_read`, `grep`, paging, or the remote headless security contract beyond passing the timeout value.
- New npm dependencies, PWA/GitHub Pages behavior, skill-body changes, or changes to `AIDebugModal.tsx` in the ordinary chat drawer.

<decisions>
## Implementation Decisions

### Explore timeout

- **D-01:** `explore_repo` gains `timeoutSeconds`, integer-clamped to 60..900, default 300. Invalid or out-of-range input falls back to 300 rather than refusing — it is a tuning knob, not a security boundary. Keep `EXPLORE_DEFAULT_TIMEOUT_MS = 300_000` as the default exported contract.
- **D-02:** The value flows `teamTools.ts` → `runRemoteExplore(..., { timeoutMs })` → the existing JS watchdog. Do **not** add a remote `timeout(1)` command: stock macOS lacks it and the current portable cancel design is load-bearing (Phase 43 D-03). Abort handling, late-cancel, 4x stdout buffer, and 12 000-char report cap are unchanged.
- **D-03:** The tool definition description states the accepted range and default; a focused test asserts (a) the schema advertises the property, (b) clamping at both boundaries, and (c) the watchdog receives the derived milliseconds. Zero hits/absence of CLI behavior stays as in Phase 43.

### Agent Activity Panel data contract

- **D-04:** Keep `AgentRunState.steps` / `AgentLiveStep` (`src/types/aiOffice.ts`) as the office runtime source. Extend it additively: `toolName?`, `phase?: 'call' | 'result'`, `startedAt?`, `endedAt?`, `durationMs?`, `status?: 'running' | 'done' | 'error'`, `resultPreview?`. Existing fields `id`, `label`, `at`, `detail?` remain so the small activity popover can keep working unchanged if needed.
- **D-05:** Consume **both** `phase === 'call'` and `phase === 'result'` from `onToolEvent` in `teamRunCoordinator.ts`. A call creates/updates one row keyed by tool event id; a result updates that same row with duration, status, and a bounded preview. Replace the current label-based dedup (`pushStep`) with id-based upsert. Do not throw away result events as today (`if (event.phase !== 'call') return`).
- **D-06:** Arguments and result preview are serialized strings, capped before storing in runtime state: arguments at 8 000 chars, result preview at 8 000 chars. The cap is a UI preview; the model still receives the full tool result. Content is untrusted data — render as text/sanitized markdown only, never as instructions, and never auto-expand details.
- **D-07:** Runtime-only, capped timeline (max 200 rows, matching existing `MAX_LIVE_STEPS`). No Dexie table, no backup schema, no persisted transcript extension. Reset on requeue/team teardown as existing agent state does.
- **D-08:** A tool result that carries `{ refused: true, code }`, `error`, or a thrown tool error is shown with error status; successful results are done; a call without result is running. Status must be derived from the event payload, not inferred from a name.

### Panel UI and placement

- **D-09:** Add a right-side rail to the existing `Splitter` in `TeamWorkspace.tsx:790-830`, alongside the 300px `TeamSidebar` and center transcript. Precedent: `AgentControlView.tsx:148-215` uses a 3-pane Splitter. Prefer this over a modal/Drawer so transcript and inspection are visible together on desktop.
- **D-10:** The rail has an explicit open/close control in its header and an “Activity” affordance in the workspace header. Default state: **open** on desktop, because the user wants the detail visible; remember the per-user open state via existing local UI-state patterns only if already present — do not add a new persistence mechanism for it.
- **D-11:** Follow the approved draft structure: header + agent filter pills (`all` + current roster), two tabs (`Timeline`, `Prompt log`), progress card for running `explore_repo`, then reverse-chronological event rows. Row shows status icon, tool name, agent, timestamp, duration. Expanding a row reveals args and result preview in capped `<pre>`/`Typography.Text code`, with `aria-expanded`/`aria-controls` and keyboard parity.
- **D-12:** The panel reuses Ant Design tokens/components already in the app (Button, Tabs/Segmented or accessible equivalent, Tag, Empty, Tooltip). No new CSS framework. Long values wrap/scroll inside their own container; the rail never causes horizontal page overflow. Use `renderSafeMarkdown` or plain text for previews; never `dangerouslySetInnerHTML` on raw tool output.
- **D-13:** UI-SPEC is required for this phase (`/gsd-ui-phase`). The draft HTML is the design reference; the UI-SPEC must record token mapping, states, responsive behavior, accessibility and the exact tab migration decision before planning.

### Debug Prompt migration

- **D-14:** Keep the existing `debugLogs` capture and data shape unchanged. Move its display into the rail's **Prompt log** tab; preserve clear logs and copy/inspect behavior already present in the modal where practical.
- **D-15:** Remove the `Debug Prompt (${debugLogs.length})` dropdown item (`TeamWorkspace.tsx:894-899`) and the `<Modal title="Debug: Lịch sử Prompt gửi tới AI trong nhóm">` (`TeamWorkspace.tsx:1111-1124`), plus now-unused state/handlers/imports. Do **not** touch `AIDebugModal.tsx` used by the ordinary chat drawer (`AIChatDrawer.tsx:2282`).
- **D-16:** If the panel is closed, Prompt log is not reachable from the dropdown anymore — this is intentional; the Activity affordance opens the rail. Tests must cover that the menu item is gone and that the tab renders preserved log content.

### Quality and verification

- **D-17:** Required verification: focused Vitest suites for coordinator event upsert, tool timeout schema/clamping/watchdog, and new panel component behavior with fixture events; `npx tsc --noEmit -p tsconfig.json`; `/gsd-code-review`, `/gsd-ui-review`, and `/gsd-verify-work`. Fix all critical and warning findings; info findings may remain only with an explicit rationale in the phase docs.
- **D-18:** Push is a separate final step after verification is green: one `git push` to `feature/intellij-workbench` carrying the whole phase. No push halfway through.

### Claude's Discretion

- Exact component filenames and whether the rail is a dedicated `AgentActivityPanel.tsx` plus a small wrapper in `TeamWorkspace.tsx`.
- Whether AntD `Tabs` or a small accessible custom tab strip matches the surrounding code best; the draft uses a simple tab strip.
- Exact Vietnamese microcopy, as long as “Timeline”, “Prompt log”, status and duration are recognizable in the UI and tests.
- Whether the current small activity popover remains as a compact fallback; if it does, it must not duplicate the new data path or become a second source of truth.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Owner-approved design reference
- `.planning/agent-activity-panel-draft.html` — approved visual direction for the right rail, event rows, status, filter, progress card and Prompt log tab.

### Prior phase contracts
- `.planning/phases/43-repo-reading-that-scales-grep-paged-read-and-remote-headless/43-CONTEXT.md` — D-03 `explore_repo` contract, D-05 tier guidance, 300s watchdog origin; post-review fixes are recorded in `43-04-SUMMARY.md`.
- `.planning/phases/42-read-only-git-inspection-for-the-reviewer-agent/42-CONTEXT.md` — team tool read-only/untrusted-wrap patterns that must not regress.
- `.planning/REQUIREMENTS.md` — `AIO-READ-09`, `AIO-READ-10` and the milestone's verification-honesty rule.
- `CLAUDE.md` — Tauri primary runtime; no PWA/GitHub Pages validation unless asked.

### Source contracts — read before changing
- `src/services/remoteExploreService.ts` — `EXPLORE_DEFAULT_TIMEOUT_MS`, `buildExploreCommand`, `runRemoteExplore`, watchdog/cancel/abort and cap behavior.
- `src/services/ai/office/teamTools.ts` — `TEAM_TOOL_DEFINITIONS`, `exploreRepo` handler, `TeamToolContext.signal`.
- `src/services/ai/office/teamRunCoordinator.ts` — `onToolEvent` consumer around :1458, `pushStep` around :881, `AgentRunState` initialization/reset.
- `src/types/aiOffice.ts` — `AgentLiveStep`, `AgentRunState`.
- `src/components/ai/runtime/chatTurnRuntime.ts` — `ChatTurnToolEvent` canonical call/result event shape.
- `src/components/ai/AiChatWidget.tsx` — `mergeToolEvents`, `ToolEventBadge`, safe markdown/capping precedent.
- `src/components/ai/office/TeamWorkspace.tsx` — 2-pane Splitter at :790-830, activity indicator injection at :757-767, debug dropdown at :894-899, debug modal at :1111-1124.
- `src/components/ai/office/TeamActivityIndicator.tsx` — existing compact `StepRow` to preserve or intentionally supersede.
- `src/views/AgentControlView.tsx` — 3-pane Splitter precedent for a right-side detail rail.
- Relevant tests: `tests/services/remoteExploreService.test.ts`, `tests/services/ai/office/teamToolsGitRead.test.ts`, `tests/services/ai/office/teamRunCoordinator.test.ts`, `tests/services/ai/office/teamPrompts.test.ts`.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ChatTurnToolEvent` already carries `id`, `name`, `phase`, `args`, `durationMs`, `result`; `mergeToolEvents` in `AiChatWidget.tsx:149-157` is the canonical call+result pairing pattern.
- `AgentRunState.steps` is already a runtime-only, capped, per-agent step list with timestamps and expandable argument details.
- `Splitter` in `TeamWorkspace.tsx` and the 3-pane precedent in `AgentControlView.tsx` make a right rail a layout extension, not a new shell.
- `debugLogs` already holds the prompt history; only its presentation moves.

### Established Patterns
- Tool results are untrusted data; previews must be bounded and never auto-expanded.
- Refusals/errors are returned values in tool results, not thrown past the tool boundary.
- Runtime UI state stays out of Dexie; backup schema is untouched.
- Accessibility: `aria-expanded`/`aria-controls`, keyboard parity, theme tokens from Ant Design.

### Integration Points
- `teamRunCoordinator.ts` is where tool events become agent-visible state; both phases must be consumed here.
- `TeamWorkspace.tsx` owns the Splitter, debug dropdown/modal, and where `TeamActivityIndicator` is injected into `AiChatWidget`.
- `remoteExploreService.ts` owns the watchdog; only the timeout source changes.
</code_context>

<specifics>
## Specific Ideas

The owner approved the HTML draft's information architecture: status icon + tool name + agent + timestamp + duration per event; expandable argument/result blocks; agent filter pills; `explore_repo` elapsed/deadline bar; and a second tab that absorbs the Debug Prompt modal. The draft itself uses sample data and illustrative copy; production must use live events and the project's Ant Design token system.
</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

### Explicitly not in this phase
- Streaming nested remote Claude Code tool steps into the panel.
- Persisting inspection history across app restarts.
- Renaming or relocating the ordinary chat drawer's `AIDebugModal`.
</deferred>

---
*Phase: 44-Agent Activity Panel, Configurable Explore Timeout and Prompt Log*
*Context gathered: 2026-11-17*
