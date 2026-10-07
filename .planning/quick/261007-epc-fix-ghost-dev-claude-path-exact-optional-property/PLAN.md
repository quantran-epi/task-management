---
slug: 261007-epc-fix-ghost-dev-claude-path-exact-optional-property
title: fix ghostDevConfig claudePath exactOptionalPropertyTypes build error
date: 2026-10-07
status: complete
---

# Quick Plan: Fix GhostDevConfig claudePath exactOptionalPropertyTypes Build Error

## Problem
`tsconfig.json` enforces `exactOptionalPropertyTypes: true`.
In `GhostDevConfig`, `claudePath?: string` disallowed `undefined` as a valid property value type when constructing objects with conditional or undefined-coalesced fields, breaking `npm run build` at `getGhostDevConfig()`.

## Solution
Update `GhostDevConfig.claudePath` definition to `claudePath?: string | undefined;` matching the repo convention under `exactOptionalPropertyTypes`.
Verify with `npm run build` and unit test.
