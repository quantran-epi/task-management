---
phase: 43-repo-reading-that-scales-grep-paged-read-and-remote-headless
reviewed: 2026-11-16T16:36:53Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - src/services/gitRemoteService.ts
  - src/services/gitRemoteTreeService.ts
  - src/types/gitRemote.ts
  - src/services/ai/office/teamTools.ts
  - src/services/ai/office/teamPrompts.ts
  - src/services/ai/office/teamRunCoordinator.ts
  - src/components/ai/office/TeamWorkspace.tsx
  - src/services/remoteExploreService.ts
findings:
  critical: 0
  warning: 4
  info: 6
  total: 10
status: issues_found
---

# Phase 43: Code Review Report

**Reviewed:** 2026-11-16T16:36:53Z
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found
**Reviewed at:** `f742114d` (working tree clean)

## Summary

Reviewed the three deliverables of Phase 43: the `grep` action and paged `read_file` on `git_read`,
the `explore_repo` remote-headless tier, and `contextWindowTokens` forwarding on team turns.

The security posture is sound and I verified it against the real binaries rather than reading it:

- `escapeShellArg` is applied to every model-supplied value in `grepRemoteRef`, `readRemoteFilePage`,
  `workingCopyCatSnippet` and `buildExploreCommand`. `--end-of-options` is correctly positioned after
  every option and before the revision in all four git call sites; `git grep -e` guards a
  dash-leading pattern. I probed `git grep ... --end-of-options '--output=/tmp/pwned'` and
  `git cat-file -p --end-of-options 'HEAD:../../etc/passwd'` on a scratch repo: both are refused by
  git, no file written.
- The 13 fixes committed during this review hold. I re-derived each one independently:
  `--restricted` does ignore the repo's `.claude/settings.json` (a `SessionStart` hook that wrote a
  file no longer runs), does deny `Read /etc/passwd`, does suppress the repo's `.mcp.json` server
  (a `command: sh -c 'touch PWNED'` server no longer executes on connect), and `Grep`/`Glob` still
  work inside the repo. The prompt after `--` is accepted by the real CLI. The grep parser now keeps
  a hit whose path contains a newline (verified against a real `we\nird.txt`). `parsePage` keeps
  blank lines. The confined grep path reaches `git` and is echoed back confined.
- `tsc --noEmit` is clean; the four scoped suites pass (127/127).

Four defects remain. None is an injection or a crash; all four make the tool report something
untrue, which is the class this phase exists to eliminate. Two of them (WR-01, WR-02) are
byte-vs-character arithmetic in the caps added by this phase, and I reproduced both against real
`git` output rather than reasoning about them. WR-03 is a fail-open on a missing out-of-band
marker, and WR-04 is a line cut that lands mid-character.

## Warnings

### WR-01: `grep` silently drops hits and reports `truncated: false`

**File:** `src/services/gitRemoteService.ts:415` (with `:396` and `:400`)

**Issue:** The cap is enforced by `head -c 262144` in the shell, but the JS side infers truncation
from `res.stdout.length >= GREP_BYTE_CAP`. `String.length` counts UTF-16 code units; the constant is
**bytes**. Two independent ways to lose hits while reporting a complete result:

1. **Multibyte content.** A page of Vietnamese source yields ~152k JS chars for 262144 bytes, so the
   length check is false. `gitExit === 141` (SIGPIPE) is the only other signal, and it does not fire
   when the total output fits the pipe buffer, so git exits 0.
2. **A cut that lands exactly on a record boundary.** Nothing is dropped mid-record, the stream ends
   with a newline, so the "last chunk is non-empty ⇒ truncated" branch never fires either.

Reproduced on a scratch repo: 133 records of exactly 2048 bytes each (total 272 384 bytes), so
`head -c 262144` cuts cleanly after record 128. Shell reported `###EXIT 0`; the parser produced
`{ hits: 128, truncated: false }` — five matching records silently gone, and the model is told the
result is complete. The same shape with multibyte content gives `jsChars 90880` against a 262144
byte cap, so even the length heuristic cannot see it.

**Fix:** Stop inferring truncation from the payload; report it out-of-band the way the exit code
already is. Move the byte budget into `awk` (the pattern `pageCommand` now uses) and print a
`###CAPPED` marker, or append a sentinel after `head` that only prints when `head` hit the cap:

```ts
// shell: cap inside awk so a marker can be emitted, and count BYTES not chars
const command =
  `{ ${parts.join(' ')}; printf '###EXIT %s\\n' "$?" >&2; } | ` +
  `awk -v cap=${GREP_BYTE_CAP} '{ n=length($0)+1; if (used+n>cap) { print "###CAPPED" > "/dev/stderr"; exit } used+=n; print }'`;
// ...
let truncated = /###CAPPED/.test(res.stderr) || gitExit === 141;
```

If the `head -c` shape is kept, at minimum compare bytes, not chars:
`Buffer.byteLength(res.stdout, 'utf8') >= GREP_BYTE_CAP` — that closes case 1 but not case 2.

