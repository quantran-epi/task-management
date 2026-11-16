---
phase: quick-261116-fyi
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/views/NotesView.tsx
  - src/workbench/toolwindows/DocsExplorer.tsx
  - src/utils/exportFolderZip.ts
  - src/views/__tests__/NotesViewWorkbench.test.tsx
  - src/workbench/__tests__/DocsExplorerZip.test.tsx
autonomous: true
must_haves:
  truths:
    - "Workbench Docs tab (NotesView with hideFolderTree) shows a compact toolbar with Bộ tài liệu, Nhập Zip and Prompt AI buttons"
    - "Clicking Bộ tài liệu in the workbench toolbar opens the existing DocumentSetDrawer ('Bộ tài liệu xuất bản'), which hosts Knowledge Server publish and knowledge-graph build"
    - "Clicking Nhập Zip in the workbench toolbar opens the existing ZipImportPreviewModal and imports selected docs into the active folder via batchCreateNotes"
    - "Every folder row menu in the Docs Explorer tool window offers 'Tải thư mục (ZIP)' and downloads a ZIP produced by exportFolderAsZip"
    - "Non-workbench NotesView (App.tsx hash route, hideFolderTree=false) is unchanged and still renders the PageHeader"
  artifacts:
    - "src/views/__tests__/NotesViewWorkbench.test.tsx"
    - "src/workbench/__tests__/DocsExplorerZip.test.tsx"
  key_links:
    - "NotesView stays the single owner of documentSet, zip-import, AI-prompt and publish dialog state; the compact toolbar reuses the same state setters — no second dialog stack in DocsExplorer"
    - "DocsExplorer's folder download calls downloadFolderAsZip from src/utils/exportFolderZip.ts; both NotesView and DocsExplorer share the one zip builder"
    - "DocumentSetDrawer, PublishPreviewModal, ZipImportPreviewModal, the hidden zip file input and the AI prompt Modal remain mounted unconditionally at NotesView's bottom — only the header triggers were gated by hideFolderTree"
---

<objective>
Restore three Docs features that disappeared in IntelliJ/workbench mode: ZIP import, folder ZIP export, and the "Bộ tài liệu" Document Sets drawer (Knowledge Server publish + build knowledge graph).

Root cause (verified): `src/workbench/EditorArea.tsx:577` renders `<NotesView hideFolderTree={true}>`; NotesView gates its PageHeader (Bộ tài liệu / Prompt AI buttons) on `!hideFolderTree`, so the drawer and modals stay mounted but unreachable. `src/workbench/toolwindows/DocsExplorer.tsx` renders `<DocFolderTree>` without `onOpenZipImport` / `onDownloadFolder`, so the upload button and "Tải thư mục (ZIP)" menu item vanish there too.

Purpose: one compact trigger surface in NotesView reuses every existing dialog; DocsExplorer wires only the folder-download callback it alone can target.
Output: workbench toolbar in NotesView, folder ZIP export in DocsExplorer, shared download helper, two focused tests. No new components, no new dependencies, no Dexie schema change.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@src/views/NotesView.tsx
@src/workbench/toolwindows/DocsExplorer.tsx
@src/utils/exportFolderZip.ts
@src/components/notes/DocFolderTree.tsx
@src/components/notes/ZipImportPreviewModal.tsx
@src/workbench/EditorArea.tsx
</context>

