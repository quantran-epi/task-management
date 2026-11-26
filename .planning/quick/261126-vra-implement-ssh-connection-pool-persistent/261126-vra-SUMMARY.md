---
status: complete
quick_id: 261126-vra
date: 2026-11-26
---

# Quick Task 261126-vra: SSH connection pool + persistent remote SQLcl

## Delivered

- `src-tauri/src/ssh_pool.rs`: single `SshRuntimeState` (`OnceLock`) holding a pooled SSH transport keyed by connection identity **and socket-timeout class**, plus a persistent SQLcl session registry with idle TTL, unique `PROMPT` sentinels, per-session serialisation, bounded stderr drain, restart-once retry and PGID-based kill on cancel.
- `src-tauri/src/ssh_service.rs`: one-shot SSH commands reuse the pool; PTY/ghost-dev use dedicated transports; `ssh_exec_command` routes recognised SQLcl heredocs to the persistent path and always emits a terminal status event.
- `src-tauri/src/tool_cancel.rs`: all tool execs acquire the same runtime, report unhealthy transports on every failure, and expose the PGID kill helper to SQLcl cancellation.
- `src-tauri/src/lib.rs`: registers `ssh_invalidate_pool` and tears down the single runtime on app exit.
- `src/services/sshService.ts`: `saveSshConfig`/`deleteSshConfig` best-effort invalidate pooled sessions; `sshService.test.ts` covers all three outcomes.
- No host process spawn, no new local FS API, no new dependency, no external daemon.

## Verification

- `cd src-tauri && cargo check` — clean, zero warnings.
- `cd src-tauri && cargo test --lib ssh_pool::tests` — 12 passed, 0 failed.
- `npx vitest run src/services/__tests__/sshService.test.ts src/services/ai/__tests__/oracleSqlclService.test.ts --bail=1` — 51 passed, 0 failed.
- `npx tsc --noEmit --pretty false` — clean.
- Two `ai_proxy` IPv6 tests fail on the untouched baseline (confirmed by stashing these changes); unrelated.
- Two review rounds: 10 findings fixed (3 critical, 7 warnings) and a second review confirmed no remaining confirmed bugs after the follow-up fixes.

Commit: `41949863`.
