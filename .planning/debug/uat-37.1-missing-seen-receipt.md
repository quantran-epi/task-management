---
status: diagnosed
trigger: "uat-37.1-missing-seen-receipt — user cannot tell whether leader or a specific agent has received and read their message; wants chat-style seen indicator with who + date/time on click"
created: 2026-11-12T00:00:00Z
updated: 2026-11-12T00:00:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: CONFIRMED — no read/delivery timestamp is persisted for any user message. The only durable marker is `AiTeamAssignment.steerMessageIds` (a bare id array, no timestamp), and it exists only for steers addressed to a running/queued agent. Plain user messages and leader-addressed steers have no marker at all.
test: Traced every write to `chatMessages` and `aiTeamAssignments`; enumerated all timestamp fields on both row types; checked the UI's only metadata surfaces.
expecting: n/a — confirmed
next_action: report diagnosis (goal: find_root_cause_only)

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: Each user message shows a seen state; clicking it reveals who read it and the timestamp (date + time).
actual: "khi tôi chat tôi không biết là agent hay leader đã tiếp nhận được tin nhắn của tôi chưa, tôi muốn dạng giống như chat thực tế, có phần seen, click vào thì biết seen by x lúc mấy giờ, ngày nào."
errors: None reported.
reproduction: Test 7 in .planning/phases/37.1-live-steering-leader-amends-assignments-and-steers-running-a/37.1-UAT.md — send a message to the leader or an agent and look for a read receipt.
started: Discovered during UAT of phase 37.1.

## Eliminated
<!-- APPEND only - prevents re-investigating -->

- hypothesis: A read/delivery timestamp field exists but is not rendered in the UI
  evidence: `ChatMessage` (src/types/models.ts:285-319) has exactly one timestamp, `createdAt` (:290). Grep for `readAt|seenAt|deliveredAt|readBy|seenBy|receivedAt|acknowledgedAt` across src/ returns zero hits. `AiTeamAssignment` (src/types/aiOffice.ts:199-232) timestamps are `queuedAt`/`startedAt`/`endedAt` — attempt lifecycle, not message read.
  timestamp: 2026-11-12
- hypothesis: The existing steer badge already answers "did the leader/agent read it"
  evidence: The badge only renders on `messageKind === 'steer'` rows that have a `targetAgentId` (TeamWorkspace.tsx:405-418, skip at :410) and only encodes three states: pending / held / (absent). It carries no actor name and no timestamp, and it disappears once delivered — so it cannot answer "seen by X at date/time".
  timestamp: 2026-11-12

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-11-12
  checked: ChatMessage row shape (src/types/models.ts:285-319)
  found: Only `createdAt` (:290). Link fields are batchId/assignmentId/attemptNo/runStatus/stopReason/incomplete/supersededByMessageId/supersededAt. No read/delivered field.
  implication: (a) No read timestamp persisted today. A seen receipt needs a new field.

- timestamp: 2026-11-12
  checked: Dexie index spec for chatMessages (src/db/schema.ts:65) and latest version (src/db/schema.ts:150-159)
  found: `chatMessages: 'id, threadId, role, createdAt'` unchanged since SCHEMA_V8; LATEST_SCHEMA_VERSION = 22 (SCHEMA_V22 adds only aiTeamBatches/aiTeamAssignments).
  implication: An optional non-indexed field on ChatMessage needs NO Dexie version bump — Dexie stores whole objects and the index spec is untouched. Precedent: `supersededAt`/`supersededByMessageId` were added in commit 0ac7c757 with zero changes to src/db/schema.ts.

- timestamp: 2026-11-12
  checked: All writers of `chatMessages.update` / `put` (grep)
  found: AIChatDrawer.tsx:1943 (grounding), teamTranscriptRepo.ts:199 (supersede), teamRunCoordinator.ts:769 (report patch), :945 (report link), :1800 (stamp batchId on a steer row). None writes a read/delivered timestamp.
  implication: Nothing today records "who read this message, when".

- timestamp: 2026-11-12
  checked: `pendingSteerMessageIds` (teamRunCoordinator.ts:567, add :1479, drain :1562-1567, post-turn clear :1700; exposed as `snapshot.pendingSteerMessageIds` :119)
  found: In-memory Set only. Absence from the set means the leader drained/read it — but there is no timestamp, it is lost on remount/dispose, and it only exists for `messageKind:'steer'` rows.
  implication: Usable as a live "leader has not read yet" signal for steers (it already is, as `'pending'`), not as a seen receipt.

