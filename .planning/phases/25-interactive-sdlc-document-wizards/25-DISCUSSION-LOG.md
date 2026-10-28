# Phase 25: Interactive SDLC Document Wizards & Bank Template Generator - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-28
**Phase:** 25-interactive-sdlc-document-wizards
**Areas discussed:** Scope biểu mẫu, Luồng phỏng vấn AI, Cơ chế template docx, Tích hợp ngữ cảnh, Vị trí kích hoạt UI, Xem trước kết quả, Lưu vết docx, Sơ đồ luồng, Thoát Wizard, Metadata ngân hàng

---

## Scope biểu mẫu

| Option | Description | Selected |
|--------|-------------|----------|
| Trọn bộ 4 mẫu | Xây dựng trọn vẹn cả 4 biểu mẫu chuẩn trong cùng 1 phase với engine dùng chung. | ✓ |
| Chỉ tập trung PL02 trước | Tập trung hoàn thiện sâu mẫu PL02 trước, các mẫu PL03/PL07/CAB làm ở phase sau. | |

**User's choice:** Trọn bộ 4 mẫu (PL02, PL03, PL07, CAB).

---

## Luồng phỏng vấn AI

| Option | Description | Selected |
|--------|-------------|----------|
| Hỏi bù lỗ hổng | AI phân tích đầu vào, chỉ hỏi các điểm thiếu sót/nghiệp vụ chưa rõ, sau đó trình tóm tắt duyệt trước khi gen. | ✓ |
| Đi tuần tự từng mục | Hệ thống đi tuần tự qua từng phần của biểu mẫu (1. Mục tiêu -> 2. Luồng To-Be -> 3. Phân quyền...). | |

**User's choice:** Hỏi bù lỗ hổng (Grounded Gap Detection).

---

## Cơ chế template docx

| Option | Description | Selected |
|--------|-------------|----------|
| Code layout docx.js | Code trực tiếp cấu trúc Word bằng docx.js (đảm bảo layout chuẩn 100%, bảng biểu, header/footer). | ✓ |
| Dùng file mẫu chèn biến | Upload file .docx mẫu có chứa biến {{ten_du_an}}, {{noi_dung}} rồi thay thế biến. | |

**User's choice:** Code layout docx.js.

---

## Tích hợp ngữ cảnh

| Option | Description | Selected |
|--------|-------------|----------|
| Tự động quét toàn bộ | Tự động quét Docs + Knowledge Graph tìm kiến trúc, API, schema liên quan trước khi phỏng vấn BA/Dev. | ✓ |
| Chỉ quét khi được chỉ định | Chỉ tra cứu khi người dùng chủ động gắn tag @[Tài liệu] hoặc yêu cầu cụ thể. | |

**User's choice:** Tự động quét toàn bộ.

---

## Trải nghiệm UI, Lưu vết & Sơ đồ luồng

- **Vị trí kích hoạt:** Thanh chip chọn nhanh trên ChatInputBar.
- **Xem trước:** Preview Markdown + Nút "Duyệt & Tải .docx" + Nút "Chỉnh sửa tiếp".
- **Lưu vết:** Tải về máy + Lưu thành 1 Note mới trong TaskMate.
- **Sơ đồ luồng:** Preview Mermaid trong chat; chuyển thành bảng text các bước trong file Word.
- **Thoát Wizard:** Nút Hủy + lưu trạng thái dở dang vào thread.
- **Metadata:** Form popup nhập nhanh các trường định danh ban đầu (Mã CR, đơn vị, người lập, ngày).

---

## Mô hình khép kín vòng đời phát triển

**User's choice (freeform):** Dev nạp PL02 + yêu cầu verbal + tài liệu kiến trúc/codebase (dev tự chạy `gsd-map-codebase`) → AI cùng Dev phân tích ra `SOLUTION.md` → lưu Note gắn Project → Dev feed solution vào `gsd-phase`/milestone trên Claude Code ngoài TaskMate → nếu drift thì quay lại đúng thread của dự án để AI cập nhật solution + preview + confirm → code xong thì tổng hợp `change-pack.zip` nạp vào AI chat thread của dự án → AI phân tích và tạo PL03.

**Rationale:** giữ 1 thread xuyên suốt để AI không mất ngữ cảnh giữa các vòng lặp; solution là artifact sống, không phải tài liệu chết.

---

## Change Pack — cơ chế sinh

Đã cân nhắc 2 phương án nạp code đã sửa về AI:

| Option | Description | Selected |
|--------|-------------|----------|
| Zip kéo thả | Script `scripts/change-pack.mjs` chạy trong repo đích sinh `change-pack.zip`; TaskMate giải nén bằng `jszip` có sẵn. | ✓ |
| Local bridge | Ghost-dev daemon (Phase 15) đọc repo trực tiếp, real-time nhưng phụ thuộc daemon phải bật. | |

Phương án zip được chọn vì zero hạ tầng mới, reuse pipeline zip-normalize đã có.

Nội dung pack: `diff.patch` (`git diff --binary base...HEAD`), `new-files/` (file thêm mới full content), `sql/` (`.sql`/`.plb`/`.pck`/`.pkb`), `meta.json` (cr, base, head, branch, author, generatedAt, commits, danh sách file).

Đã loại bỏ: GitHub Contents API (cần token client-side, không đọc được repo ngân hàng tư nhân), `gh` CLI trong app (cần auth + network), `git bundle` (người và AI đều khó đọc).

Ngưỡng chặn: zip > 5MB, hoặc chứa `node_modules/`, `*.min.js`, `package-lock.json`.

---

## Mẫu biểu thật (bank templates)

**User's input:** `docs/pl-templates/` chứa 3 file `.docx` thật:
- `PL02.537962 Điều chỉnh logic và chức năng quản lý spending limit của the TDDN.docx`
- `PL03B-tokenization-CTM-TichHop.docx`
- `PL07-tokenization-ctm.docx`

**Findings:** 3 mẫu có cây mục khác nhau hoàn toàn → không thể dùng một renderer tổng quát. PL07 chứa baseline bảo mật tĩnh (I–V, ~27 mục tiếng Việt) tách hẳn khỏi phần AI sinh (mục VI). PL02/PL03B đều cần TOC field + bảng theo dõi thay đổi. Không có mẫu CAB.

**Ghi nhận:** `25-TEMPLATES.md` (phân tích đầy đủ), D-18 → D-21 trong CONTEXT.md.

**Deferred:** CAB builder — chờ user cung cấp mẫu thật.
