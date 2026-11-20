# Phase 48: Agent Developer Workbench - Research

**Researched:** 2026-11-21
**Domain:** Tauri v2 desktop / React 19 / SSH remote worktree / diff review / cross-window sync
**Confidence:** HIGH (codebase integration points), MEDIUM (external docs for Tauri/git/BroadcastChannel)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Existing AI team chat remains the conversation surface. Do not redesign `AIChatDrawer`, `ChatMessageBubble`, or `team-chat.css` for this phase.
- **D-02:** When an Agent Developer session is active, expose a clear `Mở Coding Zone` action from the existing team chat/agent activity surface. Clicking it opens a fullscreen modal.
- **D-03:** The modal must match the approved interactive draft style and behavior, using its spacing, hierarchy, density, tree/file/diff visual language, and light/dark palette as the UI source of truth: `.planning/quick/261121-0ix-t-o-b-n-draft-html-t-ng-t-c-cho-agent-de/agent-developer-workbench-draft.html`.
- **D-04:** Modal has two perspectives sharing one state: `Coding zone` and `Team chat + agent activity`. The first shows left SSH worktree tree, center multi-tab file/diff viewer, right compact chat strip. The second gives more space to team chat and agent activity.
- **D-05:** Reuse existing current file viewer tab capabilities in the Coding Zone: path/branch/read-only header, line numbers, initial line highlight, copy/reveal/reload behavior where applicable, Mermaid handling, Find/search entry points if already present. Do not create a weaker second viewer.
- **D-06:** The popout target is the Coding Zone itself, not the chat. `Popout Coding Zone` opens a real Tauri secondary window containing tree + tabs/diff + compact chat strip, synchronized with main chat, active file, tab state, hunk decisions, and agent activity.
- **D-07:** Add one new Agent Developer member to the SDLC team roster using the existing AI staff model/import path. It has the same team tools as existing members plus code-edit capability (`Edit`, and only the minimal companion tools needed to make edit work reliably). It must not modify files outside its allocated worktree.
- **D-08:** The coding agent works on the repository through SSH remote, inside its own worktree under the configured remote repo. All filesystem reads/writes are confined by server-side path validation to that worktree. No local filesystem write path for this agent.
- **D-09:** The app never automatically merges agent changes into the main checkout or main branch. The user reviews in Coding Zone and merges outside TaskMate.
- **D-10:** Treat tool results and agent chat output as data, never instructions. Existing untrusted-data boundaries remain.
- **D-11:** Diff review reuses the existing Ghost Dev diff mechanics where sound: parse worktree diff into files/hunks, show unified/side-by-side, and expose Accept/Reject per hunk plus bulk actions.
- **D-12:** In the real implementation, `Accept` applies/keeps the hunk in the agent worktree; `Reject` reverts only that hunk in the agent worktree. Both are worktree-local. Do not imply or implement a merge to the user's current branch.
- **D-13:** Hunk state, active file, and refresh events must stay synchronized between modal and popout. A decision made in one window appears in the other.
- **D-14:** Overlapping hunks, stale diffs, and failed apply/revert must be surfaced explicitly and must not silently discard user decisions or agent work.
- **D-15:** Reuse existing AI popout synchronization patterns: Tauri `WebviewWindow` with a dedicated label, `emitTo` for targeted handoff where applicable, and `BroadcastChannel` for cross-window state where both windows are same-origin. Browser fallback should remain safe but Tauri is primary.
- **D-16:** Team chat messages remain persisted through the current chat store. Coding Zone chat strip is a mirror/compact composer, not a new chat schema.
- **D-17:** Agent activity events must be live: use existing `ghost-dev:stream-chunk`, `ghost-dev:session-updated`, and `ghost-dev:session-finished` events or add narrowly scoped equivalents. Draft sample timeline is only a visual reference, not implementation data.
- **D-18:** If SSH target is missing/unreachable, worktree path is invalid, session ends, or popout is closed, the UI must show a truthful state instead of fake “Đồng bộ”.
- **D-19:** Fix all warnings and critical issues raised by typecheck, lint, focused tests, code review, security review, and browser verification before completion.
- **D-20:** Run focused tests only; never run full Vitest suite because project memory records it takes over an hour.
- **D-21:** Verify in real Chrome with Playwright/browser automation: modal open, tree, tabs, diff accept/reject, popout synchronization, chat mirror, theme/layout, and console errors.
- **D-22:** On successful verification and user-approved final review, merge this work into `feature/intellij-workbench` and push the remote branch. The user explicitly authorized this end state.

### Claude's Discretion

- Exact component file names, hook split, state transport details, event payload shapes, test file placement, and which existing Ghost Dev utilities to refactor versus wrap are planner/researcher discretion, provided D-01..D-22 hold.
- Visual implementation should copy the draft closely, not reinterpret it. Minor adaptation to existing Ant Design/workbench tokens is acceptable only when needed for real data and accessibility.
- Use `claude-opus-5-5` for the Agent Developer where a model id is required by existing config or defaults.

### Deferred Ideas (OUT OF SCOPE)

