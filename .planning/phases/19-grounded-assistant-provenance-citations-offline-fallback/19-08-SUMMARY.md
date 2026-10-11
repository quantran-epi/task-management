---
phase: 19-grounded-assistant-provenance-citations-offline-fallback
plan: 08
subsystem: ai
tags: [grounded-ai, synthesis, complete-json, bounded-repair, language-lock, closure-gating]

requires:
  - phase: 19-02
    provides: GroundedAnswerSchema and GroundedAnswerJsonSchema
  - phase: 19-05
    provides: completeJson and CompleteJsonRequest
  - phase: 19-07
    provides: EvidencePack and validateGroundedAnswerClosure
provides:
  - synthesizeGroundedAnswer orchestrator with bounded repair and closure gating
  - detectQueryLanguage deterministic Vietnamese/English classifier
  - GroundedSynthesisError with INVALID_GROUNDED_OUTPUT, TIMEOUT, ABORTED, MODEL_UNAVAILABLE taxonomy
  - Content-free SynthesisAttemptLog
affects: [19-09, 19-14, chat-ui]

tech-stack:
  added: []
  patterns: [serial bounded repair, content-free diagnostics, response-language lock, byte-identical quote preservation]

key-files:
  created:
    - src/services/ai/groundedSynthesis.ts
    - tests/ai/groundedSynthesis.test.ts
  modified: []

key-decisions:
  - "synthesizeGroundedAnswer uses completeJson with strict JSON schema when supported and plain JSON object fallback (D-45)."
  - "Serial bounded repair allows at most 2 repair attempts (3 attempts total); repair prompt carries only issue paths/codes, allowed citation/path IDs, previous raw JSON, and response language—never new evidence text."
  - "Throws GroundedSynthesisError('INVALID_GROUNDED_OUTPUT') after 2 failed repairs; caller renders safe error, never partial prose (D-45)."
  - "Validates output via Zod safeParse and validateGroundedAnswerClosure before returning (D-01, D-02, D-14, D-28, D-26)."
  - "System prompt enforces D-06 response language lock and requires byte-identical source quote and identifier preservation regardless of query language."

patterns-established:
  - "Bounded repair hygiene: prompt carries validation issues without expanding evidence."
  - "D-06 language lock: response language mirrors query language while preserving technical identifiers and source quotes byte-for-byte."

requirements-completed: [ANSWER-01, ANSWER-02, ANSWER-03, ANSWER-05]

duration: 10m
completed: 2026-10-11
---

# Phase 19 Plan 08: Grounded Synthesis Layer Summary

Structured synthesis layer on top of `completeJson` and the evidence pack, providing bounded repair, closure gating, INVALID_GROUNDED_OUTPUT error state per D-45, and D-06 response language lock with verbatim quote/identifier preservation.

## Key Changes

- **Grounded synthesis module (`src/services/ai/groundedSynthesis.ts`)**:
  - Implemented `synthesizeGroundedAnswer` integrating `completeJson`, `GroundedAnswerSchema`, and `validateGroundedAnswerClosure`.
  - Added deterministic `detectQueryLanguage` detecting Vietnamese via diacritics `[À-ỹ]` and stop words, with auto and explicit overrides.
  - Implemented D-06 language lock in system prompt: response language matches query language; technical identifiers and source quotes must be reproduced byte-identical from evidence.
  - Added serial bounded repair (max 2 repair attempts, 3 total attempts) with 20s timeout per repair.
  - Repair messages carry only validation issue paths/codes, allowed citation/path IDs, previous raw JSON, and response language—never new evidence text.
  - Throws `GroundedSynthesisError` with code `INVALID_GROUNDED_OUTPUT` after exhausted repairs.
  - Content-free `SynthesisAttemptLog` capturing only latency, attempt numbers, issue codes, and language enum without queries or evidence text.
  - Mapped remote, network, timeout, and abort error taxonomy into `GroundedSynthesisError` codes.
- **Unit test suite (`tests/ai/groundedSynthesis.test.ts`)**:
  - 17 test cases verifying happy path, repair-once, 2-failed-repairs error, closure rejection, abort and timeout propagation, network error mapping, tool absence, strict JSON schema capability handling, repair prompt payload hygiene, attempt log content-free invariant, prompt versioning, and byte-level quote/identifier preservation across VI and EN runs.

## Verification

- `npm run build`: Clean TypeScript build and Vite client bundling.
- `vitest run tests/ai/groundedSynthesis.test.ts`: All 17 unit tests passing.

## Deviations from Plan

None - plan executed exactly as written.

## Threat Flags

None - all security mitigations from T-19-23, T-19-24, T-19-25, and T-19-25b enforced:
- T-19-23: Bounded repair max 2 attempts, throws `INVALID_GROUNDED_OUTPUT`.
- T-19-24: Content-free attempt logs without query, evidence, or credentials.
- T-19-25: No `tools` or `tool_choice` in request body.
- T-19-25b: D-06 language lock and byte-identical quote checks enforced.

## Self-Check: PASSED
- `src/services/ai/groundedSynthesis.ts` exists.
- `tests/ai/groundedSynthesis.test.ts` exists.
- Commits `41d0c60` and `573ea7d` verified.
