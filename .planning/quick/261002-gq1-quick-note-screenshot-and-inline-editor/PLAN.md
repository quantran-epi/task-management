# Quick Task: Quick Note Screenshot Fix and Inline Markdown Editor

**User goal:**
1. Screenshot for note not work as expected, cannot screenshot.
2. In note screen (NotesView) and popout note window (NotesPopoutView), have quick note feature.
3. Screenshot button to quickly take screenshot and create note directly from it.
4. Create note with only a simple text box markdown, don't open modal for quick note.

## Analysis & Plan

### 1. Fix `src/utils/screenshotCapture.ts`
- Fix event listeners: `video.playsInline = true; video.autoplay = true; video.muted = true;`
- Attach `loadedmetadata` and `loadeddata` listeners before assigning `video.srcObject = stream;`
- Immediate resolve if `video.readyState >= HTMLMediaElement.HAVE_METADATA`
- Timeout rejection (10s) with proper cleanup to prevent hanging
- If `getDisplayMedia` is unavailable (e.g. custom scheme or permission denied in WebView2), fallback to clipboard image if available (`navigator.clipboard?.read`)
- Clean error message guiding user on how to use clipboard / Win+Shift+S if desktop display capture is not granted

### 2. Upgrade `src/components/notes/QuickNoteEntry.tsx`
- Simple markdown textarea with auto-size
- Screenshot button: "Chụp ảnh tạo ghi chú" / "Chụp màn hình". When clicked:
  - Takes screenshot
  - IMMEDIATELY creates note with screenshot attachment (no modal, no requirement to type text first)
  - If text is already typed in textarea, uses it as note body; otherwise uses default timestamp body/title
- Markdown text submit:
  - Enter (or Ctrl+Enter) or "Lưu" button immediately creates note into Dexie DB
  - Clear textarea and reset
  - No modal opened!
- Clipboard paste handler (`onPaste`):
  - If user presses Ctrl+V with an image in clipboard, immediately attaches image or creates note with it!

### 3. Integrate into `src/views/NotesView.tsx` & `src/views/NotesPopoutView.tsx`
- Ensure `QuickNoteEntry` is prominent at the top of both views.
- Provide a clean markdown textbox UI with instant "Lưu ghi chú" and "Chụp màn hình" buttons.
- Keep modal editor only for editing existing notes or full multi-field editing if explicitly clicked, but quick note requires NO modal.

### 4. Tests
- Targeted test run only: `tests/utils/screenshotCapture.test.ts` and `tests/components/notes/QuickNoteEntry.test.tsx`.
