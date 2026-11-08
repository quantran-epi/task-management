---
phase: 32-external-research-via-claude-code-headless
verified: 2026-11-08T07:20:14Z
status: human_needed
score: 6/6 must-haves verified
overrides_applied: 1
overrides:
  - must_have: "A confirmed research run executes Claude Code headless through fs-gw over web and repository"
    reason: "fs-gw was deliberately replaced by direct native SSH execution of Claude Code headless; recorded in 32-CONTEXT.md ('Replaces fs-gw with direct SSH remote execution') and 32-RESEARCH.md. ROADMAP wording was not updated."
    accepted_by: "gsd-verifier (documented phase rescope)"
    accepted_at: "2026-11-08T07:11:09Z"
re_verification:
  previous_status: gaps_found
  previous_score: 4/6
  gaps_closed:
    - "Report stored with real findings, per-claim sources, and web/repo scope markers — CLI result envelope is now unwrapped before schema validation"
    - "Findings enter the composed prompt as subordinate EXTERNAL-marked evidence — segment now receives non-empty findings end to end"
    - "SSH stream failure rejects with RESEARCH_SSH_ERROR — read-loop error is propagated and non-zero exit status is rejected"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Live remote research run on a Tauri build against a reachable SSH target whose remoteRepoPath contains an authenticated Claude Code CLI"
    expected: "Lines stream into the card; cancel stops the card; `ps` on the remote shows no surviving `claude`; a full run persists a RESEARCH artifact whose detail modal lists findings tagged [EXTERNAL:WEB] / [EXTERNAL:REPO:<code>] with sources, and the next Solution turn's composed system prompt contains <external_research_evidence rank=\"subordinate_to_internal\">"
    why_human: "Requires a live remote host with Claude Code installed and an authenticated session; 32-VALIDATION.md lists real SSH execution as manual-only. Automated verification covers the same data path with a real CLI envelope captured from the local CLI (2.1.319)."
---

# Phase 32: External Research via Claude Code Headless Verification Report

**Phase Goal:** When internal evidence is insufficient the AI proposes research instead of guessing; after explicit confirmation it runs Claude Code headless through fs-gw over both the web and the repository, stores a sourced EXTERNAL-marked report, and combines it with internal evidence in the resulting solution.
**Verified:** 2026-11-08T07:20:14Z
**Status:** human_needed (all automated truths verified; one live-runtime check outstanding)
**Re-verification:** Yes — after gap closure commit `a271f7d0`

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | AI proposes research naming specific questions; nothing runs until explicit confirmation | ✓ VERIFIED | `aiTools.ts:1957` tool def, `aiTools.ts:2206` dispatch case, `sdlcArtifactTools.ts:562-563,629-662` `proposeResearch` (re-resolves ids against `db.systems` ∩ `cr.targets`, never starts a run). `StepChatPanel.tsx` renders a proposal card only on `phase === 'result'`; `startResearch` reachable only from the card's confirm or the toolbar modal submit. Composer policy line at `sdlcPromptComposer.ts:135`. Regression-tested by `tests/services/ai/researchProposal.test.ts` (passing). |
| 2 | Confirmed run executes Claude Code headless, streams progress into UI, stop leaves no orphan | ✓ VERIFIED | Rust `ssh_exec_stream` non-PTY, `echo $$ && <cmd>`, PID → `SshStreamRegistry`, `ssh_kill_process` → `kill -TERM` (`ssh_service.rs:413-552`); registered in `lib.rs:24,78-79`. Frontend `execRemoteCommandStream` (`sshService.ts:271-330`) with idempotent cancel. Live lines → `ResearchStreamingCard` (500-line cap). `cargo check` clean; `sshService.test.ts` 5/5. |
| 3 | Report stored as CR-scoped artifact with findings, per-claim sources, and web/repo scope marker | ✓ VERIFIED | **Gap closed.** `parseResearchOutput` now unwraps the CLI envelope (`researchService.ts:110-168`). Proven end to end: captured a real `claude -p … --output-format json` envelope from the installed CLI (2.1.319), fed it through the real orchestrator → persisted artifact markdown contains `[EXTERNAL:WEB]` and `source: https://example.com`; `saved[0].markdown` asserted. Storage path unchanged and correct (`wizardSchemas.ts:117,141`, `artifactRepo.ts:243-301`, `renderResearchMarkdown`). |
| 4 | Findings enter the prompt as subordinate EXTERNAL-marked evidence, attributable | ✓ VERIFIED | **Gap closed.** Same probe round-tripped the persisted `exportPayload` through `ResearchPayloadSchema` (exactly what `StepChatPanel.tsx:530-536` does) and into `buildExternalResearchSegment`, which returned a segment containing `<external_research_evidence rank="subordinate_to_internal">`, `[EXTERNAL:WEB]`, and the source URL. Layer order and policy lines unchanged (`sdlcPromptComposer.ts:376-419,563-587`); `sdlcPromptComposer.test.ts` 35/35. |
| 5 | When research is unavailable, the AI says so and offers internal evidence only | ✓ VERIFIED | `checkResearchAvailability` reports `NO_SSH_CONFIG`/`UNREACHABLE` per system (`researchService.ts:186-223`); all-unavailable → `RESEARCH_UNAVAILABLE`; partial → `skippedSystems` + Vietnamese `onLog`. `StepChatPanel.tsx:401,416` renders the alert with "Bỏ qua, tiếp tục bằng bằng chứng nội bộ". Composer policy line mandates stating unavailability. |
| 6 | Artifacts appear in the step where produced, persist with CR, reopenable/reusable without re-running | ✓ VERIFIED | `loadAllResearchArtifacts`/`loadLatestResearchArtifact` are CR-scoped (`artifactRepo.ts:255-301`); `Step1IntakeView.tsx:169` and `Step2SolutionView.tsx:287` render `ResearchSummaryCard` with `versions`; `ResearchDetailModal` version selector; `StepChatPanel` reuses the latest payload each turn. `artifactRepo.test.ts` + `ResearchSummaryCard.test.tsx` passing. |

