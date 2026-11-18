# Phase 38: Hard token budget + accurate measurement - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-13
**Phase:** 38-hard-token-budget-accurate-measurement
**Areas discussed:** Ngưỡng + tạm dừng, Cách tính usage, Chia budget + thành viên đổi, Hiển thị budget

---

## Area selection

All four proposed areas were selected.

---

## Ngưỡng cảnh báo

| Option | Description | Selected |
|--------|-------------|----------|
| Hai nấc: cảnh báo + chặn | 80% cảnh báo, 100% chặn gọi model | |
| Ba nấc | 80/90/100, ba mốc cấu hình riêng | |
| Giữ một mốc | Chỉ một mốc 80%, sửa thành 100% chặn thật | |
| (free text) | "chỉ có ngưỡng cảnh báo, không được chặn, phải ưu tiên hoàn thành công việc chứ không phải đứt giữa chừng" | ✓ |

**User's choice:** Chỉ cảnh báo, không chặn.
**Notes:** Override AIO-BUDGET-01 ("refused, not run"), AIO-BUDGET-09 (pause/resume) và C-11. Roadmap criteria 1 & 6 phải đọc lại theo quyết định này.

---

## Phạm vi đo ngưỡng

| Option | Description | Selected |
|--------|-------------|----------|
| Cả member và nhóm | Mỗi member có phần riêng + trần tổng nhóm | ✓ |
| Chỉ từng member | Bỏ trần nhóm | |
| Chỉ tổng nhóm | Một agent có thể ăn hết ngân sách người khác | |

**User's choice:** Cả member và nhóm.
**Notes:** —

---

## Nơi cấu hình ngưỡng

| Option | Description | Selected |
|--------|-------------|----------|
| Global default + override nhóm | Settings default, mỗi `AiTeam` override | ✓ |
| Chỉ global | Không chỉnh riêng được | |
| Chỉ theo nhóm | Không có giá trị global | |

**User's choice:** Global default + override nhóm.

---

## Cách đo prompt (AIO-BUDGET-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Heuristic ký tự ÷4 | Không thêm dependency | |
| Thêm tokenizer | Đếm cục bộ chính xác hơn | ✓ |
| Proxy usage lượt trước | Không có gì để đếm ở lượt đầu | |

**User's choice:** Thêm tokenizer.
**Notes:** Chọn cụ thể `js-tiktoken`. Đây là ngoại lệ có ý thức với nguyên tắc zero-new-deps của các phase trước — ghi ở CONTEXT D-07.

---

## Hành vi khi đã dùng hết budget

| Option | Description | Selected |
|--------|-------------|----------|
| Chạy tiếp, chỉ cảnh báo | Không hỏi, không dừng | |
| Hỏi user một lần | Một lần xác nhận cho phần còn lại của lượt | |
| Tạm dừng có nút tiếp tục | Giữ gate, cần user bấm | |
| (free text) | "chỉ cảnh báo, gửi cả OS notification cho user, nếu cần user sẽ manual stop, không chặn cứng" | ✓ |

**User's choice:** Cảnh báo + OS notification, user tự bấm Stop.
**Notes:** Nguồn của D-02 và D-06 (chống spam notification).

---

## Quan hệ cảnh báo member vs nhóm

| Option | Description | Selected |
|--------|-------------|----------|
| Chỉ cảnh báo theo tổng nhóm | Member vượt phần mình không báo nếu nhóm còn dư | |
| Cảnh báo cả hai mức | Badge riêng cho member và cho nhóm | ✓ |
| Member mềm + leader tự điều tiết | Leader thấy cảnh báo, runtime không chặn ai | |

**User's choice:** Cả hai mức.

---

## Response thiếu usage

| Option | Description | Selected |
|--------|-------------|----------|
| Ước lượng + đánh dấu | Tokenizer trên prompt + output đã nhận, có nhãn | ✓ |
| Mức phẳng theo model | Cộng cố định mỗi lượt | |
| Không tính, hiện không rõ | Bỏ trống | |

**User's choice:** Ước lượng + đánh dấu.

---

## Cache token

| Option | Description | Selected |
|--------|-------------|----------|
| Không tính cache | Chỉ input không-cache + output | |
| Tính tất cả | Cộng cả cache read/write vào used | ✓ |
| Quy đổi theo giá | Hệ số 0.1 / 1.25 | |

**User's choice:** Tính tất cả.
**Notes:** Budget là thước token luỹ kế, không phải thước chi phí.

---

## Retry

| Option | Description | Selected |
|--------|-------------|----------|
| Tính từng attempt | Mỗi lần gọi đều cộng, usage ghi trên attempt row | ✓ |
| Chỉ tính lần thành công | Báo sai chi phí | |
| Tính từng attempt, hiển thị gộp | Gộp theo assignment, expand chi tiết | |

**User's choice:** Tính từng attempt.

---

## Stream bị abort

| Option | Description | Selected |
|--------|-------------|----------|
| Dùng usage provider, thiếu thì ước lượng | Ưu tiên số thật | ✓ |
| Luôn ước lượng khi abort | Đề phòng provider báo số của phản hồi chưa gửi | |
| Không tính lượt abort | Mất dấu token đã tiêu | |

**User's choice:** Dùng usage provider, thiếu thì ước lượng.

---

## Phần dư khi chia đều

| Option | Description | Selected |
|--------|-------------|----------|
| Dồn về leader | Hiện trạng `writeEvenSplit` | ✓ |
| Rải đều 1 token | Phụ thuộc thứ tự roster | |
| Giữ ở quỹ chung | Không ai được hơn | |

