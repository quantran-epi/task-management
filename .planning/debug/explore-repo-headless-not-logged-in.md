---
status: awaiting_human_verify
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

## Current Focus

- bug_class: Bohrbug (deterministic environment/config difference between interactive shell and SSH non-interactive exec)
- hypothesis: CONFIRMED — `--restricted` makes the remote headless run ignore the user settings `env` block that is this machine's only Claude auth source; SSH exec forwards no ANTHROPIC_* env. Fix (forward the env block via `--settings`, which restricted mode honors) is applied and verified.
- next_action: commit code fix + tests + debug session; then request owner UAT confirmation in the real Tauri app (run an explore_repo team turn against the linked local system and confirm a bounded report, not 'Not logged in').
- test: exact generated buildExploreCommand under clean SSH-like env now exits 0 with `is_error:false`; revert removes the fix and the bug returns (exit 1 'Not logged in'). 29 + 56 focused tests pass; tsc clean.
- expecting: owner confirms explore_repo now succeeds on the already-configured machine without any /login step.
- mode: goal=find_and_fix
- kb: no knowledge-base.md exists (keyword matches in other debug files are unrelated)

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

## Resolution

- root_cause: "--restricted (added in Phase 43 d4103696 for real security reasons) makes the remote headless `claude -p` ignore user/project/local settings files. On this machine the ONLY Claude auth source is the `env` block of the user's ~/.claude/settings.json (ANTHROPIC_AUTH_TOKEN + ANTHROPIC_BASE_URL, injected by interactive Claude Code). The SSH exec (src-tauri/src/ssh_service.rs channel.exec) forwards no ANTHROPIC_* env, and no OAuth credential file exists. Result: the headless run has zero auth sources -> 'Not logged in · Please run /login'. Confirmed by differential: clean env + --restricted = "Not logged in" (exit 1); clean env without --restricted = OK; clean env + --restricted + inline `--settings '{"env":{...}}'` carrying the same auth = OK (exit 0)."
- fix: "Keep --restricted (all its guarantees hold: /etc/passwd Read denied, no Bash tool, no repo MCP). Explicitly pass the remote user's own Claude auth env block from ~/.claude/settings.json into the run via inline `--settings` (which --restricted still honors). Since the settings file also contains permissions.defaultMode=bypassPermissions (which --restricted rejects), pass ONLY the `env` object, extracted on the remote with node. Map a genuine no-auth outcome to a truthful, actionable refusal instead of the raw '/login' text."

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

## Eliminated
<!-- APPEND only - prevents re-investigating -->
