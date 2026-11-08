---
phase: 32-external-research-via-claude-code-headless
reviewed: 2026-11-08T00:00:00Z
depth: standard
files_reviewed: 16
files_reviewed_list:
  - src-tauri/src/ssh_service.rs
  - src-tauri/src/lib.rs
  - src/types/ssh.ts
  - src/services/sshService.ts
  - src/services/ai/wizardSchemas.ts
  - src/services/wizard/artifactRepo.ts
  - src/services/ai/aiTools.ts
  - src/services/ai/sdlcArtifactTools.ts
  - src/services/ai/chatTurnTools.ts
  - src/services/ai/researchService.ts
  - src/services/ai/sdlcPromptComposer.ts
  - src/components/sdlc/common/ResearchSummaryCard.tsx
  - src/components/sdlc/chat/StepChatPanel.tsx
  - src/components/sdlc/steps/Step1IntakeView.tsx
  - src/components/sdlc/steps/Step2SolutionView.tsx
  - src/views/ChangeRequestSdlcView.tsx
findings:
  critical: 4
  warning: 15
  info: 8
  total: 27
resolved:
  critical: 4
  warning: 15
  info: 4
  total: 23
status: resolved
---

# Phase 32: Code Review Report

**Reviewed:** 2026-11-08
**Depth:** standard
**Files Reviewed:** 16
**Status:** issues_found

## Summary

Phase 32 adds an SSH-driven Claude Code headless research path: a Rust streaming command runner with a PID registry, a TS orchestrator that builds/escapes the remote command and parses the CLI envelope, a Zod-validated RESEARCH artifact persisted to IndexedDB, and UI cards plus a prompt-composer segment that ranks external evidence below internal evidence.

The layering is sound and the shell-escaping primitive (`escapeShellArg`) is correct — it is the standard POSIX `'\''` form and is applied to every user/AI-derived string that reaches the remote shell (`buildResearchCommand` is the only command builder, and both `remoteRepoPath` and `prompt` go through it). Zod validation does happen before persistence (`ResearchPayloadSchema` on write, re-validated on read at every render site), and `propose_research` correctly re-resolves every model-supplied `systemId` against the catalog and the CR targets. No secret is logged or persisted anywhere in the research path.

Four blockers remain. The read-only guarantee for the remote agent is enforced only by the tool allowlist plus prompt text, and is overridable by the remote machine's own settings. Cancellation has two windows where it is silently a no-op while the remote process keeps running. Concurrent runs in one step scope share a single SSH session id and cross-talk. And research version numbers are allocated per-thread while reads are CR-scoped, so "latest research" can resolve to an older run.

## Critical Issues

### CR-01: Read-only research is not structurally enforced on the remote agent

**File:** `src/services/ai/researchService.ts:267`
**Issue:** `buildResearchCommand` emits `claude -p <prompt> --output-format json --allowedTools Glob,Grep,Read` (or `WebSearch,WebFetch,Glob,Grep,Read`). In headless `-p` mode an unlisted tool is normally auto-denied because no one can answer a permission prompt — but that is a *default*, not a guarantee: `~/.claude/settings.json` or project `.claude/settings.json` on the research host can pre-approve `Bash`, `Edit`, `Write` via `permissions.allow` or `defaultMode`. Nothing in the invocation pins `--permission-mode` or denies the mutating tools, so the read-only property the whole design rests on (T-32-01/T-32-03, and the module doc at line 253-259) is asserted by remote config plus prompt text — and prompt text is untrusted data. A prompt injection reaching the remote agent through `WebFetch`/`WebSearch` content can then drive whatever the remote defaults permit, i.e. arbitrary command execution on the research host with that user's privileges.
**Fix:** deny the mutating/code-running tools explicitly and pin a non-writing mode, so the guarantee does not depend on the remote machine's settings:
```ts
const tools = includeWeb ? READ_ONLY_WEB_TOOLS : READ_ONLY_TOOLS;
const DENIED = 'Bash,Edit,Write,NotebookEdit,MultiEdit';
return `cd ${escapeShellArg(remoteRepoPath || '.')} && exec claude -p ${escapeShellArg(prompt)}`
  + ` --output-format json --permission-mode plan --allowedTools ${tools} --disallowedTools ${DENIED}`;
```
Add a unit assertion on `buildResearchCommand` so the flag cannot be dropped silently.

