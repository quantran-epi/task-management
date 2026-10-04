# Phase 14: Knowledge Base Integration (Docs, Linking & AI Retrieval) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-04
**Phase:** 14-knowledge-base-integration-docs-linking-ai-retrieval
**Areas discussed:** Doc Structure, Linking Model, AI Retrieval, Storage & Files

---

## Doc Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Unified Note Model | Mở rộng model `Note` hiện có: thêm trường `type: 'quick_note' \| 'document'`, `parentId`, `slug`, `tags`. Tái sử dụng bảng Dexie `notes` và AI tools hiện hữu. | ✓ |
| Dedicated Tables | Tạo bảng `documents` và `folders` riêng biệt trong Dexie (SCHEMA_V9). Tách bạch hoàn toàn ghi chú ngắn và tài liệu dài hạn. | |

**User's choice:** Unified Note Model (Recommended)
**Notes:** Giữ nguyên một nguồn dữ liệu duy nhất cho tri thức văn bản, tương thích hoàn toàn với note attachments, popout window và các AI tool hiện có.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Folder Tree + Tags | Hỗ trợ cả cây thư mục đệ quy (`parentId`) và mảng `tags: string[]`. Cho phép tạo Folder chuyên đề và gắn nhãn chéo. | ✓ |
| Flat Tag Taxonomy | Không tạo folder. Mọi tài liệu nằm ở danh mục phẳng, lọc qua Tags, Pinned và Search. | |
| Entity Namespaces | Nhóm gốc mặc định dựa theo Entity liên kết (Project, Milestone), tài liệu độc lập nằm trong "Global Knowledge". | |

**User's choice:** Folder Tree + Tags (Recommended)
**Notes:** Cung cấp cả cấu trúc thư mục rõ ràng lẫn khả năng gắn nhãn linh hoạt cho nhiều khía cạnh tri thức.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Markdown Split + ToC | Mở rộng bộ soạn thảo Markdown: chế độ Split Editor/Preview, tự động sinh Mục lục (ToC Outline) từ thẻ Heading, Syntax Highlighting cho code blocks. | ✓ |
| Block-based WYSIWYG | Trình soạn thảo khối kiểu Notion/TipTap (Block-based rich text). | |
| Minimalist Modal Editor | Tận dụng trực tiếp `NoteEditor` hiện tại trong modal, chỉ bổ sung nút Fullscreen và toolbar Markdown cơ bản. | |

**User's choice:** Markdown Split + ToC (Recommended)
**Notes:** Giữ file nhẹ và thuần Markdown, có ToC để duyệt tài liệu dài nhanh chóng, không làm phình kích thước bundle.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Unified Docs View | Đổi tên mục Menu "Ghi chú" thành "Tài liệu & Ghi chú" với layout 3 cột: Cột 1 Cây thư mục + Tags; Cột 2 Danh sách tài liệu; Cột 3 Editor/Viewer. | ✓ |
| Separate Sidebar Menu | Giữ nguyên trang Notes cho Sticky Notes. Thêm mục Menu độc lập trên Sidebar: "Knowledge Base" (`#knowledge`). | |
| Floating / Popout Drawer | Tích hợp Knowledge Base thành một Panel / Drawer có thể bật tắt nhanh bằng phím tắt hoặc mở popout window. | |

**User's choice:** Unified Docs View (Recommended)
**Notes:** Gom toàn bộ tri thức vào một giao diện chuẩn tài liệu 3 cột, không làm chật sidebar chính của app.

---

## Linking Model

| Option | Description | Selected |
|--------|-------------|----------|
| Wiki-link [[...]] | Chuẩn wiki phổ biến (Obsidian/Roam). Gõ `[[` kích hoạt Autocomplete popup tìm nhanh Doc, Task, Project. Render thành clickable Chip. | ✓ |
| @mention Syntax | Tái sử dụng cú pháp `@mention` của ChatInputBar: gõ `@doc:`, `@task:`, `@project:`. | |
| Standard Markdown Link | Sử dụng cú pháp Markdown tiêu chuẩn với URL Scheme nội bộ: `[Label](planner://doc/{id})`. | |

