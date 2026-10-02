---
status: awaiting_human_verify
trigger: "serious issue: task list detail, remove link, notes (not notes feature), and other field not working. only can add, remove and save not take affect. and screenshot take long time to capture, and only work from notes tab in task detail drawer, other say timeout waiting for frame"
created: 2026-10-02
updated: 2026-10-02
---

## Current Focus
hypothesis: Fixes are code- and runtime-verified except real OS screen-picker capture, which requires human confirmation.
test: Clear populated task notes and document link through running app, save, reopen; run targeted screenshot frame-readiness regression.
expecting: Cleared values remain absent after reopen; capture waits for non-zero video dimensions.
next_action: User verifies screenshot capture through real screen picker from task drawer Notes capture control after entering from non-Notes tabs.
reasoning_checkpoint:
  persistence_runtime: Running Vite app in headless Edge retained populated notes/link, then persisted their removal after Save and reopen; repeated note-clear probe also persisted.
  screenshot_limit: Headless browser cannot accept OS getDisplayMedia picker; deterministic frame-readiness test passed but real picker needs user.
tdd_checkpoint:
  test_files: tests/db/repos.test.ts, tests/utils/screenshotCapture.test.ts
  status: green
  result: 29 targeted tests passed

## Symptoms
- expected: Editing or clearing task-detail fields, including link and plain notes, persists after Save and reopen. Screenshot capture completes promptly from every task-detail tab.
- actual: Most existing field edits or removals appear in UI but Save has no effect. Adding values can work. Screenshot capture is slow; it works from Notes tab but other tabs time out waiting for frame.
- error: "timeout waiting for frame" during screenshot capture outside Notes tab; no reported save error.
- timeline: Unknown; user cannot confirm whether these flows previously worked.
- reproduction: Open task detail drawer, edit or clear link/plain notes/other fields, Save, then observe values unchanged or restored. Trigger screenshot capture outside Notes tab and observe timeout waiting for frame.

## Evidence
- timestamp: 2026-10-02
  finding: Running Vite app in Edge created a task, saved plain notes and a document link, reopened with both values present, removed both, saved, and reopened with notes empty and no link input/delete button.
- timestamp: 2026-10-02
  finding: Repeated runtime probe populated plain notes again, then cleared, saved, and reopened with notes empty.
- timestamp: 2026-10-02
  finding: Targeted command `npm test -- tests/db/repos.test.ts tests/utils/screenshotCapture.test.ts` passed 2 files and 29 tests. No unrelated full suite was run.
- timestamp: 2026-10-02
  finding: Real getDisplayMedia capture remains human-only because headless Edge cannot interact with OS screen picker.


## Eliminated

## Resolution
root_cause: Cleared task optional fields were represented as present keys with undefined values, but updateTask ignored undefined and retained old properties. Screenshot capture treated metadata readiness as frame readiness even when video dimensions were still zero.
fix: Optional fields now distinguish absent patch keys from explicit undefined clears. Screenshot capture now waits for non-zero video dimensions via media events and short polling before drawing.
verification: Runtime Edge flow passed task plain-notes/link add, save, reopen, clear, save, and reopen. Targeted repository and screenshot tests passed 29 tests. Real OS screen-picker verification remains pending.
files_changed:
  - src/db/repositories/taskRepo.ts
  - src/utils/screenshotCapture.ts
  - tests/db/repos.test.ts
  - tests/utils/screenshotCapture.test.ts
