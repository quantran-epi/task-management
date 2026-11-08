---
phase: 32-external-research-via-claude-code-headless
verified: 2026-11-08T07:11:09Z
status: gaps_found
score: 4/6 must-haves verified
overrides_applied: 1
overrides:
  - must_have: "A confirmed research run executes Claude Code headless through fs-gw over web and repository"
    reason: "fs-gw was deliberately replaced by direct native SSH execution of Claude Code headless; recorded in 32-CONTEXT.md ('Replaces fs-gw with direct SSH remote execution') and 32-RESEARCH.md. ROADMAP wording was not updated."
    accepted_by: "gsd-verifier (documented phase rescope)"
    accepted_at: "2026-11-08T07:11:09Z"
re_verification:
  previous_status: none
  previous_score: n/a
  gaps_closed: []
  gaps_remaining: []
  regressions: []
gaps:
  - truth: "The report is stored as a project/CR-scoped artifact with findings, per-claim sources, and a scope marker distinguishing web findings from repository findings"
    status: failed
    reason: "The remote command requests `--output-format json`, which makes the Claude Code CLI emit a result envelope object ({duration_api_ms, session_id, is_error, result: \"<model text>\", ...}), not the model's JSON payload. parseResearchOutput validates the envelope against ResearchPayloadSchema, fails (no `summary` field), and degrades to `{ summary: <envelope text>, findings: [], rawOutput }`. Verified empirically against the installed CLI (2.1.319) and the real parser: findings.length === 0. Every production run therefore persists a RESEARCH artifact with zero findings, no per-claim sources, and no [EXTERNAL:WEB]/[EXTERNAL:REPO:*] scope markers. Unit tests pass only because their fixtures feed bare JSON into stdout, which the real command never produces."
    artifacts:
      - path: "src/services/ai/researchService.ts"
        issue: "buildResearchCommand (line 230) emits `--output-format json`; parseResearchOutput (lines 109-131) never unwraps the envelope's `result` field before schema validation."
      - path: "src/services/ai/__tests__/researchService.test.ts"
        issue: "Fixtures emit bare payload JSON on stdout, so the envelope shape is never exercised."
    missing:
      - "Unwrap the CLI envelope: parse stdout as JSON, and when it has a string `result` field, re-run parseResearchOutput on that value (also honour `is_error`/`subtype` to map failures to RESEARCH_SSH_ERROR)."
      - "Add a test fixture built from a real `claude -p ... --output-format json` envelope asserting findings are recovered."

  - truth: "Research findings enter the composed prompt as an explicitly EXTERNAL-marked evidence class that never outranks internal evidence without saying so, and external claims stay attributable in the generated solution"
    status: failed
    reason: "The composer segment itself is correct and correctly ordered, but it is fed from the persisted payload. Because the payload always has an empty `findings` array (see previous gap), buildExternalResearchSegment returns '' (line 389: `if (findings.length === 0) return '';`) and no external evidence ever reaches the model. The subordination policy, the [EXTERNAL:*] tags, and the source citations are structurally present but never emitted in a real run."
    artifacts:
      - path: "src/services/ai/sdlcPromptComposer.ts"
        issue: "buildExternalResearchSegment (lines 387-419) short-circuits to an empty string when findings is empty — correct behaviour, but unreachable with real data."
      - path: "src/components/sdlc/chat/StepChatPanel.tsx"
        issue: "Lines 529-536 load the latest artifact and pass it as externalResearch; the input is always an empty-findings payload."
    missing:
      - "Fix the upstream parse (previous gap). No composer change is required."
      - "Add an integration-level assertion that a run through executeMultiSystemResearch produces a non-empty externalResearch segment."

  - truth: "An SSH stream failure rejects with RESEARCH_SSH_ERROR rather than resolving with partial data (plan 04 truth, D-03)"
    status: failed
    reason: "The Rust reader thread always emits `error: None` on the exit event (src-tauri/src/ssh_service.rs:507). A mid-stream connection drop breaks the read loop (`Err(_) => break`, line 453) and is reported as exit_status -1 with error null, so researchService's exit handler calls exitResolve() and the run resolves with whatever partial lines arrived — then persists them. The `event.error` branch in researchService.ts:401-412 is unreachable in production; only the mocked unit test exercises it. A non-zero exit (e.g. `claude` missing, `cd` failing) is likewise treated as success and persists an empty artifact."
    artifacts:
      - path: "src-tauri/src/ssh_service.rs"
        issue: "Line 507: `error: None` is hardcoded; the read-loop error is discarded at line 453."
      - path: "src/services/ai/researchService.ts"
        issue: "Lines 401-412 depend on an error field the backend never populates; exit status is not checked anywhere."
    missing:
      - "Capture the read-loop error in the Rust thread and emit it in SshStreamExitEvent.error."
      - "Treat a non-zero exit_status as RESEARCH_SSH_ERROR in executeMultiSystemResearch."
