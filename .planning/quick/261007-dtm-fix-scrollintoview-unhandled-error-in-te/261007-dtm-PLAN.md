---
phase: quick
plan: 261007-dtm
type: execute
wave: 1
depends_on: []
files_modified:
  - tests/setup.ts
autonomous: true
requirements:
  - QUICK-FIX-SCROLLINTOVIEW

estimate:
  tokens: 5000
  raw_tokens: 3000
  tasks: 1
  confidence: high

must_haves:
  truths:
    - "Element.prototype.scrollIntoView is polyfilled in Vitest JSDOM environment"
    - "Vitest tests importing Ant Design mentions dropdown execute without unhandled scrollIntoView TypeError"
  artifacts:
    - path: "tests/setup.ts"
      provides: "Global JSDOM scrollIntoView shim"
  key_links:
    - from: "tests/setup.ts"
      to: "Element.prototype.scrollIntoView"
      via: "prototype shim function"
---

<objective>
Shim Element.prototype.scrollIntoView in tests/setup.ts to prevent unhandled TypeError: activeItem.scrollIntoView is not a function in Vitest JSDOM test runs.

Purpose:
JSDOM does not implement Element.prototype.scrollIntoView. Ant Design mentions (@rc-component/mentions/lib/DropdownMenu.js) and other UI components invoke scrollIntoView when highlighting or navigating dropdown options, which throws an unhandled error in tests. Providing a global shim in tests/setup.ts resolves this issue across all Vitest suites.

Output:
- tests/setup.ts updated with global scrollIntoView shim on Element.prototype.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@tests/setup.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Shim Element.prototype.scrollIntoView in tests/setup.ts</name>
  <files>tests/setup.ts</files>
  <action>
    Add a global shim for scrollIntoView in tests/setup.ts:
    Ensure Element.prototype.scrollIntoView and window.Element.prototype.scrollIntoView (when defined in DOM environment) are stubbed to a no-op function or vi.fn() if not already implemented.
    Guard with typeof checks (e.g. `typeof Element !== 'undefined' && !Element.prototype.scrollIntoView` and `typeof window !== 'undefined' && window.Element && !window.Element.prototype.scrollIntoView`).
    Verify that components calling scrollIntoView (such as @rc-component/mentions dropdown menu in ChatInputBar) run cleanly in Vitest without unhandled error warnings.
  </action>
  <verify>
    <automated>npx vitest run tests/ai/ChatInputBar.test.tsx</automated>
  </verify>
  <done>
    Element.prototype.scrollIntoView is safely defined in JSDOM setup and npx vitest run tests/ai/ChatInputBar.test.tsx passes without unhandled scrollIntoView TypeError.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| local test runner | JSDOM global prototype polyfills in test environment |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-quick-01 | Tampering | tests/setup.ts | low | mitigate | Guard prototype assignment with typeof checks so shim only applies in test environment when not already present |
| T-quick-SC | Tampering | npm/pip/cargo installs | high | mitigate | package-legitimacy gate + blocking human checkpoint for [ASSUMED]/[SUS] |
</threat_model>

<verification>
Automated verification:
- `npx vitest run tests/ai/ChatInputBar.test.tsx`
</verification>

<success_criteria>
Element.prototype.scrollIntoView is defined in tests/setup.ts and tests/ai/ChatInputBar.test.tsx passes without unhandled scrollIntoView TypeError.
</success_criteria>

<output>
Create `.planning/quick/261007-dtm-fix-scrollintoview-unhandled-error-in-te/261007-dtm-SUMMARY.md` when done
</output>
