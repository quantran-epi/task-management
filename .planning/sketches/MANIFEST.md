# Sketch Manifest

## Design Direction
Làm lại màn hình "Cấu hình cho người khác (Settings for Others)" của TaskMate — hiện bị đánh giá là xấu với bố cục PageHeader + Row/Col 2 cột đơn điệu. Ưu tiên: luồng soạn profile rõ ràng, cảnh báo secrets/path dễ thấy, gọn trong workbench panel hẹp, dùng token màu/control có sẵn của Ant Design 6.

## Reference Points
- Codebase thật: `src/views/ConfigProfilesView.tsx`, `src/styles/tokens.ts`, `src/components/ui/ui-tokens.css`
- Không có app/site ngoài được sếp nêu làm mẫu; 3 variant tự đề xuất.

## Sketches

| # | Name | Design Question | Winner | Tags |
|---|------|----------------|--------|------|
| 001 | config-profiles-layout | Bố cục nào giúp soạn/đọc/đổi cấu hình cho người khác rõ ràng nhất? | C — Rail danh sách + editor | layout, settings, profiles, ant-design |
