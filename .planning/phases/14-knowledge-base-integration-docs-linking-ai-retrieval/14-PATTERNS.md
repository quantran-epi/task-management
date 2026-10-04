# Phase 14: Knowledge Base Integration (Docs, Linking & AI Retrieval) - Pattern Map

**Mapped:** 2026-10-04  
**Files analyzed:** 18  
**Analogs found:** 18 / 18  

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/types/models.ts` | model | CRUD | `src/types/models.ts` (Note, ChatThread) | exact |
| `src/db/schema.ts` | config | CRUD | `src/db/schema.ts` (SCHEMA_V8, SCHEMA_V7) | exact |
| `src/db/index.ts` | config | CRUD | `src/db/index.ts` (version 7/8 upgrade) | exact |
| `src/validation/schemas.ts` | utility | request-response | `src/validation/schemas.ts` (NoteSchema, NoteInputSchema) | exact |
| `src/db/repositories/noteRepo.ts` | service | CRUD | `src/db/repositories/noteRepo.ts` | exact |
| `src/db/repositories/documentLinkRepo.ts` | service | CRUD | `src/db/repositories/cascadeRepo.ts` | role-match |
| `src/utils/bm25.ts` | utility | transform | `src/utils/dayInsight.ts` | role-match |
| `src/utils/markdown.ts` | utility | transform | `src/utils/markdown.ts` | exact |
| `src/utils/smartIngestion.ts` | utility | transform | `src/components/ai/ChatMessageBubble.tsx` (parseChecklistFromText) | role-match |
| `src/utils/documentExport.ts` | utility | file-I/O | `src/utils/notesPopout.ts` | role-match |
| `src/services/ai/aiTools.ts` | service | request-response | `src/services/ai/aiTools.ts` (query_tasks, read_file, create_note) | exact |
| `src/services/ai/contextGrounding.ts` | service | transform | `src/services/ai/contextGrounding.ts` (serializeTaskContext) | exact |
| `src/components/notes/DocFolderTree.tsx` | component | event-driven | `src/components/notes/NoteAttachmentsPanel.tsx` | role-match |
| `src/components/notes/DocListPane.tsx` | component | CRUD | `src/views/NotesView.tsx` | role-match |
| `src/components/notes/DocEditorPane.tsx` | component | CRUD | `src/components/notes/NoteEditor.tsx` | role-match |
| `src/components/notes/DocOutlineToC.tsx` | component | event-driven | `src/components/notes/NoteDetailModal.tsx` | role-match |
| `src/components/notes/SmartIngestionBanner.tsx` | component | event-driven | `src/components/projects/CascadeDeleteModal.tsx` | role-match |
| `src/components/notes/QuickPreviewDrawer.tsx` | component | event-driven | `src/components/tasks/TaskDrawer.tsx` | role-match |
| `src/components/notes/BacklinksSection.tsx` | component | CRUD | `src/components/notes/EntityNotesSection.tsx` | role-match |
| `src/components/tasks/LinkedKnowledgeSection.tsx` | component | CRUD | `src/components/tasks/TaskDrawer.tsx` (documentLinks section) | role-match |
| `src/components/ai/ChatInputBar.tsx` | component | event-driven | `src/components/ai/ChatInputBar.tsx` (file autocomplete) | exact |
| `src/components/ai/CitationChip.tsx` | component | event-driven | `src/components/ai/ChatMessageBubble.tsx` (renderUserMessageWithMentions) | role-match |
| `src/views/NotesView.tsx` | component | CRUD | `src/views/NotesView.tsx` | exact |

---

## Pattern Assignments

### 1. `src/types/models.ts` & `src/validation/schemas.ts` (model / validation)

**Analog:** `src/types/models.ts` (lines 171-180) & `src/validation/schemas.ts` (lines 325-351)

**Imports pattern:**
```typescript
import { z } from 'zod';
import { uuidSchema } from './schemas';
```

**Core Model Extension Pattern** (`src/types/models.ts` lines 169-180):
```typescript
export type NoteType = 'quick_note' | 'document';
export type NoteEntityType = 'task' | 'project' | 'milestone';

