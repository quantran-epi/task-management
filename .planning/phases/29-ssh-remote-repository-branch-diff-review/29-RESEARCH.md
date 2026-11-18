# Phase 29: SSH Remote Repository Branch & Diff Review - Research

**Researched:** 2026-11-06  
**Domain:** Tauri Native SSH Backend, Remote Git Inspection, Split/Unified Diff Viewer, Dexie Branch Snapshot & Drift  
**Confidence:** HIGH  

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** SSH configuration (`sshConfigId`) and target repository directory path (`remoteRepoPath`) are bound per-project in IndexedDB/Dexie settings. When entering Step 3 for any CR in that project, the profile and remote path are pre-selected automatically, avoiding repetitive manual entry. — **Reversibility:** reversible — stored in project setting.
- **D-02:** Base branch for comparison defaults to auto-detected `origin/main` (fallback `origin/develop`), configurable in project/CR settings if a different baseline is needed.
- **D-03:** User selects the target branch from an interactive dropdown populated by remote git branch fetch (`git branch -a` / `git for-each-ref`). The system automatically queries remote branches via SSH and lets the user choose, rather than requiring blind manual text input.
- **D-04:** Dirty working tree handling: if `git status --porcelain` detects uncommitted changes, Step 3 displays a clear warning banner listing the uncommitted files, but still allows the user to review committed diffs ($BASE..HEAD) with an optional toggle to inspect uncommitted changes. — **Reversibility:** reversible.
- **D-05:** Step 3 layout uses a resizable 2-column split view:
  - Left panel: Commit timeline log (`git log`) and changed files tree with +/- line additions/deletions stats.
  - Right panel: File diff viewer previewing the currently selected file.
- **D-06:** The review interface includes a "Full Screen / Expand" modal toggle so developers can comfortably review large changesets across their entire monitor.
- **D-07:** Diff Viewer supports both Unified (stacked) and Split (side-by-side) viewing modes, monospaced line numbering, and safety capping (files > 1MB or > 5000 lines are capped with a "Load Full Diff" confirmation button).
- **D-08:** Clicking "Approve Review" saves a verified `BranchSnapshot` object ({ base, head, branch, commitShas, fileStats, approvedAt }) directly into CR state in IndexedDB (Dexie DB). This unlocks transition to Step 4 and marks Step 3 as approved. — **Reversibility:** reversible.
- **D-09:** Drift check: if the remote branch HEAD changes after approval (e.g. developer pushes new commits while in Step 3/4), the UI displays an informative alert ("Remote HEAD has drifted from approved snapshot") with a "Re-inspect & Update Snapshot" button, without zeroing out workflow progress or corrupting saved state.

### Claude's Discretion
- Exact split-pane divider implementation (use existing `ResizeSplitter` component or CSS flex resizer).
- Exact icon choices and badge colors for commit timeline and git status flags (A, M, D, R).
- Shell execution escaping helpers for remote git commands executed via `ssh_exec_command`.

### Deferred Ideas (OUT OF SCOPE)
None — discussion remained strictly focused on Phase 29 scope. Automatic change pack packaging and drift reconciliation are scoped for Phase 30.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SDLC-REPO-01 | SDLC Step 3 leverages existing Tauri native SSH service to connect to the remote host/WSL repo, supporting configured SSH profile selection and connection status verification. | Investigated `sshService.ts` (`execRemoteCommand`, `getSshConfigs`, `resolveSecret`) and `src-tauri/src/ssh_service.rs` (`ssh_exec_command`). Verified OS Keyring credential resolution via `keyringService.ts`. |
| SDLC-REPO-02 | Step 3 inspects remote git branch for the active CR (default `feature/{crCode}`), fetching commit log (`git log $BASE..HEAD`) and changed files diff summary (`git diff --stat`) for review. | Designed POSIX command wrappers for `git branch -a`, `git rev-parse`, `git log --format`, `git diff --numstat`, and porcelain status with safe shell escaping. |
| SDLC-REPO-03 | Step 3 provides a visual diff & commit review UI (commits timeline, files changed with status +/~/- , inline diff) allowing user approval before proceeding to Step 4. | Identified reusable diff parsing in `src/utils/gitDiffParser.ts` and hunk view in `src/components/agents/DiffHunkView.tsx`. Designed `RemoteDiffViewer` supporting Unified/Split modes, line numbering, and fullscreen modal toggle. |
| SDLC-REPO-06 | Repository SSH configurations respect native keyring credentials, opt-in per project, and never perform destructive write operations without explicit confirmation. | Bound SSH profile + repo path to project settings table in Dexie (`project_repo_ssh:{projectId}`). Read-only inspection commands exclusively. Strict read validation. |
</phase_requirements>

