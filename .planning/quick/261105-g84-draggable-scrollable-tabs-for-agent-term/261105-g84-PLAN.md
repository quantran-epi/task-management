---
phase: quick
plan: 261105-g84
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/ai/ChatTabBar.tsx
  - src/components/ai/AIChatDrawer.tsx
  - src/components/ai/__tests__/ChatTabBar.test.tsx
  - src/components/agents/AgentTerminalLog.tsx
autonomous: true
requirements: [QUICK-G84]

estimate:
  tokens: 45000
  raw_tokens: 30000
  tasks: 2
  confidence: high

must_haves:
  truths:
    - ChatTabBar hỗ trợ drag-and-drop HTML5 để hoán đổi vị trí các tab, có callback onReorderTabs truyền lên AIChatDrawer.
    - ChatTabBar hiển thị nút cuộn trái/phải (`LeftOutlined`, `RightOutlined`) khi danh sách tab tràn ngang, hỗ trợ cuộn chuột ngang (`onWheel`) và tự động `scrollIntoView` khi active tab thay đổi.
    - Nút đóng tab (`CloseOutlined`) trên ChatTabBar và AgentTerminalLog không bao giờ bị bóp méo hay che khuất (`flex-shrink: 0`, min-width tab hợp lý).
    - AgentTerminalLog nâng cấp bộ chọn subagent ở center panel thành danh sách tab dạng draggable & scrollable với overflow cuộn ngang kiểu VSCode/Chrome, giữ 'all' và 'master' ở đầu, cho phép reorder các worker tabs.
  artifacts:
    - src/components/ai/ChatTabBar.tsx
    - src/components/ai/AIChatDrawer.tsx
    - src/components/ai/__tests__/ChatTabBar.test.tsx
    - src/components/agents/AgentTerminalLog.tsx
  key_links:
    - ChatTabBar onReorderTabs kết nối với state durableTabs / reorder logic trong AIChatDrawer hoặc local state order.
    - AgentTerminalLog worker tabs hỗ trợ drag reorder nội bộ, auto-scroll active worker tab vào vùng hiển thị, và nút đóng worker thoát/lỗi hiển thị rõ ràng.
---

<objective>
Nâng cấp thanh tab của AI Chat Drawer (`ChatTabBar`) và bộ chuyển đổi subagent trong Agent Terminal (`AgentTerminalLog`) thành các tab cuộn ngang mượt mà kiểu Chrome/VSCode với tính năng kéo thả đổi vị trí (drag-and-drop reorder) và bảo đảm nút đóng tab không bao giờ bị che khuất hay bẹp méo.

