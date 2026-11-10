---
phase: 35-shared-primitive-extraction-sdlc-behavior-removal
plan: "01"
subsystem: ai
status: complete
tags: [markdown, patch-proposal, dexie, zod, tdd]
requires: []
provides:
  - Generic note/skill Markdown snapshots by target and id
  - Read-only section patch proposals with drift checks and bounded unified diffs
  - Exported section, newline, refusal, and SHA-256 helpers
  - Sixteen focused patch-core tests and validated TAP RED evidence
affects: [35-03, 35-04, 39-skill-enrichment]
tech-stack:
  added: []
  patterns: [typed-refusal, read-only-proposal, target-id-addressing]
key-files:
  created:
    - src/services/ai/patchProposal.ts
    - tests/services/ai/patchProposal.test.ts
    - .planning/debug/35-01-tdd-red.json
  modified: []
key-decisions:
  - Preserve missing note rows before readNoteMarkdown normalization so absent notes refuse rather than becoming empty snapshots.
  - Keep version zero and unapproved snapshot state until skill versioning is introduced by its planned phase.
requirements-completed: [AIO-REMOVE-01]
actuals:
  tokens: 5172
  tasks: 2
  commits: 4
commits: 4
plan_head_before: b0b7f24aa71cbed0e4ace89883f9e898c305ecbb
plan_head_after: 9dd81cc24e31ddc2bd7bb69e697f014914e441a3
coverage:
  - id: D1
    description: Read note and skill Markdown by target/id with hashes and section indexes, without persistence writes.
    requirement: AIO-REMOVE-01
    verification:
      - kind: unit
        ref: tests/services/ai/patchProposal.test.ts#reads and patches skill Markdown without writing
        status: pass
      - kind: unit
        ref: tests/services/ai/patchProposal.test.ts#keeps an existing empty note distinct from a missing note
        status: pass
    human_judgment: false
  - id: D2
    description: Export generic section patch helpers and return bounded unified diffs or typed refusals.
    requirement: AIO-REMOVE-01
    verification:
      - kind: unit
        ref: npx vitest run tests/services/ai/patchProposal.test.ts
        status: pass
      - kind: other
        ref: Structural acceptance checks for exports, target table reads, and absence of removed-service imports
        status: pass
    human_judgment: false
duration: 29min
completed: 2026-11-10
---

# Phase 35 Plan 01: Generic patch proposal core Summary

**Tách patch core đọc note/skill theo target/id, kiểm tra hash và section, tạo unified diff không ghi dữ liệu; 16 focused tests xanh.**

## Performance

- Started: 2026-11-10T04:07:36Z
- Completed: 2026-11-10T04:36:21Z
- Tasks: 2/2
- Files: 2 code/test files và 1 RED evidence JSON
- Actual tokens: 5,172, tính ceil(tổng ký tự ba file / 4), không dùng số token harness.
- Commit count: 4 task commits, đo từ ledger trước khi tạo metadata commit.

## Accomplishments

- Tạo module độc lập với các service sắp xóa, giữ guard order và thông báo từ chối tiếng Việt.
- Xuất đủ PATCH_LINE_CAP, MAX_DIFF_CELLS, locateSection, detectEol, applyOperation, countLogicalLines, refuse, isRefusal, defaultSha256, readPatchTarget, preparePatch.
- Đọc notes/aiSkills bằng hai nhánh table cố định; validate target/id và patch args bằng safeParse.
- Proposal không ghi note, skill hoặc approval/version; giữ version 0 và unapproved theo hợp đồng hiện tại.
- Test trực tiếp helpers, LF/CRLF detection, append/replace, stale hash, supplied/combined line caps, NO_CHANGES, missing targets, invalid args, empty note, section heading drift, và skill snapshots/proposals.

## Task Commits

1. Task 1 — `8f565dbc`: feat(35-01): extract generic patch proposal core
2. Task 2 RED — `a05a798f`: test(35-01): cover generic patch core and missing target refusal
3. Task 2 GREEN — `efdc8acf`: feat(35-01): return typed refusal for missing patch targets
4. Task 2 coverage refinement — `9dd81cc2`: refactor(35-01): broaden patch proposal coverage

## Files Created/Modified

- `src/services/ai/patchProposal.ts`: snapshot, refusal types, helpers và proposal preparation.
- `tests/services/ai/patchProposal.test.ts`: 16 focused cases; database riêng cho từng case, xóa bằng awaited afterEach cleanup.
- `.planning/debug/35-01-tdd-red.json`: nguyên TAP report, exit code thật, target assertion và semantic assessment.

