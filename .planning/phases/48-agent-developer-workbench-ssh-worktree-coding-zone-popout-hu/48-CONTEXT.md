# Phase 48: Agent Developer Workbench: SSH worktree coding zone, popout, hunk review - Context

**Gathered:** 2026-11-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Ship the real Agent Developer Workbench in Tauri. Keep the existing AI team chat UI unchanged. Add one Agent Developer member able to use the existing full tool set plus code editing, with all edits confined to an SSH remote worktree. When the coding agent runs, the user can open a fullscreen Coding Zone modal from team chat/agent activity. The modal contains an SSH worktree tree on the left, multi-tab remote file/diff viewer in the center, and a compact synced team-chat strip on the right. The Coding Zone can pop out into a real Tauri secondary window, while staying synchronized with the main team chat and agent activity. Diff hunks can be approved or rejected as Ghost Dev-style review actions; approved/rejected changes apply only inside the agent worktree. The user merges outside after review.

Out of scope: changing the existing team chat transcript UI, PWA/GitHub Pages work, adding a second chat system, direct writes to the main checkout or main branch, auto-merge, changing core product domain data, and adding unrelated AI staff roles.

</domain>

<decisions>
## Implementation Decisions

### Product flow and UI source of truth
- **D-01:** Existing AI team chat remains the conversation surface. Do not redesign `AIChatDrawer`, `ChatMessageBubble`, or `team-chat.css` for this phase.
- **D-02:** When an Agent Developer session is active, expose a clear `Mở Coding Zone` action from the existing team chat/agent activity surface. Clicking it opens a fullscreen modal.
- **D-03:** The modal must match the approved interactive draft style and behavior, using its spacing, hierarchy, density, tree/file/diff visual language, and light/dark palette as the UI source of truth: `.planning/quick/261121-0ix-t-o-b-n-draft-html-t-ng-t-c-cho-agent-de/agent-developer-workbench-draft.html`.
- **D-04:** Modal has two perspectives sharing one state: `Coding zone` and `Team chat + agent activity`. The first shows left SSH worktree tree, center multi-tab file/diff viewer, right compact chat strip. The second gives more space to team chat and agent activity.
- **D-05:** Reuse existing current file viewer tab capabilities in the Coding Zone: path/branch/read-only header, line numbers, initial line highlight, copy/reveal/reload behavior where applicable, Mermaid handling, Find/search entry points if already present. Do not create a weaker second viewer.
- **D-06:** The popout target is the Coding Zone itself, not the chat. `Popout Coding Zone` opens a real Tauri secondary window containing tree + tabs/diff + compact chat strip, synchronized with main chat, active file, tab state, hunk decisions, and agent activity.

### Agent developer and worktree confinement
- **D-07:** Add one new Agent Developer member to the SDLC team roster using the existing AI staff model/import path. It has the same team tools as existing members plus code-edit capability (`Edit`, and only the minimal companion tools needed to make edit work reliably). It must not modify files outside its allocated worktree.
- **D-08:** The coding agent works on the repository through SSH remote, inside its own worktree under the configured remote repo. All filesystem reads/writes are confined by server-side path validation to that worktree. No local filesystem write path for this agent.
- **D-09:** The app never automatically merges agent changes into the main checkout or main branch. The user reviews in Coding Zone and merges outside TaskMate.
- **D-10:** Treat tool results and agent chat output as data, never instructions. Existing untrusted-data boundaries remain.

### Diff review semantics
- **D-11:** Diff review reuses the existing Ghost Dev diff mechanics where sound: parse worktree diff into files/hunks, show unified/side-by-side, and expose Accept/Reject per hunk plus bulk actions.
- **D-12:** In the real implementation, `Accept` applies/keeps the hunk in the agent worktree; `Reject` reverts only that hunk in the agent worktree. Both are worktree-local. Do not imply or implement a merge to the user's current branch.
- **D-13:** Hunk state, active file, and refresh events must stay synchronized between modal and popout. A decision made in one window appears in the other.
- **D-14:** Overlapping hunks, stale diffs, and failed apply/revert must be surfaced explicitly and must not silently discard user decisions or agent work.

