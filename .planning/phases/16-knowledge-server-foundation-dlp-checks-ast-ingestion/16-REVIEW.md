---
status: issues_found
files_reviewed: 37
findings:
  critical: 2
  warning: 2
  info: 1
  total: 5
---

# Phase 16: Code Review Report

**Reviewed:** 2026-10-08T08:30:00Z  
**Depth:** standard  
**Files Reviewed:** 37  
**Status:** issues_found  

## Summary

Adversarial review executed across 37 Phase 16 source files spanning `knowledge-server/src/`, `src/services/knowledge/`, `src/services/dlp/`, `src/components/knowledge/`, and `src/views/NotesView.tsx`. Core chunking invariants (D-20 – D-26), hash policies, zero-knowledge audit tables, timing-safe authorization tokens, and DLP scanner precedence rules conform strictly to specifications.

Four significant defects discovered: 2 blockers and 2 warnings. Blocker CR-01 breaks document set publishing from Docs UI due to hardcoded dummy props in `NotesView.tsx`. Blocker CR-02 excludes newly added Phase 16 IndexedDB tables (`documentSets`, `publishedDocuments`, `publishAttempts`, `dlpAudits`) from backup export and restore envelopes, violating local-first data durability and offline backup safety.

---

## Critical Issues

### CR-01: DocumentSetDrawer wired with hardcoded disabled state and empty preview handler in NotesView

**File:** `src/views/NotesView.tsx:1030-1040`  
**Issue:** `DocumentSetDrawer` in `NotesView` mounts with `configured={false}` and `onPreview={() => {}}` hardcoded. `PublishPreviewModal` is completely omitted from `NotesView`. When users click "Bộ tài liệu" in Docs view, "Xem trước xuất bản" is permanently disabled with message "Chưa cấu hình Knowledge Server", even when daemon configuration is active in settings. Triggering preview does nothing.  
**Fix:**
Integrate `useKnowledgeConfig` in `NotesView` or parent context, bind live `configured` state, maintain active publish session/preview state in `NotesView`, and mount `PublishPreviewModal`.

---

### CR-02: Backup export and restore schemas omit Phase 16 tables, causing data loss on backup restore

**File:** `src/services/backup/exportBackup.ts` & backup schemas  
**Issue:** Phase 16 added four IndexedDB tables (`documentSets`, `publishedDocuments`, `publishAttempts`, `dlpAudits`) in `TaskPlannerDatabase` schema version 10. `exportBackupPayload` and backup restore only read and write baseline tables. Restoring backup wipes or omits all document set definitions, publishing tracking, and DLP audit trails.  
**Fix:**
Include Phase 16 stores in backup export and restore schemas and operations.

---

## Warnings

### WR-01: Root tsconfig builds server source files missing client runtime dependencies

**File:** `src/services/knowledge/changePreview.ts` & `package.json`  
**Issue:** `changePreview.ts` directly imports parser modules from `knowledge-server/src/`. In standalone client environments where knowledge-server dependencies are not hoisted, module resolution could fail.  
**Fix:**
Ensure isomorphic AST parser packages remain shared or hoisted.

---

### WR-02: AttemptHistoryList durationMs calculation can show negative elapsed time on clock skew

**File:** `src/components/knowledge/AttemptHistoryList.tsx`  
**Issue:** `durationMs` displays raw difference without validating non-negative bounds. If server and client system clocks differ, display could yield negative numbers.  
**Fix:** Bound duration with `Math.max(0, durationMs ?? 0)`.

---

## Info

### IN-01: Unused type export in chunkHashPolicy.ts

**File:** `knowledge-server/src/indexing/chunkHashPolicy.ts`  
**Issue:** Helper type exported but never imported outside test fixtures.  
**Fix:** Keep export internal if unneeded across daemon API boundaries.

---

_Reviewed: 2026-10-08T08:30:00Z_  
_Reviewer: Claude (gsd-code-reviewer)_  
_Depth: standard_
