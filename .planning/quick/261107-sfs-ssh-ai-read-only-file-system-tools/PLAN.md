---
task: 261107-sfs-ssh-ai-read-only-file-system-tools
date: 2026-11-07
status: in-progress
---

# SSH Read-Only File System Tools for AI Tool Loop

## Goal
Enable AI to inspect remote servers via read-only SSH tools (`ssh_list_dir`, `ssh_read_file`, `ssh_grep_files`) configured with a specific SSH connection profile, optimized for context window safety.

## Planned Changes
1. `src/types/sshFsTool.ts`: Config interface, tool args and result types.
2. `src/services/ai/sshFsToolService.ts`: Service handling list dir, read slice with binary check, grep with sanitization, connection testing.
3. `src/services/ai/__tests__/sshFsToolService.test.ts`: Comprehensive tests for safety, truncation, error handling.
4. `src/services/ai/aiTools.ts`: Register `ssh_list_dir`, `ssh_read_file`, `ssh_grep_files` in AI tool catalog and tool execution switch.
5. `src/components/settings/SshFsAiToolConfigCard.tsx`: Settings UI card under AI Settings tab.
6. `src/components/ai/SshFsSettingsModal.tsx`: Fast connection configuration modal in AI Chat Drawer.
7. `src/components/ai/ChatTabToolbox.tsx`: Toolbar button with active indicator badge.
8. `src/components/ai/AIChatDrawer.tsx`: Hook up modal and reload state.
9. `src/views/SettingsView.tsx`: Mount `SshFsAiToolConfigCard`.
