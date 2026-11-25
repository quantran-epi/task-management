---
phase: 261125-u4w
plan: 01
subsystem: ai, team-chat, grounded-synthesis
tags: [pinned-context, roster, global-conventions, grounded-turn, tdd]

requires: []
provides:
  - "Pin của team được đọc fresh từ roster.teamRow cho cả employee và leader turn"
  - "Grounded turn của AI Chat panel nhận framed global conventions qua GroundedTurnInput.instructions"
affects: [teamRunCoordinator, AIChatDrawer, groundedTurn]

tech-stack:
  added: []
  patterns:
    - "Fresh persisted row at read site thay vì UI mirror cho standing instruction"
    - "Optional instructions field luân chuyển từ panel tới synthesis, empty-safe"

key-files:
  created: []
  modified:
    - src/services/ai/office/teamRunCoordinator.ts
    - tests/services/ai/office/teamRunCoordinator.test.ts
    - src/services/ai/groundedTurn.ts
    - src/components/ai/AIChatDrawer.tsx
    - tests/ai/groundedSynthesis.test.ts
    - tests/ai/AIChatDrawerGroundedWiring.test.tsx

key-decisions:
  - "Đọc pin từ (roster.teamRow ?? liveTeam).pinnedContext ở cả hai builder; giữ liveTeam cho toggle/docsFolderId và fallback legacy"
  - "Dùng docsProbe.fail để giữ mirror stale trong test — đây là đường có thật liveTeam không được refresh từ DB"
  - "Đọc global convention một lần trước nhánh grounded, tái dùng snapshot cho turn thường; repo convention vẫn chỉ tải trên turn thường"
  - "GroundedTurnInput.instructions optional, nối sau seed-only constraint thay vì ghi đè"

patterns-established:
  - "Trusted standing instruction lấy từ persisted row, không lấy mirror UI"
  - "Global conventions truyền qua instructions tới mọi synthesized grounded answer"

requirements-completed: []
duration: ~24min
completed: 2026-11-25
---

# Quick Task 261125-u4w: Pin tươi và global convention trong grounded turn

Hai lỗi đọc context cũ: pin của team bị lấy từ mirror `liveTeam` trong coordinator, và grounded turn của AI Chat panel thoát trước khi global conventions được đọc. Cả hai được sửa tại chỗ đọc dữ liệu, không thêm UI mirror hay state tạm.

## Performance

- Bắt đầu: 2026-11-25T14:50:18Z
- Kết thúc: 2026-11-25T15:13:01Z
- 2 task, 6 file, 5 commit atomic (RED rồi GREEN cho mỗi task).

## Accomplishments

- Employee và leader turn đều dựng pin segment từ `roster.teamRow ?? liveTeam`; badge UI và prompt cùng nguồn hàng `aiTeams` đã persist.
- Thin pin và đổi pin giữa chừng có hiệu lực ngay lượt sau; global conventions của team, thứ tự global→repo, framing trusted và fallback legacy giữ nguyên.
- `AIChatDrawer` đọc global convention một lần trước nhánh grounded; mọi grounded return kind nhận segment đã frame qua `GroundedTurnInput.instructions` → `SynthesisInput.instructions` → `buildSystemPrompt`.
- Turn thường vẫn có global + repo convention đúng một lần; grounding seed-only vẫn giữ constraint riêng.

## Task Commits

| Task | Commit | Nội dung |
|------|--------|----------|
| 1 RED | `f8caef68` | `test(261125-u4w-01): add failing tests for fresh pinned context per turn` |
| 1 GREEN | `0058409f` | `fix(261125-u4w-01): read pinned context from fresh roster row` |
| 2 RED | `2f431183` | `test(261125-u4w-02): add failing tests for grounded global conventions` |
| 2 GREEN | `180c3f21` | `fix(261125-u4w-02): pass framed global conventions into grounded turns` |

## RED → GREEN evidence