**Score:** 6/6 truths verified

### Deferred Items

None. No later milestone phase covers any remaining gap.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src-tauri/src/ssh_service.rs` | `SshStreamRegistry`, `ssh_exec_stream`, `ssh_kill_process` | ✓ VERIFIED | 552 lines; non-PTY exec, owned `channel.stream(0)` reader, stderr drain, PID registry. **Gap closed:** read-loop error captured into `stream_error` (`:444,456-459`) and emitted as `error: stream_error` (`:513`); `SshStreamExitEvent.error: Option<String>` serializes camelCase to `error`. |
| `src-tauri/src/lib.rs` | command registration | ✓ VERIFIED | `manage(SshStreamRegistry::default())` line 24; both commands lines 78-79. |
| `src/types/ssh.ts` | stream event types | ✓ VERIFIED | `SshStreamEvent` line 40, `SshStreamExitEvent` line 46 (`error: string \| null`). |
| `src/services/sshService.ts` | `execRemoteCommandStream` + cancel | ✓ VERIFIED | Lines 271-330; unlisten cleanup, `onExit(evt.payload)`, idempotent cancel. |
| `src/services/ai/researchService.ts` | schemas, escaping, parser, availability, orchestrator | ✓ VERIFIED | 518 lines. **Gap closed:** `CliResultEnvelopeSchema` + `extractCandidates`/`parseCandidates` unwrap `result` and skip `is_error` envelopes (`:110-168`); non-zero `exitStatus` rejects with `RESEARCH_SSH_ERROR` (`:446-453`). |
| `src/services/wizard/artifactRepo.ts` | RESEARCH kind + loaders | ✓ VERIFIED | `saveResearchArtifact` 243, `loadLatestResearchArtifact` 284, `loadAllResearchArtifacts` 296; CR-scoped filter; `artifactBody` serializes `{markdown, exportPayload}`. |
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
| `researchService.ts` | `sshService.ts` | `execRemoteCommandStream` | WIRED | Line 430. |
| `researchService.ts` | `artifactRepo.ts` | `saveResearchArtifact` | WIRED | Line 487. |
| `researchService.ts` | `parseResearchOutput` | stdout lines | WIRED | Line 470. **Gap closed:** envelope unwrapped, real-envelope probe recovers findings. |
| `artifactRepo.ts` | `StepChatPanel.tsx` | `loadLatestResearchArtifact` → `ResearchPayloadSchema` | WIRED | `StepChatPanel.tsx:530-536`; round-trip probe confirms `exportPayload` survives. |
| `StepChatPanel.tsx` | `sdlcPromptComposer.ts` | `externalResearch` input | WIRED | Line 730; probe confirms non-empty segment. |
| `aiTools.ts` | `sdlcArtifactTools.ts` | `case 'propose_research'` | WIRED | Line 2206. |
| `sdlcArtifactTools.ts` | `changeRequestRepo` | `changeRequests.get(context.crId)` | WIRED | Line 640. |
| `StepChatPanel.tsx` | `researchService.ts` | `executeMultiSystemResearch` | WIRED | Line 930. |
| `ChangeRequestSdlcView.tsx` | `StepChatPanel.tsx` | `startResearch` | WIRED | Lines 853, 871. |
| `Step1/2` views | `artifactRepo.ts` | `loadAllResearchArtifacts` | WIRED | Lines 73 / 176. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `ResearchSummaryCard` (Step 1/2) | `researchPayload` | `loadAllResearchArtifacts` → Dexie `notes` | Yes — findings populated from real CLI envelope | ✓ FLOWING |
| `StepChatPanel` | `externalResearch` | `loadLatestResearchArtifact` → `ResearchPayloadSchema` | Yes — round-trip probe returns non-empty findings | ✓ FLOWING |
| `executeMultiSystemResearch` | `findings` | remote stdout → `parseResearchOutput` | Yes — envelope unwrapped, findings recovered | ✓ FLOWING |
| `composeSdlcTurn` | `segments.externalResearch` | `buildExternalResearchSegment(externalResearch)` | Yes — non-empty segment with rank attribute and citations | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Research service unit suite | `npx vitest run src/services/ai/__tests__/researchService.test.ts` | 30 passed | ✓ PASS |
| Composer suite | `npx vitest run tests/ai/sdlcPromptComposer.test.ts` | 35 passed | ✓ PASS |
| Research UI suites | `npx vitest run tests/unit/sdlc/StepChatPanelResearch.test.tsx tests/unit/sdlc/ResearchSummaryCard.test.tsx` | 18 passed | ✓ PASS |
| SDLC view regression | `npx vitest run tests/unit/sdlc/{StepViews,ChangeRequestSdlcView,SdlcFlowIntegration}.test.tsx` | 35 passed | ✓ PASS |
| SDLC panel regression | `npx vitest run tests/unit/sdlc/{StepChatPanelArtifactBudget,StepChatPanelToolPolicy,ChangeRequestSdlcViewAsyncCr,SdlcWorkspace,Step2SolutionView}.test.tsx` | 30 passed | ✓ PASS |
| Artifact repo + proposal | `npx vitest run src/services/wizard/__tests__/artifactRepo.test.ts tests/services/ai/researchProposal.test.ts` | 12 passed | ✓ PASS |
| SSH service | `npx vitest run src/services/__tests__/sshService.test.ts` | 5 passed | ✓ PASS |
| Typecheck | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Rust backend | `cargo check` in `src-tauri/` | clean | ✓ PASS |
| Real CLI envelope → parser | captured `claude -p '<json>' --output-format json` (CLI 2.1.319) piped into real `parseResearchOutput` | `findings.length === 1`, `claim === 'cli envelope works'`, `scope === 'web'` | ✓ PASS |
| Real CLI envelope → orchestrator → artifact | real envelope fed through `executeMultiSystemResearch` with mocked stream | persisted markdown contains `[EXTERNAL:WEB]` + `https://example.com` | ✓ PASS |
| Persisted payload → composer segment | `ResearchPayloadSchema.parse(exportPayload)` → `buildExternalResearchSegment` | segment starts with `<external_research_evidence rank="subordinate_to_internal">`, contains `[EXTERNAL:WEB]` and the source URL | ✓ PASS |
| `is_error` envelope rejected | `parseResearchOutput({type:'result',is_error:true,result:'boom'})` | `findings: []`, `rawOutput` set, segment `''` | ✓ PASS |
| Non-zero exit → RESEARCH_SSH_ERROR | unit test with `exitStatus: 127` | rejects, `saveResearchArtifact` not called | ✓ PASS |
| Real CLI error path | `claude -p hi --model definitely-not-a-model` | exit 1, `is_error: true` | ✓ PASS (confirms non-zero exit is the real failure signal) |

