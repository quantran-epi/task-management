---
phase: quick
plan: 261108-hga
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/icons/JetBrainsIcons.tsx
  - src/components/icons/__tests__/JetBrainsIcons.test.tsx
  - src/workbench/WorkbenchLayout.tsx
  - src/workbench/toolwindows/LeftToolWindow.tsx
  - src/workbench/TitleBar.tsx
  - src/workbench/EditorArea.tsx
  - src/workbench/__tests__/WorkbenchLayout.test.tsx
  - src/workbench/__tests__/EditorArea.test.tsx
autonomous: true
must_haves:
  truths:
    - "Diagram Explorer and Systems Explorer have visually distinct icons in Left Stripe and LeftToolWindow header (flowchart shapes for Diagrams, 3-tier isometric architecture stack for Systems)"
    - "Remote Git Explorer uses a dedicated JetBrains Git icon with branch fork and remote globe badge in Left Stripe and LeftToolWindow header"
    - "SDLC Studio button in TitleBar renders the dedicated JetBrains continuous lifecycle infinity loop icon instead of plain CodeOutlined"
    - "Editor tabs in EditorArea display colorful contextual icons before tab titles both on the tab bar and in the open tabs dropdown menu across all 15 EditorViewTypes"
  artifacts:
    - path: "src/components/icons/JetBrainsIcons.tsx"
      provides: "JetBrainsSystemsIcon, JetBrainsRemoteGitIcon, JetBrainsSdlcIcon, and updated JetBrainsDiagramIcon"
    - path: "src/workbench/WorkbenchLayout.tsx"
      provides: "Updated DEFAULT_LEFT_ITEMS with JetBrainsSystemsIcon and JetBrainsRemoteGitIcon"
    - path: "src/workbench/toolwindows/LeftToolWindow.tsx"
      provides: "Distinct header icon rendering using JetBrains icons for all left toolwindows"
    - path: "src/workbench/TitleBar.tsx"
      provides: "JetBrainsSdlcIcon on SDLC Studio quick view button"
    - path: "src/workbench/EditorArea.tsx"
      provides: "getEditorTabIcon mapping and visual icon rendering in SortableEditorTabItem and open tabs dropdown"
  key_links:
    - from: "src/workbench/EditorArea.tsx"
      to: "src/components/icons/JetBrainsIcons.tsx"
      via: "getEditorTabIcon icon rendering"
      pattern: "JetBrains.*Icon"
    - from: "src/workbench/WorkbenchLayout.tsx"
      to: "src/components/icons/JetBrainsIcons.tsx"
      via: "DEFAULT_LEFT_ITEMS"
      pattern: "JetBrainsSystemsIcon|JetBrainsRemoteGitIcon"
    - from: "src/workbench/TitleBar.tsx"
      to: "src/components/icons/JetBrainsIcons.tsx"
      via: "TitleBar SDLC button"
      pattern: "JetBrainsSdlcIcon"
---

<objective>
Enhance Workbench visual differentiation with dedicated JetBrains colorful icons:
1. Differentiate Diagram Explorer (flowchart shapes: diamond, process rect, terminal circle) from Systems Explorer (isometric 3-tier architecture stack).
2. Replace unintuitive server cabinet icon for Remote Git Explorer with dedicated JetBrains Git branch fork + commit nodes + remote globe badge icon.
3. Replace monochrome CodeOutlined icon on TitleBar SDLC Studio button with continuous DevOps lifecycle infinity loop icon.
4. Add contextual icons to all Editor Area tabs in both the tab strip and the overflow dropdown menu across all 15 EditorViewTypes.

Purpose: Improve visual scanning speed, focus, and visual hierarchy in the IntelliJ ExpUI workbench layout.
Output: Production-grade colorful JetBrains icons, clean integration across Stripe, LeftToolWindow, TitleBar, and EditorArea, plus verified unit tests.
</objective>

<execution_context>
@CLAUDE.md
@src/components/icons/JetBrainsIcons.tsx
@src/workbench/WorkbenchLayout.tsx
@src/workbench/TitleBar.tsx
@src/workbench/EditorArea.tsx
@src/workbench/toolwindows/LeftToolWindow.tsx
</execution_context>