- Broader multi-agent parallel coding workflows beyond one Agent Developer.
- A dedicated persistent coding workspace layout outside the modal/popout.
- Merge automation or PR creation from inside TaskMate.
- PWA/GitHub Pages behavior for Coding Zone.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| D-01 | Keep team chat UI unchanged | No change to `AIChatDrawer.tsx`/`ChatMessageBubble`/`team-chat.css`; new layer mounts alongside |
| D-02 | `Mở Coding Zone` action from team chat/activity | Trigger point: `TeamWorkspace.tsx` / `AgentActivityPanel.tsx`, both rendered from `TeamWorkspaceView.tsx` |
| D-03 | Match approved HTML draft | Draft source of truth mapped in `## Code Examples`; tokens in `workbench-tokens.css` |
| D-04 | Two perspectives, one state | Draft `data-perspective` switch over shared `messages`/`activeTabId`/`hunkStates`/`treeScope` |
| D-05 | Reuse viewer capabilities | `RemoteFileViewer.tsx` props & behavior documented in `## Standard Stack` / `Code Examples` |
| D-06 | Popout Coding Zone real Tauri window | `aiPopout.ts` + `notesPopout.ts` give exact pattern; new label + hash route needed |
| D-07 | One Agent Developer roster member with Edit | `importAiStaff` + `TEAM_TOOL_DEFINITIONS` + `TeamToolContext`; no edit team tool exists yet |
| D-08 | SSH-only, server-side worktree confinement | `ssh_service.rs` write primitives exist but unconfined; `resolveRemoteToolPath`/`confineRepoPath` are confinement patterns |
| D-09 | No auto-merge | Worktree-local git only; commands operate inside allocated worktree |
| D-10 | Untrusted data boundary | `wrapField` / untrusted delim patterns already in team prompts |
| D-11 | Reuse Ghost Dev diff mechanics | `useGhostDevDiff.ts`, `gitDiffParser.ts`, `AgentDiffReviewer.tsx`, `DiffHunkView.tsx` |
| D-12 | Accept keeps hunk, Reject reverts hunk locally | `accept_patch_diff` / `revert_hunk_diff` semantics documented; need SSH-backed equivalents |
| D-13 | Cross-window hunk/tab state sync | `aiSyncChannel.ts` BroadcastChannel + Tauri `emitTo` pattern |
| D-14 | Surface stale/overlap/failed apply | git apply is atomic by default; must catch and surface, never silently refresh away |
| D-15 | Reuse popout sync pattern | `aiPopout.ts` lines 81-130 + `AIPopoutView.tsx` listeners |
| D-16 | Chat strip mirrors existing store | `teamTranscriptRepo.ts` (`saveTeamMessage`, list APIs), `types/teamChat.ts` |
| D-17 | Live agent activity events | `agent_manager.rs` emits all three events; `useGhostDevSessions.ts` listener pattern |
| D-18 | Truthful disconnected/ended state | Explicit state machine; no fake “Đồng bộ” chip when SSH absent |
| D-19 | Zero warnings/criticals | typecheck + focused lint/tests + Chrome console check in `Validation Architecture` |
| D-20 | Focused tests only | `--bail=1` scoped invocation; never `npm test` full suite |
| D-21 | Real Chrome verification | `playwright.config.ts` + system Chrome present |
| D-22 | Merge to feature/intellij-workbench & push | End-state gate; current branch is isolated worktree |

</phase_requirements>

## Summary

Phase 48 adds a coding-capable SDLC team member and a fullscreen Coding Zone review surface, then pops that surface into a real Tauri secondary window. Strong reusable base exists: the diff/hunk pipeline (`useGhostDevDiff.ts`, `gitDiffParser.ts`, `AgentDiffReviewer.tsx`, `DiffHunkView.tsx`), the remote file viewer (`RemoteFileViewer.tsx`), the tab model (`layoutStore.ts`), the popout pattern (`aiPopout.ts`, `notesPopout.ts`, `AIPopoutView.tsx`), the BroadcastChannel sync (`aiSyncChannel.ts`), the team chat store (`teamTranscriptRepo.ts`, `types/teamChat.ts`), and the staff import path (`importAiStaff`). The approved HTML draft is a complete visual and behavioral spec with light/dark tokens, three-column layout, tabs, diff hunks, chat strip, and popout.

The single biggest integration gap: the existing Ghost Dev accept/revert commands operate on **local filesystem paths** (`std::fs`, local `git` with `current_dir`) and the SSH session stores a synthetic `worktree_path = ssh://<profile>/<remote_dir>` that those commands cannot resolve (`PathBuf::exists()` returns false). D-08 requires SSH-only edits confined to a real remote worktree. Planner must design SSH-backed diff/apply/revert (git over SSH via `execRemoteCommand` + SFTP reads + server-side realpath confinement) and a real remote `git worktree add -b <branch> <path>`, rather than reusing the local-file commands verbatim. `ssh_write_file` exists but is unconfined and must never be called with a model-supplied path without new confinement.

