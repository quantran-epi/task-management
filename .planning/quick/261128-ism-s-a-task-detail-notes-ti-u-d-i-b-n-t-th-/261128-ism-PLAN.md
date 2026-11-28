---
phase: 261128-ism
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/views/ItemInsightView.tsx
  - tests/views/ItemInsightView.test.tsx
autonomous: false
requirements: []
user_setup: []
must_haves:
  truths:
    - "Trên task detail page, mọi note title — kể cả title dài tối đa 120 ký tự — hiển thị đủ (wrap, không bị cắt) trong card 'Ghi chú liên quan'"
    - "Nút 'Thêm ghi chú' không che/đè lên title card hay note title; luôn click được ở 1280/768/375"
    - "Header card Notes và row title note có chỗ co giãn đúng chuẩn TaskMate: min-width:0 + overflow-wrap:anywhere cho title, flexShrink:0 cho action, flex-wrap cho header"
    - "Light + dark đều readable, không đổi token/color, không overlap ở mọi breakpoint"
    - "Zero đụng TaskDrawer, CR detail, EntityNotesSection dùng chung, splash/tasklist, AI chat, System/schema files, STATE.md; zero dependency mới"
  artifacts:
    - path: src/views/ItemInsightView.tsx
      provides: "Task-detail Notes card (khoảng line 814-830) có head wrap + title min-width:0/overflow-wrap:anywhere; note title trong ListItem.Meta wrap đủ; actions không co lấn title"
    - path: tests/views/ItemInsightView.test.tsx
      provides: "Test regression: tạo note title dài 120 ký tự gắn task, assert full title trong DOM và style contract (min-width:0, overflow-wrap:anywhere, head flex-wrap:wrap), nút 'Thêm ghi chú' còn enable"
  key_links:
    - from: "src/views/ItemInsightView.tsx (task branch — Command Deck right column)"
      to: "Card 'Ghi chú liên quan' title + extra Button 'Thêm ghi chú'"
      via: "styles.head / styles.title trên Card + inline style trên span title"
      pattern: "Ghi chú liên quan"
    - from: "src/views/ItemInsightView.tsx#relatedNotes"
      to: "ListItem.Meta title render cho từng note"
      via: "span wrap thay cho string title, có data-testid để test truy vấn"
      pattern: "insight-note-title"
---

<objective>
Sửa task detail page (`ItemInsightView` với `itemType="task"`): section Notes có tiêu đề dài bị nút "Thêm ghi chú" che. Cho header và note title chỗ co giãn đúng chuẩn TaskMate (`min-width:0` + `overflow-wrap:anywhere`, action `flexShrink:0`, head `flex-wrap:wrap`) để title đọc được trọn và nút không đè lên.

Purpose: Lỗi nằm ở owner của layout — card Notes nằm trong cột phải hẹp (`minmax(280px, 1fr)`) của Command Deck nhưng head/title không có guard co giãn, nên flex item bị ép và title bị button phủ. Sửa tại chỗ render của task detail page, không vá bằng CSS override ngoài phạm vi và không đụng các session song song.

Output: `ItemInsightView.tsx` layout Notes đúng; test regression với note title 120 ký tự; Chrome light/dark verify tại 1280/768/375.

