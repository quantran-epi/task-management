# Phase 26: SDLC Prompt Grounding & Tool-Use Policy - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-03
**Phase:** 26-SDLC Prompt Grounding & Tool-Use Policy
**Areas discussed:** Grounding theo step, Tool policy + few-shot, Intent → artifact contract, Bounded tool loop

---

## Grounding theo step

| Option | Description | Selected |
|--------|-------------|----------|
| Tối thiểu theo step | Mỗi step nhận dependency evidence cần thiết | ✓ |
| Toàn bộ chain | Gửi toàn bộ artifact đã có | |
| Chỉ artifact active | Chỉ gửi artifact trực tiếp | |

**User's choice:** Tối thiểu theo step.
**Notes:** Grounding dùng section có nhãn nguồn ổn định. Retrieved evidence bị giới hạn cố định, báo thiếu và cho phép re-query hẹp hơn.

---

## Tool policy + few-shot

| Option | Description | Selected |
|--------|-------------|----------|
| Allowlist theo step | Mỗi step có danh sách tool cụ thể | ✓ |
| Một allowlist chung | Mọi step nhận cùng tool set | |
| Model tự chọn | Gửi toàn bộ tool, chỉ hướng dẫn bằng prompt | |

**User's choice:** Allowlist theo step.
**Notes:** Evidence thiếu thì re-query hẹp hơn rồi abstain. Mỗi step phải có ví dụ tool-calling và evidence-insufficient.

---

## Intent → artifact contract

| Option | Description | Selected |
|--------|-------------|----------|
| Intent explicit trước | UI/host truyền artifact kind; composer không tự đoán | ✓ |
| Composer tự suy luận | Composer đoán từ user text | |
| Step mặc định | Mỗi step luôn một contract | |

**User's choice:** Intent explicit trước.
**Notes:** TECH_DOCS có action/intent riêng cho PL03B và PL07. Yêu cầu artifact mơ hồ phải hỏi lại. Intent sai step hoặc thiếu prerequisite bị từ chối trước khi gọi model.

---

## Bounded tool loop

| Option | Description | Selected |
|--------|-------------|----------|
| Hằng số cao + override test | Default explicit cao, có override cho test | ✓ |
| Theo step | Mỗi step có trần riêng | |
| Không trần thực tế | Chạy đến khi model dừng | |

**User's choice:** Hằng số cao + override test.
**Notes:** User yêu cầu trần thật lớn, ưu tiên chính xác và đầy đủ. Đếm theo round; không dispatch batch vượt trần. Giữ activity runtime và hiển thị terminal status, không lưu partial/error thành assistant message.

---

## Claude's Discretion

- Exact budget numbers, delimiters, allowlist contents, and terminal copy remain implementation choices within locked decisions.

## Deferred Ideas

None.