## Tests and Verification

- `npx vitest run tests/services/ai/patchProposal.test.ts`: **PASS — 16/16**, lần cuối 2026-11-10T04:35:17Z; không chạy full suite.
- `gsd_run check tdd-red-evidence .planning/debug/35-01-tdd-red.json --raw`: **RED_EVIDENCE_OK**, 10 discovered, 9 pass, 1 target assertion fail.
- Structural checks: forbidden scope/type identifiers 0; table-read lines 2; settings/chatTabs/loadWorkflowState 0; deleted-module test imports 0; seven required function exports present; no removed-feature names in new source.
- `npx tsc --noEmit`: **FAIL ngoài phạm vi**. Worktree thiếu nhiều dependency đã khai báo như `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, `@xterm/xterm`, `@xterm/addon-fit`, `@tanstack/react-virtual`; đồng thời có TS7006 và TS2375 trong các file cũ. Không có diagnostic ở hai file patchProposal sau khi sửa narrowing của tests. Không tuyên bố typecheck toàn repo xanh.
- `git diff --check`: **PASS**.
- Quét stub/TODO/FIXME: không có stub cản mục tiêu.

## TDD Gate Compliance

Task 1 là extraction auto; Task 2 tdd=true, workflow.tdd_mode=false.

- RED thật: test missing-note chạy và assert isRefusal(result) nhận false thay vì true. Không phải lỗi import, fixture, discovery hoặc collection.
- TAP rerun được lưu nguyên vẹn và classifier xác nhận RED_EVIDENCE_OK trước GREEN.
- Nguyên nhân: readNoteMarkdown(undefined) trả chuỗi rỗng, che mất row không tồn tại.
- GREEN: giữ row absence trước normalization; 10 test gốc pass, sau đó mở rộng thành 16.
- Một lần refinement bỏ nhầm import isRefusal gây ReferenceError; khôi phục ngay, không coi lần chạy này là RED evidence. Final run 16/16 pass.
- Không cần đổi production architecture hoặc thêm dependency.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Missing note bị coi là tài liệu rỗng**
- Found during: Task 2 RED.
- Issue: cách đọc note được mô tả trong plan normalize row undefined thành ''.
- Fix: short-circuit row presence trước readNoteMarkdown; giữ empty note hợp lệ.
- Files: src/services/ai/patchProposal.ts; tests/services/ai/patchProposal.test.ts.
- Verification: RED_EVIDENCE_OK; missing-note/missing-skill và empty-note tests pass.
- Commit: efdc8acf.

**2. [Rule 3 - Environment] Worktree không có node_modules riêng**
- Dùng dependency có sẵn, không cài package: symlink node_modules trong worktree tới installation hiện có; symlink bị gitignore, không commit.
- Focused tests chạy được. Installation vẫn thiếu dependency ngoài phạm vi nên global typecheck chưa xanh.

## Issues Encountered

- ctx7 không có; đã thử official Zod docs fallback nhưng network fetch thất bại. Dùng safeParse/extend theo contract và patterns hiện có, không thêm package.
- Guard hook từ chối Bash git assertion gộp phức tạp; tách git commands read-only, xác nhận đúng agent branch/base/root trước chỉnh sửa.
- Full typecheck prerequisite chưa đạt vì installation/source ngoài phạm vi. Orchestrator cần xử lý môi trường trước phase-wide verification.
- AIO-REMOVE-01 là requirement dùng chung: summary chỉ chứng minh phần patch-core của plan này; các extraction/consumer plans còn lại do orchestrator tổng hợp.

## Deferred Issues

- Global `npx tsc --noEmit` failure ngoài hai file mới. Không sửa source/dependencies ngoài scope.

## User Setup Required

Không có secret hoặc dịch vụ bên ngoài cần thiết.

## Next Phase Readiness

- Sẵn patch core/types cho 35-03, 35-04 và Phase 39.
- Chưa đổi consumer hoặc xóa file cũ; đúng thứ tự extraction trước deletion.
- Không sửa STATE.md, ROADMAP.md, REQUIREMENTS.md hoặc planning artifacts dùng chung; orchestrator sở hữu cập nhật.

## Self-Check: PASSED

- Ba file tạo mới tồn tại.
- Bốn task commits đều thuộc ancestry của HEAD.
- Không tracked file bị xóa; final focused suite 16/16 pass.
- Global typecheck failure được ghi rõ, không tính là passed.
