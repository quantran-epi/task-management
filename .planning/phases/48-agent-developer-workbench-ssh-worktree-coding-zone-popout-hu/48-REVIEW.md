---
phase: 48-agent-developer-workbench-ssh-worktree-coding-zone-popout-hu
reviewed: 2026-11-20T20:30:20Z
depth: standard
files_reviewed: 34
files_reviewed_list:
  - e2e/coding-zone.html
  - e2e/coding-zone.tsx
  - playwright.config.ts
  - src-tauri/src/agent_diff_ops.rs
  - src-tauri/src/lib.rs
  - src-tauri/src/tool_cancel.rs
  - src/App.tsx
  - src/components/agents/CodingZoneChatStrip.tsx
  - src/components/agents/CodingZoneDiffPanel.tsx
  - src/components/agents/CodingZoneLiveState.ts
  - src/components/agents/CodingZoneModal.tsx
  - src/components/agents/CodingZoneTree.tsx
  - src/components/agents/__tests__/CodingZoneDiffPanel.test.tsx
  - src/components/agents/__tests__/CodingZoneModal.test.tsx
  - src/components/agents/office/CodingZoneTrigger.tsx
  - src/components/ai/office/AgentActivityPanel.tsx
  - src/components/ai/office/TeamWorkspace.tsx
  - src/db/repositories/__tests__/aiOfficeImport.test.ts
  - src/hooks/__tests__/useCodingZoneSync.test.ts
  - src/hooks/useCodingZoneSync.ts
  - src/hooks/useHashRoute.ts
  - src/services/__tests__/sshWorktreeProvision.test.ts
  - src/services/__tests__/sshWorktreeService.test.ts
  - src/services/ai/aiTools.ts
  - src/services/ai/office/__tests__/teamTools.codeEdit.test.ts
  - src/services/ai/office/teamRunCoordinator.ts
  - src/services/ai/office/teamTools.ts
  - src/services/sshWorktreeService.ts
  - src/styles/coding-zone.css
  - src/types/codingZone.ts
  - src/types/navigation.ts
  - src/utils/codingZonePopout.ts
  - src/views/CodingZonePopoutView.tsx
  - tests/e2e/coding-zone.spec.ts
findings:
  critical: 3
  warning: 6
  info: 2
  total: 11
status: issues_found
---

# Phase 48: Code Review Report

**Reviewed:** 2026-11-20T20:30:20Z
**Depth:** standard
**Files Reviewed:** 34
**Status:** issues_found

## Summary

Reviewed the full Phase 48 diff (`e39fede9..HEAD`): SSH worktree provisioning and confinement, the role-gated `code_edit` tool, the Coding Zone modal/tree/diff/chat UI, popout and cross-window sync, and the Chrome UAT harness. The self-reported validation gate is green, but that gate exercises narrow payloads and mocked IPC, so it does not cover the trust-boundary failures found here.

Three Critical issues: (1) remote shell command injection in the TS `applyHunk`/`revertHunk` path via a newline in the model/UI-supplied `filePath`, because the patch (containing that path) is interpolated into a `<<'PATCH_EOF'` heredoc without any newline guard; (2) the entire feature is inert in production because `agentDeveloperWorktree` is never supplied at the sole coordinator construction site, so provisioning always throws and `code_edit` never runs; (3) four Rust worktree write/read commands are registered and reachable from the frontend but perform no path confinement on the caller-supplied descriptor, giving a direct path-traversal/write primitive.

Six Warnings cover accept/revert semantics that diverge from the canonical Ghost Dev behavior, an unbounded stale-decision leak, a revision regression on `closeTab`/`reorderTab`, a cross-window double-send race, a chmod-style agent-name spoof of the `code_edit` role gate, and a missing transport layer for chat `intent: 'send'` echo suppression. Two Info items note hardcoded trigger literals and a redundant ternary.

