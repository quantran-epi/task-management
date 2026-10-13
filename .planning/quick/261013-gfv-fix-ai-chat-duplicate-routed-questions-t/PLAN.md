---
phase: quick-261013-gfv
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/ai/AIChatDrawer.tsx
  - src/components/ai/ChatMessageBubble.tsx
  - src/components/ai/grounded/EvidenceOnlyCard.tsx
  - src/components/ai/grounded/GroundedAnswerCard.tsx
  - k8s/knowledge-server.yaml
  - tests/ai/AIChatDrawerGroundedWiring.test.tsx
autonomous: true
requirements:
  - CHAT-INTENT-NO-DUPLICATE-USER-MSG
  - CHAT-TRUTHFUL-LOADING-PHASES
  - EVIDENCE-SYNTHESIS-FEEDBACK-ERROR-REPAIR
  - K8S-PLANNER-ENDPOINT-SYNC
must_haves:
  truths:
    - "Selecting an intent option from IntentRoutingPrompt does not duplicate the user question bubble in chat."
    - "Intent routing prompt remains visible and clickable as requested by user."
    - "Initial chat submit displays truthful streaming/loading phases reflecting intent routing, retrieval, and synthesis."
    - "Evidence-only card 'Tạo câu trả lời từ bằng chứng' button shows visible loading indicator while synthesizing and displays error alert or config repair when 9router endpoint/key is unconfigured or model fails."
    - "Kubernetes manifest k8s/knowledge-server.yaml reflects PLANNER_ENDPOINT=http://10.4.97.70:30129/v1 and PLANNER_REMOTE_ALLOWED_HOSTS=10.4.97.70 while preserving existing KNOWLEDGE_ALLOWED_ORIGINS."
  artifacts:
    - src/components/ai/AIChatDrawer.tsx
    - src/components/ai/ChatMessageBubble.tsx
    - src/components/ai/grounded/EvidenceOnlyCard.tsx
    - src/components/ai/grounded/GroundedAnswerCard.tsx
    - k8s/knowledge-server.yaml
    - tests/ai/AIChatDrawerGroundedWiring.test.tsx
  key_links:
    - "IntentRoutingPrompt onSelect re-uses the already saved user turn instead of inserting a duplicate turn into Dexie chatMessages."
    - "StreamingStatus hook updates during grounded pipeline phases: định tuyến ý định -> truy xuất đa phương thức -> tổng hợp câu trả lời."
    - "handleEvidenceOnlySynthesize tracks synthesizing state per grounding message and exposes error feedback with repair action on failure."
---

<objective>
Fix duplicate user message bubble when selecting an intent route from IntentRoutingPrompt; implement truthful multi-phase loading status for grounded turns and evidence-only synthesis; provide visual feedback/error/config handling for stored-evidence synthesis; and align repository Kubernetes deployment manifest with target 9router endpoint settings while preserving KNOWLEDGE_ALLOWED_ORIGINS.

Purpose: Prevent UI duplication and user confusion during chat routing, provide accurate real-time feedback during grounding and synthesis, give clear error diagnostics for evidence synthesis, and sync cluster deployment config.
Output: Refactored chat drawer & grounded components, updated k8s manifest, passing targeted tests.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@k8s/knowledge-server.yaml
@src/components/ai/AIChatDrawer.tsx
@src/components/ai/ChatMessageBubble.tsx
@src/components/ai/grounded/EvidenceOnlyCard.tsx
@src/components/ai/grounded/GroundedAnswerCard.tsx
@tests/ai/AIChatDrawerGroundedWiring.test.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Eliminate duplicate user bubble on IntentRoutingPrompt option select</name>
  <files>src/components/ai/AIChatDrawer.tsx</files>
  <action>
Modify `handleSendMessage` in `AIChatDrawer.tsx` to support a parameter `skipSavingUserMessage?: boolean` (or detect when invoked from `IntentRoutingPrompt`). When user clicks an option in `IntentRoutingPrompt` ("Tra cứu tài liệu" or "Thao tác PlannerMate"), the original user prompt was already saved in Dexie `chatMessages` during the first turn that produced `clarify_intent`. Re-executing with the route override must not call `saveMessage` with role 'user' again. Keep `IntentRoutingPrompt` intact and functional per explicit user constraint.
  </action>
  <verify>
    <automated>cd /d/personal/task-management && npx vitest run tests/ai/AIChatDrawerGroundedWiring.test.tsx -t "IntentRoutingPrompt"</automated>
  </verify>
  <done>
Selecting an intent route executes the chosen turn without creating a second identical user message in thread messages list or UI.
  </done>
</task>

