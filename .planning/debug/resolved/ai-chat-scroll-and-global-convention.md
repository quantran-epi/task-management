---
slug: ai-chat-scroll-and-global-convention
status: resolved
trigger: "hiện tại trong ai chat team, khi user chat 1 tin nhắn, chat box chưa scroll xuống bottom, cần fix. thứ 2 là hiện tại global convention đang lưu ở đâu, các thành viên trong ai chat team phải nắm được cái này nhé, nếu chưa thì fix đi, phải đảm bảo work perfect, không đượcu làm lỗi các tính năng hiện tại"
created: 2026-11-17
updated: 2026-11-17
---

# Symptoms

- expected: (1) Sau khi user gửi một tin nhắn trong AI chat team, chat box tự động cuộn xuống cuối (bottom). (2) Global convention được lưu tại một nguồn duy nhất mà mọi member trong AI chat team đều đọc/nắm được.
- actual: (1) Sau khi gửi tin nhắn, chat box không tự cuộn xuống bottom. (2) Chưa rõ global convention đang lưu ở đâu; nếu chưa được truyền tới member thì member không có.
- error: Không có lỗi console/log được báo cáo.
- timeline: Không rõ, chưa kiểm chứng. Cần điều tra bằng code hiện tại và git history.
- repro: (1) Mở AI chat team, nhập một tin nhắn bất kỳ và gửi đi → chat box không tự cuộn xuống cuối. (2) Kiểm tra prompt/context/system message của từng member trong AI chat team xem có chứa global convention không.

# Current Focus

- phase: Phase 4 CONFIRMED → pre-fix structured reasoning checkpoint (both symptoms)
- bug_class: Bohrbug (deterministic wiring omissions; no timing randomness — fixed code paths)
- known_pattern_candidate: none (no knowledge base)
- hypothesis: Two independent root causes. (S1) Team chat's `TeamWorkspace` never supplies/bumps `scrollTrigger` to `ChatMessageList` (via `AiChatWidget.messageListExtensions`), and because it also supplies `onMessageRead`, `followingRef` starts FALSE, disabling the passive auto-scroll — so a send produces no bottom scroll. (S2) Global convention is loaded and injected only in the single-chat drawer; the team prompt builders `buildEmployeeTurnRequest`/`buildLeadTurnRequest` never load or embed it, so no team member receives it.
- test: Test-first — write focused failing tests (ChatMessageList send-scroll with onMessageRead present; team prompt builders with globalConventions input), confirm RED, then apply minimal fix.
- expecting: tests fail before fix (repro) and pass after; adjacent focused tests stay green.

reasoning_checkpoint:
  hypothesis: "S1: team chat omits scrollTrigger and disables passive follow (onMessageRead → followingRef=false), so user send never scrolls transcript. S2: team prompt assembly never calls getGlobalConventions/buildConventionsSegment, so global convention is absent from every team member's system prompt."
  confirming_evidence:
    - "ChatMessageList.tsx L152-157: scrollTrigger effect is the ONLY explicit 'on send' scroll; L127 followingRef=false when onMessageRead supplied; L175 passive scroll gated by followingRef && !firstUnreadMessageId."
    - "TeamWorkspace.tsx L564-593 messageListExtensions contains onMessageRead but NO scrollTrigger; handleSubmit L666-674 only clears draft + runTurn; no scroll bump anywhere (git log -S confirms never existed)."
    - "AIChatDrawer.tsx L1270 bumps setScrollTrigger on send and L2466 passes it via messageListExtensions — the working reference implementation."
    - "conventionService.ts stores global convention at db.settings['global_conventions']; AIChatDrawer L1802-1860 loads it and injects buildConventionsSegment into the single-chat system prompt."
    - "teamPrompts.ts (both builders) has no import/call of getGlobalConventions or buildConventionsSegment; no [GLOBAL CONVENTIONS] block. Coordinator calls these builders at L2142 and L2368."
  falsification_test: "If S1 is wrong, adding a scrollTrigger bump in team chat would not cause a post-render bottom scroll in a focused test with onMessageRead present. If S2 is wrong, the existing team prompt test would already assert a [GLOBAL CONVENTIONS] block (it does not), or the coordinator would already load conventions (it does not)."
  fix_rationale: "S1: supply scrollTrigger from TeamWorkspace on valid send AND make ChatMessageList honor it on the next messages update (so the scroll lands after the user's row renders — the immediate-only scroll would land one message short). S2: keep teamPrompts pure by passing global convention text as a new input; format with the existing buildConventionsSegment so framing/untrusted-data/conflict policy matches the single-chat path; load fresh in the coordinator each turn so edits take effect."
  blind_spots: "Cannot drive real Tauri UI here; verification is test-based + code trace. Streamed agent replies after the send are covered by the same pending-scroll only for the send itself; continuous follow during a long run remains governed by existing followingRef logic. Repo-level conventions for team members are out of scope (user asked for global convention). No Stryker configured → mutation signal degrades to skipped."
  candidate_causes:
    - "code: TeamWorkspace never supplies scrollTrigger; ChatMessageList's send scroll fires before the new message row renders"
    - "code: teamPrompts builders omit the global-convention segment"
    - "config/data: global convention content is stored under db.settings['global_conventions'] but no team code reads that key (data exists but is never consumed)"
    - "environment: none — path is deterministic across environments"
  and_gate: "no — each symptom is fully explained by its own single omitted wiring; the two symptoms are independent and do not require co-occurring conditions. (Two causes total, one per symptom.)"
