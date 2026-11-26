# Quick Task 261126-skl: AI DOCX and PPTX with embedded images - Context

**Gathered:** 2026-11-26
**Status:** Ready for planning

<domain>
## Task Boundary

AI chat TaskMate phải cho phép user tự do yêu cầu tài liệu DOCX/PPTX có ảnh phong phú, chuẩn chỉnh. Ảnh có thể đến từ generate_image, data URL, http(s) URL, attachment/knowledge, hoặc diagram Mermaid. AI tự điều phối tool trong cùng một yêu cầu.

</domain>

<decisions>
## Implementation Decisions

### Diagram strategy
- Render Mermaid thành ảnh rồi nhúng vào DOCX/PPTX (dùng dependency `mermaid` đã có sẵn trong package.json). Không chỉ dùng ảnh AI cho sơ đồ.

### Image sources
- Hỗ trợ tất cả: `data:` URL từ generate_image, `http(s)` URL, `attachment:`/`a:` token và noteAttachments, ảnh đã lưu trong knowledge. Không nới policy bảo mật của markdown prose renderer (`markdown.ts` vẫn chặn `data:` trong HTML chat).

### Generation flow
- AI tự gọi `generate_image` (và render Mermaid) rồi `generate_file`/`generate_pptx` trong cùng một turn theo prompt tự nhiên của user. Cập nhật tool description/system prompt để hướng dẫn rõ.

### Scope
- DOCX + PPTX. Không làm PDF (không có generator trong repo, user không yêu cầu).
- Không thêm dependency mới nếu `docx`, `pptxgenjs`, `mermaid` có sẵn đáp ứng.
- Không đổi default endpoint/model của generate_image trong quick task này (để tránh sửa ngoài phạm vi đã thảo luận trước đó).

### Claude's Discretion
- Chi tiết kỹ thuật parse markdown image, fallback khi fetch ảnh hỏng, kích thước ảnh, test và UAT do planner/executor quyết định miễn đáp ứng boundary trên.

</decisions>

<specifics>
## Specific Ideas

- Tool `generate_image` trả `markdown: ![alt](data:...)`; tool `generate_file` và `generate_pptx` cần hiểu cú pháp đó.
- `generateDocxBlobWithDocx` tại `src/utils/dynamicFileSandbox.ts:245-440` hiện chỉ tạo TextRun.
- `generatePptxBlob` tại `src/utils/pptxExport.ts` cần mở rộng SlideData để nhận ảnh.
- UAT: Chrome, prompt tự nhiên, kiểm tra file tải về có `word/media/` (DOCX) và ảnh trên slide (PPTX).

</specifics>

<canonical_refs>
## Canonical References

Không có spec/ADR ngoài; yêu cầu nằm trong decisions ở trên.

</canonical_refs>
