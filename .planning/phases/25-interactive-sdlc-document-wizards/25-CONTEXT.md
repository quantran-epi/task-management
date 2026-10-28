# Phase 25: Interactive SDLC Document Wizards & Bank Template Generator - Context

**Gathered:** 2026-10-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 25 mang đến bộ kỹ năng tương tác trực quan (Interactive AI Skill Wizards) ngay trong AI Chat Drawer của TaskMate, hỗ trợ chuyên viên BA và Dev hoàn thiện nhanh chóng hồ sơ phát triển phần mềm ngân hàng chuẩn chỉnh:
- BA: Tiếp nhận yêu cầu tính năng (PL01) → AI hỗ trợ rà soát lỗ hổng, truy vấn kiến trúc/hệ thống hiện tại → xuất bản tài liệu Phân tích Nghiệp vụ (PL02).
- Dev: Nhận PL02 → AI hỗ trợ đối chiếu schema DB, API contract, phương án xử lý → xuất bản tài liệu Thiết kế Kỹ thuật (PL03) và Phiếu rà soát mã nguồn (PL07).
- Release/CAB: Tự động tổng hợp thay đổi kỹ thuật và nghiệp vụ ngắn gọn từ các PL trên để trình bày trước hội đồng CAB.

Toàn bộ quá trình diễn ra thông qua chế độ phỏng vấn làm rõ (Interactive Clarification), xem trước (Markdown Preview), và kết xuất client-side file `.docx` đúng theo mẫu biểu quy chuẩn ngân hàng.

</domain>

<decisions>
## Implementation Decisions

### Scope biểu mẫu
- **D-01:** Triển khai trọn vẹn cả 4 mẫu biểu trong phase này:
  1. `PL02`: Tài liệu Phân tích Nghiệp vụ (dành cho BA).
  2. `PL03`: Tài liệu Thiết kế Kỹ thuật & Phương án triển khai (dành cho Dev).
  3. `PL07`: Phiếu Review Code & Checklist kiểm tra chất lượng phần mềm (dành cho Dev/Lead).
  4. `CAB`: Tờ trình tóm tắt thay đổi phục vụ báo cáo Hội đồng Phê duyệt Thay đổi.

### Luồng phỏng vấn AI (Guided Interview)
- **D-02:** Áp dụng cơ chế **Hỏi bù lỗ hổng (Grounded Gap Detection)**:
  - User nạp đầu vào (text PL01, tag Note, Git commit/diff).
  - AI tự động đối chiếu các mục bắt buộc trong cấu trúc biểu mẫu ngân hàng và phát hiện những điểm thiếu sót, mâu thuẫn hoặc chưa rõ ràng.
  - AI chỉ đặt câu hỏi phỏng vấn tập trung vào các "khoảng trống" nghiệp vụ/kỹ thuật cần làm rõ, thay vì bắt user điền tuần tự máy móc.

### Cơ chế nạp và kết xuất file `.docx`
- **D-03:** Sử dụng **Client-side docx.js layout builder**:
  - Toàn bộ layout, font chữ (Times New Roman), căn lề chuẩn quy định, tiêu đề, bảng biểu, khung ký duyệt được code trực tiếp bằng thư viện `docx` trong TypeScript.
  - Đảm bảo tính độc lập, deterministic, không phụ thuộc vào server bên ngoài hay nguy cơ lỗi parse file template phức tạp.
- **D-18:** Mẫu biểu thật nằm tại `docs/pl-templates/` (PL02, PL03B, PL07). Cấu trúc từng mục, bảng biểu, numbering và khối chữ ký đã được trích xuất vào `25-TEMPLATES.md` — planner và builder MUST đọc file này thay vì tự suy đoán layout.
- **D-19:** PL07 gồm 2 phần tách biệt: baseline bảo mật tĩnh (mục I–V, ~27 hạng mục tiếng Việt nguyên văn, đóng gói thành fixture) và mục VI "Review code" do AI sinh theo từng patch. Không cho AI tự bịa hoặc rút gọn baseline.
- **D-20:** Ba builder riêng biệt (PL02, PL03B, PL07), không dùng một renderer tổng quát — cây mục của mỗi mẫu khác nhau về bản chất. Các dạng bảng lặp lại (risk register, glossary, file layout spec, input rules, API contract, DB columns, checklist 5 cột) được đóng gói thành row-builder tái sử dụng.
- **D-21:** CAB không cần mẫu biểu chuẩn. Nội dung CAB chỉ là bản tóm tắt ngắn gọn các thay đổi kỹ thuật và nghiệp vụ, dựa trên PL02 + PL03B + PL07 đã sinh trong cùng thread dự án. Sinh dạng Markdown ngắn (1–2 trang) + xuất `.docx` layout tối giản (tiêu đề, các mục tóm tắt, khối ký 2 ô). Không áp khuôn mục/bảng phức tạp như 3 mẫu PL còn lại.

