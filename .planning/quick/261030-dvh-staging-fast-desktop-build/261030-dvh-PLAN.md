---
phase: quick
plan: 261030-dvh
type: execute
wave: 1
depends_on: []
files_modified:
  - .github/workflows/desktop-build.yml
autonomous: true
requirements:
  - STAGING-FAST-BUILD-01
  - STAGING-NO-PUBLISH-02
  - MASTER-FULL-TEST-03
  - DESKTOP-ARTIFACT-04
user_setup: []
must_haves:
  truths:
    - "Push hoặc workflow_dispatch trên staging bỏ qua full npm test, giữ Tauri desktop build và upload artifact."
    - "Push hoặc workflow_dispatch trên master vẫn chạy đầy đủ npm test trước khi build."
    - "Branch staging tuyệt đối không publish release tới repo public dù workflow_dispatch input publish_to_taskmate bị bật nhầm."
    - "Thêm trigger push cho master và staging vào desktop-build.yml."
  artifacts:
    - path: ".github/workflows/desktop-build.yml"
      provides: "Desktop build CI workflow hỗ trợ fast build trên staging, test đầy đủ trên master, và release publication guard"
  key_links:
    - from: ".github/workflows/desktop-build.yml"
      to: "tauri-apps/tauri-action@v0"
      via: "step conditional expressions chặn publish khi github.ref_name == 'staging'"
      pattern: "github.ref_name != 'staging'"
---

<objective>
Cập nhật `.github/workflows/desktop-build.yml` để hỗ trợ build desktop nhanh trên branch `staging` (bỏ qua `npm test`), giữ nguyên full `npm test` trên `master`, giữ nguyên build Tauri và upload artifact trên cả hai branch, và chặn tuyệt đối việc publish release công khai từ `staging` kể cả khi `publish_to_taskmate` bị kích hoạt nhầm.

Mục đích: Tăng tốc độ kiểm tra desktop bundle trên branch staging mà không ảnh hưởng an toàn release hoặc chất lượng gate trên master.
Đầu ra: File `.github/workflows/desktop-build.yml` được cấu hình trigger và conditional steps tối thiểu, an toàn.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/STATE.md
@package.json
@.github/workflows/desktop-build.yml
@src-tauri/tauri.conf.json
</context>

<tasks>

<task type="auto">
  <name>Task 1: Cập nhật desktop-build.yml với trigger staging/master, skip test trên staging, và release guard</name>
  <files>.github/workflows/desktop-build.yml</files>
  <action>
Cập nhật `.github/workflows/desktop-build.yml` theo hướng can thiệp tối thiểu (không sửa source code, không chỉnh file Vitest):

1. Thêm trigger `push` cho branch `master` và `staging`:
   ```yaml
   push:
     branches:
       - master
       - staging
       - phase-16-desktop-build
     tags:
       - 'v*'
   ```

2. Bỏ qua step `Install Knowledge Server dependencies` và step `Run test suite` khi chạy trên branch `staging`:
   - Step `Install Knowledge Server dependencies`: thêm `if: github.ref_name != 'staging'` để tiết kiệm thời gian cài đặt không cần thiết trên staging runner.
   - Step `Run test suite`: thêm `if: github.ref_name != 'staging'`. Master và các tag/branch khác vẫn chạy `npm test` đầy đủ; staging bỏ qua để build nhanh (quá trình `tauri-action` vẫn tự chạy `npm run build` tức `tsc && vite build` kiểm tra toàn bộ typecheck và build bundle).

3. Đặt guard chặn publish release từ staging trong hai step Tauri:
   - Step `Build Tauri Desktop Application` (build thường + artifact, không publish):
     ```yaml
     if: github.ref_name == 'staging' || (!startsWith(github.ref, 'refs/tags/v') && !inputs.publish_to_taskmate)
     ```
   - Step `Build and Publish Tauri Desktop Application` (publish release công khai):
     ```yaml
     if: github.ref_name != 'staging' && (startsWith(github.ref, 'refs/tags/v') || inputs.publish_to_taskmate)
     ```
   Logic này đảm bảo nếu chạy trên branch `staging`, step publish luôn nhận `false` và step build thường luôn nhận `true`, vô hiệu hóa hoàn toàn cờ `publish_to_taskmate` khi chạy trên staging.

4. Giữ nguyên hai step `Upload macOS Bundles` và `Upload Windows Installers` để artifacts desktop (.dmg, .app, .msi, .exe) luôn được tải lên workflow run.
  </action>
  <verify>
    <automated>node -e "const fs = require('fs'); const content = fs.readFileSync('.github/workflows/desktop-build.yml', 'utf8'); if (!content.includes('github.ref_name != \'staging\'') || !content.includes('staging')) { console.error('Verification failed'); process.exit(1); } console.log('desktop-build.yml syntax check passed');"</automated>
  </verify>
  <done>Workflow desktop-build.yml có trigger push cho master/staging, điều kiện bỏ qua npm test trên staging, bảo vệ chống publish release từ staging, và giữ nguyên artifact upload.</done>
</task>

<task type="auto">
  <name>Task 2: Xác thực cú pháp workflow YAML và đối soát diff</name>
  <files>.github/workflows/desktop-build.yml</files>
  <action>
1. Kiểm tra toàn bộ cấu trúc file `.github/workflows/desktop-build.yml` đảm bảo YAML hợp lệ, không sai indentation, không có biến undefined.
2. Kiểm tra `git diff` chỉ chạm duy nhất file `.github/workflows/desktop-build.yml`.
3. Không chạm file source, không sửa bất kỳ file test hay cấu hình Vitest nào trong task này per user constraint.
  </action>
  <verify>
    <automated>git diff --name-only</automated>
  </verify>
  <done>Diff tối thiểu, chỉ thay đổi duy nhất .github/workflows/desktop-build.yml, cấu trúc hợp lệ sẵn sàng sử dụng.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|---|---|
| Staging branch execution -> GitHub Releases | Build trên staging kích hoạt release công khai sang repo taskmate |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|---|---|---|---|---|
| T-QUICK-01 | Tampering / Information Disclosure | .github/workflows/desktop-build.yml | mitigate | Chặn publish step bằng điều kiện `github.ref_name != 'staging'`, ép dùng step build thường không có GITHUB_TOKEN release dù input `publish_to_taskmate` bật |
| T-QUICK-SC | Tampering | npm packages | accept | Giữ nguyên `npm ci`, không thêm hoặc đổi dependencies |
</threat_model>

<verification>
- Cú pháp YAML của `.github/workflows/desktop-build.yml` hợp lệ.
- Biểu thức điều kiện `if: github.ref_name != 'staging'` cô lập hoàn toàn môi trường staging khỏi full test và publication.
- Master giữ nguyên 100% flow: full test và quyền publish khi có tag hoặc dispatch flag.
</verification>

<success_criteria>
- Kế hoạch thực hiện ngắn gọn, rõ ràng, chia làm 2 task thực thi trực tiếp.
- Không sửa source, không sửa Vitest.
- Không commit/push.
</success_criteria>

<output>
Tạo `.planning/quick/261030-dvh-staging-fast-desktop-build/261030-dvh-PLAN.md`
</output>