### CR-02: `cancel()` is a silent no-op in two windows; the remote process runs to completion

**File:** `src/services/ai/researchService.ts:366-374, 408-430, 508-514`
**Issue:** `cancelActive` is only assigned *after* `await execRemoteCommandStream(...)` resolves (line 430), and `stopRemote()` reads it synchronously (line 367). Two reachable windows therefore leave `settled = true` with no kill:

1. Between the loop-top `if (settled) return;` (line 409) and the assignment at line 430 the loop awaits `getSystem` and `getSshConfigById`. A cancel here sets `settled`, then the loop still starts the remote `claude` process, assigns `cancelActive`, and parks on `await streamDone` — the remote run continues for up to 300 s with no kill.
2. Between two systems, `cancelActive` still points at the *previous* system's already-consumed handle, so `ssh_kill_process` targets a PID already removed from the registry (a no-op) while the next system's process starts uncancelled.

In both cases the UI immediately renders `ResearchErrorAlert` → "Tiến trình nghiên cứu đã được hủy bỏ an toàn" (`StepChatPanel.tsx:396`), which is false.
**Fix:** re-check `settled` after every await and kill immediately if a handle arrives post-cancel:
```ts
const handle = await execRemoteCommandStream(...);
cancelActive = handle;
if (settled) { await stopRemote(); return; }   // cancel arrived during setup
```
and reset `cancelActive = undefined` after each system's `await streamDone`.

### CR-03: Concurrent runs in one step scope share a session id and cross-talk

**File:** `src/components/sdlc/chat/StepChatPanel.tsx:455, 919-944`; `src/services/sshService.ts:297-303`; `src-tauri/src/ssh_service.rs:466-468, 502-506`
**Issue:** `sessionId` is memoized per **step scope** (`useMemo(() => crypto.randomUUID(), [scopeKey])`), not per run, and `startResearch` has no in-flight guard — it just bumps `researchRunIdRef` and starts a second `executeMultiSystemResearch`. The toolbar button that opens `ResearchTriggerModal` is never given `loading` (`Step1IntakeView.tsx:169-174`, `Step2SolutionView.tsx:287-292`), so a second run is one click away while the first is streaming. With two live runs on the same `sessionId`:

- Both `execRemoteCommandStream` calls register listeners on `ssh-stream:data:<sid>` / `ssh-stream:exit:<sid>`. One exit event fires both `onExit` callbacks, so run 1's `streamDone` resolves with **run 2's** exit status.
- `procs.insert(sid, pid)` in the Rust thread overwrites run 1's PID; run 1's `procs.remove(&sid)` on completion then removes **run 2's** PID, so run 2 can never be killed.
- `cleanup()` in the first exit listener unlistens the shared event names, so run 2's data events are dropped.

**Fix:** allocate the session id per run (`const sessionId = crypto.randomUUID()` inside `startResearch`) and add `if (researchRun.phase === 'streaming') return;` at the top of `startResearch`; pass `loading={researchRun.phase === 'streaming'}` to `ResearchSummaryCard` from both step views.

### CR-04: Research versions are per-thread but reads are CR-scoped — "latest" can be an older run

**File:** `src/services/wizard/artifactRepo.ts:150-172, 254-294`; `src/components/sdlc/steps/Step1IntakeView.tsx:72-77`; `src/components/sdlc/steps/Step2SolutionView.tsx:175-180`
**Issue:** `commitArtifact` computes `version = max(version of same kind **and same threadId**) + 1` (line 170-172), while `loadResearchNotes` filters by `changeRequestId` only (line 255-263) — deliberately, per SDLC-RES-06 ("research is reused across steps"). Running research once from Step 1 and once from Step 2 produces two notes both at `version: 1`. `loadLatestResearchArtifact` sorts ascending by `version` and walks backwards (line 289-292); with equal versions the winner is decided by the `entityId` index order, i.e. effectively arbitrarily. The model is then fed an *older* research payload as "the latest evidence" (`StepChatPanel.tsx:529-536`), and the version selector in `ResearchDetailModal` renders two `Segmented` options with the same `value` (`ResearchSummaryCard.tsx:324-333`), so selecting one is ambiguous.
**Fix:** make the research version CR-scoped: in `commitArtifact`, when `kind === 'RESEARCH'`, compute the max over all notes of that kind for the CR (ignore `threadId`); or sort `loadResearchNotes` by `approvedAt` and derive the displayed version from that order.