**Primary recommendation:** Wrap the existing diff/viewer/chat/popout primitives into a new `CodingZone` modal + `coding-zone-popout` route, and build one new SSH-worktree service layer that confines every path and executes git/apply/revert on the remote host; never route agent edits through local filesystem commands.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Coding Zone modal + two perspectives | Browser / Client | — | Pure React layout/state; no server logic |
| SSH worktree tree listing | API / Backend (Tauri Rust + SSH service) | Browser / Client (tree rendering) | Remote `git ls-files`/`ls-tree` needs SSH; renderer only displays |
| Multi-tab file/diff viewer | Browser / Client | API / Backend (remote content reads) | Reuse `RemoteFileViewer` behavior; content fetched via SSH |
| Hunk accept/reject (worktree-local) | API / Backend (Rust git over SSH) | Browser / Client (decision UI + BroadcastChannel sync) | Write operations must be server-side confined; UI only issues verbs |
| Agent Developer tool allowlist & dispatch | API / Backend (team tools/coordinator) | Database / Storage (aiEmployees rows) | Role/permission lives in team tool layer, not UI |
| Team chat mirror/composer | Browser / Client | Database / Storage (existing chat store) | No new schema; `saveTeamMessage` already persists |
| Cross-window sync | Browser / Client | API / Backend (Tauri `emitTo` for targeted handoff) | Same-origin BroadcastChannel + targeted Tauri events |
| Worktree lifecycle (create/remove) | API / Backend (SSH remote git) | — | Must be created and cleaned up on remote host; no local writes |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.3.0 | UI framework | Existing app; modal + popout views |
| Ant Design (`antd`) | 6.6.5 | Component system | Fixed project decision; tokens in `workbench-tokens.css` |
| Tauri v2 (`@tauri-apps/api` ^2.2.0) | 2.x | Secondary window + `emitTo` | Existing popout pattern; `WebviewWindow`, `getAllWebviewWindows`, `emitTo` already used |
| Rust / ssh2 crate | cargo 1.98.1 | SSH remote command + SFTP | `ssh_service.rs` primitives already in app |
| Dexie | 4.4.6 | Chat/roster persistence | Existing store; no new tables expected |
| TypeScript | 7.0.2 (project pin) | Strict typing | Required by project conventions |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@testing-library/react` + `jest-dom` | 16.3.3 / 7.0.1 | Component tests | Modal, tabs, hunk decisions, chat mirror |
| `fake-indexeddb` | 6.2.5 | Dexie tests | Chat-strip persistence tests |
| Vitest | 5.0.2 | Focused unit/component tests | Scoped paths only; never full suite |
| Playwright (`@playwright/test` ^1.63.0) | 1.63.0 | Chrome E2E | Popout, cross-window sync, console errors |

`[VERIFIED: codebase read]` All listed versions/dependencies observed in `package.json`, `Cargo.toml`, `vite.config.ts`, `playwright.config.ts` this session. No new npm dependency is needed for this phase.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New SSH diff/apply service | Reuse local `get_worktree_diff`/`accept_patch_diff`/`revert_hunk_diff` on `ssh://...` path | **Rejected** — those commands call `PathBuf.exists()` on a synthetic `ssh://` string, always false; would violate D-08 (no local writes). Need SSH-native verbs. |
| New diff parser/viewer | New generic diff library | **Rejected** — `parseGitDiff`/`DiffHunkView`/`AgentDiffReviewer` already cover unified/split/hunk decisions; D-11 requires reuse. |
| New chat schema for strip | Mirror via existing `teamMessages` store | **Rejected new schema** — D-16 forbids it; reuse `saveTeamMessage` + `types/teamChat.ts`. |
| Full React Router for popout | Hash route + dedicated `AppRoute` member | Hash route matches existing `timer-popout`/`notes-popout`/`ai-popout` pattern; least new machinery. |
| Custom BroadcastChannel bus | Existing `aiSyncChannel.ts` + targeted `emitTo` | Reuse per D-15; add a dedicated channel name/type union rather than a new transport. |

**Installation:** None — no new packages. All work reuses existing dependencies.

**Version verification:** Verified present in `package.json` this session: `react ^19.3.0`, `antd ^6.6.5`, `dexie ^4.4.6`, `@tauri-apps/api ^2.2.0`, `@playwright/test ^1.63.0`, `vitest ^5.0.2`, `vite ^8.3.1`; toolchain `node v24.16.0`, `cargo 1.98.1`, Chrome at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`. `[VERIFIED: codebase read]`

## Package Legitimacy Audit

No packages are added by this phase. The table below audits the packages the phase depends on. `[VERIFIED: npm registry + codebase read]` — all names come from the checked-in `package.json`, not from WebSearch/training.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@tauri-apps/api` | npm | published 2026-11-16 | 5.3M/wk | github.com/tauri-apps/tauri | SUS (too-new signal) | Flagged — already installed; no new install step, no checkpoint needed for this phase |
| `antd` | npm | published 2026-11-16 | 5.5M/wk | github.com/ant-design/ant-design | SUS (too-new signal) | Flagged — already installed; no new install step |
| `dexie` | npm | published 2026-10-19 | 3.6M/wk | github.com/dexie/Dexie.js | OK | Approved |
| `react` | npm | published 2026-10-14 | 275M/wk | github.com/react/react | OK | Approved |

