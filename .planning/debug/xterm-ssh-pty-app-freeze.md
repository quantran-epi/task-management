---
status: resolved
trigger: "khi mở app có xterm kết nối, treo luôn app"
created: 2026-11-06T12:00:00Z
updated: 2026-11-06T12:15:00Z
---

## Current Focus

hypothesis: "Root causes confirmed and fixed: non-blocking ssh2 session, un-nested mutex locks in Rust service, unmount cancellation guard in React terminal, debounced dimension check on resize, and no blind fallback to configs[0] on startup."
test: "Run vitest scoped test suites and cargo check."
expecting: "All tests pass, cargo check cleanly passes without warnings/errors."
next_action: "Complete debug session report."

## Symptoms

expected: "When app opens with remote terminal, terminal connects without freezing UI or deadlocking Tauri commands."
actual: "Opening app with xterm connected completely freezes app."
errors: "Tauri IPC hangs, main UI blocked indefinitely."
reproduction: "Open workbench with SSH config configured, bottom terminal mounts and attempts connection."
started: "Since ssh_pty_service.rs and RemoteTerminalPanel introduced."

## Eliminated

## Evidence

- timestamp: 2026-11-06T12:05:00Z
  checked: src-tauri/src/ssh_pty_service.rs
  found: Reader thread held channel Mutex across blocking read (30s timeout). Tauri commands ssh_pty_resize, ssh_pty_write, ssh_pty_close locked registry.sessions while waiting on channel lock, creating cross-thread deadlock.
  implication: SSH session must be set to non-blocking mode; Mutex locks in Tauri commands must be tightly scoped and released immediately.

- timestamp: 2026-11-06T12:08:00Z
  checked: src/workbench/toolwindows/RemoteTerminalPanel.tsx
  found: startPtySession is async; if props change or component unmounts before resolution, session was leaked and cleanup was orphaned. ResizeObserver fired resizePty on every layout event without checking if cols/rows changed.
  implication: Added cancellation flag, checked sessionIdRef before updating state, debounced ResizeObserver with lastCols/lastRows comparison.

- timestamp: 2026-11-06T12:10:00Z
  checked: src/workbench/toolwindows/BottomToolWindow.tsx
  found: Automatically resolved configs[0] on initial mount even when activeRemoteConfigId was null, triggering unsolicited connection attempt on app startup.
  implication: Only resolve config when activeRemoteConfigId matches; otherwise remain in unconfigured state.

## Resolution

root_cause: |
  1. ssh_pty_service.rs ran SSH session in blocking mode with a 30s timeout while holding channel Mutex in the reader loop. Commands like ssh_pty_close locked registry.sessions and awaited channel Mutex, deadlocking Tauri threadpool.
  2. RemoteTerminalPanel.tsx lacked async cancellation in initTerminal and fired unthrottled resizePty calls on layout changes without checking dimension changes.
  3. BottomToolWindow.tsx blindly initiated connection to configs[0] on initial mount.
fix: |
  1. Set session.set_blocking(false) in ssh_pty_service.rs; tight-scoped registry.sessions lock in ssh_pty_write, ssh_pty_resize, ssh_pty_close.
  2. Added cancellation check and session ID guard in RemoteTerminalPanel.tsx; debounced ResizeObserver and checked lastColsRef / lastRowsRef.
  3. Guarded BottomToolWindow.tsx so it only sets resolvedConfig when activeRemoteConfigId matches.
verification: |
  1. cargo check --manifest-path src-tauri/Cargo.toml passed.
  2. npx vitest run src/workbench/__tests__/RemoteTerminal.test.tsx passed (5 tests).
  3. npx vitest run src/workbench/__tests__/BottomToolWindow.test.tsx passed (2 tests).
files_changed:
  - src-tauri/src/ssh_pty_service.rs
  - src/workbench/toolwindows/RemoteTerminalPanel.tsx
  - src/workbench/toolwindows/BottomToolWindow.tsx
  - src/workbench/__tests__/RemoteTerminal.test.tsx
  - src/workbench/__tests__/BottomToolWindow.test.tsx