## Summary

Phase 29 transforms `Step3CodeGuideView` from a static instruction card into an interactive, native SSH-powered Git Branch & Diff Review workbench. By combining the existing Tauri desktop Rust SSH backend (`ssh_exec_command` with libssh2 and session authentication) with existing Git diff parsing infrastructure (`gitDiffParser.ts` and `DiffHunkView.tsx`), TaskMate connects to remote hosts or WSL environments to inspect active CR branches.

The system will:
1. Bind SSH profile ID and remote repository path per project in Dexie DB.
2. Query remote Git state (`git rev-parse`, `git branch -a`, `git status --porcelain`, `git log`, `git diff`).
3. Render a resizable 2-column layout (commit history timeline + changed files tree on the left, Unified/Split diff viewer on the right) with fullscreen expansion.
4. Persist an immutable `BranchSnapshot` in the CR workflow state on user approval, and detect subsequent remote HEAD drift non-destructively.

**Primary recommendation:** Build a dedicated `gitRemoteService.ts` on top of `sshService.ts` for strictly-typed, read-only remote Git queries. Reuse `parseGitDiff` and adapt `DiffHunkView` into `RemoteDiffViewer` with Split/Unified views and 5000-line safety caps. Update `SdlcWorkflowStateSchema` and `workflowCoordinator` to persist and check `branchSnapshot`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| SSH Transport & Exec | Tauri Rust backend (`src-tauri/src/ssh_service.rs`) | OS TCP / SSH daemon | Low-level TCP sockets, libssh2 session handshake, channel exec, stdout/stderr streaming. |
| Credential Storage | OS Keyring (`keyring_store.rs` / `keyringService.ts`) | — | Zero plaintext credentials in IndexedDB/Dexie. |
| Remote Git Command Orchestration | Client TS Service (`src/services/gitRemoteService.ts`) | Tauri IPC (`ssh_exec_command`) | Shell escaping, command framing, Git output parsing (branches, logs, porcelain status, diffs). |
| Project Binding & Snapshot Persistence | Client Database (`src/db/` Dexie) | React State | Project repo settings and CR `branchSnapshot` persisted locally in Dexie. |
| Review UI & Split/Unified Diff Display | React UI (`Step3CodeGuideView.tsx`, `RemoteDiffViewer.tsx`) | Ant Design 6 / `ResizeSplitter` | Fast, reactive, responsive 2-column split pane matching IntelliJ Islands Light theme. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Tauri Core IPC | 2.2.0 | Native bridge for SSH commands | [VERIFIED: package.json:31] Native desktop runtime; bypasses browser sandbox limitations for remote execution. |
| ssh2 (Rust crate) | 0.9.6 | Native SSH2 protocol client | [VERIFIED: src-tauri/Cargo.toml:28] High-performance Rust SSH bindings with TCP socket management and authentication. |
| Dexie | 4.4.6 | Local client persistence | [VERIFIED: package.json:35] Reactive IndexedDB wrapper managing project settings and CR workflow states. |
| Ant Design | 6.6.5 | UI components & Modals | [VERIFIED: package.json:33] Design system standard in TaskMate; supports compact layout and Splitter/Card/Timeline. |
| Zod | 4.6.5 | Schema validation | [VERIFIED: package.json:49] Validates `BranchSnapshot` and `SdlcWorkflowState` schema transitions. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @ant-design/icons | 6.3.4 | Status, branch, diff icons | [VERIFIED: package.json:25] Visual markers for Git status (A, M, D, R) and UI actions. |
| dayjs | 1.11.23 | Relative timestamp formatting | [VERIFIED: package.json:34] Formatting commit dates and snapshot approval timestamps. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom Git Parser (`gitDiffParser.ts`) | Monaco Editor Diff / `@monaco-editor/react` | Monaco adds heavy bundle footprint (~3-5MB) and complex webworker setups. `gitDiffParser.ts` + `DiffHunkView.tsx` already exist, work seamlessly with AntD themes, and support both Unified and Split modes. |
| Custom Flex/ResizeSplitter | `react-resizable-panels` (already in package.json) | `ResizeSplitter` is already standardized across TaskMate (`SdlcWorkspace`, notes, explorer). Consistency is preserved. |

