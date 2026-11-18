---
status: resolved
trigger: "Fix independent-review warnings W1-W4 + INFO on commit 74a26d9f, then follow-up on commit 5de5c363: repoHints was a dead field (no producer). Wire it from coordinator context and fix sshConfigId/systemId precedence. Keep git_read usable from any valid clue without silently picking a repo; focused verification only."
created: "2026-11-18"
updated: "2026-11-18"
---

# Debug Session: git_read review warnings (74a26d9f)

## Symptoms

- W1 (wrong semantics): `teamTools.ts` used `args.branch` as a repo hint, comparing a revision name against repo paths/repo names. A branch named `main` could match a path tail and select the wrong repo. No `repoHints` source existed on `TeamToolContext`.
- W2 (key conflict): `path` was used as a repo selector when `sshConfigId` was supplied, so `{action:'grep', sshConfigId:'cfg', path:'src'}` ran `git -C 'src'` and failed.
- W3 (unnecessary refusal): `/srv/newrepo` with an available SSH config but empty `defaultRemotePath` and no catalog match was refused instead of running with that config.
- W4 (cross-team / first-match): `ctx.db.systems.toArray()` read the whole global catalog with no team scope, and `matchHint()` used `.find()` — two systems with the same tail silently picked the first.
- INFO: stale comment "repository of a system linked to the team" and a schema description listing `path` as a repo selector.
- Test red: `teamTools.test.ts:108-123` `advertises timeoutSeconds on explore_repo` is a leftover from the rejected timeout design (pre-existing since 269aaff19).

## Owner constraints (fixed, unchanged)

`git_read` runs even when the repo is unlinked; no full-path restriction; resolve from ANY valid clue (folder name, relative path, repo/project named in conversation, SSH default path, team link...); a link is ONE source; refuse only when genuinely indeterminate; no SSH fallback in the agent; tool always available; UI shows a clear refusal. Four hard criteria: smooth, background tool, non-blocking UI, standard architecture.

## Root Cause

All four warnings share one cause: the resolver conflated *selection hints* with *revisions/pathspecs* and used first-match `.find()` over a global catalog instead of collecting every match across ordered context sources. The fix is a resolver rewrite, not a new tool or infrastructure change — consistent with the four hard criteria.

## Fix

Single logic commit `c45977da`:

1. **W1** — removed `branch` from context hints (it stays a revision for `log`/`read_file`/`tree`/`grep` via `revisionArg`). Added `repoHints?: string[]` to `TeamToolContext` and a loop that tries each hint; ambiguous hint -> `INVALID_ARGUMENT` listing options. Limitation documented in the resolver JSDoc: the coordinator has no free-text repo extractor yet, so the field is populated by callers that already have names; the resolver never invents a source.
2. **W2** — removed `path` from `pathKeys` entirely (also with `sshConfigId`). `sshConfigId` alone now resolves via the config's `defaultRemotePath`; otherwise it falls through to the other sources. Schema description and comment updated to say `path` is grep/read_file pathspec only.
3. **W3** — an absolute path with no catalog match and exactly one SSH config auto-selects that config; several configs -> `INVALID_ARGUMENT` with the id list; zero configs -> `NO_LINKED_REPO`.
4. **W4** — build an ordered candidate list: team-scoped systems (direct/CR links) first, then catalog systems, then SSH defaults. `matchesFor()` returns ALL matches; `pickMatch()` refuses with options when `>1` instead of `.find()`. Dedupe by `(configId, path, scope)`; a system reached directly and via a CR target counts once.

Separate test commit `da17d0f1`: deleted the stale `timeoutSeconds` test and its `44-01 D-03` comment (no production change).

## Verification (focused only — no full suite)

- `tests/services/ai/office/teamToolsGitRead.test.ts`: 73/73 pass (65 original + 5 new W1-W4/W2/W3/W4/W1 tests + 3 pre-existing additions from the prior commit).
- `tests/components/ai/office/AgentActivityPanel.test.tsx`: 20/20 pass (refusal UI intact).
- `tests/services/ai/office/teamTools.test.ts`: 74/74 pass after removing the obsolete test.
- `npx tsc --noEmit`: clean (exit 0).
- Critical/warning findings remaining from the 74a26d9f review at that time: 0 — **superseded** by the 5de5c363 follow-up below; this line is no longer a claim about the current tree.