<read_first>
- `src/views/NotesView.tsx` lines 212-228 (`NotesViewProps`, `hideFolderTree` default), 1024-1056 (header gated on `!hideFolderTree`), 891-933 (zip import state: `zipImportModalOpen`, `selectedZipFile`, `zipFileInputRef`, `handleOpenZipImport`, `handleZipFileSelected`, `handleBatchImportDocs`, `availableFolders`), 994-1004 (`handleDownloadFolder`), 1182-1218 (`DocumentSetDrawer` + `PublishPreviewModal`, unconditional), 1279-1300 (hidden zip file input + `ZipImportPreviewModal`, unconditional)
- `src/workbench/toolwindows/DocsExplorer.tsx` lines 26-45 (`useLiveQuery` for `allNotes`), 365-391 (`<DocFolderTree>` props — no `onOpenZipImport`, no `onDownloadFolder`)
- `src/components/notes/DocFolderTree.tsx` lines 47-66 (optional `onOpenZipImport`, `onDownloadFolder` props), 761-770 (download menu item), 1058-1066 (upload CTA button)
- `src/utils/exportFolderZip.ts` lines 61-105 (`exportFolderAsZip(rootFolder, allNotes)` — pure, no antd feedback)
- `src/workbench/EditorArea.tsx` line 577 (`<NotesView ... hideFolderTree={true} />`)
- `src/db/repositories/__tests__/noteRepo.test.ts` lines 1-25 — test bootstrap pattern (`fake-indexeddb/auto` via `tests/setup.ts`, `new TaskPlannerDatabase('TestDB_' + Math.random())`, `createNote`)
- `src/workbench/__tests__/Explorers.test.tsx` lines 1-20 — note that it mocks `dexie-react-hooks` with an empty array, so the new DocsExplorer test must NOT copy that mock; pass a real seeded `db` prop instead
- `src/views/__tests__/MermaidAssistantView.test.tsx` — existing views test conventions
</read_first>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Workbench Docs parity — compact toolbar, ZIP import, folder ZIP export</name>
  <files>src/utils/exportFolderZip.ts, src/views/NotesView.tsx, src/workbench/toolwindows/DocsExplorer.tsx, src/views/__tests__/NotesViewWorkbench.test.tsx, src/workbench/__tests__/DocsExplorerZip.test.tsx</files>
  <behavior>
    - `NotesViewWorkbench.test.tsx`: render `<NotesView db={testDb} hideFolderTree />`; `getByTestId('docs-compact-toolbar')` exists; buttons named /Bộ tài liệu/, /Nhập Zip/, /Prompt AI/ all present; `queryByText('Ghi chú & Tài liệu')` is null (header stays hidden).
    - Clicking Bộ tài liệu opens the drawer: `await screen.findByText('Bộ tài liệu xuất bản')` resolves.
    - Render `<NotesView db={testDb} />` (no hideFolderTree): PageHeader text 'Ghi chú & Tài liệu' present and `queryByTestId('docs-compact-toolbar')` is null.
    - Clicking Nhập Zip calls the hidden file input's click (spy on `HTMLInputElement.prototype.click`, assert the `.zip` input was clicked).
    - `DocsExplorerZip.test.tsx`: mock `src/utils/exportFolderZip` with `vi.fn()`s, seed `new TaskPlannerDatabase(...)` with folder 'Dự án A' + a child document via `createNote`, render `<DocsExplorer db={testDb} />`; locate the row by `screen.getByText('Dự án A').closest('.doc-folder-item')`, click its last button (MoreOutlined dropdown), `await screen.findByText('Tải thư mục (ZIP)')`, click it, assert `downloadFolderAsZip` was called once with the folder note and a notes array containing the child document.
  </behavior>
  <action>
    Step 1 — add the shared download helper. In `src/utils/exportFolderZip.ts` export `downloadFolderAsZip(folder: Note, allNotes: readonly Note[]): Promise<void>` that wraps the EXISTING feedback currently in NotesView's `handleDownloadFolder`: `message.loading({ content: 'Đang nén thư mục "…"', key: 'download-folder' })` before, `message.success` with the same key after, `message.error` with `err?.message` in catch, then `await exportFolderAsZip(folder, allNotes)`. In `src/views/NotesView.tsx` replace the body of `handleDownloadFolder` with `await downloadFolderAsZip(folder, allNotes || (await db.notes.toArray()))` (import the helper; drop nothing else). This keeps one zip/feedback implementation for both callers.

    Step 2 — NotesView compact toolbar (only change to the header region). Directly after the existing `{!hideFolderTree && (<PageHeader … />)}` block, add `{hideFolderTree && (…)}` rendering a slim toolbar div with `data-testid="docs-compact-toolbar"`, height ~36px, bottom border, `display:flex`, `alignItems:center`, `gap:8`, `padding:'4px 12px'`, and an antd `<Space>` holding three existing-handler Buttons: `DatabaseOutlined` "Bộ tài liệu" → `setDocumentSetDrawerOpen(true)`; `UploadOutlined` "Nhập Zip" (add `UploadOutlined` to the `@ant-design/icons` import) → `handleOpenZipImport`; `RobotOutlined` "Prompt AI" → `setAiPromptModalOpen(true)`. Do NOT move, duplicate or re-render `DocumentSetDrawer` / `PublishPreviewModal` / `ZipImportPreviewModal` / the hidden file input / the AI prompt Modal — they are already mounted unconditionally at the bottom of NotesView; the toolbar is a trigger surface only. No change to the non-workbench PageHeader branch.

    Step 3 — DocsExplorer folder download. In `src/workbench/toolwindows/DocsExplorer.tsx` import `downloadFolderAsZip` from `../../utils/exportFolderZip` and add `const handleDownloadFolder = useCallback((folder: Note) => downloadFolderAsZip(folder, allNotes ?? []), [allNotes]);` then pass `onDownloadFolder={handleDownloadFolder}` to `<DocFolderTree>`. Do NOT add zip-import state, a file input or `ZipImportPreviewModal` here — NotesView owns that stack and its toolbar covers workbench import. Leave `onOpenZipImport` unset in DocsExplorer.

    Both tests use the repo test bootstrap: `import 'fake-indexeddb/auto'` is already global via `tests/setup.ts`; construct a per-test DB with a random name, seed via `createNote` from `src/db/repositories/noteRepo`, and use `@testing-library/react` + `waitFor` for live-query settle. Do not mock `dexie-react-hooks` in these files. Keep antd `message` calls unmocked (jsdom-safe) or spy on `antd`'s `message` if noisy.
  </action>
  <verify>
    <automated>npx vitest run src/views/__tests__/NotesViewWorkbench.test.tsx src/workbench/__tests__/DocsExplorerZip.test.tsx</automated>
    <automated>npx tsc --noEmit</automated>
    <human-check>Manual smoke in `npm run tauri:dev`: open the Docs editor tab → compact toolbar shows Bộ tài liệu / Nhập Zip / Prompt AI → click Bộ tài liệu, drawer lists sets, publish preview and "build knowledge graph" controls still work → click Nhập Zip, pick a .zip, preview modal appears and imports into the active folder → in the Docs tool window, right-click a folder → "Tải thư mục (ZIP)" downloads the archive. Leave Dashboard/Docs list tab open while the left panel is closed; skip without error.</human-check>
  </verify>
  <done>
    Workbench Docs tab exposes Bộ tài liệu (opens the existing DocumentSetDrawer with publish + graph build), Nhập Zip (opens the existing ZipImportPreviewModal) and Prompt AI; non-workbench NotesView unchanged. DocsExplorer folder menus include Tải thư mục (ZIP) backed by the shared downloadFolderAsZip. Both focused test files pass; tsc clean; no new dependency, no Dexie schema change, no change to PWA/GitHub Pages behavior.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| user file picker → app | ZIP archive bytes parsed by `ZipImportPreviewModal` (JSZip) before `batchCreateNotes` |
