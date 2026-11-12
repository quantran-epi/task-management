---
status: testing
phase: 37-runtime-reliability-concurrency
source: [37-VERIFICATION.md]
started: 2026-11-12T06:30:00Z
updated: 2026-11-12T06:30:00Z
---

## Current Test

number: 1
name: Limited batch — limit 2, five assignments
expected: |
  At most two agent bubbles read "Đang làm việc" at any moment, the rest read
  "Đang xếp hàng", and all five reach a terminal state.
awaiting: user response

## Tests

### 1. Limited batch — limit 2, five assignments
expected: At most two bubbles in "Đang làm việc" at any moment, the rest "Đang xếp hàng", all five terminal.
steps: |
  npm run tauri:dev
  Open/create a group with one leader and at least five agents.
  Team Settings → "Số nhân viên chạy đồng thời" = 2 → save.
  Send a request that makes the lead delegate five assignments.
result: [pending]

### 2. Outbox — second submit during a live turn
expected: Message appears in the outbox above the composer marked queued, composer keeps accepting input, dispatch happens automatically once the first turn settles.
steps: While the batch runs, type and submit a second message.
result: [pending]

### 3. Stop a queued agent
expected: Agent shows "Chưa hoàn tất" and never ran; other agents still complete.
steps: Stop one agent that is still "Đang xếp hàng".
result: [pending]

### 4. Global Stop
expected: Every agent stops, the queue clears, the composer returns to normal, the active-turn indicator disappears.
steps: Press the global Stop during a batch.
result: [pending]

### 5. Retry
expected: Only that agent gets a new attempt, its new report replaces the old on screen, a new leader synthesis names the previously unfinished work.
steps: Click "Chạy lại" on the stopped agent's bubble.
result: [pending]

### 6. Delete mid-batch
expected: No further messages, no "group not found" error toast, the team gone from the list.
steps: Delete the group from the AI Office explorer while a batch is running.
note: The database half is pinned by disposeMidRunDelete.test.ts; what a human confirms is the rendered surface.
result: [pending]

### 7. WR-07 concurrency judgement
expected: Decide whether the single sampled interleaving (`keeps a newer attempt linked when an older attempt finalizes late`) pins the realistic race, or whether a stressed/randomised test is warranted.
steps: Read teamRunCoordinator.ts:667-672 and the named test.
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 0

## Gaps