**Ruled out (tuyệt đối không đụng):** `src/components/ui/drawer.tsx`, `modal.ts`, `TaskDrawer.tsx`, `TaskDrawerPlanning.tsx`, `ChangeRequestDetailView.tsx` + test/CSS của ipr, `src/components/notes/EntityNotesSection.tsx` (dùng chung bởi CR detail + TaskDrawer của session khác — chỉ tham khảo pattern, không sửa), AI chat, splash/tasklist, System/schema files, `.planning/STATE.md`. Không branch/worktree, không fetch/push, không full vitest.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@/Users/tranducquan/Working/Personal/task-management/CLAUDE.md
@/Users/tranducquan/Working/Personal/task-management/.planning/STATE.md
@src/views/ItemInsightView.tsx
@tests/views/ItemInsightView.test.tsx
@src/components/notes/EntityNotesSection.tsx
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Sửa layout Notes trên task detail + test title dài</name>
  <files>src/views/ItemInsightView.tsx, tests/views/ItemInsightView.test.tsx</files>
  <behavior>
    - Tạo task + note có title đúng 120 ký tự (NOTE_TITLE_MAX_LENGTH), entityType='task', entityId=task.id; render ItemInsightView itemType="task" → full title hiện trong DOM (toHaveTextContent với chuỗi đầy đủ), không bị cắt bởi ellipsis hay ẩn
    - Note title element có inline style min-width:0 và overflow-wrap:anywhere; truy được qua data-testid="insight-note-title"
    - Card 'Ghi chú liên quan (1)' có styles.head chứa flex-wrap:wrap và styles.title (hoặc span title) chứa min-width:0 + overflow-wrap:anywhere
    - Nút 'Thêm ghi chú' vẫn hiện, không bị disabled, nằm cùng card Notes
    - Test cũ 'lays out a task in the command deck grid...' vẫn pass — gridTemplateColumns vẫn 'minmax(0, 2.4fr) minmax(280px, 1fr)' và notesCard vẫn nằm trong cột phải
  </behavior>
  <action>
    Chỉ đụng đúng 2 file. Trong `src/views/ItemInsightView.tsx`, nhánh `itemType === 'task'`, Command Deck right column — Card "Ghi chú liên quan" (hiện khoảng line 814-830):

    1. Thêm `styles={{ head: { flexWrap: 'wrap', gap: 'var(--gap-8)' }, title: { minWidth: 0, overflowWrap: 'anywhere' } }}` vào Card đó. Prop `styles` đã có precedent trong repo (`EntityNotesSection.tsx` dùng `styles={{ body: ... }}`), nên dùng trực tiếp, KHÔNG thêm CSS file hay class global. Giữ nguyên `title`/`<Space>`/icon và `extra` Button "Thêm ghi chú" (`size="small"`, `icon={<PlusOutlined />}`, handler `setEditingNote` như cũ). Không đổi nhãn, không đổi handler.

    2. Trong `title={<Space>...<span>Ghi chú liên quan ({relatedNotes.length})</span></Space>}`, gắn thêm `style={{ minWidth: 0, overflowWrap: 'anywhere' }}` trên `<span>` để title card tự wrap khi cột hẹp.

    3. Với mỗi note trong `List` (khoảng line 823-826): thay `title={note.title || 'Ghi chú không tiêu đề'}` bằng một node `<span data-testid="insight-note-title" style={{ display: 'block', minWidth: 0, overflowWrap: 'anywhere' }}>{note.title || 'Ghi chú không tiêu đề'}</span>`. Giữ nguyên `description` "Cập nhật: ..." và mảng `actions` (Xem/Sửa) — KHÔNG đổi hành vi. Đặt `style={{ alignItems: 'flex-start' }}` trên `ListItem` nếu cần để actions không kéo giãn title; actions luôn `flexShrink: 0` (AntD mặc định) — không bọc lại button, không đổi Popconfirm/modal.

    4. KHÔNG sửa Card/Linked Notes section dùng cho `itemType !== 'task'` (khoảng line 893-947) — thuộc phạm vi CR/system, không phải task detail. Không sửa `EntityNotesSection.tsx`, `TaskDrawer*`, `ChangeRequestDetailView.tsx`, hay file CSS nào khác.

    Trong `tests/views/ItemInsightView.test.tsx`: import thêm `createNote` từ `../../src/db/repositories/noteRepo`. Thêm 1 test mới trong describe hiện tại, dùng chung `testDb`/`mockNavigate`/setup-teardown có sẵn: tạo system + CR + task như fixture test thứ hai, rồi `await createNote({ entityType: 'task', entityId: task.id, title: LONG_TITLE, body: 'Nội dung test' }, testDb)` với `LONG_TITLE` = chuỗi 120 ký tự (đúng `NOTE_TITLE_MAX_LENGTH`, ví dụ lặp 'A' trộn dấu cách để có nhiều từ). Render `<ItemInsightView itemType="task" itemId={task.id} onNavigate={mockNavigate} db={testDb} />`, đợi `findByTestId('insight-note-title')`, assert:
      - `expect(titleEl).toHaveTextContent(LONG_TITLE)` (full title, không rút gọn)
      - `expect(titleEl.style.minWidth).toBe('0px')` và `expect(titleEl.style.overflowWrap).toBe('anywhere')`
      - card = `screen.getByText(/Ghi chú liên quan \(1\)/).closest('.ant-card')`; `const head = card!.querySelector('.ant-card-head') as HTMLElement` (hoặc `.ant-card-head-title`) — assert style `flexWrap` là 'wrap' trên head và/hoặc `overflowWrap` 'anywhere' trên head-title, tuỳ chỗ `styles` được áp; nếu AntD tách class thì đọc đúng element thực tế sau khi render, KHÔNG đoán bừa — dùng `expect(head).toHaveStyle({ flexWrap: 'wrap' })` sau khi xác nhận element
      - `expect(within(card as HTMLElement).getByRole('button', { name: /thêm ghi chú/i })).toBeEnabled()`
    Giữ nguyên mọi test cũ; không đổi fixture chung. Không dùng snapshot. Không thêm dependency.
  </verify>
    <automated>npx vitest run tests/views/ItemInsightView.test.tsx --bail=1</automated>
  </verify>
  <done>Tất cả test trong `tests/views/ItemInsightView.test.tsx` pass, kể cả test mới với title 120 ký tự và test command-deck cũ. Full title hiện trọn trong DOM, style contract đúng, nút "Thêm ghi chú" enabled. `git diff` chỉ 2 file trong files_modified; không đụng ruled-out files, không dependency mới.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Chrome light/dark verify tiêu đề dài, không overlap</name>
  <what-built>Layout Notes trên task detail page đã có min-width:0 + overflow-wrap:anywhere cho title card và note title, head flex-wrap:wrap, nút "Thêm ghi chú" giữ nguyên. Test unit với note title 120 ký tự đã xanh.</what-built>
  <how-to-verify>
    1. `npm run dev`, mở app trong Chrome, vào một task detail (task insight) có ít nhất 1 note với title dài (~120 ký tự). Nếu chưa có, dùng UI "Thêm ghi chú" tạo note title dài rồi lưu.
    2. Ở **light theme**, kiểm tra lần lượt viewport 1280px, 768px, 375px: (a) title "Ghi chú liên quan (N)" wrap gọn, không bị nút "Thêm ghi chú" đè; (b) mọi note title đọc được TOÀN BỘ (wrap xuống dòng, không bị ellipsis cắt, không tràn ra ngoài card); (c) nút "Thêm ghi chú" click được, mở đúng NoteEditor.
    3. Đổi **dark theme**, lặp lại đúng 3 bước ở (2). Token màu giữ nguyên, chữ vẫn tương phản, không có viền/nền lạ.
    4. Chụp màn hình ít nhất 1 light + 1 dark ở 375px (breakpoint hẹp nhất) để đối chiếu.
    5. Kiểm tra `git status` — chỉ 2 file plan + artifact quick được phép thay đổi từ task này; các file đang modify của session khác (ChangeRequestDetailView.tsx, v.v.) phải giữ nguyên không đụng.
  </how-to-verify>
  <resume-signal>Gõ "approved" nếu title đọc trọn và nút không bị che ở cả 3 breakpoint × 2 theme; hoặc mô tả cụ thể breakpoint/theme/element vẫn overlap để sửa tiếp.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Note title (từ Dexie) → DOM task detail | Title là dữ liệu user tự do, render qua React escape — không dùng `dangerouslySetInnerHTML` |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-ism-01 | Tampering | `ItemInsightView.tsx` note title render | mitigate | Giữ render qua JSX text trong `<span>`, React tự escape; chỉ đổi style, không đổi nguồn dữ liệu hay thêm HTML injection. |
