# Bộ dữ liệu test luồng SDLC hub

Dùng để chạy tay toàn bộ flow INTAKE → SOLUTION → CODE → CHANGE PACK → PL03B/PL07 → CAB
trong AI chat drawer.

| Tệp | Dùng ở bước | Cách dùng |
| --- | --- | --- |
| `PL01-requirements.md` | 1. Đầu vào | Dán vào ô **PL01** trong modal "Nạp Hồ sơ Đầu vào", hoặc lưu thành Note rồi bấm **Chọn nguồn** |
| `PL02-functional-spec.md` | 1. Đầu vào | Dán vào ô **PL02**, hoặc chọn từ Notes như trên |
| `change-pack-CR-2026-001.zip` | 4. Change Pack | Kéo thả vào dropzone trong panel bước 4 |

## Tham số phải khớp

- **Mã CR = `CR-2026-001`.** `meta.json` trong zip mang đúng CR này. Nếu bạn nhập mã CR khác ở
  modal intake, bước 4 sẽ từ chối với `PACK_IDENTITY_MISMATCH` — đây là hành vi đúng, không
  phải lỗi.
- Tên tính năng (feature name) tuỳ ý, ví dụ `Rút gốc một phần`.

## Drift cố tình cài trong pack

Pack **không** khớp hoàn toàn với PL02, để bước 4 có nội dung cho ma trận drift:

| Loại | Nội dung |
| --- | --- |
| `missing` | PL02 yêu cầu gửi thông báo trong ứng dụng sau khi commit; `diff.patch` không có |
| `outside_solution` | `SYN_SAVING_WITHDRAWAL` thêm cột `RATE_SNAPSHOT` mà PL02 không đặc tả |
| Rủi ro có thật | Route ghi đè `PRINCIPAL_AMOUNT` **trước** khi ghi dòng lịch sử — có comment `NOTE:` trong diff |

Đây là dữ liệu để bạn kiểm tra pipeline có bắt được drift hay không, không phải code mẫu đúng.

## Sinh lại zip

```bash
node test-data/sdlc-flow/generate-change-pack.mjs
```

Script ghi đè `change-pack-CR-2026-001.zip`. Sửa `meta`, `diffPatch`, `newFile`, `sqlFile`
trong file `.mjs` nếu muốn kịch bản khác.

## Ràng buộc của validator (để tự tạo pack khác)

Từ `src/services/wizard/changePack.ts`:

- Bắt buộc có `diff.patch` và `meta.json`.
- Đường dẫn hợp lệ chỉ gồm: `diff.patch`, `meta.json`, `sql/*.sql|plb|pck|pkb`, `new-files/*`.
- Không được có `node_modules/`, `*.min.js`, `package-lock.json`.
- Không được có `/` đầu, `..`, đường dẫn Windows.
- `meta.json` phải qua `ChangePackMetaSchema`: `cr`, `base`, `head`, `branch`, `author`,
  `generatedAt` (ISO datetime), `commits[]` (sha + subject), `files[]` (path + status).
- Tổng nén ≤ 5 MB, giải nén ≤ 25 MB, mỗi entry ≤ 2 MB, ≤ 256 entry.
