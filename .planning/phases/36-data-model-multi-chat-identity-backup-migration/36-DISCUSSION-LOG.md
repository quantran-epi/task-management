# Phase 36: Data model, multi-chat identity, backup/migration - Discussion Log

> **Audit trail only.** Không dùng làm input cho research/planning/execution.
> Quyết định chính thức nằm trong `36-CONTEXT.md`; file này giữ phương án đã cân nhắc.

**Date:** 2026-11-10
**Phase:** 36-data-model-multi-chat-identity-backup-migration
**Areas discussed:** Leader dùng lại giữa nhóm; Thay thành viên, giữ lịch sử; Xóa khi đang được dùng; Nội dung backup mới.

## Chọn chủ đề

User chọn cả bốn phần: hồ sơ leader dùng lại, roster/lịch sử, xóa khi có tham chiếu, backup mới. Sau mỗi phần, user chọn chuyển tiếp. Sau tổng kết, user chọn **Tạo context**.

## Leader dùng lại giữa nhóm

| Câu hỏi | Phương án và ý nghĩa | User chọn |
|---|---|---|
| Một leader cho hai nhóm dùng chung hay bản sao? | Chung hồ sơ toàn cục, nhóm riêng lịch sử/budget; hoặc bản sao riêng từng nhóm, cập nhật độc lập | Chung hồ sơ |
| Agent cũng dùng chung như leader? | Chung hồ sơ, phân công/budget riêng; hoặc copy agent riêng từng nhóm | Chung như leader |
| Sửa persona/model trong khi chạy? | Giữ cấu hình đầu lượt, lượt mới đọc hồ sơ mới; hoặc chặn sửa; hoặc dừng lượt đang chạy để áp dụng | “nếu đang chạy thì vẫn giữ, chạy xong rồi thì lượt sau phải load realtimne” |
| Hai nhóm chia sẻ gì? | Chỉ hồ sơ/skill, lịch sử/phân công/token tách hoàn toàn; hoặc chung lịch sử xuyên nhóm (ngoài phạm vi) | Tách hoàn toàn |

**Notes:** Không cần relaunch để lấy hồ sơ mới. Không có cross-chat memory. Cách chia bảng leader không hỏi user vì là chi tiết implementation.

## Thay thành viên, giữ lịch sử

| Câu hỏi | Phương án và ý nghĩa | User chọn |
|---|---|---|
| Gỡ agent khỏi roster có xóa lịch sử? | Giữ tin nhắn/attribution/phân công, không nhận việc mới; hoặc xóa phần lịch sử của agent | Giữ lịch sử |
| Sửa roster khi nhóm đang chạy? | Từ lượt sau, lượt hiện tại giữ roster; hoặc khóa sửa đến khi xong; hoặc gỡ là dừng agent ngay | Từ lượt giao việc sau |
| Thay leader trong nhóm đã có hội thoại? | Đổi trong cùng nhóm, giữ lịch sử; hoặc cố định sau lượt đầu | Free text: “không cho phép thay leader” |
| Thời điểm khóa leader? | Ngay khi gán; hoặc khi bắt đầu chạy lần đầu, trước đó sửa được | Khóa khi bắt đầu chạy |

**Notes:** Leader được chọn/sửa trước lượt đầu, không đổi/gỡ sau khi bắt đầu lượt chạy đầu. Khóa bền qua relaunch và backup.

## Xóa khi đang được dùng

| Câu hỏi | Phương án và ý nghĩa | User chọn |
|---|---|---|
| Xóa leader đang gắn nhóm? | Chặn và liệt kê nhóm; hoặc xác nhận xóa kèm nhóm/hội thoại trong transaction | Chặn khi còn nhóm |
| Xóa agent đang có trong nhóm? | Chặn, user gỡ roster trước; hoặc xác nhận gỡ mọi nhóm và xóa hồ sơ | Chặn khi còn nhóm |
| Xóa skill đang gán? | Chặn, user đổi/gỡ skill trước; hoặc gỡ skill mọi agent và dùng persona thuần | Chặn khi còn được gán |
| Chỉ còn tham chiếu lịch sử? | Cho xóa khi không còn live link/lượt chạy, giữ tên/ID trong lịch sử; hoặc lịch sử cũng chặn, buộc xóa nhóm trước | Cho xóa, giữ lịch sử |

**Notes:** Live use gồm lượt hiện tại vẫn dùng snapshot cũ sau khi đã gỡ roster cho lượt sau. Không cascade tự động. Historical references không cần hồ sơ sống để backup hợp lệ.

## Nội dung backup mới

| Câu hỏi | Phương án và ý nghĩa | User chọn |
|---|---|---|
| Giữ đề xuất skill pending? | Giữ pending cùng bản đã duyệt/lịch sử, restore không approve; hoặc chỉ giữ bản đã duyệt | Cả đề xuất chờ duyệt |
| Restore/relaunch có lượt dang dở? | Đánh dấu gián đoạn, giữ dữ liệu hoàn chỉnh/token đã ghi, không tự gọi AI; hoặc tự chạy lại, phát sinh chi phí/lặp việc | Đánh dấu gián đoạn |
| File hỏng định dạng/live references? | Từ chối toàn bộ trước ghi; hoặc preview rồi nhập phần hợp lệ | Từ chối toàn bộ |
| Đổi tên hồ sơ ảnh hưởng tên tin nhắn cũ? | Giữ tên lúc gửi, tin mới dùng tên mới; hoặc cập nhật tên hiện tại ở mọi tin cũ | Tên lúc gửi |

**Notes:** `targetAgentId` hiện bị Zod strip là bug phải test tái hiện rồi sửa. V18 đã dùng bởi Phase 35, store mới dùng V19. User không được hỏi lại tương thích dữ liệu cũ hoặc disposition SDLC vì C-16/Phase 35 đã khóa.

## Tổng kết và xác nhận

User chọn **Tổng kết**, sau đó **Tạo context**. Tổng kết nêu rõ shared profiles, group isolation, refresh ở lượt sau, khóa leader sau run đầu, delete refusal, historical attribution, pending skill backup, interrupted restore và reject-before-write.

Sau khi tạo context, user yêu cầu: **“tạo xong context thì push remote, cứ làm ko cần hỏi”**. Đây là ủy quyền commit/push planning artifacts của cuộc thảo luận này, không sửa/push các thay đổi chưa liên quan đang có sẵn.

## Implementation discretion

- Chia bảng leader: chưa khóa, research chọn trong ràng buộc domain entity riêng.
- Số version envelope: chưa khóa, research quyết định theo schema mới; không giữ v11 vì compatibility.
- Field/index tối thiểu, cách lưu leader lock, table parity và cách nối roster UI để planner quyết định.
- Không có lựa chọn “you decide” trực tiếp nào được user chọn; các mục trên là chi tiết kỹ thuật không hỏi user.

## Deferred Ideas

Không có capability mới user yêu cầu. Các ranh giới đã nhắc:
- Runtime scheduler/abort/teardown: Phase 37.
- Token khi roster đổi, threshold/accounting: Phase 38.
- Một/nhiều skill, skill version restore và approval UX: Phase 39.
- Explorer và trình bày transcript: Phase 40.

C-16 thay thế các tiêu chí cũ về pre-v1.4 backup compatibility và giữ SDLC rows. Không tự mở rộng team thành container nhiều chat con.