| T-ism-02 | Denial of service (layout) | Tiêu đề dài tối đa 120 ký tự trong cột 280px | mitigate | `min-width:0` + `overflow-wrap:anywhere` trên title, `flex-wrap:wrap` trên head — title wrap thay vì tràn/đè nút; title vẫn bị giới hạn bởi `NOTE_TITLE_MAX_LENGTH` ở schema. |
| T-ism-SC | Tampering | package installs | accept | Không cài package nào; không có artifact `[ASSUMED]`/`[SUS]`/`[SLOP]` cần checkpoint. |
</threat_model>

<verification>
Chạy scoped, TUYỆT ĐỐI không chạy full vitest suite (>1 tiếng):

1. `npx vitest run tests/views/ItemInsightView.test.tsx --bail=1`
2. `npx tsc --noEmit` — chỉ xử lý lỗi do diff này sinh ra; lỗi của session song song (ví dụ `PlusOutlined` trong `TasksView.tsx`) không đụng.
3. `npx eslint src/views/ItemInsightView.tsx tests/views/ItemInsightView.test.tsx`
4. `git diff -- src/views/ItemInsightView.tsx tests/views/ItemInsightView.test.tsx` — review từng hunk: chỉ layout/style + 1 test; không đụng TaskDrawer, CR detail, EntityNotesSection, splash/tasklist, AI chat, System/schema, STATE.md; không dependency/schema bump.
5. Chrome light/dark tại 1280/768/375 như Task 2 — tiêu đề đọc trọn, nút click được, không overlap.
6. Commit chỉ file trong `files_modified` + artifact 261128-ism. Kiểm tra `git status` trước khi add. Không fetch/push, không branch/worktree mới.
</verification>

<success_criteria>
- Note title 120 ký tự đọc trọn trên task detail, mọi breakpoint × theme; nút "Thêm ghi chú" không bị che, vẫn click được.
- Style contract đúng: title `min-width:0` + `overflow-wrap:anywhere`, head `flex-wrap:wrap`, actions không lấn title.
- Scoped test xanh, tsc/eslint sạch, Chrome light/dark verify xong.
- Zero file ngoài phạm vi, zero dependency, zero schema/version bump, zero đụng session song song.
</success_criteria>

<output>
Tạo `.planning/quick/261128-ism-s-a-task-detail-notes-ti-u-d-i-b-n-t-th-/261128-ism-SUMMARY.md` khi thực hiện xong.
</output>
