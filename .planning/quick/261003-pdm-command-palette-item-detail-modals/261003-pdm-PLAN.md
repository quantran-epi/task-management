---
phase: quick
plan: 261003-pdm
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/projects/ProjectDetailModal.tsx
  - src/components/notes/NoteDetailModal.tsx
  - src/components/palette/CommandPaletteModal.tsx
  - src/components/shell/AppShell.tsx
  - tests/components/projects/ProjectDetailModal.test.tsx
  - tests/components/palette/CommandPaletteModal.test.tsx
autonomous: true
requirements:
  - PALETTE-DETAIL-MODALS-01
user_setup: []
must_haves:
  truths:
    - "Selecting a project in command palette opens a rich detail modal with overview, progress, milestones, tools (edit, add task) and navigator (open in projects view)."
    - "Selecting a note in command palette opens the NoteDetailModal directly instead of blindly navigating to notes list."
    - "NoteDetailModal includes navigator to open in full notes view."
    - "Command palette '#' prefix searches both projects and milestones with rich preview."
  artifacts:
    - path: "src/components/projects/ProjectDetailModal.tsx"
      provides: "Normalized project detail modal with stats, milestones, tasks, tools, and navigator"
    - path: "src/components/notes/NoteDetailModal.tsx"
      provides: "Enhanced note detail modal with view navigator"
    - path: "src/components/palette/CommandPaletteModal.tsx"
      provides: "Item selection opening normalized detail modals"
---

<tasks>
<task>
  <name>Task 1: Create ProjectDetailModal and enhance NoteDetailModal</name>
  <files>
    - src/components/projects/ProjectDetailModal.tsx
    - src/components/notes/NoteDetailModal.tsx
  </files>
  <action>
    Build ProjectDetailModal displaying project metadata, status, deadline, progress bar, estimated vs spent time, milestones, and action tools (edit, add task) and navigator (open projects page). Add onNavigateToNotes to NoteDetailModal.
  </action>
  <verify>
    npx vitest run tests/components/projects/ProjectDetailModal.test.tsx
  </verify>
  <done>
    ProjectDetailModal renders project overview and actions; NoteDetailModal supports navigation.
  </done>
</task>

<task>
  <name>Task 2: Wire CommandPaletteModal and AppShell for normalized modal inspection</name>
  <files>
    - src/components/palette/CommandPaletteModal.tsx
    - src/components/shell/AppShell.tsx
    - tests/components/palette/CommandPaletteModal.test.tsx
  </files>
  <action>
    Update CommandPaletteModal to support onOpenNote, project & milestone items. In AppShell, wire inspectingNote to NoteDetailModal, inspectingProject to ProjectDetailModal (with transition to ProjectModal for editing).
  </action>
  <verify>
    npx vitest run tests/components/palette/CommandPaletteModal.test.tsx
  </verify>
  <done>
    Clicking project opens ProjectDetailModal; clicking note opens NoteDetailModal; tests pass.
  </done>
</task>
</tasks>