---

# Phase 32: External Research via Claude Code Headless Verification Report

**Phase Goal:** When internal evidence is insufficient the AI proposes research instead of guessing; after explicit confirmation it runs Claude Code headless through fs-gw over both the web and the repository, stores a sourced EXTERNAL-marked report, and combines it with internal evidence in the resulting solution.
**Verified:** 2026-11-08T07:11:09Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | AI proposes research naming specific questions; nothing runs until explicit confirmation | ✓ VERIFIED | `aiTools.ts:1957` tool def, `aiTools.ts:2206` dispatch case, `sdlcArtifactTools.ts:629-662` `proposeResearch` (re-resolves ids against `db.systems` ∩ `cr.targets`, never starts a run). `StepChatPanel.tsx:570-587` renders a proposal card only on `phase === 'result'`; `startResearch` (line 919) is reachable only from the card's confirm or the toolbar modal submit. Composer policy line at `sdlcPromptComposer.ts:135` instructs propose-instead-of-guess. |
| 2 | Confirmed run executes Claude Code headless, streams progress into UI, stop leaves no orphan | ✓ VERIFIED | Rust `ssh_exec_stream` non-PTY, `echo $$ && <cmd>`, PID → `SshStreamRegistry`, `ssh_kill_process` → `kill -TERM` (`ssh_service.rs:413-546`); registered in `lib.rs:24,78-79`. Frontend `execRemoteCommandStream` (`sshService.ts:271-330`) with idempotent cancel. Live lines → `ResearchStreamingCard` (500-line cap). `cargo check` clean. |
| 3 | Report stored as CR-scoped artifact with findings, per-claim sources, and web/repo scope marker | ✗ FAILED | Storage path is correct (`wizardSchemas.ts:117,141`, `artifactRepo.ts:243-301`, `renderResearchMarkdown` tags). But the real CLI envelope is never unwrapped, so `findings` is always `[]` in production — verified by running the actual parser on a real `claude -p ... --output-format json` envelope: `findings: 0`. |
| 4 | Findings enter the prompt as subordinate EXTERNAL-marked evidence, attributable | ✗ FAILED | Segment builder, rank attribute, three policies, per-claim tags/sources/confidence, and layer order are all correct (`sdlcPromptComposer.ts:376-419, 563-587`), and it is wired (`StepChatPanel.tsx:529-536, 730`). But `buildExternalResearchSegment` returns `''` whenever findings is empty, and findings is always empty (gap 1) — so nothing is ever emitted. |
| 5 | When research is unavailable, the AI says so and offers internal evidence only | ✓ VERIFIED | `checkResearchAvailability` reports `NO_SSH_CONFIG`/`UNREACHABLE` per system (`researchService.ts:149-186`); all-unavailable → `RESEARCH_UNAVAILABLE`; partial → `skippedSystems` + Vietnamese `onLog`. `ResearchErrorAlert` offers "Bỏ qua, tiếp tục bằng bằng chứng nội bộ". Composer policy line mandates stating unavailability instead of substituting model knowledge. |
| 6 | Artifacts appear in the step where produced, persist with CR, reopenable/reusable without re-running | ✓ VERIFIED | `loadAllResearchArtifacts`/`loadLatestResearchArtifact` are CR-scoped (`artifactRepo.ts:255-301`); `Step1IntakeView.tsx:169` and `Step2SolutionView.tsx:287` render `ResearchSummaryCard` with `versions`; `ResearchDetailModal` version selector; `StepChatPanel` reuses the latest payload each turn. (Content is empty until gap 1 is fixed.) |