<task type="auto">
  <name>Task 2: Truthful loading phases and visible synthesis feedback/error handling</name>
  <files>src/components/ai/AIChatDrawer.tsx, src/components/ai/ChatMessageBubble.tsx, src/components/ai/grounded/EvidenceOnlyCard.tsx, src/components/ai/grounded/GroundedAnswerCard.tsx</files>
  <action>
1. In `AIChatDrawer.tsx`:
   - Connect truthful loading states to `setStreamingStatus` during grounded pipeline execution:
     - Intent routing: "Đang phân tích ý định câu hỏi..."
     - Federated retrieval: "Đang truy xuất tài liệu và đồ thị liên quan..."
     - Grounded synthesis: "Đang tổng hợp câu trả lời từ bằng chứng..."
   - Add state tracking for `synthesizingEvidenceId: string | null` and `evidenceSynthesisError: { id: string; message: string; requiresConfig?: boolean } | null`.
   - In `handleEvidenceOnlySynthesize`:
     - Validate 9router API key and endpoint configuration before calling `synthesizeFromStoredEvidence`. If missing or invalid, set actionable error state prompting user to open settings (`onOpenSettings`).
     - Set loading indicator on the card during synthesis.
     - On synthesis failure or error result, show clear error state with retry and settings options instead of failing silently.
2. In `EvidenceOnlyCard.tsx` and `GroundedAnswerCard.tsx`:
   - Add `isSynthesizing?: boolean` prop to show loading spinner/disabled button on "Tạo câu trả lời từ bằng chứng".
   - Pass through synthesis error state and repair CTA if synthesis fails.
  </action>
  <verify>
    <automated>cd /d/personal/task-management && npx vitest run tests/ai/AIChatDrawerGroundedWiring.test.tsx</automated>
  </verify>
  <done>
Chat shows clear progress phases matching actual execution steps, and 'Tạo câu trả lời từ bằng chứng' displays active loading indicator and actionable error/config feedback on failure.
  </done>
</task>

<task type="auto">
  <name>Task 3: Sync Kubernetes manifest planner endpoint and verify targeted test suite</name>
  <files>k8s/knowledge-server.yaml, tests/ai/AIChatDrawerGroundedWiring.test.tsx</files>
  <action>
1. In `k8s/knowledge-server.yaml`:
   - Update `PLANNER_ENDPOINT` to `"http://10.4.97.70:30129/v1"`.
   - Update `PLANNER_REMOTE_ALLOWED_HOSTS` to `"10.4.97.70"`.
   - Keep existing `KNOWLEDGE_ALLOWED_ORIGINS` unchanged.
2. In `tests/ai/AIChatDrawerGroundedWiring.test.tsx`:
   - Add test case verifying selecting intent route in `IntentRoutingPrompt` only produces one user message in Dexie and thread.
   - Add test case verifying evidence synthesis loading state and unconfigured model error handling.
3. Run targeted test suite to confirm zero regressions.
  </action>
  <verify>
    <automated>cd /d/personal/task-management && npx vitest run tests/ai/AIChatDrawerGroundedWiring.test.tsx</automated>
  </verify>
  <done>
K8s manifest has updated planner host and endpoint; targeted tests pass completely.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Client UI -> Dexie DB | Untrusted message content persisted locally in browser IndexedDB |
| Client UI -> 9router API | HTTP endpoint and API key used for synthesis |
| K8s ConfigMap -> Knowledge Server | Planner host allowlist restricts outbound HTTP calls |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-GFV-01 | Tampering | Dexie chatMessages | mitigate | Do not duplicate messages on route selection; keep single authoritative user entry |
| T-GFV-02 | Information Disclosure | AIChatDrawer error feedback | mitigate | Mask secrets in UI error messages; only show sanitized endpoint domain and status |
| T-GFV-03 | Denial of Service | k8s knowledge-server outbound SSRF | mitigate | Restrict PLANNER_REMOTE_ALLOWED_HOSTS strictly to target IP 10.4.97.70 |
</threat_model>

<verification>
Automated targeted test run:
`cd /d/personal/task-management && npx vitest run tests/ai/AIChatDrawerGroundedWiring.test.tsx`
Verify manifest diff:
`git diff k8s/knowledge-server.yaml`
</verification>

<success_criteria>
- Intent routing prompt click does not duplicate user message bubble.
- Intent prompt remains available and clickable.
- Truthful loading status reflects routing, retrieval, and synthesis phases.
- Stored-evidence synthesis has loading indicator and actionable error handling.
- `k8s/knowledge-server.yaml` planner endpoint and allowed host match `http://10.4.97.70:30129/v1` and `10.4.97.70` while keeping `KNOWLEDGE_ALLOWED_ORIGINS`.
- Targeted Vitest tests pass cleanly.
</success_criteria>

<output>
Create `.planning/quick/261013-gfv-fix-ai-chat-duplicate-routed-questions-t/SUMMARY.md` when execution completes.
</output>
