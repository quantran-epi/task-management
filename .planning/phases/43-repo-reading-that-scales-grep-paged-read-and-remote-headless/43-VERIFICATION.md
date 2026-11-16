---
phase: 43-repo-reading-that-scales-grep-paged-read-and-remote-headless
verified: 2026-11-17T00:05:00Z
status: gaps_found
score: 3/4 success criteria verified
overrides_applied: 0
re_verification:
  previous_status: null
  previous_score: null
  gaps_closed: []
  gaps_remaining: []
  regressions: []
gaps:
  - truth: "git_read read_file reports a truthful totalLines for the file it is reading"
    status: partial
    reason: >-
      The byte-cap fix (WR-02, commit bd2dc5cd) changed the pager from `next` to `exit`, so
      awk's END block now prints `NR` at the point the page was cut, not the file's real line
      count. `totalLines` therefore understates the file size on any page where the 256 KB
      budget fires. Reproduced against real git/awk: a 250-line file whose lines are 2000
      bytes each, read with offset=1 limit=200, returns `###TOTAL 131` while `wc -l` says 250.
      Paging still terminates correctly (hasMore stays true and nextOffset advances), but the
      model is told the file is 131 lines long when it is 250 — the same class of untrue
      result this phase exists to remove. The local Read contract (Rust `ssh_read_file_slice`)
      always returns the real `total_lines`, so the two contracts diverge.
    artifacts:
      - path: "src/services/gitRemoteTreeService.ts"
        issue: >-
          pageCommand line 330: `END{ print "###TOTAL "NR }` runs after the byte-budget
          `exit` (line 329), so NR is the cut position, not the line count. parsePage line 353
          reads it as totalLines.
    missing:
      - "Report the real file total independently of the byte cut — e.g. count lines in a
        separate pass, or have awk keep counting to EOF after emitting the page and print the
        final NR in END."
      - "A regression test that asserts totalLines equals the real line count on a page cut by
        PAGE_BYTE_CAP (the existing byte-cap test at gitRemoteReadPipeline.test.ts:210 asserts
        only linesRead/hasMore, and the mixed.txt test at :223 never checks totalLines)."
  - truth: "read_file echoes the path that was actually read, not the model's raw string"
    status: partial
    reason: >-
      43-REVIEW.md records IN-01 as resolved for read_file (commit 700f7ff1). The handler now
      echoes `page.filePath`, but the service never sets that field to the confined path:
      readRemoteFilePage computes `cleanPath` (line 384) and then passes the RAW `filePath` into
      readPageFromSource (line 396 and line 418), which returns it verbatim through parsePage
      (line 357). `./src/../src/a.ts` is therefore still echoed unchanged while the content came
      from `src/a.ts`. diff_file was genuinely fixed; read_file was not.
    artifacts:
      - path: "src/services/gitRemoteTreeService.ts"
        issue: "readRemoteFilePage passes raw filePath to readPageFromSource (lines 396, 418); parsePage returns it as page.filePath (line 357)."
      - path: "src/services/ai/office/teamTools.ts"
        issue: "read_file echoes page.filePath (line 1328) with a comment claiming it is the confined path."
    missing:
      - "Pass `cleanPath` into readPageFromSource, or set `filePath: cleanPath` on the returned page."
      - "A test asserting `./src/../src/a.ts` is echoed as `src/a.ts`."
deferred: []
human_verification:
  - test: "Run explore_repo once against a real SSH remote that has the claude CLI installed."
    expected: "outcome: success, a report with path:line citations, and no permission prompt hanging the turn."
    why_human: "The command shape was probed against the local CLI (success, and --max-turns exhaustion maps to error_max_turns), but the SSH transport and a real remote host cannot be exercised from a unit test."
  - test: "Read a large source file through git_read read_file on a real remote and page to the end with nextOffset."
    expected: "Every page is contiguous, the last page reports hasMore false, and the final totalLines matches `wc -l`."
    why_human: "The byte-cap total defect above is reproducible locally, but confirming the fix needs a real remote read."
---

# Phase 43: Repo reading that scales — Verification Report