### WR-02: a `read_file` page skips a line at the byte cap and `nextOffset` never revisits it

**File:** `src/services/gitRemoteTreeService.ts:322` (with `:356`, and `teamTools.ts:1336`)

**Issue:** The new byte budget skips a line that does not fit but keeps emitting later lines:

```awk
n=length(l)+12; if (used+n>cap) next; used+=n; print NR": " l
```

`next` is not `exit`, so the page is a **prefix with a hole**. `parsePage` then computes
`hasMore: offset + lines.length - 1 < totalLines` and the handler computes
`nextOffset: page.offset + page.linesRead` — both count emitted lines, not the highest line number
emitted, so the skipped line is never requested again.

Reproduced: a 250-line file whose line 200 is 4000 chars. The page emits lines 1–199 and 201–217
(217 entries), reports `linesRead: 217`, `hasMore: true`, `nextOffset: 218`. Line 200 is absent from
every page the model will ever request, and nothing in the result says a line is missing. A model
reading "lines 199 then 201" has no way to notice.

**Fix:** Make the budget stop the page instead of punching a hole, so the emitted set is always a
contiguous prefix:

```awk
'NR>=s&&NR<=e{ l=$0; if (length(l)>maxc) l=substr(l,1,maxc) " ...";
  n=length(l)+12; if (used+n>cap) exit; used+=n; print NR": " l }
 END{ print "###TOTAL "NR }'
```

`exit` still runs `END`, so `###TOTAL` survives; the page then ends at line 199 and `nextOffset`
200 picks up the rest. If a hole is ever wanted deliberately, `nextOffset` must be
`maxLineEmitted + 1` and the result must carry a `skipped` list.

### WR-03: a missing `###EXIT` marker is treated as exit 0, so a dropped connection reads as success

**File:** `src/services/gitRemoteService.ts:401-402`, `src/services/gitRemoteTreeService.ts:444-445`

**Issue:** Both parsers do `const exit = marker ? Number(marker[1]) : 0`. The marker is written by
the remote shell at the end of the command, and the regex is anchored to the end of stderr. If the
marker never arrives — SSH channel dropped mid-command, remote process killed, or any stderr line
emitted after it — the failure is read as success:

- `grepRemoteRef`: partial hits returned with `truncated: false`, presented as a complete result.
- `readPageFromSource`: `sourceExit` 0, so `parsePage` runs on the truncated stdout. `###TOTAL` is
  printed by `awk`'s `END`, which never ran, so `totalLines` stays 0 and
  `hasMore: offset + n - 1 < 0` is **false**. The model is handed a short page labelled as the whole
  file, with no error.

Verified the regex miss directly: with `###EXIT 1` followed by one more stderr line, `/###EXIT (\d+)\n?$/`
does not match and the code proceeds as exit 0.

**Fix:** Fail closed when the marker is absent, since the marker is the only evidence the command
completed:

```ts
const marker = /###EXIT (\d+)\n?$/.exec(res.stderr);
if (!marker) {
  throw new Error(stderr || 'Không nhận được mã thoát từ lệnh remote (kết nối có thể đã đứt).');
}
const gitExit = Number(marker[1]);
```

If trailing stderr noise is a real possibility on the target hosts, search the last occurrence
anywhere instead of anchoring to the end (`/###EXIT (\d+)/g`, take the final match) — but do not
default to 0.

### WR-04: `PAGE_LINE_MAX_CHARS` counts bytes, and the cut lands mid-character

**File:** `src/services/gitRemoteTreeService.ts:302`, `:321`

**Issue:** The constant is named and documented as characters, but the awk in use (`awk version
20200816`, the macOS default) has `length()` in bytes — `LC_ALL=C`, `en_US.UTF-8` and `vi_VN.UTF-8`
all return 9 for `"ếếế"`. Two consequences:

1. A Vietnamese line is cut at ~1333 characters, not the advertised 4000.
2. `substr(l,1,maxc)` cuts at a byte offset that need not be a character boundary. Reproduced with a
   line of 2000 `ế`: the emitted page is not valid UTF-8 (`0xe1` at the cut). Rust's
   `String::from_utf8_lossy` turns that into U+FFFD, so the model receives a corrupted character in
   the middle of the truncated line.

**Fix:** Either rename to `PAGE_LINE_MAX_BYTES` and accept the byte budget, or make the cut
character-safe by trimming the incomplete tail after the fact:

```ts
// parsePage: a maxc cut can land mid-character; drop the replacement char it produced.
const trimmed = lines.map((l) => (l.endsWith('� ...') ? l.slice(0, -5) + ' ...' : l));
```

Cleanest is to cut in awk at a byte count then strip trailing continuation bytes in JS, but the
one-line U+FFFD strip above is enough to stop handing the model mojibake.

## Info

### IN-01: `read_file` and `diff_file` echo the raw path, not the confined one

**File:** `src/services/ai/office/teamTools.ts:1326` (and `:1297`)

