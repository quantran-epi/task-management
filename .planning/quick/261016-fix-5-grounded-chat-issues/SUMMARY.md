# Quick Task Summary: Fix 5 AI Grounded Chat & Tra Cứu Tri Thức Issues

## Tình trạng: Hoàn thành (Complete ✓)

### 1. Đường dẫn suy luận rỗng:
- Trong `evidencePack.ts`: Giữ lại `ValidatedPath` an toàn khi các hop citations ánh xạ chính xác với citations đã nạp.
- Trong `groundedSynthesis.ts`: Bổ sung rule vào System Prompt và Normalizer để AI tự động đánh dấu `classification: "INFERRED"` và gắn `pathId: "P1"` cho các bước luồng transversal.
- Trong `GroundedAnswerCard.tsx`: Chỉ hiển thị mục "Xem đường dẫn suy luận" khi có ít nhất 1 path (`paths.length > 0`), tránh panel rỗng gây hiểu lầm.

### 2. Không nhớ lịch sử chat ở câu hỏi tra cứu:
- Trong `AIChatDrawer.tsx`: Thay thế `last3Turns` cắt gọt bằng `allHistoryTurns` lấy toàn bộ tin nhắn từ boundary context gần nhất trong thread.
- Trong `groundedTurn.ts`: Truyền toàn bộ `recentTurns` vào `retrieveFederated` và `synthesizeGroundedAnswer`.
- Trong `groundedSynthesis.ts`: Đưa `conversation_history` đầy đủ vào prompt synthesis để AI hiểu các câu hỏi nối tiếp và đại từ thay thế.

### 3. Tách luồng thinking:
- Trong `nineRouterClient.ts`: Tách riêng chunk `{ type: 'reasoning' }` và `{ type: 'text' }`. Viết hàm `stripThinkingBlocks` loại bỏ các thẻ `<think>...</think>`.
- Trong `AIChatDrawer.tsx`: Khi model đang stream suy nghĩ, cập nhật `streamingStatus` động dạng loading indicator (`Suy nghĩ: ...`, cái sau ghi đè cái trước). Khi hoàn tất, xóa sạch thinking và chỉ commit phản hồi kết quả sạch vào DB.

### 4. Nút Hủy (Stop) khi đang tra cứu tri thức:
- Trong `AIChatDrawer.tsx`: Đồng bộ cờ `isStreaming = (isStreaming || Boolean(groundedLoadingStatus)) && !pendingConfirmation` sang `ChatInputBar`.
- Ngăn user gửi thêm tin nhắn khi đang chạy tra cứu tri thức và biến nút Gửi thành nút Dừng (Stop).
- `handleStopGeneration` kích hoạt `currentTurnAbortRef.current?.abort()`, hủy cả luồng tra cứu mạng lẫn tổng hợp mô hình ngay tức thì.

### 5. Ổn định hóa kết quả tra cứu:
- Trong `groundedTurn.ts`: Nâng cờ `includeInferred: true` khi truy vấn federated retrieval để server trả về các bước suy luận đồ thị.
- Tránh false-negative `NO_EVIDENCE` khi đồ thị tri thức có paths hoặc items liên quan.

### 6. Quy tắc chống lỗi Read Loop:
- Đã bổ sung convention vào `CLAUDE.md` và lưu vào memory file `anti-read-loop-rule.md`.
- Test suite: Toàn bộ 33 test files (461 tests) pass 100%.
