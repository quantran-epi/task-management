---
phase: quick
plan: 261028-gpk
type: execute
wave: 1
depends_on: []
files_modified:
  - src/views/NotesView.tsx
  - src/components/notes/NormalizeDocModal.tsx
  - tests/components/notes/NormalizeDocModal.test.tsx
autonomous: true
requirements: [261028-gpk]
must_haves:
  truths:
    - "AI_KNOWLEDGE_DOC_PROMPT forbids inventing facts, dates, tickets, sources, identifiers, relationships, examples, exceptions, and unsupported conclusions"
    - "Prompt defines explicit missing/ambiguous markers and forbids filling mandatory template sections with fabricated content"
    - "NormalizeDocModal user prompt repeats the fidelity and missing-marker requirements"
    - "Focused NormalizeDocModal test asserts the new guardrails and that the template no longer seeds fake ticket/date/identifier values"
  artifacts:
    - path: "src/views/NotesView.tsx"
      provides: "Strict source-fidelity system prompt"
      contains: "TRUNG THÀNH TUYỆT ĐỐI VỚI NGUỒN"
    - path: "src/components/notes/NormalizeDocModal.tsx"
      provides: "Strict source-fidelity user prompt"
      contains: "Không bịa hoặc suy diễn"
    - path: "tests/components/notes/NormalizeDocModal.test.tsx"
      provides: "Prompt guardrail assertions"
      contains: "TRUNG THÀNH TUYỆT ĐỐI VỚI NGUỒN"
  key_links:
    - from: "src/components/notes/NormalizeDocModal.tsx"
      to: "src/views/NotesView.tsx"
      via: "import { AI_KNOWLEDGE_DOC_PROMPT }"
      pattern: "AI_KNOWLEDGE_DOC_PROMPT"
---

<objective>
Strengthen the AI document normalization prompt against hallucination.

Purpose: the normalization prompt currently mandates filled template sections (`## Nguồn` with ticket/date, `## Ví dụ`, `## Ngoại lệ`) and shows concrete sample identifiers (`MAIN1.PKG_PAYMENT.*`, `SD-XXXXX`, `YYYY-MM-DD`). The model copies or extrapolates these, inventing facts, dates, tickets, sources, identifiers, and relationships absent from the source — polluting BM25 and Neo4j graph entities.

Output: Minimal string edits to `AI_KNOWLEDGE_DOC_PROMPT`, the `NormalizeDocModal` user prompt, and the existing focused prompt test. No UI, service, or behavior changes.
</objective>

