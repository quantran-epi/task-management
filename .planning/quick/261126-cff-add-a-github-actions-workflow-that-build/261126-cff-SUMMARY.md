---
phase: quick
plan: 261126-cff
status: complete
created: 2026-11-26
completed: 2026-11-26
---

# Quick 261126-cff: Add Windows-only NSIS installer workflow

## Accomplishments

- Added `.github/workflows/windows-installers.yml` with `workflow_dispatch` plus push triggers on `master`, `staging`, and `v*` tags.
- Single `build-windows` job on `windows-latest`: checkout, Node 24 setup, Rust `x86_64-pc-windows-msvc` toolchain, `npm ci`.
- Builds TaskMate NSIS with default Tauri config, uploads `taskmate-windows-nsis` immediately.
- Builds TaskMate Chat NSIS with `--config src-tauri/tauri.conf.chat.json` (which runs `npm run build:chat`), uploads `taskmate-chat-windows-nsis` filtered to `TaskMate Chat*.exe`.
- Both uploads use `if-no-files-found: error`. Workflow has `permissions: contents: read`, no secrets, no Apple targets, no publish step.

## Verification

- YAML parsed with Ruby `YAML.load_file`: pass.
- Grep checks: exactly 2 `tauri-apps/tauri-action@v0` steps, 2 `actions/upload-artifact@v4` steps, NSIS args present, chat config present, upload error mode present; no macOS/iOS/release/secret references.
- `git diff` for `desktop-build.yml`, `package.json`, both Tauri configs and `vite.chat.config.ts`: empty.
- Full test suite not run per project convention; real NSIS build executes on CI Windows runners.

## Commits

- `7b757828` ci: add Windows-only workflow for two NSIS installers