### Tích hợp Ngữ cảnh & Tra cứu Kiến thức
- **D-04:** **Tự động quét toàn diện dữ liệu nền**:
  - Khi kích hoạt wizard, hệ thống tự động kích hoạt pipeline tra cứu kiến thức nền (Knowledge Docs IndexedDB, Knowledge Graph Neo4j/Graphiti, và các MCP tools liên quan như Oracle DB nếu được bật) để cung cấp sẵn kiến trúc hiện tại, API và bảng dữ liệu ảnh hưởng cho buổi phỏng vấn.

### Trải nghiệm Giao diện AI Chat Drawer
- **D-05:** **Thanh Chip chọn nhanh (Skill Quick Bar)**:
  - Bố trí thanh chip chọn nhanh ngay phía trên `ChatInputBar`: `[📋 Soạn PL02]` `[⚙️ Soạn PL03]` `[🔍 Checklist PL07]` `[📢 Tờ trình CAB]`.
- **D-06:** **Form Modal nhập Metadata ban đầu**:
  - Khi user nhấn vào chip wizard, hiển thị popup nhanh để nhập các thông tin định danh: Mã Dự án/CR, Tên tính năng, Đơn vị yêu cầu, Người lập, Ngày lập.
  - Các thông tin này tự động truyền vào Header/Footer, trang bìa và bảng ký duyệt của file Word.
- **D-07:** **Xem trước & Nút Duyệt xuất file**:
  - Trước khi xuất file `.docx`, AI hiển thị bản thảo Markdown đầy đủ trong chat kèm thẻ tóm tắt.
  - Cung cấp nút hành động rõ ràng: `[📥 Duyệt & Tải .docx]` và `[✏️ Yêu cầu chỉnh sửa thêm]`.
- **D-08:** **Lưu vết và Quản lý phiên làm việc**:
  - Khi xuất file `.docx`, hệ thống đồng thời lưu toàn bộ nội dung thành một Note mới trong TaskMate để làm tài liệu tra cứu nội bộ lâu dài.
  - Wizard có trạng thái lưu dở dang và nút `[❌ Hủy Wizard]` để user có thể thoát quay lại chat thông thường bất cứ lúc nào.

### Xử lý Sơ đồ Luồng (Diagrams)
- **D-09:** Sơ đồ quy trình (Flowchart, Sequence) được render trực quan bằng Mermaid trong chat preview. Khi xuất sang file `.docx`, hệ thống chuyển đổi sơ đồ thành bảng text mô tả từng bước (Step-by-step Execution Matrix) chuẩn mực, tránh lỗi lệch hình ảnh trong file Word.

### Mô hình khép kín xuyên suốt vòng đời phát triển (Closed Development Loop)
- **D-10:** Luồng chuẩn tương tác cho Dev, áp dụng thống nhất cho cả feature mới và chỉnh sửa feature đã có:
  1. Dev nạp đầu vào: PL02 (yêu cầu đã duyệt) + yêu cầu verbal ngoài lề (nếu có) + tài liệu kiến trúc/codebase (nếu có, dev tự chạy `gsd-map-codebase` bên ngoài TaskMate).
  2. AI cùng Dev phân tích tương tác → ra `SOLUTION.md`.
  3. `SOLUTION.md` được lưu thành Note gắn với Project tương ứng.
  4. Dev dùng `SOLUTION.md` làm đầu vào cho `gsd-phase` / milestone flow trên Claude Code (ngoài TaskMate).
  5. Trong quá trình code, nếu phát sinh drift so với solution ban đầu, Dev quay lại **đúng chat thread của dự án** trao đổi với AI; AI cập nhật `SOLUTION.md`, preview cho Dev confirm, rồi lưu version mới.
  6. Khi code xong, Dev tổng hợp `change-pack.zip` và nạp vào chat thread của dự án; AI phân tích và sinh PL03 (kèm PL07).
- **D-11:** Với feature chỉnh sửa feature đã có, `SOLUTION.md` bắt buộc có mục "Hiện trạng hệ thống" và "Danh sách màn hình/API/bảng bị ảnh hưởng" trước khi đề xuất giải pháp; PL03 bổ sung ma trận regression test.
- **D-12:** `SOLUTION.md` là Note versioned (v1, v2, v3…) gắn với Project; thread chat của Project được giữ nguyên xuyên suốt để AI không mất ngữ cảnh giữa các lần cập nhật.