Purpose: Tối ưu trải nghiệm chuyển đổi ngữ cảnh khi mở nhiều tab trò chuyện AI hoặc nhiều tiến trình worker terminal chạy song song; xử lý tràn ngang gọn gàng, tiện dụng khi làm việc trên desktop màn hình nhỏ hoặc split view.
Output: Mã nguồn cập nhật cho `ChatTabBar`, `AIChatDrawer`, `AgentTerminalLog` và unit test bổ sung cho `ChatTabBar`.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@src/components/ai/ChatTabBar.tsx
@src/components/ai/AIChatDrawer.tsx
@src/components/ai/__tests__/ChatTabBar.test.tsx
@src/components/agents/AgentTerminalLog.tsx
@src/db/repositories/chatTabRepo.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Nâng cấp ChatTabBar với drag-and-drop reorder và thanh cuộn ngang Chrome/VSCode overflow</name>
  <files>src/components/ai/ChatTabBar.tsx, src/components/ai/AIChatDrawer.tsx, src/components/ai/__tests__/ChatTabBar.test.tsx</files>
  <behavior>
    - Test drag reorder: Kéo tab chat-1 thả vào vị trí tab chat-2 kích hoạt prop `onReorderTabs(fromIndex, toIndex)`. Tab SDLC (vị trí 0) không cho phép kéo hoặc chỉ cho phép kéo các tab chat thường.
    - Test horizontal scroll overflow controls: Khi container có scrollWidth > clientWidth, xuất hiện các nút bấm cuộn trái/phải (`LeftOutlined`, `RightOutlined`). Click cuộn sang trái/phải.
    - Test wheel scroll: Lăn chuột trên tab bar chuyển đổi `deltaY` thành `scrollLeft` của container.
    - Test active tab auto-scroll: Active tab tự động kích hoạt `scrollIntoView` với `block: 'nearest', inline: 'nearest'`.
    - Đảm bảo nút đóng tab `CloseOutlined` có `flexShrink: 0`, không bị co lại khi tiêu đề tab dài.
  </behavior>
  <action>
    1. Cập nhật `src/components/ai/ChatTabBar.tsx`:
       - Thêm prop `onReorderTabs?: (fromIndex: number, toIndex: number) => void` vào `ChatTabBarProps`.
       - Bổ sung ref cho scroll container (`scrollContainerRef = useRef<HTMLDivElement>(null)`).
       - Bổ sung state `canScrollLeft` và `canScrollRight` bằng hàm `checkScrollOverflow` gắn với scroll event và `ResizeObserver`.
       - Thêm 2 nút điều hướng cuộn trái / phải nhỏ gọn (bằng icon `LeftOutlined`, `RightOutlined`) ở 2 đầu thanh tab khi `canScrollLeft` hoặc `canScrollRight` là true.
       - Thêm `onWheel` handler trên container để hỗ trợ lăn bánh xe chuột cuộn ngang mượt mà (`e.currentTarget.scrollLeft += e.deltaY`).
       - Dùng `useEffect` kiểm tra activeTabId: gọi `tabElementsRef.current[activeIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })`.
       - Tích hợp HTML5 Drag and Drop (`draggable={!isSdlc}`, `onDragStart`, `onDragOver`, `onDragLeave`, `onDrop`, `onDragEnd`) kèm visual indicator (ví dụ viền highlight trái/phải hoặc opacity khi dragging) cho các tab chat thường.
       - Bảo đảm style của tab và nút đóng: title có `overflow: hidden`, `textOverflow: ellipsis`, `whiteSpace: nowrap`, `minWidth: 0`; nút đóng có `flexShrink: 0`, min-width tab tối thiểu ~90px, tab không bị bóp vỡ nút đóng.
    2. Cập nhật `src/components/ai/AIChatDrawer.tsx`:
       - Cung cấp handler `handleReorderTabs(fromIndex, toIndex)` cho `ChatTabBar`: cập nhật thứ tự tab thông qua cập nhật `order` trường durable trong Dexie DB (`db.chatTabs`) hoặc điều chỉnh thứ tự hiển thị bằng hàm cập nhật `order` hàng loạt trong transaction Dexie.
    3. Cập nhật `src/components/ai/__tests__/ChatTabBar.test.tsx`:
       - Thêm các test case kiểm tra:
         + Bắt sự kiện dragstart và drop kích hoạt `onReorderTabs`.
         + Kiểm tra cuộn chuột ngang (wheel event).
         + Nút đóng tab không bị co lại (`flexShrink: 0`).
  </action>
  <verify>
    <automated>npx vitest run src/components/ai/__tests__/ChatTabBar.test.tsx</automated>
  </verify>
  <done>ChatTabBar có đầy đủ kéo thả đổi vị trí tab, cuộn ngang bằng chuột và nút điều hướng trái/phải, active tab tự cuộn vào tầm nhìn, test suite chạy pass 100%.</done>
</task>

