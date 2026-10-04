---
phase: quick
plan: 261004-hbt
type: execute
wave: 1
depends_on: []
files_modified:
  - tests/shell.test.tsx
autonomous: true
requirements:
  - SHELL-TEST-HEADER
must_haves:
  truths:
    - "tests/shell.test.tsx passes cleanly when asserting ProjectsView title"
  artifacts:
    - path: "tests/shell.test.tsx"
      provides: "Updated ProjectsView header assertion matching 'Dự án & Cột mốc'"
  key_links:
    - from: "tests/shell.test.tsx"
      to: "src/views/ProjectsView.tsx"
      via: "screen.getByText('Dự án & Cột mốc')"
---

<objective>
Update project view header title assertion in `tests/shell.test.tsx` to match `src/views/ProjectsView.tsx` (`Dự án & Cột mốc`).

Purpose: Resolve broken test expectation caused by PageHeader normalization across views.
Output: Updated `tests/shell.test.tsx`.
</objective>

<execution_context>
@tests/shell.test.tsx
@src/views/ProjectsView.tsx
</execution_context>

<context>
In `src/views/ProjectsView.tsx`, the PageHeader title is `"Dự án & Cột mốc"`.
In `tests/shell.test.tsx` line 89, the test currently expects obsolete text `'Phân cấp công việc'`:
```tsx
    await waitFor(() => {
      expect(screen.getByText('Phân cấp công việc')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Dự án mới/i })).toBeInTheDocument();
    });
```
Updating this string to `'Dự án & Cột mốc'` allows the test suite to pass.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update ProjectsView header assertion in shell.test.tsx</name>
  <files>tests/shell.test.tsx</files>
  <action>
    In `tests/shell.test.tsx` within the test 'updates view when hash route changes to projects', update `screen.getByText('Phân cấp công việc')` to `screen.getByText('Dự án & Cột mốc')`.
  </action>
  <verify>
    <automated>npx vitest run tests/shell.test.tsx</automated>
  </verify>
  <done>
    `tests/shell.test.tsx` runs without failures and verifies `Dự án & Cột mốc` is present in the DOM when navigating to `#/projects`.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| None | Test file update only, no production boundary change |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-Q-01 | Tampering | tests/shell.test.tsx | accept | Test assertion aligns strictly with production title |
</threat_model>

<verification>
Run `npx vitest run tests/shell.test.tsx` to ensure all tests pass.
</verification>

<success_criteria>
`tests/shell.test.tsx` passes with 0 failures.
</success_criteria>

<output>
Create `.planning/quick/261004-hbt-fix-shell-test-tsx-project-view-header-t/261004-hbt-SUMMARY.md` when execution completes.
</output>