**Phase Goal:** A team agent reads a remote repository as cheaply and as completely as Claude Code reads a local one: it can locate code by pattern before reading it, it can page through a file instead of swallowing it whole, and it can hand a broad "understand this subsystem" question to a headless Claude Code running on the remote host and get back a bounded, structured report instead of raw file dumps in its own context.

**Verified:** 2026-11-17T00:05:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `git_read` exposes a `grep` action that searches a ref's tracked content by pattern and returns `path:line:text` hits with a bounded hit count | ✓ VERIFIED | `grepRemoteRef` at `src/services/gitRemoteService.ts:376`; `case 'grep'` at `teamTools.ts:1364`; enum has 8 values (`teamTools.ts:339-350`); hits wrapped `wrapField`/`wrapUntrusted` (`:1406-1410`); limit clamped 1..200 (`gitRemoteService.ts:383`); zero hits returns `hits: []` (`:1400-1412`); real-git pipeline tests pass |
| 2 | `read_file` returns line-numbered, paged content with `totalLines`, `hasMore`, and the next `offset`; a file larger than one page never enters the context whole | ✗ PARTIAL | Paging, `linesRead`, `hasMore`, `nextOffset`, binary detection and the page bound all work (`gitRemoteTreeService.ts:323-368`, `teamTools.ts:1303-1339`; tests `teamToolsGitRead.test.ts:722-778`, `gitRemoteReadPipeline.test.ts:200-310`). But `totalLines` is understated whenever the 256 KB byte cap fires — reproduced `###TOTAL 131` for a 250-line file. See gap 1. |
| 3 | A team tool runs Claude Code headless on the remote over SSH with a read-only allowlist and bounded turns, returns a capped structured report, and refuses truthfully when the CLI is absent | ✓ VERIFIED | `buildExploreCommand` (`remoteExploreService.ts:85-103`) carries `--restricted --allowedTools Read,Grep,Glob --max-turns <1..40> --no-session-persistence`, prompt after `--`; `parseExploreResult` maps success/max-turns/error and caps at 12 000 chars (`:135-179`); `probeRemoteClaude` positive-only cache (`:193-208`); `runRemoteExplore` streams with a 300 s watchdog, late-cancel and abort (`:223-329`); `explore_repo` definition (`teamTools.ts:384`) + handler (`:1447-1511`) refuses `REMOTE_CLAUDE_UNAVAILABLE` before opening a stream; tool count 12 (`teamTools.test.ts:82`) |
| 4 | A team turn passes its provider context window into the runtime so in-loop compaction runs; a test asserts the window reaches `runAiOrchestratorLoop` | ✓ VERIFIED | Option `teamRunCoordinator.ts:239`; conditional spread in both turn literals (`:1982-1984`, `:2209-2211`); `TeamWorkspace.tsx:313` passes `config.contextWindowTokens`; `chatTurnRuntime.ts:323` forwards it; `aiOrchestratorLoop.ts:238-239` computes `tokenBudget` and `:247` compacts; tests assert 128000 on both employee and lead loops and absence when omitted (`teamRunCoordinator.test.ts:7095-7143`) |

