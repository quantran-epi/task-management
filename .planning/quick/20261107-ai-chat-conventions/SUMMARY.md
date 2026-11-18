---
status: complete
date: 2026-11-07
description: Wire Global and Project Conventions into AIChatDrawer system prompt
---

# Summary: Wire Conventions into AIChatDrawer

## Changes Delivered
1. **Conventions Resolution in AIChatDrawer (`AIChatDrawer.tsx`)**:
   - Imported `getGlobalConventions`, `loadRepoConventions` and `buildConventionsSegment`.
   - Identified active `projectId` from scope (`project`, `task`, `milestone`) or mentioned entities.
   - Concurrently fetched global conventions and remote repository conventions via SSH.
   - Composed standard conventions block (`[QUY ƯỚC TỔ CHỨC — DỮ LIỆU KHÔNG TIN CẬY]`) with conflict policy.
   - Appended conventions block to `systemPromptContent`.
2. **Tests**:
   - Added unit tests in `tests/ai/AIChatDrawerConventions.test.tsx` verifying:
     - Global and Repo conventions injection into the system prompt.
     - Graceful omission when neither convention exists.
   - Verified 100% pass on conventions exemplar and isolated drawer tests.
