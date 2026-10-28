---
phase: quick
plan: 261028-gpk
subsystem: ai-document-normalization
tags: [prompt-engineering, anti-hallucination, notes]
requirements: [261028-gpk]
key-files:
  created: []
  modified:
    - src/views/NotesView.tsx
    - src/components/notes/NormalizeDocModal.tsx
    - tests/components/notes/NormalizeDocModal.test.tsx
decisions:
  - Placeholder-only sample values in the normalization template; no concrete identifiers remain.
metrics:
  duration: ~10m
  completed: 2026-10-28
  tasks: 2
  files: 3
---

# Quick 261028-gpk: Strengthen AI document normalization prompt Summary

Added an explicit source-fidelity contract to `AI_KNOWLEDGE_DOC_PROMPT` and the NormalizeDocModal user prompt, and replaced all fabricated template sample values with explicit placeholders so the model cannot copy invented tickets, dates, identifiers, relationships, examples, or exceptions into normalized knowledge documents.

## What Changed

### `src/views/NotesView.tsx` — `AI_KNOWLEDGE_DOC_PROMPT`

- New rule 1 `TRUNG THÀNH TUYỆT ĐỐI VỚI NGUỒN (SOURCE FIDELITY)`:
  - restate-only rule; no added knowledge
  - `TUYỆT ĐỐI KHÔNG tự tạo hoặc suy diễn` enumerated prohibition (facts, dates, tickets `SD-…`/`JIRA-…`, sources, procedure/table/column/package/schema names, error codes, cycle codes, relations `CALLS / INVOKES / WRITES_TO / USES_TYPE / PRECEDES`, examples, exceptions, numbers, thresholds, SLA, unsupported conclusions)
  - missing markers `[THIẾU THÔNG TIN: ...]` / `[CHƯA XÁC MINH: ...]`
  - no-fill rule `KHÔNG bịa nội dung để lấp chỗ trống` — template is a format skeleton, not a mandatory checklist
  - traceability rule: every assertion must trace to a source sentence
- Rules renumbered 1-9 → 2-10; existing rule bodies preserved.
- Rule `ĐỊNH DẠNG NGÀY & NGUỒN (SOURCES)`: dates copied from source only; `## Nguồn` may be omitted or hold only the missing marker.
- Technical-identifier rule examples replaced with `<schema.package.procedure từ nguồn>` / `<schema.table từ nguồn>`; cycle-code example replaced with `<mã chu kỳ từ nguồn>`.
- Template block: heading notes it is a format skeleton whose samples must not be copied; step/status tables use `<... từ nguồn>` placeholders; `## Ví dụ` / `## Ngoại lệ` only when the source has them; `## Nguồn` shows the missing-marker form.
- Untouched: `${APP_NAME}` interpolation, STEP_ID anti-fabrication line, 50.000-char limits, hashtags, H2/H3, security, YAML frontmatter rules, `| THU_TU | TEN_BUOC | TARGET | WRITES | GHI_CHU |` header.

### `src/components/notes/NormalizeDocModal.tsx` — user prompt

- Inserted requirement 5 with the exact source-fidelity / marker / no-fill text from the plan; former item 5 renumbered to 6. STEP_ID sentence and return-only-Markdown instruction unchanged.

### `tests/components/notes/NormalizeDocModal.test.tsx`

- Extended existing prompt-contract test only. Added `toContain` assertions for `TRUNG THÀNH TUYỆT ĐỐI VỚI NGUỒN`, `TUYỆT ĐỐI KHÔNG tự tạo hoặc suy diễn`, `[THIẾU THÔNG TIN:`, `[CHƯA XÁC MINH:`, `KHÔNG bịa nội dung để lấp chỗ trống`; absence assertions for `SD-XXXXX`, `MAIN1.PKG_PAYMENT.EXECUTE_PAYMENT`, `CYTP1002`; user-prompt assertions for `Không bịa hoặc suy diễn` and `[THIẾU THÔNG TIN:`.

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `npx vitest run tests/components/notes/NormalizeDocModal.test.tsx` → 5/5 passed (1 file).
- `npx tsc --noEmit` → exit 0, no diagnostics.

## Notes

`RECOMMENDED_DOC_TEMPLATE` (separate export, not the AI prompt) still contains illustrative `MAIN1.*` rows. Out of plan scope; unchanged.

No commits made (parent orchestrator owns repository state). STATE.md / ROADMAP.md not updated per execution constraints.