<context>
@.planning/STATE.md
@src/views/NotesView.tsx
@src/components/notes/NormalizeDocModal.tsx
@tests/components/notes/NormalizeDocModal.test.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add strict source-fidelity rules to system and user prompts</name>
  <files>src/views/NotesView.tsx, src/components/notes/NormalizeDocModal.tsx</files>
  <action>
    Edit prompt strings only; no logic, component, export, or behavior changes. Both prompts are single template literals — preserve valid escaping (backticks inside the literal are escaped as in the current file).

    1. `src/views/NotesView.tsx` — `AI_KNOWLEDGE_DOC_PROMPT` (starts line 63):
       a. Insert a new numbered rule titled exactly `TRUNG THÀNH TUYỆT ĐỐI VỚI NGUỒN (SOURCE FIDELITY)` immediately after the opening paragraph, before the current rule 1. Renumber the existing rules 1-9 to 2-10, keeping every existing rule body intact except where (b) and (c) say otherwise. The new rule must contain:
          - Only restate information present in the source document; restructuring/formatting is allowed, adding knowledge is not.
          - Verbatim prohibition line starting `TUYỆT ĐỐI KHÔNG tự tạo hoặc suy diễn` followed by the enumerated list: sự kiện, ngày tháng/năm, mã ticket (SD-…, JIRA-…), nguồn/tài liệu tham chiếu, tên procedure/bảng/cột/package/schema, mã lỗi, mã chu kỳ, quan hệ giữa các thành phần (CALLS / INVOKES / WRITES_TO / USES_TYPE / PRECEDES), ví dụ, ngoại lệ, con số, ngưỡng, SLA, và kết luận không có câu nguồn tương ứng.
          - Missing/ambiguous rule: write `[THIẾU THÔNG TIN: <mô tả ngắn>]` or `[CHƯA XÁC MINH: <mô tả ngắn>]` in place; never substitute a guessed value.
          - No-fill rule containing the exact phrase `KHÔNG bịa nội dung để lấp chỗ trống`: template sections without source data must be omitted or kept with the missing-information marker; the template is not a mandatory checklist.
          - Traceability rule: every assertion must trace to a sentence in the source; otherwise downgrade to a `[CHƯA XÁC MINH: ...]` marker.
       b. Rule `ĐỊNH DẠNG NGÀY & NGUỒN (SOURCES)` (around line 103): keep the ISO `YYYY-MM-DD` format requirement but state dates are only copied from the source; if the source has no ticket/reference date, use the missing-information marker instead of a placeholder. Drop the instruction to always populate `## Nguồn` with ticket/procedure/date values; `## Nguồn` may be omitted or contain only the missing marker.
       c. Template block (from `MẪU KHUNG CHUẨN ĐỂ ÁP DỤNG:` around line 114):
          - Add one line directly under that heading: the block is a format skeleton only; all sample values are illustrative and MUST NOT be copied into output.
          - Keep the exact table header line `| THU_TU | TEN_BUOC | TARGET | WRITES | GHI_CHU |` unchanged (focused test depends on it).
          - Replace fabricated sample values with explicit non-real placeholders: `<tên bước từ nguồn>`, `<procedure từ nguồn, bọc backtick>`, `<bảng từ nguồn, bọc backtick>`, `<ghi chú từ nguồn>`, `<mã từ nguồn>`, `<ý nghĩa từ nguồn>`, `<hành động xử lý từ nguồn>`. Remove every concrete invented identifier from the template, including `MAIN1.PKG_PAYMENT.INIT_TXN`, `MAIN1.PKG_PAYMENT.EXECUTE_PAYMENT`, `MAIN1.PKG_SETTLEMENT.SYNC`, `MAIN1.TBL_TXN_QUEUE`, `MAIN1.TBL_PAYMENT_LOG`, `MAIN1.TBL_SETTLEMENT`, `CYTP1002`, `DAILY_CYCLE`, `SD-XXXXX`, and the status rows `00`/`05`.
          - `## Ví dụ` and `## Ngoại lệ` template bodies: only include when the source contains them; otherwise omit or use the missing marker. No generic invented example/exception text.
          - `## Nguồn` template: no fake ticket and no fake date; show the missing-marker form.
       d. Keep `${APP_NAME}` interpolation, the existing STEP_ID anti-fabrication line (`TUYỆT ĐỐI KHÔNG tự bịa hoặc tự sinh mã giả như STEP_01, STEP_02`), the 50.000-character limits, hashtags, H2/H3, security, and frontmatter rules untouched.

    2. `src/components/notes/NormalizeDocModal.tsx` — `userPrompt` (around line 102): add one numbered requirement after the existing list (renumber trailing items if needed, no other text changes). Exact required content:
       `Chỉ chuẩn hóa lại thông tin có trong nội dung gốc. Không bịa hoặc suy diễn sự kiện, ngày tháng, mã ticket, nguồn, định danh kỹ thuật, quan hệ, ví dụ, ngoại lệ hay kết luận. Thông tin thiếu hoặc mơ hồ phải ghi rõ bằng marker [THIẾU THÔNG TIN: ...] hoặc [CHƯA XÁC MINH: ...]; không điền section trống bằng nội dung tự tạo.`
       Keep the existing STEP_ID sentence and the return-only-Markdown instruction unchanged.
  </action>
  <verify>
    <automated>grep -q "TRUNG THÀNH TUYỆT ĐỐI VỚI NGUỒN" src/views/NotesView.tsx &amp;&amp; ! grep -q "MAIN1.PKG_PAYMENT.EXECUTE_PAYMENT" src/views/NotesView.tsx &amp;&amp; grep -q "Không bịa hoặc suy diễn" src/components/notes/NormalizeDocModal.tsx</automated>
  </verify>
  <done>System prompt has an explicit source-fidelity rule enumerating every prohibited invention, both markers, the no-fill rule, and the traceability rule; the date/source rule and template no longer seed fake tickets, dates, or identifiers; user prompt repeats the requirement; no logic changed.</done>