## Package Legitimacy Audit
No new third-party packages are required. All capabilities rely on native Rust `ssh2`, existing `sshService.ts`, `gitDiffParser.ts`, and bundled Ant Design components.

## Architecture Patterns

### System Architecture Diagram

```
+---------------------------------------------------------------------------------------+
| Step3CodeGuideView (UI Container)                                                     |
|                                                                                       |
|  +---------------------------------------------------------------------------------+  |
|  | Config Header: SSH Profile Select | Remote Repo Path | Base/Target Branch Pick   |  |
|  +---------------------------------------------------------------------------------+  |
|  | Uncommitted Changes Banner (if git status --porcelain != empty)                  |  |
|  | Drift Warning Banner (if remote HEAD != snapshot.headSha)                         |  |
|  +---------------------------------------------------------------------------------+  |
|  | Resizable 2-Column Review Pane (ResizeSplitter)                                 |  |
|  |  +------------------------------------+  +-------------------------------------+  |  |
|  |  | Left Panel:                        |  | Right Panel:                        |  |  |
|  |  | - Commit Timeline ($BASE..HEAD)    |  | - RemoteDiffViewer                  |  |  |
|  |  | - Changed Files Tree (+add / -del) |  |   * Mode: Unified | Split           |  |  |
|  |  | - Filter Search & File Select      |  |   * Fullscreen Modal Toggle         |  |  |
|  |  |                                    |  |   * 5000-line Capping Safety        |  |  |
|  |  +------------------------------------+  +-------------------------------------+  |  |
|  +---------------------------------------------------------------------------------+  |
|  | Footer Action: "Approve Review" -> saves BranchSnapshot -> unlocks Step 4 Handoff   |
+---------------------------------------------------------------------------------------+
                                  |
                                  v
+---------------------------------------------------------------------------------------+
| gitRemoteService (Client Service)                                                     |
|  - getRemoteBranches(config, repoPath): Promise<string[]>                             |
|  - getRepoStatus(config, repoPath): Promise<GitStatusResult>                          |
|  - getCommitLog(config, repoPath, base, head): Promise<GitCommit[]>                   |
|  - getDiffSummary(config, repoPath, base, head): Promise<GitDiffSummary>              |
|  - getFileDiff(config, repoPath, base, head, filePath): Promise<string>               |
|  - getFullDiff(config, repoPath, base, head): Promise<string>                         |
+---------------------------------------------------------------------------------------+
                                  | (execRemoteCommand)
                                  v
+---------------------------------------------------------------------------------------+
| sshService & OS Keyring (Tauri IPC Bridge)                                            |
|  - resolveSecret(config.id) -> keyringService                                         |
|  - invoke('ssh_exec_command', { config, secret, command: 'git -C <repo> ...' })        |
+---------------------------------------------------------------------------------------+
                                  |
                                  v
+---------------------------------------------------------------------------------------+
| Rust Tauri Backend (`ssh_service.rs`)                                                 |
|  - TCP Connect & Handshake (timeout 10s)                                              |
|  - libssh2 Channel Session Exec                                                       |
|  - Stdout & Stderr streaming -> CommandOutput { stdout, stderr, exitStatus }          |
+---------------------------------------------------------------------------------------+
```