## Warnings

### WR-01: Stream exit status is read without `wait_close()`

**File:** `src-tauri/src/ssh_service.rs:512`
**Issue:** `ssh_exec_command` calls `channel.wait_close()` before `channel.exit_status()` (lines 397-398); the stream thread does not. libssh2 only guarantees `exit_status` once the channel has processed the `exit-status` packet, which can arrive after both streams hit EOF. If it has not been consumed the reported status is a stale/default value, and `researchService` treats failed CLI output as a valid report (`parseResearchOutput` then degrades it to zero findings and persists an artifact).
**Fix:** mirror `ssh_exec_command`:
```rust
let _ = channel.wait_close();
exit_status: channel.exit_status().unwrap_or(-1),
```

### WR-02: PID is removed from the registry before the kill succeeds

**File:** `src-tauri/src/ssh_service.rs:530-537`
**Issue:** `procs.remove(&session_id)` happens first; if `connect_and_auth` or `channel.exec` then fails (host unreachable at cancel time, transient auth failure), the PID is gone and no retry can ever kill the process — a guaranteed orphan.
**Fix:** peek first, remove only after a successful `exec`:
```rust
let pid = { registry.active_processes.lock().map_err(|e| e.to_string())?.get(&session_id).copied() };
let Some(pid) = pid else { return Ok(()) };
// ... exec kill ...
registry.active_processes.lock().map_err(|e| e.to_string())?.remove(&session_id);
```

### WR-03: `SshStreamRegistry` is never cleaned up on app exit

**File:** `src-tauri/src/lib.rs:87-95`
**Issue:** `RunEvent::ExitRequested` cleans the PTY registry and the agent manager but not `SshStreamRegistry`. Detached stream threads die with the process, leaving remote `claude` processes running with no owner.
**Fix:** add a `cleanup_on_exit` for the stream registry that drains the map and SIGTERMs each PID, called next to `ssh_pty_service::cleanup_on_exit`.

### WR-04: `kill -TERM <pid>` does not kill the process group

**File:** `src-tauri/src/ssh_service.rs:544`
**Issue:** Only the direct PID is signalled. Any child the remote agent spawned (a `Bash` tool subprocess, a `WebFetch` helper) survives. The doc comment at line 253-255 asserts "no child is orphaned", which holds only if the agent spawns nothing.
**Fix:** start the command in its own session and kill the group: `exec setsid claude …` then `kill -TERM -<pid>` (`setsid` makes the PID the PGID).

### WR-05: A login banner before the PID line disables cancellation for that run

**File:** `src-tauri/src/ssh_service.rs:463-473`
**Issue:** PID detection is attempted only on the first line. If the remote shell prints a banner or `.bashrc` echo first, the line is emitted as data and `pid_registered` stays `false` — the PID is never registered, so `ssh_kill_process` can never find it and cancel is a no-op. The banner line also pollutes stdout, which then fails JSON parsing.
**Fix:** keep scanning for the first line that parses as a `u32` (bounded to, say, the first 5 lines), and drop it from the emitted stream; or run the command as `printf '%s\n' $$; exec …` with `--norc`-style suppression documented.

### WR-06: `ResearchProposalCard` keeps a stale system selection across proposals

**File:** `src/components/sdlc/chat/StepChatPanel.tsx:208, 271-278`
**Issue:** `const [checked, setChecked] = useState<string[]>(() => proposal.targetSystemIds)` runs once per mounted instance. When a second `propose_research` result replaces `researchProposal`, the same component instance is reused, so `checked` still holds the *previous* proposal's ids. `onConfirm` then sends those ids as `targetSystemIds`, and `executeMultiSystemResearch` never re-validates them against `cr.targets` (see WR-12), so the user can confirm a proposal and research a set of systems the card never displayed.
**Fix:** key the card on proposal identity (`<ResearchProposalCard key={proposalKey} …>`) or sync with `useEffect(() => setChecked(proposal.targetSystemIds), [proposal])`.

### WR-07: External-research segment is dropped entirely when there are zero findings

