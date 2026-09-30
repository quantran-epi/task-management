---
phase: quick
plan: 260930-ugc
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
  - vite.config.ts
  - scripts/setup-desktop.sh
  - src-tauri/Cargo.toml
  - src-tauri/build.rs
  - src-tauri/src/main.rs
  - src-tauri/src/lib.rs
  - src-tauri/tauri.conf.json
  - src-tauri/capabilities/default.json
  - .github/workflows/desktop-build.yml
autonomous: true
requirements:
  - TAURI-CORE-CONFIG
  - TAURI-NATIVE-SCAFFOLD
  - TAURI-CROSS-PLATFORM-CI

must_haves:
  truths:
    - "Vite config sets base to '/' when TAURI_ENV_PLATFORM is present, keeping '/task-management/' for GitHub Pages."
    - "package.json contains Tauri v2 CLI and API dependencies along with desktop npm scripts for dev and build."
    - "src-tauri contains a valid Tauri v2 workspace with Cargo.toml, build.rs, lib.rs, main.rs, tauri.conf.json, and default capabilities."
    - "GitHub Actions desktop workflow executes on macos-latest and windows-latest runners to produce desktop artifacts."
  artifacts:
    - path: "package.json"
      provides: "Tauri v2 dependencies and npm scripts"
    - path: "vite.config.ts"
      provides: "Conditional base path and server config for Tauri webview"
    - path: "scripts/setup-desktop.sh"
      provides: "Rust prerequisite verification and setup instructions"
    - path: "src-tauri/tauri.conf.json"
      provides: "Tauri v2 configuration metadata and window properties"
    - path: "src-tauri/Cargo.toml"
      provides: "Rust crate configuration for Tauri app"
    - path: "src-tauri/capabilities/default.json"
      provides: "Tauri v2 default permission capabilities"
    - path: ".github/workflows/desktop-build.yml"
      provides: "Matrix workflow building macOS DMG/App and Windows MSI/NSIS artifacts"
  key_links:
    - from: "package.json"
      to: "src-tauri/tauri.conf.json"
      via: "npm scripts tauri:dev and tauri:build invoking @tauri-apps/cli"
    - from: "vite.config.ts"
      to: "src-tauri/tauri.conf.json"
      via: "devUrl port 5173 and frontendDist '../dist' matching Vite outputs"
    - from: ".github/workflows/desktop-build.yml"
      to: "src-tauri"
      via: "actions-rust-lang or dtolnay toolchain and tauri-apps/tauri-action building installers"
---

<objective>
Configure Tauri v2 desktop application packaging for macOS and Windows.
Provide package dependencies, native src-tauri configuration with capabilities, conditional Vite base path handling, local developer setup script, and GitHub Actions CI workflow to build desktop installation bundles.

Purpose: Allow personal offline task planner to run as a native desktop application on macOS (.dmg/.app) and Windows (.msi/.exe) without breaking the existing GitHub Pages PWA deployment.
Output: Tauri v2 configuration, src-tauri Rust scaffold, adapted vite.config.ts, desktop setup script, and GitHub Actions build workflow.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@package.json
@vite.config.ts
@.github/workflows/deploy.yml
</context>

<tasks>

<task type="auto">
  <name>Task 1: Tauri dependencies, npm scripts, Vite base path adaptation, and setup script</name>
  <files>package.json, vite.config.ts, scripts/setup-desktop.sh</files>
  <action>
    Add Tauri v2 packages, desktop build scripts, conditional Vite configuration, and a developer setup helper:

    1) In package.json:
       - Add dependencies: "@tauri-apps/api": "^2.2.0".
       - Add devDependencies: "@tauri-apps/cli": "^2.2.0".
       - Add scripts:
         - "tauri": "tauri"
         - "tauri:dev": "tauri dev"
         - "tauri:build": "tauri build"
       - Keep all existing scripts, dependencies, and engines intact.

    2) In vite.config.ts:
       - Detect Tauri runtime via boolean const isTauri = Boolean(process.env.TAURI_ENV_PLATFORM || process.env.TAURI_PLATFORM).
       - Set base dynamically: isTauri ? '/' : '/task-management/'.
       - Configure server block to support Tauri dev:
         - port: 5173
         - strictPort: true
         - host: process.env.TAURI_DEV_HOST || false
       - Configure clearScreen: false in Vite config to prevent Vite from clearing Rust compiler terminal output.
       - Ensure Vitest test block and VitePWA plugins remain fully operational for web builds.

    3) Create scripts/setup-desktop.sh:
       - Bash script with executable permissions (chmod +x).
       - Checks for presence of rustc, cargo, and rustup.
       - If missing, outputs clear step-by-step instructions and command to install Rust via curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh.
       - Checks for OS-specific prerequisites: Xcode Command Line Tools on macOS (xcode-select -p), or C++ build tools on Windows.
       - Validates node and npm versions against project requirements.
  </action>
  <verify>
    <automated>npm run build && test -x scripts/setup-desktop.sh && bash -n scripts/setup-desktop.sh</automated>
  </verify>
  <done>
    - package.json includes @tauri-apps/api and @tauri-apps/cli with tauri, tauri:dev, and tauri:build scripts.
    - vite.config.ts switches base path to '/' when running under Tauri and sets server port 5173 with strictPort.
    - scripts/setup-desktop.sh exists, is executable, and passes syntax check.
    - npm run build succeeds without errors.
  </done>