**Issue:** `grep` was fixed to echo `cleanPath` (commit `55b332c9`), but `read_file` and `diff_file`
still return `filePath: wrapField(..., filePath)` — the model's raw string — while the content comes
from the confined path inside `readRemoteFilePage`. `./src/../src/a.ts` is echoed verbatim. Not an
injection (it is the model's own input, wrapped), just an inconsistency that makes the result
disagree with what was read.

**Fix:** Confine once in the handler and echo that, as `grep` now does.

### IN-02: `offset`/`limit` are clamped twice

**File:** `src/services/ai/office/teamTools.ts:1305-1306`, `src/services/gitRemoteTreeService.ts:381-382`

**Issue:** The handler clamps `offset`/`limit` and `readRemoteFilePage` clamps them again with the
same expression. Two copies of one rule drift.

**Fix:** Let the service own the clamp (it already does) and drop the handler copy, or export the
clamp as a named helper used by both.

### IN-03: `cd <repoPath> &&` breaks for a repo path beginning with `-`

**File:** `src/services/remoteExploreService.ts:87`

**Issue:** `escapeShellArg` protects the shell, but `cd '--x'` is still parsed by the shell builtin as
an option (`cd: invalid option`). `repoPath` comes from `system.remoteRepoPath` — user configuration,
not model input — so this is a misconfiguration that fails loudly rather than an attack.

**Fix:** `cd -- ${escapeShellArg(request.repoPath)} &&` (POSIX `cd` accepts `--`).

### IN-04: the binary probe covers page 1 only — agreed ceiling

**File:** `src/services/gitRemoteTreeService.ts:428`

**Issue:** As the owner noted, a file whose first 1024 bytes are text but which contains a NUL later
is not flagged on a later page. I confirmed the stated bound is honest: a page at offset 1501 of such
a file yields `1501: before` / `1502: tail` — awk ends the string at the NUL, so the page holds a
truncated line and never raw binary. Agreed: Info, not a defect worth fixing.

**Fix:** None required. The comment at `:434` already records it.

### IN-05: the two-tier guidance reaches only reviewer-role employees

**File:** `src/services/ai/office/teamPrompts.ts:153-155`, `:278-288`

**Issue:** `explore_repo` is advertised to every employee (it is in neither allowlist set), but
`REVIEWER_GIT_READ_LINE` — the only text that says when to prefer `grep`/paged `read_file` over
`explore_repo` — is pushed only when the employee's role or skill description matches `review`. Every
other employee gets the tool with no guidance on tier choice, which is the failure mode D-05 exists
to prevent.

**Fix:** Either move the `[KHI NÀO DÙNG explore_repo]` block into an unconditional part of the
employee prompt, or gate the tool payload the same way the prompt is gated.

### IN-06: `repoPath` is unwrapped in the git-shaped results

**File:** `src/services/ai/office/teamTools.ts:1188`, `:1491`

**Issue:** Both `git_read`'s `base` and `explore_repo`'s result carry `repoPath` raw. It is
user-configured (`system.remoteRepoPath`), not remote content, and the IN-05 precedent in `git_read`
already documents this. Recorded so the decision is visible, not because it is exploitable.

**Fix:** None required unless the threat model starts treating SSH profile configuration as
untrusted.

---

## Verified fixed during this review

The 13 defects the owner fixed mid-review were re-derived independently at `f742114d`, not taken on
trust. All hold:

| Commit | Verified how |
|---|---|
| `59ad2985` timeout path capped | `capReport` wraps the timeout outcome; 48k case returns 12 000 chars, `truncated: true` |
| `34326bb5` late cancel handle | `cancelOnArrival` set by both the timer and abort; handle awaited then invoked |
| `13ebdac2` positive-only probe cache | `probeCache` is a `Set`; a negative answer re-probes |
| `113841a5` prompt after `--` | Ran the exact command shape against the real CLI: success, `is_error: false` |
| `8c363e92` dash-leading model id | `!suppliedModel.startsWith('-')` before `MODEL_ID_REGEX` |
| `23f6d13e` `detail` cap | `capReport` caps `detail` at `EXPLORE_REPORT_MAX_CHARS` |
| `39f4bf5e` abort path | `signal` flows `makeExecuteToolFn` → `toolContext` → `ctx.signal` → `runRemoteExplore`; listener removed in `finish` |
| `d4103696`+`4c056227` `--restricted` | Repo `SessionStart` hook no longer writes; `Read /etc/passwd` denied; repo `.mcp.json` `sh -c touch` no longer runs; `Grep`/`Glob` still work |
| `9bc995e2` newline in path | Parser keeps `we\nird.txt`; reproduced the raw git stream and the parse |
| `2ec0045a` cut record dropped | `chunks.pop()` on a non-empty tail; partial record not emitted |
| `3af87975` blank lines kept | `parsePage` only pops the split artefact |
| `a0c4e64f`+`55b332c9` confined grep path | `confineRepoPath` in the handler; `cleanPath` echoed |
| `49335bf0` malformed pattern | `InvalidGrepPatternError` → `INVALID_ARGUMENT`, and `git grep -e 'a['` exits 128 with `-e option,` |

---

_Reviewed: 2026-11-16T16:36:53Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
