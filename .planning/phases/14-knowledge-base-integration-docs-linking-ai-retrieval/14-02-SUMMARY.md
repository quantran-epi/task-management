---
phase: 14-knowledge-base-integration-docs-linking-ai-retrieval
plan: 02
subsystem: knowledge-base-linking-and-ingestion
tags: [markdown, wiki-links, smart-ingestion, bidirectional-links, backlinks, ant-design]
dependency_graph:
  requires: [14-01, SCHEMA_V9, NoteType]
  provides: [WikiLinkRenderer, AttachmentImageRenderer, SmartIngestionParser, DocumentLinkRepo, SmartIngestionBanner]
  affects: [src/utils/markdown.ts, src/utils/smartIngestion.ts, src/db/repositories/documentLinkRepo.ts, src/components/notes/SmartIngestionBanner.tsx]
tech_stack:
  added: []
  patterns: [Safe-Wiki-Links, ReDoS-Safe-Extraction, Dexie-Bidirectional-Transactions, Alert-Banner-Action]
key_files:
  created:
    - src/utils/smartIngestion.ts
    - src/db/repositories/documentLinkRepo.ts
    - src/components/notes/SmartIngestionBanner.tsx
    - tests/utils/smartIngestion.test.ts
  modified:
    - src/utils/markdown.ts
    - tests/ai/markdown.test.ts
decisions:
  - "Wiki-links [[doc:...]], [[task:...]], [[project:...]] parse safely after HTML escaping with entity icons and fallback labels (D-05)"
  - "Binary attachments ![caption](attachment:uuid) render into note-attachment-image DOM elements without Base64 payload bloat (D-16)"
  - "Smart ingestion extracts first H1 line as document title and hashtags as tags while ignoring Markdown headings (D-06, D-09)"
  - "linkEntitiesToDoc writes bidirectional wiki-link references between document and selected tasks/projects in a single Dexie transaction (D-08)"
metrics:
  duration: 4m
  completed_date: "2026-10-04"
  tasks_completed: 2
  files_changed: 6
---

# Phase 14 Plan 02: Wiki-Linking Syntax Engine, Ingestion Pipeline & Backlinks Summary

Implemented secure Wiki-link parsing, binary attachment image tokens, Markdown title/tag extraction, Jira key and entity auto-detection, bidirectional relationship persistence, and the Smart Ingestion suggestion banner.

## Overview of Work

1. **Safe Wiki-Link & Attachment Token Renderer:**
   - Extended `src/utils/markdown.ts` to transform `[[doc:id|Title]]`, `[[task:id|Title]]`, and `[[project:id|Title]]` into interactive chips (`.wiki-link-chip`) with respective icons (`📄`, `✅`, `📁`).
   - Added fallback handling when display titles are omitted (`[[doc:uuid]]` -> displays `📄 uuid`).
   - Extended attachment token transformation `![caption](attachment:uuid)` into `<img class="note-attachment-image" data-attachment-id="..." alt="..." />` without inlining base64.
   - Preserved HTML escaping so dynamic labels and attributes are XSS-sanitized (mitigating T-14-03).

2. **Smart Ingestion Pipeline:**
   - Created `src/utils/smartIngestion.ts` with `extractMarkdownMetadata` and `detectReferencedEntities`.
   - Extracted first H1 (`# Title`) as document title and stripped leading hashes; parsed `#tag` hashtags with unicode letter support while skipping Markdown heading lines.
   - Scanned text for Jira issue keys (`[A-Z][A-Z0-9]+-[0-9]+`), known task titles, project titles, and milestone titles without ReDoS vulnerability.

3. **Bidirectional Document Link Repository:**
   - Created `src/db/repositories/documentLinkRepo.ts` with `linkEntitiesToDoc`, `unlinkEntityFromDoc`, and `getBacklinksForDoc`.
   - Executed mutations across `notes`, `tasks`, and `projects` tables inside a single atomic Dexie read-write transaction.
   - Resolved two-way backlinks by querying notes, tasks, and projects referencing `[[doc:<id>]]` or `task.documentLinks`.

4. **1-Click Smart Ingestion Banner:**
   - Created `src/components/notes/SmartIngestionBanner.tsx` rendering an Ant Design `Alert` banner (`💡 Gợi ý liên kết liên quan`).
   - Supported entity toggle checkboxes, 1-Click "Áp dụng tất cả" button, and "Bỏ qua" dismiss action per UI-SPEC §2.

## Test Verification

- `tests/ai/markdown.test.ts` (13 passed): Verifies wiki-link chips, fallback labels, attachment images, and XSS sanitization.
- `tests/utils/smartIngestion.test.ts` (8 passed): Verifies metadata extraction, hashtag parsing, Jira key matching, title matching, link transactions, backlinks queries, and unlink operations.
- `npm run build`: Production bundle and TypeScript type checking passed without errors.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript mock data status and priority casing in tests**
- **Found during:** Task 2 implementation
- **Issue:** Test fixtures used lowercase `'todo'`, `'active'`, `'medium'`, and obsolete `color` field on Project, causing TS2322/TS2820 compiler errors.
- **Fix:** Corrected mock objects to match `TaskStatus` (`'Open'`), `TaskPriority` (`'Medium'`), and `Project` interface definitions.
- **Files modified:** `tests/utils/smartIngestion.test.ts`
- **Commit:** `235369a`

## Known Stubs

None. All parsing, ingestion, link persistence, and UI banner components are fully wired and functional.

## Self-Check: PASSED
- `src/utils/markdown.ts`: FOUND
- `src/utils/smartIngestion.ts`: FOUND
- `src/db/repositories/documentLinkRepo.ts`: FOUND
- `src/components/notes/SmartIngestionBanner.tsx`: FOUND
- `tests/ai/markdown.test.ts`: FOUND
- `tests/utils/smartIngestion.test.ts`: FOUND
- Commits `2e464c7`, `221c3c5`, `2626620`, `235369a` verified in git history.
