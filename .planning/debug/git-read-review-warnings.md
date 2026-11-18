---
status: resolved
trigger: "Fix independent-review warnings W1-W4 + INFO on commit 74a26d9f (git_read repo resolution) and remove the red timeoutSeconds test. Keep git_read usable from any valid clue without silently picking a repo; commit logic and test removal separately; focused verification only."
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
- Critical/warning findings remaining from the 74a26d9f review: 0.

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

## Deferred / limitations

- Automatic extraction of free-text repo names from leader/agent prompts into `ctx.repoHints` is NOT implemented — there was no existing extractor to wire, and the owner forbade inventing a large new source. The field and resolver support are in place; wiring is a future coordinator change if needed.
