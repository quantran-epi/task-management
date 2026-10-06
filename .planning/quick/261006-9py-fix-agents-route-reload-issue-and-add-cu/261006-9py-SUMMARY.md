# Quick Task Summary: 261006-9py

**Objective:** Fix `#/agents` route reload issue, add custom prompt review/editing to `RunGhostDevModal`, and implement local session audit history tracking for Ghost Dev sessions.

## Completed Tasks

| Task | Name | Commit | Key Files Modified |
| --- | --- | --- | --- |
| Task 1 | Fix `#/agents` route reload and add custom prompt editor to RunGhostDevModal | `d15aab6` | `src/hooks/useHashRoute.ts`, `tests/hooks/useHashRoute.test.ts`, `src/components/agents/RunGhostDevModal.tsx` |
| Task 2 | Implement `agentSessionHistoryRepo` and record session lifecycle and mid-run feedback | `7637966` | `src/types/agent.ts`, `src/services/agents/agentSessionHistoryRepo.ts`, `src/components/agents/RunGhostDevModal.tsx`, `src/hooks/useGhostDevSessions.ts`, `src/hooks/useGhostDevStream.ts`, `tests/agents/agentSessionHistoryRepo.test.ts` |
| Task 3 | Display session audit history and details in `AgentSessionList` and `AgentControlView` | `776cfb0` | `src/components/agents/AgentSessionList.tsx`, `src/views/AgentControlView.tsx`, `tests/agents/AgentControlView.test.tsx` |

## Key Changes

1. **Route Validator Fix (`src/hooks/useHashRoute.ts`):**
   - Added `'agents'` to `VALID_ROUTES` whitelist.
   - Added unit test cases for parsing `#/agents` and serializing `'agents'` route without falling back to `'dashboard'`.

2. **Custom Prompt Configuration (`src/components/agents/RunGhostDevModal.tsx`):**
   - Added Segmented toggle between default prompt mode and custom prompt mode.
   - Provided extra instructions input in default mode that appends instructions to the generated prompt.
   - Provided full editable textarea in custom mode with a "Khôi phục mặc định" reset button.
   - Added expandable preview pane to review the exact prompt string before dispatch.

3. **Persistent Audit History (`src/services/agents/agentSessionHistoryRepo.ts`):**
   - Implemented `agentSessionHistoryRepo` using browser `localStorage` under key `'planner:ghost_dev_session_history'` with safe JSON handling and a 100-record ring buffer cap.
   - Stored task metadata, repo path, branch name, master and worker model IDs, execution status, initial prompt, and chronological `userFeedbackHistory`.
   - Wired `recordSessionStart` in `RunGhostDevModal.tsx`, `recordUserFeedback` in `useGhostDevStream.ts`, and `updateSessionStatus` in `useGhostDevSessions.ts`.

4. **Audit History Inspection UI (`AgentSessionList.tsx` & `AgentControlView.tsx`):**
   - Added Segmented tab bar in `AgentSessionList` switching between "Đang chạy" and "Lịch sử".
   - Added Audit Details Drawer in `AgentControlView` displaying full session metadata, initial prompt with copy button, and chronological list of mid-run user feedback messages.
   - Added individual record delete and clear all history capabilities.

## Verification

- `npx vitest run tests/hooks/useHashRoute.test.ts`: 7 passed
- `npx vitest run tests/agents/agentSessionHistoryRepo.test.ts`: 6 passed
- `npx vitest run tests/agents/`: 5 test files, 20 passed
- `npm run build`: Successful TypeScript validation and Vite PWA build with 0 errors.

## Self-Check: PASSED

- [x] All 3 tasks executed and committed individually
- [x] `# /agents` reload preserved without fallback redirect
- [x] Custom prompt editor and preview functioning in `RunGhostDevModal`
- [x] Audit history repository and drawer viewer verified with unit tests
- [x] No docs artifacts committed (preserved for orchestrator Step 8)
