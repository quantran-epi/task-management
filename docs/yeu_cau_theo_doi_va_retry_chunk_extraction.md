# Yêu cầu kỹ thuật: Theo dõi trạng thái từng Chunk và Retry riêng lẻ khi trích xuất Graph bằng LLM

## 1. Bối cảnh & Vấn đề hiện tại
- Hiện tại, khi rebuild đồ thị tri thức, toàn bộ tài liệu được chia thành các chunk (~2,500 - 3,500 ký tự) và gửi lần lượt lên LLM.
- **Vấn đề**:
  - Mô hình hiện tại là **All-or-Nothing**: Nếu 1 chunk bị lỗi (rate limit, mạng đứt, lỗi JSON) sau khi retry thất bại thì cả tiến trình rebuild bị dừng lại (`Failed`).
  - Người dùng không quan sát được chi tiết từng chunk nào đã thành công, chunk nào đang xử lý, chunk nào bị lỗi và lỗi cụ thể là gì.
  - Khi bấm "Thử lại", hệ thống phải chạy lại từ đầu toàn bộ các chunk của bộ tài liệu, gây lãng phí thời gian và token/chi phí gọi LLM của các chunk đã extract thành công trước đó.

---

## 2. Mục tiêu yêu cầu
1. **Theo dõi chi tiết từng chunk (Per-Chunk Granular Progress)**:
   - Người dùng có thể xem danh sách trực quan toàn bộ các chunk đang được trích xuất.
   - Thể hiện rõ: Tên tài liệu, vị trí chunk, trạng thái (`Chờ xử lý`, `Đang trích xuất`, `Thành công`, `Thất bại`), lỗi cụ thể của từng chunk.
2. **Lưu cache kết quả chunk thành công (Chunk Result Persistence)**:
   - Chunk nào đã extract thành công thì lưu lại kết quả (Entities, Facts, Evidence).
   - Không gọi lại LLM cho các chunk đã hoàn thành.
3. **Thử lại có chọn lọc (Selective Chunk Retry)**:
   - Cung cấp nút **"Thử lại tất cả chunk lỗi" (Retry Failed Chunks)**.
   - Cung cấp nút **"Thử lại" riêng lẻ** trên từng dòng chunk bị lỗi.
   - Khi chạy retry, server chỉ gửi đúng các chunk được chỉ định lên LLM, sau đó tự động tổng hợp (merge) lại vào đồ thị ứng viên và hoàn tất.

---

## 3. Thiết kế giải pháp kiến trúc

### A. Backend (`knowledge-server`)
1. **Lưu trữ trạng thái Chunk (`ChunkExtractionStore`)**:
   - Khóa lưu trữ theo `setId` và `sourceSnapshotId`.
   - Cấu trúc dữ liệu mỗi chunk:
     ```typescript
     interface ChunkExtractionItem {
       chunkId: string; // hash(docId + chunkIndex)
       documentId: string;
       documentTitle: string;
       chunkIndex: number;
       totalChunksInDoc: number;
       status: 'PENDING' | 'EXTRACTING' | 'SUCCESS' | 'FAILED';
       error?: string;
       updatedAt: string;
       nodesCount?: number;
       factsCount?: number;
     }
     ```
   - Lưu trữ kết quả trích xuất của từng chunk thành công vào bộ nhớ/disk cache tạm thời của phiên build.

2. **API Endpoints mới**:
   - `GET /api/v1/sets/:setId/graph/chunks`:
     - Trả về danh sách chi tiết toàn bộ các chunk của lần build gần nhất:
       ```json
       {
         "setId": "uuid",
         "total": 12,
         "success": 10,
         "failed": 2,
         "pending": 0,
         "chunks": [
           {
             "chunkId": "c_1",
             "documentTitle": "Tài liệu A",
             "chunkIndex": 0,
             "status": "SUCCESS",
             "nodesCount": 4,
             "factsCount": 6
           },
           {
             "chunkId": "c_2",
             "documentTitle": "Tài liệu B",
             "chunkIndex": 1,
             "status": "FAILED",
             "error": "LLM_HTTP_429: Rate limit exceeded"
           }
         ]
       }
       ```
   - `POST /api/v1/sets/:setId/graph/retry-chunks`:
     - Header: `X-Rebuild-Key: uuid`
     - Body: `{ "chunkIds": ["c_2"] }` (nếu mảng rỗng thì tự động retry tất cả chunk có status `FAILED`).
     - Chỉ gọi LLM cho các chunk được chỉ định. Cập nhật lại kết quả vào cache, sau đó kích hoạt bước tổng hợp đồ thị (Validation, Vector, Fulltext).

### B. Frontend (`task-management`)
1. **Giao diện Modal / Drawer tiến trình chi tiết (`ChunkProgressModal`)**:
   - Mở từ link "Xem chi tiết tiến trình" ngay cạnh thanh Progress hoặc từ bảng thông báo lỗi.
   - Danh sách/Table gồm các cột:
     - **Tài liệu**: Tên file tài liệu.
     - **Phần (Chunk)**: Thứ tự chunk (vd: `1/4`).
     - **Trạng thái**:
       - Tag Xanh lá: `Thành công` (kèm số thực thể/quan hệ tìm thấy).
       - Tag Xanh dương (spin): `Đang trích xuất`.
       - Tag Xám: `Chờ xử lý`.
       - Tag Đỏ: `Thất bại` (bấm vào xem chi tiết lỗi).
     - **Hành động**: Nút `Thử lại` riêng cho các dòng thất bại.
   - **Header Actions**:
     - Nút chính: **"Thử lại tất cả phần lỗi" (Retry All Failed)**.
     - Nút "Làm mới trạng thái".

---

## 4. Đánh giá thời gian thực hiện (Có nhanh không?)
- **Mức độ phức tạp**: Trung bình (Medium).
  - Không cần sửa đổi cơ sở dữ liệu Neo4j hay ontology cốt lõi.
  - Chỉ cần quản lý state trung gian của các chunk trong quá trình trích xuất (`knowledge-server/src/ai/llmExtraction.ts` + `graphBuildService.ts`), thêm 2 endpoint API và bổ sung bảng hiển thị trên UI client.
- **Thời gian ước tính**: Khoảng **30 - 45 phút** để triển khai hoàn chỉnh cả Backend API, Frontend Table UI, cơ chế Selective Retry và kiểm thử.