**Packages removed due to SLOP verdict:** none.
**Packages flagged as suspicious (SUS):** `@tauri-apps/api`, `antd` — both already pinned in `package.json`, high-download, official source repos, flagged only by the "too-new" heuristic on the latest publish date. Because this phase installs nothing new, planner should not add install checkpoints; if a future plan bumps these versions, add `checkpoint:human-verify` before install.

## Architecture Patterns

### System Architecture Diagram

```
[Main window: TeamWorkspace / AgentActivityPanel]
        |  click "Mở Coding Zone"
        v
[CodingZoneModal (fullscreen)]
        |-- left: SSH worktree tree  <---- [SSH worktree tree service] ----> [Remote git: git ls-files/ls-tree over SSH]
        |-- center: tabs -> RemoteFileViewer | AgentDiffReviewer/DiffHunkView
        |                    |                         |
        |                    |                   Accept/Reject hunk
        |                    |                         v
        |                    |              [SSH worktree apply service] ----> [Remote git apply -R / git add+commit INSIDE worktree only]
        |                    v
        |              [Remote file content reader (confined realpath)]
        |-- right: compact chat strip --+
        |                               |
        +-- perspective switch ---------+ (same state)
        |
        +-- "Popout Coding Zone" --> [openCodingZonePopout()]
                                          | Tauri: WebviewWindow(label='coding-zone-popout', url=#/coding-zone-popout)
                                          | emitTo(label, HANDOFF_EVENT, state)
                                          v
                                  [CodingZonePopoutView (same modal content)]
                                          ^--- BroadcastChannel('taskmate_coding_zone_sync') <---+
                                               (tabs, active file, hunk decisions, chat, activity)
        |
        +-- live activity: ghost-dev:stream-chunk / session-updated / session-finished (Tauri listen) --> [truthful status chip]

[Team chat persistence] <---- saveTeamMessage / teamMessages ---- both windows (no new schema)
```

### Recommended Project Structure

```
src/
├── components/agents/
│   ├── CodingZoneModal.tsx          # NEW: fullscreen 3-pane modal, two perspectives
│   ├── CodingZoneTree.tsx           # NEW: SSH worktree tree + search + scope
│   └── CodingZoneChatStrip.tsx      # NEW: compact chat mirror/composer
├── views/
│   └── CodingZonePopoutView.tsx     # NEW: route 'coding-zone-popout'
├── hooks/
│   ├── useCodingZoneSync.ts         # NEW: BroadcastChannel + emitTo state bus
│   └── useSshWorktreeDiff.ts        # NEW (or wrap useGhostDevDiff): remote diff + hunk verbs
├── services/
│   ├── sshWorktreeService.ts        # NEW: confined remote git/apply/revert over SSH
│   └── ai/office/teamTools.ts       # EDIT: add code_edit team tool (Agent Developer only)
├── utils/
│   └── codingZonePopout.ts          # NEW: mirror of aiPopout.ts with dedicated label
├── types/navigation.ts              # EDIT: add 'coding-zone-popout' AppRoute
└── hooks/useHashRoute.ts            # EDIT: whitelist new route
src-tauri/src/
└── agent_manager.rs / agent_diff_ops.rs  # EDIT: SSH-native worktree diff/apply/revert commands
```

### Pattern 1: Tauri secondary window with targeted handoff

**What:** `WebviewWindow` with dedicated label, `getAllWebviewWindows()` dedupe, `emitTo(label, event, payload)` for scoped handoff, `tauri://created` await, browser fallback. `[VERIFIED: codebase read]` `src/utils/aiPopout.ts:81-130`.
**When to use:** Opening the Coding Zone popout (D-06/D-15).
**Example:**
```typescript
// Source: src/utils/aiPopout.ts (repo-authoritative), emitTo API confirmed at
// https://v2.tauri.app/reference/javascript/api/namespaceevent
const { WebviewWindow, getAllWebviewWindows } = await import('@tauri-apps/api/webviewWindow');
const existing = (await getAllWebviewWindows()).find((w) => w.label === CODING_ZONE_LABEL);
if (existing) {
  await existing.show();
  await existing.setFocus();
  const { emitTo } = await import('@tauri-apps/api/event');
  await emitTo(CODING_ZONE_LABEL, CODING_ZONE_HANDOFF_EVENT, state);
  return;
}
const webview = new WebviewWindow(CODING_ZONE_LABEL, {
  url: '#/coding-zone-popout', title: 'Coding Zone', width: 1200, height: 800,
});
await new Promise<void>((resolve, reject) => {
  webview.once('tauri://created', () => resolve());
  webview.once('tauri://error', (e) => reject(e));
});
```

### Pattern 2: Cross-window same-origin state bus

**What:** `BroadcastChannel` channel name + typed payloads; sender does not receive own message; same-origin only. `[CITED: https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel]`; existing wrapper `aiSyncChannel.ts`.
**When to use:** Tab state, active file, hunk decisions, chat mirror between modal and popout (D-13).
**Caveat:** broadcast events must be idempotent and versioned (revision/sequence number) to avoid re-applying an old state after a late window mount.