The security-criticality of (1) and (3) is elevated because project design (CLAUDE.md D-10, 48-CONTEXT D-10/D-19) treats tool output and model arguments as untrusted data, and the Rust `ssh_worktree_apply_patch` command is invokable from any renderer code.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Remote shell command injection via heredoc delimiter break in `applyHunk`/`revertHunk`

**File:** `src/services/sshWorktreeService.ts:198-211` (and `src/utils/gitDiffParser.ts:166-176`)

**Issue:** `applyPatch` builds a shell command string that embeds the untrusted patch into a quoted heredoc:

```ts
const clean = confineWorktreePath(filePath, desc);          // line 205
const relative = clean.slice(desc.remoteWorktreePath.length + 1);
const patch = formatHunkPatch(relative, hunk);               // line 207 — contains `relative`
const command = `${worktreeCommand(desc.remoteWorktreePath, args)} <<'PATCH_EOF'\n${patch}\nPATCH_EOF`;  // line 210
const res = await execRemoteCommand(config, command, secret); // line 211
```

`confineWorktreePath` (lines 95-121) rejects `/`, `~`, `..`, `\0`, but **does not reject newlines**. A `filePath` containing a newline breaks out of the `PATCH_EOF` delimiter, and everything after the injected delimiter is executed by the remote shell (`sh -c`, via `build_remote_command` in `tool_cancel.rs:288-294`). `filePath` is model-supplied through `code_edit` (`teamTools.ts:1892`) and also comes from the tree/diff UI. Verified locally: with `filePath = "a\nPATCH_EOF\ntouch /tmp/pwned"`, the generated command contains a standalone `touch /tmp/pwned` line executed by the shell. The same vector exists through a `\n` in `hunk.lines[].content` (from `code_edit` `patch` args, `teamTools.ts:1888`), since `buildHunkPatch` writes `+${content}` verbatim into the heredoc. This yields arbitrary command execution on the SSH host as the connected user — a full confinement bypass of the "worktree-only writes" guarantee.

**Fix:** Never interpolate untrusted data into a shell heredoc. Base64-encode the patch and pipe it through `base64 -d` (exactly as the Rust `apply_patch_remote` already does at `agent_diff_ops.rs:301-307`), with base64 of the root path via `shellQuote`:

```ts
const encoded = Buffer.from(patch, 'utf8').toString('base64'); // or btoa for browser
const command = `${worktreeCommand(desc.remoteWorktreePath, args)} <<'PATCH_EOF'\n${patch}\nPATCH_EOF`;
// REPLACE with:
import { base64Encode } from './somewhere'; // or browser btoa(utf8ToBinary(patch))
const command = `printf %s ${shellQuote(encoded)} | base64 -d | (cd ${shellQuote(desc.remoteWorktreePath)} && ${args})`;
```

Additionally reject `\n`/`\r` in `confineWorktreePath` and in `codeEdit`'s `filePath` as defense in depth. Add a regression test asserting that a newline-bearing `filePath` is refused before any SSH command is issued.

---

### CR-02: `agentDeveloperWorktree` never supplied — Agent Developer session cannot provision, feature is inert in production

**File:** `src/components/ai/office/TeamWorkspace.tsx:331-423`; `src/services/ai/office/teamRunCoordinator.ts:276-280,1343-1348`

**Issue:** `createTeamRunCoordinator` accepts an optional `agentDeveloperWorktree` with `sshConfigId` and `remoteRepoPath`. `provisionAgentSession` (coordinator line 1343-1348) throws `WORKTREE_NOT_AVAILABLE` if it is absent, and the catch path settles the agent without activation. The **only** production construction site (TeamWorkspace.tsx line 331) does not pass this option, and no caller in `src`, `tests`, or `e2e` passes `agentDeveloperWorktree:` (verified by grep). Consequence: in the real app:

- `provisionAgentSession` always throws for Agent Developer → no descriptor → `code_edit` always refuses with `WORKTREE_NOT_AVAILABLE` (teamTools.ts:1869-1876).
- The Coding Zone trigger still appears (it is gated on live roster session state, `CodingZoneDiffPanel.tsx:227-236`), so the user sees a workbench with a derived descriptor (`TeamWorkspace.tsx:609-618`) but no real provisioned worktree; accept/reject verbs use the lexical-descriptor path with no backend worktree.

