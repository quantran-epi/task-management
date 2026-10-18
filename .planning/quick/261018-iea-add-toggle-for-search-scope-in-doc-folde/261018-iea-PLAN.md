---
phase: quick
plan: 261018-iea
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/notes/DocFolderTree.tsx
  - tests/components/notes/DocFolderTree.test.tsx
autonomous: true
requirements:
  - QUICK-DOC-SEARCH-SCOPE
must_haves:
  truths:
    - "User can toggle search scope between all documents and active folder in DocFolderTree"
    - "When search scope is all, search returns matching documents across all folders"
    - "When search scope is active folder, search returns only matching documents within the active folder hierarchy"
  artifacts:
    - path: "src/components/notes/DocFolderTree.tsx"
      provides: "Search scope toggle UI and scoped search results filtering"
    - path: "tests/components/notes/DocFolderTree.test.tsx"
      provides: "Automated unit tests verifying scope toggle and filtered search behavior"
  key_links:
    - from: "src/components/notes/DocFolderTree.tsx"
      to: "useDocWorkerSearch"
      via: "filtering matchIds against active folder descendants when scope is active folder"
---

<objective>
Add a search scope toggle (all documents vs active folder) in DocFolderTree to allow users to constrain doc search either across the entire vault or within the currently selected folder and its subfolders.

Purpose: Improve search precision when working in large knowledge hierarchies with many documents.
Output: Search scope Segmented toggle in DocFolderTree and unit test coverage.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/components/notes/DocFolderTree.tsx
@tests/components/notes/DocFolderTree.test.tsx
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add search scope toggle UI and scoped filtering logic in DocFolderTree</name>
  <files>src/components/notes/DocFolderTree.tsx</files>
  <behavior>
    - User sees an Ant Design Segmented control below or alongside the search input with options "Tất cả" (all) and "Thư mục hiện tại" (active folder).
    - When search scope is "all" (default), searchResults includes all matched documents regardless of folder location.
    - When search scope is "active folder", searchResults filters matched documents to only those belonging to the active folder hierarchy (the folder itself and all nested descendant subfolders), or the active special category (e.g. root docs, quick notes, pinned, trash).
    - If user changes the active folder while searching in "active folder" scope, the search results immediately re-filter to the new folder.
    - Results header displays the active scope indication when filtered by folder.
  </behavior>
  <action>
    In src/components/notes/DocFolderTree.tsx:
    1. Import Segmented from 'antd'.
    2. Add state `searchScope` of type `'all' | 'folder'`, defaulting to `'all'`.
    3. Compute active folder entity and descendant folder IDs via useMemo (`activeFolderDescendantIds`):
       - If `activeFilter` matches a note with `type === 'folder'`, collect its ID and recursively all descendant child folder IDs into a Set.
       - Also derive a human-friendly label/title for the active scope for tooltips or headers (e.g. active folder title or special category name).
    4. In the Search Bar section (around lines 810-820):
       - Add a compact `<Segmented size="small" block value={searchScope} onChange={setSearchScope} ... />` control with options:
         - `{ label: 'Tất cả', value: 'all' }`
         - `{ label: 'Thư mục hiện tại', value: 'folder' }` (wrapped with Tooltip indicating current folder/category name).
    5. In `searchResults` useMemo:
       - When `searchScope === 'folder'`, filter `docs` to only documents belonging to the active scope:
         - If `activeFolderDescendantIds` exists: `doc.parentId && activeFolderDescendantIds.has(doc.parentId)`
         - If `activeFilter === 'root_docs'`: `!doc.parentId && doc.type === 'document' && !doc.deletedAt`
         - If `activeFilter === 'quick_notes'`: `doc.type === 'quick_note' && !doc.deletedAt`
         - If `activeFilter === 'pinned'`: `doc.isPinned && doc.type !== 'folder' && !doc.deletedAt`
         - If `activeFilter === 'trash'`: `Boolean(doc.deletedAt) && doc.type !== 'folder'`
    6. In search results header (`KẾT QUẢ TÌM KIẾM`), display the active scope (e.g. `KẾT QUẢ TÌM KIẾM ({count}) • Thư mục: {name}` when in folder scope).
  </action>
  <verify>
    <automated>npm run test -- tests/components/notes/DocFolderTree.test.tsx</automated>
  </verify>
  <done>DocFolderTree provides a functional Segmented toggle between All and Active Folder, correctly filtering search results.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Add unit tests for search scope toggle and scoped search filtering</name>
  <files>tests/components/notes/DocFolderTree.test.tsx</files>
  <behavior>
    - Test 1: Verify Segmented toggle renders options "Tất cả" and "Thư mục hiện tại".
    - Test 2: In "Tất cả" scope, search query matches documents across different folders.
    - Test 3: Switching to "Thư mục hiện tại" filters search results to only documents within the active folder hierarchy, excluding documents in other folders and root.
    - Test 4: Nested subfolder documents inside the active folder are included when searching in "Thư mục hiện tại".
  </behavior>
  <action>
    In tests/components/notes/DocFolderTree.test.tsx:
    1. Create mock notes containing:
       - Root document (no parentId)
       - Folder A with Document A1
       - Subfolder A_sub (nested under Folder A) with Document A_sub1
       - Folder B with Document B1
    2. Add test verifying Segmented control renders with "Tất cả" and "Thư mục hiện tại".
    3. Add test verifying that when searching for common keyword in "Tất cả", documents from Folder A, Subfolder A_sub, and Folder B appear.
    4. Add test verifying that when activeFilter is Folder A and user clicks "Thư mục hiện tại", only Document A1 and Document A_sub1 appear, while Document B1 is excluded.
    5. Ensure all existing tests in DocFolderTree.test.tsx continue to pass without regression.
  </action>
  <verify>
    <automated>npm run test -- tests/components/notes/DocFolderTree.test.tsx</automated>
  </verify>
  <done>All tests in DocFolderTree.test.tsx pass, verifying search scope toggle behavior and edge cases.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Client UI state -> In-memory search results | User search input and scope selection filter local note references |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-QUICK-01 | Tampering | DocFolderTree.tsx search filtering | mitigate | Safe null checks on parentId, defensive Set lookup, no eval or dynamic regex |
| T-QUICK-02 | Information Disclosure | DocFolderTree.tsx trash vs active scope | mitigate | Ensure deleted notes in trash are excluded from active folder searches unless trash is explicitly the active category |
</threat_model>

<verification>
Run test suite to verify component behavior:
```bash
npm run test -- tests/components/notes/DocFolderTree.test.tsx
```
</verification>

<success_criteria>
- DocFolderTree renders search scope toggle ("Tất cả" vs "Thư mục hiện tại").
- Switching scope instantly filters search results between global vault and active folder subtree.
- Automated tests verify scope toggle, active folder filtering, and subfolder inclusion.
</success_criteria>

<output>
Create `.planning/quick/261018-iea-add-toggle-for-search-scope-in-doc-folde/261018-iea-SUMMARY.md` when execution completes.
</output>