### Pattern 3: Confined remote path resolution

**What:** Lexical `..` normalization + containment check before any SSH call; on the remote, canonicalize both root and target with `realpath --` and literal directory boundary (`workingCopyCatSnippet`). `[VERIFIED: codebase read]` `src/services/ai/sshFsToolService.ts:142-164`, `src/services/gitRemoteTreeService.ts:382-390`.
**When to use:** Every worktree read/write/edit path (D-08). Server-side validation is mandatory; renderer checks are not enforcement.

### Pattern 4: Per-hunk patch application

**What:** `buildHunkPatch`/`formatHunkPatch` reconstruct a single-hunk unified patch; `git apply --reverse` reverts it; `git apply --cached` + commit keeps it. `[VERIFIED: codebase read]` `gitDiffParser.ts:166-190`, `agent_manager.rs:1331-1399`, `agent_diff_ops.rs:65-113`; `[CITED: https://git-scm.com/docs/git-apply]`.
**When to use:** Accept/Reject (D-12). git apply is atomic by default — on failure nothing applies; surface the error (D-14), do not silently refresh.

### Anti-Patterns to Avoid

- **Reusing local-worktree commands on `ssh://` path:** they call `PathBuf::exists()` and fail; worse, if a local dir existed they would write outside the agent worktree (violates D-08). Build SSH-backed verbs.
- **Calling `ssh_write_file` with unconfined paths:** `ssh_service.rs:359-376` is raw SFTP create with zero path validation. Confine first, or add a confined Rust command.
- **New chat schema for the strip:** D-16 forbids; use `saveTeamMessage` and `types/teamChat.ts`.
- **Fake “Đồng bộ” chip:** D-18 requires truthful state when SSH/session/popout is unavailable.
- **Silently refreshing diff after a failed apply:** D-14; show explicit failure + stale/overlap warning and keep user decisions.
- **Embedding draft sample data in implementation:** D-17; draft timeline is visual reference only.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Diff parsing / hunk patches | Custom parser | `gitDiffParser.ts` | Already handles add/del/context and patch reconstruction |
| Hunk accept/reject UI | New diff viewer | `AgentDiffReviewer` + `DiffHunkView` | Unified/split, per-hunk and per-line actions already implemented |
| Remote file viewer | Second viewer | `RemoteFileViewer.tsx` | D-05 requires preserving path/branch/read-only header, line numbers, Mermaid, copy/reveal/reload |
| Tab model | New tab state | `layoutStore.ts` | pinned/active/reload-key/one-shot params already modeled |
| Cross-window messaging | New IPC transport | `aiSyncChannel.ts` + Tauri `emitTo` | D-15 explicitly requires reuse |
| Chat persistence | New table/schema | `teamTranscriptRepo.ts` | D-16 |
| Popout lifecycle | New window util | pattern in `aiPopout.ts`/`notesPopout.ts` | Dedupe, geometry, focus, browser fallback already solved |
| Path confinement | Ad-hoc string checks | `resolveRemoteToolPath`, `confineRepoPath`, `workingCopyCatSnippet` | Battle-tested against `..`, symlinks, macOS realpath differences |

**Key insight:** All UI mechanics exist. The only genuinely new engineering is SSH-native worktree diff/apply/revert with confinement and cross-window state transport — everything else is composition.

## Common Pitfalls

### Pitfall 1: Synthetic `ssh://` worktree path passed to local commands
**What goes wrong:** `start_ssh_ghost_dev_session` sets `worktree_path = format!("ssh://{}/{}", ...)`, and `get_worktree_diff`/`accept_patch_diff`/`revert_hunk_diff` do `PathBuf::from(...).exists()` → false, so diff is empty and accept/reject fails.
**Why it happens:** Ghost Dev local-session code was reused for SSH sessions without replacing the storage/command layer.
**How to avoid:** Introduce an explicit worktree descriptor `{ sshConfigId, remoteWorktreePath, branch }`; SSH commands take config + path, never a synthetic local path.
**Warning signs:** Diff panel empty while agent streams file mutations; accept/revert errors mentioning path does not exist.

### Pitfall 2: Agent edits escape the worktree
**What goes wrong:** `ssh_write_file`/`ssh_exec_command` with model-supplied path can write anywhere the SSH user can reach.
**Why it happens:** Raw SSH primitives have no path policy.
**How to avoid:** Server-side confine to canonical worktree root (realpath both, literal boundary), allow only the agent's worktree id from request-bound context, never trust model-supplied paths.
**Warning signs:** Any code path where a tool argument flows to SSH without `resolveRemoteToolPath`/Rust confinement.

### Pitfall 3: Stale diff silently discards decisions
**What goes wrong:** Diff refresh after every stream chunk; a hunk decision made in the popout can be overwritten by a stale refresh from the main window.
**Why it happens:** `useGhostDevDiff` refreshes on stream events with a 1200ms debounce; no decision revision tracking.
**How to avoid:** Keep hunk decisions keyed by file+hunk identity + diff revision; on stale/overlap, surface conflict (D-14), never auto-clear.
**Warning signs:** Accept button state flips back to pending without user action.

