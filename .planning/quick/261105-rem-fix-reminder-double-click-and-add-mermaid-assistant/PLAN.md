# Quick Plan: Fix Reminder 2-Click Done & Mermaid Diagram AI Assistant

## Context
1. Bug: In Notifications drawer (tab Reminders), clicking "Đã xong" on a reminder takes 2 clicks to dismiss because `completeReminderAlert` removes the reminder from `reminders` array, but leaves `reminderDate` on the entity, causing Dexie's live query to immediately trigger the legacy `reminderDate` alert.
2. Requirement: Mermaid Diagram AI Assistant page (`#mermaid` / `#diagram`) allowing users to paste mermaid syntax, render diagrams with live preview, zoom/pan/download, and use AI to fix syntax errors.
3. Requirement: In Markdown viewers across the app, allow selecting mermaid diagram code (or clicking a button on mermaid code blocks) to view as interactive rendered diagrams.

## Tasks
1. **Task 1: Fix Reminder 2-Click Bug in `src/db/repositories/notificationRepo.ts`**
   - In `completeReminderAlert`: when updating `reminders`, if `updatedReminders.length === 0`, clear `reminderDate: undefined` and `reminderNote: undefined`. If not empty, sync `reminderDate: updatedReminders[0].date` and `reminderNote: updatedReminders[0].note`.
   - Update `tasks`, `projects`, and `milestones`.
   - Write unit tests in `tests/unit/db/notificationRepo.test.ts` (or focused vitest) verifying single-click done behavior.

2. **Task 2: AI Syntax Fixer Service for Mermaid**
   - Create helper/service `src/services/ai/mermaidFixerService.ts` that takes invalid mermaid code + error message, calls the configured AI model via `NineRouterClient`, and returns clean, valid mermaid code.

3. **Task 3: Mermaid Diagram Assistant Page (`src/views/MermaidAssistantView.tsx`)**
   - Code editor on the left with templates dropdown (Flowchart, Sequence, Architecture, Class, Mindmap, Gantt, ERD).
   - Live diagram canvas on the right using `MermaidViewer` or enhanced renderer with zoom, pan, export SVG/PNG, copy code.
   - When syntax error occurs: display error alert with "Sửa lỗi bằng AI" (AI Fix) button.
   - Add route `#mermaid` in `src/hooks/useHashRoute.ts`, `src/components/shell/Navigation.tsx`, and `src/App.tsx`.

4. **Task 4: Diagram Viewer Integration in Markdown Viewers**
   - Add selection detector component/hook (`useDiagramSelection` or `MarkdownDiagramModal`) allowing highlighted mermaid code to be viewed in a diagram modal.
   - Enhance `renderSafeMarkdown` code fence header to show a "Xem Diagram" action button on ```` ```mermaid ```` code blocks.
   - On parse error in `MermaidViewer`, provide "Sửa bằng AI" and "Mở trong Mermaid Studio" buttons.

5. **Task 5: Verification & Tests**
   - Run focused vitest tests for notifications repository and mermaid parsing.
   - Typecheck with `npx tsc --noEmit`.
