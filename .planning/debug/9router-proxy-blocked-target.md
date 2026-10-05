---
status: awaiting_human_verify
trigger: "9Router test connection request through Tauri proxy returns \"Blocked AI proxy target\" for GET http://10.4.97.70:30129/v1/models with Authorization header. Inspect root cause and fix."
created: 2026-10-05
updated: 2026-10-05
---

# Debug Session: 9Router Proxy Blocked Target

## Symptoms

- expected: Test connection sends `GET http://10.4.97.70:30129/v1/models` through local Tauri AI proxy and receives 9Router response.
- actual: Local proxy rejects request with `Blocked AI proxy target`.
- errors: `Blocked AI proxy target` for request `{"method":"GET","url":"http://10.4.97.70:30129/v1/models","headers":{"Accept":"application/json","Authorization":"Bearer sk-xxxx"}}`.
- timeline: Local 9Router endpoint works directly because no CORS issue. Remote-service 9Router endpoint is browser-CORS blocked, motivating local AI proxy; proxy path has this rejection.
- reproduction: Configure 9Router with remote service URL `http://10.4.97.70:30129`, then run Test connection.

## Current Focus

- hypothesis: Confirmed. Tauri AI proxy allowed HTTP only for loopback hosts, rejecting authorized RFC1918 9Router endpoints before dispatch.
- test: Allow private IPv4 HTTP `/v1/*` targets while retaining public HTTP and non-`/v1/*` rejection.
- expecting: `http://10.4.97.70:30129/v1/models` passes target validation.
- next_action: Restart Tauri app and verify Test connection against remote 9Router service.
- reasoning_checkpoint:
  hypothesis: "HTTP validation hard-coded only localhost, 127.0.0.1, and ::1."
  confirming_evidence:
    - "`is_allowed_ai_target()` returned false for every private LAN address."
    - "Rejection happened before `reqwest` dispatch at `ai_proxy_request()`."
    - "Provided endpoint 10.4.97.70 belongs to RFC1918 10/8 range."
  falsification_test: "Target-validation test covers 10/8, 172.16/12, 192.168/16, public HTTP, and path restrictions."
  fix_rationale: "Permit private IPv4 HTTP services needed for LAN 9Router while retaining public cleartext and path restrictions."
  blind_spots: "Rust test could not run because cargo is unavailable; live Tauri verification remains."
- tdd_checkpoint:

## Evidence

- timestamp: 2026-10-05T10:17:00+07:00
  checked: `src-tauri/src/ai_proxy.rs` target validation
  found: HTTP hosts were limited to `localhost`, `127.0.0.1`, and `::1`.
  implication: `10.4.97.70` always produces `Blocked AI proxy target`.
- timestamp: 2026-10-05T10:18:00+07:00
  checked: Targeted TypeScript 9Router client tests
  found: 1 file and 9 tests passed.
  implication: Existing client request behavior remains valid.
- timestamp: 2026-10-05T10:18:00+07:00
  checked: Rust test availability
  found: `cargo unavailable`.
  implication: Rust assertions require local toolchain or CI verification.

## Eliminated

- hypothesis: Authorization header filtering caused rejection.
  evidence: Target validation returns error before headers are forwarded.
  timestamp: 2026-10-05T10:17:00+07:00
- hypothesis: `/v1/models` path was blocked.
  evidence: Path begins with allowed `/v1/` prefix.
  timestamp: 2026-10-05T10:17:00+07:00

## Resolution

- root_cause: `is_allowed_ai_target()` allowed HTTP only for loopback hosts, so RFC1918 endpoint `10.4.97.70` was rejected before network dispatch.
- fix: Allow IPv4 loopback and private ranges for HTTP while retaining HTTPS support, `/v1/*` restriction, and public HTTP rejection.
- verification: Targeted TypeScript suite passed: 9 tests. Rust tests not run because cargo is unavailable. Live Tauri verification pending.
- files_changed:
  - src-tauri/src/ai_proxy.rs
