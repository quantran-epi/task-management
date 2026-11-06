---
phase: 29-ssh-remote-repository-branch-diff-review
plan: 02
subsystem: sdlc-code-guide-review
tags: [ssh, git, diff, branch, review, ant-design, tauri]
status: complete
requires:
  - 29-01
provides:
  - "Interactive Git Branch & Diff Review workbench in Step3CodeGuideView"
  - "RemoteDiffViewer supporting Unified and Split side-by-side modes"
  - "5000-line diff safety capping banner with explicit load confirmation"
  - "Fullscreen review modal overlay for deep inspection"
  - "Dirty working tree alert banner and remote HEAD drift detection"
  - "Resizable 2-column layout (commit timeline + file tree on left, diff viewer on right)"
  - "Branch snapshot approval CTA transitioning to Step 4"
affects:
  - src/types/gitRemote.ts
  - src/components/sdlc/diff/RemoteDiffViewer.tsx
  - src/components/sdlc/steps/Step3CodeGuideView.tsx
  - src/components/sdlc/steps/__tests__/Step3CodeGuideView.test.tsx
  - src/views/ProjectSdlcView.tsx
tech-stack:
  added: []
  patterns:
    - "Resizable 2-column split pane via ResizeSplitter"
    - "Unified and Split diff visualization via parseGitDiff"
    - "Monospace font with minimum 12px font size"
    - "Safety capping of oversized diffs (>5000 lines)"
key-files:
  created:
    - src/components/sdlc/diff/RemoteDiffViewer.tsx
    - src/components/sdlc/steps/__tests__/Step3CodeGuideView.test.tsx
  modified:
    - src/types/gitRemote.ts
    - src/components/sdlc/steps/Step3CodeGuideView.tsx
    - src/views/ProjectSdlcView.tsx
decisions:
  - "Use ResizeSplitter between commit timeline / changed files list and RemoteDiffViewer with 260px min and 480px max bounds."
  - "Cap diff display at 5000 lines by default; provide explicit 'Tải toàn bộ nội dung diff' button to render full diff."
  - "Maintain uncommitted dirty files in a non-blocking warning banner per D-04 while still allowing committed diff review."
  - "Display non-destructive drift alert if remote HEAD changes after snapshot approval with re-inspection CTA per D-09."
metrics:
  duration: 6m
  completed: 2026-11-06T13:15:00Z
actuals:
  tokens: 42000
  tasks: 3
  commits: 2
plan_head_before: "62a524e2"
plan_head_after: "ff4d8783"
---

# Phase 29 Plan 02: SSH Remote Repository Branch & Diff Review Summary

Transformed `Step3CodeGuideView` from a static instruction card into an interactive Git Branch & Diff Review workbench over native Tauri SSH.

## Key Deliverables

1. **RemoteDiffViewer Component (`src/components/sdlc/diff/RemoteDiffViewer.tsx`)**:
   - Parses unified git diff via `parseGitDiff` from `src/utils/gitDiffParser.ts`.
   - Supports `Unified` (stacked) and `Split` (side-by-side) modes via Ant Design `Segmented` control.
   - Fixed 44px gutter with old/new line numbers in monospace font (12px, line-height 20px).
   - Additions highlighted in green (`token.colorSuccessBg` / `#e6ffed`), deletions in red (`token.colorErrorBg` / `#ffeef0`).
   - Safety capping for diffs > 5000 lines (D-07, T-29-04) with confirmation CTA: `Tải toàn bộ nội dung diff ({count} dòng)`.
   - Fullscreen modal toggle (`FullscreenOutlined` / `FullscreenExitOutlined`) occupying 95vw/85vh for comfortable code inspection.

2. **Interactive Review Workbench (`src/components/sdlc/steps/Step3CodeGuideView.tsx`)**:
   - **Top Configuration Bar**: SSH profile selector, monospace remote repo path input, base branch (`origin/main`), and searchable target branch `Select` dropdown populated via `getRemoteBranches`.
   - **Dirty Working Tree Warning Banner**: Renders non-blocking warning when uncommitted changes are detected via `checkDirtyStatus` (D-04).
   - **Remote HEAD Drift Alert Banner**: Notifies user if remote HEAD moved after snapshot approval with a `Kiểm tra lại & Cập nhật snapshot` CTA (D-09).
   - **Resizable 2-Column Split Pane**:
     - Left panel (default 320px, min 260px, max 480px, controlled via `ResizeSplitter`):
       - Sub-section 1: Scrollable commit timeline (`RemoteGitCommit[]`) with short SHA tags, authors, dates, and commit messages.
       - Sub-section 2: Changed files tree with quick-search input (`Input.Search`), status tags (`[A]`, `[M]`, `[D]`, `[R]`), relative paths, and `+add / -del` counts.
     - Right panel: `RemoteDiffViewer` rendering diff of selected file fetched via `getFileDiff`.
   - **Action & Approval Footer**: Shows snapshot status, `Chấp thuận kết quả review` primary CTA saving `BranchSnapshot`, and `Chuyển sang Bước 4: Change Pack` forward action.

3. **Wiring in SDLC Workflow (`src/views/ProjectSdlcView.tsx`)**:
   - Passed `projectId` and `db` into `Step3CodeGuideView` to enable automatic per-project SSH repo binding persistence.

4. **Comprehensive Unit Tests (`src/components/sdlc/steps/__tests__/Step3CodeGuideView.test.tsx`)**:
   - 6 green tests validating `RemoteDiffViewer` mode switching, >5000-line safety capping, fullscreen toggling, SSH configuration preloading, dirty repo banner, commit timeline, changed files selection, and snapshot approval.

## Self-Check: PASSED
- `src/components/sdlc/diff/RemoteDiffViewer.tsx` exists.
- `src/components/sdlc/steps/Step3CodeGuideView.tsx` exists.
- `src/components/sdlc/steps/__tests__/Step3CodeGuideView.test.tsx` exists.
- Commits `d1897db7` and `ff4d8783` exist in history.
