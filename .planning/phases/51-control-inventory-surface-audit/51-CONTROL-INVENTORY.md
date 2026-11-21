---
artifact: 51-CONTROL-INVENTORY
phase: 51-control-inventory-surface-audit
created: 2026-11-21
scope: INV-01, INV-02, INV-03
source: tests/helpers/antdInventory.ts
status: đang biên soạn — 51-01 viết §0-§2; 51-02 viết §3; 51-03 viết §4-§5
---

# Phase 51: Control Inventory & Surface Audit — Tồn kho control và UI surface

## 0. Cách đọc tồn kho

Artifact này là **nguồn truth duy nhất** cho danh mục control/UI surface của TaskMate trước khi thay bất kỳ dòng source nào (mục tiêu Phase 51, `.planning/ROADMAP.md:39-53`). Phạm vi: INV-01 (liệt kê control/import kèm props/state/event/keyboard-focus/validation/a11y), INV-02 (mọi UI surface), INV-03 (nhóm implementation, độ phức tạp, wrapper cần thay, behavior phải giữ).

Quy ước đọc:

- Đây là artifact **documentation-only**: không đổi source dưới `src/`, không cài dependency, không chạy full Vitest. Lệnh scoped duy nhất được dùng là `npx vitest run src/components/ui/__tests__/antdInventory.test.ts src/components/ui/__tests__/coverage.test.ts --bail=1` (xem `package.json` script `test:foundation`).
- Baseline thiết kế đã được duyệt là `/private/tmp/claude-503/-Users-tranducquan-Working-Personal-task-management/32c7be2b-546e-433a-aa53-76345c15954c/scratchpad/oi-prototype/PROOF.md` — **đường dẫn tuyệt đối, nằm ngoài repo**. `.planning/ROADMAP.md:52` ghi nhầm `scratchpad/oi-prototype/PROOF.md` (tương đối); phải dùng đường dẫn tuyệt đối ở đây.
- Mọi con số trong các phần sau phải trỏ lại bảng §1. Khi source đổi, chạy lại lệnh tái tạo rồi cập nhật artifact — không giữ số nhớ được từ `51-PATTERNS.md`.
- `scanConsumedAntd()` chỉ bắt `import { ... } from 'antd'` và `@ant-design/icons`; helper bỏ `import type` và **không thấy** static API (`message.*`, `notification.*`, `Modal.confirm`). Các dạng đó được liệt kê riêng ở §1 (đối chiếu lệch) và §3 (import tồn dư).
- Ba nhóm file không trộn vào nhau: wrapper `.tsx` (đếm), hạ tầng (`antdTheme.ts`, `index.ts`, `tokens.contract.ts`, `ui-tokens.css` — không đếm), `__tests__` (bằng chứng — không đếm).

## 1. Đối chiếu số liệu

Bốn con số bị lẫn trong `51-PATTERNS.md` được định nghĩa lại bằng lệnh chạy live tại repo root `/Users/tranducquan/Working/Personal/task-management`, ngày 2026-11-21:

