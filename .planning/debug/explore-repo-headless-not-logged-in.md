---
status: verified
trigger: "explore_repo on the local/remote host reports outcome: error with 'Not logged in · Please run /login' although the owner can open Claude Code on this same machine by typing `claude` and use it without any interactive login step. Need determine why the headless CLI path (`claude -p ...`) used by explore_repo cannot see/use the working CLI auth context and fix or map it truthfully."
created: "2026-11-17"
updated: "2026-11-17"
---

# Debug Session: explore-repo-headless-not-logged-in

## Symptoms

- Expected behavior: `explore_repo` runs Claude Code headless through the configured SSH profile on this machine. Since interactive `claude` works here without `/login`, the headless `claude -p --restricted ...` invocation should use the same configured authentication and produce a bounded report.
- Actual behavior: during real-Tauri UAT, two `explore_repo` calls on systemId `a32efe16-456f-4914-bb8c-2ecd284889ec`, repoPath `/home/quantd/workspace/cardu/auto-accounting`, returned `outcome: "error"` with detail `Not logged in · Please run /login` (report ids `5bc8fa48`, `ce1b8c55`).
- Error messages: `Not logged in · Please run /login`.
- Timeline: discovered after phase 44 push `ec6bfbd2`; owner reports the same machine's interactive `claude` has been configured and normally just works by typing `claude`, with no login prompt.
- Reproduction: run a team turn where an agent calls `explore_repo` with a valid linked system/SSH profile pointing at the local workspace; inspect the tool result.

## Additional UAT symptom (new transport failure after auth fix)

- After pushing auth fix `644dd579`, owner reports `explore_repo` still fails with raw error: `SSH handshake thất bại: [Session(-8)] Unable to exchange encryption keys` (report code `4627a40d`).
- This is now an SSH/transport failure, distinct from the previous `Not logged in` auth failure. Resume investigation with this symptom: inspect `probeRemoteClaude`, `runRemoteExplore`, and the Tauri SSH stream command path (`execRemoteCommandStream`, `ssh_exec_stream`) under the configured profile; determine whether this is a transient reusable-session failure, stale profile/key mismatch, algorithm negotiation issue, or stream-channel setup problem. Add a truthful refusal or retry/fallback only when backed by evidence.
- Keep the auth fix intact unless evidence shows it caused the handshake regression.

## Current Focus

- bug_class: Heisenbug / Mandelbug — INTERMITTENT transport fault (1 failed KEX in ~110 libssh2 connections to the same host with the same profile/algorithms). NOT a Bohrbug-config issue, NOT algorithm incompatibility, NOT the auth fix.
- hypothesis (NEW symptom): CONFIRMED — explore_repo's SSH handshake intermittently aborts in libssh2 key exchange. Server log PID 2556719 (2026-11-17 16:26:30, post-auth-fix UAT window) shows KEXINIT exchanged, strict-KEX ordering selected, `diffie-hellman-group-exchange-sha256` + `rsa-sha2-512` negotiated (IDENTICAL to the ~109 successful connections), server sent NEWKEYS, then the client closed the socket 26ms later before its own NEWKEYS — a client-side KEX abort = `[Session(-8)] Unable to exchange encryption keys`. Fix: bounded retry of the SSH connect/handshake on transient transport errors only.
- next_action: implement bounded retry for transient SSH transport faults (handshake/KEX/TCP) in remoteExploreService (probe + stream), add focused tests, verify, commit, then request owner UAT confirmation in the real Tauri app.
- test: unit tests prove transient handshake errors are retried and permanent errors are not; runRemoteExplore/probeRemoteClaude recover on 1st transient retry; existing 29 focused tests + tsc stay green.
- expecting: owner confirms explore_repo no longer surfaces raw handshake errors on the configured machine (auth fix kept intact).
- mode: goal=find_and_fix
- kb: no knowledge-base.md exists (keyword matches in other debug files are unrelated)

