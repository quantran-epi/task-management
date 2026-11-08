---
id: 261108-ttb
title: Move Terminal Trigger to Bottom Left Below Remote SSH Explorer with Colorful Icon
status: complete
completed: 2026-11-08
---

# Quick Task Summary: Move Terminal Trigger to Bottom Left Below Remote SSH Explorer with Colorful Icon

## Changes Made
1. **Added `JetBrainsTerminalIcon` (`src/components/icons/JetBrainsIcons.tsx`)**:
   - Designed colorful JetBrains ExpUI terminal icon: Midnight indigo console frame (`#1e1b4b` -> `#0f172a`), colorful traffic light header dots (`#f43f5e`, `#fbbf24`, `#22c55e`), bright electric cyan prompt arrow (`#38bdf8` -> `#06b6d4`), and neon lime cursor (`#a3e635` -> `#22c55e`).
2. **Enhanced `Stripe.tsx` (`src/workbench/toolwindows/Stripe.tsx`)**:
   - Added optional `slot?: ToolWindowSlot` override to `ToolWindowItem`.
   - Resolves target slot for each button (`item.slot ?? slot`) and checks its active status from layout store (`leftActiveId`, `rightActiveId`, or `bottomActiveId`).
   - Added `data-testid={`stripe-btn-${item.id}`}` for reliable test targeting.
3. **Moved Terminal Trigger in `WorkbenchLayout.tsx` (`src/workbench/WorkbenchLayout.tsx`)**:
   - Placed `{ id: 'terminal', name: 'Terminal', icon: <JetBrainsTerminalIcon size={16} />, shortcut: 'Alt+F12', slot: 'bottom' }` into `DEFAULT_BOTTOM_LEFT_ITEMS` immediately below `remote_explorer`.
4. **Cleaned up `StatusBar.tsx` (`src/workbench/StatusBar.tsx`)**:
   - Removed the terminal toggle button from the bottom status bar, freeing up status bar width and eliminating visual clutter.
5. **Registered Actions & Keymaps (`actionRegistry.ts`, `useGlobalKeymap.ts`)**:
   - Registered `view.toggle-terminal` (Alt+F12) to toggle bottom terminal window.
   - Wired Alt+F12 in global keyboard event listener.
6. **Updated Tests (`WorkbenchBottomPanel.test.tsx`, `StripeRemoteExplorer.test.tsx`)**:
   - Updated integration tests to verify Stripe terminal trigger click toggles the bottom panel and verified ordering (`CR Explorer` -> `Docs Explorer` -> `Diagram Explorer` -> `Remote Git Explorer` -> `Terminal`).
