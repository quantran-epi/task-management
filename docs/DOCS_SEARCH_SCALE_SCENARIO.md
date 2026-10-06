# Kịch Bản Nâng Cấp Hệ Thống Tài Liệu Khi Vượt Ngưỡng 10.000 Docs

## 1. Ngữ Cảnh & Vấn Đề Khi Vượt 10.000 Docs
- **Kiến trúc hiện tại (Option A)**: Dùng IndexedDB + Web Worker chạy in-memory BM25.
  - Phù hợp: Dưới 10.000 docs (< 25MB text thô).
  - Điểm nghẽn khi vượt 10k:
    1. Thời gian khởi động (cold boot) chuyển dữ liệu từ IndexedDB sang Web Worker kéo dài (> 2-3s).
    2. RAM heap của Worker tiêu tốn > 80-120MB, dễ bị trình duyệt hạn chế trên thiết bị yếu / tab nền.

---

## 2. Kịch Bản Nâng Cấp (2 Nhánh Môi Trường)

### Nhánh 1: Trên Tauri Desktop App (Khuyến nghị ưu tiên)
Tận dụng Rust backend và SQLite native đã có sẵn trong dự án:

1. **Lưu trữ**: 
   - Đưa nội dung Note từ IndexedDB/sync sang bảng `notes` trong SQLite cục bộ (`.db`).
2. **Full-Text Search Engine**:
   - Bật virtual table `notes_fts USING fts5(id UNINDEXED, title, tags, body, tokenize = 'unicode61')`.
   - SQLite tự động phân trang (disk paging), không load toàn bộ text lên RAM.
3. **Hiệu năng**:
   - Gánh mượt mà **100.000 – 500.000 docs**.
   - Thời gian tìm kiếm: < 5ms qua Tauri IPC command (`invoke('search_notes_fts', { query, limit })`).
4. **AI Context Pipeline**:
   - Tool `search_knowledge_documents` trong `aiTools.ts` gọi trực tiếp IPC Rust -> lấy top snippet liên quan nhất gửi LLM.

---

### Nhánh 2: Trên Web PWA (Thuần Trình duyệt)
Nếu vẫn muốn chạy offline 100% trên browser không dùng desktop backend:

1. **Thay thế in-memory BM25 bằng SQLite-WASM + OPFS**:
   - Nhúng thư viện `@sqlite.org/sqlite-wasm`.
   - Lưu trữ cơ sở dữ liệu trên **OPFS (Origin Private File System)**.
   - Dùng SQLite FTS5 biên dịch sẵn trong WASM.
2. **Quy trình hoạt động**:
   - Web Worker đóng vai trò quản lý kết nối SQLite-WASM.
   - Thao tác insert/update doc ghi trực tiếp vào FTS5 table trên OPFS.
   - Khi search, câu lệnh SQL FTS5 chạy trực tiếp trên file đĩa của OPFS, không tốn RAM heap.
3. **Hiệu năng**:
   - Chịu tải tốt từ **20.000 – 50.000 docs** trên mobile và desktop browser.

---

## 3. Checklist Thực Thi Khi Nâng Cấp

- [ ] **Bước 1**: Đánh giá dung lượng và số lượng docs hiện tại qua trang Settings/Storage.
- [ ] **Bước 2**: Tạo migration script đồng bộ dữ liệu từ Dexie `notes` sang SQLite FTS5 table.
- [ ] **Bước 3**: Cập nhật hàm gọi `search_knowledge_documents` trong `src/services/ai/aiTools.ts` để ưu tiên nhánh FTS5 native nếu môi trường là Tauri.
- [ ] **Bước 4**: Thêm cơ chế benchmark so sánh latency giữa BM25 in-memory và FTS5.
