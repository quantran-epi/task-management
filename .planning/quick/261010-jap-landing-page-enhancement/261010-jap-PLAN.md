---
phase: quick
plan: 261010-jap
type: execute
wave: 1
depends_on: []
files_modified:
  - landing/index.html
autonomous: true
requirements:
  - LANDING-ENHANCEMENT
must_haves:
  truths:
    - "Landing page features animated mesh gradient aura and glassmorphism styling across nav, cards, and preview window"
    - "Theme toggle button in header switches between light and dark themes smoothly with localStorage persistence"
    - "App preview window is interactive: switching sidebar tabs displays corresponding app views and state"
    - "Task checklist in preview allows checking/unchecking items with live recalculation of planned hours and animated capacity bar"
    - "Cards and sections animate into view with smooth scroll reveals and mouse-movement ambient highlights"
    - "Works completely offline with zero runtime dependencies and preserves Mac vs Windows OS download detection"
  artifacts:
    - path: "landing/index.html"
      provides: "Enhanced standalone landing page with modern glassmorphism, theme toggle, and interactive preview"
  key_links:
    - from: "landing/index.html theme-toggle button"
      to: "document.documentElement[data-theme]"
      via: "click event listener syncing theme to localStorage"
    - from: "landing/index.html preview tasks"
      to: "landing/index.html capacity progress bar"
      via: "live calculation of planned hours on task toggle"
---

<objective>
Transform the TaskMate landing page (`landing/index.html`) into an exceptionally polished, lively, modern web experience with ambient animated mesh gradients, glassmorphism UI surfaces, an explicit dark/light mode toggle with persistence, an interactive live app preview (nav tabs, reactive task checklist, live capacity calculation), and smooth micro-interactions while remaining 100% standalone and zero-dependency.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@landing/index.html
</context>

<tasks>

<task type="auto">
  <name>Task 1: Overhaul visual system with animated mesh aura, glassmorphism, theme toggle, and micro-animations</name>
  <files>landing/index.html</files>
  <action>
    Refactor CSS and header layout in `landing/index.html`:
    - Add ambient mesh gradient system: floating soft glow orbs (`.ambient-mesh`, `.glow-orb-1`, `.glow-orb-2`) with subtle `@keyframes float` or `pulse` that gently shift colors (indigo, violet, cyan/emerald tints) behind the content.
    - Implement a unified glassmorphism surface hierarchy:
      - Frosted glass navigation bar (`backdrop-filter: blur(16px)`, translucent border `rgba(255,255,255,0.12)`, subtle shadow).
      - Elevated cards (`.preview-window`, `.feature-card`, `.privacy-card`) with glass backdrop-filter, gradient borders, and smooth hover lift with subtle colored glow rings.
      - Shimmering badge effect for "Free & Open Source" / "Local-First".
    - Add an interactive dark/light Theme Toggle button in the nav:
      - Include Sun/Moon SVG icons with rotating transition.
      - Read theme preference on load from `localStorage.getItem('taskmate-theme')` or fallback to `prefers-color-scheme`.
      - Toggle `data-theme="dark"` / `data-theme="light"` on `document.documentElement` and persist choice.
    - Enhance button styles: dynamic hover glow reflection, active press feedback, and clean focus rings.
    - Ensure complete accessibility and respect for `@media (prefers-reduced-motion: reduce)`.
  </action>
  <verify>
    <automated>grep -q 'theme-toggle' landing/index.html && grep -q 'backdrop-filter' landing/index.html && grep -q 'ambient-mesh' landing/index.html</automated>
  </verify>
  <done>Landing page features ambient mesh gradients, glassmorphic styling across all components, and a working dark/light theme toggle.</done>
</task>

<task type="auto">
  <name>Task 2: Build interactive app preview with reactive state, view switching, and scroll animations</name>
  <files>landing/index.html</files>
  <action>
    Upgrade the App Preview section and page scripts in `landing/index.html`:
    - Make the preview window interactive:
      - Sidebar Navigation: Support clicking tabs (Dashboard, Tasks, Planner, Projects, Analytics, Docs). Clicking a tab updates active state and renders corresponding preview content or updates the active preview panel with a smooth cross-fade animation.
      - Live Task Checklist in Dashboard:
        - Make task items clickable checkboxes (`.preview-task`).
        - Toggling a task recalculates completed/remaining count, updates total planned hours (e.g. 5.5h / 8.0h dynamically), and smoothly updates the progress bar fill width and percentage text.
        - Add a quick inline interactive feature (e.g. clickable filter pill or quick sample task adder) to let visitors immediately test the "feel" of TaskMate's capacity distribution.
      - Spotlight mouse tracking effect: Add pointer-tracking subtle radial spotlight on `.preview-window` and feature cards (`--mouse-x`, `--mouse-y` CSS custom properties).
    - Add smooth scroll entrance animations using `IntersectionObserver`:
      - Reveal cards and sections with a clean staggered `fade-up` transition when scrolled into view.
    - Preserve and polish OS detection (macOS vs Windows) for CTA download buttons and smooth anchor scrolling.
    - Keep code 100% vanilla JavaScript, safe DOM manipulations without innerHTML injection risks, and zero external runtime dependencies.
  </action>
  <verify>
    <automated>grep -q 'IntersectionObserver' landing/index.html && grep -q 'preview-nav-item' landing/index.html && grep -q 'calcCapacity' landing/index.html</automated>
  </verify>
  <done>App preview is fully interactive with responsive tab switching, live task checking with capacity calculation, mouse spotlight, and scroll reveal animations.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Client DOM rendering | Static landing page running in browser without backend |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-QUICK-01 | Tampering | landing/index.html DOM manipulation | mitigate | Use safe DOM properties (textContent, classList, data attributes); no unescaped innerHTML from untrusted inputs |
| T-QUICK-02 | Information Disclosure | localStorage theme preference | accept | Theme toggle stores only non-sensitive preference string ('light' or 'dark') |
| T-QUICK-SC | Tampering | External libraries | mitigate | Zero external npm or CDN script dependencies; 100% standalone vanilla HTML/CSS/JS |
</threat_model>

<verification>
Verify landing/index.html:
- Standalone HTML valid and openable in any browser.
- Dark and light mode toggle cleanly switches colors without layout shift.
- App preview tabs switch content and checklist recalculates planned hours.
- Responsive across mobile, tablet, and desktop breakpoints.
</verification>

<success_criteria>
TaskMate landing page is modern, fancy, beautiful, and animative with interactive app preview, glassmorphism mesh styling, theme toggle, and smooth vanilla animations.
</success_criteria>

<output>
Create `.planning/quick/261010-jap-landing-page-enhancement/261010-jap-SUMMARY.md` when execution completes.
</output>
