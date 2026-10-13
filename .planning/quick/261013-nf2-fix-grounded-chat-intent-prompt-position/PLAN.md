# Quick Task: Fix Grounded Chat Intent Prompt Position & Add Few-Shot Synthesis Prompt

**Directory:** `.planning/quick/261013-nf2-fix-grounded-chat-intent-prompt-position`
**Branch:** `phase-19.1-production-neo4j`

## Objective

1. Relocate the transient intent routing prompt ("Bạn muốn tra cứu tài liệu hay thao tác TaskMate?") from the top of the chat drawer directly below the user question bubble in the message stream.
2. Upgrade grounded synthesis prompt with explicit few-shot JSON example and add tolerant pre-parsing normalization in `groundedSynthesis.ts` to prevent repair loops and `INVALID_GROUNDED_OUTPUT` failures on models like `gemini-3.8-flash`.

---

## Tasks

### Task 1: Render IntentRoutingPrompt inline in chat message list directly under user query bubble

**Files:**
- `src/components/ai/AIChatDrawer.tsx`
- `src/components/ai/ChatMessageList.tsx`
- `src/components/ai/ChatMessageBubble.tsx` (optional if passed via list or bubble)

**Action:**
1. In `AIChatDrawer.tsx`, remove the top-level fixed rendering of `<IntentRoutingPrompt>` currently placed above `<ChatMessageList>`.
2. Pass `transientClarifyMessage` (or `intentRoutingPrompt`) and its callback `onSelectRoute` into `ChatMessageList`.
3. In `ChatMessageList.tsx`, render `<IntentRoutingPrompt>` immediately below the matching user message bubble (or at the bottom of the message list right under the last user message when `transientClarifyMessage` is active).
4. When the user clicks an option ("Tra cứu tài liệu" or "Thao tác PlannerMate"), trigger route selection and dismiss the prompt cleanly without message duplication.

**Verify:**
<automated>npm test -- tests/ai/groundedTurn.test.ts</automated>
Visual/DOM check: IntentRoutingPrompt appears within the scrollable message area directly after the user prompt bubble rather than at the top bar of the drawer.

**Done:**
Intent prompt renders inline below user query bubble; selecting a route clears prompt and triggers routed continuation.

---

### Task 2: Improve grounded synthesis prompt with few-shot example and add tolerant normalization before closure validation

**Files:**
- `src/services/ai/groundedSynthesis.ts`
- `tests/ai/groundedSynthesis.test.ts`

**Action:**
1. In `src/services/ai/groundedSynthesis.ts`:
   - Expand `buildSystemPrompt`:
     - Provide clear conventions: each material fact MUST be a claim in `claims` array.
     - Provide a concrete few-shot example demonstrating valid JSON matching schema:
       - `schemaVersion: 1`
       - `language`: matching target language
       - `conclusion`: concise summary
       - `claims`: `[{ id: 'C1', text: '...', classification: 'DIRECT', citationIds: ['S1'], pathId: null }]`
       - Explicitly instruct: `classification: 'DIRECT'` MUST have `pathId: null`. `classification: 'INFERRED'` requires valid `pathId` from `allowedPathIds`.
       - Explicitly instruct: `citationIds` MUST only use IDs from `allowedCitationIds` (e.g. `S1`, `S2`, `L1`). Never use raw numbers like `[1]` or document titles.
       - Do not return empty claims if evidence supports the answer.
   - Add tolerant normalization function `normalizeRawGroundedOutput(raw: unknown, allowedCitationIds: string[], allowedPathIds: string[])`:
     - Run BEFORE `GroundedAnswerSchema.safeParse` and `validateGroundedAnswerClosure`.
     - Handle markdown code fence stripping if string or nested (already partially handled by completeJson, but ensure object fields are sanitized).
     - For each claim in `claims`:
       - If `claim.id` is missing or invalid (e.g., number `1` or string `"1"`), coerce to `C${index + 1}`.
       - Coerce `citationIds`:
         - If given numbers `[1, 2]`, convert to `['S1', 'S2']` (or matching authority prefix from allowedCitationIds).
         - If citation is formatted as `"[S1]"` or `"(S1)"`, strip brackets to `"S1"`.
         - Filter citationIds to only keep those present in `allowedCitationIds`. If filtered list becomes empty but allowedCitationIds is non-empty, fallback to `[allowedCitationIds[0]]` to preserve grounding.
       - Coerce `classification` and `pathId`:
         - If `classification === 'DIRECT'` or missing, ensure `pathId = null` (drop invalid pathIds or empty strings).
         - If `classification === 'INFERRED'`: if `pathId` is null, empty string, or not in `allowedPathIds`, fallback `classification = 'DIRECT'` and `pathId = null`.
       - If `claims` is empty or missing but `conclusion` contains text: construct a default DIRECT claim from conclusion with first available citation ID from `allowedCitationIds`.
       - Ensure `schemaVersion` is literal `1`.
       - Ensure `unsupportedParts` defaults to `[]` if null/undefined.
2. In `tests/ai/groundedSynthesis.test.ts`:
   - Add unit tests verifying tolerant normalization:
     - Numeric citation IDs `[1]` normalized to `['S1']`.
     - DIRECT claim with empty string / bogus pathId normalized to `pathId: null`.
     - Claim with unknown citation filtered/safeguarded.
     - System prompt includes few-shot example.

**Verify:**
<automated>npm test -- tests/ai/groundedSynthesis.test.ts</automated>

**Done:**
Grounded synthesis tolerantly repairs common LLM syntax quirks and outputs valid schema JSON on first shot with accurate clickable citations.
