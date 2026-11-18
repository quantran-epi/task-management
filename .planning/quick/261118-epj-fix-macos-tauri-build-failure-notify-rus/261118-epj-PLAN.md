---
phase: quick-261118-epj
plan: '01'
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/src/desktop_notification.rs
autonomous: true
requirements: []
user_setup: []
must_haves:
  truths:
    - "macOS universal build compiles: notify-rust 4.18.1 `wait_for_response` accepts the click handler closure, which is `FnOnce(&NotificationResponse)` per its `ResponseHandler` blanket impl — no E0308 signature mismatch."
    - "The click-handler semantic is unchanged: `Default` and `Action(_)` responses still flip the `clicked` AtomicBool that drives window focus and the `notification-clicked` event; `Reply`/`Closed` still leave it false."
    - "No scope creep: the two `Atomic::fetch_update` deprecation warnings in `agent_manager.rs` remain untouched, no dependency changes, no source file besides `desktop_notification.rs` is edited."
  artifacts:
    - src-tauri/src/desktop_notification.rs
  key_links:
    - "Closure passed to `NotificationHandle::wait_for_response` (src-tauri/src/desktop_notification.rs:53) must satisfy `impl ResponseHandler` → blanket impl `F: FnOnce(&NotificationResponse)` (notify-rust-4.18.1/src/response.rs:127-139); macOS backend calls `handler.call(&response)` (macos/nsusernotifications.rs:73-105), confirming a borrowed argument."
    - "`matches!(response, NotificationResponse::Default | NotificationResponse::Action(_))` on `&NotificationResponse` compiles via match ergonomics (validated with standalone rustc snippet); the `clicked` flag → focus + `app.emit('notification-clicked', ...)` path stays byte-identical."
---

<objective>
Fix the macOS Tauri build failure caused by a `notify-rust` 4.18.1 API signature change: `wait_for_response` now requires a handler taking `&NotificationResponse`, while the current closure takes `NotificationResponse` by value. Change the closure parameter to a borrowed reference while preserving the exact click-detection semantic.

Purpose: `npm run tauri build -- --target universal-apple-darwin` fails at `src-tauri/src/desktop_notification.rs:53` with "expected `for<'a> fn(&'a NotificationResponse) -> _`, found `fn(NotificationResponse) -> _`". This is a compile-time-only mismatch; the crate's `ResponseHandler` blanket impl and macOS backend both confirm a reference is required. Minimal one-line fix, no behavior change.

Output: one plan, one auto task, edit confined to `src-tauri/src/desktop_notification.rs`; no dependency changes, no source edits by the planner.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@src-tauri/src/desktop_notification.rs
</context>

<read_first>
- `src-tauri/src/desktop_notification.rs` — whole file (75 lines). The only change is the closure passed to `handle.wait_for_response` at line 53: its parameter must become a borrowed reference; the `matches!` body and the `clicked` → focus/emit path stay unchanged.
- `~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/notify-rust-4.18.1/src/response.rs:127-139` — `pub trait ResponseHandler { fn call(self, response: &NotificationResponse); }` with blanket impl for `F: FnOnce(&NotificationResponse)`. This is why a by-value closure is rejected.
- `~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/notify-rust-4.18.1/src/macos/nsusernotifications.rs:73-105` — `wait_for_response(handler: impl ResponseHandler)` calls `handler.call(&response)`; confirms borrowed argument on the failing macOS target.
- Baseline verified at planning time: a standalone `rustc --edition 2021` snippet taking `|response: &NotificationResponse|` and matching `NotificationResponse::Default | NotificationResponse::Action(_)` compiled and ran successfully (printed `PATTERN_OK`). The two `Atomic::fetch_update` deprecation warnings at `agent_manager.rs:981,1104` are warning-only and out of scope.
</read_first>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Borrow the notification response in the click-handler closure</name>
  <files>src-tauri/src/desktop_notification.rs</files>
  <action>
    Single-file compile fix. In `src-tauri/src/desktop_notification.rs`, change the closure passed to `wait_for_response` so its parameter is a borrowed `&NotificationResponse` reference instead of an owned value — write the parameter type annotation explicitly (`response: &NotificationResponse`) so the required `FnOnce(&NotificationResponse)` shape is unambiguous to the compiler and to future readers.

    Preserve everything else byte-for-byte:
    - The `matches!` body must keep testing `NotificationResponse::Default | NotificationResponse::Action(_)`. Match ergonomics lets this same pattern match against the reference; no dereference, no `ref`, no destructuring rewrite is needed (a standalone rustc check confirmed it compiles). Do NOT restructure the match into `if let`, do NOT clone or dereference the response.
    - The `clicked_in_handler.store(true, Ordering::SeqCst)` call, the `clicked.load(...)` guard, the window `show()`/`set_focus()`, and the `app.emit("notification-clicked", NotificationClickedPayload { route })` call stay unchanged.

    Do NOT touch the two `Atomic::fetch_update` deprecation warnings in `src-tauri/src/agent_manager.rs` — they are warnings only and expanding scope is forbidden. Do NOT change `Cargo.toml`, `Cargo.lock`, or any dependency. Do NOT edit any other source file.

    Note: on macOS `wait_for_response` requires the main run loop to be pumping (see crate docs); that runtime consideration is pre-existing and not part of this compile fix — leave it alone.
  </action>
  <verify>
    <automated>set -o pipefail
