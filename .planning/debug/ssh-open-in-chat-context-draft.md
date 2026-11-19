---
status: resolved
trigger: "SSH remote: bôi đen file viewer rồi chọn Open in chat → tab chat mở nhưng không switch context sang SSH remote folder; lần đầu không tự fill selection vào chat input, phải click lại cùng selection lần 2 mới fill"
created: 2026-11-19
updated: 2026-11-19
---

# Debug: Open in chat từ remote selection — sai context + draft chỉ fill lần 2

## Symptoms

- expected: Chọn "Open in Chat" từ selection trong remote file viewer → chat mở đúng scope `remote:<targetUuid>` của target chứa file và draft chứa `[Trích đoạn ... @ path:start-end]` ngay lần đầu.
- actual: Tab chat mở nhưng scope không chuyển sang SSH remote folder. Draft selection không xuất hiện ở chat input lần đầu; click lại cùng selection lần 2 thì fill.
- error: Không có toast/console error.
- timeline: Sau phase 47 remote inline AI & citation navigation.
- repro: Mở remote file viewer qua SSH, bôi đen text, click "Open in Chat" trong remote inline toolbar.

## Current Focus

next_action: gather initial evidence

hypothesis: Đang điều tra. Hai triệu chứng độc lập khả dĩ: (1) context — `openChatWithDraft` set `customScope` trong AIChatContext nhưng AIChatDrawer sync `propScope` (từ context activeScope) sang `internalScope` bằng effect phụ thuộc `[propScope?.type, propScope?.id, propScope?.title]`; scope remote target UUID có thể đổi theo branch/repoPath hoặc bị override; (2) draft — context `pendingDraft` chỉ tồn tại trong React state, bị clear bởi `clearPendingDraft()` trong effect của drawer trước khi ChatInputBar kịp mount/chuyển tab, hoặc `externalInputValue` bị overwrite bởi draftCarry/active runtime khi scope/tab đổi.

resolution:
  root_cause: "Hai bug độc lập. (1) Workbench RightToolWindow render AIChatDrawer KHÔNG truyền prop activeScope; drawer giữ internalScope=null nên currentScope bị kẹt global — context remote từ AIChatContext (do openChatWithDraft → persistScope set) không bao giờ tới drawer. AppShell truyền prop, nhưng Tauri workbench dùng RightToolWindow. (2) Lần click đầu: drawer mount mới, pendingDraft bị consume (effect 1039-1045) trong khi activeTabId vẫn là 'default' (durableTabs/useLiveQuery resolve async) → draft vào unseededDraft/runtime 'default'; effect seed (724-736) thấy carry.tabId !== activeTabId nên bỏ draft, ghi đè bằng runtime.draft rỗng. Click lần 2: scope/tab đã ổn định nên draft vào đúng runtime."
  fix: "RightToolWindow.tsx: truyền activeScope={activeScope} từ useAIChat() vào AIChatDrawer. AIChatDrawer.tsx effect seed: khi đổi từ tab 'default' sang tab durable, nếu runtime.draft rỗng thì patch draft=unseededDraft, cập nhật draftCarryRef và clear unseededDraft (tránh bleed sang tab khác). Thêm unseededDraft vào deps."
  verification: "npx tsc --noEmit -p tsconfig.json — clean. Chưa chạy UAT trên Tauri (cần SSH remote thật)."

evidence_so_far:
- InlineAISelectionBar.tsx:295-306 — remote path gọi `openChatWithDraft({type:'remote', id: currentPayload.targetId, title: currentPayload.targetTitle}, prompt)`.
- RemoteSelectionAnchor.ts:52-77 — `targetUuid` đọc từ DOM `data-remote-target-uuid`; sshConfigId/repoPath/branch cũng đọc từ DOM attrs của viewer. `remoteAnchorToPayload` không set `targetTitle` (payload có targetId, hierarchyPath, selectedText, remote).
- RemoteFileViewer.tsx:64-73 — targetUuid = deriveRemoteTargetUuid(config.id, repoPath.trim(), branch); registerActiveItem remote scope với cùng uuid.
- AIChatContext.tsx:87-94 — `openChatWithDraft` persistScope(scope) rồi setPendingDraft(draftText.trim()) rồi saveOpenState(true) — 3 state updates cùng batch.
- AIChatDrawer.tsx:424-430 — propScope → internalScope sync effect只在 type/id/title đổi.
- AIChatDrawer.tsx:1039-1045 — consume pendingDraft: `if (open && pendingDraft) { setExternalInputValue(pendingDraft); clearPendingDraft(); }`.
- ChatInputBar.tsx:146-152 — externalValue effect: update(externalValue) rồi onExternalValueConsumed?.() → setExternalInputValue(null).
- AIChatDrawer.tsx:2621-2623 — externalValue truyền vào ChatInputBar, value = activeRuntime.draft.