- next_action: apply the two minimal fixes (ChatMessageList pending-send scroll + TeamWorkspace scrollTrigger; teamPrompts conventionsSegment input + coordinator loading), then re-run focused tests GREEN

- 2026-11-17: TDD RED confirmed. Wrote 2 focused regression tests; `npx vitest run src/components/ai/__tests__/ChatMessageList.test.tsx tests/services/ai/office/teamPrompts.test.ts` → 2 failed | 57 passed (59). Failing: (S1) send scroll does not fire after message row arrives with onMessageRead present; (S2) team prompt builders do not contain `[GLOBAL CONVENTIONS]` segment. Boundary neighbor "emits no convention block when no global convention configured" passed (correct). Oracle type: specified.
- 2026-11-17: Fixes applied. S1: ChatMessageList pendingSendScrollRef (consume on messages growth) + TeamWorkspace scrollTrigger state bumped on valid send, passed via messageListExtensions. S2: teamPrompts both builders take `conventionsSegment`; coordinator loads fresh `getGlobalConventions(db)` per turn through `buildConventionsSegment`.
- 2026-11-17: GREEN — focused 2 files 59/59 pass; adjacent 7 files 57/57 pass; `tsc --noEmit` clean.
- 2026-11-17: Scheduler test `leaves the third assignment queued` fails in teamRunCoordinator.test.ts. A/B verified PRE-EXISTING: reverting coordinator to HEAD reproduces identical failure (`expected ['emp-a-model'] to equal ['emp-a-model','emp-b-model']`). Not caused by this fix; excluded from guardrail.

# Evidence

- 2026-11-17: KB checked — `.planning/debug/knowledge-base.md` does not exist; no prior pattern to reuse.
- 2026-11-17: `ChatMessageList.tsx` has `scrollTrigger?: number` prop whose comment says "Immediate scroll to bottom when user hits Send"; effect at L152-157 calls `scrollToBottom(true)` when it changes. `scrollToBottom` (L139-150) sets `scrollTop=scrollHeight` + `bottomRef.scrollIntoView`.
- 2026-11-17: Only TWO call sites of ChatMessageList. `AIChatDrawer.tsx` passes `scrollTrigger` via `messageListExtensions` (L2466) and bumps `setScrollTrigger(prev+1)` on send (L1270). `AiChatWidget.tsx` (L402-419) does NOT pass scrollTrigger; it spreads `messageListExtensions`.
- 2026-11-17: TEAM chat uses `AiChatWidget` inside `TeamWorkspace.tsx` (L990-1045). Its `messageListExtensions` memo (L564-593) contains agentDirectory/agentStatuses/seenStates/addressedTo/firstUnreadMessageId/lastReadMessageId/readPositionReady/onMessageRead/onStopAgent/onRetryAgent but NO `scrollTrigger`, and TeamWorkspace never bumps any scroll trigger on submit.
- 2026-11-17: `ChatMessageList.followingRef` initialises to FALSE when `onMessageRead` is provided (L127). TeamWorkspace passes `onMessageRead`, so passive new-message auto-scroll (L175) is blocked whenever `firstUnreadMessageId` is set. Combined with no `scrollTrigger`, a user send in team chat produces NO scroll-to-bottom. Root cause of symptom 1.
- 2026-11-17: Global convention is stored in `db.settings[key='global_conventions']` via `conventionService.ts` (`getGlobalConventions`/`saveGlobalConventions`); composed into SINGLE-chat prompt only in `AIChatDrawer.tsx` (L1802-1860) via `buildConventionsSegment()`.
- 2026-11-17: TEAM agents' system prompts are built in `src/services/ai/office/teamPrompts.ts` (`buildEmployeeTurnRequest` L102, `buildLeadTurnRequest` L301). Neither imports/calls `getGlobalConventions` nor `buildConventionsSegment` — no `[GLOBAL CONVENTIONS]` block. Team members cannot know global convention. Root cause of symptom 2 (pending confirmation of coordinator call path).
- 2026-11-17: `conventionsSegment.ts` exposes `buildConventionsSegment()` which formats `[GLOBAL CONVENTIONS - QUY ƯỚC CHUNG TỔ CHỨC]` header; `teamPrompts.ts` is a PURE function with no DB access, so conventions must be loaded by the coordinator and passed in as input.