### Git Command Strategy Over SSH

All commands execute non-interactively via `git -C <repoPath>` with `--no-pager`:

1. **Verify Git Repo & Get Default Branch:**
   ```bash
   git -C "/remote/path" rev-parse --is-inside-work-tree && git -C "/remote/path" symbolic-ref refs/remotes/origin/HEAD 2>/dev/null || echo "origin/main"
   ```
2. **List Available Branches (D-03):**
   ```bash
   git -C "/remote/path" for-each-ref --format='%(refname:short)' refs/heads/ refs/remotes/origin/
   ```
   Filters out `origin/HEAD` and dedupes local vs remote tracking branches.
3. **Check Dirty Working Directory (D-04):**
   ```bash
   git -C "/remote/path" status --porcelain=v1
   ```
   Returns list of uncommitted/untracked files (flags ` M`, `M `, `??`, `A `, `D `).
4. **Get Commit Log between Base and Target:**
   ```bash
   git -C "/remote/path" log --no-pager "$BASE..$TARGET" --format='%H%x00%h%x00%an%x00%ad%x00%s' --date=iso
   ```
   Using null-byte delimiters (`%x00`) makes parsing immune to commit message quotes, newlines, or emoji.
5. **Get Changed Files List with Diff Stats:**
   ```bash
   git -C "/remote/path" diff --no-pager --numstat --name-status "$BASE..$TARGET"
   ```
   Combined with:
   ```bash
   git -C "/remote/path" diff --no-pager "$BASE..$TARGET"
   ```
6. **Get Single File Diff or Specific Blob:**
   ```bash
   git -C "/remote/path" diff --no-pager "$BASE..$TARGET" -- "$FILEPATH"
   ```

### Shell Escaping Helper (Discretion Item)
To prevent command injection when injecting repo paths, branches, or file names into SSH commands, arguments must be securely escaped using single-quote wrapping with inner quote escaping:
```typescript
export function escapeShellArg(arg: string): string {
  // Wrap in single quotes, replace single quotes with '\''
  return `'${arg.replace(/'/g, "'\\''")}'`;
}
```

### Branch Snapshot Data Structure (D-08, D-09)

Add to `src/services/wizard/workflowSchemas.ts`:
```typescript
export const BranchSnapshotSchema = z.strictObject({
  sshConfigId: z.string().min(1),
  remoteRepoPath: z.string().min(1),
  baseBranch: z.string().min(1),
  targetBranch: z.string().min(1),
  headSha: z.string().regex(/^[a-f0-9]{40}$/),
  commitCount: z.number().int().nonnegative(),
  commitShas: z.array(z.string().regex(/^[a-f0-9]{40}$/)),
  filesChangedCount: z.number().int().nonnegative(),
  totalAdditions: z.number().int().nonnegative(),
  totalDeletions: z.number().int().nonnegative(),
  fileStats: z.array(
    z.strictObject({
      path: z.string(),
      status: z.enum(['added', 'modified', 'deleted', 'renamed']),
      additions: z.number().int().nonnegative(),
      deletions: z.number().int().nonnegative(),
    })
  ),
  approvedAt: isoTimestampSchema,
});
export type BranchSnapshot = z.infer<typeof BranchSnapshotSchema>;
```

Attach to `SdlcWorkflowStateSchema.artifacts`:
```typescript
artifacts: z.strictObject({
  pl01: SdlcArtifactRefSchema.optional(),
  pl02: SdlcArtifactRefSchema.optional(),
  solution: SdlcArtifactRefSchema.optional(),
  codeGuide: SdlcArtifactRefSchema.optional(),
  branchSnapshot: BranchSnapshotSchema.optional(), // <-- New in Phase 29
  changePack: SdlcArtifactRefSchema.optional(),
  driftResult: ReconciliationResultSchema.optional(),
  // ...
})
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Git Diff Parsing | Custom regex parsing from scratch | `src/utils/gitDiffParser.ts` (`parseGitDiff`) | [VERIFIED: src/utils/gitDiffParser.ts:3-157] Already parses unified diff headers, hunks (`@@ -old +new @@`), line additions/deletions, and old/new line numbers. |
| Split/Unified Hunk Renderer | Custom HTML diff tables | Adapted `DiffHunkView.tsx` | [VERIFIED: src/components/agents/DiffHunkView.tsx:109-385] Handles unified stacked rows and split side-by-side alignment with light/dark theme tokens. |
| Resizable Split Pane | Raw mouse move event handlers | `src/components/common/ResizeSplitter.tsx` | [VERIFIED: src/components/common/ResizeSplitter.tsx:21-139] Handles touch/pointer capture, min/max clamping, ARIA accessibility, and double-click reset. |
| SSH Session / Socket Management | Custom TCP/WebSocket proxy | `ssh_service.rs` / `sshService.ts` | [VERIFIED: src-tauri/src/ssh_service.rs:50-120] Native Rust handles socket timeouts, pubkey/passphrase, and OS keyring retrieval. |