**User's choice:** Wiki-link [[...]] (Recommended)
**Notes:** Người dùng nhấn mạnh luồng làm việc thực tế: tạo/sinh Markdown từ ngoài và paste vào app, do đó cần hệ thống tự động phát hiện liên kết thay vì bắt người dùng gõ tay.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Review & One-Click Link | Khi paste Markdown: Hệ thống chạy 2 tầng (quét keyword/mã Jira + AI Semantic Match), hiển thị banner "Gợi ý liên kết liên quan" với nút 1-Click "Áp dụng tất cả". | ✓ |
| Instant Silent Link | Tự động quét từ khóa và liên kết ngầm ngay khi lưu mà không hỏi lại người dùng. | |

**User's choice:** Review & One-Click Link (Recommended)
**Notes:** Đáp ứng chính xác yêu cầu cốt lõi của người dùng: paste Markdown vào là có ngay liên kết thông minh chỉ với 1 click xác nhận, không cần duyệt thư mục hay gõ link thủ công.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated Section + Quick View | Trong TaskDrawer và ProjectView có thêm mục "Tài liệu liên quan (Linked Docs)" với Quick Preview Drawer. Trong Document Viewer có chân trang "Liên kết ngược (Backlinks)". | ✓ |
| Reuse documentLinks Field | Lưu liên kết doc như đường link nội bộ `planner://note/{id}` trong trường `documentLinks` có sẵn của Task. | |

**User's choice:** Dedicated Section + Quick View (Recommended)
**Notes:** Trải nghiệm Quick Preview giúp người dùng đọc lướt tài liệu kỹ thuật ngay khi đang xử lý task mà không bị chuyển trang.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Smart Auto-Metadata | Khi paste Markdown: Tự động lấy `# Heading 1` làm tiêu đề, trích xuất `#tag`, gợi ý folder theo Project/nội dung. | ✓ |
| Manual Metadata Modal | Luôn bật modal yêu cầu người dùng gõ tiêu đề và chọn folder thủ công trước khi lưu. | |

**User's choice:** Smart Auto-Metadata (Recommended)
**Notes:** Giảm thiểu tối đa ma sát khi nạp tài liệu từ bên ngoài vào hệ thống.

---

## AI Retrieval

| Option | Description | Selected |
|--------|-------------|----------|
| Tool + BM25 Lexical | Trang bị AI Tool `search_knowledge_base`. Thuật toán Lexical BM25 chạy tức thì trong IndexedDB, có AI Query Expansion, chuẩn hóa tiếng Việt, tính trọng số (Title x3, Tags x2, Body x1). | ✓ |
| Vector Embeddings | Dùng Vector Embeddings qua 9router `/v1/embeddings` hoặc thư viện WASM trong browser, tính Cosine Similarity. | |

**User's choice:** Tool + BM25 Lexical (Recommended)
**Notes:** Người dùng đã xác nhận cơ chế BM25 kết hợp AI Query Expansion: người dùng có thể hỏi bằng ngôn ngữ tự nhiên không cần khớp chính xác từng chữ, hệ thống vẫn tìm đúng và phản hồi tức thì mà không tốn chi phí sinh embeddings.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Snippets Extraction | Trích xuất Tiêu đề + Heading + Đoạn văn khớp cao nhất (kèm 2-3 dòng ngữ cảnh) của top 2-3 tài liệu, điều tiết theo ngân sách context char limit. | ✓ |
| Full Document Dump | Bơm nguyên vẹn 100% nội dung tài liệu có điểm cao nhất vào prompt. | |

**User's choice:** Snippets Extraction (Recommended)
**Notes:** Tránh làm đầy context window, tiết kiệm chi phí token và cho phép tham chiếu chéo nhiều tài liệu cùng lúc.

---

| Option | Description | Selected |
|--------|-------------|----------|
| @doc Mention + Ask AI Button | Hỗ trợ gõ `@doc:` trong thanh chat AI và có nút "💬 Hỏi AI về tài liệu này" trên Header của Document Viewer. | ✓ |
| Button Only | Chỉ hỗ trợ nút bấm từ trang tài liệu, không bổ sung cú pháp `@doc:` trong chat. | |

**User's choice:** @doc Mention + Ask AI Button (Recommended)
**Notes:** Đảm bảo tính nhất quán với trải nghiệm `@task`, `@project`, `@file` đã được người dùng sử dụng thường xuyên.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Clickable Citation Chips | Các đoạn kiến thức lấy từ Knowledge Base có gắn chip tham chiếu bấm được `[📄 Tên doc]` và danh sách nguồn tham khảo ở cuối câu trả lời. | ✓ |
| Plain Text Mention | Chỉ nhắc tên tài liệu bằng chữ thông thường trong câu trả lời. | |

