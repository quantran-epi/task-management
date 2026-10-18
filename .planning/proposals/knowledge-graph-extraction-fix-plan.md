# Kế hoạch cải tổ Knowledge Graph Entity Extraction & Retrieval

## 1. Vấn đề gốc (Root Causes)
1. **Thực thể vô nghĩa (`STEP_xxx`)**:
   - `src/views/NotesView.tsx` (`AI_KNOWLEDGE_DOC_PROMPT`): Prompt ép tạo bảng có cột `STEP_ID`. Khi không có ID sẵn, AI sinh mã giả `STEP_01`, `STEP_02`...
   - `knowledge-server/src/graph/extraction.ts` (`handleStepTable`): Dùng trực tiếp `rawStepId` làm `normalizedKey`, bỏ qua cột `TEN_BUOC` (`nameIdx`), đặt `canonicalName` thành `Step 1` cộc lốc và `aliases: []`.
2. **Quan hệ bị bỏ sót**:
   - `handleStepTable` nhận diện cột `WRITES` nhưng không bóc tách tên bảng, không tạo quan hệ `WRITES_TO`.
3. **Graph Retrieval luôn trả về 0 item count**:
   - `knowledge-server/src/retrieval/queryPlanning.ts`: Người dùng hỏi bằng ngôn ngữ tự nhiên ("quy trình thanh toán"), Cypher `RESOLVE_ENTITIES` không khớp được với các node `STEP_xxx` hay `Step 1`.
   - Kết quả: `candidates: []` → cờ `NO_GRAPH_SEED` → Graph Traversal trả về `itemCount: 0`.
4. **Phụ thuộc 100% vào bảng**:
   - `PROSE_EXTRACTION_ENABLED=false` trong `docker-compose.yml`, văn xuôi và code block ngoài bảng bị bỏ qua hoàn toàn.

---

## 2. Danh sách các file và nội dung cần sửa

### File 1: `knowledge-server/src/graph/extraction.ts` (Ưu tiên cao nhất)
- **Nâng cấp `handleStepTable`**:
  - Đọc cột `nameIdx` (`TEN_BUOC` / `PROCEDURE_NAME`):
    - Đặt `canonicalName = cells[nameIdx]`.
    - Thêm `rawStepId`, `cells[nameIdx]`, và chuỗi không dấu vào `aliases`.
  - Đọc cột `writesIdx` (`WRITES` / `GHI` / `TARGET_TABLE`):
    - Tách các token bảng CSDL (`MAIN1.TBL_...` hoặc `TBL_...`).
    - Tạo node `DatabaseObject`.
    - Tạo fact `WRITES_TO` từ `ProcessStep` (hoặc `SoftwareComponent` target) đến `DatabaseObject`.
  - Nếu `rawStepId` là mã giả (`STEP_1`, `STEP_01`), hạ trọng số hoặc ưu tiên định danh nghiệp vụ làm canonical.
- **Bổ sung trích xuất thực thể từ Code & Inline Code**:
  - Quét AST các khối `code` (SQL, PL/SQL) và inline code spans `` `SCHEMA.TABLE` `` để tự động phát hiện `SoftwareComponent` và `DatabaseObject` ngay cả khi không có bảng Markdown.

### File 2: `src/views/NotesView.tsx` & `src/components/notes/NormalizeDocModal.tsx`
- **Sửa `AI_KNOWLEDGE_DOC_PROMPT` & `RECOMMENDED_DOC_TEMPLATE`**:
  - Bỏ ép buộc cột `STEP_ID` nếu tài liệu không có mã hệ thống sẵn.
  - Chuẩn hoá cấu trúc bảng sang:
    `| THU_TU | TEN_BUOC | TARGET (Thủ tục/API) | WRITES (Bảng ghi) | GHI_CHU |`
  - Bổ sung chỉ dẫn: Ưu tiên ghi rõ tên bảng CSDL, Package.Procedure, Job/Service thật bằng backticks (code span).

### File 3: `knowledge-server/src/retrieval/queryPlanning.ts` & `neo4jRepository.ts`
- **Cải tiến Seed Resolution (`CYPHER_QUERIES.RESOLVE_ENTITIES`)**:
  - Mở rộng điều kiện khớp: tìm kiếm không phân biệt hoa thường và không dấu trên `canonicalName`, `aliases`.
  - Hỗ trợ tìm kiếm theo cụm từ hoặc fulltext index trên Node `Entity` trong Neo4j thay vì chỉ so khớp exact token.
- **Query Planner Fallback**:
  - Khi câu hỏi người dùng nhắc đến hành động/nghiệp vụ (ví dụ: "thanh toán", "đối soát"), liên kết tới các node `ProcessStep` có `canonicalName` tương ứng để làm Seed URN.

### File 4: `docker-compose.yml` & `knowledge-server/src/main.ts`
- **Kích hoạt Hybrid Prose Extraction**:
  - Đổi `PROSE_EXTRACTION_ENABLED=true` trong `docker-compose.yml`.
  - Cấu hình endpoint LLM (NineRouter hoặc mô hình nội bộ) cho `proseExtraction`.
  - Đảm bảo cơ chế fallback: nếu LLM timeout hoặc offline, hệ thống vẫn dùng kết quả trích xuất tất định (deterministic regex) mà không gián đoạn build đồ thị.

### File 5: Test Suites
- Cập nhật và bổ sung test cases:
  - `knowledge-server/tests/generalDocumentExtraction.test.ts`: Test bảng có `TEN_BUOC` và `WRITES` trích xuất đủ node `ProcessStep`, `DatabaseObject` và quan hệ `WRITES_TO`.
  - `knowledge-server/tests/retrievalService.test.ts`: Test câu hỏi tự nhiên tìm được seed từ `canonicalName` tiếng Việt của `ProcessStep`.
  - `tests/notes/NormalizeDocModal.test.tsx`: Test template prompt mới không sinh cột `STEP_ID` giả.

---

## 3. Thứ tự triển khai dự kiến
1. **Bước 1 (Backend Core)**: Sửa `extraction.ts` (`handleStepTable` + `WRITES`) và cập nhật unit test trong `knowledge-server`.
2. **Bước 2 (Retrieval Matching)**: Cải tiến `RESOLVE_ENTITIES` trong `neo4jRepository.ts` và `queryPlanning.ts` để câu hỏi tự nhiên bắt được seed.
3. **Bước 3 (Prompt & Frontend)**: Cập nhật `AI_KNOWLEDGE_DOC_PROMPT` trong `NotesView.tsx`.
4. **Bước 4 (Hybrid Prose & Config)**: Bật `PROSE_EXTRACTION_ENABLED` trong Docker Compose và kiểm thử E2E.
