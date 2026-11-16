# Phase 43: Repo reading that scales — Context

**Gathered:** 2026-11-16
**Status:** Ready for planning
**Owner decision:** "làm chuẩn chỉ, không vá víu" — fix the contract, not the symptom. Owner explicitly
waived the Phase 42 D-10 "no shell" rule for this phase: the goal is the best engineering outcome,
not rule preservation. Security posture is still *read-only by construction* where that costs nothing,
but it is no longer a reason to refuse a design.

## Why this phase exists

Three defects were proven in source while investigating "leader reads code with `git_read`, then the
run silently dies and the progress is gone":

1. **`git_read read_file` returns the entire blob.** `teamTools.ts:1241` — `// Phase 31 D-12: entire
   content, no truncation.` No `offset`, no `limit`, no `totalLines`, no `hasMore`. One 3000-line
   file enters the turn's context whole.
2. **`git_read` has no search action.** The enum is `branches | status | log | diff_summary |
   diff_file | read_file | tree` (`teamTools.ts:324`). An agent that needs one symbol must `tree`
   then read whole files. Claude Code reads code well mostly because Grep comes before Read.
3. **Team turns never pass `contextWindowTokens`.** Neither `startEmployeeTurn` (`:1973`) nor
   `startLeadTurn` (`:2195`) sets it, so `aiOrchestratorLoop.ts:238` computes `tokenBudget = 0` and
   the in-loop compactor at `:247` never runs. Combined with `analysisMode: true` →
   `keepRecentToolOutputs: 20, maxOldToolChars: 100_000` (`chatTurnRuntime.ts:320`), twenty large
   tool results are retained verbatim. A read-heavy turn therefore overflows the provider context,
   `streamChatEvents` throws, the runtime returns `phase: 'error'`, and because
   `chatTurnRuntime.ts:518` only persists a validated complete turn, **every tool result collected
   so far is discarded**. The UI shows a bare "Chưa hoàn tất".

Defect 3 is the one the owner actually felt. Defects 1 and 2 are what make it happen.

## Phase Boundary

In scope:

- `git_read` gains a `grep` action and a paged `read_file` contract.
- A new team tool `explore_repo` that runs Claude Code headless **on the remote host** over SSH and
  returns a bounded structured report.
- Team turns pass their provider context window into the runtime so in-loop compaction runs.

Out of scope:

- Any write to the remote repository.
- Replacing `git_read` with `explore_repo`. They are two tiers, not alternatives: a one-line lookup
  must not cost a nested model call.
- Changing `analysisMode`'s pruning constants. Pagination and compaction make them survivable; the
  constants are also used by ordinary chat and are not this phase's problem.
- PWA/GitHub Pages behavior (project constraint: Tauri only).
- Any new npm dependency.

## Implementation Decisions

### D-01 — `grep` is an action, not a new tool

`git_read`'s enum gains `grep`. Rationale: the tool already resolves the repo from team-linked
systems (D-07 of Phase 42) and already wraps results. A second tool would duplicate both.

Arguments: `pattern` (required, string), `path` (optional pathspec, single path), `caseSensitive`
(optional boolean, default true), `limit` (optional hit count, default 50, max 200).

Implementation: `git grep -z -n -I --no-color [-F] -e <pattern> --end-of-options <ref> [-- <path>]`.

- `-z` makes a record `path\0line\0content\n`, so a path containing `:` or a tab cannot be
  misparsed. Verified against real git.
- `-I` skips binary blobs.
- `-F` is used when the model asks for a literal string; otherwise the pattern is a basic regex.
- `git grep` exits **1** when nothing matches. That is an empty result, not a failure — the command
  runner must accept exit 1 for this call only.

Result shape: `{ action, systemId, repoPath, ref, pattern, hits: [{ path, line, text }], truncated }`.
Every `path` and `text` leaf goes through `wrapField` / `wrapUntrusted` with the same
`GIT grep <repo> — <field>` label shape Phase 42 established.

Shell-side cap: the pipeline ends in `head -c 262144`, so a broad pattern in a large repo cannot
stream megabytes into the turn. `truncated` is true when the cap was hit; the parser drops the
incomplete trailing record.

### D-02 — `read_file` adopts the local `Read` contract

`read_file` gains `offset` (1-based, default 1) and `limit` (default 200, max 2000).

Result shape: `{ action, systemId, repoPath, ref, filePath, offset, limit, linesRead, totalLines,
hasMore, isBinary, content }` where `content` is `cat -n` formatted (`<n>: <text>`).

One remote pass produces both the page and the total:

```
git -C <repo> -c core.fsmonitor=false --no-pager cat-file -p --end-of-options <ref:path> \
  | awk -v s=<offset> -v e=<offset+limit-1> 'NR>=s&&NR<=e{print NR": "$0} END{print "###TOTAL "NR}'
```