### Probe Execution

Step 7c: SKIPPED — no probes declared in PLAN/SUMMARY; no `scripts/*/tests/probe-*.sh` exists for this phase.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SDLC-RES-01 | 32-02, 32-05, 32-06 | Propose research, none until confirm | ✓ SATISFIED | Tool + card + confirm gate + policy line; `researchProposal.test.ts` passing. |
| SDLC-RES-02 | 32-01, 32-04 | Headless run over web+repo, streamed, stoppable | ✓ SATISFIED (fs-gw→SSH override) | Streaming, PID kill, cancel handle; `sshService.test.ts` passing. |
| SDLC-RES-03 | 32-02, 32-03, 32-04, 32-06 | CR-scoped artifact with findings/sources/scope marker | ✓ SATISFIED | Real-envelope probe persists findings with `[EXTERNAL:WEB]` and sources. |
| SDLC-RES-04 | 32-05 | EXTERNAL-marked subordinate evidence, attributable | ✓ SATISFIED | Round-trip probe emits the ranked segment with citations. |
| SDLC-RES-05 | 32-03, 32-04, 32-05, 32-06 | Unavailable → say so, offer internal evidence | ✓ SATISFIED | Availability pre-flight, error alert CTAs, policy line. |
| SDLC-RES-06 | 32-02, 32-06 | Persist with CR, appear in step, reusable | ✓ SATISFIED | CR-scoped loaders, cards in Step 1/2, version selector. |

