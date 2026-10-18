---
status: complete
date: 2026-10-18
slug: 261018-citation-highlight-reason
---

# Summary: Nâng cấp trích dẫn AI - Bôi vàng chính xác và bổ sung lý do trích dẫn (relevanceReason)

## Đã hoàn thành
1. **Schema & Pipeline (`groundedAnswerSchemas.ts`, `evidencePack.ts`, `groundedSynthesis.ts`)**:
   - Mở rộng `PersistedCitationSchema` với trường tùy chọn `relevanceReason?: string`.
   - Giữ nguyên cấu trúc Zod hiện tại, không gây ảnh hưởng đến tính đúng đắn của schema validation và closure rules.
   - Thêm hướng dẫn vào prompt để LLM giải thích ngắn gọn `relevanceReason` khi cần.
2. **Highlight & Display (`QuickPreviewDrawer.tsx`, `AIChatDrawer.tsx`)**:
   - Truyền `relevanceReason` từ citation vào modal `QuickPreviewDrawer`.
   - Hiển thị dải "Lý do trích dẫn:" với nền xanh nhạt nổi bật ngay dưới header trích dẫn nếu có `relevanceReason`.
   - Tự động tìm đoạn văn bản khớp với `citedExcerpt` trong nội dung tài liệu Markdown và bọc thẻ `<mark class="gsd-citation-mark">` với màu vàng `#ffe58f`, border `#d48806`.
   - Bổ sung hiệu ứng tự động cuộn màn hình (`scrollIntoView`) thẳng đến thẻ `<mark>` được bôi vàng đầu tiên để người dùng mở ra là thấy ngay đoạn trích dẫn.
3. **Kiểm thử**:
   - Toàn bộ 34 test suites AI (498 tests) pass 100%.
   - Type check và production build `npm run build` thành công.