**Score:** 4/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src-tauri/src/ssh_service.rs` | `SshStreamRegistry`, `ssh_exec_stream`, `ssh_kill_process` | ✓ VERIFIED | 546 lines; non-PTY exec, owned `channel.stream(0)` reader, stderr drain, PID registry. `error` field never populated (see gap 3). |
| `src-tauri/src/lib.rs` | command registration | ✓ VERIFIED | `manage(SshStreamRegistry::default())` line 24; both commands lines 78-79. |
| `src/types/ssh.ts` | stream event types | ✓ VERIFIED | `SshStreamEvent` line 40, `SshStreamExitEvent` line 46. |
| `src/services/sshService.ts` | `execRemoteCommandStream` + cancel | ✓ VERIFIED | Lines 271-330; unlisten cleanup, `onExit(evt.payload)`, idempotent cancel. |
| `src/services/ai/researchService.ts` | schemas, escaping, parser, availability, orchestrator | ✓ VERIFIED (parser defect) | 472 lines; all exports present. `parseResearchOutput` does not unwrap the CLI envelope. |
| `src/services/wizard/artifactRepo.ts` | RESEARCH kind + loaders | ✓ VERIFIED | `saveResearchArtifact` 243, `loadLatestResearchArtifact` 284, `loadAllResearchArtifacts` 296; CR-scoped filter. |
| `src/services/ai/wizardSchemas.ts` | RESEARCH kind | ✓ VERIFIED | Lines 117, 141. |
| `src/services/ai/aiTools.ts` | tool def + dispatch | ✓ VERIFIED | Lines 1957, 2206-2210. |
| `src/services/ai/sdlcArtifactTools.ts` | `proposeResearch` | ✓ VERIFIED | Lines 113-124, 562-563, 629-662. |
| `src/services/ai/chatTurnTools.ts` | host gate | ✓ VERIFIED | Line 26. |
| `src/services/ai/sdlcPromptComposer.ts` | external segment + tool policy | ✓ VERIFIED | Lines 71, 135, 376-419, 472, 486, 563-587. |
| `src/components/sdlc/common/ResearchSummaryCard.tsx` | card + 2 modals | ✓ VERIFIED | 447 lines; no `dangerouslySetInnerHTML`; findings render as React text nodes. |
| `src/components/sdlc/chat/StepChatPanel.tsx` | research state machine | ✓ VERIFIED | 1311 lines; proposal/streaming/completion/error cards, `startResearch`, null-thread gate, `propose_research` tool gate. |
| `src/components/sdlc/steps/Step1IntakeView.tsx` / `Step2SolutionView.tsx` | card + trigger | ✓ VERIFIED | Lines 169 / 287; CR-target system lookup for the modal. |
| `src/views/ChangeRequestSdlcView.tsx` | `onStartResearch` wiring | ✓ VERIFIED | Lines 853, 871 → `chatPanelRef.current?.startResearch`. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `sshService.ts` | `ssh_service.rs` | `invoke('ssh_exec_stream')` | WIRED | Line 306. |
| `researchService.ts` | `sshService.ts` | `execRemoteCommandStream` | WIRED | Line 393. |
| `researchService.ts` | `artifactRepo.ts` | `saveResearchArtifact` | WIRED | Line 442. |
| `researchService.ts` | `parseResearchOutput` | stdout lines | PARTIAL | Wired, but parses the CLI envelope as if it were the payload. |
| `aiTools.ts` | `sdlcArtifactTools.ts` | `case 'propose_research'` | WIRED | Line 2206. |
| `sdlcArtifactTools.ts` | `changeRequestRepo` | `changeRequests.get(context.crId)` | WIRED | Line 640. |
| `StepChatPanel.tsx` | `researchService.ts` | `executeMultiSystemResearch` | WIRED | Line 930. |
| `StepChatPanel.tsx` | `sdlcPromptComposer.ts` | `externalResearch` input | WIRED | Line 730. |
| `ChangeRequestSdlcView.tsx` | `StepChatPanel.tsx` | `startResearch` | WIRED | Lines 853, 871. |
| `Step1/2` views | `artifactRepo.ts` | `loadAllResearchArtifacts` | WIRED | Lines 72-75 / 175-178. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `ResearchSummaryCard` (Step 1/2) | `researchPayload` | `loadAllResearchArtifacts` → Dexie `notes` | Yes (persisted), but findings always empty | ⚠️ STATIC |
| `StepChatPanel` | `externalResearch` | `loadLatestResearchArtifact` → `ResearchPayloadSchema` | Yes, but `findings: []` every run | ⚠️ STATIC |
| `executeMultiSystemResearch` | `findings` | remote stdout → `parseResearchOutput` | No — envelope not unwrapped | ✗ DISCONNECTED |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase test suite (9 files) | `npx vitest run <9 phase suites>` | 113 passed | ✓ PASS |
| SDLC view regression suites (6 files) | `npx vitest run tests/unit/sdlc/...` | 47 passed | ✓ PASS |
| Typecheck | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Rust backend | `cargo check` in `src-tauri/` | clean | ✓ PASS |
| Real CLI envelope round-trip | `claude -p '<json payload>' --output-format json` piped into the real `parseResearchOutput` | `{ summary: "<envelope text>", findings: 0, rawOutput: true }` | ✗ FAIL |
| Remote command shape | `buildResearchCommand` unit test | exact string asserted, no `sh -c`, no `exec cd` | ✓ PASS |

### Probe Execution

Step 7c: SKIPPED (no probes declared in PLAN/SUMMARY; no `scripts/*/tests/probe-*.sh` for this phase).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SDLC-RES-01 | 32-02, 32-05, 32-06 | Propose research, none until confirm | ✓ SATISFIED | Tool + card + confirm gate + policy line. |
| SDLC-RES-02 | 32-01, 32-04 | Headless run over web+repo, streamed, stoppable | ✓ SATISFIED (fs-gw→SSH override) | Streaming, PID kill, cancel handle. |
| SDLC-RES-03 | 32-02, 32-03, 32-04, 32-06 | CR-scoped artifact with findings/sources/scope marker | ✗ BLOCKED | Storage correct; payload always has zero findings (envelope not unwrapped). |
| SDLC-RES-04 | 32-05 | EXTERNAL-marked subordinate evidence, attributable | ✗ BLOCKED | Segment never emitted because findings are empty. |
| SDLC-RES-05 | 32-03, 32-04, 32-05, 32-06 | Unavailable → say so, offer internal evidence | ✓ SATISFIED | Availability pre-flight, error alert CTAs, policy line. |
| SDLC-RES-06 | 32-02, 32-06 | Persist with CR, appear in step, reusable | ✓ SATISFIED | CR-scoped loaders, cards in Step 1/2, version selector. |

All six requirement IDs declared in plan frontmatter are accounted for. No orphaned requirements. `.planning/REQUIREMENTS.md` still lists all six as `Pending` (tracking only, not a code gap).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/services/ai/researchService.ts` | 397-400 | stderr lines pushed into the parsed `lines` buffer with no `event.stream` check | ⚠️ Warning | CLI stderr banners (e.g. `[claude-code:unrecognized_model]`) contaminate the payload parse. |
| `src/services/ai/researchService.ts` | 401-412 | `event.error` branch unreachable — Rust always sends `error: None` | 🛑 Blocker | Mid-stream drop resolves with partial data (gap 3). |
| `src/services/ai/researchService.ts` | 463-469 | `cancel()` before `cancelActive` is assigned is a silent no-op | ℹ️ Info | Narrow window; UI's cancel ref is also null then, so the button no-ops rather than orphaning. |

No debt markers (`TBD`/`FIXME`/`XXX`/`TODO`) in any phase-modified file. No `dangerouslySetInnerHTML`.

### Human Verification Required

1. **Live remote research run**
   - **Test:** On a Tauri build with a reachable SSH target whose `remoteRepoPath` contains Claude Code, open SDLC Step 1 for a CR with that target, click "Nghiên cứu (Claude Code)", submit one question, watch the streaming card, then click "Hủy nghiên cứu" mid-run.
   - **Expected:** Lines stream in; cancel stops the card; `ps` on the remote shows no surviving `claude` process; a second full run produces a RESEARCH artifact whose detail modal lists findings with `[EXTERNAL:WEB]` / `[EXTERNAL:REPO:<code>]` tags and sources.
   - **Why human:** Requires a live remote host with Claude Code installed and an authenticated session; `32-VALIDATION.md` lists this as manual-only.

### Gaps Summary

The phase's scaffolding is complete and well-tested: proposal gating, SSH streaming with PID capture and SIGTERM, CR-scoped versioned artifacts, the subordinate prompt segment, unavailability handling, and both UI trigger paths are all present, wired, and green across 160 scoped tests plus `tsc` and `cargo check`.

The goal itself is not achieved, because the runtime path never produces findings. `buildResearchCommand` asks the CLI for `--output-format json`, which wraps the model's answer in a result envelope (`{"type":"result","is_error":false,"result":"<model text>", ...}`). `parseResearchOutput` validates that envelope directly, fails the schema, and degrades to raw text with `findings: []`. Confirmed empirically against the installed CLI (2.1.319) using the real parser. Downstream, `buildExternalResearchSegment` correctly returns `''` for an empty-findings payload, so no EXTERNAL evidence ever reaches the composer — which is exactly what success criteria 3 and 4 require.

A second, independent defect removes the safety net: the Rust stream thread hardcodes `error: None` on the exit event and discards the read-loop error, so a dropped SSH connection or a non-zero exit resolves as a successful run with partial data instead of `RESEARCH_SSH_ERROR`.

Both are localized fixes: unwrap `result` (and honour `is_error`) in `parseResearchOutput`, filter stderr out of the parsed buffer, propagate the read error and check `exit_status` in the orchestrator. No architectural change is needed.

---

_Verified: 2026-11-08T07:11:09Z_
_Verifier: Claude (gsd-verifier)_
