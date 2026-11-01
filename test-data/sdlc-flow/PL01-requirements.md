# PL01 — Yêu cầu nghiệp vụ: Rút gốc một phần sổ tiết kiệm (CR-2026-001)

**Đơn vị yêu cầu:** Trung tâm Phát triển Phần mềm
**Ngày lập:** 2026-11-01

## 1. Bối cảnh

Khách hàng cá nhân hiện chỉ có hai lựa chọn trên sổ tiết kiệm trả lãi cuối kỳ: tất toán toàn
bộ hoặc giữ nguyên đến hạn. Nhu cầu thực tế là rút một phần gốc mà không đóng sổ.

## 2. Yêu cầu nghiệp vụ

### R1 — Cho phép rút gốc một phần

Khách hàng được rút một phần số dư gốc, với số tiền rút tối thiểu **1.000.000 VND**. Sau khi
rút, số dư gốc còn lại tối thiểu **500.000 VND**; nếu số dư còn lại thấp hơn mức này thì hệ
thống từ chối và hướng dẫn khách hàng tất toán.

### R2 — Tính lãi lại cho phần gốc bị rút

Phần gốc bị rút được tính lãi theo lãi suất **không kỳ hạn** từ ngày gửi đến ngày rút. Phần
gốc còn lại giữ nguyên lãi suất và ngày đáo hạn của sổ ban đầu.

### R3 — Ghi nhận lịch sử rút gốc

Mỗi lần rút một phần phải sinh một bản ghi lịch sử gồm: mã giao dịch, số tiền rút, lãi phát
sinh, số dư còn lại và thời điểm thực hiện. Lịch sử phải tra cứu được theo sổ và theo khoảng
thời gian.

### R4 — Thông báo cho khách hàng

Sau khi rút gốc thành công, khách hàng nhận thông báo trong ứng dụng kèm số dư gốc mới và
hạn tất toán còn lại.

### R5 — Không đổi trạng thái sổ khi rút một phần

Sổ vẫn ở trạng thái **ACTIVE** và giữ nguyên ngày đáo hạn. Chỉ khi rút toàn bộ mới chuyển
sang **CLOSED**.

## 3. Phạm vi ngoài yêu cầu

- Không xử lý rút gốc qua quầy giao dịch trong phạm vi CR này.
- Không thay đổi lãi suất niêm yết của sản phẩm.