### eliminated (this symptom)
- strict-KEX / libssh2-vs-OpenSSH10 algorithm incompatibility: REFUTED. Client banner is `libssh2_1.11.1_DEV` with `kex-strict-c-v00@openssh.com`; server logged `kex_choose_conf: will use strict KEX ordering` and `KEX done` on the successful connections. Bundled libssh2 is 1.11.1 (strict KEX added in 1.11.1, Oct 2024) — compatible.
- auth fix regression: REFUTED. `git show --stat 644dd579` = 3 files, no `.rs`, no SSH connection code; the error is thrown at `ssh_service.rs:121 session.handshake()` BEFORE auth and before `channel.exec()`. It cannot mechanically cause a KEX failure.
- port 22 vs 2222 / wrong host: REFUTED as KEX cause. sshd listens on 2222; a wrong port would fail TCP connect or banner, not mid-KEX. Log confirms client reached deep KEX on port 2222.

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-11-17
  checked: interactive `which claude`, `env`, `~/.claude/`, `~/.claude/settings.json`
  found: interactive `claude` = /home/quantd/.nvm/versions/node/v26.13.0/bin/claude (v2.1.326). Auth is PURELY env-based: `ANTHROPIC_AUTH_TOKEN=sk-59da...` + `ANTHROPIC_BASE_URL=http://10.4.97.70:30129/v1` (+ default model aliases cc-low/cc-high/cc-medium). These come from `~/.claude/settings.json` `"env"` block, which Claude Code injects into its own process + tool children. There is NO `~/.claude/.credentials.json` and no `~/.config/anthropic` OAuth profile. Grep of ~/.bashrc/.profile/.zshrc/etc shows the ANTHROPIC_* vars are NOT exported in any shell profile.
  implication: an SSH non-interactive exec starts a fresh login shell with none of these vars, and with no OAuth credential file to fall back to — so a headless `claude -p` there has zero auth sources and prints "Not logged in".
- timestamp: 2026-11-17
  checked: src-tauri/src/ssh_service.rs `ssh_exec_command` (382) and `ssh_exec_stream` (424)
  found: `channel.exec(&command)` (no env injection); stream builds `remote_command = format!("echo $$ && {}", command)`. The command string is parsed by the REMOTE login shell. No ANTHROPIC_* vars are passed from the Tauri process to the remote command.
  implication: the headless CLI subprocess cannot inherit the parent Claude Code auth env — the SSH channel does not forward it.
- timestamp: 2026-11-17
  checked: src/services/remoteExploreService.ts `buildExploreCommand`
  found: `claude -p --output-format json --restricted --allowedTools ...`. The code comment states `--restricted` "ignores user, project and local settings files" — which includes the `~/.claude/settings.json` env block that carries the token/base-url. So even on the same host the remote `claude -p` would not read its auth from settings.
  implication: two independent auth sources are unavailable to the headless run (inherited env + settings env block), and no credential file exists — fully explains the symptom.
- timestamp: 2026-11-17
  checked: REPRODUCTION. Ran the exact buildExploreCommand under `env -i HOME=... PATH=...` (clean, mimics SSH exec) vs the same with ANTHROPIC_AUTH_TOKEN/BASE_URL/model-aliases injected.
  found: Clean env → exit 1, JSON `is_error:true`, `result:"Not logged in · Please run /login"`. Injected env → exit 0, `is_error:false`, `result:"OK"`. Only the ANTHROPIC_* vars differ.
  implication: CONFIRMED root cause. The headless CLI's sole auth source on this machine is the env vars; the SSH exec provides none. Fix must forward the app's Claude auth env into the remote headless command (or refuse truthfully when none is configured).

- timestamp: 2026-11-17 (NEW transport symptom investigation)
  checked: `git show --stat 644dd579`; git log of ssh_service.rs; src-tauri/Cargo.toml/Cargo.lock ssh2/libssh2-sys versions
  found: Auth fix touched only 3 files (remoteExploreService.ts + its test + this debug file), ZERO .rs files. No commit after 644dd579 touched ssh_service.rs or Cargo. App uses ssh2 0.9.6 -> libssh2-sys 0.3.3, banner identifies as `libssh2_1.11.1_DEV`. Error string `SSH handshake thất bại: ` is formatted at ssh_service.rs:121 `session.handshake().map_err(...)` — before auth, before channel.exec.
  implication: The auth fix cannot mechanically cause a KEX failure; the error is a client-side libssh2 handshake abort.
- timestamp: 2026-11-17
  checked: /var/log/auth.log (sshd DEBUG3), all libssh2 connections 2026-11-15..17
  found: ~110 connections from `libssh2_1.11.1_DEV` to 127.0.0.1:2222; 109 show `KEX done` + `Accepted password`. ONE (PID 2556719, 16:26:30) failed: KEXINIT exchanged, `will use strict KEX ordering`, dh-group-exchange-sha256 + rsa-sha2-512 negotiated (identical to successes), server sent NEWKEYS at .381184, then `Connection closed by 127.0.0.1` at .407315 (26ms) before client NEWKEYS -> child exit 255. Penalty events: `srclimit_penalise ... connections without attempting authentication` (1s) and `failed authentication` (5s) on 127.0.0.1.
  implication: Strict-KEX/algorithm incompatibility REFUTED (same algorithms, strict KEX works). The failure is an INTERMITTENT client-side KEX abort consistent with a transient/rate-penalized connection drop. Root cause = transient SSH transport fault with no retry: one bad handshake fails the whole explore_repo call.
