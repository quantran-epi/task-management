---
phase: quick
plan: 261006-dns
type: execute
wave: 1
depends_on: []
files_modified:
  - src/utils/docSearch.ts
  - tests/utils/docSearch.test.ts
  - src/components/notes/DocListPane.tsx
  - src/views/NotesView.tsx
  - src/views/NotesPopoutView.tsx
  - tests/views/NotesView.test.tsx
autonomous: true
requirements:
  - DOCS-BREAK-WORDS-SEARCH

must_haves:
  truths:
    - "Searching in Docs page splits multi-word search queries by whitespace into individual words and matches documents containing all words"
    - "Words in a multi-word search query can match across different fields (title, body, tags, attachments) regardless of word order"
    - "Search query matching supports case-insensitive and Vietnamese diacritic-insensitive matching (e.g. 'ke hoach' matches 'Kế hoạch')"
    - "Single-word searches and empty search queries continue to work seamlessly without regression"
  artifacts:
    - path: "src/utils/docSearch.ts"
      provides: "matchesDocSearch utility supporting multi-word breaking and diacritic-insensitive document filtering"
      exports: ["matchesDocSearch", "DocSearchFields"]
    - path: "tests/utils/docSearch.test.ts"
      provides: "Unit tests verifying broken words search, cross-field matching, out-of-order terms, diacritic normalization, and non-matches"
    - path: "src/components/notes/DocListPane.tsx"
      provides: "Updated doc list filtering using matchesDocSearch"
    - path: "src/views/NotesView.tsx"
      provides: "Updated NotesView grid filtering using matchesDocSearch with attachment and parent entity text support"
  key_links:
    - from: "src/components/notes/DocListPane.tsx"
      to: "src/utils/docSearch.ts"
      via: "matchesDocSearch import and useMemo filter"
      pattern: "matchesDocSearch(searchTerm, n)"
    - from: "src/views/NotesView.tsx"
      to: "src/utils/docSearch.ts"
      via: "matchesDocSearch import in filteredGridNotes"
      pattern: "matchesDocSearch(searchText, note"
---

<objective>
Implement broken-word (multi-word tokenized) search in the Docs page so that users searching with multiple terms (e.g., "kế hoạch 2026", "react state hook", "hướng dẫn api") find relevant documents where all terms appear across document title, body, tags, or attachments, regardless of word order or Vietnamese diacritics.

Purpose:
Currently, Docs search uses strict contiguous substring matching (`includes(q)`), causing multi-word queries to fail whenever terms appear in different fields or are separated by intervening words. Splitting queries by whitespace into words and matching each word against the document content makes search significantly more intuitive and resilient.

Output:
- `src/utils/docSearch.ts`: Reusable `matchesDocSearch` helper with whitespace word tokenization and Vietnamese diacritic normalization.
- `tests/utils/docSearch.test.ts`: Dedicated unit tests for multi-word search behaviors.
- `src/components/notes/DocListPane.tsx`: 3-column Docs list pane updated to use `matchesDocSearch`.
- `src/views/NotesView.tsx` & `src/views/NotesPopoutView.tsx`: Grid view and popout views updated to use `matchesDocSearch`.
- `tests/views/NotesView.test.tsx`: Integration tests for broken words search in the Docs view.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@src/components/notes/DocListPane.tsx
@src/views/NotesView.tsx
@src/views/NotesPopoutView.tsx
@src/utils/bm25.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create matchesDocSearch utility and unit tests for broken-words search</name>
  <files>src/utils/docSearch.ts, tests/utils/docSearch.test.ts</files>
  <behavior>
    - Empty or whitespace query returns true.
    - Query with multiple words separated by single or multiple whitespace (e.g. "design spec") matches doc where "design" is in title and "spec" is in body.
    - Matches are order-independent: "spec design" matches the same doc as "design spec".
    - Vietnamese diacritic-insensitive matching works: searching "thiet ke" or "thiết kế" matches "Thiết kế hệ thống".
    - Doc fails to match if any query word is missing from the document.
    - Matches can occur across title, body, tags, and extra texts (attachments, parent names).
  </behavior>
  <action>
    1. Create `src/utils/docSearch.ts`:
       - Import `normalizeVietnamese` from `src/utils/bm25`.
       - Define `DocSearchFields` interface with optional `title`, `body`, `tags`, `extraTexts`.
       - Implement `matchesDocSearch(query: string, docOrFields: DocSearchFields, additionalTexts?: string[]): boolean`:
         * Trim query. If empty, return `true`.
         * Split query by whitespace: `const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);`. If empty, return `true`.
         * Build aggregate raw text: title + body + tags joined + extraTexts joined.
         * Normalize raw text with `normalizeVietnamese`.
         * Use `words.every((word) => { const normWord = normalizeVietnamese(word); return rawText.includes(word) || (normWord.length > 0 && normalizedText.includes(normWord)); })`.
    2. Create `tests/utils/docSearch.test.ts`:
       - Test empty/whitespace queries.
       - Test single word matching.
       - Test multi-word matching across title and body.
       - Test word order independence.
       - Test Vietnamese diacritic matching (with/without accents).
       - Test partial match failure when one word is absent.
       - Test matching in tags and extraTexts.
  </action>
  <verify>
    <automated>npm test tests/utils/docSearch.test.ts</automated>
  </verify>
  <done>
    `matchesDocSearch` passes all unit tests covering broken-word tokenization, multi-field matching, diacritic normalization, and word presence enforcement.
  </done>
