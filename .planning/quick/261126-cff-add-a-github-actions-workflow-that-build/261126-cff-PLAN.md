---
phase: 261126-cff
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .github/workflows/windows-installers.yml
autonomous: true
requirements: []
user_setup: []
must_haves:
  truths:
    - "Một workflow Windows-only mới build được 2 NSIS installer: TaskMate (config mặc định) và TaskMate Chat (src-tauri/tauri.conf.chat.json, VITE_CHAT_STANDALONE=1 từ vite.chat.config.ts)"
    - "Không có job macOS/iOS, không publish release, không đụng .github/workflows/desktop-build.yml"
    - "Hai artifact upload riêng tên, chứa lần lượt installer của từng app; if-no-files-found: error"
    - "Không dependency mới, không secret/token mới, không đổi source hay cấu hình ứng dụng"
  artifacts:
    - path: .github/workflows/windows-installers.yml
      provides: "Workflow dispatch/push trên windows-latest, 2 bước tauri build NSIS tuần tự + 2 bước upload artifact"
  key_links:
    - from: .github/workflows/windows-installers.yml
      to: src-tauri/tauri.conf.chat.json
      via: "--config src-tauri/tauri.conf.chat.json"
      pattern: "--config src-tauri/tauri\\.conf\\.chat\\.json"
    - from: .github/workflows/windows-installers.yml
      to: src-tauri/tauri.conf.json
      via: "bước build TaskMate dùng config mặc định của tauri-action"
      pattern: "tauri-apps/tauri-action@v0"
---

<objective>
Thêm một GitHub Actions workflow riêng chỉ build Windows NSIS installer cho cả TaskMate và TaskMate Chat.

Purpose: Phase 51 đã có cấu hình standalone (`src-tauri/tauri.conf.chat.json`, `vite.chat.config.ts`) nhưng `.github/workflows/desktop-build.yml` vẫn build macOS + Windows và chỉ build app mặc định. Sếp cần 2 installer Windows mà không build macOS/iOS. Giữ `desktop-build.yml` nguyên vẹn để không ảnh hưởng release path hiện có.

Output: 1 file workflow mới. Không sửa source, package, config Tauri, hay workflow cũ.

> Giả định đã được chấp nhận: thêm workflow mới song song (`add-alongside`) thay vì thu hẹp workflow release hiện có. Trigger gồm `workflow_dispatch` và `push` tới `master`/`staging`/tag `v*`; hai build chạy tuần tự trong cùng một job để `dist` không bị ghi đè chéo.
</objective>

<context>
@.github/workflows/desktop-build.yml
@package.json
@src-tauri/tauri.conf.json
@src-tauri/tauri.conf.chat.json
@vite.chat.config.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Tạo workflow Windows-only build 2 NSIS installer</name>
  <files>.github/workflows/windows-installers.yml</files>
  <action>
    Tạo `.github/workflows/windows-installers.yml` với cấu trúc tối giản:

    - `name: Build Windows Installers`; `on: workflow_dispatch` + `push` với `branches: [master, staging]` và `tags: ['v*']`; `permissions: contents: read`; `concurrency` group theo ref, `cancel-in-progress: true`.
    - Một job duy nhất `build-windows`, `runs-on: windows-latest`, `env: CI: 'true'`. Không dùng `strategy.matrix`, không có macOS/iOS target, không truyền secret, không có bước publish release.
    - Steps tuần tự: `actions/checkout@v4` → `actions/setup-node@v4` với `node-version: 24` và `cache: 'npm'` → `dtolnay/rust-toolchain@stable` với `targets: x86_64-pc-windows-msvc` → `npm ci`.
    - Bước 1 build TaskMate: `tauri-apps/tauri-action@v0`, `args: --target x86_64-pc-windows-msvc --bundles nsis`. Config mặc định `src-tauri/tauri.conf.json` được tauri-action dùng sẵn; `beforeBuildCommand` là `npm run build`.
    - Bước 2 upload ngay installer TaskMate: `actions/upload-artifact@v4`, `name: taskmate-windows-nsis`, `path: src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/*.exe`, `if-no-files-found: error`. Upload ngay sau build 1 để glob không bắt nhầm installer Chat build sau đó.
    - Bước 3 build TaskMate Chat: `tauri-apps/tauri-action@v0`, `args: --target x86_64-pc-windows-msvc --bundles nsis --config src-tauri/tauri.conf.chat.json`. Để tauri-action chạy `beforeBuildCommand: npm run build:chat` từ config chat; không gọi `npm run tauri:build:chat` riêng, không set `VITE_CHAT_STANDALONE` thủ công (đã có trong `vite.chat.config.ts`).
    - Bước 4 upload installer Chat: `actions/upload-artifact@v4`, `name: taskmate-chat-windows-nsis`, `path: src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/TaskMate Chat*.exe`, `if-no-files-found: error`. Dùng đúng `productName` từ config chat để tách khỏi installer TaskMate.
    - Không thêm test suite, không chạy `npm test` (quy ước dự án: full suite >1 giờ), không thêm dependency, không chỉnh `.github/workflows/desktop-build.yml`.
  <verify>
    <automated>ruby -e "require 'yaml'; YAML.load_file('.github/workflows/windows-installers.yml')" && test "$(grep -c 'tauri-apps/tauri-action@v0' .github/workflows/windows-installers.yml)" -eq 2 && grep -q -- '--bundles nsis' .github/workflows/windows-installers.yml && grep -q -- '--config src-tauri/tauri.conf.chat.json' .github/workflows/windows-installers.yml && test "$(grep -c 'actions/upload-artifact@v4' .github/workflows/windows-installers.yml)" -eq 2 && grep -q 'if-no-files-found: error' .github/workflows/windows-installers.yml && ! grep -qiE 'macos|iphone|ios|publish_to_taskmate|PUBLIC_REPO_TOKEN' .github/workflows/windows-installers.yml</automated>
  </verify>
  <done>
    File workflow tồn tại, parse được YAML, có đúng 2 bước tauri-action NSIS và 2 bước upload artifact tên riêng. Build Chat dùng config chat; không target Apple, không publish, không secret. Diff chỉ 1 file mới.
  </done>