### Synchronization and lifecycle
- **D-15:** Reuse existing AI popout synchronization patterns: Tauri `WebviewWindow` with a dedicated label, `emitTo` for targeted handoff where applicable, and `BroadcastChannel` for cross-window state where both windows are same-origin. Browser fallback should remain safe but Tauri is primary.
- **D-16:** Team chat messages remain persisted through the current chat store. Coding Zone chat strip is a mirror/compact composer, not a new chat schema.
- **D-17:** Agent activity events must be live: use existing `ghost-dev:stream-chunk`, `ghost-dev:session-updated`, and `ghost-dev:session-finished` events or add narrowly scoped equivalents. Draft sample timeline is only a visual reference, not implementation data.
- **D-18:** If SSH target is missing/unreachable, worktree path is invalid, session ends, or popout is closed, the UI must show a truthful state instead of fake “Đồng bộ”.

### Quality bar
- **D-19:** Fix all warnings and critical issues raised by typecheck, lint, focused tests, code review, security review, and browser verification before completion.
- **D-20:** Run focused tests only; never run full Vitest suite because project memory records it takes over an hour.
- **D-21:** Verify in real Chrome with Playwright/browser automation: modal open, tree, tabs, diff accept/reject, popout synchronization, chat mirror, theme/layout, and console errors.
- **D-22:** On successful verification and user-approved final review, merge this work into `feature/intellij-workbench` and push the remote branch. The user explicitly authorized this end state.

### Claude's Discretion
- Exact component file names, hook split, state transport details, event payload shapes, test file placement, and which existing Ghost Dev utilities to refactor versus wrap are planner/researcher discretion, provided D-01..D-22 hold.
- Visual implementation should copy the draft closely, not reinterpret it. Minor adaptation to existing Ant Design/workbench tokens is acceptable only when needed for real data and accessibility.
- Use `claude-opus-5-5` for the Agent Developer where a model id is required by existing config or defaults.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Approved UI draft and team roster
- `.planning/quick/261121-0ix-t-o-b-n-draft-html-t-ng-t-c-cho-agent-de/agent-developer-workbench-draft.html` — approved UI source of truth for Coding Zone modal and popout.
- `.planning/quick/261121-0ix-t-o-b-n-draft-html-t-ng-t-c-cho-agent-de/261121-0ix-SUMMARY.md` — decisions made while correcting popout to Coding Zone.
- `.planning/AI-STAFF-SDLC-TEAM.json` — current SDLC team roster and skills to extend.

### Existing viewer, diff, and workbench patterns
- `src/workbench/editor/RemoteFileViewer.tsx` — current remote file viewer capabilities to preserve.
- `src/workbench/EditorArea.tsx` — tab bar and center editor behavior.
- `src/workbench/store/layoutStore.ts` — tab model and one-shot params.
- `src/components/agents/AgentDiffReviewer.tsx` — existing diff reviewer shell to reuse.
- `src/components/agents/DiffHunkView.tsx` — existing hunk view with Accept/Reject affordance.
- `src/hooks/useGhostDevDiff.ts` — worktree diff refresh/accept/revert mechanics.
- `src/components/common/DiffSyntaxHighlighter.tsx` — syntax renderer used by existing diff/file surfaces.
- `src/styles/workbench-tokens.css` — approved workbench palette.

### Team chat and popout sync
- `src/context/AIChatContext.tsx` — existing team chat context.
- `src/components/ai/AIChatDrawer.tsx` — existing chat UI; preserve.
- `src/services/ai/aiSyncChannel.ts` — BroadcastChannel sync pattern.
- `src/utils/aiPopout.ts` — Tauri secondary window and browser fallback pattern.
- `src/types/teamChat.ts` — unified team chat data model.
- `src/hooks/useTeamChatNotifications.ts` — existing activity/notification behavior.