### Pitfall 4: Cross-window echo loops
**What goes wrong:** BroadcastChannel events re-broadcast by the receiver cause infinite ping-pong.
**Why it happens:** Sender does not receive own messages, but two windows replying to each other can loop.
**How to avoid:** Include `originWindowId` and `revision`; ignore self-authored events; apply only strictly newer revisions.

### Pitfall 5: Full Vitest suite
**What goes wrong:** Hangs over an hour (project memory).
**How to avoid:** Always pass scoped paths with `--bail=1` (Vitest 5.0.2 rejects `-x`), e.g. `npx vitest run path/a.test.ts path/b.test.ts --bail=1`.

### Pitfall 6: Fake sync UI
**What goes wrong:** Draft shows a “Đồng bộ” chip unconditionally, but real SSH target may be absent.
**How to avoid:** Derive chip from live session state + SSH probe + popout presence; show explicit disconnected/invalid/ended states (D-18).

### Pitfall 7: Model id drift
**What goes wrong:** Agent Developer created with wrong model id.
**How to avoid:** Use `claude-opus-5-5` where a model id is required (already used for Evra/Vidic/Rooney in `AI-STAFF-SDLC-TEAM.json`).

## Code Examples

Verified patterns from the codebase (all paths under this worktree):

### Remote viewer capabilities to preserve
```tsx
// Source: src/workbench/editor/RemoteFileViewer.tsx
<RemoteFileViewer
  config={config} repoPath={repoPath} branch={branch}
  filePath={filePath} initialLine={initialLine} size={size}
/>
```
Includes remote path/branch/Read-Only header, line gutter, Mermaid handling, copy/reveal/reload, and `registerActiveItem` for remote chat scope.

### Diff hook + reviewer wiring
```tsx
// Source: src/views/AgentControlView.tsx:107,186,237
const { diffFiles, allWorktreeFiles, selectedFilePath, viewMode,
        acceptHunk, revertHunk, refreshDiff } = useGhostDevDiff(worktreePath);
<AgentDiffReviewer ... onAcceptHunk={acceptHunk} onRevertHunk={revertHunk} />
```
Reuse this shape for Coding Zone, backed by SSH worktree service instead of local commands.

### Hunk patch reconstruction
```ts
// Source: src/utils/gitDiffParser.ts:166-190
export function formatHunkPatch(filePath: string, hunk: DiffHunk): string {
  return buildHunkPatch(filePath, hunk);
}
```
`git apply --reverse` (reject) and `git apply --cached` + commit (accept) consume this; git apply default is atomic. `[CITED: https://git-scm.com/docs/git-apply]`

### Confined remote path
```ts
// Source: src/services/ai/sshFsToolService.ts:142-164
export function resolveRemoteToolPath(inputPath, defaultBasePath, remoteTarget) { /* .. normalization + repo containment */ }
```

### Cross-window sync
```ts
// Source: src/services/ai/aiSyncChannel.ts:27-55
notifyAIChatSync({ type: 'message_saved', threadId, scopeKey });
subscribeAIChatSync((payload) => { /* ignore own window, apply if newer revision */ });
```

### Draft UI layout (source of truth)
- Draft file: `.planning/quick/261121-0ix-t-o-b-n-draft-html-t-ng-t-c-cho-agent-de/agent-developer-workbench-draft.html`
- Structure: header with `data-perspective` buttons and `Popout Coding Zone`, 3-column grid `260px | 1fr | 300px`, `#tree` explorer, `#tabbar` tabs, diff `#diff-wrap` with `.hunk[data-state]`, `#chat-transcript`, and `#popout` floating div sharing state.
- Palette: draft `:root[data-theme=light|dark]` copied from `src/styles/workbench-tokens.css`; accent `#2f62d8`/`#6a9bff`. `[VERIFIED: codebase read]`

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Local Ghost Dev worktree diff/accept/revert | Needed: SSH-native worktree verbs | Phase 48 | D-08 forces remote execution; local commands cannot serve SSH path |
| Draft popout = floating div | Real Tauri `WebviewWindow` for Coding Zone | Quick 261121-0ix correction + D-06 | Must implement actual secondary window, not DOM overlay |
| Single shared AI chat scope | Team chat unified participant model + Coding Zone mirror | 37.1 + Phase 48 | Strip mirrors existing store; no new schema |

**Deprecated/outdated:**
- Draft sample data and “SSH target giả lập” label — visual only; implementation must use live data and truthful status (D-17/D-18).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Tauri secondary windows of this app share one origin, so BroadcastChannel reaches the popout | Architecture, Standard Stack | If origin differs, cross-window sync fails; fallback to `emitTo` for all state |
| A2 | Remote host has git available and supports `git worktree add` in the configured repo | Architecture | Worktree creation fails; planner needs explicit precondition + truthful error (D-18) |
| A3 | `Edit` capability for Agent Developer maps to a new team tool gated by role, not to the headless `claude` remote agent's own toolset | Stack, Architecture | Wrong layer chosen; D-07 still achievable but implementation location shifts |
| A4 | `feature/intellij-workbench` exists on `origin` and this worktree can merge/push it | Validation/merge | D-22 blocked; planner must sequence rebase/merge after verification |

