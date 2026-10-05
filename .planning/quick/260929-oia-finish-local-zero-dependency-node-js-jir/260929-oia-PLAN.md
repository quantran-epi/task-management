---
phase: quick
plan: 260929-oia
type: execute
wave: 1
depends_on: []
files_modified:
  - proxy/jira-proxy.mjs
  - proxy/jira-proxy.test.mjs
  - proxy/README.md
  - package.json
autonomous: true
requirements:
  - JIRA-PROXY-ZERO-DEPENDENCY
  - JIRA-PROXY-RUNNABLE-TEST
  - JIRA-PROXY-USAGE-DOCS

estimate:
  tokens: 18000
  raw_tokens: 18000
  tasks: 2
  confidence: low

must_haves:
  truths:
    - "Local Jira CORS proxy runs with Node.js only and no new npm packages."
    - "Proxy binds to localhost, forwards only allowed Atlassian HTTPS targets, and returns CORS headers for browser use."
    - "Package scripts provide one-command proxy start and proxy test execution."
    - "Usage docs explain start command, custom port, app CORS Proxy URL, and token/passphrase safety."
    - "Runnable Node test covers health, preflight, target validation, and one forwarded request without external network access."
  artifacts:
    - path: "proxy/jira-proxy.mjs"
      provides: "Zero-dependency local Jira CORS proxy executable"
    - path: "proxy/jira-proxy.test.mjs"
      provides: "Node built-in test suite for proxy behavior"
    - path: "proxy/README.md"
      provides: "Concise local usage instructions"
    - path: "package.json"
      provides: "jira:proxy and test:jira-proxy npm scripts"
  key_links:
    - from: "package.json"
      to: "proxy/jira-proxy.mjs"
      via: "jira:proxy script starts the executable proxy"
    - from: "package.json"
      to: "proxy/jira-proxy.test.mjs"
      via: "test:jira-proxy script runs Node built-in tests"
    - from: "proxy/jira-proxy.test.mjs"
      to: "proxy/jira-proxy.mjs"
      via: "imports exported server factory/helpers and exercises real HTTP requests against localhost"
---

<objective>
Finish the local zero-dependency Node.js Jira CORS proxy.

Purpose: Let the GitHub Pages app reach Jira Cloud during local personal use without adding a backend service or npm proxy dependency.
Output: Hardened proxy implementation, package scripts, concise usage docs, and a small runnable test.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@CLAUDE.md
@package.json
@proxy/jira-proxy.mjs
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: Validate and harden Jira proxy with a runnable Node test</name>
  <files>proxy/jira-proxy.mjs, proxy/jira-proxy.test.mjs</files>
  <behavior>
    - Health request to `/health` returns 200 JSON with `status: "ok"` and `Access-Control-Allow-Origin: *`.
    - OPTIONS preflight returns 204 with allowed methods and headers for Jira REST calls.
    - Requests missing `/proxy?url=` return 400 JSON.
    - Non-Atlassian or non-HTTPS targets return 403 JSON and do not call upstream fetch.
    - Allowed `https://*.atlassian.net/...` request calls injected fetch once, forwards method/body/Authorization, strips browser origin/referer/host-style headers, and relays upstream status/body plus local CORS headers.
  </behavior>
  <action>Refactor `proxy/jira-proxy.mjs` only as needed to be testable while preserving CLI behavior: keep executable shebang, keep `server.listen(..., '127.0.0.1')` for local-only binding, export a server factory and target validation helper, and start listening only when the file is run directly. Keep implementation zero-dependency using Node built-ins and global `fetch`; do not add npm packages. Enforce Atlassian target safety at the proxy boundary: require valid URL, `https:` protocol, and host equal to or ending with `.atlassian.net` or `.atlassian.com`. Preserve request forwarding for Jira methods and response CORS behavior. Add `proxy/jira-proxy.test.mjs` using `node:test`, `node:assert/strict`, and local ephemeral HTTP listeners; tests must not call real Jira or any external network.</action>
  <verify>
    <automated>node --test proxy/jira-proxy.test.mjs</automated>
  </verify>
  <done>`node --test proxy/jira-proxy.test.mjs` passes and proves the proxy path works end-to-end against a local test server/fetch stub without external network.</done>
</task>