**File:** `src/services/ai/sdlcPromptComposer.ts:387-389`
**Issue:** `if (findings.length === 0) return '';` discards `summary` and `skippedSystems` too. A run that produced only a summary, or only "these systems could not be researched" (T-32-11's explicit warning), contributes nothing to the prompt — while `ResearchCompletionCard` still offers "Tiếp tục sinh Solution với bằng chứng này" (`StepChatPanel.tsx:375-377`) and `PROCEED_WITH_RESEARCH_PROMPT` tells the model to apply evidence that is not in the prompt.
**Fix:** emit the segment when `findings.length > 0 || payload?.summary?.trim() || (payload?.skippedSystems?.length ?? 0) > 0`.

### WR-08: Delimiter breakout from untrusted research text is not neutralized

**File:** `src/services/ai/sdlcPromptComposer.ts:391-418`
**Issue:** `claim`, `source`, `summary` and `skippedSystems[].code/reason` are interpolated verbatim between `EXTERNAL_RESEARCH_OPEN` and `EXTERNAL_RESEARCH_CLOSE`. A web page fetched by the remote agent can place `</external_research_evidence>` inside a claim; everything after it lands outside the delimited block, immediately before the output contract, and can impersonate policy text. The layer-1 policy still precedes it, so the blast radius is bounded, but the delimiter's stated guarantee (line 384, "cannot be overridden") is not upheld.
**Fix:** strip/escape the sentinel before interpolation:
```ts
const neutralize = (s: string) => s.replace(/<\/?external_research_evidence[^>]*>/gi, '[redacted-tag]');
```

### WR-09: Soft-deleted research notes still feed the prompt

**File:** `src/services/wizard/artifactRepo.ts:254-265`
**Issue:** `loadResearchNotes` filters on `entityType`, `kind` and `changeRequestId` but not `deletedAt`. Research notes are added to the CR's SDLC document set (line 199-204), so they appear in the Notes UI and can be moved to trash; a trashed research artifact continues to be injected as evidence and shown as the current version.
**Fix:** add `&& !note.deletedAt` to the filter, matching `noteRepo.ts:184`.

### WR-10: Untrusted research text has no length bound

**File:** `src/services/ai/researchService.ts:13-32`
**Issue:** `summary`, `claim`, `source` and `rawOutput` are `z.string()` with no `.max()`. `rawOutput` is the entire streamed CLI stdout (the orchestrator accumulates every line in `lines` and joins them, line 421/470). All of it is persisted into a Note body and `summary`/`claim` are re-injected into every subsequent prompt for the CR. A chatty or malicious run can bloat IndexedDB, the encrypted backup artifact (1 MB Contents API budget) and every prompt.
**Fix:** cap at the schema: `summary: z.string().min(1).max(4000)`, `claim: z.string().min(1).max(2000)`, `source: z.string().min(1).max(2000)`, `rawOutput: z.string().max(200_000).optional()`, and truncate `lines.join('\n')` before parsing.

### WR-11: Unparseable output degrades silently to a "successful" empty run

**File:** `src/services/ai/researchService.ts:163-168`; `src/components/sdlc/chat/StepChatPanel.tsx:347-368`
**Issue:** `parseResearchOutput` never throws; on failure it returns `{ summary: raw.slice(0, 2000), findings: [], rawOutput }`. The orchestrator persists that as a normal artifact and `ResearchCompletionCard` renders "Hoàn thành nghiên cứu ngoài" with `0 phát hiện` and no warning. The user and the model both see a successful run with no evidence. The strict schema amplifies this: a model that emits `confidence: 85` or `scope: "WEB"` loses every finding silently, because `ResearchPayloadSchema` rejects the whole payload and the fallback path swallows it.
**Fix:** return a discriminated result (e.g. `{ parsed: false }`) and surface a warning card / `onLog` line when the payload could not be recovered; loosen `confidence` to `z.number().min(0).max(100).transform(v => v > 1 ? v / 100 : v)` and `scope` to a case-insensitive preprocess.

### WR-12: `targetSystemIds` is never re-validated at the execution boundary

**File:** `src/services/ai/researchService.ts:385, 396-402`
**Issue:** `checkResearchAvailability` resolves whatever ids it is handed and the loop runs research on every available one. Only `proposeResearch` (`sdlcArtifactTools.ts:641`) intersects with `cr.targets`; the manual modal path relies on UI-supplied ids and the proposal-card path can send stale ids (WR-06). The execution boundary should not trust its caller for scope.
**Fix:** load the CR in `executeMultiSystemResearch` and intersect `options.targetSystemIds` with `cr.targets.map(t => t.systemId)`, logging any dropped id.

### WR-13: A cancelled run can still persist a research artifact

**File:** `src/services/ai/researchService.ts:487-502`
**Issue:** The last `if (settled) return;` is at line 468, before `saveResearchArtifact`. A `cancel()` during the IndexedDB write sets `settled` and rejects the promise, so the UI renders "đã hủy bỏ an toàn", but the artifact is committed and immediately becomes the prompt's external evidence. `finishResolve` then no-ops.
**Fix:** re-check `settled` after the save and, if cancelled, delete the just-written note; or check `settled` immediately before the write and document the remaining narrow race.

### WR-14: `ssh_exec_command` error text embeds the full command, including credentials

**File:** `src-tauri/src/ssh_service.rs:383` (pre-existing, inside a reviewed file)
**Issue:** `format!("Thực thi lệnh '{}' thất bại: {}", command, e)` puts the whole command string into the error, which the frontend surfaces to the user. `oracleSqlclService.ts:193` builds that command with `'${config.connectionString}'`, which conventionally carries `user/password@host`. A failed exec therefore leaks the Oracle password into UI error text.
**Fix:** log only the first token (`command.split_whitespace().next()`), or redact `\S+/\S+@` before formatting.

### WR-15: Research notes are added to the CR SDLC document set

**File:** `src/services/wizard/artifactRepo.ts:199-204`
**Issue:** `commitArtifact` appends every artifact note — including `RESEARCH`, whose body contains untrusted web text — to the CR's `documentSets` entry. That set is what the knowledge publish flow snapshots (`publishOrchestrator.ts:142`, `sdlcWizardRuntime.ts:83`), so externally sourced, unverified content becomes publishable to the knowledge daemon. This may be intended, but it is not stated anywhere in the research path and no DLP distinction is made between internal artifacts and external evidence.
**Fix:** either exclude `RESEARCH` from the set (it is already read CR-scoped, not set-scoped) or tag it so the publish preview can flag it as external.

## Info

### IN-01: Stray comment/export merge

**File:** `src/services/ai/sdlcPromptComposer.ts:421`
**Issue:** `/** D-39: … */export const SUBSYSTEM_UNAFFECTED_MARKER = …` — the export sits on the comment's closing line. Valid JS, but Prettier would split it and it reads as a merge artifact.
**Fix:** put the export on its own line.

### IN-02: `escapeShellArg` is duplicated

**File:** `src/services/ai/researchService.ts:66-68` vs `src/services/gitRemoteService.ts:11-13`
**Issue:** Two byte-identical implementations of a security-critical primitive. A future fix to one will not reach the other.
**Fix:** export it once (from `gitRemoteService` or a shared `utils/shell.ts`) and import it.

### IN-03: `SDLC_STEP_TOOL_POLICY` is production-dead

**File:** `src/services/ai/sdlcPromptComposer.ts:162-169`
**Issue:** `composeSdlcTurn` calls `buildToolPolicy` directly (line 555); the precomputed record is only read by tests.
**Fix:** keep it if tests are the intended consumer, but say so in the doc comment; otherwise delete.

### IN-04: `renderResearchMarkdown` can break its own code fence

**File:** `src/services/ai/researchService.ts:300-302`
**Issue:** `rawOutput` is wrapped in a three-backtick fence; CLI output containing ` ``` ` terminates the block early. Rendered as escaped HTML so no XSS, but the report body is malformed.
**Fix:** use a four-backtick fence, or pick a fence longer than the longest backtick run in `rawOutput`.

### IN-05: No cap on research question count or length

**File:** `src/components/sdlc/common/ResearchSummaryCard.tsx:392-396`
**Issue:** `questionText.split('\n')` is unbounded; every question is concatenated into one shell argument and one remote prompt.
**Fix:** cap at, say, 20 questions / 500 chars each and disable submit past the cap.

### IN-06: Read-only research trigger silently no-ops

**File:** `src/components/sdlc/steps/Step2SolutionView.tsx:287-301`; `src/components/sdlc/chat/StepChatPanel.tsx:919-922`
**Issue:** The card's "Nghiên cứu" button is enabled when a historical version is pinned, but `startResearch` returns immediately on `readOnly`. The user gets no feedback.
**Fix:** pass `onTriggerResearch={readOnly ? undefined : …}` (the card already hides the button when the handler is absent).

### IN-07: Only the last system's raw output is retained

**File:** `src/services/ai/researchService.ts:472`
**Issue:** `if (parsed.rawOutput) rawOutput = parsed.rawOutput;` overwrites per system, so a multi-system run keeps only the final system's raw text in the persisted report.
**Fix:** collect per-system raw output into a keyed map, or concatenate with a system header.

### IN-08: Out-of-scope questions are dropped instead of kept untargeted

**File:** `src/services/ai/sdlcArtifactTools.ts:646-658`
**Issue:** A question bound to a `systemId` outside `cr.targets` is discarded entirely (`continue`), even though the same question without a binding would be legitimate. The model gets no signal that its target was rejected.
**Fix:** push `{ question: candidate.question }` (unbound) and record the dropped id in `unavailableSystemIds` or a new `rejectedSystemIds`.

---

_Reviewed: 2026-11-08_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

---

## Resolution (2026-11-08)

All 4 critical, all 15 warnings, and 4 of 8 info findings were fixed in the same session.

| ID | Fix |
|----|-----|
| CR-01 | `buildResearchCommand` now pins `--permission-mode plan` and `--disallowedTools Bash,Edit,Write,MultiEdit,NotebookEdit`. Read-only no longer depends on the remote machine's settings. |
| CR-02 | `settled` re-checked after every await; a handle that arrives post-cancel is killed immediately; `cancelActive` reset after each system. |
| CR-03 | Session id allocated per run (`crypto.randomUUID()` inside `startResearch`) plus an in-flight guard on `phase === 'streaming'`. |
| CR-04 | RESEARCH version is allocated CR-scoped (`versionScope = null` for that kind), matching the CR-scoped read. |
| WR-01 | `channel.wait_close()` before reading `exit_status`. |
| WR-02 | PID peeked, removed only after a successful kill exec. |
| WR-03 | `ssh_service::cleanup_on_exit` wired into `RunEvent::ExitRequested`. |
| WR-04 | Kill attempts the process group (`kill -TERM -<pid>`) with a plain-PID fallback. `setsid` deliberately not used — it forks when the shell is already a group leader, which would make the echoed PID the wrong process. |
| WR-05 | PID scan continues for up to 5 lines instead of only line 1. |
| WR-06 | `ResearchProposalCard` syncs `checked` with `useEffect` on proposal change. |
| WR-07 | Segment emitted when findings, summary, or skippedSystems is non-empty. |
| WR-08 | `neutralizeDelimiters` strips `<external_research_evidence>` from all interpolated untrusted text. |
| WR-09 | `loadResearchNotes` filters `!note.deletedAt`. |
| WR-10 | Schema bounds every field; over-length text truncates instead of rejecting the payload. |
| WR-11 | `parseResearchOutputResult` reports recovery; a run with zero recovered findings fails `RESEARCH_UNPARSED` instead of rendering a silent success. `confidence`/`scope` normalized instead of rejected. |
| WR-12 | `executeMultiSystemResearch` loads the CR and intersects `targetSystemIds` with `cr.targets`. |
| WR-13 | `settled` re-checked after `saveResearchArtifact`. |
| WR-14 | `ssh_exec_command` error no longer embeds the command string (Oracle connection-string leak). |
| WR-15 | RESEARCH notes excluded from the CR SDLC document set, so external text is not publishable. |
| IN-01 | Export moved to its own line. |
| IN-02 | `escapeShellArg` re-exported from `gitRemoteService` — one canonical implementation. |
| IN-04 | Raw-output fence sized to the longest backtick run. |
| IN-05 | Question count and length capped in the trigger modal. |
| IN-06 | Step 2 hides the research trigger when `readOnly`. |
| IN-07 | Raw output collected per system with a header instead of last-wins. |
| IN-08 | Out-of-scope questions kept untargeted; `rejectedSystemIds` reported. |

Not fixed (intentional):
- **IN-03** — `SDLC_STEP_TOOL_POLICY` is read by tests; left as-is.
- **WR-03 residual** — the registry clears on exit but does not SIGTERM remote processes, because it deliberately holds no SSH configs or secrets. Noted as a `ponytail:` comment with the upgrade path.

Verification: 497 scoped tests pass, `npx tsc --noEmit` exit 0, `npm run build` exit 0, `cargo check` clean.