All six requirement IDs declared in plan frontmatter are accounted for. No orphaned requirements. `.planning/REQUIREMENTS.md` still lists all six as `Pending` (tracking only, not a code gap).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/services/ai/researchService.ts` | 434-437 | stderr lines pushed into the parsed `lines` buffer with no `event.stream` check | ℹ️ Info | Safe today: the Rust reader drains stdout to EOF before reading stderr, so stderr events always arrive last and the balanced-object extractor still finds the envelope (probe: banner-last → 1 finding, banner-first → 0). Latent only if event ordering changes. |
| `src/services/ai/researchService.ts` | 508-514 | `cancel()` before `cancelActive` is assigned is a silent no-op | ℹ️ Info | Narrow window; UI's cancel ref is also null then, so the button no-ops rather than orphaning. |

No debt markers (`TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`) in any phase-modified file. No `dangerouslySetInnerHTML`. No empty implementations, no hardcoded-empty data flowing to render.

### Human Verification Required

1. **Live remote research run**
   - **Test:** On a Tauri build with a reachable SSH target whose `remoteRepoPath` contains Claude Code, open SDLC Step 1 for a CR with that target, click "Nghiên cứu (Claude Code)", submit one question, watch the streaming card, then click "Hủy nghiên cứu" mid-run.
   - **Expected:** Lines stream in; cancel stops the card; `ps` on the remote shows no surviving `claude` process; a second full run produces a RESEARCH artifact whose detail modal lists findings with `[EXTERNAL:WEB]` / `[EXTERNAL:REPO:<code>]` tags and sources; the following Solution turn's composed system prompt contains `<external_research_evidence rank="subordinate_to_internal">`.
   - **Why human:** Requires a live remote host with Claude Code installed and an authenticated session; `32-VALIDATION.md` lists this as manual-only.

### Gaps Summary

All three blockers from the previous verification are closed and independently confirmed.

1. **Envelope unwrap (`researchService.ts:110-168`).** `parseResearchOutput` now tries the payload directly, then unwraps a `{type:'result', result:'<text>'}` envelope and re-parses its `result` (recursively, with a fenced-JSON fallback), skipping `is_error` envelopes. Confirmed against a real envelope captured from the installed CLI (2.1.319): `findings.length === 1`, correct claim and scope. The prior "always zero findings" failure is gone.

2. **Stream error propagation (`ssh_service.rs:444,456-459,513`).** The read-loop `Err` is captured into `stream_error` and emitted as `SshStreamExitEvent.error` instead of the hardcoded `None`. The frontend type already matches (`error: string | null`), so `researchService.ts:439-445` is now reachable in production.

3. **Non-zero exit rejection (`researchService.ts:446-453`).** `executeMultiSystemResearch` rejects with `RESEARCH_SSH_ERROR` on `exitStatus !== 0` and does not persist. Confirmed both by unit test (`exitStatus: 127`) and by observing the real CLI exit 1 on an API error.

The data path the previous report could not close is now proven end to end without a live host: a real CLI envelope → `executeMultiSystemResearch` → persisted artifact markdown with `[EXTERNAL:WEB]` and sources → `ResearchPayloadSchema` round-trip → `buildExternalResearchSegment` emitting the ranked, cited segment. All 6 roadmap success criteria are observably true in the codebase.

The only outstanding item is the live remote-host run, which `32-VALIDATION.md` always classified as manual-only. Status is `human_needed` rather than `passed` solely because that check cannot be performed programmatically.

---

_Verified: 2026-11-08T07:20:14Z_
_Verifier: Claude (gsd-verifier)_
