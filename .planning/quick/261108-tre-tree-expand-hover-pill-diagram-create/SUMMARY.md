---
id: 261108-tre
title: JetBrains Instant Tree Expansion, Balanced Expand Icon Hover Pill, and Diagram Explorer Create Button
status: complete
completed: 2026-11-08
---

# Summary: JetBrains Instant Tree Expansion, Balanced Expand Icon Hover Pill, and Diagram Explorer Create Button

## Results
- **Instant Tree Expansion**:
  - Root cause: Antd source code uses `const motion = customMotion ?? { ...initCollapseMotion }`. In JavaScript, `null ?? fallback` evaluates to fallback! So `motion={null}` was ignored.
  - Fix: Passed `motion={false as any}` (`false ?? fallback` evaluates to `false`). In `@rc-component/tree`, when `motion` is falsy, `mergedData` is raw `data` (skipping `MotionFlattenData` and `CSSMotion`).
  - Added CSS rule targeting `.ant-motion-collapse`, `.ant-motion-collapse-active`, and `.ant-tree-switcher-icon svg` with `transition: none !important; animation: none !important` to guarantee zero-millisecond instant toggle.
- **Balanced Expand Icon Hover Pill**:
  - Re-centered Ant Design switcher `:before` hover pill with `width: 18px; height: 18px; top: 50%; left: 50%; transform: translate(-50%, -50%); border-radius: 4px`. Removed `margin-top: 1px` from switcher icon so icon and hover pill are perfectly centered together. Hover pill does not exceed line text height.
  - Added `.workbench-tree-expand-btn` for custom trees (`DocFolderTree.tsx` and `DiagramExplorer.tsx`) with matching 18x18px dimensions, 4px border radius, and `--bg-hover` hover background.
- **Diagram Explorer Create Button**:
  - Added "Tạo" button (`<Button type="primary" size="small" icon={<PlusOutlined />} />`) right next to the search input in `DiagramExplorer.tsx`, matching `CRExplorer` layout.
- **Tests**:
  - Added test case in `src/workbench/__tests__/Explorers.test.tsx` for `DiagramExplorer` search bar and "Tạo" button click. All 3 tests passed.