**User's choice:** Dồn về leader (giữ nguyên).

---

## Thêm agent sau khi đã cấp budget

| Option | Description | Selected |
|--------|-------------|----------|
| Không chia lại, cấp 0 tới khi top-up | Thành viên cũ giữ nguyên phần | ✓ |
| Chia lại toàn bộ | Người cũ có thể bị giảm, thậm chí vượt phần mới | |
| Cấp phần mới từ phần chưa dùng | Phức tạp khi nhóm đã tiêu gần hết | |

**User's choice:** Không chia lại, cấp 0 cho tới khi top-up.

---

## Top-up nhóm

| Option | Description | Selected |
|--------|-------------|----------|
| Chia đều phần tăng | Sửa lỗi member gate kẹt đóng | ✓ |
| Chỉ tăng tổng nhóm | Ít thay đổi dữ liệu hơn | |
| Quỹ chung riêng | Cần thêm bước top-up agent | |
| (free text) | "chia đều phần tăng và lưu ý là nếu topup từng agent phải tăng tổng nhóm lên" | ✓ |

**User's choice:** Chia đều phần tăng; top-up từng agent phải tăng tổng nhóm.

---

## WR-13

Câu hỏi ban đầu không rõ với user ("không hiểu?"). Đã giải thích bằng ví dụ: coordinator cache danh sách thành viên một lần, agent thêm giữa chừng không được thấy khi top-up → top-up lặng lẽ no-op, trong khi agent mới có budget 0 và top-up là đường duy nhất để có ngân sách.

| Option | Description | Selected |
|--------|-------------|----------|
| Đọc roster tươi khi top-up | Sửa tại seam `loadRoster` | ✓ |
| Từ chối rõ + hẹn lượt sau | Giữ cache, báo lỗi minh bạch | |
| Để sang phase 40 | Ghi nợ | |

**User's choice:** Đọc roster tươi khi top-up.

---

## Vị trí hiển thị

| Option | Description | Selected |
|--------|-------------|----------|
| Header nhóm + sidebar member | Transcript sạch | ✓ |
| Thêm số trên từng bubble | Transcript dài hơn | |
| Panel riêng đầy đủ | Header chỉ hiện % | |

**User's choice:** Header nhóm + sidebar member.

---

## Đơn vị

| Option | Description | Selected |
|--------|-------------|----------|
| Token thô + % | Dễ đối chiếu provider | ✓ |
| Chỉ % | Khó biết chính xác | |
| Token + tiền ước tính | Cần bảng giá model | |

**User's choice:** Token thô + %.

---

## Realtime hay theo lượt

| Option | Description | Selected |
|--------|-------------|----------|
| Live trong lượt, chốt khi xong | UI tiến theo response, DB ghi khi attempt kết thúc | ✓ |
| Chỉ cập nhật khi kết thúc | Số đứng khi agent chạy lâu | |
| Ghi DB từng response | Nhiều transaction hơn | |

**User's choice:** Live trong lượt, chốt khi xong.

---

## Tách input/output

| Option | Description | Selected |
|--------|-------------|----------|
| Lưu tách 2 cột | Đổi backup schema + SQLite | ✓ |
| Chỉ tổng, tooltip tạm | Mất lịch sử tách | |
| Tách trên attempt, tổng trên member | Chi tiết ở panel attempt | |

**User's choice:** Lưu tách 2 cột.

---

## Tokenizer cụ thể

| Option | Description | Selected |
|--------|-------------|----------|
| js-tiktoken | Offline, chính xác với phần lớn model OpenAI-compatible | ✓ |
| Chỉ provider + heuristic | Không thêm dependency | |
| Tokenizer khác | — | |

**User's choice:** `js-tiktoken`.

---

## OS notification

| Option | Description | Selected |
|--------|-------------|----------|
| Mốc rõ, chống spam | Một notification mỗi (nhóm, mức), reset khi top-up/lượt mới | ✓ |
| Chỉ notif khi vượt 100% | Cảnh báo mốc dưới chỉ trong app | |
| Mọi mốc, kèm âm | Nhiều thông báo nếu nhiều agent cùng chạm | |

**User's choice:** Mốc rõ, chống spam.

---

## Cập nhật tài liệu cho override

| Option | Description | Selected |
|--------|-------------|----------|
| Ghi override + sửa REQUIREMENTS/ROADMAP | Agent sau không đọc lại wording cũ | ✓ |
| Chỉ ghi trong CONTEXT | Rủi ro đọc nhầm là gap | |
| Đổi thành hỏi trước khi vượt | Vẫn là "có chặn" | |

**User's choice:** Ghi override + sửa REQUIREMENTS/ROADMAP (D-25). Việc sửa tài liệu là task đầu tiên khi thực thi phase.

---

## Claude's Discretion

- Tên field ledger cho input/output (qua `FORBIDDEN_BACKUP_KEYS`).
- Vị trí chính xác của badge trong header/sidebar; cách hiển thị khi cả hai mức cùng vượt.
- Cache tokenizer instance giữa các lượt hay khởi tạo theo model.
- Số Dexie version kế tiếp và tên field override trên `AiTeam`.

## Deferred Ideas

- Skill versioning/enrichment → Phase 39.
- Explorer 2 tầng, CRUD correctness, walkthrough tổng → Phase 40.
- Quy đổi token sang tiền — không làm.
- Cảnh báo ngoài OS notification — không cần.
- Migration bảo toàn budget cũ — C-16 loại bỏ.