Binary probe runs first on the first 1024 bytes (`od -An -tx1 | tr -s ' ' '\n' | grep -qx 00`).
A binary blob returns `isBinary: true` with empty content instead of dumping bytes.

`getRemoteFileContent` stays as-is: `RemoteFileViewer.tsx:68` needs the whole file for the editor,
and it is not an AI tool result.

The untracked-file fallback keeps its existing confinement (`realpath -e` on both root and target,
literal directory-boundary check) and gains the same paging via `awk`.

### D-03 — `explore_repo` runs Claude Code on the remote, not here

New team tool. Arguments: `question` (required), `systemId` (optional, same resolution as
`git_read`), `model` (optional, default `haiku`), `maxTurns` (optional, default 20, max 40).

Command built and run on the remote host:

```
cd <repoPath> && timeout 300 claude -p <prompt> \
  --output-format json --allowedTools Read,Grep,Glob --model <model> \
  --max-turns <n> --no-session-persistence
```

- `--allowedTools` is a **technical requirement**, not a security posture: without it a headless
  `-p` run that reaches for a tool outside the set blocks on a permission prompt nobody can answer.
- `--json-schema` is passed so the report is structurally valid; `.result` is parsed as JSON and
  falls back to raw text if that fails.
- `timeout 300` is the remote-side bound (Phase 32 D-03 precedent). The JS side adds a matching
  watchdog that calls the stream cancel handle, so a wedged remote cannot strand the turn.

Transport: `execRemoteCommandStream` (`sshService.ts:271`), which wraps the existing
`ssh_exec_stream` Rust command — non-blocking, line-streamed, cancellable via `ssh_kill_process`.
**No Rust change is needed for this phase.**

Preflight: `command -v claude` via `execRemoteCommand`, cached per `sshConfig.id` for the session.
Absent → refusal `REMOTE_CLAUDE_UNAVAILABLE`, never a mid-turn throw.

Result shape: `{ action: 'explore_repo', systemId, repoPath, model, report, truncated }` where
`report` is the structured JSON text, capped at 12000 characters, wrapped untrusted. The cap is the
whole point: a report is a summary, not a file dump.

### D-04 — Team turns pass the context window

`TeamRunCoordinatorOptions` gains `contextWindowTokens?: number`. `TeamWorkspace.tsx` passes
`config.contextWindowTokens` from `getNineRouterConfig`. Both `startEmployeeTurn` and
`startLeadTurn` spread it into the `ChatTurnRequest`, which `chatTurnRuntime.ts:323` already
forwards to `runAiOrchestratorLoop`.

Effect: `tokenBudget > 0`, so `compactMessagesInLoop` runs when a round reports prompt tokens above
`contextWindowTokens × 0.9` (analysis mode ratio). A read-heavy turn compacts instead of dying.

### D-05 — Both tiers are advertised, and the prompt says which to use

`explore_repo` is a team tool, so it lands in both payloads automatically (it is in neither
`LEAD_ONLY_TEAM_TOOLS` nor `EMPLOYEE_ONLY_TEAM_TOOLS`). Tool count goes 11 → 12.

`REVIEWER_GIT_READ_LINE` is rewritten to state the order that actually works:

1. `grep` — locate the symbol or string first.
2. `tree` — only when the layout is unknown.
3. `read_file` — page with `offset`/`limit`; never assume one call returns the whole file.
4. `explore_repo` — only for a broad "understand this subsystem" question that would otherwise cost
   many reads.

## Canonical References

- `src/services/ai/office/teamTools.ts` — `TeamToolContext`, `TeamToolRefusalCode`,
  `TEAM_TOOL_DEFINITIONS`, `resolveGitRepo`, `gitRead`, `executeTeamTool`.
- `src/services/gitRemoteService.ts` — `escapeShellArg`, `runGitCommand`.
- `src/services/gitRemoteTreeService.ts` — `confineRepoPath`, `getRemoteFileContent`,
  `getRemoteWorkingFileContent`, `isNotInRef`.
- `src/services/sshService.ts` — `execRemoteCommand`, `execRemoteCommandStream`,
  `getSshConfigById`, `getSshSecret`.
- `src/services/ai/office/teamRunCoordinator.ts` — `startEmployeeTurn`, `startLeadTurn`,
  `TeamRunCoordinatorOptions`.
- `src/components/ai/runtime/chatTurnRuntime.ts` — `ChatTurnRequest`, `runLoop` call.
- `src/services/ai/aiOrchestratorLoop.ts` — `tokenBudget`, `compactMessagesInLoop`.
- `src/services/ai/office/teamPrompts.ts` — `REVIEWER_GIT_READ_LINE`.
- `tests/services/ai/office/teamToolsGitRead.test.ts` — the `execRemoteCommand` mock seam.