</task>

<task type="auto">
  <name>Task 2: Extend focused prompt test for fidelity guardrails</name>
  <files>tests/components/notes/NormalizeDocModal.test.tsx</files>
  <action>
    Extend the existing test `passes modernized AI_KNOWLEDGE_DOC_PROMPT with THU_TU and TEN_BUOC guidelines without mandatory STEP_ID` (around line 159). Do not add new test cases and do not touch the other tests in the file.
    - Keep all current assertions unchanged: `| THU_TU | TEN_BUOC | TARGET | WRITES | GHI_CHU |`, `THU_TU / ORDER`, `TEN_BUOC / PROCEDURE`, `TARGET`, `WRITES / GHI / TARGET_TABLE`, the STEP_01 anti-fabrication line, and the user-prompt THU_TU/TEN_BUOC and STEP_ID-omission lines.
    - Add system-prompt `toContain` assertions for: `TRUNG THÀNH TUYỆT ĐỐI VỚI NGUỒN`, `TUYỆT ĐỐI KHÔNG tự tạo hoặc suy diễn`, `[THIẾU THÔNG TIN:`, `[CHƯA XÁC MINH:`, `KHÔNG bịa nội dung để lấp chỗ trống`.
    - Add system-prompt absence assertions for the removed seeds, only values Task 1 actually deletes: `not.toContain('SD-XXXXX')`, `not.toContain('MAIN1.PKG_PAYMENT.EXECUTE_PAYMENT')`, `not.toContain('CYTP1002')`.
    - Add user-prompt assertions: `toContain('Không bịa hoặc suy diễn')`, `toContain('[THIẾU THÔNG TIN:')`.
    Use plain `toContain`, matching file style. No new mocks, renders, or imports.
  </action>
  <verify>
    <automated>npx vitest run tests/components/notes/NormalizeDocModal.test.tsx</automated>
  </verify>
  <done>Focused test asserts the fidelity rule, both markers, the no-fill instruction, absence of fabricated template seeds, and the user-prompt guard; every test in the file passes.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| source document → LLM normalization output | Incomplete/ambiguous source text; model may fabricate to satisfy template |
| LLM output → Markdown doc / BM25 index / Neo4j graph | Normalized content becomes indexed knowledge and graph entities |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-261028-gpk-01 | Tampering | `AI_KNOWLEDGE_DOC_PROMPT` output | mitigate | Explicit prohibition list for invented facts/dates/tickets/sources/identifiers/relations/examples/exceptions/conclusions plus traceability rule |
| T-261028-gpk-02 | Repudiation | fabricated provenance in `## Nguồn` | mitigate | `## Nguồn` may be omitted or use `[THIẾU THÔNG TIN: ...]`; template seeds removed |
| T-261028-gpk-03 | Information Disclosure | template sample identifiers reused as real entities | accept | Sample values become placeholders; risk is content pollution, not secret leakage (prompt carries no credentials) |
</threat_model>

<verification>
Targeted only (do not run full suite):

```
npx vitest run tests/components/notes/NormalizeDocModal.test.tsx
npx tsc --noEmit
```

Manual smoke (optional): open a note with no ticket/date metadata → AI Chuẩn hóa tài liệu → result contains `[THIẾU THÔNG TIN: ...]` markers or omits the section, with no invented dates, tickets, procedure names, or relations.
</verification>

<success_criteria>
- Prompt explicitly forbids inventing facts, dates, tickets, sources, identifiers, relationships, examples, exceptions, and unsupported conclusions.
- Prompt defines explicit missing/ambiguous markers and forbids filling mandatory template sections with fabricated content.
- Template no longer seeds fake ticket/date/identifier values; the standard step-table header is preserved.
- User prompt in `NormalizeDocModal` carries the same fidelity requirement.
- Focused test passes; TypeScript clean; diff limited to the three listed files.
</success_criteria>

<output>
Create `.planning/quick/261028-gpk-strengthen-ai-document-normalization-pro/261028-gpk-SUMMARY.md` when done.
</output>
