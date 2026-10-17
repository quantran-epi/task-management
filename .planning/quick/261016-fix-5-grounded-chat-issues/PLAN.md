# Plan: Sửa 5 vấn đề AI Grounded Chat và Tra cứu Tri thức

## Mục tiêu
Khắc phục triệt để 5 vấn đề trong luồng AI Chat và tra cứu tri thức TaskMate:
1. Đường dẫn suy luận rỗng: bảo toàn graph paths từ Knowledge server trong evidence pack và synthesis schema/prompt.
2. Nhớ toàn bộ lịch sử chat trong chế độ tra cứu tri thức: truyền đầy đủ history thay vì cắt 3 turn hoặc mảng rỗng.
3. Tách luồng thinking: ẩn khỏi câu trả lời cuối, hiển thị động trong loading status (cái sau đè cái trước) và dọn sạch khi xong.
4. Nút Hủy (Stop) khi đang tra cứu tri thức: phản hồi trạng thái bận và cho phép abort signal.
5. Ổn định hóa kết quả tra cứu: tăng budget thời gian, tránh false-negative NO_EVIDENCE khi có dữ liệu đồ thị.

## Kế hoạch thực hiện
- Task 1: Sửa tách biệt `reasoning_content` và strip `<think>` trong `nineRouterClient.ts` + hiển thị thinking status động trong `AIChatDrawer.tsx`.
- Task 2: Thêm hỗ trợ abort và nút Hủy cho `ChatInputBar` khi `groundedLoadingStatus` đang chạy trong `AIChatDrawer.tsx`.
- Task 3: Truyền toàn bộ lịch sử hội thoại vào `runGroundedTurn`, `retrieveFederated` và `groundedSynthesis.ts`.
- Task 4: Giữ lại graph paths trong `evidencePack.ts` và map inference claims đúng vào `groundedSynthesis.ts`.
- Task 5: Cấu hình tăng budget federated retrieval và kiểm thử test suite.