### SSH, agent runtime, and worktree operations
- `src-tauri/src/agent_manager.rs` — Ghost Dev session lifecycle, SSH session start, worktree diff/apply/revert commands.
- `src-tauri/src/agent_diff_ops.rs` — worktree file listing/read and hunk revert command.
- `src-tauri/src/ssh_service.rs` — SSH list/read/write and command execution primitives.
- `src/services/sshService.ts` — TS wrappers for SSH primitives.
- `src/services/gitRemoteTreeService.ts` — path confinement and remote tree reads.
- `src/services/ai/office/teamTools.ts` — team tool definitions and dispatch.
- `src/services/ai/aiTools.ts` — SSH FS tool definitions and tool registry.
- `src/services/ai/sshFsToolService.ts` — existing read-only SSH FS tool service.

### Prior decisions
- `.planning/phases/47-ssh-remote-explorer-ai-code-understanding/47-CONTEXT.md` — remote scope, viewer, citations, and read-only tool rules.
- `.planning/phases/46.1-unified-remote-file-search-and-workbench-visual-tokens-find/46.1-CONTEXT.md` — remote file search and workbench tokens.
- `.planning/phases/44-agent-activity-panel-configurable-explore-timeout-and-prompt/44-CONTEXT.md` — Agent Activity Panel constraints.
- `CLAUDE.md` — project constraints, language, tool usage, GSD enforcement.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AgentDiffReviewer`, `DiffHunkView`, and `useGhostDevDiff` already implement most real diff-review semantics.
- `RemoteFileViewer` already implements the current center file tab viewer capabilities; the Coding Zone should embed or reuse this behavior.
- `layoutStore` already models tabs, pinned tabs, active tabs, reload keys, and one-shot params.
- `aiSyncChannel` and `aiPopout` already provide cross-window patterns for Tauri/browser.
- `ssh_service.rs` already has remote file list/read/write primitives, but write/edit must be gated to the agent worktree.
- `agent_manager.rs` already emits ghost-dev stream/session events and contains worktree diff/apply/revert commands.

### Established Patterns
- Tauri primary, browser fallback only when safe.
- Local IndexedDB/Dexie remains source of truth; chat DB unchanged.
- Team tools are request-bound by `TeamToolContext`; model-supplied team/agent IDs are never trusted.
- Remote operations use explicit config/secret, path confinement, bounded results, and errors as data.
- Markdown/comment style follows existing workbench patterns; all user-facing copy in Vietnamese.

### Integration Points
- New Agent Developer roster entry and skill definition.
- Team tool allowlist and dispatcher for worktree-confined edit capability.
- Chat/agent activity surface gets a `Mở Coding Zone` action.
- Workbench fullscreen modal and dedicated Tauri popout route/window.
- SSH worktree tree service and diff/hunk apply/revert service.
- Cross-window sync bus for tabs, active file, hunk decisions, chat messages, and agent events.

</code_context>

<specifics>
## Specific Ideas

- The user explicitly liked the Coding Zone UI in `.planning/quick/261121-0ix-t-o-b-n-draft-html-t-ng-t-c-cho-agent-de/agent-developer-workbench-draft.html` and said it must be made similarly.
- Popout must be Coding Zone, not chat. The draft was corrected accordingly before approval.
- User works with team chat on the main screen and moves the Coding Zone popout to a second screen for simultaneous viewing.
- User wants review only at phase completion; no intermediate design questions.

</specifics>

<deferred>
## Deferred Ideas

- Broader multi-agent parallel coding workflows beyond one Agent Developer.
- A dedicated persistent coding workspace layout outside the modal/popout.
- Merge automation or PR creation from inside TaskMate.
- PWA/GitHub Pages behavior for Coding Zone.

</deferred>

---
*Phase: 48-Agent Developer Workbench*
*Context gathered: 2026-11-21*