**Score:** 3/4 success criteria verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/services/gitRemoteService.ts` | `grepRemoteRef`, NUL-record parse, byte cap, fail-closed marker | ✓ VERIFIED | `GREP_BYTE_CAP` + `head -c cap+1` proves truncation in bytes; missing `###EXIT` throws; exit 0/1/141 accepted |
| `src/services/gitRemoteTreeService.ts` | `readRemoteFilePage`, `parsePage`, `pageCommand`, binary probe | ⚠️ PARTIAL | Paging is a contiguous prefix and binary-safe; `totalLines` wrong under the byte cap; `page.filePath` unconfined |
| `src/types/gitRemote.ts` | `RemoteGrepHit`, `RemoteFilePage` | ✓ VERIFIED | Lines 60-76, both exported |
| `src/services/remoteExploreService.ts` | builder, parser, cap, preflight, streamed run | ✓ VERIFIED | All five exports present; no second shell escaper — imports `escapeShellArg` |
| `src/services/ai/office/teamTools.ts` | grep + paged read_file + `explore_repo` | ✓ VERIFIED | Three cases wired; `getRemoteFileContent` import count is 0 |
| `src/services/ai/office/teamPrompts.ts` | `REVIEWER_GIT_READ_LINE`, `EXPLORE_REPO_TIER_LINE` | ✓ VERIFIED | grep precedes read_file; `nextOffset`/`hasMore` named; tier block pushed for every employee (`:157`) |
| `src/services/ai/office/teamRunCoordinator.ts` | window forwarded into both turns | ✓ VERIFIED | Both spreads present |
| `src/components/ai/office/TeamWorkspace.tsx` | coordinator constructed with the window | ✓ VERIFIED | Line 313 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `teamTools.ts` | `gitRemoteService.ts` | `grepRemoteRef` | ✓ WIRED | Import line 25, call line 1387 |
| `teamTools.ts` | `gitRemoteTreeService.ts` | `readRemoteFilePage` | ✓ WIRED | Import line 32, call line 1316 |
| `teamTools.ts` | `remoteExploreService.ts` | `probeRemoteClaude`, `runRemoteExplore` | ✓ WIRED | Import 44-47, calls 1462 and 1481 |
| `remoteExploreService.ts` | `sshService.ts` | `execRemoteCommandStream` / `execRemoteCommand` | ✓ WIRED | Import line 1; stream at 312, probe at 202 |
| `TeamWorkspace.tsx` | `nineRouterTokenService.ts` | `getNineRouterConfig().contextWindowTokens` | ✓ WIRED | Config read at 281, passed at 313 |
| `teamRunCoordinator.ts` | `chatTurnRuntime.ts` | `ChatTurnRequest.contextWindowTokens` | ✓ WIRED | Spread 1982/2209 → runtime 323 → loop 238 |
| `teamRunCoordinator.ts` | `teamTools.ts` | `ctx.signal` → `runRemoteExplore` abort | ✓ WIRED | `toolContext` 1161 → handler 1486 → service 241-263 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `git_read` grep result | `hits` | `grepRemoteRef` → `execRemoteCommand` → `git grep` | Yes — real-git pipeline test returns 3 hits with real line numbers | ✓ FLOWING |
| `git_read` read_file result | `page.lines`, `page.totalLines` | `readRemoteFilePage` → `git cat-file` + awk | Lines yes; `totalLines` is the cut position when the byte cap fires | ⚠️ PARTIAL |
| `explore_repo` result | `result.report` | `runRemoteExplore` → `claude -p` over SSH | Yes — local CLI probe returned `is_error: false` with a `path:line` citation | ✓ FLOWING |
| team turn loop options | `contextWindowTokens` | `getNineRouterConfig` → coordinator → runtime → loop | Yes — recorded loop options carry 128000 in tests | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Typecheck | `npx tsc --noEmit -p tsconfig.json` | exit 0 | ✓ PASS |
| Scoped phase suites | `npx vitest run tests/services/remoteExploreService.test.ts tests/services/__tests__/gitRemoteReadPipeline.test.ts tests/services/ai/office/teamToolsGitRead.test.ts tests/services/ai/office/teamPrompts.test.ts src/services/__tests__/gitRemoteTreeService.test.ts src/services/__tests__/gitRemoteService.test.ts` | 179/179 pass, 6 files | ✓ PASS |
| Tool count + coordinator | `npx vitest run tests/services/ai/office/teamTools.test.ts tests/services/ai/office/teamRunCoordinator.test.ts` | 251/251 pass | ✓ PASS |
| In-loop compaction path | `npx vitest run tests/services/ai/aiOrchestratorLoop.test.ts -t "in-loop compaction"` | 1 passed | ✓ PASS |
| Explore CLI shape accepted | `claude -p --output-format json --restricted --allowedTools Read,Grep,Glob --model haiku --max-turns 8 --no-session-persistence --append-system-prompt '…' -- 'How many lines…'` | `is_error: false`, `result` cites `f.txt:3` | ✓ PASS |
| Turn-budget exhaustion shape | same command with `--max-turns 1` | `is_error: true`, `subtype: error_max_turns` — matches `parseExploreResult` | ✓ PASS |
| Byte-cap total (defect probe) | real git + `pageCommand` awk over a 250-line file of 2000-byte lines, offset 1 limit 200 | `###TOTAL 131`, `wc -l` = 250 | ✗ FAIL — confirms gap 1 |

