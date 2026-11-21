# Phase 52 — Design Contract Review & Handoff

> Review bổ sung cho `52-UI-SPEC.md` đã được gsd-ui-checker duyệt 6/6 ngày 2026-11-22. File này là bản đồ đối chiếu + bàn giao, **không** thay thế hay viết lại contract. Phase 52 documentation-only: không source change, không dependency mới, không full Vitest.

## 1. Tiêu chí ROADMAP ↔ vị trí trong contract

| # | Tiêu chí ROADMAP Phase 52 | Vị trí nguồn truth | Lệnh / cách kiểm tra |
|---|---|---|---|
| 1 | Mỗi control có analog OpenIDEA: token, metric, DOM/class, CSS module gốc, trạng thái, behavior, nguồn | `52-UI-SPEC.md` §1 + §1.1 (22 wrapper analog, 13 spec `S-*`) | `grep -c '^| [0-9]* | ' 52-UI-SPEC.md` → 56 dòng mapping; đối chiếu nguồn §0 (PROOF.md + 28 CSS module) |
| 2 | Control thiết kế mới theo ngôn ngữ OpenIDEA, light + dark | §2 (`N-01..N-34`), §5, §8 | `grep -c '^| N-[0-9]' §2` → 34; gate font 13 / height 28 (small 24) / radius 4 / focus ring 2px / popup offset 4 / row 24 / dialog radius 10; accent `#3871e1` cả hai mode |
| 3 | Bảng trước/sau khẳng định API, event, controlled, validation, keyboard/focus, accessible name đổi | §7.1, §7.2, §9 | `grep -c '^| [0-9]* | ' §7.2` → 56 dòng, tất cả `identical`; measurement hook `data-oi-control`/`data-state` là ngoại lệ gán nhãn, không phải prop |
| 4 | Baseline metric cho Phase 57 | §10 | 25 dòng baseline padding/margin/height/radius/font/border/shadow/alignment/overflow + rule đo margin/alignment/overflow bổ sung |
| 5 | Contract lưu đúng path và được review trước Phase 53 | `52-UI-SPEC.md` checker sign-off 6/6 (§ cuối) + file review này | `status: approved`, `APPROVED 6/6` gsd-ui-checker 2026-11-22; plan 52-01 evidence 3 file (`56 56 34 34`) + focused gate 3 file / 12 test xanh |

## 2. MAP coverage

| Requirement | Phạm vi đã khóa | Bằng chứng trong contract |
|---|---|---|
| MAP-01 | 22 wrapper có analog OpenIDEA, 13 spec `S-*` | Nguồn `PROOF.md` (đường dẫn tuyệt đối, đã duyệt) + 28 file `*.module.css` vendored; DOM/class bám source, không thêm/bớt wrapper |
| MAP-02 | 34 wrapper thiết kế mới, `N-01..N-34` | Metric lấy từ token OpenIDEA; không phát sinh metric mới ngoài hệ font 13/12/11, height 28/24, radius 4, focus ring 2px, popup offset 4, row 24, dialog radius 10; light + dark |
| MAP-03 | API wrapper giữ nguyên byte-for-byte | §7.2: 56 dòng `identical`; 257 export guard trong inventory vẫn là trục riêng, không gộp vào 56 file; measurement hook là ngoại lệ duy nhất, không đổi props/event/static/accessible name |

## 3. Bàn giao implementation

| Nhóm (inventory §4.2) | Số wrapper | Phase tiêu thụ | Requirement | Spec tiêu thụ |
|---|---|---|---|---|
| core/form | 26 | Phase 53 | NAT-01 | §1/§1.1 + §2 + §7.2 + §8 (token/metric/DOM/class/API) |
| overlay/complex | 28 | Phase 54 | NAT-02 | §1/§1.1 + §2 + §5 + §7.2 + popup/focus rule |
| domain/adoption + full surface | 2 wrapper + 441 surface | Phase 55 | NAT-03, NAT-04 | §8 (theme token, shell/control tách biệt) + §9 (copy/keyboard/a11y) |

Năm quy tắc không được vi phạm khi implement ở Phase 53/54/55:

1. Caller không sửa — props/API/event/static subcomponent/hook/generic/validation/default/accessible name giữ **byte-for-byte** theo §7.2; 257 export guard không đổi.
2. Height control 28px, `.small` 24px — không giữ height 30 của AntD; metric còn lại theo §1.1/§5.
3. Accent `#3871e1` ở cả light và dark; shell palette hiện tại giữ nguyên; status map D-12 (`--ui-spin-accent` cho Spinner) không đổi.
4. Popup dùng `createPortal` tới `BODY`, offset 4px, flip/shift tự tính. **Không cài `@floating-ui/react-dom`** hay UI runtime library nào khác; AntD bị gỡ ở Phase 56.
5. Copy tiếng Việt giữ **byte-for-byte** (VD `Xác nhận`/`Hủy`); notification/message realtime phải tự cập nhật, không reload (memory rule).

Khi implement ở 53/54: vendored 28 `*.module.css` + `LICENSE-OPENIDEA` / `NOTICE-OPENIDEA` (Apache-2.0), copy nguyên vẹn, không sửa selector/metric nguồn. Phase 57 đo baseline §10; Phase 56 mới gỡ `antd` khỏi dependency.

## Sign-off

Design contract APPROVED 6/6 bởi gsd-ui-checker 2026-11-22; review bổ sung bởi plan 52-02; phase 52 documentation-only — không source change, không dependency, không full Vitest. Sẵn sàng bàn giao Phase 53.
