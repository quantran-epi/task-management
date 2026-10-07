---
phase: quick
plan: 261007-tmr
type: execute
wave: 1
depends_on: []
files_modified:
  - .github/workflows/desktop-build.yml
  - .github/workflows/deploy.yml
  - src-tauri/tauri.conf.json
  - landing/index.html
autonomous: true
requirements:
  - ROUTE-DESKTOP-RELEASES-TO-TASKMATE
  - DISABLE-PWA-PAGES-DEPLOY
  - RENAME-PRODUCT-TO-TASKMATE
  - CREATE-STANDALONE-LANDING-PAGE

estimate:
  tokens: 6000
  raw_tokens: 4000
  tasks: 4
  confidence: high

must_haves:
  truths:
    - "desktop-build.yml uses PUBLIC_REPO_TOKEN and publishes releases to quantran-epi/taskmate"
    - "deploy.yml is disabled so PWA web code is not deployed to GitHub Pages"
    - "tauri.conf.json names product TaskMate"
    - "landing/index.html is a standalone beautiful responsive landing page for TaskMate with Mac and Windows download links"
---

<objective>
Configure desktop releases to publish to public repo quantran-epi/taskmate, disable PWA deployment, update Tauri app name to TaskMate, and create a standalone landing page ready to push to taskmate repo.
</objective>

<tasks>
<task type="auto">
  <name>Task 1: Update desktop-build.yml for taskmate repo releases</name>
  <files>.github/workflows/desktop-build.yml</files>
  <action>
    Update tauri-action in desktop-build.yml:
    - owner: quantran-epi
    - repo: taskmate
    - GITHUB_TOKEN: ${{ secrets.PUBLIC_REPO_TOKEN }}
    - releaseName: TaskMate v__VERSION__
    - releaseDraft: false
  </action>
</task>
<task type="auto">
  <name>Task 2: Disable PWA deployment to GitHub Pages</name>
  <files>.github/workflows/deploy.yml</files>
  <action>
    Remove or disable deploy.yml by removing it from git tracking or deleting file so PWA does not build/deploy to Pages.
  </action>
</task>
<task type="auto">
  <name>Task 3: Update Tauri config to TaskMate</name>
  <files>src-tauri/tauri.conf.json</files>
  <action>
    Update productName to TaskMate and window title to TaskMate.
  </action>
</task>
<task type="auto">
  <name>Task 4: Create standalone landing page</name>
  <files>landing/index.html</files>
  <action>
    Build high-quality standalone landing page in landing/index.html:
    - Pure HTML/CSS/minimal JS (zero dependencies)
    - Dark/Light modern theme matching indigo/slate palette
    - Hero with tagline, feature badges, screenshot mockup
    - Dynamic OS detection (Mac vs Windows) to highlight primary download button
    - Download links pointing to quantran-epi/taskmate releases
    - Core features: Workload Forecasting, Offline-First & 100% Private, Daily Capacity Planner, Jira Sync, Ghost Dev AI.
  </action>
</task>
</tasks>