# Eliminated

# Resolution

- root_cause: "S1: Team chat (TeamWorkspace) never supplied or bumped a `scrollTrigger` to ChatMessageList (via AiChatWidget.messageListExtensions), and because it passes `onMessageRead` the transcript's `followingRef` starts false — so a user send produced no scroll-to-bottom. Compounding: even the drawer's send scroll fired in the same render as the trigger bump, before the persisted user row arrived. S2: Global convention is stored at db.settings['global_conventions'] and injected only in the single-chat drawer; the team prompt builders `buildEmployeeTurnRequest`/`buildLeadTurnRequest` never loaded or embedded it, so no team member received it."
- fix: "S1: ChatMessageList now holds `pendingSendScrollRef` on trigger bump and consumes it when the message list grows (pins after the row renders); TeamWorkspace adds `scrollTrigger` state, bumps it on every valid send, and passes it via messageListExtensions (mirrors AIChatDrawer). S2: both team prompt builders take an optional `conventionsSegment`; coordinator loads fresh `getGlobalConventions(db)` per turn and formats with the existing `buildConventionsSegment()` (untrusted-data framing + conflict policy), passing to lead and all employees."
- verification:
  target_test: { result: pass, detail: "3 focused files, 60/60 pass (ChatMessageList, teamPrompts, TeamWorkspaceSendScroll) — all authored this session" }
  mutation_check: { result: skipped, reason: "No Stryker configured in repo; substituted targeted file-revert mutants — reverted TeamWorkspace → new test RED (expected undefined to be number), reverted all 4 files → both regression tests RED; reapply → GREEN", mutant_killed: true }
  no_op_deletion: { result: pass, deletion_justified_by_rca: false, detail: "diff is fully additive (+15/-1, +6/-1, +16/-0, +13/-2); only removals are comment rewording and destructuring-array expansion" }
  adjacent_tests: { result: pass, suites_run: [conventionsSegment.test.ts, multiSystemConventionService.test.ts, AIChatDrawerConventions.test.tsx, aiChatUiEnhancements.test.tsx, AiChatWidget.test.tsx, TeamWorkspaceWhitespaceSubmit.test.tsx, TeamWorkspaceSteer.test.tsx], detail: "7 files 57/57 pass" }
  revert_and_reconfirm: { result: pass, bug_returned_on_revert: true, fixed_on_reapply: true }
  tsc: { result: pass, detail: "npx tsc --noEmit clean" }
  guardrail_verdict: accepted
  note: "teamRunCoordinator.test.ts scheduler test 'leaves the third assignment queued' fails, but A/B confirmed PRE-EXISTING (fails identically with coordinator at HEAD) — excluded from this fix's guardrail."
- oracle_type: specified
- files_changed:
  - src/components/ai/ChatMessageList.tsx: pending-send scroll consumed after row render
  - src/components/ai/office/TeamWorkspace.tsx: scrollTrigger state bumped on valid send, passed via messageListExtensions
  - src/services/ai/office/teamPrompts.ts: conventionsSegment input added to both builders
  - src/services/ai/office/teamRunCoordinator.ts: loads getGlobalConventions per turn, formats and passes segment
  - src/components/ai/__tests__/ChatMessageList.test.tsx: S1 consumer regression test
  - tests/services/ai/office/teamPrompts.test.ts: S2 regression + boundary tests
  - tests/components/ai/office/TeamWorkspaceSendScroll.test.tsx: S1 host wiring regression test (new)