<context>
@.planning/STATE.md
@src/workbench/store/layoutStore.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Verify & solidify dedicated JetBrains icons with comprehensive unit tests</name>
  <files>src/components/icons/JetBrainsIcons.tsx, src/components/icons/__tests__/JetBrainsIcons.test.tsx</files>
  <behavior>
    - `JetBrainsDiagramIcon` renders flowchart geometry with diamond decision polygon, process rect, and state terminal circle connected by branched flowchart lines.
    - `JetBrainsSystemsIcon` renders 3-tier isometric architecture stack (Application layer, Services layer, Infrastructure/DB layer) with purple, indigo, and sky blue gradients.
    - `JetBrainsRemoteGitIcon` renders Git trunk line, branch fork curve, 3 commit node circles, and remote globe badge in Git orange and sky blue.
    - `JetBrainsSdlcIcon` renders continuous DevOps lifecycle infinity loop stroke with multi-color gradient (cyan -> blue -> violet -> emerald) and milestone dots.
    - All icons accept `size`, `className`, and `style` props, defaulting to `size = 16`, `display: 'inline-block'`, `verticalAlign: 'middle'`.
  </behavior>
  <action>
    1. In `src/components/icons/JetBrainsIcons.tsx`:
       - Ensure `JetBrainsDiagramIcon` uses distinct flowchart shapes: `<polygon points="12,2.5 17.5,7 12,11.5 6.5,7" />`, `<rect x="2.5" y="16.5" width="7" height="5" rx="1.5" />`, `<circle cx="18" cy="19" r="3.2" />` with branching connector lines.
       - Ensure `JetBrainsSystemsIcon` is exported with 3 isometric tier paths: bottom DB tier, middle services tier, top app tier.
       - Ensure `JetBrainsRemoteGitIcon` is exported with trunk line, fork curve, commit dots, and globe grid.
       - Ensure `JetBrainsSdlcIcon` is exported with infinity loop path `M 7.5 7.5 C 4.5 7.5 ...` and milestone dots.
    2. In `src/components/icons/__tests__/JetBrainsIcons.test.tsx`:
       - Verify test coverage asserts specific SVG elements (polygon, rect, circle, path count) for all 4 icons.
  </action>
  <verify>
    <automated>npm test -- src/components/icons/__tests__/JetBrainsIcons.test.tsx</automated>
  </verify>
  <done>
    `JetBrainsDiagramIcon`, `JetBrainsSystemsIcon`, `JetBrainsRemoteGitIcon`, and `JetBrainsSdlcIcon` are exported and all tests in `JetBrainsIcons.test.tsx` pass.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Wire new icons into WorkbenchLayout, LeftToolWindow, and TitleBar</name>
  <files>src/workbench/WorkbenchLayout.tsx, src/workbench/toolwindows/LeftToolWindow.tsx, src/workbench/TitleBar.tsx, src/workbench/__tests__/WorkbenchLayout.test.tsx</files>
  <behavior>
    - `WorkbenchLayout.tsx` Left Stripe displays:
      - Systems Explorer with `JetBrainsSystemsIcon size={16}` (replacing ApartmentOutlined).
      - Remote Git Explorer with `JetBrainsRemoteGitIcon size={16}` (replacing CloudServerOutlined).
      - Diagram Explorer with `JetBrainsDiagramIcon size={16}`.
    - `LeftToolWindow.tsx` header displays matching JetBrains icons for active explorer:
      - `isSystems`: `JetBrainsSystemsIcon size={15}`
      - `isRemoteExplorer`: `JetBrainsRemoteGitIcon size={15}`
      - `isDiagrams`: `JetBrainsDiagramIcon size={15}`
      - `isDocs`: `JetBrainsDocsIcon size={15}`
      - default (CR): `JetBrainsProjectIcon size={15}`
    - `TitleBar.tsx` SDLC Studio quick view button displays `JetBrainsSdlcIcon size={14}` instead of `CodeOutlined`.
  </behavior>
  <action>
    1. In `src/workbench/WorkbenchLayout.tsx`:
       - Import `JetBrainsSystemsIcon` and `JetBrainsRemoteGitIcon` from `../components/icons/JetBrainsIcons`.
       - Update `DEFAULT_LEFT_ITEMS` array: replace `ApartmentOutlined` with `<JetBrainsSystemsIcon size={16} />` for `systems`, and replace `CloudServerOutlined` with `<JetBrainsRemoteGitIcon size={16} />` for `remote_explorer`.
       - Remove unused `@ant-design/icons` imports if any.
    2. In `src/workbench/toolwindows/LeftToolWindow.tsx`:
       - Import `JetBrainsProjectIcon`, `JetBrainsDocsIcon`, `JetBrainsDiagramIcon`, `JetBrainsSystemsIcon`, `JetBrainsRemoteGitIcon` from `../../components/icons/JetBrainsIcons`.
       - Update `icon` selector to use these colorful icons at size 15 for unified visual hierarchy.
       - Clean up unused icon imports.
    3. In `src/workbench/TitleBar.tsx`:
       - Import `JetBrainsSdlcIcon` from `../components/icons/JetBrainsIcons`.
       - Update SDLC Studio button `icon={<JetBrainsSdlcIcon size={14} />}`.
    4. In `src/workbench/__tests__/WorkbenchLayout.test.tsx` & `src/workbench/__tests__/StripeRemoteExplorer.test.tsx`:
       - Verify existing tests pass and add assertion that TitleBar SDLC button renders SVG icon.
  </action>
  <verify>
    <automated>npm test -- src/workbench/__tests__/WorkbenchLayout.test.tsx src/workbench/__tests__/StripeRemoteExplorer.test.tsx</automated>
  </verify>
  <done>
    Left Stripe, LeftToolWindow header, and TitleBar render dedicated JetBrains icons; all scoped tests pass.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Add contextual tab icons to EditorArea tab strip and dropdown menu</name>
  <files>src/workbench/EditorArea.tsx, src/workbench/__tests__/EditorArea.test.tsx</files>
  <behavior>
    - Each editor tab displays an icon matching its `viewType` before `tab.title`:
      - `tasks`: `JetBrainsTasksIcon`
      - `notes`: `JetBrainsDocsIcon`
      - `planner`: `JetBrainsPlannerIcon`
      - `analytics`: `JetBrainsAnalyticsIcon`
      - `settings`: `SettingOutlined` (muted slate)
      - `cr_detail`: `JetBrainsProjectIcon`
      - `dashboard`: `JetBrainsDashboardIcon`
      - `agents`: `JetBrainsAgentsIcon`
      - `telegram`: `JetBrainsTelegramIcon`
      - `insight`: `CompassOutlined` (gold)
      - `sdlc`: `JetBrainsSdlcIcon`
      - `mermaid`: `JetBrainsDiagramIcon`
      - `systems` | `system_detail`: `JetBrainsSystemsIcon`
      - `remote_file`: `FileCodeOutlined` (sky blue)
    - Tab icons appear in `SortableEditorTabItem` before tab title with size 13 and `marginRight: 6`.
    - Open tabs dropdown menu items also display the matching tab icon before tab title for clear identification.
  </behavior>
  <action>
    1. In `src/workbench/EditorArea.tsx`:
       - Import needed JetBrains icons (`JetBrainsTasksIcon`, `JetBrainsDocsIcon`, `JetBrainsPlannerIcon`, `JetBrainsAnalyticsIcon`, `JetBrainsProjectIcon`, `JetBrainsDashboardIcon`, `JetBrainsAgentsIcon`, `JetBrainsTelegramIcon`, `JetBrainsSdlcIcon`, `JetBrainsDiagramIcon`, `JetBrainsSystemsIcon`) from `../components/icons/JetBrainsIcons`.
       - Import `SettingOutlined`, `CompassOutlined`, `FileCodeOutlined` from `@ant-design/icons`.
       - Implement helper function `getEditorTabIcon(viewType: EditorViewType, size = 13): React.ReactNode` covering all 15 `EditorViewType` values.
       - In `SortableEditorTabItem`: wrap icon before `{tab.title}`:
         `<span style={{ display: 'inline-flex', alignItems: 'center', marginRight: 6, flexShrink: 0 }}>{getEditorTabIcon(tab.viewType, 13)}</span>`.
       - In `dropdownMenuItems`: render `<span style={{ display: 'inline-flex', alignItems: 'center', marginRight: 6, flexShrink: 0 }}>{getEditorTabIcon(t.viewType, 13)}</span>` before `{t.title}`.
    2. In `src/workbench/__tests__/EditorArea.test.tsx`:
       - Add test asserting that tab items in `EditorArea` render tab icons alongside tab text.
  </action>
  <verify>
    <automated>npm test -- src/workbench/__tests__/EditorArea.test.tsx</automated>
  </verify>
  <done>
    All editor tabs render colorful icons for their view types in both the tab bar and the dropdown menu; EditorArea tests pass cleanly.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries
| Boundary | Description |
|---|---|
| UI Presentation | SVG rendering and React element display; purely client-side layout |

## STRIDE Threat Register
| Threat ID | Category | Component | Disposition | Mitigation Plan |
|---|---|---|---|---|
| T-QUICK-01 | Tampering | SVG icons | mitigate | Native static React SVG components with sanitized viewBox and inline geometry, no dangerouslySetInnerHTML |
| T-QUICK-02 | Denial of Service | EditorArea tab rendering | mitigate | Fixed-size icons (13-16px) with zero layout shift; flexShrink: 0 prevents truncation overflow |
</threat_model>

<verification>
Run all scoped tests:
`npm test -- src/components/icons/__tests__/JetBrainsIcons.test.tsx src/workbench/__tests__/WorkbenchLayout.test.tsx src/workbench/__tests__/StripeRemoteExplorer.test.tsx src/workbench/__tests__/EditorArea.test.tsx`
</verification>

<success_criteria>
- Diagram Explorer uses flowchart shapes (diamond, rect, circle) and Systems Explorer uses 3-tier isometric architecture stack.
- Remote Git Explorer uses dedicated JetBrains Git branch fork + globe badge icon.
- SDLC Studio button on TitleBar uses dedicated JetBrains continuous DevOps infinity loop icon.
- Editor Area tabs display view-specific icons in both tab headers and tab dropdown menu.
- Scoped vitest tests pass with zero regressions.
</success_criteria>

<output>
Plan file saved to: .planning/quick/261108-hga-cai-thien-icon-workbench/261108-hga-PLAN.md
</output>