The Chrome UAT passes only because the harness (`e2e/coding-zone.tsx`) mounts `CodingZoneTrigger` directly with a synthetic descriptor and shimmed IPC, bypassing the coordinator entirely. The whole D-07/D-08 provisioning promise is therefore untested and non-functional end-to-end.

**Fix:** Supply the option at the coordinator construction site, sourced from the same live `System`/SSH row used by the trigger:

```ts
agentDeveloperWorktree: {
  sshConfigId: system.sshConfigId ?? '',
  remoteRepoPath: system.remoteRepoPath ?? '',
},
```

Resolve this from persisted state (Dexie `db.systems` / linked System row) rather than a hardcoded constant — note the coordinator is built inside a `useEffect` (TeamWorkspace.tsx:325) where `links`/`db` are in scope, matching the existing `codingZoneSystem` useLiveQuery. Add a focused test that constructs the coordinator exactly as production does and asserts provisioning succeeds for Agent Developer.

---

### CR-03: Unconfined Rust worktree commands reachable from renderer — path traversal / arbitrary write

**File:** `src-tauri/src/agent_diff_ops.rs:318-405` (registered in `src-tauri/src/lib.rs`)

**Issue:** Four `#[tauri::command]` functions (`ssh_worktree_list_files`, `ssh_worktree_read_file`, `ssh_worktree_apply_patch`, `ssh_worktree_provision`) accept a `WorktreeDescriptor` (and, for provision, a raw `remote_repo_path` / `session_key`) directly from the frontend. `ssh_worktree_apply_patch` only checks `desc.ssh_config_id == config.id` and `!patch_content.contains(desc.remote_repo_path)`. There is **no realpath check tying `desc.remote_worktree_path` to a deterministic, session-derived location under the repo**, and no confinement of the patch file paths. An attacker-controlled or bug-affected renderer can pass `desc.remote_worktree_path = "/etc"` (or the main checkout) and a patch targeting any absolute path, and `apply_patch_remote` (line 289-316) runs `cd '<arbitrary>' && git apply ...` with `shell_quote` protection only on the root string, not on path semantics. `git apply` honors paths like `../../` relative to cwd, so writing outside the cwd is possible. Similarly `ssh_worktree_provision` (line 191-268) derives its path from a caller-supplied `remote_repo_path`, and only verifies the derived path is under that caller-supplied repo — a caller can name any directory.

These commands are registered in `lib.rs` and thus invokable from any webview context in the Tauri app. They bypass the careful TS-layer confinement (`confineWorktreePath`) and the coordinator's request-bound descriptor entirely. The summary claims "Rust realpath + literal directory boundary is the enforcement point" (Plan 01), but the boundary is only relative to a caller-chosen root, not to a trusted, session-derived one.

**Fix:** Make the Rust commands trust nothing from the frontend for path selection. Either (a) remove the three unused read/apply commands entirely (they have no TS callers — `ssh_worktree_provision` is the only one invoked, at `sshWorktreeService.ts:68`), or (b) re-derive `worktree_path` server-side from a trusted session identifier using `derive_remote_worktree_path`, and enforce `git apply` with `--directory`/`git apply --unsafe-paths` disabled plus a realpath containment check on every patched file path. At minimum, validate `desc.remote_worktree_path` matches `format!("{}/.taskmate-worktrees/agent-developer-{}", desc.remote_repo_path, safe_id)` exactly before any command runs.

---

## Warnings

### WR-01: `Accept` uses forward `git apply`, which is a no-op on already-applied worktree changes

**File:** `src/services/sshWorktreeService.ts:180-218`; `src/components/agents/CodingZoneDiffPanel.tsx:121,139`; compare `src/hooks/useGhostDevDiff.ts:318-348` and `src-tauri/src/agent_manager.rs:1331-1395`