export interface Note {
  id: string; // RFC 4122 v4 UUID
  type?: NoteType | undefined; // 'quick_note' | 'document' (D-01)
  parentId?: string | undefined; // Folder hierarchy reference to parent Note.id (D-02)
  tags?: string[] | undefined; // Taxonomy labels (D-02)
  slug?: string | undefined; // Human-friendly URL slug
  deletedAt?: string | undefined; // ISO string for Soft Delete / Trash bin (D-17)
  entityType?: NoteEntityType | undefined;
  entityId?: string | undefined;
  title?: string | undefined;
  body: string; // Markdown text content
  isPinned: boolean;
  createdAt: string; // ISO string metadata
  updatedAt: string; // ISO string metadata
}
```

**Validation Schema Pattern** (`src/validation/schemas.ts` lines 336-351):
```typescript
export const NOTE_TYPES = ['quick_note', 'document'] as const;

export const NoteInputSchema = z.object({
  type: z.enum(NOTE_TYPES).default('quick_note'),
  parentId: uuidSchema.optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(30).optional(),
  slug: z.string().trim().max(120).optional(),
  entityType: z.enum(NOTE_ENTITY_TYPES).optional(),
  entityId: uuidSchema.optional(),
  title: z.string().trim().max(200, 'Tiêu đề tối đa 200 ký tự').optional(),
  body: z.string().min(1, 'Nội dung không được để trống').max(100000, 'Nội dung tối đa 100,000 ký tự'),
  isPinned: z.boolean().optional(),
});
```

---

### 2. `src/db/schema.ts` & `src/db/index.ts` (database schema migration)

**Analog:** `src/db/schema.ts` (lines 55-67) & `src/db/index.ts` (lines 105-135)

**Core Schema Pattern** (`src/db/schema.ts` lines 62-66):
```typescript
export const SCHEMA_V9 = {
  ...SCHEMA_V8,
  notes: 'id, type, parentId, entityType, entityId, isPinned, deletedAt, *tags, createdAt, updatedAt',
} as const;
```

**Upgrade Handler Pattern** (`src/db/index.ts` lines 105-135):
```typescript
this.version(9)
  .stores(SCHEMA_V9)
  .upgrade(async (tx) => {
    await tx
      .table('notes')
      .toCollection()
      .modify((note: Record<string, unknown>) => {
        if (!note.type) note.type = 'quick_note';
        if (!Array.isArray(note.tags)) note.tags = [];
      });
  });
```

---

### 3. `src/db/repositories/noteRepo.ts` & `documentLinkRepo.ts` (data repository)

**Analog:** `src/db/repositories/noteRepo.ts` (lines 17-78)

**Core CRUD Pattern:**
```typescript
export async function createNote(
  input: NoteInput,
  db: TaskPlannerDatabase = defaultDb
): Promise<Note> {
  const validated = NoteInputSchema.parse(input);
  const now = new Date().toISOString();

  const note: Note = {
    id: generateId(),
    type: validated.type ?? 'quick_note',
    ...(validated.parentId ? { parentId: validated.parentId } : {}),
    ...(validated.tags && validated.tags.length > 0 ? { tags: validated.tags } : {}),
    ...(validated.entityType ? { entityType: validated.entityType } : {}),
    ...(validated.entityId ? { entityId: validated.entityId } : {}),
    ...(validated.title?.trim() ? { title: validated.title.trim() } : {}),
    body: validated.body,
    isPinned: validated.isPinned ?? false,
    createdAt: now,
    updatedAt: now,
  };

  await db.notes.add(note);
  return note;
}
```

**Soft Delete Pattern** (replaces hard delete on note deletion, D-17):
```typescript
export async function softDeleteNote(
  id: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  const now = new Date().toISOString();
  await db.notes.update(id, { deletedAt: now });
}

