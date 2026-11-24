# Sketch Manifest

## Design Direction
Refactor màn hình "Bộ tài liệu" của TaskMate theo hướng workbench gọn, mật độ cao: rail trái chọn bộ, vùng phải tập trung tìm/chọn doc. Với bộ chứa rất nhiều docs: ưu tiên search/filter dính đầu, virtual scroll — không render toàn bộ danh sách, không kéo full note body vào row. Dùng lại token màu/control Ant Design 6 và pattern workbench hiện có.

## Reference Points
- Codebase thật: `src/views/ConfigProfilesView.tsx`, `src/styles/tokens.ts`, `src/components/ui/ui-tokens.css`
- Không có app/site ngoài được sếp nêu làm mẫu; 3 variant tự đề xuất.

## Sketches

| # | Name | Design Question | Winner | Tags |
|---|------|----------------|--------|------|
| 001 | config-profiles-layout | Bố cục nào giúp soạn/đọc/đổi cấu hình cho người khác rõ ràng nhất? | C — Rail danh sách + editor | layout, settings, profiles, ant-design |
| 002 | doc-set-workbench-layout | Bố cục nào cho màn hình bộ tài liệu gọn trong workbench mà vẫn đủ thông tin? | A — Rail cố định + inspector | layout, doc-set, workbench, ant-design |
| 003 | doc-set-virtual-list | Danh sách docs lớn nên quét/tìm/chọn thế nào mà không lag? | A — Virtual scroll + filter dính | virtualization, search, list, performance |
| 004 | doc-set-heavy-states | Trạng thái nặng (hash/index/publish/empty/error/picker) nên hiển thị ra sao? | A — Inline progress + action | states, progress, picker, performance |
