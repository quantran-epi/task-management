---
status: resolved
trigger: "github build failed in NotesView.test.tsx broken-words search test"
created: 2026-10-06T07:30:00Z
updated: 2026-10-06T07:42:00Z
---

## Current Focus

hypothesis: Worker search filtering or fallback in useDocWorkerSearch/DocListPane fails to clear stale matchIds or fails during negative search in test environment.
test: npx vitest run tests/views/NotesView.test.tsx -t "supports broken-words and diacritic-insensitive search in Docs list pane"
expecting: negative search excludes all non-matching docs and element is not in document
next_action: resolved

## Symptoms

expected: In NotesView Docs list pane, searching for non-matching query "ke hoach khongtontai" should filter out "Kế hoạch phát triển 2026".
actual: Element <span style="font-weight: 600; font-size: 13px; color: rgb(79, 70, 229)...">Kế hoạch phát triển 2026</span> is still present in document, causing expect(element).not.toBeInTheDocument() to fail.
errors: "Error: expect(element).not.toBeInTheDocument() expected document not to contain element, found <span style=\"font-weight: 600; font-size: 13px; color: rgb(79, 70, 229); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;\">Kế hoạch phát triển 2026</span> instead"
reproduction: npx vitest run tests/views/NotesView.test.tsx -t "supports broken-words and diacritic-insensitive search in Docs list pane"
started: After commit b62f116 (feat(notes): offload document search filtering to web worker)

## Evidence

- timestamp: 2026-10-06T07:32:00Z
  action: reproduction run
  observation: NotesView.test.tsx failed when searching 'ke hoach khongtontai' because 'Kế hoạch phát triển 2026' remained in document.
- timestamp: 2026-10-06T07:35:00Z
  action: inspected DocListPane.tsx and useDocWorkerSearch.ts
  observation: DocListPane useMemo omitted matchIds from its dependency array [notes, searchTerm, sortBy], keeping stale matchIds when worker/fallback resolved.
- timestamp: 2026-10-06T07:36:00Z
  action: added matchIds to useMemo dependency array in DocListPane.tsx
  observation: NotesView.test.tsx passed all 9 tests. Added regression test in useDocWorkerSearch.test.ts verifying query changes to negative search.

## Resolution

root_cause: In DocListPane.tsx, the useMemo hook calculating filteredAndSortedDocs omitted matchIds from its dependency array [notes, searchTerm, sortBy], preventing recalculation when search worker or fallback updated matchIds.
fix: Added matchIds to useMemo dependency array in DocListPane.tsx and added regression test in useDocWorkerSearch.test.ts.
prevention: why not caught: missing react-hooks/exhaustive-deps lint check on DocListPane; guard: include all hook state variables consumed inside useMemo in dependency array.