</task>

<task type="auto">
  <name>Task 2: Native Tauri v2 scaffold with Cargo workspace, configs, and capabilities</name>
  <files>src-tauri/Cargo.toml, src-tauri/build.rs, src-tauri/src/main.rs, src-tauri/src/lib.rs, src-tauri/tauri.conf.json, src-tauri/capabilities/default.json</files>
  <action>
    Create native Tauri v2 application directory structure under src-tauri:

    1) In src-tauri/Cargo.toml:
       - Define package metadata: name = "personal-task-workload-planner", version = "0.1.0", description = "Personal Task & Workload Planner", edition = "2021", authors = ["Duc Quan Tran"].
       - Define build-dependencies: tauri-build = { version = "2", features = [] }.
       - Define dependencies: tauri = { version = "2", features = [] }, serde = { version = "1", features = ["derive"] }, serde_json = "1".
       - Define lib target: name = "personal_task_workload_planner_lib", crate-type = ["staticlib", "cdylib", "rlib"].

    2) In src-tauri/build.rs:
       - Standard Tauri build script invoking tauri_build::build().

    3) In src-tauri/src/lib.rs:
       - Export run() function using tauri::Builder::default().run(tauri::generate_context!()).expect("error while running tauri application").
       - Mark run with cfg_attr(mobile, tauri::mobile_entry_point).

    4) In src-tauri/src/main.rs:
       - Define standard main function calling personal_task_workload_planner_lib::run().
       - Include #![cfg_attr(not(debug_assertions), windows_subsystem = "windows")] at file top to prevent console window popping up on Windows release builds.

    5) In src-tauri/tauri.conf.json:
       - Schema: "https://schema.tauri.app/config/2".
       - Product name: "Personal Task & Workload Planner".
       - Version: "0.1.0".
       - Identifier: "com.personal.taskplanner".
       - Build settings:
         - beforeDevCommand: "npm run dev"
         - devUrl: "http://localhost:5173"
         - beforeBuildCommand: "npm run build"
         - frontendDist: "../dist"
       - App settings:
         - Windows list containing main window: title "Personal Task & Workload Planner", width 1280, height 800, minWidth 900, minHeight 600, resizable true, fullscreen false.
         - Security settings: csp set to null.
       - Bundle settings:
         - active: true
         - targets: "all"
         - icon: ["icons/32x32.png", "icons/128x128.png", "icons/128x128@2x.png", "icons/icon.icns", "icons/icon.ico"]
         - macOS: frameworks [], minimumSystemVersion null.
         - Windows: digestAlgorithm "sha256".

    6) In src-tauri/capabilities/default.json:
       - Tauri v2 capability configuration file.
       - Schema: "../gen/schemas/desktop-schema.json".
       - Identifier: "default".
       - Description: "Default capabilities for main window".
       - Windows: ["main"].
       - Permissions: ["core:default"].

    7) Provide icons in src-tauri/icons/ generated or copied from public pwa icons (32x32, 128x128, 128x128@2x, icon.png).
  </action>
  <verify>
    <automated>node -e "JSON.parse(require('fs').readFileSync('src-tauri/tauri.conf.json')); JSON.parse(require('fs').readFileSync('src-tauri/capabilities/default.json')); console.log('Tauri JSON configs valid');"</automated>
  </verify>
  <done>
    - src-tauri/Cargo.toml, build.rs, src/main.rs, and src/lib.rs created with valid Rust syntax and Tauri v2 configuration.
    - src-tauri/tauri.conf.json matches Tauri v2 schema and points to ../dist and port 5173.
    - src-tauri/capabilities/default.json grants core:default permission to main window.
    - All JSON configuration files parse cleanly.
  </done>
