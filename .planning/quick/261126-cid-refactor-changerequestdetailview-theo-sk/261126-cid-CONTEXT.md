# Quick Task 261126-cid: Refactor CR detail + task list theo sketch A - Context

**Gathered:** 2026-11-26
**Status:** Ready for planning

<domain>
## Task Boundary

Refactor `ChangeRequestDetailView` theo sketch 009 variant A (header nén, stats strip, bảng task đầy đủ, docs/notes/Jira/reminders hiện thẳng) và `TasksView`/`TaskTable` theo sketch 010 variant A (toolbar tìm/lọc dính đầu, batch bar nổi khi chọn row). Fix mọi critical/warning từ code review, type-check và targeted test liên quan.
</domain>

<decisions>
## Implementation Decisions

### CR detail layout
- Giữ thứ tự 5 cột bảng task hiện tại và toàn bộ `data-testid` cũ để không phá test/hành vi; chỉ đổi phần bao quanh (stats strip, bố cục 2 cột, bỏ collapse của khối phụ).
- Stats strip lấy số liệu thật từ dữ liệu đã load sẵn (task, note count, docs, reminders); không thêm query mới không cần thiết.

### Task list layout
- Giữ cấu trúc bảng TaskTable và các cột/test IDs hiện tại; thêm sticky toolbar và cải tiến batch bar nổi để khớp sketch A. Không rút gọn cột, không đổi behavior lọc/sắp xếp.
- Ưu tiên CSS/tiếp cận ít thay đổi DOM nhất; accessibility (focus, aria-label) giữ nguyên hoặc cải thiện.

### Quality scope
- Chạy review chuyên sâu (critical + warning), type-check, và targeted test liên quan. Sửa mọi finding có liên quan đến diff này trước khi hoàn tất. Không để lại warning known nào trong phạm vi task.
- Không chạy full test suite (đã ghi chú trong memory là >1 giờ); chỉ targeted files.

### Claude's Discretion
- Chi tiết CSS, tên class, và cách tách component nhỏ nếu cần — theo pattern có sẵn trong repo và `sketch-findings-task-management`.
</decisions>

<specifics>
## Specific Ideas

- Sketch 009: `.planning/sketches/009-cr-detail-fast-scan/index.html` (winner A)
- Sketch 010: `.planning/sketches/010-task-list-triage/index.html` (winner A)
- Design findings: `.claude/skills/sketch-findings-task-management/SKILL.md`
</specifics>

<canonical_refs>
## Canonical References

- Project instructions: `CLAUDE.md` (GSD workflow enforcement, conventions)
- Design tokens: `src/styles/tokens.ts`, `src/components/ui/ui-tokens.css`
</canonical_refs>