**User's choice:** Clickable Citation Chips (Recommended)
**Notes:** Minh bạch nguồn gốc thông tin, cho phép người dùng bấm vào mở Quick Preview kiểm chứng dữ liệu kỹ thuật tức thì.

---

## Storage & Files

| Option | Description | Selected |
|--------|-------------|----------|
| IndexedDB First + Tauri Export/Import | IndexedDB là nguồn sự thật chính, 100% offline, backup mã hóa Web Crypto. Desktop Tauri bổ sung Import/Export thư mục Markdown và mở trong VS Code/Obsidian. | ✓ |
| Local Filesystem Vault | Tài liệu lưu thành các file `.md` vật lý trong thư mục chỉ định trên ổ đĩa (Obsidian Vault). | |

**User's choice:** IndexedDB First + Tauri Export/Import (Recommended)
**Notes:** Đảm bảo ứng dụng chạy đồng nhất và an toàn cả trên Web PWA lẫn Desktop Tauri, không bị phụ thuộc vào quyền truy cập hệ thống file của trình duyệt.

---

| Option | Description | Selected |
|--------|-------------|----------|
| IndexedDB Blob + attachment:uuid | Lưu ảnh nhị phân trong `noteAttachments`, văn bản Markdown chỉ chứa cú pháp `![caption](attachment:uuid)`. Tự động nén ảnh chụp > 2MB. | ✓ |
| Base64 Inline Data | Nhúng trực tiếp chuỗi Base64 dài vào văn bản Markdown. | |

**User's choice:** IndexedDB Blob + attachment:uuid (Recommended)
**Notes:** Giữ text Markdown cực nhẹ và sạch, ngăn ngừa lỗi tràn token khi AI đọc nội dung và tối ưu tốc độ tìm kiếm văn bản.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Markdown & Zip Bundle | Hỗ trợ xuất/nhập file `.md` đơn lẻ và xuất/nhập toàn bộ Knowledge Base dạng gói `.zip` (bảo toàn cấu trúc folder + thư mục `attachments/`). | ✓ |
| Single .md File Only | Chỉ hỗ trợ xuất và nhập file `.md` đơn lẻ từng bài. | |

**User's choice:** Markdown & Zip Bundle (Recommended)
**Notes:** Tương thích hai chiều hoàn hảo với các công cụ Markdown bên ngoài như Obsidian, VS Code, Logseq.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Trash Bin + Auto-save + Link Warning | Xóa mềm đưa vào Thùng rác (có thể khôi phục), tự động lưu nháp khi gõ, cảnh báo nếu xóa tài liệu đang được Task hoặc Project liên kết. | ✓ |
| Direct Hard Delete | Xóa cứng vĩnh viễn ngay lập tức sau khi xác nhận Popconfirm. | |

**User's choice:** Trash Bin + Auto-save + Link Warning (Recommended)
**Notes:** Bảo vệ tài sản tri thức cá nhân an toàn tuyệt đối, chống mất mát dữ liệu do sơ suất.

---

## Claude's Discretion

- Thuật toán phân tách token tiếng Việt (Vietnamese Tokenizer) không dấu và có dấu trong hàm chấm điểm BM25.
- Cơ chế debounce và virtual list khi hiển thị danh sách tài liệu lớn ở cột giữa của `NotesView`.
- Cấu hình phím tắt mở nhanh tìm kiếm tài liệu toàn cục `Cmd+Shift+K` (macOS) / `Ctrl+Shift+K` (Windows).

## Deferred Ideas

- **Bi-directional Live Sync with Obsidian Vault Folder:** Lắng nghe thay đổi file trên ổ đĩa theo thời gian thực (file watcher) để đồng bộ 2 chiều liên tục — dành cho phase v1.2.
- **Knowledge Graph Visualization:** Đồ thị mạng lưới liên kết hình cầu / 2D (Interactive Graph View) — đưa vào backlog ý tưởng tương lai.
- **Collaborative Real-time Editing:** Chỉnh sửa tài liệu đồng thời nhiều người — ngoài phạm vi ứng dụng cá nhân (Personal App).
