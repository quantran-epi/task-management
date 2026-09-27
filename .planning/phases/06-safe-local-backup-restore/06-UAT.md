---
status: testing
phase: 06-safe-local-backup-restore
source: [06-VERIFICATION.md]
started: 2026-09-27T16:30:00Z
updated: 2026-09-27T16:30:00Z
---

## Current Test

number: 1
name: OS Drag-and-Drop Backup File Import
expected: |
  Dragging a valid .json backup file from the desktop/finder directly onto the BackupImportCard dropzone opens the ImportPreviewModal with accurate metadata and comparison delta table
awaiting: user response

## Tests

### 1. OS Drag-and-Drop Backup File Import
expected: Dragging a valid .json backup file from the desktop/finder directly onto the BackupImportCard dropzone opens the ImportPreviewModal with accurate metadata and comparison delta table
result: [pending]

### 2. Screen Reader Live Announcements
expected: Screen reader (VoiceOver/NVDA) announces export initiation/completion, validation failure counts, and restore/rollback completion from the aria-live polite region
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