## New focused tests

- `W2: grep path is a pathspec only ...` — config default path names repo, `path: 'src'` stays pathspec, `loopCallId` reaches the remote call.
- `W3: unknown absolute path with exactly one SSH config runs ...`
- `W3: unknown absolute path with several SSH configs refuses with the id list`
- `W4: two systems with the same path tail refuse INVALID_ARGUMENT ...`
- `W1: branch is a revision, never a repo hint; repoHints from context resolve uniquely`

## Self-review vs hard criteria

- Mượt: resolver is async but only adds in-memory filters plus the existing DB reads; no extra remote round trips.
- Tool nền: no new UI work; refusals remain returned values; `loopCallId` is preserved on every tested call.
- UI không block: unchanged — no synchronous waits introduced, no new prompt to the user.
- Kiến trúc chuẩn: one resolver, ordered context sources, truthful refusal codes, untrusted values still wrapped; no new service layer or schema.

## Follow-up (commit 5de5c363 review): repoHints was a producer-less field

The 74a26d9f review note above said "0 warnings remaining", but the NEXT review found a real
warning: `TeamToolContext.repoHints` existed in `teamTools.ts` and was consumed by the resolver,
yet **no producer existed** — only 4 references, all inside `teamTools.ts`. The coordinator's
`toolContext()` (~:1291) never set it, so the whole `(b)` context-hint path was dead code.

### Fix

- `teamTools.ts`:
  - Exported `extractRepoHintsFromText(text, systems)`: matches ONLY terms already present in
    `db.systems` catalog (system name, code, full remote path, path tail) against free text, with
    whole-term unicode-aware boundaries and a 3-char floor. No new extractor taxonomy, no team
    link as a hard filter, no invented names.
  - Exported `repoPathTail()` and reused the same tail logic inside the resolver's `matchesFor()`
    so extractor and resolver cannot drift.
  - `systemId` explicitly supplied now takes precedence over an `sshConfigId` default path: the
    config-default early return is skipped when `args.systemId` is present, so the explicit system
    is no longer silently ignored.
  - Resolver JSDoc: removed the stale "coordinator has no extractor" LIMITATION.
- `teamRunCoordinator.ts`:
  - Per-turn `repoHints` state, refreshed on BOTH lead and employee turns from
    `originalRequest`/`text` plus the already-loaded `recentTurns`, matched against
    `db.systems.toArray()` (read in the existing `Promise.all`; a failed catalog read cannot
    block the turn).
  - `toolContext()` spreads `repoHints` into every team-tool context, so leader and employee
    paths — including the four reviewer call sites — all carry it. Untrusted prompt text is only
    ever used as a match key and is wrapped by the resolver on any refusal output; it is never
    injected into a prompt or option list raw.

### Focused tests proving the wiring

- `teamToolsGitRead.test.ts`:
  - `extractRepoHintsFromText matches only known catalog terms` — known code/tail/path match,
    substring false positives (`COREX` vs `CORE`) and short branch tokens rejected.
  - `repoHints from a recent-turn mention resolve an unlinked repo and keep the call id` — no
    arg, empty team, hint by system name resolves `/srv/repo`, call id forwarded.
  - `ambiguous repoHints ... refuse INVALID_ARGUMENT with options` — two systems sharing a tail
    list both options, no silent pick, no remote call.
  - `explicit systemId wins over sshConfigId default remote path`.
- `teamRunCoordinator.test.ts`: `wires catalog repoHints from the original request into team tool
  contexts` — lead turn script calls `git_read` with no repo arg; captured ctx contains `CORE`.

Verification: `npx tsc --noEmit` clean; focused suites (gitRead, teamTools, AgentActivityPanel,
coordinator) pass. No full suite, no build (per owner constraint). Self-review: 0 critical /
0 warning findings on this follow-up diff; the four hard criteria and "no link / no full path /
any clue" git_read contract are preserved.
