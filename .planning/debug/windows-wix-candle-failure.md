---
status: awaiting_human_verify
trigger: "Investigate and fix Windows GitHub Actions Tauri MSI bundling failure where WiX candle.exe exits with no diagnostic after successful Rust release build."
created: 2026-10-01
updated: 2026-10-01T02:54:41Z
---

# Debug Session: Windows WiX Candle Failure

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

- hypothesis: Tauri 2.12 MSI template renders `product_name` with Handlebars `no_escape`, so `Personal Task & Workload Planner` becomes invalid XML in `main.wxs` and WiX `candle.exe` exits.
- test: Minimize fix to only Tauri `productName`, then re-run targeted config regression, productName sanity check, build, and diff check.
- expecting: Only `productName` changes because Tauri MSI template uses `{{product_name}}`; window title and Cargo description are not the confirmed WiX XML input.
- next_action: Revert `src-tauri/Cargo.toml` description and `src-tauri/tauri.conf.json` window title, keep `productName` change and regression test, then rerun verification.
- reasoning_checkpoint:
    hypothesis: "Tauri 2.12 MSI bundling fails because `src-tauri/tauri.conf.json` sets `productName` to `Personal Task & Workload Planner`; Tauri renders `{{product_name}}` into `main.wxs` with `handlebars::no_escape`, leaving a raw `&` in XML attributes that `candle.exe` cannot parse."
    confirming_evidence:
      - "Project Tauri `productName` is `Personal Task & Workload Planner`; Cargo description and workflow release name repeat same raw `&`."
      - "Tauri `tauri-v2.12.0` MSI source inserts `product_name` from settings and calls `handlebars.register_escape_fn(handlebars::no_escape)` before writing `main.wxs`."
      - "Tauri `main.wxs` template uses `Name=\"{{product_name}}\"`, registry keys, shortcut names, and directory names directly with `{{product_name}}`."
      - "Minimal XML parser test shows raw `Name=\"Personal Task & Workload Planner\"` fails as not well-formed while `&amp;` succeeds."
    falsification_test: "If a Windows Tauri build with productName changed to `Personal Task and Workload Planner` still fails at `candle.exe` with the same `main.wxs` parse step, this hypothesis is incomplete or wrong."
    fix_rationale: "Removing `&` from MSI-facing metadata prevents raw XML special character injection into Tauri's unescaped WiX template without maintaining a copied custom WiX template."
    blind_spots: "Cannot run local Tauri/WiX build because Cargo is missing; GitHub raw job logs need admin rights, so final Windows CI validation must happen in GitHub Actions."
- tdd_checkpoint:

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

- expected: GitHub Actions Windows desktop build successfully bundles the compiled Tauri application as an MSI.
- actual: Rust release compilation succeeds, but Tauri fails during the WiX `candle.exe` packaging step.
- errors: `failed to bundle project: failed to run C:\Users\runneradmin\AppData\Local\tauri\WixTools314\candle.exe`; npm command exits with code 1. No underlying WiX diagnostic appears in supplied output.
- timeline: First observed on 2026-10-01; no known earlier occurrence supplied.
- reproduction: Every GitHub Actions run reaches `npm run tauri build -- --target x86_64-pc-windows-msvc` and fails while running WiX candle for `src-tauri/target/x86_64-pc-windows-msvc/release/wix/x64/main.wxs`.

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-10-01T02:54:41Z
  checked: GSD resume state from shared checkout debug file
  found: Active session had no evidence yet; symptoms point to Windows CI-only Tauri WiX `candle.exe` failure after Rust release build succeeds.
  implication: Start with Environment/Config common bug pattern and inspect bundler inputs before changing code.
- timestamp: 2026-10-01T02:54:41Z
  checked: Knowledge base and project skills
  found: `.planning/debug/knowledge-base.md` does not exist in worktree; no project skills exist under `.claude/skills` or `.agents/skills`.
  implication: No known-pattern shortcut or project-specific debug rule applies.
- timestamp: 2026-10-01T02:54:41Z
  checked: `package.json`
  found: Tauri dependencies are `@tauri-apps/api` `^2.2.0`, `@tauri-apps/cli` `^2.2.0`; `tauri:build` runs `tauri build`.
  implication: Tauri CLI drives bundling; inspect workflow command and `src-tauri` config next.
