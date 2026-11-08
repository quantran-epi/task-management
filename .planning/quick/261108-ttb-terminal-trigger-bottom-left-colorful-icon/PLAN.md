---
id: 261108-ttb
title: Move Terminal Trigger to Bottom Left Below Remote SSH Explorer with Colorful Icon
status: in-progress
created: 2026-11-08
---

# Quick Task: Move Terminal Trigger to Bottom Left Below Remote SSH Explorer with Colorful Icon

## Problem Statement
1. The Terminal trigger is currently located in the bottom `StatusBar` (`StatusBar.tsx`). It takes up status bar space and lacks visual alignment with the IntelliJ ExpUI tool window stripe layout.
2. The user requested moving the Terminal trigger from the bottom to the bottom-left tool window stripe, positioned right below the "Remote Git Explorer" (`remote_explorer`).
3. The Terminal icon needs to be colorful and vibrant, matching the modern JetBrains ExpUI icon design system in `JetBrainsIcons.tsx`.

## Proposed Solution
1. **Add `JetBrainsTerminalIcon` in `src/components/icons/JetBrainsIcons.tsx`**:
   - Colorful, vibrant JetBrains ExpUI design with micro-gradients, console frame, colorful window dots (coral/amber/emerald), bright electric cyan prompt `>` and neon green cursor `_`.
2. **Update `Stripe.tsx`**:
   - Support `targetSlot?: ToolWindowSlot` (or `slot?: ToolWindowSlot`) on `ToolWindowItem`.
   - Compute `isActive` based on `targetSlot ?? slot`.
   - On click, toggle `targetSlot ?? slot`.
   - Add `data-testid={`stripe-btn-${item.id}`}` for testability.
3. **Update `WorkbenchLayout.tsx`**:
   - In `DEFAULT_BOTTOM_LEFT_ITEMS`, add `{ id: 'terminal', name: 'Terminal', icon: <JetBrainsTerminalIcon size={16} />, shortcut: 'Alt+F12', slot: 'bottom' }` directly under `remote_explorer`.
4. **Update `StatusBar.tsx`**:
   - Remove the `statusbar-terminal-btn` button from `StatusBar.tsx`.
5. **Update Actions & Keymap (`actionRegistry.ts`, `useGlobalKeymap.ts`)**:
   - Ensure `Alt+F12` triggers `view.toggle-terminal` which toggles `bottom` slot for `'terminal'`.
6. **Update Scoped Tests**:
   - Update `WorkbenchBottomPanel.test.tsx` to assert that clicking the terminal button on the left stripe toggles the bottom terminal panel.
   - Run scoped vitest to ensure all tests pass.
