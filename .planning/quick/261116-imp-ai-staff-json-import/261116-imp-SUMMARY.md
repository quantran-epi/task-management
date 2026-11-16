---
phase: quick-261116-imp
plan: 01
status: complete
---

# SUMMARY — Nhập nhân viên AI hàng loạt từ JSON

## Đã làm

| File | Thay đổi |
|---|---|
| `src/validation/aiOfficeSchemas.ts` | `AiStaffImportSchema`, `AiStaffImportInput` — ba mảng `.default([])`, `skillName` thay cho `skillId` |
| `src/db/repositories/aiOfficeRepo.ts` | `importAiStaff(payload, db, fallbackModel?)` một transaction `rw`; trả `{ created, skipped, warnings }` |
| `src/components/ai/office/AiStaffImportModal.tsx` | Dragger `.json`, zod validate khi chọn tệp, bảng preview, Alert lỗi/kết quả |
| `src/views/AiOfficeView.tsx` | Nút "Nhập JSON" cạnh nút tạo |
| `src/workbench/toolwindows/AiStaffExplorer.tsx` | Icon nhập trong thanh search |
| `.planning/AI-STAFF-SDLC-TEAM.json` | Đội SDLC: 4 kỹ năng + 4 nhân viên + Modric |
| `src/db/repositories/__tests__/aiOfficeImport.test.ts` | 5 test, gồm test nhập trọn file JSON |

## Quyết định

- **Trùng tên → bỏ qua, không cập nhật.** Import là đường thêm; sửa row đang được nhóm dùng sẽ đổi hành vi của mọi nhóm mà không ai bấm lưu.
- **`skillName` chứ không `skillId`.** UUID không viết tay được và không mang sang máy khác.
- **Một transaction.** Row lỗi ở cuối file không để lại nửa đội.
- **Model thiếu → fallback + cảnh báo**, không ghi model rỗng (mọi prompt path sẽ gửi chuỗi rỗng lên provider).
- **So khớp tên không phân biệt hoa thường.** Roster hiển thị tên, hai row "Evra"/"evra" không phân biệt được.

## Kiểm chứng

- `npx vitest run src/db/repositories/__tests__/aiOfficeImport.test.ts` → 5 passed.
- `npx tsc --noEmit` → sạch.
- `npm run build` → pass.

## Ghi chú

`.planning/AI-STAFF-SDLC-TEAM.md` sửa 2 chữ trong skill description của Rooney (310 → 302 ký tự) để vừa cap 300 của `skillDescriptionSchema`.
