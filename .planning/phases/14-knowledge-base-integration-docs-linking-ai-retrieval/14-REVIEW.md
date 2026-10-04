---
phase: 14-knowledge-base-integration-docs-linking-ai-retrieval
reviewed: 2026-10-04T16:25:00Z
depth: standard
files_reviewed: 35
files_reviewed_list:
  - src/components/ai/ChatInputBar.tsx
  - src/components/ai/ChatMessageBubble.tsx
  - src/components/ai/CitationChip.tsx
  - src/components/notes/BacklinksSection.tsx
  - src/components/notes/DocEditorPane.tsx
  - src/components/notes/DocFolderTree.tsx
  - src/components/notes/DocListPane.tsx
  - src/components/notes/DocOutlineToC.tsx
  - src/components/notes/QuickPreviewDrawer.tsx
  - src/components/notes/SmartIngestionBanner.tsx
  - src/components/tasks/LinkedKnowledgeSection.tsx
  - src/components/tasks/TaskDrawer.tsx
  - src/db/index.ts
  - src/db/repositories/documentLinkRepo.ts
  - src/db/repositories/noteRepo.ts
  - src/db/schema.ts
  - src/services/ai/aiTools.ts
  - src/services/ai/contextGrounding.ts
  - src/types/models.ts
  - src/utils/bm25.ts
  - src/utils/documentExport.ts
  - src/utils/markdown.ts
  - src/utils/smartIngestion.ts
  - src/validation/schemas.ts
  - src/views/NotesView.tsx
  - tests/ai/ChatInputBar.test.tsx
  - tests/ai/CitationChipAndQuickPreview.test.tsx
  - tests/ai/aiTools.test.ts
  - tests/ai/contextGrounding.test.ts
  - tests/ai/markdown.test.ts
  - tests/components/TaskDrawer.test.tsx
  - tests/db/schemaV9.test.ts
  - tests/utils/bm25.test.ts
  - tests/utils/documentExport.test.ts
  - tests/utils/smartIngestion.test.ts
  - tests/views/NotesView.test.tsx
findings:
  critical: 5
  warning: 5
  info: 3
  total: 13
status: issues_found
---

# Phase 14: Code Review Report

**Reviewed:** 2026-10-04T16:25:00Z  
**Depth:** standard  
**Files Reviewed:** 35  
**Status:** issues_found  

## Summary

Phase 14 delivers the Knowledge Base 3-column workspace, BM25 retrieval engine, smart entity ingestion, bidirectional wiki-linking, and TaskDrawer integration. The codebase shows clean component separation, robust TDD test coverage, and thoughtful adherence to offline-first design.

However, adversarial review revealed several critical defects:
1. "Mở trong Docs" navigation from `QuickPreviewDrawer` sets a URL hash (`#/notes?doc=...`) that `NotesView` never parses or handles, leaving document navigation broken.
2. Soft-deleted documents in Trash cannot be restored anywhere in the UI (`restoreNote` is orphaned from the view layer).
3. `SmartIngestionBanner` fails to update its internal selection state when new entities are detected on paste or document switch.
4. `extractRelevantSnippet` in BM25 search returns an empty string for lines or paragraphs exceeding the character budget.
5. `CitationChip` and interactive `.wiki-link-chip` spans lack event delegation and click handling in chat and markdown views.

## Critical Issues

### CR-01: "Mở trong Docs" Navigation from QuickPreviewDrawer Fails to Select Target Document

**File:** `src/views/NotesView.tsx:77` and `src/components/notes/QuickPreviewDrawer.tsx:81`  
**Classification:** BLOCKER  
**Issue:** When clicking "Mở trong Docs" in `QuickPreviewDrawer` (e.g. from `TaskDrawer`), the drawer sets `window.location.hash = '#/notes?doc=' + encodeURIComponent(docId)`. However, `NotesView.tsx` never inspects `window.location.hash` or listens to `hashchange`. It defaults `selectedDocId` to `null` and always picks the first document in the current folder, ignoring the user's requested document.  
**Fix:**
Parse `doc` from `window.location.hash` on mount and on `hashchange` inside `NotesView.tsx`:

