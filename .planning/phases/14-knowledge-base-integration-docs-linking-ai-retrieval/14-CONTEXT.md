# Phase 14: Knowledge Base Integration (Docs, Linking & AI Retrieval) - Context

**Gathered:** 2026-10-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 14 cung cấp hệ thống Quản lý Tri thức Cá nhân (Knowledge Base) toàn diện và ngoại tuyến trong PlannerMate:
1. **Quản lý Tài liệu Markdown:** Cấu trúc phân cấp Thư mục cây (Folder Tree) kết hợp Nhãn (Tags), nâng cấp trang Ghi chú hiện tại thành giao diện "Tài liệu & Ghi chú" 3 cột (Cây thư mục + Danh sách tài liệu + Trình soạn thảo/Đọc Split View có ToC và Syntax Highlighting).
2. **Luồng Nạp Tri thức Nhanh (Smart Ingestion Flow):** Người dùng tạo Markdown từ bên ngoài (Claude, ChatGPT, Obsidian...), chỉ cần dán (paste) vào Knowledge Base. Hệ thống tự động trích xuất Heading làm Tiêu đề, phát hiện Tags, và chạy 2 tầng Auto-Detect (quét từ khóa/mã Jira + AI Semantic Match) để hiển thị banner gợi ý liên kết 1-Click ("Gợi ý liên kết liên quan") gắn với Tasks, Projects, Milestones mà không cần tìm thủ công.
3. **Liên kết Hai chiều & Backlinks:** Hỗ trợ cú pháp Wiki-link `[[...]]` với autocomplete khi gõ, render thành Chip bấm được. Bổ sung khu vực "Tài liệu & Tri thức liên kết" trong TaskDrawer và ProjectView kèm Quick Preview Drawer xem nhanh tại chỗ; hiển thị chân trang "Được liên kết từ (Backlinks)" trong Document Viewer.
4. **AI Retrieval & Grounding:** Trang bị AI Tool `search_knowledge_base` chạy thuật toán Lexical BM25 ngoại tuyến trong IndexedDB (có AI Query Expansion, chuẩn hóa tiếng Việt không dấu, trọng số Title x3, Tags x2, Body x1). Cắt trích đoạn liên quan (Snippet Extraction) theo ngân sách ký tự context. Hỗ trợ gõ `@doc:` trong thanh Chat AI và nút "Hỏi AI về tài liệu này". Câu trả lời của AI có gắn thẻ trích dẫn bấm được (Clickable Citation Chips).
5. **Lưu trữ, An toàn & Ngoại tuyến:** IndexedDB làm nguồn sự thật chính (Source of Truth) trên cả Web PWA và Desktop Tauri, bảo vệ bằng mã hóa Web Crypto và GitHub backup hiện có. Desktop Tauri hỗ trợ Import/Export thư mục Markdown (.zip / .md) và mở trong Obsidian/VS Code. Lưu ảnh nhị phân trong `noteAttachments` qua cú pháp `![caption](attachment:uuid)`. Cơ chế Thùng rác (Trash Bin) chống xóa nhầm kèm cảnh báo Backlinks.

Phase không bao gồm: máy chủ lưu trữ tài liệu tập trung (cloud document server), giao thức cộng tác nhiều người (real-time collaborative CRDTs), và các thư viện rich-text WYSIWYG nặng làm phình bundle.

</domain>

<decisions>
## Implementation Decisions

### Doc Structure & Knowledge Organization
- **D-01: Unified Note Model:** Mở rộng interface `Note` hiện tại với các trường `type: 'quick_note' | 'document'`, `parentId?: string` (phân cấp thư mục), `tags?: string[]`, `slug?: string`, `deletedAt?: string` (soft delete). Tái sử dụng bảng Dexie `notes` và `noteAttachments`, giữ tương thích 100% với Note popout và các AI tool hiện có.
- **D-02: Folder Tree + Tag Taxonomy:** Quản lý tài liệu theo cây thư mục nhiều cấp (`parentId`) kết hợp hệ thống tag linh hoạt. Thư mục mặc định cho tài liệu mới dán là "Inbox / Chung", cho phép di chuyển kéo thả hoặc chọn folder.
- **D-03: Markdown Split View + Outline ToC:** Trình soạn thảo và đọc tài liệu hỗ trợ chế độ xem song song (Split Editor/Preview) hoặc chuyển tab, tự động sinh Mục lục (Table of Contents / ToC) từ các thẻ Heading (`#`, `##`, `###`), hỗ trợ Syntax Highlighting cho code blocks.
- **D-04: Unified 3-Column Docs View:** Nâng cấp trang "Ghi chú" (`NotesView`) thành layout 3 cột chuẩn Document App:
  - Cột 1 (Sidebar con ~220px): Cây thư mục + Tags + Bộ lọc nhanh (Đã ghim, Tài liệu, Ghi chú nhanh, Thùng rác).
  - Cột 2 (Doc List ~300px): Danh sách tài liệu trong thư mục đã chọn, có thanh tìm kiếm, sắp xếp theo thời gian cập nhật.
  - Cột 3 (Main Content): Trình soạn thảo Markdown / Trình xem tài liệu toàn diện kèm nút phóng to Fullscreen và nút mở cửa sổ riêng (Popout). Vẫn hỗ trợ nút chuyển đổi Grid View khi chỉ muốn xem Sticky Notes.