External doc claims (Tauri `emitTo`, git apply semantics, MDN BroadcastChannel) are `[CITED: official docs]` with MEDIUM confidence and are not in this assumptions table.

## Open Questions

1. **Where does the Agent Developer's `Edit` actually execute?**
   - What we know: team staff tools live in `teamTools.ts` + `teamRunCoordinator.ts`; remote headless `claude` sessions run with `bypassPermissions` on SSH (`agent_manager.rs:391-394`).
   - What's unclear: D-07 says "team tools plus code-edit capability" but D-08 says no local writes — whether Edit is a new team tool doing confined SFTP/git writes, or a restriction of the remote headless agent's tools into a worktree.
   - Recommendation: implement one new `code_edit` team tool gated to the Agent Developer role, operating exclusively through the SSH worktree service; keep the remote headless session read-only by default. Confirm with user only if plan-checker flags ambiguity — user requested no intermediate questions.

2. **Worktree creation ownership and cleanup**
   - What we know: `git worktree add` isolates files/HEAD/index; `git worktree remove` requires clean tree.
   - What's unclear: who creates the remote worktree (on session start vs first edit) and what happens on session end with unreviewed changes.
   - Recommendation: create on Agent Developer session start, persist descriptor in session state, never auto-remove with uncommitted changes; surface in UI.

3. **Hunk identity across refreshes**
   - What we know: `DiffHunk` has no stable id (only line numbers/header).
   - What's unclear: how to keep decisions stable when agent edits shift line numbers.
   - Recommendation: key decisions by `{filePath, hunk header, content hash}` + diff revision; on mismatch, mark stale and require user re-decision (D-14).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build/tests | ✓ | v24.16.0 | — |
| npm | Scripts | ✓ | 11.13.0 | — |
| Rust/cargo | Tauri commands | ✓ | 1.98.1 | — |
| Google Chrome | Playwright D-21 | ✓ | system Chrome installed | Playwright bundled chromium-1223 |
| Playwright browsers | E2E | ✓ | chromium-1223 | — |
| SSH remote target + configured profile | Agent Developer worktree D-08 | unknown (needs settings check at execution) | — | Show truthful disconnected state (D-18); no fake sync |
| `git` on remote host | worktree/diff commands D-08 | unknown | — | Truthful refusal code; no mid-turn failure |

**Missing dependencies with no fallback:** none detected locally.
**Missing dependencies with fallback:** SSH remote target / remote git — planner must include a preflight in the UI and a truthful error state, not a fake sync chip.

## Validation Architecture

`workflow.nyquist_validation` is `true` in `.planning/config.json` — section included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.2 (jsdom) + Playwright 1.63.0 |
| Config file | `vite.config.ts` (`test` block), `playwright.config.ts` |
| Quick run command | `npx vitest run <scoped paths> --bail=1` (never full suite) |
| Full suite command | `npm test` — **DO NOT RUN** (over an hour) |
| Chrome E2E | `npx playwright test <spec> --project=chromium` with system Chrome channel |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| D-01 | Chat UI untouched | code review | grep diff on `AIChatDrawer`/`ChatMessageBubble`/`team-chat.css` | ✅ existing files |
| D-02 | `Mở Coding Zone` trigger | component | `npx vitest run src/components/ai/office/__tests__/CodingZoneTrigger.test.tsx --bail=1` | ❌ Wave 0 |
| D-03/D-04 | Draft layout + perspectives | Playwright | `npx playwright test tests/e2e/coding-zone-layout.spec.ts` | ❌ Wave 0 |
| D-05 | Viewer parity | component | `npx vitest run src/workbench/editor/__tests__/RemoteFileViewer.test.tsx --bail=1` | ❌ Wave 0 (extend) |
| D-06/D-15 | Popout + sync | component + E2E | scoped Vitest + Playwright cross-window spec | ❌ Wave 0 |
| D-07 | Agent Developer roster + tool gating | unit | `npx vitest run src/services/ai/office/__tests__/teamTools.codeEdit.test.ts --bail=1` | ❌ Wave 0 |
| D-08 | Worktree confinement | unit (pure path logic) | `npx vitest run src/services/__tests__/sshWorktreeService.test.ts --bail=1` | ❌ Wave 0 |
| D-11/D-12/D-14 | Diff accept/reject + stale | unit + component | `npx vitest run src/utils/__tests__/gitDiffParser.test.ts src/components/agents/__tests__/AgentDiffReviewer.test.tsx --bail=1` | ✅ partial |
| D-13 | Cross-window hunk sync | component | scoped Vitest on sync hook | ❌ Wave 0 |
| D-16 | Chat mirror persistence | unit (fake-indexeddb) | `npx vitest run src/db/repositories/__tests__/teamTranscriptRepo.test.ts --bail=1` | ❌ Wave 0 |
| D-17/D-18 | Live events + truthful state | component | scoped Vitest on activity/status hook | ❌ Wave 0 |
| D-21 | Chrome verification | Playwright | `npx playwright test tests/e2e/coding-zone.spec.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx tsc --noEmit` + scoped Vitest paths with `--bail=1`
- **Per wave merge:** all phase-scoped Vitest files + targeted Playwright specs
- **Phase gate:** typecheck clean, scoped tests green, Chrome E2E green, zero console errors, code review + security review findings closed

