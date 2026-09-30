---
phase: quick
plan: 260930-wva
type: execute
wave: 1
depends_on: []
files_modified:
  - vite.config.ts
autonomous: true
requirements:
  - VITEST-WINDOWS-PWA-VIRTUAL-ALIAS

must_haves:
  truths:
    - "Vitest aliases virtual:pwa-register/react to local mock tests/mocks/pwaRegister.ts using cross-platform fileURLToPath"
    - "Vitest suites importing ServiceWorkerContext or AppShell do not trigger Node filename TypeError on Windows runners"
    - "Test suite passes cleanly across all test files"
  artifacts:
    - path: "vite.config.ts"
      provides: "Vitest test.alias configuration for virtual:pwa-register/react"
      contains: "tests/mocks/pwaRegister.ts"
---

# Quick Plan: Fix Vitest virtual:pwa-register alias for Windows runners

## Problem
On Windows GitHub Actions runners, Vitest failed across 9 suites with:
`TypeError: The argument 'filename' must be a file URL object, file URL string, or absolute path string. Received 'file:///@vite-plugin-pwa/virtual:pwa-register/react'`
Because `vite-plugin-pwa` resolves virtual module as `/@vite-plugin-pwa/...`, Node's `url.fileURLToPath` rejects it on Windows due to lack of a drive letter. `tests/mocks/pwaRegister.ts` existed in repo but was not aliased in `vite.config.ts`.

## Solution
Add `fileURLToPath` resolution for `virtual:pwa-register/react` pointing to `./tests/mocks/pwaRegister.ts` under `test.alias` in `vite.config.ts`.
