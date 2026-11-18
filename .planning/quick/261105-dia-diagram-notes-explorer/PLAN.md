# Quick Plan: Diagram Notes with Folder Hierarchy & Explorer

## Context
1. User request: Allow saving Mermaid diagrams as dedicated notes (`Note` with `type: 'diagram'`), support hierarchical folders, editable titles, linking with Task, Milestone, or Project.
2. Provide a Diagram Explorer in the left sidebar (below Docs icon in IntelliJ Workbench) to manage all diagrams and folders.
3. Integrate with Mermaid Studio (`MermaidAssistantView`) so clicking a diagram opens it in an editor tab with auto-save, editable title, and entity linker.

## Tasks
1. **Task 1: Schema and Type Definitions**
   - Add `'diagram'` to `NoteType` in `src/types/models.ts` and `NOTE_TYPES` in `src/validation/schemas.ts`.
   - Update `DocFolderTree.tsx` to exclude diagram-tagged folders/notes from Docs Explorer so they don't bleed into documents.

2. **Task 2: JetBrains Diagram Icon & Left Stripe Tool Window**
   - Add `JetBrainsDiagramIcon` in `src/components/icons/JetBrainsIcons.tsx`.
   - In `src/workbench/WorkbenchLayout.tsx`: Add `{ id: 'diagrams', name: 'Diagram Explorer', icon: <JetBrainsDiagramIcon size={16} />, shortcut: 'Alt+5' }` to `DEFAULT_LEFT_ITEMS`.
   - In `src/workbench/toolwindows/LeftToolWindow.tsx`: Handle `leftActiveId === 'diagrams'` to render `DiagramExplorer`.

3. **Task 3: DiagramExplorer Component (`src/workbench/toolwindows/DiagramExplorer.tsx`)**
   - Tree navigation for diagram folders (`type: 'folder'` with `tags: ['diagram']`) and diagrams (`type: 'diagram'`).
   - Actions: Create Folder, Create Diagram, Rename, Soft Delete, Move to folder.
   - Quick filters: All Diagrams, By Project / Task filter, Unorganized / Root diagrams.
   - Click diagram: Opens editor tab `mermaid:note-{id}` with title and noteId.

4. **Task 4: Mermaid Assistant View Integration (`src/views/MermaidAssistantView.tsx`)**
   - Accept optional `noteId?: string` and `db?: TaskPlannerDatabase`.
   - If `noteId` provided:
     - Load note body, title, entityType, entityId.
     - Editable title in top bar with sync to `layoutStore` active tab.
     - Entity Linker dropdown (Link to Project, Milestone, or Task).
     - Auto-save (debounced) to IndexedDB via `noteRepo.updateNote`.
   - If `noteId` not provided:
     - Provide "Lưu vào Diagram Notes" (Save to Diagrams) button that creates a `Note` (`type: 'diagram'`) and converts session into persistent diagram.
   - In `src/workbench/EditorArea.tsx`: Pass `noteId={tab.params?.noteId}` and `db={db}` to `MermaidAssistantView`.

5. **Task 5: Verification & Tests**
   - Write focused vitest unit tests for:
     - `noteRepo` with `type: 'diagram'` creation, updates, entity linking.
     - `DiagramExplorer` or `MermaidAssistantView` integration.
   - Check TypeScript compilation (`npx tsc --noEmit`).
