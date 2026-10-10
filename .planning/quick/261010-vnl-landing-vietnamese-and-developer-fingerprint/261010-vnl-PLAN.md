---
phase: quick
plan: 261010-vnl
type: execute
wave: 1
depends_on: []
files_modified:
  - landing/index.html
autonomous: true
requirements:
  - LANDING-VIETNAMESE-I18N
  - LANDING-DEVELOPER-FINGERPRINT
must_haves:
  truths:
    - "Landing page supports dynamic Vietnamese (VI) and English (EN) language switching"
    - "Language toggle button in navbar switches between EN and VI with localStorage persistence ('taskmate-lang')"
    - "All page sections (nav, hero, features, privacy, download, preview, footer) update text smoothly when toggled"
    - "Developer fingerprint 'Quan Tran Duc, SHB TTPT Core Team' is prominently and elegantly displayed on the landing page (footer fingerprint badge and hero developer credit)"
    - "Interactive preview updates its tabs, tasks, views, and metrics in sync with the selected language"
    - "Zero external dependencies added, fully offline, preserving theme toggle and responsive layout"
  artifacts:
    - path: "landing/index.html"
      provides: "Landing page with Vietnamese i18n support and Quan Tran Duc (SHB TTPT Core Team) developer fingerprint"
  key_links:
    - from: "landing/index.html lang-toggle"
      to: "TRANSLATIONS dictionary & localStorage"
      via: "setLanguage() function switching DOM content and refreshing preview"
    - from: "landing/index.html footer"
      to: "developer fingerprint card"
      via: "styled fingerprint badge showcasing Quan Tran Duc, SHB TTPT Core Team"
---

<objective>
Implement seamless Vietnamese language support (with an EN/VI toggle button in the navigation bar) and embed the official developer fingerprint for "Quan Tran Duc, SHB TTPT Core Team" on the TaskMate landing page (`landing/index.html`).
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<tasks>
<task id="1" name="Implement Vietnamese translation dictionary and i18n switcher">
Add full bilingual (EN/VI) translations dictionary covering metadata, nav, hero, features, privacy, download, footer, and interactive app preview views. Add an intuitive EN/VI toggle in the navigation bar with `localStorage` persistence and automatic initialization.
</task>

<task id="2" name="Integrate developer fingerprint for Quan Tran Duc, SHB TTPT Core Team">
Embed a polished developer fingerprint element in the landing page footer and hero meta displaying "Quan Tran Duc" and "SHB TTPT Core Team", complete with biometric/fingerprint icon, badge styling, glassmorphism surface, and dual-language labels.
</task>

<task id="3" name="Test and verify all interactions in both languages">
Verify that language toggle switches all text without layout breakage, theme toggle works simultaneously, preview app recalculations and tabs reflect Vietnamese or English correctly, and fingerprint displays impeccably in dark and light themes.
</task>
</tasks>