**Issue:** The Coding Zone diff shows **uncommitted working-tree changes** (`git diff --unified=3`, `sshWorktreeService.ts:176`). `applyHunk` runs `git apply -` (forward patch). But the hunk's new content is already present in the working tree, so `git apply` fails ("patch does not apply"). The canonical Ghost Dev `acceptHunk` stages the patch with `git apply --cached` then `git commit`, which is the correct way to "keep" an existing working-tree change. As implemented, clicking Accept on a real diff will show the fixed error copy (COPY.failed) instead of accepting; only `revertHunk` (`git apply --reverse`) is correct. The UAT passes because its shim returns `exitStatus: 0` for every `git apply` (`e2e/coding-zone.tsx:157`).

**Fix:** Implement accept as stage-and-commit (mirroring `accept_patch_diff` at `agent_manager.rs:1331`): `git apply --cached --unidiff-zero -` then `git commit -m <msg>`. Keep revert as `git apply --reverse`. Add a test using a real temp git repo (or a mocked command assertion) that asserts accept produces a commit and revert restores the original file.

---

### WR-02: Decision keys embed `diffRevision`, so every refresh silently discards all review decisions

**File:** `src/components/agents/CodingZoneDiffPanel.tsx:101-106`

**Issue:** `keyFor(hunk)` includes `::${revision}`. When `diffRevision` increments (new agent edit or refresh), every hunk gets a new key, so `hunkStates[key] ?? 'pending'` resets all previously accepted/rejected hunks to pending. The `stale` flag (line 105) warns the user, but the moment revision changes the decisions are already invisible — the user cannot tell which hunks they had accepted. D-14 explicitly requires stale diffs to "not silently discard user decisions." The bulk accepted-count and revert-all also silently reset, so a previously accepted hunk can no longer be reverted through the UI.

**Fix:** Keep decision keys stable across revisions (file path + hunk header + content hash only), and use `revision` solely for the stale banner. When content hash changes for a specific hunk, mark only that hunk stale, preserving decisions for unchanged hunks:

```ts
const keyFor = (hunk: DiffHunk) => `${filePath}::${hunk.header}::${hunkContentHash(hunk)}`;
```

---

### WR-03: `closeTab` and `reorderTab` mutate local state without publishing sync events — popout desync

**File:** `src/components/agents/CodingZoneModal.tsx:229-254`

**Issue:** `openFile`, `setHunkState`, `sendMessage`, and the activity effect all publish sync events, but `closeTab` and `reorderTab` only call `setTabs`. Tab state is in `CodingZoneSharedState` and D-13 requires tab state synchronized between modal and popout. Closing or reordering a tab in the main window leaves the popout showing stale tabs (and vice versa), until a full-state republish happens for some unrelated action. This is a correctness gap in the core sync promise.

**Fix:** Publish `publish('tabs', nextTabs)` (and a follow-up `activeFile`/`activeTabId` event where needed) inside both callbacks, computing `next` outside the state updater to avoid calling `publish` during React's state updater.

---

### WR-04: Cross-window chat send can be executed twice

**File:** `src/components/agents/CodingZoneModal.tsx:176-183,261-269`

**Issue:** On receipt of a `chat` event with `intent: 'send'`, `onState` calls `onSendRef.current?.(message.text)` (line 181). The sender, however, also calls `onSendRef.current?.(text)` locally in `sendMessage` (line 268). In a two-window session, when the popout sends a message: the popout's `sendMessage` calls its own `onSendMessage` (which in the popout is `undefined`, so no local send), publishes the event, and the main window receives it and calls its `onSendRef` → one send. But when the **main** window sends: `sendMessage` calls the main `onSendMessage` (real `runTurn`) locally *and* publishes `intent: 'send'`; the popout receives it and calls its `onSendRef` (undefined in popout), so no duplicate there. However, `onState` in the main window would also fire on any future `intent: 'send'` event from another window whose `onSendMessage` was defined — the protocol has no send-ack or idempotency by message id, so any re-delivery of the event (e.g., Tauri `emitTo` + BroadcastChannel both delivering) invokes `runTurn` again. The dual-transport design (`publish` posts to both BroadcastChannel and emitTo) makes duplicate delivery plausible.