- timestamp: 2026-10-01T02:54:41Z
  checked: `.github/workflows/desktop-build.yml`
  found: Windows job uses `windows-latest`, Node 22, Rust stable target `x86_64-pc-windows-msvc`, and `tauri-apps/tauri-action@v0` with `args: --target x86_64-pc-windows-msvc`; no explicit Windows-only setup for WiX beyond Tauri defaults.
  implication: Failure likely comes from Tauri-generated Windows bundle inputs or runner tool behavior after compilation, not missing Rust target.
- timestamp: 2026-10-01T02:54:41Z
  checked: `src-tauri/tauri.conf.json`
  found: `productName` and window title are `Personal Task & Workload Planner`; bundle targets are `all`; Windows bundle config only sets `digestAlgorithm`.
  implication: Ampersand in product/title is a candidate invalid XML/entity character for generated WiX `.wxs`.
- timestamp: 2026-10-01T02:54:41Z
  checked: `src-tauri/Cargo.toml`, `build.rs`, `main.rs`, `lib.rs`
  found: Cargo package `description` is also `Personal Task & Workload Planner`; Rust app startup is standard Tauri builder plus notification plugin.
  implication: Two metadata fields feed bundle resources; no custom Rust code is involved in WiX packaging failure.
- timestamp: 2026-10-01T02:54:41Z
  checked: Locked Tauri versions in `package-lock.json` and `src-tauri/Cargo.lock`
  found: npm Tauri CLI/API lock to `2.12.0`; Rust `tauri` is `2.12.0`, `tauri-build` is `2.7.0`, `tauri-utils` is `2.10.0`; no generated `src-tauri/target/**/main.wxs` exists in worktree yet.
  implication: Need generated WiX source or verbose build output to confirm exact failing input.
- timestamp: 2026-10-01T02:54:41Z
  checked: Local `npm run tauri build -- --target x86_64-pc-windows-msvc --verbose`
  found: Command fails before build because `cargo metadata` cannot run: `program not found`.
  implication: Local environment lacks Rust/Cargo; cannot reproduce CI WiX failure locally without installing toolchain, so use CI logs/source inspection next.
- timestamp: 2026-10-01T02:54:41Z
  checked: `gh run list --workflow desktop-build.yml --limit 10`
  found: `gh` is not installed in this environment.
  implication: Cannot fetch GitHub Actions logs with CLI; need alternate route or source-level validation.
- timestamp: 2026-10-01T02:54:41Z
  checked: Git remote and repository search
  found: Remote is `https://github.com/quantran-epi/task-management.git`; no generated `node_modules` or `src-tauri/target` files exist; only repository metadata with `&` is Tauri product/title/Cargo description/workflow releaseName and PWA manifest name.
  implication: Need external/source research or install prerequisites to observe generated WiX.
- timestamp: 2026-10-01T02:54:41Z
  checked: Public GitHub REST workflow run listing for `desktop-build.yml`
  found: Recent completed failures are accessible; latest failed run is `36806569416` at `https://github.com/quantran-epi/task-management/actions/runs/36806569416`.
  implication: CI logs can be pulled without `gh`; inspect latest failed Windows job directly.
- timestamp: 2026-10-01T02:54:41Z
  checked: Jobs for run `36806569416`
  found: macOS job `110192119407` and Windows job `110192119670` both failed at step 7 `Build Tauri Desktop Application`.
  implication: Windows WiX failure may not be only failure; still inspect Windows job because symptom names `candle.exe`.
- timestamp: 2026-10-01T02:54:41Z
  checked: GitHub REST job log download for Windows job `110192119670`
  found: API returns `403 Forbidden` with `Must have admin rights to Repository`.
  implication: Public run metadata is accessible, but raw logs are not available from this environment; use source-level validation or browser/manual log evidence.
- timestamp: 2026-10-01T02:54:41Z
  checked: Tauri `tauri-v2.12.0` upstream MSI template/source availability
  found: `crates/tauri-bundler/src/bundle/windows/msi/main.wxs` and `mod.rs` are accessible; template has `Name="{{product_name}}"`, `Manufacturer="{{manufacturer}}"`, and source imports `handlebars::{Handlebars, html_escape, to_json}`.
  implication: Need inspect render setup because Handlebars may XML/HTML escape `&`, which would refute raw ampersand hypothesis.