| Định nghĩa | Số | Lệnh tái tạo | Ghi chú |
|---|---:|---|---|
| Số file wrapper `.tsx` trong `src/components/ui/` (không tính `__tests__`) | 56 | `find src/components/ui -maxdepth 1 -name '*.tsx' \| wc -l` | "Wrapper" theo nghĩa **file** — dùng cho cột wrapper cần thay (tiêu chí #5). |
| Số tên export首字母大写 do `scanWrappers()` thu được | 257 | `npx tsx -e "import{scanWrappers}from './tests/helpers/antdInventory';console.log(scanWrappers('src/components/ui').size)"` | **Con số guard dùng** cho tiêu chí #5: gồm icon, static subcomponent, hook, helper — không phải số file. Liệt kê từng tên ở §2.1. |
| components / icons / utilities tiêu thụ qua named import | **52/141/3** | `npx tsx -e "import{scanConsumedAntd}from './tests/helpers/antdInventory';const c=scanConsumedAntd('src');console.log(c.components.length+'/'+c.icons.length+'/'+c.utilities.length)"` | PATTERNS ghi 51/141/3; source đổi sau khi map nên live là 52 component. Lệnh là truth. |
| File test nền tảng (bằng chứng cơ chế quét) | 10 | `find src/components/ui/__tests__ -type f \| wc -l` | Bằng chứng, **không phải control**, không vào tồn kho wrapper. |

Lệnh tái tạo đầy đủ một lần (production lẫn missing guard):

```bash
npx tsx -e "import{scanConsumedAntd,scanWrappers,findMissingWrappers}from './tests/helpers/antdInventory';const w=scanWrappers('src/components/ui');const c=scanConsumedAntd('src');console.log('wrappers',w.size);console.log(JSON.stringify(c));console.log('missing',findMissingWrappers(c,w));"
# wrappers 257 ; missing []
```

### Lệch đã đối chiếu với `51-PATTERNS.md`

| PATTERNS ghi | Live | Lệnh tái tạo | Giải thích |
|---|---|---|---|
| 51 component | 52 | `npx tsx -e "import{scanConsumedAntd}from './tests/helpers/antdInventory';console.log(scanConsumedAntd('src').components.length)"` | Source đổi sau khi map; con số live là 52. |
| 28 file `import type { ... } from 'antd'` | 31 dòng / 31 file | `grep -rn "import type .* from 'antd'" src --include='*.ts' --include='*.tsx'` | Helper bỏ type-only import (`antdInventory.ts:37`) nên phải đếm riêng. Danh sách đầy đủ ở §3. |
| 10 icon deep-import | 8 dòng | `grep -rn "@ant-design/icons/" src --include='*.tsx' \| wc -l` | PATTERNS tự liệt kê 8 tên nhưng ghi nhầm số 10; dùng 8. |
| 4 file static call ngoài `ui/` | **0 call unbound**, 86 file có cú pháp `message.*`/`notification.*` | `grep -rlE '\b(message\|notification)\.(success\|error\|warning\|warn\|info\|loading\|open\|destroy)\(\|\bModal\.confirm\(' --include='*.ts' --include='*.tsx' src \| grep -v '/ui/' \| wc -l` và `npx vitest run src/components/ui/__tests__/staticApiGuard.test.ts --bail=1` | AntD static đã biến mất khỏi source; 86 file còn dùng cú pháp đó nhưng **mọi receiver đều bind qua `useMessage`/`useNotification`/`useTaskMateModal`** theo context (`ThemeAppHolder`), guard xanh. Danh sách 4 file trong PATTERNS chỉ là ghi chú lịch sử, **không** trình bày như số liệu hiện tại. |

> Mọi số liệu trong §2-§5 (khi các phần đó được viết) phải khớp bảng trên; nếu lệnh tái tạo trả khác đi, cập nhật bảng trước, cập nhật phần sau sau.

## 2. Tồn kho wrapper

56 file `.tsx` là wrapper và được liệt kê từng dòng ở §2.1. Bốn file `antdTheme.ts`, `index.ts`, `tokens.contract.ts`, `ui-tokens.css` là hạ tầng; 10 file trong `src/components/ui/__tests__/` là bằng chứng — cả hai nhóm không có marker `WRAPPER-ROW` và không trộn vào số 56.

Định dạng mỗi dòng: `<!-- WRAPPER-ROW --> | <file> | export | props/extends | state | event | keyboard/focus | validation | accessible name | behavior phải giữ |`. Mỗi wrapper ghi đúng một dòng; icon chỉ một dòng cho `icon.tsx` và 141 export `wrapIcon` nằm ở danh sách export bên dưới; `form.tsx` liệt kê static subcomponent trong cột export.

## 3. Import tồn dư và UI surface

*(Do 51-02 viết tiếp.)*

## 4. Phân loại implementation

*(Do 51-03 viết tiếp.)*

## 5. Đối chiếu cuối và bàn giao Phase 52

*(Do 51-03 viết tiếp.)*
