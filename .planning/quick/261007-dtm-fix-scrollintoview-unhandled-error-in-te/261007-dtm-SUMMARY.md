---
status: complete
date: 2026-10-07
slug: fix-scrollintoview-unhandled-error-in-te
---

# Quick Task Summary: Fix scrollIntoView Unhandled Error in Tests

## Problem Identified
During test execution of `tests/ai/ChatInputBar.test.tsx` (and potentially any test exercising Ant Design Mentions dropdown), Vitest caught an unhandled exception:
`TypeError: activeItem.scrollIntoView is not a function` at `node_modules/@rc-component/mentions/lib/DropdownMenu.js:44:18`.
JSDOM does not implement `Element.prototype.scrollIntoView`. When Ant Design Mentions updates active item in dropdown, it invokes `scrollIntoView()`, failing test runs.

## Fix Applied
1. **Added JSDOM shim in `tests/setup.ts`**:
   - Implemented `scrollIntoView` as a no-op fallback on `Element.prototype` and `window.Element.prototype`.
2. **Verification**:
   - Ran `npx vitest run tests/ai/ChatInputBar.test.tsx`: 15 passed, 0 unhandled errors.
   - Ran `npx vitest run tests/ai/`: 17 test files passed, 210 passed, 0 errors.