- timestamp: 2026-11-17
  checked: server algorithm list (sshd -T), client KEXINIT proposal from logs
  found: Server offers mlkem768x25519-sha256, sntrup761, curve25519, ecdh-nistp, dh-group14/16/18-sha256, dh-group-exchange-sha256, kex-strict-s-v00@openssh.com. Client offers dh-group-exchange-sha256, group16/18-sha512, group14-sha256/sha1, group1-sha1, kex-strict-c-v00@openssh.com. Overlap exists and is chosen on every connection.
  implication: No config injection (clean env / --settings) touches transport negotiation; the fix must live at the transport retry layer, not the command/env layer.

## Resolution

- root_cause: "--restricted (added in Phase 43 d4103696 for real security reasons) makes the remote headless `claude -p` ignore user/project/local settings files. On this machine the ONLY Claude auth source is the `env` block of the user's ~/.claude/settings.json (ANTHROPIC_AUTH_TOKEN + ANTHROPIC_BASE_URL, injected by interactive Claude Code). The SSH exec (src-tauri/src/ssh_service.rs channel.exec) forwards no ANTHROPIC_* env, and no OAuth credential file exists. Result: the headless run has zero auth sources -> 'Not logged in · Please run /login'. Confirmed by differential: clean env + --restricted = "Not logged in" (exit 1); clean env without --restricted = OK; clean env + --restricted + inline `--settings '{"env":{...}}'` carrying the same auth = OK (exit 0)."
- fix: "Keep --restricted (all its guarantees hold: /etc/passwd Read denied, no Bash tool, no repo MCP). Explicitly pass the remote user's own Claude auth env block from ~/.claude/settings.json into the run via inline `--settings` (which --restricted still honors). Since the settings file also contains permissions.defaultMode=bypassPermissions (which --restricted rejects), pass ONLY the `env` object, extracted on the remote with node. Map a genuine no-auth outcome to a truthful, actionable refusal instead of the raw '/login' text."
- fix (NEW transport symptom): "Add a bounded, evidence-scoped SSH transport retry in src/services/remoteExploreService.ts: `withSshTransportRetry` retries the probe exec and the stream invoke once (2 attempts total, 250ms backoff) ONLY when `isTransientSshTransportError` matches the exact handshake/KEX/TCP/channel-open failure strings. Auth failures, 'command not found', remote command errors, and integrity (MAC) failures are explicitly NOT retried. Deterministic errors propagate unchanged. 9 new focused tests cover classification, recovery, bounded exhaustion, no-retry-on-permanent, backoff, and session-id stability. Auth fix (644dd579) left fully intact."

### reasoning_checkpoint
- hypothesis: "The remote headless run lacks auth because --restricted makes claude ignore the user settings file that is this machine's only credential store; the SSH channel injects no ANTHROPIC_* env."
- confirming_evidence:
  - "Differential with all flags constant: --restricted -> exit 1 'Not logged in'; without --restricted -> exit 0 OK."
  - "Clean env has no ANTHROPIC_* vars, no ~/.claude/.credentials.json, no ~/.config/anthropic; interactive auth is purely the settings.json env block."
  - "Inline --settings with only the env block under --restricted -> exit 0 OK AND Read /etc/passwd denied AND Bash tool absent."
- falsification_test: "If adding the extracted auth env via --settings under --restricted still produced 'Not logged in', the hypothesis would be wrong; it produced OK."
- fix_rationale: "Addresses root cause (missing auth source for the restricted run) without weakening --restricted, so the Phase 43 security guarantees (no Bash, file confinement, no repo MCP/settings) remain intact."
- blind_spots: "Assumes the remote has node (true: claude is a node CLI). Assumes the remote's working claude auth lives in ~/.claude/settings.json env (verified on this machine); a remote using an OAuth credentials file won't be helped by env extraction — the truthful refusal path covers that. Model alias env (ANTHROPIC_DEFAULT_*_MODEL) is needed because the proxy does not serve the built-in haiku id."
- candidate_causes:
  - "code: buildExploreCommand passes --restricted without supplying an auth source the restricted mode can see."
  - "environment: SSH non-interactive exec does not inherit the interactive shell's ANTHROPIC_* env, and the machine stores auth only in a settings file that restricted mode ignores."
