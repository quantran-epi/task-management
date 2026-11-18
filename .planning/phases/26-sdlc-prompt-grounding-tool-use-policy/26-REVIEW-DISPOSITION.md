---
phase: 26
review: 26-REVIEW.md
titles: json
findings:
  - id: CR-01
    severity: critical
    disposition: fixed
    title: "Cổng tiền-điều-kiện artifact bị vượt bằng marker giả trong văn bản không tin cậy"
  - id: WR-01
    severity: warning
    disposition: fixed
    title: "Guard tiền-điều-kiện của 26-03 làm fail 6 test cũ chưa được cập nhật"
  - id: WR-02
    severity: warning
    disposition: fixed
    title: "Nhánh clarify tạo ngõ chết ở bước không có artifact action và ở chế độ read-only"
  - id: WR-03
    severity: warning
    disposition: fixed
    title: "PL03B/PL07/CAB sinh bằng AI không được chuyển vào editor, body đọng trong transcript"
  - id: IN-01
    severity: info
    disposition: open
    title: "`fitTotal` có thể vượt `maxChars` khi ngân sách rất nhỏ"
  - id: IN-02
    severity: info
    disposition: open
    title: "Tên MCP trùng tên tool đọc cục bộ sinh định nghĩa trùng trong payload"
  - id: IN-03
    severity: info
    disposition: open
    title: "Mock `useChatTurn` thiếu `runtime` nên guard chống gửi trùng không được kiểm chứng"
open: 3
total: 7
recorded: 2026-11-03T15:06:01.482Z
---

# Phase 26: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| CR-01 | critical | fixed | 26-REVIEW-FIX.md |
| WR-01 | warning | fixed | 26-REVIEW-FIX.md |
| WR-02 | warning | fixed | 26-REVIEW-FIX.md |
| WR-03 | warning | fixed | 26-REVIEW-FIX.md |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