**Fix:** Make sends idempotent by message id. Track delivered ids in a `Set` and skip `onSendRef` for duplicates; or remove the `intent: 'send'` side-effect entirely and have exactly one owner (the window with a real `onSendMessage`) perform the send on receipt, with the sender never calling locally when paired.

---

### WR-05: `code_edit` role gate trusts `ctx.agentName`, which is a mutable display name

**File:** `src/services/ai/office/teamTools.ts:1864-1867`; `src/services/ai/office/teamRunCoordinator.ts:1381,1391`

**Issue:** `codeEdit` authorizes on `ctx.agentName === CODE_EDIT_AGENT_NAME` (`'Agent Developer'`). `agentName` in `toolContext` is derived from the roster row name (`roster.employees.find(...).name`). Any roster row can be renamed to `'Agent Developer'` (the employee import/export path is user-editable, see `aiOfficeRepo`), giving that agent the write tool. The roster id (`developerId` in TeamWorkspace) is the real identity used everywhere else; the name is a display label. D-07 says "one new Agent Developer member" — a stable identity check is expected.

**Fix:** Gate on a stable marker (e.g., a dedicated `agentKind`/role field or the provisioned-descriptor presence with an explicit developer id), not the display name. If name-based gating must remain, ensure the roster entry is immutable/locked and reject duplicates at import.

---

### WR-06: Untrusted descriptor and diff payloads applied to state without shape validation

**File:** `src/components/agents/CodingZoneModal.tsx:138-157`; `src/views/CodingZonePopoutView.tsx:27-50`

**Issue:** On a `full` sync event, `onState` casts `state.descriptor` and `state.diffFiles` and writes them straight into `environment` (lines 149-157) with only `Array.isArray` checks on arrays; `descriptor` is not validated at all (unlike tabs/hunkStates/messages which have type guards). `isSharedState` in the popout (lines 27-39) likewise omits `descriptor`, `diffFiles`, `sshConfig`, `diffRevision`, `connection`. A malformed or hostile cross-window event (same-origin popout, or Tauri event from any renderer) can inject a descriptor with an arbitrary `remoteWorktreePath` into `environment`, which then flows to `RemoteFileViewer` (modal line 300-306) and to `CodingZoneDiffPanel` accept/reject verbs. This undermines the "provisioned descriptor only" guarantee at the UI boundary.

**Fix:** Add `isWorktreeDescriptor`, `isDiffFile`, `isConnectionState` guards and validate all fields of incoming `full` state (including nested descriptor fields) before applying. Reject the whole event if the descriptor is present but malformed.

---

## Info

### IN-01: Hardcoded `'Agent Developer'` literal duplicates `CODE_EDIT_AGENT_NAME`

**File:** `src/components/ai/office/TeamWorkspace.tsx:605`; `src/components/agents/CodingZoneDiffPanel.tsx:231`

**Issue:** Both files compare `employee.name === 'Agent Developer'` with a raw string instead of importing the exported `CODE_EDIT_AGENT_NAME` constant from `teamTools.ts`. Renaming the role constant would silently desynchronize trigger visibility and the coordinator gate.

**Fix:** Import and use `CODE_EDIT_AGENT_NAME` in both locations.

---

### IN-02: Redundant ternary in `CodingZoneTrigger`

**File:** `src/components/agents/office/CodingZoneTrigger.tsx:82`

**Issue:** `className={compact ? 'cz-btn tiny' : 'cz-btn tiny'}` returns the same value in both branches; `compact` has no visual effect.

**Fix:** Either remove the `compact` prop or give it a distinct class (e.g., `'cz-btn tiny compact'`).

---

## Structural Findings (fallow)

None provided by the orchestrator for this review.

---

_Reviewed: 2026-11-20T20:30:20Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