</task>

<task type="auto">
  <name>Task 2: Kiểm tra scope và trigger của workflow mới</name>
  <files>.github/workflows/windows-installers.yml</files>
  <action>
    Đối chiếu file vừa tạo với `.github/workflows/desktop-build.yml`: giữ nguyên phần checkout/setup-node/Rust/`npm ci` theo pattern cũ, nhưng bỏ phần test, bỏ phần release/publish, bỏ matrix Apple. Đảm bảo `git status` chỉ có file workflow mới trong `.github/workflows/`, không file source/config/package nào khác thay đổi. Không commit trong task này.
  <verify>
    <automated>git status --short && git diff -- .github/workflows/desktop-build.yml package.json src-tauri/tauri.conf.json src-tauri/tauri.conf.chat.json vite.chat.config.ts</automated>
  </verify>
  <done>
    `git status --short` chỉ liệt kê `.github/workflows/windows-installers.yml`; `git diff` với workflow cũ, `package.json`, 2 config Tauri và `vite.chat.config.ts` trống. Sẵn sàng cho bước commit của quick flow.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Workflow trigger → runner | Chỉ chạy trên `windows-latest`; không nhận input do người dùng truyền vào lệnh shell. |
| Tauri build → artifact | NSIS installer là output không mã hóa; upload tới GitHub Actions artifact, không publish ra public release. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-261126-cff-01 | Tampering / Information disclosure | Publish path | avoid | Workflow mới không nhận token/secret, không dùng `PUBLIC_REPO_TOKEN`, không có bước release; `permissions: contents: read`. |
| T-261126-cff-02 | Tampering | Cross-app artifact mix-up | mitigate | Build tuần tự trong 1 job; upload TaskMate ngay sau build 1; upload Chat bằng pattern `TaskMate Chat*.exe`; artifact names riêng. |
| T-261126-cff-03 | Supply chain | npm/cargo installs | accept | Dùng `npm ci` và toolchain action có sẵn; không thêm dependency hay script cài đặt mới. |

Ghi chú: không có secret/passphrase/token nào được chạm; không cần API coverage gate, schema push gate hay assumption delta bổ sung ngoài quyết định add-alongside đã nêu ở objective.
</threat_model>

<verification>
1. Chạy lệnh verify của Task 1 để parse YAML và khẳng định số lượng bước build/upload, target NSIS, config chat, không target Apple/release.
2. Chạy lệnh verify của Task 2 để khẳng định workflow cũ, package, config Tauri, vite chat config không đổi.
3. Không chạy full Vitest suite; CI thật sẽ build NSIS trên `windows-latest` khi chạy workflow.
4. Khi commit theo quick flow, kết thúc message bằng `Co-Authored-By: Claude Code <noreply@anthropic.com>`.
</verification>

<success_criteria>
- Workflow Windows-only mới build tuần tự 2 installer NSIS và upload thành 2 artifact riêng.
- `src-tauri/tauri.conf.chat.json` được dùng cho TaskMate Chat; `vite.chat.config.ts` tự đặt `VITE_CHAT_STANDALONE=1`.
- Không macOS/iOS, không publish, không secret, không dependency mới, không file ngoài `.github/workflows/windows-installers.yml` bị thay đổi.
</success_criteria>

<output>
Cập nhật thư mục quick này theo execute-plan mặc định nếu workflow yêu cầu summary; không tạo file báo cáo tách rời.
</output>