- Task 1 RED: `npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts -t 'pinned context is read fresh'` → 3 failed / 1 passed. Lỗi đúng assert: employee prompt thiếu `PIN B`, leader prompt thiếu `PIN B`, prompt xoá pin vẫn giữ header pin cũ (docs backfill thất bại làm `liveTeam` giữ pin stale).
- Task 1 GREEN: `npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts tests/services/ai/office/teamPrompts.test.ts --bail=1` → 2 files / 275 tests passed.
- Task 2 RED: 2 test mới thất bại — `input.instructions` là `undefined` trong cả hai grounded kind; unit test xác nhận field chưa có trong payload synthesis.
- Task 2 GREEN (targeted): 4 test `261125-u4w` passed (2 synthesis + 2 panel), `tests/ai/AIChatDrawerConventions.test.tsx` 6/6 passed.

## Verification

- `npx tsc --noEmit` → sạch (exit 0), chạy lại sau cả hai task.
- Task 1 scoped suite → 275/275 passed.
- Task 2 scoped suite: lệnh đầy đủ trong plan có 1 failure có sẵn ở baseline (`tests/ai/groundedSynthesis.test.ts` test 31: `expected 180 to be 420`, record cap của digest). Đã chạy lại cùng lệnh sau khi stash toàn bộ thay đổi của task này → failure y hệt, chứng minh không phải regression. Các test mới đều xanh; `tests/ai/AIChatDrawerConventions.test.tsx` xanh.
- Kiểm tra `tests/ai/AIChatDrawerGroundedWiring.test.tsx` test 2 (`D-09 drawer close mid-turn ... unmount aborts`) cũng thất bại ở baseline khi chạy đơn lẻ; không đụng vào.
- Không chạy full vitest suite (quy tắc dự án).

## Review findings

- Diff của 5 commit trên phạm vi đúng 6 file trong `files_modified`; `teamPrompts.ts` và `groundedSynthesis.ts` verify-only, không đổi.
- `git diff --check` sạch. Không file rule markdown hay SHA256SUMS, không worktree/branch mới, không commit docs artifacts.
- Các commit `d71cd62a` (quick 261125-ulp, workstream khác) nằm xen giữa hai commit của task 2 nhưng không nằm trong diff của 5 commit u4w; `.planning/debug/footer-ai-indicator-session-loss.md` và thư mục quick 261125-ulp vẫn untracked, không đụng.

## Decisions Made

- Không thêm UI mirror: pin chỉ đọc từ hàng đã persist; `setTeamSettings` vẫn chỉ nhận toggle.
- Không định nghĩa field mới trong `SynthesisInput` (`instructions` đã có); chỉ thêm field optional trên `GroundedTurnInput`.
- Không đụng `synthesizeFromStoredEvidence` (re-synthesis từ evidence đã lưu nằm ngoài scope).

## Deviations from Plan

- **Guard của Test 1 được mở rộng**: plan mô tả đổi pin giữa hai lượt là đủ để RED, nhưng `ensureDocsReady()` làm mới `liveTeam` từ DB nên kịch bản đó xanh sẵn. Thêm `docsProbe.fail = true` ở lượt hai (đường có thật mirror stale) để test phản ánh đúng lỗi. Không đổi production code ngoài 2 dòng theo plan.
- **Task 2 scoped suite có 1 failure có sẵn**: test 31 của `groundedSynthesis.test.ts` (`expected 180 to be 420`) thất bại cả trước và sau change; ghi nhận, không sửa vì nằm ngoài scope.

**Total deviations:** 2 auto-documented. **Impact:** không ảnh hưởng must-have; cả hai lỗi đã xác minh bằng targeted tests xanh và tsc sạch.

## Issues Encountered

- None blocking. Hai baseline failures nêu trên được ghi nhận rõ để orchestrator không hiểu nhầm là regression.

## Next Phase Readiness

- Sẵn sàng để orchestrator cập nhật STATE.md/commit docs artifacts. Không còn công việc code cho quick task này.

## Self-Check: PASSED
