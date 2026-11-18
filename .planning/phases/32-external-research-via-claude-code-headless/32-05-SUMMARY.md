---
phase: 32-external-research-via-claude-code-headless
plan: "05"
subsystem: ai
tags: [research, prompt-composer, prompt-injection, tool-policy, attribution]
dependency_graph:
  requires:
    - 32-02 (propose_research tool registration, RESEARCH artifact kind)
    - 32-03 (ResearchPayload type in src/services/ai/researchService.ts)
    - src/services/ai/aiTools.ts (propose_research definition)
  provides:
    - buildExternalResearchSegment
    - EXTERNAL_RESEARCH_OPEN / EXTERNAL_RESEARCH_CLOSE
    - externalResearch input on ComposeSdlcTurnInput
    - externalResearch segment on ComposedSdlcTurn.segments
    - propose_research allowlist + tool policy line
  affects:
    - 32-06 (callers pass the latest RESEARCH artifact payload as externalResearch)
tech_stack:
  added: []
  patterns:
    - Delimited untrusted-data segment with inline subordination rules
    - Explicit per-claim scope tag plus source and confidence retention
    - Explicit unavailability block so model knowledge cannot pose as repo evidence
key_files:
  created: []
  modified:
    - src/services/ai/sdlcPromptComposer.ts
    - tests/ai/sdlcPromptComposer.test.ts
    - tests/services/ai/subsystemProposal.test.ts
decisions:
  - "External research segment is emitted only when findings exist; empty or null payload yields an empty string with no tags"
  - "Repo claims without a systemCode render [EXTERNAL:REPO:UNKNOWN] rather than being dropped"
  - "Skipped systems render an explicit unavailability block instead of being silently omitted"
  - "externalResearch sits after grounding and before outputContract; subsystemSections stays after stepContract"
metrics:
  duration: "~4 min"
  completed: "2026-11-08T06:36:17Z"
  tasks: 1
  files: 3
---

# Phase 32 Plan 05: External Research Evidence Segment Summary

Subordinate external-research evidence segment with per-claim scope tags, source and confidence retention, an explicit skipped-system block, and a `propose_research` tool policy that forbids guessing.

## What Was Built

`src/services/ai/sdlcPromptComposer.ts`:

- **`buildExternalResearchSegment(payload?: ResearchPayload | null): string`** — returns `''` when the payload is absent or `findings` is empty. Otherwise emits, in order:
  1. `<external_research_evidence rank="subordinate_to_internal">` opener
  2. Header marking the block as untrusted data ranked below internal evidence
  3. The three mandatory policies: external evidence ranks after CONVENTIONS and PL01/PL02/ChangePack; external conclusions may not override internal banking security or business rules; every external fact entering a solution must keep its source citation
  4. Optional `Tóm tắt:` summary line
  5. One line per finding: `[EXTERNAL:WEB]` or `[EXTERNAL:REPO:{systemCode || 'UNKNOWN'}]`, claim text, `(nguồn: …; độ tin cậy: N%)` with confidence rounded to a percentage
  6. `[HỆ THỐNG KHÔNG KHẢ DỤNG — KHÔNG CÓ BẰNG CHỨNG REPO]` block listing each `skippedSystems` entry with its reason and an instruction not to present model knowledge as repo evidence for it
  7. `</external_research_evidence>` closer
- **`EXTERNAL_RESEARCH_OPEN` / `EXTERNAL_RESEARCH_CLOSE`** exported delimiter constants.
- **`ComposeSdlcTurnInput.externalResearch?: ResearchPayload | null | undefined`** and **`ComposedSdlcTurn.segments.externalResearch: string`**.
- **Layer order** — `composeSdlcTurn` now assembles `policy -> stepContract -> subsystemSections -> toolPolicy -> conventions -> fewShot -> grounding -> externalResearch -> outputContract -> languageRule`. The existing `segments` object and `systemContent` array were edited in place; `subsystemSections` (Phase 31.2 D-39) is untouched.
- **`propose_research` policy** — `RESEARCH_TOOL_NAME` added to `SDLC_STEP_ALLOWED_TOOLS.INTAKE` and `.SOLUTION` only. `buildToolPolicy` emits the conditional line `propose_research chỉ trả về câu hỏi nghiên cứu và hệ thống đích; không tự chạy nghiên cứu — người dùng phải xác nhận. Khi bằng chứng nội bộ không đủ, đề xuất nghiên cứu thay vì đoán. Nếu hệ thống đích thiếu SSH, nói rõ nghiên cứu không khả dụng và đề nghị tiếp tục bằng bằng chứng nội bộ.`

