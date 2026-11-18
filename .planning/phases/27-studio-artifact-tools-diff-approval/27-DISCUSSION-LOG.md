# Phase 27: Studio Artifact Tools & Diff Approval - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-04
**Phase:** 27-Studio Artifact Tools & Diff Approval
**Areas discussed:** Approval card & diff rendering, Section index & targeting, Nhiều patch & luồng turn, Giới hạn diff & từ chối

---

## Approval card & diff rendering

| Option | Description | Selected |
|--------|-------------|----------|
| Side-verbatim, scroll | Dòng added xanh + removed đỏ, monospace, max-height + scroll riêng trong card | ✓ |
| Collapse + modal | Card hiển thị N dòng đầu + "xem toàn bộ" mở modal | |
| Plain diff block | Markdown ```diff block trong bong bóng chat, không component riêng | |

**User's choice:** Side-verbatim, scroll (recommended)
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Đủ quyết định | Section title, kind/version, +N/-N, nút Duyệt/Từ chối | ✓ |
| Tối giản | Chỉ diff + nút | |
| Kèm context preview | Thêm 2-3 dòng ngữ cảnh quanh section sau patch | |

**User's choice:** Đủ quyết định (recommended)
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Vô hiệu + cảnh báo | Giữ diff cũ + cảnh báo stale, Approve disabled, re-request qua chat | ✓ |
| Cho approve với merge | Approve vẫn enabled, merge diff vào bản mới nhất | |
| Thu gọn khi stale | Card tự thu gọn, phải yêu cầu patch lại | |

**User's choice:** Vô hiệu + cảnh báo (recommended)
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Reject thuần | Chỉ ghi quyết định vào transcript; feedback tiếp theo gõ bình thường | ✓ |
| Reject kèm lý do | Hộp nhập lý do, gửi vào thread | |
| Reject + auto retry | 1-click tạo turn mới yêu cầu model sửa lại | |

**User's choice:** Reject thuần (recommended)
**Notes:** —

## Section index & targeting

Claude discretion (user asked to take recommended for all remaining questions):
- Index từ Markdown headings, dotted numbering (`2.1`), stable.
- Target theo section ID; drift → structured error + current index, model re-read. No fuzzy matching.

## Nhiều patch & luồng turn

Claude discretion:
- Nhiều patch/turn cho phép, card xử lý tuần tự, park ở awaiting-approval.
- Patch sau tính trên draft hiện tại; card trước reject → card sau stale nếu diff không còn khớp.

## Giới hạn diff & từ chối

Claude discretion:
- Cap số dòng thay đổi; vượt → tool refuse, yêu cầu tách patch nhỏ.
- Refusal (preview/historical, thiếu prerequisite, oversized) → structured result, thông báo rõ ràng kèm hướng dẫn (25.3 D-20 style).

## Claude's Discretion

- Exact diff line cap, section-ID encoding, diff computation utility.
- Card copy và Ant Design treatment.
- Internal representation của pending patch cards trong runtime state.

## Deferred Ideas

None — discussion stayed within phase scope.
