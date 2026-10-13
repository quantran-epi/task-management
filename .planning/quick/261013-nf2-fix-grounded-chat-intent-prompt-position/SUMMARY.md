# Quick Task: Fix Grounded Chat Intent Prompt Position & Add Few-Shot Synthesis Prompt

**Directory:** `.planning/quick/261013-nf2-fix-grounded-chat-intent-prompt-position`
**Status:** complete
**Completed Date:** 2026-10-13

## Summary

1. **Inline Intent Routing Prompt:**
   - Moved `IntentRoutingPrompt` from fixed position above message list to inline within `ChatMessageList.tsx`.
   - Now renders immediately beneath the user query bubble when `transientClarifyMessage` is triggered.
   - Clears cleanly upon route selection without duplicate messages or misplaced top banners.

2. **Grounded Synthesis Few-Shot Prompt & Tolerant Normalization:**
   - Enriched `buildSystemPrompt` in `src/services/ai/groundedSynthesis.ts` with explicit JSON schema conventions and a full few-shot example.
   - Added pre-validation normalization via `normalizeRawGroundedOutput`:
     - Normalizes bracketed and numeric citations (`[1]` -> `S1`, `[S1]` -> `S1`).
     - Enforces `pathId: null` for `DIRECT` claims and downgrades `INFERRED` claims without valid `pathId` to `DIRECT`.
     - Coerces missing or malformed claim IDs (`1` -> `C1`).
     - Auto-constructs a fallback claim when `claims` is empty but `conclusion` and citations exist.
     - Filters citations against `allowedCitationIds`.
   - Prevents repair loop thrashing and `INVALID_GROUNDED_OUTPUT` failures for models like `gemini-3.8-flash`.

## Verification

- Automated test run: `npx vitest run tests/ai/groundedSynthesis.test.ts tests/ai/groundedTurn.test.ts` passed (48/48 tests).
