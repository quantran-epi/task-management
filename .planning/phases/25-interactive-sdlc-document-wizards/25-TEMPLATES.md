# Phase 25 — Bank PL Template Analysis

**Source:** `docs/pl-templates/` (3 real bank documents, SHB)
**Extracted:** 2026-10-28

Downstream agents MUST read this before designing the `docx.js` builders in D-03. It records the *actual* section structure of each template — not a guess.

---

## PL02 — Tài liệu Đặc tả Chức năng (BA)

Source: `PL02.537962 Điều chỉnh logic và chức năng quản lý spending limit của the TDDN.docx`

### Page furniture
- Title block: `TÀI LIỆU ĐẶC TẢ CHỨC NĂNG <TÊN CHỨC NĂNG>` + ticket number on next line (e.g. `#537962`).
- Auto-generated `MỤC LỤC` (TOC field, levels TOC1..TOC3).
- Numbering scheme: `I.`, `II.`, `III.` for H1; `1.` `2.` for H2; `a.` `b.` for H3.

### Section tree (fixed)
```
I. GIỚI THIỆU CHUNG
   1. Mục đích yêu cầu
   2. Đối tượng sử dụng.
   3. Phạm vi triển khai
   4. Nhận diện đánh giá rủi ro khi triển khai (nếu có).   ← 4-col table:
        Loại rủi ro | Mô tả | Biện pháp | Đơn vị thực hiện
   5. Các thuật ngữ viết tắt                                 ← 3-col table: STT | Từ viết tắt | Giải thích
II. YÊU CẦU CHỨC NĂNG
   <N>. <Tên tính năng>            ← repeated per feature, numbered 1..N
        a. Thêm mới biểu mẫu ...   ← sub-blocks, lettered a. b.
             • Tên biểu mẫu / Ứng dụng / Yêu cầu phê duyệt / Bảng dữ liệu đích
             • Cấu trúc biểu mẫu        ← table: STT | CỘT | ĐỊNH DẠNG | BẮT BUỘC | MÔ TẢ
             • Template upload          ← image placeholder
             • Hướng dẫn nhập dữ liệu   ← table: STT | Trường | Quy tắc nhập liệu
             • Quy tắc xử lý dữ liệu    ← bullet list of validation rules
        b. Các bước upload ...      ← Đường dẫn thực hiện + steps
   <N>. Phân quyền sử dụng chức năng   ← User maker / User checker (role bullets)
   <N>. Cấu hình thông báo ...          ← 4-col table: STT | Nội dung cấu hình | PUSH | M4U
                                         + API contract table: Trường dữ liệu | Kiểu dữ liệu | Mô tả
III. KẾ HOẠCH VÀ NHÂN SỰ THAM GIA
```

### Recurring table shapes (must be reproduced exactly)
| Purpose | Columns |
|---|---|
| Risk register | Loại rủi ro / Mô tả / Biện pháp / Đơn vị thực hiện |
| Glossary | STT / Từ viết tắt / Giải thích |
| File layout spec | STT / CỘT / ĐỊNH DẠNG / BẮT BUỘC / MÔ TẢ |
| Input rules | STT / Trường / Quy tắc nhập liệu |
| Notification config | STT / Nội dung cấu hình / PUSH / M4U |
| API contract | Trường dữ liệu / Kiểu dữ liệu / Mô tả |

### Content marker conventions
- Validation rules are **bulleted**, one rule per line, phrased imperatively in Vietnamese ("Hệ thống check…", "chặn không cho upload").
- Data values are uppercase snake_case (`MA_CTUD`, `TRANG_THAI_CT`) — preserve verbatim.
- Navigation paths written as `Portal => Tiện ích => … => Thêm mới`.

---

## PL03B — Tài liệu Thiết kế Kỹ thuật (Dev)

Source: `PL03B-tokenization-CTM-TichHop.docx`

### Page furniture
- `PHỤ LỤC 03B` / `TÀI LIỆU THIẾT KẾ KỸ THUẬT` title block.
- **`BẢNG THEO DÕI THAY ĐỔI TÀI LIỆU`** — mandatory revision table before TOC:
  `STT | Mô tả thay đổi | Ngày thay đổi | Phiên bản | Phụ trách | Ghi chú`
- `MỤC LỤC` TOC field.
- Numbering: plain `1.` `2.` for H1 (no roman).