```tsx
useEffect(() => {
  const parseDocFromHash = () => {
    const hash = window.location.hash;
    const match = hash.match(/[?&]doc=([^&]+)/);
    if (match && match[1]) {
      const targetDocId = decodeURIComponent(match[1]);
      setSelectedDocId(targetDocId);
    }
  };

  parseDocFromHash();
  window.addEventListener('hashchange', parseDocFromHash);
  return () => window.removeEventListener('hashchange', parseDocFromHash);
}, []);
```

---

### CR-02: Soft-Deleted Notes in Trash Cannot Be Restored from the UI

**File:** `src/views/NotesView.tsx:251-290`, `src/components/notes/DocListPane.tsx:73-100`, `src/db/repositories/noteRepo.ts:137-148`  
**Classification:** BLOCKER  
**Issue:** Requirement D-17 specifies a two-stage Trash Bin with Restore (`restoreNote`) or Permanent Delete. While `restoreNote` is implemented in `noteRepo.ts`, it is never imported or exposed in `NotesView.tsx`, `DocListPane.tsx`, or `DocEditorPane.tsx`. When viewing Trash, `DocListPane` only shows "Xóa vĩnh viễn" and "Ghim". Users who accidentally move a document to trash have no way to recover it.  
**Fix:**
Import `restoreNote` in `NotesView.tsx`, pass an `onRestoreDoc` callback to `DocListPane` and `DocEditorPane`, and add a "Khôi phục" action:

```tsx
// In DocListPane.tsx
...(doc.deletedAt
  ? [
      {
        key: 'restore',
        label: 'Khôi phục tài liệu',
        icon: <UndoOutlined />,
        onClick: () => onRestoreDoc?.(doc),
      },
    ]
  : []),
```

---

### CR-03: `SmartIngestionBanner` Stale State Drops Selections on New Paste or Doc Switch

**File:** `src/components/notes/SmartIngestionBanner.tsx:21-23`  
**Classification:** BLOCKER  
**Issue:** `SmartIngestionBanner` initializes `selectedIds` using `useState(() => detectedEntities.map((e) => e.id))`. When new entities are detected from subsequent pastes or document switches, `useState` does not re-run its initializer. `selectedIds` retains IDs from the previous detection. Consequently, newly detected entities appear unchecked, and clicking "Áp dụng tất cả" filters by obsolete IDs and passes an empty array `[]` to `onApplyAll`.  
**Fix:**
Synchronize `selectedIds` whenever `detectedEntities` prop changes:

```tsx
useEffect(() => {
  setSelectedIds(detectedEntities.map((e) => e.id));
}, [detectedEntities]);
```

---

### CR-04: `extractRelevantSnippet` Returns Empty String for Paragraphs Exceeding `maxChars`

**File:** `src/utils/bm25.ts:199-210`  
**Classification:** BLOCKER  
**Issue:** When extracting a snippet around the best matching line, if the line or paragraph is longer than `maxChars` (e.g. 1600 characters in prose, notes, or pasted specs), `currentLen + line.length + 1 > maxChars` immediately evaluates to true on the first iteration. The loop breaks before pushing any line to `snippetLines`, and `extractRelevantSnippet` returns `""`. This empties out BM25 search results and grounding context for documents with dense paragraphs.  
**Fix:**
Fallback to slicing the matching line when `snippetLines` is empty:

```ts
  for (let i = start; i <= end; i++) {
    const line = lines[i] ?? '';
    if (currentLen + line.length + 1 > maxChars) {
      if (snippetLines.length === 0) {
        const sliceLen = Math.max(0, maxChars - currentLen - 3);
        snippetLines.push(line.slice(0, sliceLen) + '...');
      }
      break;
    }
    snippetLines.push(line);
    currentLen += line.length + 1;
  }
```

---

