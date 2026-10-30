# Quick Task 261030-dvh: Fast Desktop Build on Staging Summary

**Execution Date:** 2026-10-30
**Status:** Completed
**Objective:** Cập nhật `.github/workflows/desktop-build.yml` để hỗ trợ build desktop nhanh trên branch `staging` (bỏ qua `npm test`), giữ nguyên full `npm test` trên `master`, giữ nguyên build Tauri và upload artifact trên cả hai branch, và chặn tuyệt đối việc publish release công khai từ `staging` kể cả khi `publish_to_taskmate` bị kích hoạt nhầm.

## Artifacts Modified & Created

1. `.github/workflows/desktop-build.yml`:
   - Thêm triggers `push` cho `master` và `staging`.
   - Thêm `if: ${{ github.ref_name != 'staging' }}` cho step `Install Knowledge Server dependencies` và `Run test suite`.
   - Cấu hình step `Build Tauri Desktop Application`:
     `if: ${{ github.ref_name == 'staging' || (!startsWith(github.ref, 'refs/tags/v') && !inputs.publish_to_taskmate) }}`
   - Cấu hình step `Build and Publish Tauri Desktop Application`:
     `if: ${{ github.ref_name != 'staging' && (startsWith(github.ref, 'refs/tags/v') || inputs.publish_to_taskmate) }}`
   - Giữ nguyên upload artifacts macOS và Windows.

2. `scripts/check-workflow-expressions.mjs`:
   - Assert-based small script kiểm tra biểu thức điều kiện với 6 cases: staging push, staging dispatch publish, master push, master dispatch publish, v tag, và phase branch.

3. `.planning/STATE.md`:
   - Cập nhật bảng `Quick Tasks Completed` với task `261030-dvh`.

4. `.planning/quick/261030-dvh-staging-fast-desktop-build/261030-dvh-PLAN.md`:
   - Lưu trữ plan thực thi.

## Verification & Test Results

- Chạy test targeted `node scripts/check-workflow-expressions.mjs`:
  - Output: `ALL WORKFLOW EXPRESSION CHECKS PASSED` (exit code 0).
- Không chạy full test suite hay desktop build.
- Không sửa file source app hay cấu hình Vitest.
- Không thực hiện commit hoặc push.

## Limitations

- Không cài đặt dependency ngoài (không thêm `yaml`/`js-yaml`), assertion sử dụng text assertion kết hợp bộ đánh giá logic độc lập.
- Chỉ kiểm tra trên cấu hình CI expression; thực tế runner của GitHub Actions sẽ thực thi chính xác theo context `github.ref_name`, `github.ref`, và `inputs.publish_to_taskmate`.
