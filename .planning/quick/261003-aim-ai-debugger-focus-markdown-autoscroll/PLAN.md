# Quick Plan: 261003-aim-ai-debugger-focus-markdown-autoscroll

Fix AI Debugger Modal focus blocking AI drawer input, render AI responses as rich Markdown, and auto-scroll to bottom on send and stream.

## User Requirements
1. **Fix AI modal debugger UI bug**: When opening `AIDebugModal`, AI drawer message input box cannot focus.
   - Cause: Ant Design `Modal` renders an overlay mask with focus trap (`trap: true`), locking focus to modal elements and blocking pointer events / interactions outside.
   - Fix: Configure `AIDebugModal` to be modeless and non-blocking:
     - `mask={false}`
     - `focusable={{ trap: false, focusTriggerAfterClose: false }}`
     - Wrapper styles: `styles={{ wrapper: { pointerEvents: 'none' } }}` and dialog content with `pointerEvents: 'auto'`.
     - Allow clicking and typing into `AIChatDrawer`'s `ChatInputBar` while `AIDebugModal` is open.
2. **Enhancement: Render AI response as proper Markdown**:
   - Upgrade `renderSafeMarkdown` (in `src/utils/markdown.ts`) to handle:
     - Fenced code blocks (` ```lang ... ``` `) rendered into `<pre><code class="...">...</code></pre>`.
     - Headings `#` through `######`.
     - Blockquotes (`> `).
     - Unordered lists (`- `, `* `) and ordered lists (`1. `).
     - Task checkboxes (`- [ ]`, `- [x]`).
     - Paragraphs and double-newline separation.
     - Inline formatting: bold (`**`), italic (`*`), code (`` ` ``), links (`[text](url)`).
   - Add `.chat-markdown-body` CSS styling in `src/styles/markdown.css` or scoped styles so code blocks, lists, headings, and tables look clean and readable with Ant Design tokens.
3. **Enhancement: Auto-scroll to bottom on message send & stream**:
   - In `AIChatDrawer.tsx` / `ChatMessageList.tsx`:
     - When user sends a message (`handleSendMessage`), immediately scroll messages container to bottom.
     - Ensure `ChatMessageList` ref scrolls reliably (`scrollTop = scrollHeight`) on user send, message list update, and streaming chunks.
