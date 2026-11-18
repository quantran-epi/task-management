---
phase: quick-261116-imp
plan: 01
type: execute
wave: 1
status: complete
files_modified:
  - src/validation/aiOfficeSchemas.ts
  - src/db/repositories/aiOfficeRepo.ts
  - src/db/repositories/__tests__/aiOfficeImport.test.ts
  - src/components/ai/office/AiStaffImportModal.tsx
  - src/views/AiOfficeView.tsx
  - src/workbench/toolwindows/AiStaffExplorer.tsx
  - .planning/AI-STAFF-SDLC-TEAM.json
  - .planning/AI-STAFF-SDLC-TEAM.md
---

# Nhập nhân viên AI hàng loạt từ JSON

## Mục tiêu

Không phải copy-paste persona và skill body thủ công vào `EmployeeEditorDrawer` nữa.

## Định dạng

Một định dạng duy nhất; single vs batch chỉ là độ dài mảng.

```json
{
  "skills":    [{ "name", "description", "body" }],
  "employees": [{ "name", "role", "capability", "persona", "model"?, "skillName"? }],
  "leads":     [{ "name", "role", "capability", "persona", "model"? }]
}
```

- `skillName` tham chiếu `skill.name` — có sẵn trong DB hoặc cùng file.
- `model` thiếu → lấy model khả dụng đầu tiên từ `fetchAvailableModels`, ghi cảnh báo.
- Trùng tên (case-insensitive) → bỏ qua, không sửa, không xoá.

## Kết quả

- `AiStaffImportSchema` (`src/validation/aiOfficeSchemas.ts`) — validate ở trust boundary.
- `importAiStaff` (`src/db/repositories/aiOfficeRepo.ts`) — một transaction `rw` trên ba store.
- `AiStaffImportModal` — Dragger + preview bảng + Alert lỗi/ kết quả; chỉ ghi khi bấm Nhập.
- Nút "Nhập JSON" ở `AiOfficeView` (PageHeader) và `AiStaffExplorer` (thanh search).
- `.planning/AI-STAFF-SDLC-TEAM.json` — 4 kỹ năng, 4 nhân viên, 1 lead, sinh từ `.md`.

## Kiểm chứng

- `npx vitest run src/db/repositories/__tests__/aiOfficeImport.test.ts` — 5 pass.
- `npx tsc --noEmit` — sạch.
- `npm run build` — pass.