export async function restoreNote(
  id: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  await db.notes.update(id, { deletedAt: undefined });
}
```

**Two-way Backlinks Query Pattern:**
```typescript
export async function getBacklinksForDoc(
  docId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<{ tasks: Task[]; projects: Project[]; referencingNotes: Note[] }> {
  const [allTasks, allProjects, allNotes] = await Promise.all([
    db.tasks.toArray(),
    db.projects.toArray(),
    db.notes.toArray(),
  ]);

  const targetLink = `[[doc:${docId}`;

  const tasks = allTasks.filter(
    (t) => (t.notes && t.notes.includes(targetLink)) || (t.documentLinks && t.documentLinks.some((l) => l.includes(docId)))
  );
  const projects = allProjects.filter(
    (p) => (p.notes && p.notes.includes(targetLink)) || (p.documentLinks && p.documentLinks.some((l) => l.includes(docId)))
  );
  const referencingNotes = allNotes.filter(
    (n) => n.id !== docId && !n.deletedAt && n.body.includes(targetLink)
  );

  return { tasks, projects, referencingNotes };
}
```

---

### 4. `src/utils/bm25.ts` & `src/services/ai/aiTools.ts` (search & AI retrieval)

**Analog:** `src/services/ai/aiTools.ts` (lines 43-73, 2720-2760)

**BM25 Tokenization & Ranking Pattern:**
```typescript
export function normalizeVietnamese(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

export function tokenize(text: string): string[] {
  const norm = normalizeVietnamese(text);
  return norm.split(/[^a-z0-9_]+/i).filter((t) => t.length > 1);
}

export function rankBM25(
  query: string,
  docs: Array<{ id: string; title: string; tags: string[]; body: string }>,
  k1 = 1.2,
  b = 0.75
): Array<{ id: string; score: number }> {
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0 || docs.length === 0) return [];
  // Title x3, Tags x2, Body x1 field boosts
  ...
}
```

**AI Tool Definition Pattern** (`src/services/ai/aiTools.ts`):
```typescript
{
  type: 'function',
  function: {
    name: 'search_knowledge_base',
    description:
      'Search offline knowledge base documents using lexical BM25 ranking. Supports query keywords, optional tag filtering, and returns relevant snippet extracts.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search keywords or question.' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Optional tag filter list.' },
        limit: { type: 'number', description: 'Max number of docs to return (default 5, max 10).' },
      },
      required: ['query'],
    },
  },
}
```

**AI Tool Execution Pattern:**
```typescript
case 'search_knowledge_base': {
  if (!db.notes) return JSON.stringify({ error: 'Notes table unavailable' });
  const allDocs = await db.notes
    .filter((n) => !n.deletedAt && (n.type === 'document' || !n.type))
    .toArray();
  const scored = rankBM25(String(args.query), allDocs.map((d) => ({
    id: d.id,
    title: d.title || '',
    tags: d.tags || [],
    body: d.body || '',
  })));
  const limit = Math.min(Math.max(1, Number(args.limit) || 5), 10);
  const topHits = scored.slice(0, limit);
  // Extract snippet within char limit
  return JSON.stringify({
    totalHits: scored.length,
    returned: topHits.length,
    results: topHits,
  });
}
```

---

### 5. `src/utils/markdown.ts` (wiki-link & image rendering)

**Analog:** `src/utils/markdown.ts` (lines 15-44, 180-195)

**Wiki-Link & Attachment Token Pattern:**
```typescript
function renderWikiLinks(text: string): string {
  // [[doc:id|Title]] or [[task:id|Title]] or [[project:id|Title]]
  const wikiLinkRegex = /\[\[(doc|task|project):([a-zA-Z0-9_-]+)(?:\|([^\]]+))?\]\]/g;
  return text.replace(wikiLinkRegex, (_match, type, id, label) => {
    const displayLabel = label?.trim() || id;
    let icon = '📄';
    if (type === 'task') icon = '✅';
    if (type === 'project') icon = '📁';
    return `<span class="wiki-link-chip" data-entity-type="${type}" data-entity-id="${id}" role="button" tabindex="0">${icon} ${escapeHtml(displayLabel)}</span>`;
  });
}

