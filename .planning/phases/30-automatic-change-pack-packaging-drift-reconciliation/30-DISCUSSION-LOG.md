# Phase 30: Automatic Change Pack Packaging & Drift Reconciliation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-06
**Phase:** 30-automatic-change-pack-packaging-drift-reconciliation
**Areas discussed:** Auto-pack Trigger, SSH File Collector, Snapshot Drift, Fallback Layout

---

## Auto-pack Trigger

| Option | Description | Selected |
|--------|-------------|----------|
| Chủ động (Recommended) | Hiển thị thẻ Snapshot (Base, Head, Branch, số files), có nút chính 'Đóng gói & Đối chiếu từ Snapshot'. Người dùng luôn chủ động xem lại thông số trước khi kích hoạt. | ✓ |
| Tự động hoàn toàn | Vừa mở Bước 4, hệ thống lập tức gọi SSH đóng gói zip và đối soát không cần nhấn thêm nút gì. | |
| Tự động lần đầu | Chỉ tự động chạy nếu chưa có pack nào trong MultiPack history. | |

**User's choice:** Chủ động (Recommended)
**Follow-up questions:**
- **Xử lý MultiPack khi re-pack:** Thêm vào MultiPack (Recommended) — luôn thêm pack mới vào danh sách, đặt làm Active pack và cập nhật lại Drift Matrix.
- **Trường hợp thiếu Snapshot:** Cảnh báo + Nút về Bước 3 (Recommended) — hiển thị banner cảnh báo kèm nút CTA quay lại Bước 3 và mở sẵn Dropzone thủ công.
- **Hiển thị tiến trình:** Step-by-step progress (Recommended) — hiển thị các bước cụ thể (Tạo diff -> Thu thập file -> Nén zip -> Đối chiếu drift).

---

## SSH File Collector

| Option | Description | Selected |
|--------|-------------|----------|
| git diff + tar pipeline (Recommended) | 1) git diff base..head lấy diff.patch dạng text. 2) Dùng git archive hoặc tar pipe base64 qua SSH cho danh sách file sql/* và new-files/* được duyệt. Giải nén vào bộ nhớ và đóng gói bằng JSZip. | ✓ |
| git diff + SFTP từng file | Lặp qua từng file mới/sql và gọi SFTP read_file riêng rẽ cho từng file. | |
| Remote zip script | Chạy script tạo file zip sẵn tại remote /tmp rồi tải về. | |

**User's choice:** git diff + tar pipeline (Recommended)
**Follow-up questions:**
- **Chính sách trần dung lượng (ChangePackLimits):** Người dùng đặt câu hỏi sâu: trần zip do ai đặt ra, nếu vượt trần thì có bị mất pack không?
  - Làm rõ: Trần ban đầu là do TaskMate quy định (5MB zip, 2MB/file) cho web/GitHub API sync.
  - Quyết định: Nâng trần thoải mái (Recommended) — nâng trần mặc định cho môi trường Desktop native (25MB zip, 100MB giải nén, 10MB/file, 1000 files) + hỗ trợ mở rộng qua cấu hình.
- **Phạm vi file thu thập qua SSH:** Theo entryPolicy chuẩn (Recommended) — chỉ đóng gói diff.patch, meta.json, sql/* và new-files/*.

---

## Snapshot Drift

| Option | Description | Selected |
|--------|-------------|----------|
| Cảnh báo + Cho chọn hướng (Recommended) | Hiển thị cảnh báo rõ: 'Phát hiện remote branch đã có commit mới (HEAD đã thay đổi so với Snapshot được duyệt)'. Cung cấp 2 lựa chọn: 1) Quay lại Bước 3 duyệt lại, hoặc 2) Vẫn đóng gói theo commit Snapshot đã duyệt. | ✓ |
| Chặn cứng, bắt về Bước 3 | Chặn hoàn toàn việc đóng gói, bắt buộc quay lại Bước 3. | |
| Tự động lấy HEAD mới nhất | Tự động âm thầm lấy commit mới nhất trên remote đóng gói luôn. | |

**User's choice:** Cảnh báo + Cho chọn hướng (Recommended)
**Follow-up questions:**
- **Remote repo có uncommitted files (dirty working tree):** Cảnh báo + Vẫn cho đóng gói (Recommended) — hiển thị warning banner thông báo, nhưng vẫn cho phép đóng gói commit range đã duyệt.

---

## Fallback Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Chính-Phụ (Accordion) (Recommended) | Panel chính trên cùng là thẻ 'Tự động đóng gói từ SSH'. Bên dưới là mục gập mở (Accordion / Collapse): 'Nạp Change Pack thủ công (.zip)' dành cho kịch bản offline. | ✓ |
| Tabs / Segmented tách rời | Dùng Tabs chuyển đổi giữa 2 tab riêng biệt. | |
| Chia 2 cột song song | Đặt 2 khối song song chia đôi màn hình. | |

**User's choice:** Chính-Phụ (Accordion) (Recommended)
**Follow-up questions:**
- **Xử lý khi SSH lỗi hoặc mất kết nối:** Tự động bung Dropzone (Recommended) — hiển thị banner lỗi SSH kèm nút thử lại, đồng thời tự động mở bung Accordion Dropzone thủ công để người dùng thao tác ngay.

---

## Claude's Discretion

- Thiết kế giao diện chi tiết cho Progress Stepper và các icon trạng thái.
- Shell argument escaping cho lệnh tar qua SSH để hỗ trợ ký tự đặc biệt.
- Vị trí cụ thể của cấu hình nâng trần trong Settings UI.

## Deferred Ideas

None.