| app → local filesystem | Folder export writes a generated ZIP through the browser/Tauri download anchor |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-quick-01 | Tampering | ZIP import path via new workbench toolbar button | medium | mitigate | Reuse `ZipImportPreviewModal` unchanged — its extraction, size/entry caps and `NoteInputSchema` validation stay the only path from archive to DB; the new button only invokes the existing `handleOpenZipImport` file input |
| T-quick-02 | Information disclosure | Folder ZIP export | low | accept | Export is local-only and writes the user's own notes to a user-chosen download; same code path already shipped in non-workbench NotesView |
| T-quick-SC | Tampering | npm/pip/cargo installs | high | mitigate | No new dependencies — JSZip, antd and icons are already installed; no package.json edit is expected |
</threat_model>

<verification>
- `npx vitest run src/views/__tests__/NotesViewWorkbench.test.tsx src/workbench/__tests__/DocsExplorerZip.test.tsx` passes.
- `npx tsc --noEmit` clean.
- Diff footprint is limited to the five `files_modified` paths; `DocumentSetDrawer`, `PublishPreviewModal`, `ZipImportPreviewModal`, `DocFolderTree` and `EditorArea` are untouched.
- `grep -c "exportFolderAsZip" src/views/NotesView.tsx src/workbench/toolwindows/DocsExplorer.tsx` shows the direct call only in the shared helper (both callers go through `downloadFolderAsZip`).
- Full vitest suite intentionally NOT run (project rule: over an hour).
</verification>

<success_criteria>
- IntelliJ/workbench Docs tab reaches ZIP import and the Document Sets drawer (publish + build knowledge graph) without leaving the tab.
- Folder ZIP export works from the Docs Explorer tool window's folder context menu.
- One zip-export feedback implementation, one zip-import dialog stack, zero new components/dependencies.
- Non-workbench NotesView behavior unchanged.
</success_criteria>

<output>
Create `.planning/quick/261116-fyi-bring-docs-explorer-features-missing-fro/261116-fyi-SUMMARY.md` when done
</output>
