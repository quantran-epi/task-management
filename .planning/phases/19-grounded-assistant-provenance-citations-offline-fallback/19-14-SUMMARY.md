# Phase 19 Plan 14: AIChatDrawer Grounded Turn Wiring Summary

- **One-liner:** Grounded turn pipeline (`runGroundedTurn`, `synthesizeFromStoredEvidence`, `createFreshLookupTurn`) wired into `AIChatDrawer` with turn `AbortController` ownership, pre-synthesis model gate, `GroundedAnswerCard` branching in `ChatMessageBubble`, and 15 integration tests.
- **Phase:** 19-grounded-assistant-provenance-citations-offline-fallback
- **Plan:** 19-14
- **Date:** 2026-10-11
- **Status:** Complete

## Objectives Achieved

1. **Turn Lifecycle & Abort Ownership (AI-SPEC §4b)**:
   - Owns exactly one `AbortController` per turn stored in `currentTurnAbortRef`.
   - Previous turn controller aborted when starting a new turn.
   - Active turn aborted when drawer closes (`open === false`) or when context scope changes (`currentScope` changes).
   - Aborted turn results silently discarded without writing to Dexie.

2. **Pre-Synthesis Model Key Gate (AI-SPEC Pitfall 5 / D-43)**:
   - Evaluated `capabilities = { serverEnabled: Boolean(knowledgeConfig.enabled && knowledgeConfig.baseUrl), modelConfigured: Boolean(apiKey && config.endpoint && selectedModel) }`.
   - Submitting queries without configured model credentials no longer fails retrieval early, allowing `MODEL_UNAVAILABLE` exploration via `EvidenceOnlyCard`.

3. **Grounded Outcome Dispatch**:
   - `'operational'` -> invokes existing operational tool loop with streaming and mutation confirmation (D-08).
   - `'clarify_intent'` -> renders `IntentRoutingPrompt` for ambiguous turns with route overrides.
   - `'clarify_entity'` -> saves message with candidate chips; selecting chip re-runs turn with resolved URN.
   - `'refine'` -> saves message with refinement chips; selecting chip populates drawer input without auto-send.
   - `'grounded_answer'`, `'local_fallback_results'`, `'evidence_only'` -> saves message with structured `ChatMessageGrounding`.
   - `'error'` -> saves message with error outcome and retry CTA.

4. **Interaction & Preview Integration**:
   - `onCitationActivate` opens `QuickPreviewDrawer` with exact document ID, section anchor, line range, snapshot ID, cited excerpt, and content hash (ANSWER-07, D-10).
   - `onFreshLookup` invokes `createFreshLookupTurn` and produces a new assistant message while preserving old grounding immutable (D-49).
   - `onEvidenceOnlySynthesize` invokes `synthesizeFromStoredEvidence` and updates message grounding in place (D-44).
   - `ScopeChipsBar` rendered when latest grounded turn includes routed scope (D-15).

5. **Component Branching & Wiring**:
   - `ChatMessageBubble.tsx`: branched on `message.grounding` to render `GroundedAnswerCard` or `EvidenceOnlyCard` with slotted `GraphPathCard`, `SourcesPanel`, `DiagnosticsPanel`, and `CandidateChipList`.
   - `ChatMessageList.tsx`: forwarded `groundedCallbacks` to all message bubbles.
   - `groundedTurnDeps.ts`: provided dependency hooks for testing runtime isolation.

## Verification Results

- `tests/ai/AIChatDrawerGroundedWiring.test.tsx` (15/15 passed):
  1. Knowledge submit -> READY -> GroundedAnswerCard rendered inside drawer; abort not called.
  2. Drawer close mid-turn -> abort fires; stale response discarded.
  3. Scope change mid-turn -> previous controller aborted.
  4. Candidate chip click re-sends with resolved URN.
  5. Refinement chip click populates input without auto-send.
  6. IntentRoutingPrompt chip click re-runs turn.
  7. Fresh lookup -> old message grounding immutable; new assistant message appended.
  8. Evidence-only synthesis -> synthesizeFromStoredEvidence invoked.
  9. Citation chip click opens QuickPreviewDrawer with range focus.
  10. MODEL_UNAVAILABLE -> EvidenceOnlyCard rendered with synthesize button.
  11. INVALID_GROUNDED_OUTPUT -> error banner with retry; retry button triggers fresh run.
  12. ERROR_AUTH -> auth banner with repair CTA.
  13. Operational intent -> operational tool loop invoked; GroundedAnswerCard NOT rendered.
  14. Persisted grounded message after reload renders GroundedAnswerCard with interactive citations.
  15. ScopeChipsBar renders after routing when routedScope present.
- `tests/ai/AIChatDrawer.test.tsx` (28/28 passed).
- `tests/ai/ChatMessageBubble.test.tsx` (12/12 passed).
- `tests/db/chatRepoGrounding.test.ts` (6/6 passed).
- `npm run build` completed clean with 0 TypeScript errors.

## Key Files

- Created:
  - `src/services/ai/groundedTurnDeps.ts`
  - `tests/ai/AIChatDrawerGroundedWiring.test.tsx`
  - `.planning/phases/19-grounded-assistant-provenance-citations-offline-fallback/19-14-SUMMARY.md`
- Modified:
  - `src/components/ai/AIChatDrawer.tsx`
  - `src/components/ai/ChatInputBar.tsx`
  - `src/components/ai/ChatMessageBubble.tsx`
  - `src/components/ai/ChatMessageList.tsx`
  - `tests/ai/AIChatDrawer.test.tsx`
  - `tests/db/chatRepoGrounding.test.ts`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Matched claim text in GroundedAnswerCard test assertion**
- **Found during:** Running `AIChatDrawerGroundedWiring.test.tsx`.
- **Issue:** Test asserted conclusion text was rendered when claims were present; `GroundedAnswerCard` renders `claim.text` via `ClaimBlock` when claims exist.
- **Fix:** Updated test assertion to check for `claim.text` (`Khách hàng xác thực OTP qua SMS.`).
- **Files modified:** `tests/ai/AIChatDrawerGroundedWiring.test.tsx`.

**2. [Rule 1 - Bug] External input population via ChatInputBar state hook**
- **Found during:** Running test 5 (refinement chip input population).
- **Issue:** Ant Design `Mentions` input does not re-render from manual `DOM.value = text` assignment without an external value prop.
- **Fix:** Added `externalValue` and `onExternalValueConsumed` to `ChatInputBar` and wired from `AIChatDrawer`.
- **Files modified:** `src/components/ai/ChatInputBar.tsx`, `src/components/ai/AIChatDrawer.tsx`.

## Self-Check: PASSED