</task>

<task type="auto">
  <name>Task 3: GitHub Actions multi-platform desktop build CI workflow</name>
  <files>.github/workflows/desktop-build.yml</files>
  <action>
    Create a GitHub Actions workflow to build desktop release bundles for macOS (.dmg and .app) and Windows (.msi and .exe):

    1) Create .github/workflows/desktop-build.yml:
       - Name: "Build Desktop Apps"
       - Triggers: workflow_dispatch and push to tags matching 'v*' or pushes to master/main updating src-tauri/**.
       - Permissions: contents: write (for releases) or contents: read (for artifact builds).
       - Job: build-tauri with strategy matrix:
         - include:
           - platform: 'macos-latest', target: 'universal-apple-darwin' or default host architecture
           - platform: 'windows-latest', target: 'x86_64-pc-windows-msvc'
       - Steps:
         - Checkout repository: actions/checkout@v4.
         - Setup Node.js: actions/setup-node@v4 with node-version: 22, cache: 'npm'.
         - Install Rust toolchain: dtolnay/rust-toolchain@stable.
         - Install npm dependencies: npm ci.
         - Run web test suite: npm test.
         - Build Tauri application using tauri-apps/tauri-action@v0:
           - args: "--target ${{ matrix.target }}" if specified or default platform build.
         - Upload desktop release artifacts using actions/upload-artifact@v4:
           - Name: desktop-${{ matrix.platform }}
           - Path patterns covering target/release/bundle/dmg, target/release/bundle/macos, target/release/bundle/msi, and target/release/bundle/nsis.
  </action>
  <verify>
    <automated>node -e "const yaml = require('fs').readFileSync('.github/workflows/desktop-build.yml', 'utf8'); if (!yaml.includes('macos-latest') || !yaml.includes('windows-latest') || !yaml.includes('tauri-action')) throw new Error('Workflow validation failed'); console.log('Desktop CI workflow valid');"</automated>
  </verify>
  <done>
    - .github/workflows/desktop-build.yml defines matrix builds for macos-latest and windows-latest.
    - Workflow runs npm test, builds desktop bundles with tauri-action, and uploads installation artifacts.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Webview <-> Tauri Core | Untrusted DOM/JS execution boundary communicating with native host |
| GitHub Actions <-> Artifacts | CI build environment packaging release binaries for distribution |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-TAURI-01 | Elevation of Privilege | src-tauri/capabilities/default.json | mitigate | Restrict Tauri v2 capabilities to core:default with no arbitrary shell execution or unsafe filesystem plugin access |
| T-TAURI-02 | Tampering | src-tauri/tauri.conf.json security CSP | mitigate | Explicitly set strict CSP or inherit secure local origin boundaries preventing remote script injection |
| T-TAURI-03 | Tampering | .github/workflows/desktop-build.yml | mitigate | Pin GitHub Actions versions to v4/v0, use npm ci, and enforce npm test execution prior to binary compilation |
</threat_model>

<verification>
- Automated check: `npm run build` succeeds with base path adaptation.
- Automated check: `src-tauri/tauri.conf.json` and `src-tauri/capabilities/default.json` pass JSON syntax validation.
- Automated check: `.github/workflows/desktop-build.yml` contains valid YAML syntax and matrix configuration for macOS and Windows.
- Automated check: `scripts/setup-desktop.sh` is executable and passes bash syntax validation.
</verification>

<success_criteria>
- package.json contains @tauri-apps/api, @tauri-apps/cli, and scripts: tauri, tauri:dev, tauri:build.
- vite.config.ts dynamically adapts base path for Tauri execution.
- src-tauri contains complete Tauri v2 Rust project and configuration.
- scripts/setup-desktop.sh provides automated Rust environment check and setup guide.
- .github/workflows/desktop-build.yml automates cross-platform desktop builds on macOS and Windows.
</success_criteria>

<output>
Create .planning/quick/260930-ugc-setup-tauri-desktop-app-for-macos-and-wi/SUMMARY.md when done.
</output>