### Linking Model & Smart Ingestion
- **D-05: Wiki-link Inline Syntax:** Hỗ trợ cú pháp `[[doc:id|Title]]`, `[[task:id|Title]]`, `[[project:id|Title]]`. Gõ `[[` kích hoạt Autocomplete Dropdown tìm kiếm nhanh Doc, Task, Project. Khi đọc (Rendered Preview) hiển thị thành clickable Chip trực quan; click vào Doc mở tài liệu, click vào Task/Project mở TaskDrawer hoặc chuyển view.
- **D-06: 2-Tier Auto-Detect & 1-Click Link Application:** Luồng nhập liệu cốt lõi: Khi người dùng paste Markdown từ bên ngoài vào:
  - Tầng 1: Thuật toán quét tức thì các từ khóa, mã Jira (`PROJ-123`), tên Task, Project, Milestone có sẵn trong cơ sở dữ liệu.
  - Tầng 2: AI Semantic Match đọc lướt nội dung để phát hiện các Task/Project đang hoạt động có liên quan mật thiết.
  - Hiển thị banner "💡 Gợi ý liên kết liên quan" ở đầu bài viết với danh sách checkbox và nút **"Áp dụng tất cả (Apply All)"** (1 click duy nhất) để tạo liên kết hai chiều tự động.
- **D-07: Dedicated Linked Knowledge Section & Quick View:** Trong `TaskDrawer` và `ProjectsView`, bổ sung khu vực "📚 Tài liệu & Tri thức liên kết (Linked Knowledge)" liệt kê các tài liệu đã gắn. Bấm vào tài liệu sẽ mở cửa sổ trượt đọc nhanh (Quick Preview Drawer) tại chỗ mà không làm mất ngữ cảnh công việc đang làm.
- **D-08: Backlinks Footer:** Dưới chân mỗi tài liệu trong Document Viewer có khu vực "🔗 Được liên kết từ (Backlinks)" hiển thị danh sách các Task, Project đang tham chiếu đến tài liệu này, bấm vào mở ngay TaskDrawer tương ứng.
- **D-09: Smart Auto-Metadata Extraction:** Khi paste nội dung Markdown: Tự động trích xuất dòng `# Heading 1` đầu tiên làm Tiêu đề; trích xuất các hashtag `#keyword` làm Tags; nếu phát hiện liên kết với Project thì gợi ý chuyển vào folder của Project đó; tự động lưu nháp sau 500ms debounce.

### AI Retrieval & Knowledge Grounding
- **D-10: Tool-Calling + BM25 Lexical Retrieval:** Trang bị AI Tool `search_knowledge_base(query, tags, limit)` trong `aiTools.ts`. Khi người dùng đặt câu hỏi, AI tự phân tích ý định (Query Expansion) và gọi tool này. Thuật toán BM25 cải tiến chạy tức thì trong IndexedDB, chuẩn hóa tiếng Việt không dấu/có dấu, tính điểm trọng số (Title x3, Tags x2, Body x1). 100% offline, zero network latency, không tốn thêm token sinh embeddings.
- **D-11: Relevance Snippet Extraction with Dynamic Char Budget:** Khi đưa tài liệu vào prompt context, hệ thống không nhồi nguyên bài dài mà trích xuất Metadata (Tiêu đề, Tags) + Đoạn Heading và văn bản chứa từ khóa khớp cao nhất (kèm 2-3 dòng ngữ cảnh trước/sau) của top 2-3 tài liệu liên quan. Tôn trọng ngân sách ký tự context `planner:ai_context_char_limit` đã thiết lập ở Phase 13.2.
- **D-12: Dual Explicit Doc Reference:** Cho phép chỉ định tài liệu trực tiếp vào hội thoại AI qua 2 cách:
  - Gõ `@doc:` trong `ChatInputBar` (bật popup tìm kiếm và chọn doc, tương tự `@task` và `@file`).
  - Nút "💬 Hỏi AI về tài liệu này" trên Header của Document Viewer (tự động mở AI Chat Drawer và gắn sẵn context của doc đó).
