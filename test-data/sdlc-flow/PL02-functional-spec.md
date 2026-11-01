# PL02 — Đặc tả chức năng: Rút gốc một phần sổ tiết kiệm (CR-2026-001)

## 1. Màn hình

### S1 — Chi tiết sổ tiết kiệm

Bổ sung nút **"Rút gốc một phần"** chỉ hiển thị khi sổ đang ở trạng thái `ACTIVE` và số dư
gốc lớn hơn `MIN_REMAINING + MIN_WITHDRAW`.

| Trường hiển thị | Nguồn dữ liệu |
| --- | --- |
| Số dư gốc hiện tại | `SYN_SAVING_ACCOUNT.PRINCIPAL_AMOUNT` |
| Số tiền rút tối thiểu | hằng số `MIN_WITHDRAW = 1.000.000` |
| Lãi suất không kỳ hạn | `SYN_RATE.NON_TERM_RATE` |

### S2 — Form rút gốc một phần

Nhập số tiền rút. Validate phía client rồi server:

1. `amount >= MIN_WITHDRAW`
2. `PRINCIPAL_AMOUNT - amount >= MIN_REMAINING` (`MIN_REMAINING = 500.000`)
3. `amount <= PRINCIPAL_AMOUNT`

Lỗi hiển thị inline dưới ô nhập, không dùng toast.

### S3 — Xác nhận và kết quả

Hiển thị số tiền rút, lãi không kỳ hạn phát sinh, số dư gốc còn lại, ngày đáo hạn giữ nguyên.
Sau khi xác nhận, quay về S1 với số dư mới.

## 2. API

### `POST /api/savings/{accountId}/partial-withdrawal`

```json
{ "amount": 2000000, "requestedAt": "2026-11-01T09:00:00Z" }
```

Trả về `201`:

```json
{
  "transactionId": "TXN-20261101-0001",
  "withdrawnAmount": 2000000,
  "nonTermInterest": 1234.56,
  "remainingPrincipal": 8000000,
  "maturityDate": "2027-05-01"
}
```

Mã lỗi: `400 AMOUNT_BELOW_MINIMUM`, `400 REMAINING_BELOW_MINIMUM`, `409 ACCOUNT_NOT_ACTIVE`.

## 3. Bảng dữ liệu

### `SYN_SAVING_WITHDRAWAL` (bảng mới)

| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| `WITHDRAWAL_ID` | `VARCHAR2(32)` | PK |
| `ACCOUNT_ID` | `VARCHAR2(32)` | FK → `SYN_SAVING_ACCOUNT` |
| `WITHDRAWN_AMOUNT` | `NUMBER(18,2)` | |
| `NON_TERM_INTEREST` | `NUMBER(18,2)` | |
| `REMAINING_PRINCIPAL` | `NUMBER(18,2)` | |
| `WITHDRAWN_AT` | `TIMESTAMP` | |

### `SYN_SAVING_ACCOUNT` (bảng có sẵn, thêm cột)

| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| `PRINCIPAL_AMOUNT` | `NUMBER(18,2)` | đã có, bị trừ khi rút một phần |
| `STATUS` | `VARCHAR2(16)` | đã có, **không đổi** khi rút một phần |

## 4. Quy tắc nghiệp vụ đã chốt

- Lãi phát sinh của phần rút: `amount * NON_TERM_RATE * daysHeld / 365`, làm tròn 2 chữ số.
- Sổ giữ nguyên `MATURITY_DATE` và `INTEREST_RATE`.
- Lịch sử rút tra cứu theo `ACCOUNT_ID` và khoảng `WITHDRAWN_AT`.
- Thông báo trong ứng dụng gửi sau khi transaction commit.

## 5. Kiểm thử chấp nhận

| # | Kịch bản | Kỳ vọng |
| --- | --- | --- |
| A1 | Rút 2.000.000 từ sổ 10.000.000 | Thành công, còn 8.000.000 |
| A2 | Rút 400.000 | `400 AMOUNT_BELOW_MINIMUM` |
| A3 | Rút 9.700.000 từ sổ 10.000.000 | `400 REMAINING_BELOW_MINIMUM` |
| A4 | Rút từ sổ `CLOSED` | `409 ACCOUNT_NOT_ACTIVE` |
| A5 | Tra lịch sử sau 2 lần rút | Đúng 2 bản ghi, mới nhất trước |
