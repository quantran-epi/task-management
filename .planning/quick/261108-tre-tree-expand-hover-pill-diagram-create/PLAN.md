---
id: 261108-tre
title: JetBrains Instant Tree Expansion, Balanced Expand Icon Hover Pill, and Diagram Explorer Create Button
status: in-progress
created: 2026-11-08
---

# Quick Task: JetBrains Instant Tree Expansion, Balanced Expand Icon Hover Pill, and Diagram Explorer Create Button

## Problem Statement
1. Inconsistency in tree node expansion: antd `<Tree>` explorers (`CRExplorer`, `RemoteGitExplorer`, `SystemsExplorer`) animate expansion with `rc-motion` slide down, whereas custom trees (`DocFolderTree`, `DiagramExplorer`) expand instantly. The user prefers JetBrains IDE style: instant expansion without sliding animation, but with a neat hover pill on expand icons.
2. Expand icon hover background pill is misaligned and distorted: in antd Tree, `.ant-tree-switcher:before` is 24x24px anchored at `top: 0, left: 0`, while `.ant-tree-switcher` is overridden to 20x28px with a 1px margin on the icon. The hover pill overflows, is shifted off-center relative to the chevron icon, and exceeds the text height. In custom trees (`DocFolderTree`, `DiagramExplorer`), the expand caret has no hover background at all.
3. In `DiagramExplorer`, there is no "Tạo" (Create Diagram) button next to the search box (unlike `CRExplorer` which has "Tạo CR" and `SystemsExplorer` which has "Tạo").

## Proposed Solution
1. **Workbench Tokens CSS (`src/styles/workbench-tokens.css`)**:
   - Align `.ant-tree-switcher:before` hover pill: set width/height to 18x18px, centered with `top: 50%; left: 50%; transform: translate(-50%, -50%)`, `border-radius: 4px`.
   - Remove icon `margin-top: 1px`, ensuring icon and hover pill share exact center point.
   - Define `.workbench-tree-expand-btn` for custom trees (`width: 18px; height: 18px; border-radius: 4px;` with hover background matching `--bg-hover`).
   - Disable tree animation via CSS: `.workbench-toolwindow-left .ant-tree-motion { transition: none !important; animation: none !important; }`.
2. **Disable Motion on Antd Trees**:
   - Add `motion={null}` to `<Tree>` in `CRExplorer.tsx`, `RemoteGitExplorer.tsx`, and `SystemsExplorer.tsx`.
3. **Harmonize Expand Carets in Custom Trees**:
   - Apply `workbench-tree-expand-btn` class to carets in `DocFolderTree.tsx` and `DiagramExplorer.tsx`.
4. **Add Create Button in `DiagramExplorer.tsx`**:
   - Update search bar to a flex container with `<Input flex: 1 />` and `<Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => handleCreateDiagram(undefined)}>Tạo</Button>`.
5. **Verification**:
   - Run scoped tests (`Explorers.test.tsx`, `RemoteGitExplorer.test.tsx`) to verify no regressions.