## Common Pitfalls

### Pitfall 1: Remote Repository Dirty Working Tree
**What goes wrong:** User is developing on remote branch with uncommitted edits. If TaskMate only queries `git diff $BASE..HEAD`, uncommitted work is invisible. If TaskMate queries working tree diff (`git diff`), it may include half-finished changes.  
**Why it happens:** Remote repos have active working copies.  
**How to avoid (D-04):** Run `git status --porcelain`. If output is non-empty, render an explicit warning banner with the list of uncommitted files. Keep the primary diff focused on committed `$BASE..HEAD`, but provide a toggle ("Bao gồm thay đổi chưa commit") that appends `git diff HEAD` to the view.  
**Warning signs:** Developer complains that diff shown in Step 3 doesn't match what they just edited.

### Pitfall 2: Oversized Diffs or Binary Files (D-07)
**What goes wrong:** Diffs touching minified JS bundles, package-lock.json (10,000+ lines), images, or binaries freeze the React DOM or crash the IPC channel.  
**Why it happens:** libssh2 channel reads entire stdout into memory; React renders 20,000 DOM nodes at once.  
**How to avoid:**
1. Use `--numstat` first to get file sizes and addition/deletion counts.
2. In `git diff`, exclude binary files (`--diff-filter=d` or check `Binary files ... differ` marker).
3. If total lines in a single file diff > 5000 or file size > 1MB, truncate rendering and show a banner: `"File diff quá lớn (> 5,000 dòng). Đã thu gọn để bảo vệ hiệu năng."` with button `"Tải đầy đủ"`.

### Pitfall 3: SSH Reconnects and Command Timeouts
**What goes wrong:** Large git diffs or slow remote networks cause `ssh_exec_command` to hang indefinitely.  
**Why it happens:** Default SSH channel exec blocks on `read_to_end` until remote EOF.  
**How to avoid:** Wrap the remote command invocation in frontend with an explicit 30s timeout rejection. Ensure command string starts with `timeout 25s git ...` if supported on host, and handle exit status != 0 gracefully with a clear error notification and "Thử lại" button.