function renderAttachmentImages(text: string): string {
  // ![caption](attachment:uuid)
  const attachmentRegex = /!\[([^\]]*)\]\(attachment:([a-zA-Z0-9_-]+)\)/g;
  return text.replace(attachmentRegex, (_match, caption, uuid) => {
    return `<img class="note-attachment-image" data-attachment-id="${uuid}" alt="${escapeHtml(caption)}" />`;
  });
}
```

---

### 6. `src/components/ai/ChatInputBar.tsx` (autocomplete @doc)

**Analog:** `src/components/ai/ChatInputBar.tsx` (lines 38-81, 290-330)

**Autocomplete Trigger Pattern:**
```typescript
// Support @doc: prefix alongside @task, @project, @file
if (option.key === 'cmd-doc') {
  setValue((prev) => (prev ? `${prev.replace(/\/doc\s*$/, '')}@doc:` : '@doc:'));
  setSearchInfo({ text: 'doc:', prefix: '@' });
  return;
}
```

---

### 7. `src/views/NotesView.tsx` (3-column layout)

**Analog:** `src/views/NotesView.tsx` (lines 41-110)

**Responsive 3-Column Shell Pattern:**
```typescript
<div style={{ display: 'flex', height: 'calc(100vh - 120px)', gap: 16 }}>
  {/* Column 1: Folder Tree + Quick Filters */}
  <div style={{ width: 240, borderRight: '1px solid #f0f0f0', overflowY: 'auto' }}>
    <DocFolderTree activeFolderId={selectedFolderId} onSelectFolder={setSelectedFolderId} />
  </div>

  {/* Column 2: Document List + Search */}
  <div style={{ width: 320, borderRight: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column' }}>
    <DocListPane
      folderId={selectedFolderId}
      selectedDocId={selectedDoc?.id}
      onSelectDoc={setSelectedDoc}
    />
  </div>

  {/* Column 3: Split Editor / Reader Pane */}
  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    {selectedDoc ? (
      <DocEditorPane doc={selectedDoc} onSave={handleSaveDoc} />
    ) : (
      <Empty description="Chọn tài liệu hoặc tạo mới" />
    )}
  </div>
</div>
```

---

### 8. `src/components/tasks/LinkedKnowledgeSection.tsx` & `QuickPreviewDrawer.tsx`

**Analog:** `src/components/tasks/TaskDrawer.tsx` (lines 747-835) & `src/components/notes/NoteDetailModal.tsx`

**Drawer Integration Pattern:**
```typescript
export const LinkedKnowledgeSection: React.FC<{
  taskId: string;
  notes?: string;
  documentLinks?: string[];
  onOpenDoc: (docId: string) => void;
}> = ({ taskId, notes, documentLinks, onOpenDoc }) => {
  // Extract wiki-links [[doc:uuid|Title]] from notes and documentLinks
  const linkedDocIds = useMemo(() => extractWikiDocIds(notes, documentLinks), [notes, documentLinks]);
  ...
};
```

---

## Shared Patterns

### Error Handling & Validation
**Source:** `src/validation/schemas.ts`
**Apply to:** All mutations, form submissions, and AI tool calls
```typescript
try {
  const validated = Schema.parse(input);
} catch (err) {
  if (err instanceof z.ZodError) {
    const errorMsg = err.issues.map((i) => i.message).join('; ');
    return JSON.stringify({ error: errorMsg });
  }
  throw err;
}
```

### Reactive Reads via Dexie
**Source:** `src/views/NotesView.tsx` (lines 50-62)
**Apply to:** `DocFolderTree.tsx`, `DocListPane.tsx`, `LinkedKnowledgeSection.tsx`, `BacklinksSection.tsx`
```typescript
const docs = useLiveQuery(
  async () => {
    return await db.notes
      .filter((n) => !n.deletedAt && n.type === 'document')
      .toArray();
  },
  [db]
);
```

### Tauri IPC vs Web Fallback
**Source:** `src/utils/notesPopout.ts` (lines 7-10) & `src/utils/documentLinks.tsx`
**Apply to:** `documentExport.ts`, `QuickPreviewDrawer.tsx`
```typescript
export function isTauriApp(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}
```

## No Analog Found

All required capabilities have exact or role-matched analogs in the existing codebase:
- Vietnamese BM25 is modeled directly after pure TS utility patterns in `src/utils/dayInsight.ts`.
- Ingestion entity extraction builds directly on `parseChecklistFromText` in `src/components/ai/ChatMessageBubble.tsx`.

## Metadata

**Analog search scope:** `src/db`, `src/services/ai`, `src/utils`, `src/components`, `src/views`  
**Files scanned:** 35  
**Pattern extraction date:** 2026-10-04  