- **D-13: Clickable Citation Chips & Attribution:** Trong câu trả lời của AI, các đoạn kiến thức trích từ Knowledge Base có gắn chip tham chiếu bấm được `[📄 Tên tài liệu §Mục]` và danh sách tài liệu tham khảo ở cuối câu trả lời. Bấm vào mở Quick Preview Drawer ngay lập tức để người dùng kiểm chứng thông tin.

### Storage, Files & Data Safety
- **D-14: IndexedDB Source of Truth:** Toàn bộ tài liệu lưu trữ trong IndexedDB (bảng `notes` mở rộng). Tự động đồng bộ vào file backup mã hóa Web Crypto (AES-GCM) lên GitHub Contents API và JSON export. Đảm bảo hoạt động 100% offline trên cả Web PWA và Desktop Tauri.
- **D-15: Desktop Tauri Import/Export & External Editor:** Trên Desktop Tauri, cung cấp các hành động tiện ích:
  - Nhập thư mục Markdown hoặc file `.md` từ máy tính vào Knowledge Base.
  - Xuất toàn bộ Knowledge Base thành gói `.zip` (bảo toàn cấu trúc thư mục + folder `attachments/`) hoặc file `.md` lẻ.
  - Nút "Mở trong VS Code / Obsidian" cho tài liệu cục bộ nếu có đường dẫn file liên kết.
- **D-16: Binary Blob Attachments (`attachment:uuid`):** Paste/kéo thả ảnh vào Editor được lưu dưới dạng Blob trong bảng `noteAttachments`, văn bản Markdown chỉ chứa cú pháp `![caption](attachment:uuid)`. Giữ text Markdown cực nhẹ, tối ưu cho tìm kiếm và AI context. Tự động nén ảnh chụp màn hình dung lượng lớn (>2MB).
- **D-17: Soft Delete (Trash Bin) & Backlinks Warning:** Xóa tài liệu sẽ đưa vào "Thùng rác" (`deletedAt`), cho phép Khôi phục (Restore) hoặc Xóa vĩnh viễn (Permanent Delete). Khi bấm xóa tài liệu đang được Task hoặc Project liên kết, hệ thống hiển thị cảnh báo danh sách các liên kết bị ảnh hưởng trước khi xác nhận.

### Claude's Discretion
- Thuật toán phân tách token tiếng Việt (Vietnamese Tokenizer) không dấu và có dấu trong hàm chấm điểm BM25.
- Cơ chế debounce và virtual list khi hiển thị danh sách tài liệu lớn ở cột giữa của `NotesView`.
- Cấu hình phím tắt mở nhanh tìm kiếm tài liệu toàn cục `Cmd+Shift+K` (macOS) / `Ctrl+Shift+K` (Windows).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Roadmap & Requirements
- `.planning/ROADMAP.md` §Phase 14 — Mục tiêu tổng thể của Phase 14 về Knowledge Base, Linking & AI Retrieval.
- `.planning/phases/13.2-ai-chat-drawer-item-context-grounding-9router-ask-answer-int/13.2-CONTEXT.md` — Quyết định kiến trúc AI Chat Drawer, context grounding, và tích hợp 9router API.

### Data Models & Persistence
- `src/types/models.ts` — Định nghĩa interface `Note`, `NoteAttachment`, `Task`, `Project`, `Milestone`.
- `src/db/schema.ts` — Định nghĩa Dexie schema qua các phiên bản (chuẩn bị nâng cấp `SCHEMA_V9` cho các trường mở rộng của `notes`).
- `src/db/repositories/noteRepo.ts` — CRUD operations cho Note và NoteAttachment.
- `src/db/repositories/cascadeRepo.ts` — Xử lý xóa cascade liên kết và quan hệ dữ liệu.

### AI Integration & Search
- `src/services/ai/aiTools.ts` — Danh sách AI tool definitions và hàm thực thi (`AI_DATABASE_TOOLS`, `executeAiDatabaseTool`).
- `src/services/ai/contextGrounding.ts` — Đóng gói prompt ngữ cảnh cho Task/Project/File và trần ký tự context.
- `src/components/ai/ChatInputBar.tsx` — Xử lý autocomplete `@mention` (`@task`, `@project`, `@file`, chuẩn bị thêm `@doc`).
- `src/components/ai/AIChatDrawer.tsx` — Giao diện AI Chat Drawer và hiển thị tin nhắn streaming.

