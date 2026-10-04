# Quick Task 261004-ash: App Shortcuts with HUD Autocomplete

## Goal
Implement a comprehensive, cross-platform keyboard shortcut system with multi-key combos and a shortcut HUD / autocomplete popup triggered by holding Alt or pressing Shift+?.

## Requirements
1. Support both macOS (Cmd/Opt) and Windows/Linux (Ctrl/Alt) with correct key badge indicators.
2. Two-key minimum combos to avoid accidental triggering (e.g. no bare 't', 's').
3. Shortcut HUD / Autocomplete overlay:
   - Holding `Alt` (or pressing `Shift + ?` / `Mod + /`) opens the HUD.
   - Shows list of available shortcuts with search/filter, category grouping, and key badges.
   - User can press `ArrowUp` / `ArrowDown` to highlight and `Enter` to execute, or `Escape` to close.
   - Direct shortcut execution continues to work seamlessly without opening HUD if executed quickly.
4. Core shortcuts:
   - Navigation: `Alt + 1..7` (Dashboard, Tasks, Planner, Projects, Notes, Analytics, Settings).
   - Global: `Mod + K` (Palette), `Mod + J` (AI), `Mod + N` (New Task), `Mod + Shift + N` (New Note), `Mod + B` (Toggle Sidebar), `Mod + Shift + S` (GitHub Sync), `Shift + ?` (Shortcut Help/HUD).
   - Tasks View: `Alt + Up` / `Alt + Down` (Select task), `Alt + Enter` (Toggle complete), `Alt + Space` (Start/Pause timer), `Mod + E` (Edit task), `Mod + Backspace` (Delete task with confirm).
   - Note Editor: `Mod + S` (Save note).
5. Targeted tests covering shortcut logic, platform modifiers, HUD navigation, and keyboard handlers.

## Tasks
- [x] Task 1: Keyboard utility & platform detection (`src/utils/keyboard.ts`) and central shortcut definitions (`src/types/shortcuts.ts`).
- [ ] Task 2: Shortcut HUD & Autocomplete Component (`src/components/common/ShortcutHUD.tsx`).
- [ ] Task 3: Global Shortcut Registry hook & integration in `AppShell.tsx`.
- [ ] Task 4: View-specific shortcuts in `TasksView.tsx` and `NoteEditor.tsx`.
- [ ] Task 5: Targeted test suite & verification.
