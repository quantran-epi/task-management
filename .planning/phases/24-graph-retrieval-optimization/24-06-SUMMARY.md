---
phase: 24-graph-retrieval-optimization
plan: 06
subsystem: client/ai-chat-ui
tags: [seed-only, ui, diagnostics, accessibility, find-related, sc-6]
requires:
  - 24-04
  - 24-05
provides:
  - "Accessible SeedEntityCard with separate counts and explicit find-related CTA"
  - "Fixed enum→Vietnamese ReasonCodeChip with safe unknown fallback"
  - "PartialSeedNotice for dropped seeds"
  - "Content-free StageDiagnosticsList with truncation/fallback flags"
  - "GroundedAnswerCard SEED_ONLY branch"
  - "Persisted-message entity/diagnostic wiring"
  - "AIChatDrawer.handleFindRelated one-new-turn action"
affects:
  - src/components/ai/grounded/SeedEntityCard.tsx
  - src/components/ai/grounded/ReasonCodeChip.tsx
  - src/components/ai/grounded/PartialSeedNotice.tsx
  - src/components/ai/grounded/StageDiagnosticsList.tsx
  - src/components/ai/grounded/GroundedAnswerCard.tsx
  - src/components/ai/grounded/DiagnosticsPanel.tsx
  - src/components/ai/ChatMessageBubble.tsx
  - src/components/ai/AIChatDrawer.tsx
tech-stack:
  added: []
  patterns:
    - "Bounded entity list mapped from persisted grounding, never derived from answer/citations"
    - "Enum-only diagnostic rendering; no free-text or arbitrary-key iteration"
    - "Fixed query template routed through the existing send path as a new immutable turn"
    - "Per-source pending key guards duplicate CTA requests"
key-files:
  created:
    - src/components/ai/grounded/SeedEntityCard.tsx
    - src/components/ai/grounded/ReasonCodeChip.tsx
    - src/components/ai/grounded/PartialSeedNotice.tsx
    - src/components/ai/grounded/StageDiagnosticsList.tsx
    - tests/ai/SeedEntityCard.test.tsx
  modified:
    - src/components/ai/grounded/GroundedAnswerCard.tsx
    - src/components/ai/grounded/DiagnosticsPanel.tsx
    - src/components/ai/ChatMessageBubble.tsx
    - src/components/ai/AIChatDrawer.tsx
    - tests/ai/GroundedAnswerCard.test.tsx
    - tests/ai/ChatMessageBubble.test.tsx
    - tests/ai/AIChatDrawerGroundedWiring.test.tsx
decisions:
  - "SeedEntityCard.tsx chosen over PATTERNS.md's conditional EntityCard.tsx per approved UI-SPEC"
  - "GroundedAnswerCard falls back to grounding.graphCounts when the graphCounts prop is absent"
  - "PartialSeedNotice renders whenever failed seeds exist; diagnostics callback opens the in-card Collapse as well as any parent handler"
  - "Unknown reason codes render the raw code plus a fixed generic explanation, never server text"
  - "Find-related dispatches one fixed Vietnamese query through handleSendMessage; original message object is never touched"
metrics:
  duration: 39m
  completed: 2026-10-24
---

# Phase 24 Plan 06: Seed-Only AI Chat Surface and Explicit Find-Related Turns Summary

A resolved seed now renders as an accessible entity card with separate counts, dropped seeds stay visible beside valid evidence, stage diagnostics disclose truncation/fallback without content, and `Tìm liên quan` appends exactly one fixed new turn while the original message stays byte-for-byte unchanged.

## Objective

The retrieval pipeline (24-04, 24-05) already produced `SEED_ONLY` grounding with entities, counts, stage diagnostics, and failed seeds, but no UI consumed them: the chat surface had no entity cards, no partial-failure disclosure, no stage rows, and no explicit broadening action (D-02, D-03, D-04, D-13, D-19, SC-6).

## What Was Built

### New components (`src/components/ai/grounded/`)

- **`SeedEntityCard.tsx`** — canonical name as React text, localized kind tag (`DatabaseObject` → `Đối tượng dữ liệu`, etc.), URN in `<code>`, optional evidence-class tag, a single `aria-label`ed counts line (`Thực thể: N · Cạnh: N · Đường dẫn: N`), and the exact `Tìm liên quan` primary button. The card's own `aria-label` combines localized kind, name, and URN; the button carries `loading`/`disabled` while pending. No `dangerouslySetInnerHTML`.
- **`ReasonCodeChip.tsx`** — fixed 17-entry enum→Vietnamese explanation map from 24-UI-SPEC, exported for reuse. Unknown codes render the raw code plus `Không có mô tả cho mã này.` Each chip has `aria-label="{CODE}: {explanation}"`.
- **`PartialSeedNotice.tsx`** — `role="status"` surface with exact partial-failure copy, up to five URNs as text, one reason chip per entry, and `Xem chi tiết chẩn đoán`.
- **`StageDiagnosticsList.tsx`** — six fixed stage labels, status tag, latency, accepted/rejected, explicit `Đã cắt bớt` / `Dùng phạm vi dự phòng` indicators, and reason chips. `fallbackReason` is rendered only when `fallback` is true and not already in `reasonCodes`. Props accept only typed `StageDiagnostic[]`.

### Extensions

