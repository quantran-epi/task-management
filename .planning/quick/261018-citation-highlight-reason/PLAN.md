# PLAN: Nâng cấp trích dẫn AI - Bôi vàng chính xác và bổ sung lý do trích dẫn (relevanceReason)

## Mục tiêu
1. **Highlight trực quan trong Modal QuickPreviewDrawer**: Bôi vàng (`<mark>`) đoạn văn bản khớp với `citedExcerpt` trong nội dung Markdown gốc của tài liệu, tự động cuộn tới vị trí đoạn bôi vàng.
2. **Hiển thị relevanceReason (Lý do trích dẫn)**: Cho phép LLM và hệ thống giải thích lý do vì sao đoạn tài liệu này được trích dẫn để trả lời câu hỏi, hiển thị trên giao diện thẻ trích dẫn.
3. **Bảo toàn tính đúng đắn**: Giữ nguyên toàn bộ schema Zod hiện tại (`PersistedCitationSchema`), `relevanceReason` là optional, không làm gãy các luồng closure validation hay lưu DB.

---

## Tasks

### Task 1: Mở rộng Schema & Pipeline dữ liệu
- File: `src/services/ai/groundedAnswerSchemas.ts`
  - Bổ sung `relevanceReason: z.string().min(1).max(400).optional()` vào `PersistedCitationSchema`.
- File: `src/services/ai/evidencePack.ts`
  - Cập nhật interface `SourceRecord` và `RawCandidateCitation` có `relevanceReason?: string`.
- File: `src/services/ai/groundedSynthesis.ts`
  - Cập nhật prompt hướng dẫn LLM trả về `relevanceReason` cho citations khi trích dẫn tài liệu.
  - Cập nhật hàm chuẩn hóa `normalizeRawGroundedOutput` để giữ lại `relevanceReason`.

### Task 2: Highlight bôi vàng đoạn trích dẫn trong QuickPreviewDrawer
- File: `src/components/notes/QuickPreviewDrawer.tsx`
  - Nhận prop `relevanceReason?: string`.
  - Hiển thị khối "Lý do trích dẫn" nổi bật ngay dưới header của panel trích dẫn.
  - Thêm logic inject `<mark class="gsd-citation-mark">` vào `doc.body` tại đoạn khớp với `citedExcerpt`.
  - Thiết lập style CSS cho `.gsd-citation-mark` với nền vàng `#ffe58f`, viền `#d48806`, padding nhẹ để người dùng nhìn là thấy ngay.
  - Thêm ref/effect cuộn tới `<mark>` đầu tiên khi mở modal.

### Task 3: Kết nối từ AIChatDrawer xuống QuickPreviewDrawer
- File: `src/components/ai/AIChatDrawer.tsx`
  - Truyền `relevanceReason={activePreviewCitation?.relevanceReason}` vào `QuickPreviewDrawer`.

### Task 4: Kiểm thử và xác thực
- Chạy unit test suite `tests/ai/` đảm bảo toàn bộ tests hiện có vẫn pass (không gãy tính đúng đắn).
- Chạy build `npm run build` để đảm bảo type safety.
