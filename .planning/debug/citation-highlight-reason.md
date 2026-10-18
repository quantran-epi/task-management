---
status: resolved
trigger: "tính năng AI chat, AI trả lời kết quả kèm theo trích dẫn, nhưng tôi đang cảm giác có những trích dẫn không liên quan. Ví dụ câu hỏi process nào xử lý phân bổ khoản thanh toán thẻ tín dụng, AI trả lời cụ thể như trong file @sample_ai_chat_turn/ui-inspect/sample-2.txt. trong danh sách nguồn trích dẫn có cả những tài liêụ có vẻ không liên quan. Một vấn đề nữa là preview trích dẫn, modal đang hiển thị đoạn chunk trên cùng và toàn bộ document bên dưới, sửa phần này chỉ cần hiển thị full document và highlight đoạn chunk trong đó, code highlight hiênj tại làm không tốt, lúc highlight được lúc không, chuyển sang dùng DOM element hoặc line number. Một vấn đề nưã là trong câu trả lời của AI yêu cầu mỗi trích dẫn cần có lý do tại sao trích dẫn đó liên quan đến câu hỏi, bắt buộc trích dẫn phải có đoạn giải thích này, và giải thích chi tiết chứ không phải cộc lốc, giải thích thật chi tiết để người dùng hiểu tại sao đoạn trích dẫn này giải đáp câu hỏi hoặc liên quan đến câu hỏi, nếu tài liệu không liên quan, không thêm vào trích dẫn hiển thị trong câu trả lời gây confuse cho người dùng. Modal preview trích dẫn, phần tài liệu full, show thêm line number từng dòng cho dễ nhìn."
created: 2026-10-18
updated: 2026-10-18
symptoms:
  expected: "1) Chỉ các tài liệu thực sự được AI trích dẫn và liên quan trực tiếp mới được hiển thị trong câu trả lời (inline tags và danh sách nguồn tài liệu). Các tài liệu retrieval không liên quan bị loại bỏ. 2) Modal preview trích dẫn QuickPreviewDrawer chỉ hiển thị full document với cột số dòng (line number 1..N) ở lề trái cho từng dòng; highlight đoạn chunk bên trong bằng DOM element và line number; tự động cuộn đến vị trí dòng trích dẫn. 3) Trong câu trả lời của AI, mỗi trích dẫn bắt buộc phải có lý do liên quan giải thích chi tiết, cụ thể tại sao trích dẫn giải đáp câu hỏi, không cộc lốc; tài liệu không liên quan không được đưa vào trích dẫn."
  actual: "1) ChatMessageBubble hiển thị toàn bộ các chunk từ pack (kể cả tài liệu không được AI trích dẫn). 2) QuickPreviewDrawer hiển thị khung pre chunk ở trên và toàn bộ document ở dưới không có số dòng, highlight bằng regex chuỗi HTML chập chờn lúc được lúc không. 3) Prompt và schema giới hạn citationReasons 1 câu ngắn cộc lốc (max 300 ký tự), thiếu tính chi tiết."
  reproduction: "Kiểm tra UI chat với câu hỏi 'process nào xử lý phân bổ khoản thanh toán thẻ tín dụng' (mẫu sample-2.txt) và mở preview trích dẫn."
---

## Current Focus

- hypothesis: "1) ChatMessageBubble hiển thị tất cả g.citations thay vì chỉ lọc những citationId được trích dẫn trong claims/conclusion/citationReasons. 2) QuickPreviewDrawer chia đôi modal (khung pre chunk ở trên và full doc ở dưới không có số dòng), highlight bằng chuỗi regex thất bại trên các thẻ HTML markdown. 3) Schema GroundedAnswerSchemaV2 và PersistedCitationSchema giới hạn độ dài lý do quá ngắn (300-400 ký tự) và prompt rule 5 chỉ yêu cầu 1 câu ngắn thay vì giải thích chi tiết, đầy đủ căn cứ."
- test: "Chạy vitest cho markdown.test.ts, CitationChipAndQuickPreview.test.tsx, ChatMessageBubble.test.tsx, groundedSynthesis.test.ts, groundedAnswerSchemas.test.ts, groundedTurn.test.ts"
- expecting: "100% test pass (133/133 tests), loại bỏ nguồn không liên quan, QuickPreviewDrawer hiển thị full doc với line numbers từng dòng (1..N) ở lề trái, highlight đoạn trích dẫn và cuộn mượt đến đúng dòng, và citationReasons chi tiết."
- next_action: "Hoàn tất kiểm thử và báo cáo kết quả cho người dùng."