- and_gate: "yes — both are required: --restricted alone is fine when ANTHROPIC_* env is exported (Test B), and no-restricted works via settings (Test C2); only the combination of restricted-mode + no forwarded env + settings-only auth produces the failure."

### verification (fix-acceptance guardrail)
- target_test: pass — tests/services/remoteExploreService.test.ts 29/29 pass (incl. new --settings forwarding + auth-error mapping cases)
- mutation_check: skipped, reason: no Stryker configured/config in repo
- no_op_deletion: pass — diff is purely additive (two --settings/auth paths + tests); no behavior deleted; explicitly justified by RCA above
- adjacent_tests: pass — tests/services/ai/office/teamToolsGitRead.test.ts 56/56; tsc --noEmit exit 0
- revert_and_reconfirm: pass — bug_returned_on_revert: true (removing the --settings segment reproduces 'Not logged in', exit 1), fixed_on_reapply: true (OK, exit 0)
- live_repro: pass — exact buildExploreCommand output under clean SSH-like env (`env -i HOME=... PATH=...`) went from exit 1 'Not logged in' (pre-fix) to exit 0 'OK' (post-fix); security recheck confirms Read /etc/passwd denied and no Bash tool
- guardrail_verdict: accepted

### verification (NEW transport retry — second fix)
- oracle_type: specified — libssh2/SSH contract states a completed KEX yields a usable session; a mid-KEX client abort ([Session(-8)]) is a transient transport fault recoverable by a fresh handshake. Test oracle asserts concrete call counts + outcomes (derived from the retry contract), not a bare "no crash".
- target_test: pass — tests/services/remoteExploreService.test.ts 38/38 (9 new retry cases + 29 prior)
- mutation_check: skipped, reason: no Stryker configured in repo (confirmed absent from package.json/configs)
- no_op_deletion: pass — diff is purely additive (constants, isTransientSshTransportError, withSshTransportRetry, 2 call-site wraps, deps field) + tests; no behavior deleted; RCA justifies the addition
- adjacent_tests: pass for 29 prior cases in same file + tsc --noEmit exit 0. NOTE: tests/services/ai/office/teamToolsGitRead.test.ts has 5 pre-existing failures (5 pass / 56) caused by committed git-read working-tree change e6f58233 (test last updated 70ff1698 before that commit); unrelated to this fix — gitRemoteTreeService.ts is unchanged in working tree, and my diff contains zero git_read/cat-file lines. Flagged, not caused by this fix.
- revert_and_reconfirm: pass — removing the two withSshTransportRetry wrappers makes 5 new retry tests fail (bug behavior returns); restoring them returns 38/38 green. Fixed-on-reapply: true.
- live_repro: pass (evidence-based) — server log PID 2556719 shows the exact mid-KEX client abort; 109/110 sibling connections with identical algorithms succeeded, establishing transience; the fix targets exactly that class. Live owner UAT still pending (real Tauri app).
- guardrail_verdict: accepted

### reasoning_checkpoint (NEW transport symptom)
- hypothesis: "explore_repo's SSH handshake intermittently aborts mid-KEX client-side (libssh2 [Session(-8)]); with no retry at any layer, one flaky handshake fails the whole turn. Server log PID 2556719 shows server NEWKEYS sent then client socket closed 26ms later with identical negotiated algorithms to all successes."
- confirming_evidence:
  - "/var/log/auth.log PID 2556719: KEXINIT, strict KEX ordering, dh-group-exchange-sha256 + rsa-sha2-512, NEWKEYS sent at .381184, client disconnect at .407315, child exit 255."
  - "109/~110 libssh2_1.11.1_DEV connections to same host show KEX done + Accepted password — same algorithms, so deterministic incompatibility is disproven."
  - "Auth fix 644dd579 changed zero .rs files; error thrown at ssh_service.rs:121 before auth/exec."
- falsification_test: "If a bounded retry on transient handshake errors did not let a first-attempt abort recover (test 'runRemoteExplore retries a first-attempt handshake abort and returns the real report'), the hypothesis that this is a transient fault would be wrong. The test passes."
- fix_rationale: "Addresses root cause (a single transient KEX fault is unrecoverable) by retrying only the confirmed-transient class with a bounded backoff, without touching the auth fix, the --restricted security guarantees, or the Rust transport."
- blind_spots: "Cannot compile the Rust crate offline (openssl-src absent from cargo cache), so no Rust-side change/rebuild was possible; fix is at the TS layer where the app is buildable and testable. If the true trigger is server-side rate-limiting that needs a longer backoff than 250ms, one retry may be insufficient; owner UAT will confirm."
- candidate_causes:
  - "environment: transient SSH server/libssh2 KEX abort under rapid reconnection (srclimit penalties on 127.0.0.1 observed)."
  - "code: no retry anywhere in the explore_repo transport path (probeRemoteClaude + execRemoteCommandStream), so one flaky handshake is fatal."
  - "config: SSH profile host/port (ruled out — reached deep KEX on 2222)."