</task>

<task type="auto">
  <name>Task 2: Integrate matchesDocSearch into DocListPane, NotesView, and NotesPopoutView</name>
  <files>src/components/notes/DocListPane.tsx, src/views/NotesView.tsx, src/views/NotesPopoutView.tsx, tests/views/NotesView.test.tsx</files>
  <action>
    1. In `src/components/notes/DocListPane.tsx`:
       - Import `matchesDocSearch` from `../../utils/docSearch`.
       - Replace the existing substring filter inside `filteredAndSortedDocs` with `matchesDocSearch(searchTerm, n)`.
    2. In `src/views/NotesView.tsx`:
       - Import `matchesDocSearch` from `../utils/docSearch`.
       - In `filteredGridNotes`, update the search filter to collect attachment texts and parent name into `extraTexts` and check `matchesDocSearch(searchText, note, extraTexts)`.
    3. In `src/views/NotesPopoutView.tsx`:
       - Import `matchesDocSearch` from `../utils/docSearch`.
       - In `filteredNotes`, update the search filter to pass attachment texts to `matchesDocSearch(searchText, note, attTexts)`.
    4. In `tests/views/NotesView.test.tsx`:
       - Add integration test for broken-words search in Docs page (e.g. typing "Design Specs" or out-of-order/multi-word terms finding matching documents and excluding non-matching documents).
  </action>
  <verify>
    <automated>npm test tests/views/NotesView.test.tsx tests/views/NotesPopoutView.test.tsx</automated>
  </verify>
  <done>
    Doc list in Docs page, grid view, and popout view all use broken-word tokenized search with tests passing.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| User input -> Search filter regex/tokenization | Untrusted search string entered by user in input box |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-quick-01 | Denial of Service | `src/utils/docSearch.ts` | low | mitigate | Use simple whitespace splitting `split(/\s+/)` and `includes()` without complex backtracking regexes |
| T-quick-SC | Tampering | npm dependencies | high | mitigate | No new npm packages installed; use existing native string methods and standard project utils |
</threat_model>

<verification>
Run all relevant test suites:
- `npm test tests/utils/docSearch.test.ts`
- `npm test tests/views/NotesView.test.tsx`
- `npm test tests/views/NotesPopoutView.test.tsx`
</verification>

<success_criteria>
1. Multi-word search in Docs page breaks queries into individual words and requires all words to match across document fields.
2. Word order does not matter.
3. Diacritic-insensitive matching works for Vietnamese document text.
4. All existing notes and docs test suites pass without regression.
</success_criteria>

<output>
Create `.planning/quick/261006-dns-break-words-search-in-docs-page/261006-dns-PLAN.md`
</output>