## Evidence

- timestamp: 2026-10-18T11:20:00Z
  observation: "File sample-2.txt cho thấy evidence pack chứa S1, S2, S3, S21, S22, S23, S24, S25, S26, S27, S28 (nhiều tài liệu không liên quan như Issuing application, DB wiring...). AI chỉ trích dẫn S2, S24, S26 nhưng giao diện hiển thị toàn bộ 11 tài liệu trong nguồn trích dẫn. QuickPreviewDrawer render khung pre chunk phía trên, và string regex highlight không khớp được định dạng markdown table/headings/code fences."

## Resolution

- root_cause: "1) ChatMessageBubble.tsx lấy toàn bộ danh sách g.citations để hiển thị ở 'Nguồn tài liệu' mà không lọc theo các citationId thực sự được nhắc đến trong câu trả lời (claims, conclusion, citationReasons). 2) QuickPreviewDrawer.tsx render khung pre chunk phía trên document và cố gắng dùng regex chuỗi trên rendered HTML để chèn thẻ mark, không có cột số dòng ở full document khiến người dùng không biết đang ở dòng nào. 3) GroundedAnswerSchemaV2 và PersistedCitationSchema giới hạn độ dài citationReasons/relevanceReason tối đa 300-400 ký tự; prompt rule 5 yêu cầu '1-sentence explanation' dẫn tới AI trả lời cộc lốc."
- fix: "1) Cập nhật ChatMessageBubble.tsx: trích xuất chính xác các citationId được trích dẫn (từ claims, conclusion, citationReasons), lọc bỏ toàn bộ các citation không liên quan khỏi danh sách 'Nguồn tài liệu' và ánh xạ số thứ tự tuần tự [1], [2]... chuẩn xác. Thêm tooltip hiển thị lý do liên quan khi hover vào tag và chip trích dẫn. 2) Cập nhật QuickPreviewDrawer.tsx: Bỏ khung pre chunk riêng lẻ; tích hợp viewer hiển thị toàn bộ document với cột số dòng (1..N) ở lề trái cho từng dòng; highlight đoạn trích dẫn (.gsd-citation-highlight-line) với nền vàng cam và viền trái đậm; tự động cuộn (scrollIntoView) mượt tới đúng dòng bắt đầu; hỗ trợ nút chuyển đổi giữa chế độ xem kèm số dòng và định dạng Markdown. 3) Cập nhật groundedAnswerSchemas.ts: nâng giới hạn độ dài citationReasons và relevanceReason lên 1000 ký tự. Cập nhật prompt rule 5 trong groundedSynthesis.ts: bắt buộc AI giải thích chi tiết, cụ thể tại sao trích dẫn giải đáp câu hỏi, cấm giải thích cộc lốc, và tuyệt đối không thêm tài liệu không liên quan vào trích dẫn."
- verification: "Toàn bộ 133/133 unit test trong 6 test suite (tests/ai/CitationChipAndQuickPreview.test.tsx, tests/ai/ChatMessageBubble.test.tsx, tests/ai/groundedSynthesis.test.ts, tests/ai/groundedAnswerSchemas.test.ts, tests/ai/groundedTurn.test.ts, tests/utils/markdown.test.ts) và tsc kiểm tra kiểu dữ liệu đều vượt qua."
- files_changed:
  - "src/utils/markdown.ts"
  - "src/components/notes/QuickPreviewDrawer.tsx"
  - "src/components/ai/ChatMessageBubble.tsx"
  - "src/services/ai/groundedAnswerSchemas.ts"
  - "src/services/ai/groundedSynthesis.ts"
  - "src/services/ai/groundedTurn.ts"
  - "tests/utils/markdown.test.ts"
  - "tests/ai/CitationChipAndQuickPreview.test.tsx"
  - "tests/ai/ChatMessageBubble.test.tsx"