- and_gate: "yes — the failure needs BOTH a transient handshake fault (environment) AND the absence of retry (code); the same algorithms succeed 109/110 times, so neither alone fully explains the observed single failure."

## Eliminated
<!-- APPEND only - prevents re-investigating -->

- hypothesis: strict-KEX / libssh2-vs-OpenSSH10 algorithm incompatibility causes the handshake failure
  evidence: Client banner is `libssh2_1.11.1_DEV` offering `kex-strict-c-v00@openssh.com`; server logged `kex_choose_conf: will use strict KEX ordering` and `KEX done` on 109 successful connections with the SAME negotiated algorithms (dh-group-exchange-sha256 + rsa-sha2-512). libssh2 strict KEX (Terrapin fix) shipped in 1.11.1 (Oct 2024); bundled version is 1.11.1. Compatible.
  timestamp: 2026-11-17
- hypothesis: the pushed auth fix (644dd579) caused the handshake regression
  evidence: `git show --stat 644dd579` = 3 files, zero .rs, only remoteExploreService.ts command string + tests + debug doc. The error is formatted at ssh_service.rs:121 `session.handshake()`, which executes before auth and before `channel.exec()`. No mechanical path from a TS command-string change to a client-side KEX abort.
  timestamp: 2026-11-17
- hypothesis: wrong SSH port/host (UI defaults 22, server on 2222) causes the KEX failure
  evidence: A KEX failure requires a completed TCP connect + SSH banner exchange. Server log shows the client connected to 127.0.0.1:2222 and reached deep KEX. A wrong port would fail at TCP connect or banner, not mid-KEX.
  timestamp: 2026-11-17

## Owner UAT confirmation (final closure)

- timestamp: 2026-11-17
  source: owner report (real Tauri app, post-handshake-retry fix)
  checked: real `explore_repo` run after the SSH handshake retry fix
  found: outcome `success`, report `cbe1466b`, elapsed ~59s, `truncated: false`, 4 docs read with path:line citations.
  implication: The bounded SSH transport retry fix is confirmed in the real runtime. Both the auth fix (644dd579) and the handshake retry fix are verified end-to-end. Session status raised from `awaiting_human_verify` to `verified`; fix closed.

## Separate UAT run — 'aborted' on real-Java source survey (NOT a handshake regression)

- timestamp: 2026-11-17
  source: owner report (real Tauri app), a NEW and separate explore_repo attempt after the success above
  checked: explore_repo retry with a real Java source-survey prompt on branch `docs/project-initialization`, systemId `a32efe16-456f-4914-bb8c-2ecd284889ec`, model `haiku`, maxTurns 20, timeoutSeconds 300
  found: outcome `error`, empty report, detail `aborted`, report `31fc8015`, detail id `f98eec3c`.
  classification (code-backed): `detail: 'aborted'` is emitted ONLY by the turn's AbortSignal — `onAbort` at remoteExploreService.ts:381-385 or the already-aborted guard at 387-391. The watchdog timeout path produces `detail: 'timeout'` (line 434), so `timeoutSeconds: 300` is NOT the cause. This is not a handshake/KEX error and not an auth error.
  signal chain: chatTurnRuntime.ts:331 passes `turnController.signal` -> teamTools makeExecuteToolFn (teamRunCoordinator.ts:1351-1359) -> toolContext -> explore_repo handler (teamTools.ts:1501-1506) -> runRemoteExplore. Legitimate abort sources in the coordinator: user stop (`stopAgent` 3863, `abortAll` 3904) and batch settle deadline (3413, which records reason `tool-limit`). Empty report is consistent with an abort before any stream data arrived.
  verdict: Most consistent with a turn-level cancellation (user stop / turn teardown / batch settle deadline), NOT a code bug in the transport layer. Unintentional-abort-without-user-action is NOT established by this evidence alone — no evidence the AbortSignal fired spuriously; every source that aborts it is an intentional cancellation. Kept as a SEPARATE UAT run; the earlier handshake-retry success verdict (report cbe1466b) and status `verified` are NOT reversed.
  open question for owner (if needed): was a stop button pressed, did the batch deadline (120s settle poll, distinct from the 300s remote timeout) fire, or did the turn end early? That would confirm which intentional abort source applied.