<task type="auto">
  <name>Task 2: Add npm scripts, usage docs, and final checks</name>
  <files>package.json, proxy/README.md</files>
  <action>Add `jira:proxy` script that runs `node proxy/jira-proxy.mjs` and `test:jira-proxy` script that runs `node --test proxy/jira-proxy.test.mjs`. Create concise `proxy/README.md` covering start command, custom `PORT`, app setting value `http://localhost:3001/proxy?url=`, localhost-only scope, allowed Atlassian targets, and safety note that Jira tokens stay user-entered at runtime and must not be written to `.env`, source, config, docs, or committed files. Do not modify dependency lists or package lock files because this proxy is zero-dependency.</action>
  <verify>
    <automated>npm run test:jira-proxy && npm test && npm run build</automated>
  </verify>
  <done>`npm run test:jira-proxy`, `npm test`, and `npm run build` pass; `npm run jira:proxy` starts the local proxy command; docs show the exact app CORS Proxy URL and no secret persistence instructions.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Browser app → local proxy | Untrusted URL parameter and headers enter localhost Node process. |
| Local proxy → Jira Cloud | User credentials and request body leave local machine for allowed Atlassian HTTPS hosts only. |
| Docs/package scripts → user shell | User copies commands and proxy URL into local environment. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-quick-260929-oia-01 | Tampering | proxy/jira-proxy.mjs target URL handling | high | mitigate | Validate URL parsing, require HTTPS, and allow only exact/suffix Atlassian hostnames before calling upstream fetch; test rejects disallowed targets. |
| T-quick-260929-oia-02 | Information Disclosure | proxy/jira-proxy.mjs forwarded headers | medium | mitigate | Strip browser origin/referer/host-style hop headers while preserving Authorization for Jira; tests assert stripped headers are absent from injected fetch call. |
| T-quick-260929-oia-03 | Elevation of Privilege | proxy/jira-proxy.mjs listener binding | medium | mitigate | Bind server to `127.0.0.1` only so proxy is local to the personal machine. |
| T-quick-260929-oia-04 | Information Disclosure | proxy/README.md | medium | mitigate | Document runtime-only Jira credentials and explicitly forbid secrets in `.env`, source, config, docs, or committed files. |
| T-quick-260929-oia-05 | Denial of Service | proxy/jira-proxy.mjs request processing | low | accept | Local-only personal tool; 30s upstream timeout limits hung Jira requests, broader rate limiting is unnecessary for this localhost helper. |
| T-quick-260929-oia-SC | Tampering | npm installs | high | mitigate | No package-manager install task exists and no new dependencies are allowed. |
</threat_model>

<source_audit>
SOURCE | ID | Feature/Requirement | Plan | Status | Notes
--- | --- | --- | --- | --- | ---
GOAL | quick-description | Finish local zero-dependency Node.js Jira CORS proxy: validate implementation, add package script and concise usage documentation, add a small runnable test, run checks, commit changes, do not push | 260929-oia | COVERED | Both tasks cover implementation validation, scripts, docs, tests, and checks; quick workflow handles commits and no push is planned.
REQ | JIRA-PROXY-ZERO-DEPENDENCY | Local proxy remains Node-only with no new npm packages | 260929-oia | COVERED | Task 1 and Task 2 forbid dependency changes.
REQ | JIRA-PROXY-RUNNABLE-TEST | Small runnable proxy test exists and runs from package script | 260929-oia | COVERED | Task 1 creates Node test; Task 2 adds `test:jira-proxy`.
REQ | JIRA-PROXY-USAGE-DOCS | Concise usage docs and start script exist | 260929-oia | COVERED | Task 2 adds script and `proxy/README.md`.
RESEARCH | none | No research phase requested | 260929-oia | COVERED | Level 0: uses existing Node built-ins and app constraints.
CONTEXT | none | No quick CONTEXT decisions provided | 260929-oia | COVERED | No locked decisions to cite.
</source_audit>

<verification>
- `node --test proxy/jira-proxy.test.mjs` passes.
- `npm run test:jira-proxy` passes.
- `npm test` passes.
- `npm run build` passes.
- `git status --short` shows only requested proxy/script/doc/test and GSD planning artifacts before commit; do not push.
</verification>

<success_criteria>
- Proxy can be started with `npm run jira:proxy` and listens on localhost.
- App CORS Proxy URL is documented as `http://localhost:3001/proxy?url=`.
- Tests cover proxy health, CORS preflight, URL validation, disallowed target rejection, and allowed Atlassian forwarding without external network.
- No dependency added and no secrets are introduced.
- Quick workflow commits changes and leaves pushing to the user.
</success_criteria>

<output>
Create `.planning/quick/260929-oia-finish-local-zero-dependency-node-js-jir/260929-oia-SUMMARY.md` when done.
</output>