### Section tree
```
1. GIỚI THIỆU CHUNG.
   1.1 Mục đích yêu cầu.
   1.2 Đối tượng sử dụng.
   1.3 Thành phần triển khai.          ← Database (schema list) + K8s (service list)
2. ĐẶC TẢ KỸ THUẬT.
   • Mô tả chung (BodyText)
   • Techstack: <stack line>
   2.1 Luồng hoạt động
       2.1.x <Flow name>               ← e.g. Manual Provisioning
           1. Service → Service: description     ← numbered hop list, one per line
   2.2 Services
       2.2.x <Service name>            ← e.g. API Gateway, Token Provision
             Source code: <gitlab URL>
             1. <METHOD> <path>
                Mô tả: …
                Request body             ← table: Field name | Data type | Description
                Response body — HTTP 200 ← table: Field name | Data type | Description
   2.3 Database
       2.3.1 Bảng
             2.3.1.x <TABLE_NAME>
                     <one-line description>
                     Column | Data type | Field Description
   2.4 Integration Services
       2.4.x <gateway/system name>
             • <METHOD> <path>
               <one-line description>
   2.5 NTF-UI
       <template upload note>
       STT | MÃ THÔNG BÁO | TÊN THÔNG BÁO | KÊNH GỬI
```

### Key structural facts for the builder
- Flow sections are **numbered hop lists** (`actor → actor: action`) — not diagrams. Mermaid in chat previews this; docx keeps the numbered list (matches D-09).
- Every service carries a `Source code:` line — emit only when the Dev supplies it.
- Database section is one H4 per table with a fixed 3-col column table.
- No signature block observed in PL03B; revision table carries authorship instead.

---

## PL07 — Biên bản Code Review

Source: `PL07-tokenization-ctm.docx`

### Page furniture
```
PHỤ LỤC 07
(Ban hành kèm theo Quyết định số ……/QĐ-TGĐ ngày ….. tháng ….. năm 20…… của
 Tổng Giám đốc Ngân hàng TMCP Sài Gòn – Hà Nội)
BIÊN BẢN CODE REVIEW
```
- **`Nội dung`** header table: Tên ứng dụng / Phiên bản ứng dụng / Mô tả sơ lược / Ngày kiểm nghiệm (label col + value col).

### Checklist table (the core of PL07)
Fixed 5 columns: `STT | Nội dung | Đáp ứng (Có | Không) | Áp dụng/Không áp dụng | Ghi chú`
The "Đáp ứng" header spans two sub-columns (`Có`, `Không`).

### Fixed section tree — security review checklist (do NOT let the AI invent items)
```
I.   Kiểm soát đầu vào dữ liệu           (6 items)
II.  Quản lý mật khẩu và xác thực        (8 items, #5 has a/b/c/d sub-items)
III. Quản lý phiên                        (5 items)
IV.  Hạn chế truy cập                     (5 items)
V.   Xử lý lỗi và lưu log                 (3 items)
VI.  Review code                          ← AI-generated, per-patch
       1. Thêm script alter bảng, thêm trường   ← bullet list of affected tables
       2. Cập nhật các service …                ← bullet list of affected services
```
Sections I–V are a **static bank security baseline** — constant text. Only the tick marks and the Ghi chú column vary. Section VI is the only AI-authored part.

### Signature block
```
Hà Nội, ngày <dd> tháng <mm> năm <yyyy>
CÁN BỘ PHÁT TRIỂN                    CÁN BỘ PHÊ DUYỆT
(Ký và ghi rõ họ tên)                (Ký và ghi rõ họ tên)
```

---

## CAB — no template, freeform summary

`docs/pl-templates/` has no CAB template, and per user decision **none is required** (D-21).

CAB is a short derived one-pager summarizing the technical and business changes of the CR, generated from PL02 + PL03B + PL07 already present in the same project thread. No fixed section tree, no mandated table shapes.

Working content outline (not a rigid contract):
- Bối cảnh & mục tiêu thay đổi (từ PL02)
- Thay đổi nghiệp vụ chính (từ PL02, tóm tắt)
- Thay đổi kỹ thuật chính (từ PL03B: services, DB, integration)
- Kết quả kiểm thử SIT/UAT (nếu có)
- Rủi ro & phương án rollback
- Khối ký 2 ô: CÁN BỘ PHÁT TRIỂN / CÁN BỘ PHÊ DUYỆT

Builder cần dùng: simple `docx` layout (title, headings, paragraphs, one sign-off block). Không cần TOC, không cần bảng revision, không cần checklist 5 cột.

---

## Implications for the docx builder design

1. **Three distinct builders**, not one generic renderer — section trees differ fundamentally.
2. PL07 needs a **static security-baseline fixture** (sections I–V ~27 items, verbatim Vietnamese text) separate from AI-generated content.
3. PL02 and PL03B both need a **revision/change-tracking table** and a TOC field; `docx` library supports both (`TableOfContents`, `HashMap`-style fields).
4. Vietnamese text must survive: all content is UTF-8, font must be Times New Roman (or a declared substitute) with `eastAsia` fallback for diacritics.
5. Table shapes are fixed per template — encode them as reusable row-builders, not freeform tables.
6. PL03B `Source code:` lines and PL02 `Template upload` image slot are optional — builder must omit cleanly when the Dev/BA supplies nothing.