- timestamp: 2026-10-01T02:54:41Z
  checked: Tauri `tauri-v2.12.0` MSI render setup
  found: `data.insert("product_name", to_json(settings.product_name()))` populates metadata, but the renderer uses `let mut handlebars = Handlebars::new(); handlebars.register_escape_fn(handlebars::no_escape);` before rendering `main.wxs`. The generated `main.wxs` is then passed to `candle.exe`.
  implication: `{{product_name}}` is not XML-escaped; project `productName` containing `&` will render as raw `&` in XML attributes.
- timestamp: 2026-10-01T02:54:41Z
  checked: Minimal XML parse behavior for WiX-like product name attribute
  found: `<Product Name="Personal Task & Workload Planner" />` fails XML parsing with `not well-formed (invalid token)`; `<Product Name="Personal Task &amp; Workload Planner" />` parses successfully.
  implication: Raw ampersand in Tauri-rendered `main.wxs` is sufficient to make `candle.exe` fail before MSI linking.
- timestamp: 2026-10-01T02:54:41Z
  checked: Targeted regression test after metadata fix
  found: `npm test -- tests/tauriConfig.test.ts` passed: 1 test file, 1 test.
  implication: `src-tauri/tauri.conf.json` `productName` no longer contains XML-special characters.
- timestamp: 2026-10-01T02:54:41Z
  checked: Scope of remaining `Personal Task & Workload Planner` occurrences
  found: Raw display name remains in planning docs, browser/PWA title, setup script, and debug evidence; Tauri desktop `productName`, window title, and Cargo description were changed.
  implication: Fix remains scoped to MSI-facing Tauri metadata; non-MSI display/docs can keep original branding.
- timestamp: 2026-10-01T02:54:41Z
  checked: Background `npm test`
  found: Full suite currently reports unrelated failures in `tests/components/TaskDrawer.test.tsx`, `tests/views/SettingsView.test.tsx`, and `tests/views/TimerAlertNavigation.test.tsx` with jsdom/Ant Design act/getComputedStyle issues; new `tests/tauriConfig.test.ts` passed earlier.
  implication: Full-suite failure does not falsify MSI metadata fix; still need build and targeted config verification.
- timestamp: 2026-10-01T02:54:41Z
  checked: `npm run build`
  found: Production web build passed (`tsc && vite build`), with existing large chunk warning only.
  implication: TypeScript and Vite build accept the metadata/test changes.
- timestamp: 2026-10-01T02:54:41Z
  checked: Re-run targeted regression and whitespace check
  found: `npm test -- tests/tauriConfig.test.ts` passed again; `git diff --check` passed; first Python metadata sanity check failed only because `/d/...` path was interpreted as `\d\...` by Windows Python.
  implication: Regression test and whitespace are clean; rerun metadata sanity check with Windows path.
- timestamp: 2026-10-01T02:54:41Z
  checked: Minimality review
  found: `window.title` and Cargo `description` are not confirmed WiX `{{product_name}}` inputs, so they were reverted to original branding; only Tauri `productName` remains changed.
  implication: Fix targets confirmed root cause with smallest repo diff.
- timestamp: 2026-10-01T02:54:41Z
  checked: Final verification after minimal fix
  found: `npm test -- tests/tauriConfig.test.ts` passed; Python sanity check confirmed `tauri.productName=OK 'Personal Task and Workload Planner'`; `npm run build` passed; `git diff --check` passed.
  implication: Self-verification passes except original Windows WiX CI build, which requires GitHub Actions environment.

## Eliminated
<!-- APPEND only - prevents re-investigating -->

## Resolution
<!-- OVERWRITE as understanding evolves -->

- root_cause: Tauri 2.12 MSI bundler renders `productName` into WiX `main.wxs` with Handlebars `no_escape`; project metadata used `Personal Task & Workload Planner`, so generated XML contains raw `&` and WiX `candle.exe` fails parsing `main.wxs`.
- fix: Changed Tauri `productName` from `Personal Task & Workload Planner` to `Personal Task and Workload Planner`; added regression test rejecting XML-special characters in Tauri `productName`.
- verification: `npm test -- tests/tauriConfig.test.ts` passed; Python sanity check confirmed `tauri.productName` has no XML-special characters; `npm run build` passed; `git diff --check` passed. Full `npm test` still has unrelated pre-existing jsdom/Ant Design failures in TaskDrawer/SettingsView/TimerAlertNavigation tests.
- files_changed:
  - src-tauri/tauri.conf.json
  - tests/tauriConfig.test.ts