### Change Pack (đầu vào PL03/PL07)
- **D-13:** `change-pack.zip` do script `scripts/change-pack.mjs` sinh ra **trong repo hệ thống của Dev** (không phải TaskMate), chạy bằng lệnh `node scripts/change-pack.mjs --base origin/develop --cr <CR-ID>`.
- **D-14:** Nội dung pack cố định: `diff.patch` (`git diff --binary <base>...HEAD`), `new-files/` (file thêm mới full content), `sql/` (`.sql`, `.plb`, `.pck`, `.pkb`), `meta.json` (cr, base, head, branch, author, generatedAt, commits, danh sách file).
- **D-15:** Dev nạp pack vào AI Chat thread của dự án bằng kéo-thả zip. TaskMate dùng `jszip` (đã có sẵn) để giải nén, đọc `meta.json` hiển thị CR/branch/commit count cho Dev confirm đúng pack, rồi lưu từng entry thành Note gắn vào DocumentSet của Project.
- **D-16:** PL03 sinh từ việc so sánh `SOLUTION.md` baseline với `change-pack` thực tế, gồm 4 mục: Thiết kế như đã duyệt, Thực tế triển khai, Bảng drift (ngoài solution / chưa làm / làm khác), Bảng thay đổi DB + Rollback.
- **D-17:** Chặn pack quá lớn/không hợp lệ trước khi nạp: cảnh báo và từ chối nếu zip > 5MB, hoặc chứa `node_modules/`, `*.min.js`, `package-lock.json`.

</decisions>

## Planning Resolutions (2026-10-28)

Các resolution dưới đây khóa chi tiết kỹ thuật còn mở; executor không hỏi lại hoặc tự thay giá trị:

| ID | Resolution |
|---|---|
| P25-R01 | Archive dùng binary profile B: `maxCompressedBytes=5_242_880`, `maxExpandedBytes=26_214_400`, `maxEntryBytes=2_097_152`, `maxEntries=256`. Mọi boundary có exact-limit và `+1` test. |
| P25-R02 | `meta.json.commits` có exact shape `{sha:string, subject:string}[]`; `meta.json.files` có exact shape `{path:string, status:string}[]`. D-14 không khóa status enum, nên Phase 25 validate `status` là non-empty bounded string và không tự invent allowed values. Nếu source producer sau này định nghĩa enum, update contract/fixture bằng explicit change. |
| P25-R03 | Persistence dùng optional `DocumentSet.sdlc={projectId,purpose:'sdlc'}` và optional `Note.sdlcArtifact`; canonical Markdown + validated export payload nằm trong Project-linked Note. `ChatMessage` chỉ giữ artifact pointer + bounded render snapshot. Không thêm table/index hoặc Dexie schema migration cho Phase 25. |
| P25-R04 | Structured render/export payload trong `ChatMessage` tối đa `524_288` UTF-8 bytes sau deterministic JSON serialization. Full canonical payload vẫn nằm trong Note theo P25-R03. |
| P25-R05 | Download copy: direct-anchor chỉ được báo `Đã bắt đầu tải`; full `Đã tải {filename} và lưu thành tài liệu dự án.` chỉ dùng khi save picker xác nhận saved và Note save thành công. |
| P25-R06 | Sáu WIZ requirement IDs dùng đúng descriptions/success criteria trong ROADMAP Phase 25; REQUIREMENTS.md chưa có definitions riêng và planner không mở rộng nghĩa. |

Source DOCX thật tại `docs/pl-templates/` vẫn là blocking human input. P25-R01..R06 không thay thế source fidelity gate D-18/D-19.

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing:**

### AI Chat & Drawer Integration
- `src/components/ai/AIChatDrawer.tsx` — Vị trí tích hợp thanh Quick Bar, quản lý session wizard.
- `src/components/ai/ChatInputBar.tsx` — Điểm neo cho thanh chọn skill chip.
- `src/components/ai/ChatMessageBubble.tsx` — Logic render chat preview, markdown content và xử lý `handleDownloadGeneratedFile`.
- `src/types/models.ts` — Định nghĩa `ChatGeneratedFile`, `ChatMessage`, `ChatThread`.

### File Generation & Docx Utilities
- `src/services/export/` & `executeDynamicFileScript` — Cơ chế xuất file Word bằng `docx.js` hiện có. Wizard MUST dùng dedicated builders và MUST NOT dùng dynamic script route.

### Knowledge & Grounding System
- `src/services/ai/groundedTurnDeps.ts` & `src/services/ai/contextGrounding.ts` — Cơ chế lấy context tài liệu nội bộ và Knowledge Graph để AI tra cứu thông tin hệ thống.

### Bank Templates
- `docs/pl-templates/PL02.537962 Điều chỉnh logic và chức năng quản lý spending limit của the TDDN.docx` — mẫu PL02 thật.
- `docs/pl-templates/PL03B-tokenization-CTM-TichHop.docx` — mẫu PL03B thật.
- `docs/pl-templates/PL07-tokenization-ctm.docx` — mẫu PL07 thật.
- `.planning/phases/25-interactive-sdlc-document-wizards/25-TEMPLATES.md` — phân tích cấu trúc từng mẫu. Builder MUST đối chiếu file này.

### Zip / Pack Handling
- `src/utils/exportFolderZip.ts` — mẫu dùng `jszip` sẵn có.
- `package.json:35` — `jszip@^3.10.2`; `package.json:33` — `docx@^9.9.0`.
</canonical_refs>