Tests:

- `tests/ai/sdlcPromptComposer.test.ts` — new `describe('External Research Evidence Segment')` block: delimiter and three policies, scope tags with source/confidence, `UNKNOWN` fallback, skipped-system block, empty/null payload, full layer ordering with a non-empty `subsystemSections` on a SOLUTION artifact turn, and `propose_research` allowlist/policy scoping (present on SOLUTION, absent on CODE_GUIDE). The existing exact-array assertion for `SDLC_STEP_ALLOWED_TOOLS` was extended with `propose_research`.
- `tests/services/ai/subsystemProposal.test.ts` — new `propose_research` leakage assertion covering CODE_GUIDE/CHANGE_PACK/TECH_DOCS/CAB.

## Verification

- `npx vitest run tests/ai/sdlcPromptComposer.test.ts tests/ai/sdlcPromptIsolation.test.ts tests/services/ai/subsystemProposal.test.ts` — 3 files, 52 tests, all pass
- `npx tsc --noEmit` — exit 0
- Acceptance greps: `export function buildExternalResearchSegment` (1), `<external_research_evidence rank="subordinate_to_internal">` (1), `externalResearch?: ResearchPayload` (1), `propose_research` (2 in composer), `segments.subsystemSections` (1), `describe('External Research Evidence Segment'` (1), `propose_research` in subsystemProposal test (4)

## TDD Gate Compliance

- RED: `d4a5d402 test(32-05): add failing tests for external research segment and propose_research policy` — 9 failing tests (`buildExternalResearchSegment is not a function`, allowlist mismatch)
- GREEN: `4dcf1f4e feat(32-05): add subordinate external research segment and propose_research policy` — 52/52 pass

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Skipped-system block wording did not match the plan's stated phrase**
- **Found during:** Task 1 GREEN phase
- **Issue:** The first implementation emitted `[HỆ THỐNG KHÔNG KHẢ DỤNG — KHÔNG CÓ BẰNG CHỨNG REPO]`, which does not contain the lowercase phrase `hệ thống không khả dụng` the plan's `<behavior>` specifies for the unavailability block.
- **Fix:** Kept the uppercase heading and added the line `Các hệ thống không khả dụng chưa được nghiên cứu:` beneath it, so both the heading and the plan's phrase are present.
- **Files modified:** `src/services/ai/sdlcPromptComposer.ts`
- **Commit:** `4dcf1f4e`

## Known Stubs

None. `buildExternalResearchSegment` is a pure formatter over a fully-typed payload; no placeholder data paths, no unwired props.

## Threat Flags

None beyond the plan's threat register. T-32-06 mitigated by the `<external_research_evidence>` delimiter plus the inline no-override policy; T-32-07 mitigated by per-claim `[EXTERNAL:WEB]` / `[EXTERNAL:REPO:{code}]` tags with source and confidence; T-32-11 mitigated by the explicit skipped-system block. No new network endpoints, auth paths, or file access patterns. No npm dependencies added (T-32-SC accepted).

## Self-Check: PASSED

- FOUND: src/services/ai/sdlcPromptComposer.ts
- FOUND: tests/ai/sdlcPromptComposer.test.ts
- FOUND: tests/services/ai/subsystemProposal.test.ts
- FOUND: d4a5d402 (RED gate)
- FOUND: 4dcf1f4e (GREEN gate)