echo '=== borrowed reference signature present ==='
rg -n -F '|response: &NotificationResponse|' src-tauri/src/desktop_notification.rs
echo '=== click semantic preserved ==='
rg -n -F 'NotificationResponse::Default | NotificationResponse::Action(_)' src-tauri/src/desktop_notification.rs
echo '=== old by-value closure signature absent ==='
! rg -q -F 'wait_for_response(|response|' src-tauri/src/desktop_notification.rs
echo '=== cargo check (may be sandbox-blocked on crate download) ==='
if cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | tail -25; then
  echo CARGO_CHECK_OK
else
  echo 'CARGO_CHECK_INCONCLUSIVE — sandbox may have blocked crate download (bit-vec v0.8.0); validating the pattern with a standalone rustc mock enum'
  work=$(mktemp -d /tmp/notify-verify.XXXXXX)
  printf '%s\n' 'enum NotificationResponse { Default, Action(String), Reply(String), Closed }' 'fn check<F: FnOnce(&NotificationResponse)>(f: F) { f(&NotificationResponse::Default); }' 'fn main() { let mut hit = false; check(|response: &NotificationResponse| { if matches!(response, NotificationResponse::Default | NotificationResponse::Action(_)) { hit = true; } }); assert!(hit); println!("RUSTC_PATTERN_OK"); }' > "$work/check.rs"
  rustc --edition 2021 "$work/check.rs" -o "$work/check" 2>&1 && "$work/check"
  rc=$?
  rm -rf "$work"
  exit $rc
fi</automated>
  </verify>
  <done>`desktop_notification.rs` compiles under notify-rust 4.18.1: the handler closure takes `&NotificationResponse`, the `Default | Action(_)` click test is unchanged, the focus/emit path is untouched, and no other file or dependency changed. `cargo check` passes, or (if the sandbox blocks crate download) the standalone rustc pattern check prints `RUSTC_PATTERN_OK` and the block is logged as inconclusive for the full crate build.</done>
</task>

</tasks>

<threat_model>
| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-quick-01 | Functional regression | Click handler in `desktop_notification.rs` | low | mitigate | Keep the `Default | Action(_)` test and the `clicked` → focus/emit path byte-identical; pin both with `rg` gates; change only the closure parameter type. |
| T-quick-SC | Tampering | cargo installs | high | mitigate | No dependency changes; fix confined to one file, no `Cargo.toml`/`Cargo.lock` edit (verified by the single-file `files_modified` scope). |
</threat_model>

<verification>
Run from checkout root. `cargo check --manifest-path src-tauri/Cargo.toml` is authoritative; if the sandbox blocks crate download (observed: bit-vec v0.8.0), the verify command logs the block clearly and falls back to a standalone rustc snippet that validates the exact reference + `matches!` pattern. The real CI gate remains `npm run tauri build -- --target universal-apple-darwin`, which cannot run in this Linux sandbox — record that as an owner-side confirmation item, not something to fake locally.

Do NOT run the full vitest suite (project rule: >1 hour). This is a Rust-only change with no JS/TS surface.
</verification>

<success_criteria>
- `src-tauri/src/desktop_notification.rs` passes `cargo check` (or the reference pattern is validated via the rustc fallback with the crate-build block logged).
- The click-handler semantic is preserved: `Default`/`Action` still trigger focus + `notification-clicked` event; other responses do not.
- Exactly one source file changed; no dependency changes; `agent_manager.rs` warnings untouched; no PWA/GitHub Pages work.
</success_criteria>

<output>
Create `.planning/quick/261118-epj-fix-macos-tauri-build-failure-notify-rus/261118-epj-SUMMARY.md` when done
</output>