### Pitfall 4: Remote Branch Name Differences
**What goes wrong:** Local branch is `feature/CR-01`, remote tracking branch is `origin/feature/CR-01`. Command `git diff origin/main..feature/CR-01` fails if user hasn't checked out the branch locally on the remote machine.  
**Why it happens:** Remote server may only have remote tracking refs or bare checkout.  
**How to avoid:** Normalize branch selection: allow user to pick either `feature/CR-01` or `origin/feature/CR-01`. In `git diff`, check `git rev-parse --verify "$TARGET"` first to confirm the ref exists before executing diff.

## Code Examples

### 1. Remote Git Service (`src/services/gitRemoteService.ts`)
```typescript
import { execRemoteCommand } from './sshService';
import type { SshConfig } from '../types/ssh';

export function escapeShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

export async function runGit(
  config: SshConfig,
  repoPath: string,
  args: string[],
  secret?: string
): Promise<string> {
  const cmd = `git -C ${escapeShellArg(repoPath)} --no-pager ${args.join(' ')}`;
  const res = await execRemoteCommand(config, cmd, secret);
  if (res.exitStatus !== 0) {
    throw new Error(res.stderr.trim() || `Lệnh Git thất bại với mã lỗi ${res.exitStatus}`);
  }
  return res.stdout;
}

export async function getRemoteBranches(
  config: SshConfig,
  repoPath: string,
  secret?: string
): Promise<string[]> {
  const output = await runGit(
    config,
    repoPath,
    ['for-each-ref', '--format="%(refname:short)"', 'refs/heads/', 'refs/remotes/origin/'],
    secret
  );
  return output
    .split('\n')
    .map((b) => b.trim().replace(/^"|"$/g, ''))
    .filter((b) => b && !b.includes('origin/HEAD'));
}

export async function checkDirtyStatus(
  config: SshConfig,
  repoPath: string,
  secret?: string
): Promise<{ isDirty: boolean; dirtyFiles: string[] }> {
  const output = await runGit(config, repoPath, ['status', '--porcelain=v1'], secret);
  const lines = output.split('\n').filter((l) => l.trim().length > 0);
  return {
    isDirty: lines.length > 0,
    dirtyFiles: lines.map((l) => l.slice(3).trim()),
  };
}
```

