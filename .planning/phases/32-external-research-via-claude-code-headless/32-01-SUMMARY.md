---
phase: 32-external-research-via-claude-code-headless
plan: "01"
subsystem: ssh-transport
tags: [tauri, rust, ssh2, streaming, typescript, vitest]
dependency-graph:
  requires: []
  provides:
    - "Rust ssh_exec_stream / ssh_kill_process commands"
    - "SshStreamRegistry PID tracking"
    - "Frontend execRemoteCommandStream + cancel handle"
  affects:
    - "src/services/sshService.ts consumers (plan 04 research runner)"
tech-stack:
  added: []
  patterns:
    - "Non-PTY channel exec with owned channel.stream(0) reader"
    - "PID capture via `echo $$ && <command>` prefix (single shell parse)"
    - "Tauri event streaming per session id"
key-files:
  created:
    - src/services/__tests__/sshService.test.ts
  modified:
    - src-tauri/src/ssh_service.rs
    - src-tauri/src/lib.rs
    - src/types/ssh.ts
    - src/services/sshService.ts
decisions:
  - "Command passed to channel.exec unwrapped — no sh -c layer, so escapeShellArg single quotes survive"
  - "stdout read from owned channel.stream(0) so channel stays usable for stderr()/exit_status()"
  - "Registry resolved inside reader thread via app_handle.state::<SshStreamRegistry>() (State guard is borrowed, not 'static)"
metrics:
  duration: "~9m"
  completed: "2026-11-08T06:16:57Z"
  tasks: 2
  files: 5
---

# Phase 32 Plan 01: Non-PTY SSH Streaming + Remote Kill Summary

Non-PTY SSH line streaming with remote PID capture and SIGTERM cancellation, exposed to the frontend as `execRemoteCommandStream` with an idempotent cancel handle.

## What Was Built

**Rust (`src-tauri/src/ssh_service.rs`)**
- `SshStreamRegistry` — `Mutex<HashMap<String, u32>>` mapping session id to remote PID.
- `SshStreamEvent` / `SshStreamExitEvent` — camelCase serde structs mirroring the TS types.
- `ssh_exec_stream(app, config, secret, session_id, command)` — opens a non-PTY channel, execs `echo $$ && <command>`, spawns a reader thread that:
  - resolves the registry from the cloned `AppHandle` (borrowed `State` cannot cross into a `'static` closure),
  - parses the first stdout line as the remote PID (non-numeric banner lines are emitted as normal stdout instead of dropped),
  - reads remaining stdout via `BufReader::new(channel.stream(0))` — owned `Stream` keeps `channel` borrowable,
  - drains `channel.stderr()` after stdout EOF and emits non-empty lines with `stream: "stderr"`,
  - removes the PID and emits `ssh-stream:exit:{sid}` with `exit_status` and `error: None`.
- `ssh_kill_process(registry, config, secret, session_id)` — pops the PID and runs `kill -TERM <pid>` on a fresh channel.

**Rust (`src-tauri/src/lib.rs`)** — `.manage(ssh_service::SshStreamRegistry::default())` plus both commands registered in `generate_handler!`.

**TypeScript**
- `src/types/ssh.ts` — `SshStreamEvent`, `SshStreamExitEvent`.
- `src/services/sshService.ts` — `execRemoteCommandStream(config, command, sessionId, onData, onExit, secret)` returns `() => Promise<void>`. Listens on `ssh-stream:data:{sid}` and `ssh-stream:exit:{sid}`; the exit listener unlistens both and calls `onExit(evt.payload)` with the full payload. Cancel invokes `ssh_kill_process`, unlistens, and is idempotent via a `cancelled` flag.

## Verification

- `cargo check` inside `src-tauri/` — clean, no warnings.
- `npx vitest run src/services/__tests__/sshService.test.ts` — 5/5 pass.
- `npx tsc --noEmit` — 7 pre-existing unused-import errors in unrelated workbench/icon files; nothing in touched files.
- All acceptance greps pass: `pub struct SshStreamRegistry`, `pub fn ssh_exec_stream(`, `pub fn ssh_kill_process(`, `app_handle.state::<SshStreamRegistry>()`, `BufReader::new(channel.stream(0))`, `echo $$ && `, `manage(ssh_service::SshStreamRegistry::default())`, `ssh_service::ssh_exec_stream`, `export interface SshStreamEvent`, `export interface SshStreamExitEvent`, `export async function execRemoteCommandStream`, `onExit: (event: SshStreamExitEvent) => void`, `onExit(evt.payload)`. Negative gates hold: no `BufReader::new(channel)`, no `format!("sh -c`, no `wrapped_cmd`.

## Deviations from Plan

**1. [Rule 1 - Bug] Test secret resolution path**
- **Found during:** Task 2 test run
- **Issue:** Tests mocked `getSshSecret` via `vi.spyOn(sshService, 'getSshSecret')`, but `resolveSecret` calls the module-local `getSshSecret` directly, so the spy never applied and the keyring mock returned `null`.
- **Fix:** Tests pass an explicit `secret` argument instead, which short-circuits resolution. Also removed the now-unused spy.
- **Files modified:** `src/services/__tests__/sshService.test.ts`
- **Commit:** eee22a1a

## Threat Model Compliance

| Threat | Disposition | Status |
|--------|-------------|--------|
| T-32-01 (Tampering/Injection) | mitigate | Done — `channel.exec` receives the command unwrapped; no `sh -c` layer. |
| T-32-02 (DoS, orphaned remote processes) | mitigate | Done — PID captured on first stdout line, stored in `SshStreamRegistry`, killed via `kill -TERM`. |
| T-32-SC (Rust crates) | accept | No new crates; `ssh2` 0.9.6 already present. |

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundaries beyond those already in the plan's threat model.

## Self-Check: PASSED

- `src-tauri/src/ssh_service.rs` — FOUND
- `src-tauri/src/lib.rs` — FOUND
- `src/types/ssh.ts` — FOUND
- `src/services/sshService.ts` — FOUND
- `src/services/__tests__/sshService.test.ts` — FOUND
- Commit `42e3b52a` — FOUND
- Commit `eee22a1a` — FOUND