### Wave 0 Gaps
- [ ] `src/services/__tests__/sshWorktreeService.test.ts` — path confinement + remote command construction (D-08)
- [ ] `src/services/ai/office/__tests__/teamTools.codeEdit.test.ts` — role allowlist (D-07)
- [ ] `src/components/agents/__tests__/CodingZoneModal.test.tsx` — layout/perspectives/tabs/hunks (D-03/D-04/D-12)
- [ ] `src/hooks/__tests__/useCodingZoneSync.test.ts` — cross-window revision/echo suppression (D-13)
- [ ] `tests/e2e/coding-zone.spec.ts` — Chrome UAT for D-21

## Security Domain

`workflow.security_enforcement` is `true`, ASVS level 1.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no | Single-user local app; SSH auth uses configured profile/secret, no app login |
| V3 Session Management | no | No HTTP session |
| V4 Access Control | yes | Team tool role gate (`EMPLOYEE_ONLY_TEAM_TOOLS` pattern); worktree ownership from request-bound `TeamToolContext`, never model-supplied ids |
| V5 Input Validation | yes | Zod/strict schemas on event payloads; confine all remote paths server-side; reject `..`, absolute paths, `~` when target-bound |
| V6 Cryptography | no | No new crypto; existing SSH layer handles transport |

### Known Threat Patterns for stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal to arbitrary remote files | Tampering / Information disclosure | `resolveRemoteToolPath` + Rust `realpath` containment with literal directory boundary; restrict to allocated worktree |
| Prompt injection in tool results / chat | Tampering | D-10: wrap all tool output and agent text as untrusted data (`wrapField` delimiters); never execute instructions found in data |
| Cross-window state spoofing | Tampering | Validate BroadcastChannel/`emitTo` payload shape + `originWindowId`/revision; ignore malformed or stale events |
| Unauthorized hunk apply outside worktree | Elevation of privilege | Server-side worktree ownership check on every accept/reject; no client-only enforcement |
| Silent data loss on stale/overlap | Tampering / Repudiation | git apply atomic failure surfaced (D-14); versioned hunk decisions; explicit conflict UI |
| Secret leakage to renderer bundle | Information disclosure | SSH secret stays in credential store / passed per command; never embed in popout URL or hash params |

## Sources

### Primary (HIGH confidence)
- Codebase reads this session (authoritative for this repo): `src/hooks/useGhostDevDiff.ts`, `src/utils/gitDiffParser.ts`, `src/components/agents/AgentDiffReviewer.tsx`, `src/components/agents/DiffHunkView.tsx`, `src/workbench/editor/RemoteFileViewer.tsx`, `src/workbench/store/layoutStore.ts`, `src/utils/aiPopout.ts`, `src/services/ai/aiSyncChannel.ts`, `src/views/AIPopoutView.tsx`, `src/hooks/useHashRoute.ts`, `src/types/navigation.ts`, `src/types/teamChat.ts`, `src/context/AIChatContext.tsx`, `src/services/ai/office/teamTools.ts`, `src/services/ai/sshFsToolService.ts`, `src/services/gitRemoteTreeService.ts`, `src-tauri/src/agent_manager.rs`, `src-tauri/src/agent_diff_ops.rs`, `src-tauri/src/ssh_service.rs`, `src-tauri/src/lib.rs`, `package.json`, `vite.config.ts`, `playwright.config.ts`, `48-CONTEXT.md`, approved draft HTML.

### Secondary (MEDIUM confidence)
- `https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel` — same-origin, postMessage semantics.
- `https://git-scm.com/docs/git-apply` — `git apply -R`, atomicity, `--cached`, `--recount`, `--unidiff-zero`.
- `https://git-scm.com/docs/git-worktree` — `git worktree add -b`, isolation, remove.
- `https://v2.tauri.app/reference/javascript/api/namespaceevent` — `emitTo(target,event,payload?)`.

### Tertiary (LOW confidence)
- None relied upon. `v2.tauri.app/develop/windows` and `/multiwindow` returned 404; Tauri window creation claims rest on repo code, not those pages.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions and packages read from checked-in `package.json`; no new deps.
- Architecture: HIGH for existing integration points; MEDIUM for SSH-native worktree design (new code path).
- Pitfalls: HIGH — grounded in concrete code defects (synthetic `ssh://` path, unconfined SFTP write, atomic git apply).
- External docs: MEDIUM — official docs for git/MDN/Tauri emitTo.

**Research date:** 2026-11-21
**Valid until:** 2026-12-21 (stable stack; recheck if Tauri/React majors change)