### Views & Editor UI
- `src/views/NotesView.tsx` — Giao diện danh sách Note hiện tại (điểm mở rộng thành 3-cột Docs View).
- `src/components/notes/NoteEditor.tsx` & `NoteDetailModal.tsx` — Bộ soạn thảo và modal hiển thị chi tiết ghi chú.
- `src/components/tasks/TaskDrawer.tsx` — Drawer thông tin Task (điểm chèn mục Linked Knowledge).
- `src/utils/markdown.ts` — Bộ render Markdown an toàn.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/db/repositories/noteRepo.ts`: Đã có các hàm `createNote`, `updateNote`, `deleteNote`, `getNoteAttachments`, `addNoteAttachment`. Có thể tái sử dụng và mở rộng cho `type: 'document'`, `parentId`, `tags`.
- `src/components/ai/ChatInputBar.tsx`: Đã có sẵn hạ tầng phân tích cú pháp trigger `@` và danh sách suggestions popup cho `@task`, `@project`, `@file`. Chỉ cần bổ sung `@doc` (hoặc `@d`).
- `src/utils/markdown.ts`: Bộ render Markdown an toàn, có thể mở rộng plugin/regex để hỗ trợ render cú pháp wiki-link `[[...]]` và ảnh nhị phân `attachment:uuid`.
- `src/utils/documentLinks.ts`: Tiện ích mở file và URL, hỗ trợ kiểm tra môi trường Desktop Tauri vs Web.

### Established Patterns
- **Dexie Schema Upgrades:** Mỗi lần bổ sung trường/bảng mới đều tăng version (`SCHEMA_V9`) trong `src/db/schema.ts` với hàm `upgrade()` an toàn dữ liệu cũ.
- **Tool-calling Architecture:** Thêm công cụ mới vào mảng `AI_DATABASE_TOOLS` và switch-case trong `executeAiDatabaseTool` của `src/services/ai/aiTools.ts`.
- **Responsive Drawer & Side-by-side Layout:** Tái sử dụng mẫu thiết kế của `TaskDrawer` và `AIChatDrawer` cho Quick Preview Drawer.
- **LocalStorage Preferences:** Lưu các tùy chọn giao diện với tiền tố `planner:*` (ví dụ `planner:docs_layout_view`, `planner:docs_active_folder`).

### Integration Points
- `src/views/NotesView.tsx`: Tái cấu trúc thành giao diện 3 cột linh hoạt cho cả Sticky Notes và Knowledge Docs.
- `src/components/tasks/TaskDrawer.tsx`: Chèn component `LinkedKnowledgeSection` vào phần thông tin chi tiết của Task.
- `src/components/projects/ProjectsView.tsx`: Thêm tab hoặc section "Tài liệu & Kiến thức dự án".
- `src/services/ai/aiTools.ts`: Bổ sung 2 tool `search_knowledge_base` và `get_document_details`.
- `src/components/ai/ChatInputBar.tsx`: Thêm mục `@doc:` vào danh sách trigger autocomplete.

</code_context>

<specifics>
## Specific Ideas

- **Luồng nạp Markdown bên ngoài (Key User Flow):** Người dùng thường soạn thảo hoặc sinh tài liệu Markdown từ các công cụ AI bên ngoài, sau đó dán (paste) trực tiếp vào PlannerMate. Hệ thống phải tối ưu hóa luồng này: Tự động trích xuất `# Tiêu đề`, phân tích từ khóa/mã Jira, gọi AI Semantic Match để đưa ra banner "Gợi ý liên kết liên quan" với 1-Click "Áp dụng tất cả", tự động xếp vào folder phù hợp mà không bắt người dùng phải duyệt folder hay gõ cú pháp link thủ công.
- **Clickable Citations:** Khi AI trả lời dựa trên tài liệu, thẻ trích dẫn `[📄 Tên doc]` phải mở ngay cửa sổ đọc lướt xem nhanh để đối chiếu độ tin cậy.

</specifics>

<deferred>
## Deferred Ideas

- **Bi-directional Live Sync with Obsidian Vault Folder:** Tự động lắng nghe thay đổi file trên ổ đĩa theo thời gian thực (file watcher) để đồng bộ 2 chiều liên tục — để dành cho phase tích hợp Desktop nâng cao trong tương lai (v1.2).
- **Knowledge Graph Visualization:** Đồ thị mạng lưới liên kết hình cầu / 2D (Interactive Graph View kiểu Obsidian) — chuyển sang backlog ý tưởng tương lai.
- **Collaborative Real-time Editing:** Chỉnh sửa tài liệu đồng thời nhiều người — ngoài phạm vi ứng dụng cá nhân (Personal App).

</deferred>

---

*Phase: 14-knowledge-base-integration-docs-linking-ai-retrieval*
*Context gathered: 2026-10-04*