- timestamp: 2026-11-12
  checked: `deliverSteer` (teamRunCoordinator.ts:1739-1817)
  found: The only writer that ADDS to `steerMessageIds` (:1797-1799), inside one `rw` transaction with the `batchId` stamp (:1800). Refuses when `targetAgentId === undefined` (:1751). `pendingSteerMessageIds.delete` at :1814.
  implication: `steerMessageIds` is the closest durable "delivered to the agent's inbox" marker, but it is a bare `string[]` — no per-id timestamp, no actor, and leader-only steers never get one.

- timestamp: 2026-11-12
  checked: `drainSteerInbox` (teamRunCoordinator.ts:1518-1547) and `injectedSteerIdsByAttempt` (:574, :1528-1535)
  found: The actual "agent read it at its next tool round" moment is the `bulkGet` at :1536 plus the pre-await claim at :1534-1535. `injectedSteerIdsByAttempt` is memory-only and deliberately NOT written to the ledger (CR-04 comment :1512-1516). Not exposed in the snapshot.
  implication: The true agent-read signal exists in memory only, is never persisted, and is never surfaced to the UI. This is why the user cannot tell whether an agent received anything.

- timestamp: 2026-11-12
  checked: UI metadata surfaces (ChatMessageBubble.tsx:1168-1186 steer caption/badge; :1451-1455 timestamp row)
  found: The only per-row metadata rendered is `formattedTime` from `msg.createdAt` (:359-361) and the two-state steer badge. No seen indicator, no popover, no actor list.
  implication: Even if a timestamp existed, no component renders it.

- timestamp: 2026-11-12
  checked: Plain user message path (`send` at teamRunCoordinator.ts:2117, lead turn at :1368 / :1623)
  found: An idle submit saves a plain user row with no `messageKind`, then `startLeadTurn(text)` passes the text as `originalRequest` directly — the leader reads it without any DB read-marking. @mention path (:2123-2129) likewise passes text straight to `startEmployeeTurn`.
  implication: For non-steer messages there is not even an in-memory marker. A full chat-style seen receipt needs new writes on both the lead turn and the mention turn.

- timestamp: 2026-11-12
  checked: TeamWorkspace steer-state derivation (TeamWorkspace.tsx:370-418)
  found: `deliveredSteerIds` (:387-393) is built from `aiTeamAssignments.steerMessageIds` scoped by `batchId` (indexed). `steerStates` (:405-418) yields `'pending' | 'held'` only; rows without `targetAgentId` are skipped (:410).
  implication: Existing plumbing already reads the durable marker reactively — a seen indicator could hang off the same query, but the marker carries no time.

- timestamp: 2026-11-12
  checked: Backup schemas (src/validation/backupSchemas.ts:291-353, :731, :771, :785)
  found: `BackupChatMessageRecordSchema` is a plain `z.object` — undeclared keys are silently stripped on restore (comment :320-322). `BackupAiTeamAssignmentRecordSchema` is `z.strictObject` (:731) — an undeclared key fails loudly. `BACKUP_SCHEMA_VERSION = 13` (:785). Precedent commit c6e073cf added optional `steerMessageIds` and kept version 13.
  implication: Any new message field must be declared in `BackupChatMessageRecordSchema` or it silently vanishes on restore. Any new assignment field must be declared or restore rejects. Optional fields do not require a version bump.

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: |
  No read/delivery timestamp is persisted anywhere. `ChatMessage` has only `createdAt`
  (src/types/models.ts:290); grep for readAt/seenAt/deliveredAt/readBy/seenBy/receivedAt
  returns zero hits. The three markers that exist are not receipts:
  (1) `pendingSteerMessageIds` — in-memory only, steers only, no timestamp, no actor
  (teamRunCoordinator.ts:567, :1479, :1566, :1700);
  (2) `AiTeamAssignment.steerMessageIds` — durable, but a bare id array with no time,
  written only by `deliverSteer` and only for steers with a `targetAgentId`
  (teamRunCoordinator.ts:1751, :1797-1799);
  (3) `injectedSteerIdsByAttempt` — the real "agent read it" moment, memory-only and
  never surfaced (teamRunCoordinator.ts:574, :1528-1536).
  Plain (non-steer) user messages have no marker at all: `send()` persists the row
  (:2117) and hands the text straight to the lead turn, so nothing observes a read.
  The UI renders only `createdAt` and a two-state steer badge
  (ChatMessageBubble.tsx:1168-1186, :1451-1455), so there is nothing to click.
fix: (not applied — goal: find_root_cause_only)
verification: n/a
files_changed: []