### CR-05: CitationChip and `.wiki-link-chip` Elements Lack Click Handlers and Event Delegation

**File:** `src/components/ai/ChatMessageBubble.tsx:253`, `src/components/ai/CitationChip.tsx:18`, `src/components/notes/DocEditorPane.tsx:410`  
**Classification:** BLOCKER  
**Issue:** Requirement D-13 states: "Trong câu trả lời của AI, các đoạn kiến thức trích từ Knowledge Base có gắn chip tham chiếu bấm được `[📄 Tên tài liệu §Mục]`... Bấm vào mở Quick Preview Drawer ngay lập tức". `CitationChip.tsx` was created and tested, but is never used in `ChatMessageBubble.tsx`. Furthermore, `renderSafeMarkdown` outputs `<span class="wiki-link-chip" data-entity-type="..." data-entity-id="..." role="button">`, but neither `ChatMessageBubble` nor `DocEditorPane` listens to click events on these spans. Clicking wiki-links in rendered markdown does nothing.  
**Fix:**
Add event delegation for `.wiki-link-chip` clicks in `DocEditorPane.tsx` and `ChatMessageBubble.tsx`:

```tsx
const handleMarkdownClick = (e: React.MouseEvent<HTMLDivElement>) => {
  const target = (e.target as HTMLElement).closest('.wiki-link-chip') as HTMLElement | null;
  if (!target) return;
  const entityType = target.dataset.entityType;
  const entityId = target.dataset.entityId;
  if (entityType === 'doc' && entityId) {
    onOpenDocPreview?.(entityId);
  } else if (entityType === 'task' && entityId) {
    onOpenTask?.(entityId);
  } else if (entityType === 'project' && entityId) {
    onOpenProject?.(entityId);
  }
};
```

---

## Warnings

### WR-01: Milestones and Project `documentLinks` Omitted in Bidirectional Linking

**File:** `src/db/repositories/documentLinkRepo.ts:37-71, 117-137, 144-171`  
**Classification:** WARNING  
**Issue:** `detectReferencedEntities` detects milestones (`type: 'milestone'`), but `linkEntitiesToDoc` only branches on `task` and `project`. Detected milestones are dropped and never linked to milestone records. In addition, `linkEntitiesToDoc` updates `task.documentLinks`, but ignores `project.documentLinks` (even though `Project` schema has `documentLinks?: string[]`). `getBacklinksForDoc` also omits checking `project.documentLinks`.  
**Fix:**
Add `entity.type === 'milestone'` handling in `linkEntitiesToDoc`, include `db.milestones` in the transaction, update `project.documentLinks`, and include `p.documentLinks` in `getBacklinksForDoc`.

---

### WR-02: Debounced Auto-Save Timer Lacks Cleanup on Doc Switch and Unmount

**File:** `src/components/notes/DocEditorPane.tsx:88-112`  
**Classification:** WARNING  
**Issue:** `triggerAutoSave` sets a 500ms timeout in `debounceTimerRef.current`. When the user rapidly switches from Document A to Document B, the `useEffect([doc?.id, db])` hook has no cleanup to cancel or flush the pending timer. The pending save can overwrite Document A with stale state or collide with Document B.  
**Fix:**
Add cleanup in `useEffect` when `doc?.id` changes or unmounts:

```tsx
useEffect(() => {
  return () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
  };
}, [doc?.id]);
```

---

### WR-03: Permanent Deletion in Trash Bypasses Confirmation Dialog When Backlink Count Is 0

**File:** `src/views/NotesView.tsx:260-276`  
**Classification:** WARNING  
**Issue:** In `handleDeleteDocument`, if `note.deletedAt` is set, `Modal.confirm` is ONLY triggered if `backlinkCount > 0`. If `backlinkCount === 0`, `permanentDeleteNote` executes immediately without any confirmation modal. Because `DocListPane` does not wrap the "Xóa vĩnh viễn" menu item in a Popconfirm, a single misclick permanently deletes the document with zero recovery path.  
**Fix:**
Always display confirmation before permanent deletion, incorporating backlink count into the description:

```tsx
Modal.confirm({
  title: 'Xóa vĩnh viễn tài liệu?',
  content: backlinkCount > 0
    ? `Tài liệu "${note.title}" đang được ${backlinkCount} mục liên kết. Thao tác này không thể hoàn tác!`
    : `Bạn có chắc muốn xóa vĩnh viễn tài liệu "${note.title}"? Thao tác này không thể hoàn tác!`,
  okText: 'Xóa vĩnh viễn',
  okType: 'danger',
  cancelText: 'Hủy',
  onOk: async () => {
    await permanentDeleteNote(note.id, db);
    message.success('Đã xóa vĩnh viễn tài liệu');
    if (selectedDocId === note.id) setSelectedDocId(null);
  },
});
```

---

### WR-04: Single-Pass Regex Directory Traversal Sanitization

**File:** `src/utils/documentExport.ts:8-12`  
**Classification:** WARNING  
**Issue:** `sanitizeFilename` uses `filename.replace(/\.\.[\/\\]/g, '')`. Single-pass replacement can be bypassed by inputs like `....//` which reduce to `../`. In addition, a filename of just `..` is not followed by a slash, so it escapes the regex.  
**Fix:**
Use a loop or normalize path separators:

```ts
export function sanitizeFilename(filename: string): string {
  if (!filename) return 'untitled';
  let clean = filename.replace(/[\\/:*?"<>|]/g, '_').trim();
  while (clean.includes('..')) {
    clean = clean.replace(/\.\./g, '_');
  }
  return clean.replace(/^_+|_+$/g, '') || 'untitled';
}
```

---

### WR-05: Inline Code Formatting Delimiters Corrupted by Subsequent Regex Passes

**File:** `src/utils/markdown.ts:20, 30-32`  
**Classification:** WARNING  
**Issue:** In `renderInlineFormatting`, inline code ` `code` ` is converted to `<code>$1</code>`, but subsequent regex passes for `*italic*`, `__bold__`, and `~~strike~~` execute globally on the result without masking the contents of `<code>...</code>`. Markdown code spans containing asterisks or underscores are incorrectly transformed into HTML tags inside `<code>`.  
**Fix:**
Extract code spans to placeholder tokens before inline styling and restore them before returning.

---

## Info

### IN-01: `exportAllDocumentsAsZip` Exports JSON Instead of Zip Archive

**File:** `src/utils/documentExport.ts:74-109`  
**Classification:** INFO  
**Issue:** Function is named `exportAllDocumentsAsZip` per D-15, but exports a `.json` file (`type: 'application/json'`) and drops binary attachment Blobs (`att.data`).  
**Fix:** Clarify naming to `exportAllDocumentsAsJson` or implement JSZip packaging.

---

### IN-02: LinkedKnowledgeSection Strict UUID Regex Rejects Custom or Short Identifiers

**File:** `src/components/tasks/LinkedKnowledgeSection.tsx:32, 39`  
**Classification:** INFO  
**Issue:** `LinkedKnowledgeSection` enforces `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i` and `/\[\[doc:([0-9a-f-]{36})/`, whereas `markdown.ts` and `contextGrounding.ts` support `([a-zA-Z0-9_-]+)`.  
**Fix:** Align pattern to `([a-zA-Z0-9_-]+)` for consistency.

---

### IN-03: DocOutlineToC Queries Document-Wide Headings

**File:** `src/components/notes/DocOutlineToC.tsx:57-63`  
**Classification:** INFO  
**Issue:** Heading click handler executes `document.querySelectorAll('h1, h2, h3')` across the entire page rather than scoping to `.markdown-rendered-view`.  
**Fix:** Scope the query selector to `.markdown-rendered-view h1, .markdown-rendered-view h2, .markdown-rendered-view h3`.

---

_Reviewed: 2026-10-04T16:25:00Z_  
_Reviewer: Claude (gsd-code-reviewer)_  
_Depth: standard_  