### 2. Checking Remote Drift (D-09)
```typescript
export async function checkHeadDrift(
  config: SshConfig,
  repoPath: string,
  targetBranch: string,
  expectedHeadSha: string,
  secret?: string
): Promise<{ drifted: boolean; currentHeadSha: string }> {
  const stdout = await runGit(config, repoPath, ['rev-parse', escapeShellArg(targetBranch)], secret);
  const currentHeadSha = stdout.trim();
  return {
    drifted: currentHeadSha !== expectedHeadSha,
    currentHeadSha,
  };
}
```

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Remote host has standard `git` installed in PATH reachable via non-interactive SSH shell. | Git Command Strategy | If remote login shell does not include `/usr/bin/git`, command execution fails. User will need custom Git binary path option if non-standard. |
| A2 | Target repository on remote has fetched upstream so `origin/main` or `origin/develop` is available. | Architecture Patterns | If base ref is missing, `git diff` fails. Fallback to detecting `HEAD~1` or user-configured base branch resolves this. |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Tauri Desktop Runtime | Native SSH execution (`ssh_exec_command`) | ✓ | Tauri 2.2.0 | Mock in Vitest via `tests/mocks/` |
| libssh2 | Remote SSH session authentication | ✓ | Rust ssh2 0.9.6 | Mock CommandOutput in frontend unit tests |
| OS Keyring | Storing SSH passwords / passphrases | ✓ | keyring 4.2 | In-memory session secret fallback |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.2 + React Testing Library 16.3.3 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run src/services/__tests__/gitRemoteService.test.ts` |
| Full suite command | `npx vitest run src/components/sdlc/steps/__tests__/Step3CodeGuideView.test.tsx` |

*Note: Per project memory, do NOT run full test suite. Run focused test files only.*

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SDLC-REPO-01 | SSH profile selection & connection test in Step 3 | unit / integration | `npx vitest run src/services/__tests__/gitRemoteService.test.ts -t "connection"` | ❌ Wave 0 Gap |
| SDLC-REPO-02 | Remote branch fetch, git log, git status, git diff parsing | unit | `npx vitest run src/services/__tests__/gitRemoteService.test.ts -t "git commands"` | ❌ Wave 0 Gap |
| SDLC-REPO-03 | Step 3 Review UI (split layout, diff viewer, fullscreen, approval) | component test | `npx vitest run src/components/sdlc/steps/__tests__/Step3CodeGuideView.test.tsx` | ❌ Wave 0 Gap |
| SDLC-REPO-06 | Keyring credential resolution & project-level SSH repo binding | unit | `npx vitest run src/services/__tests__/projectRepoSetting.test.ts` | ❌ Wave 0 Gap |

### Sampling Rate
- **Per task commit:** `npx vitest run src/services/__tests__/gitRemoteService.test.ts`
- **Per wave merge:** `npx vitest run src/components/sdlc/steps/__tests__/Step3CodeGuideView.test.tsx`
- **Phase gate:** All targeted tests green before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `src/services/__tests__/gitRemoteService.test.ts` — covers remote git command generation, shell escaping, parsing of `git branch`, `git log`, and dirty status.
- [ ] `src/components/sdlc/steps/__tests__/Step3CodeGuideView.test.tsx` — covers branch selection dropdown, dirty warning banner, diff review toggle, approval saving `branchSnapshot`, and transition to Step 4.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | SSH Key / Password via OS Keyring (`keyringService.ts`). Never persisted plaintext in IndexedDB. |
| V5 Input Validation | yes | `escapeShellArg` for all parameters passed into remote shell execution via `ssh_exec_command`. Zod schema validation for `BranchSnapshot`. |
| V6 Cryptography | yes | Native `ssh2` libssh2 cryptographic protocol negotiation. Web Crypto `crypto.subtle` for SHA-256 commit hashing. |

### Known Threat Patterns for Remote SSH Git

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Shell Command Injection in Git Arguments | Tampering | Strict POSIX argument escaping (`escapeShellArg`), validating branch and repo path against whitespace and control characters. |
| SSH Credential Exposure in IndexedDB | Information Disclosure | All SSH passwords/passphrases stored in native OS Keyring; IndexedDB holds only `sshConfigId`. |
| Destructive Git Command Execution | Tampering / Denial of Service | System is strictly read-only: permits only `git rev-parse`, `git for-each-ref`, `git log`, `git diff`, and `git status`. Write/destructive commands (`push`, `reset --hard`, `checkout -f`) are prohibited. |

## Sources

### Primary (HIGH confidence)
- `src/services/sshService.ts` — Existing Tauri SSH service implementation and keyring resolution.
- `src-tauri/src/ssh_service.rs` — Native Rust SSH execution via libssh2 channel session.
- `src/utils/gitDiffParser.ts` — In-repo unified git diff parser for hunks and lines.
- `src/components/agents/DiffHunkView.tsx` — In-repo unified and side-by-side diff renderer.
- `src/components/sdlc/steps/Step3CodeGuideView.tsx` — Current Step 3 component and handoff contract.
- `src/services/wizard/workflowSchemas.ts` — SDLC workflow state schema and artifact definitions.

### Secondary (MEDIUM confidence)
- Git Reference Manual — `for-each-ref`, `diff --numstat`, and `--porcelain=v1` specifications.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — uses existing in-tree Tauri, ssh2, and Dexie stacks.
- Architecture: HIGH — read-only git command layer + adapted diff viewer UI.
- Pitfalls: HIGH — addressed dirty repos, oversized diffs, timeouts, and branch naming.

**Research date:** 2026-11-06  
**Valid until:** 2026-12-06

## RESEARCH COMPLETE