- **`DiagnosticsPanel.tsx`** — optional `graphCounts`, `stages`, `graphBeforeFusion`, `graphAfterFusion`, and `forceOpen`. Stage rows appear as a `Chi tiết theo bước` description entry; before/after fusion counts render as separate rows. Existing sanitized coverage warnings unchanged.
- **`GroundedAnswerCard.tsx`** — new `case 'SEED_ONLY'` before the unsupported/READY branches: `colorInfo`-bordered card, `Đã tìm thấy thực thể` display title, existence-only limited copy interpolating the first canonical name, counts line, `PartialSeedNotice` when failures exist, entity stack slot, and Sources/Diagnostics collapses. No degraded banner, conflict banner, confidence tag, refinement chips, or no-evidence copy. New props: `entitiesSlot`, `failedSeeds`, `graphCounts`, `onOpenDiagnostics`.
- **`ChatMessageBubble.tsx`** — maps up to five `grounding.entities` into `SeedEntityCard`s, forwarding `graphCounts`, `failedSeeds`, `stageDiagnostics`, and a callback carrying `(entity, msg.id)`. Identity comes only from persisted grounding; nothing is mutated. New callback fields: `onFindRelated`, `findingRelatedKey`.
- **`AIChatDrawer.tsx`** — `handleFindRelated(entity, sourceMessageId)` builds `Tìm mọi quan hệ liên quan đến ${canonicalName}` and routes it through the existing `handleSendMessage`, so one new turn, one request, one AbortController. A ref plus `findingRelatedKey` state suppress repeated clicks while pending and clear on completion.

### Tests

- `tests/ai/SeedEntityCard.test.tsx` (new, 6 tests): identity/counts, aria-label and keyboard reachability, callback/loading, escaped markup + source scan for `dangerouslySetInnerHTML`, fixed vs unknown reason codes, partial-notice cap at five.
- `tests/ai/GroundedAnswerCard.test.tsx` (+6 tests, 32–37): stage rows, truncation/fallback flags, counts + before/after fusion with no free-text leak, SEED_ONLY required elements, SEED_ONLY omissions, and schema-parsed SEED_ONLY fixture.
- `tests/ai/ChatMessageBubble.test.tsx` (+4 tests): persisted seed-only rendering, historical grounding without Phase 24 fields, exact `(entity, sourceMessageId)` callback, per-entity pending disable.
- `tests/ai/AIChatDrawerGroundedWiring.test.tsx` (+4 tests): fixed query + new user turn, original message/grounding JSON equality, duplicate-click suppression, unchanged manual send.

## Verification

```
npx vitest run tests/ai/SeedEntityCard.test.tsx tests/ai/GroundedAnswerCard.test.tsx \
  tests/ai/ChatMessageBubble.test.tsx tests/ai/AIChatDrawerGroundedWiring.test.tsx
→ 4 files, 90 tests passed, 1 skipped (pre-existing skip)

npx tsc --noEmit
→ exit 0

grep -rn "dangerouslySetInnerHTML" src/components/ai/grounded/SeedEntityCard.tsx \
  src/components/ai/grounded/ReasonCodeChip.tsx \
  src/components/ai/grounded/PartialSeedNotice.tsx src/components/ai/grounded/StageDiagnosticsList.tsx
→ no matches
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Node `fileURLToPath` resolved test source paths from `D:\src`**
- **Found during:** Task 1
- **Issue:** `new URL('../../src/...', import.meta.url)` produced an absolute `D:\src\...` path on Windows, so the source scan threw `ENOENT`.
- **Fix:** Resolve from `process.cwd()` instead.
- **Files modified:** `tests/ai/SeedEntityCard.test.tsx`
- **Commit:** a01a3be

**2. [Rule 3 - Blocking] SEED_ONLY card read an empty count object**
- **Found during:** Task 2
- **Issue:** The card defaulted `graphCounts` to zeros instead of reading the persisted `grounding.graphCounts`, so a card rendered from real grounding showed `Thực thể: 0`.
- **Fix:** Fall back to `grounding.graphCounts` before the zero default.
- **Files modified:** `src/components/ai/grounded/GroundedAnswerCard.tsx`
- **Commit:** 4b2256d

**3. [Rule 2 - Missing critical functionality] Partial-notice diagnostics link had no effect when no parent handler existed**
- **Found during:** Task 2
- **Issue:** The notice only called the parent callback, so the in-card diagnostics collapse never opened from `Xem chi tiết chẩn đoán`.
- **Fix:** The card now owns a `seedDiagnosticsOpen` state, opens its `diagnostics` collapse, and additionally invokes the parent callback.
- **Files modified:** `src/components/ai/grounded/GroundedAnswerCard.tsx`, `src/components/ai/ChatMessageBubble.tsx`, `src/components/ai/grounded/DiagnosticsPanel.tsx`
- **Commit:** 8fba46e

**4. [Rule 1 - Bug] Duplicate counts text broke `getByText` in the bubble test**
- **Found during:** Task 3
- **Issue:** Counts render both on the card and on each entity card, so a singular matcher found multiple nodes.
- **Fix:** Assert `getAllByLabelText(...)` length instead.
- **Files modified:** `tests/ai/ChatMessageBubble.test.tsx`
- **Commit:** 8fba46e

## Deferred Issues

- `synthesizeFromStoredEvidence` still does not rehydrate `entities`/`graphCounts` (carried from 24-05). A seed-only history retry would render the card without entity details.
- The `AIChatDrawer` find-related flow does not persist a pending marker across drawer remounts; suppression is per mounted drawer instance.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model. All new DOM content is React text/`code` nodes from persisted enums; diagnostics render typed fields only; find-related dispatches a fixed local template through the existing validated send path.

## Self-Check: PASSED

- Created files verified on disk: `SeedEntityCard.tsx`, `ReasonCodeChip.tsx`, `PartialSeedNotice.tsx`, `StageDiagnosticsList.tsx`, `tests/ai/SeedEntityCard.test.tsx`.
- Commits verified: 4429641, a01a3be, 1e376e2, 4b2256d, 0c2534f, 8fba46e.
- Targeted suite: 90 passed, 1 skipped; `tsc --noEmit` exit 0.