### Probe Execution

No phase-declared probe scripts and no `scripts/*/tests/probe-*.sh` in this repository. Step 7c: SKIPPED (no probes declared; behavioral checks above cover the runnable surface).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| AIO-READ-07 | 43-01, 43-02 | `grep` action, `path:line:text`, bounded hits | ✓ SATISFIED | Criterion 1 |
| AIO-READ-08 | 43-01, 43-02 | Paged `read_file` with `totalLines`, `hasMore`, next offset | ⚠️ PARTIAL | Criterion 2 — paging works, `totalLines` untruthful under the byte cap |
| AIO-READ-09 | 43-04 | Remote headless Claude Code, read-only allowlist, bounded turns, capped report, truthful refusal | ✓ SATISFIED | Criterion 3 |
| AIO-READ-10 | 43-03 | Context window reaches `runAiOrchestratorLoop` | ✓ SATISFIED | Criterion 4 |

No orphaned requirements: REQUIREMENTS.md maps exactly these four IDs to Phase 43 and every one is claimed by a plan.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers in any of the 8 modified source files | ℹ️ Info | Debt-marker gate clean |
| `src/services/gitRemoteTreeService.ts` | 330 | `END{ print "###TOTAL "NR }` after a byte-budget `exit` | ⚠️ Warning | Understated `totalLines` (gap 1) |
| `src/services/gitRemoteTreeService.ts` | 396, 418 | raw `filePath` passed where `cleanPath` exists | ⚠️ Warning | Unconfined path echo (gap 2) |
| `src/services/gitRemoteTreeService.ts` | 473-475 | binary probe page-1 only | ℹ️ Info | Recorded, agreed ceiling; cannot leak raw bytes |
| `src/services/ai/office/teamTools.ts` | 1188, 1491 | `repoPath` unwrapped | ℹ️ Info | SSH-profile configuration, not remote content (IN-06, deliberate) |

### Human Verification Required

1. **explore_repo against a real SSH remote**
   **Test:** Run `explore_repo` once on a remote host with the `claude` CLI installed.
   **Expected:** `outcome: success`, a report with `path:line` citations, no hanging permission prompt.
   **Why human:** The command shape was probed against the local CLI; the SSH transport and a real remote cannot be exercised in a unit test.

2. **Page a large file to the end on a real remote**
   **Test:** `git_read read_file` a large file, follow `nextOffset` until `hasMore` is false.
   **Expected:** Contiguous pages, final `totalLines` equals `wc -l`.
   **Why human:** Confirms the gap-1 fix on real remote output.

### Gaps Summary

The phase delivers three of its four success criteria outright. `grep` locates code without reading files, `explore_repo` is a real second tier with a bounded, capped report and a truthful preflight refusal, and the context window now reaches the loop so compaction can run — all verified in the source, against real git, and against the real `claude` CLI.

Criterion 2 is partial. The page itself is correct: contiguous, line-numbered, byte-bounded, binary-aware, with a working `nextOffset`. But the `totalLines` field is not the file's total when the 256 KB page budget fires. The WR-02 fix that removed the page hole (`next` → `exit`) also moved awk's `END` to the cut position, so `###TOTAL` now reports where the page stopped. Reproduced: 250-line file, `###TOTAL 131`. Paging still completes, so no content is unreachable — but the model is told a wrong file size, which is the exact truthfulness class this phase targets, and it diverges from the local Read contract that always reports the real total.

A second, smaller gap: IN-01 is recorded as resolved for `read_file`, but the service never assigns the confined path to `page.filePath`; the handler echoes the model's raw string. `diff_file` was genuinely fixed.

No later phase exists in the milestone, so nothing is deferred.

---

_Verified: 2026-11-17T00:05:00Z_
_Verifier: Claude (gsd-verifier)_