<task type="auto">
  <name>Task 2: Nâng cấp Subagent Switcher trong AgentTerminalLog thành draggable-scrollable tab list</name>
  <files>src/components/agents/AgentTerminalLog.tsx</files>
  <action>
    1. Thay thế phần hiển thị subagent switcher từ `Segmented` đơn thuần sang thanh tab tùy chỉnh mang phong cách VSCode/Chrome tabs trong `AgentTerminalLog.tsx`:
       - Tạo container tab bar có cuộn ngang với `overflowX: 'auto'`, ẩn thanh cuộn mặc định (`scrollbarWidth: 'none'`).
       - Thêm `onWheel` listener để cuộn ngang bằng con lăn chuột (`container.scrollLeft += e.deltaY`).
       - Thêm điều hướng nút cuộn trái/phải (`LeftOutlined`, `RightOutlined`) nhỏ gọn khi nội dung tràn ngang (dùng `ResizeObserver` và scroll listener tương tự Task 1).
       - Tự động cuộn active tab vào view khi `selectedAgent` thay đổi (`scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })`).
    2. Hỗ trợ drag-and-drop cho worker tabs:
       - Tab "Tất cả" và "👑 Master" cố định ở 2 vị trí đầu tiên (không drag).
       - Các worker subagent tab (`visibleWorkers`) có thể kéo thả để hoán đổi thứ tự hiển thị ưu tiên theo nhu cầu theo dõi của người dùng (lưu thứ tự workerIds vào state `customWorkerOrder` nội bộ của terminal).
       - Drag event: `draggable`, `onDragStart`, `onDragOver`, `onDrop` với highlight trực quan khi kéo.
    3. Đảm bảo UI/UX của worker tab và nút đóng:
       - Nút đóng subagent (`CloseOutlined`) cho worker đã hoàn thành (`isExited` như 'done', 'error') có `flexShrink: 0`, min-width tab thích hợp để nút đóng luôn nhìn thấy và click chính xác mà không bị tràn hay ép cụt.
       - Đảm bảo hiển thị tag trạng thái (`Lỗi`, `Đã thoát`) và icon rõ ràng, text role được truncate bằng ellipsis nếu tên quá dài.
  </action>
  <verify>
    <automated>npx vitest run src/components/agents/__tests__/ -x || npx tsc --noEmit</automated>
  </verify>
  <done>Subagent switcher trong AgentTerminalLog chuyển thành draggable-scrollable tabs thanh lịch, cuộn ngang mượt mà, hỗ trợ reorder worker tabs và nút đóng không bao giờ bị bóp vỡ.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| UI Event Handling | Dữ liệu kéo thả (drag and drop) và reorder index nội bộ trình duyệt không tác động trực tiếp vào API ngoài |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-G84-01 | Denial of Service | Tab reorder index math | low | mitigate | Kiểm tra cận `fromIndex >= 0 && toIndex < tabs.length` trước khi hoán đổi mảng, ngăn lỗi runtime crash |
| T-G84-02 | Tampering | Local drag payload | low | mitigate | Chỉ sử dụng internal index / tab id trong state component, không xử lý untrusted external drag drop data |
| T-G84-SC | Tampering | npm packages | low | accept | Không cài đặt thêm bất kỳ npm dependency mới nào, tận dụng native HTML5 Drag and Drop và Ant Design icons |
</threat_model>

<verification>
1. Chạy unit test kiểm tra ChatTabBar: `npx vitest run src/components/ai/__tests__/ChatTabBar.test.tsx`
2. Kiểm tra type check toàn dự án: `npx tsc --noEmit`
</verification>

<success_criteria>
- ChatTabBar và AgentTerminalLog sở hữu thanh tab cuộn ngang phong cách Chrome/VSCode với nút điều hướng cuộn và con lăn chuột.
- Các tab hỗ trợ kéo thả HTML5 reorder vị trí trực quan.
- Nút đóng tab không bị ép nhỏ hoặc che khuất trên cả 2 component.
- Kiểm tra type check và focus tests thành công 100%.
</success_criteria>

<output>
Create `.planning/quick/261105-g84-draggable-scrollable-tabs-for-agent-term/261105-g84-SUMMARY.md` when done
</output>
