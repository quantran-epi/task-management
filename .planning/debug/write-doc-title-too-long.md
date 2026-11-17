---
status: awaiting_human_verify
trigger: "Agent trong team UAT gọi write_doc create để lưu báo cáo explore_repo nhưng tiêu đề 109 ký tự bị từ chối 'Tiêu đề quá dài (tối đa 104 ký tự)' tại src/services/ai/office/teamTools.ts:983-995 (cap = 120 - prefix agentName); agent không tự rút gọn và retry. Cần tool schema/refusal message đủ rõ để model tự sửa."
created: "2026-11-17"
updated: "2026-11-17"
symptoms:
  expected: "Agent thấy giới hạn độ dài (sau khi trừ prefix tên agent) trong tool schema/refusal, rút gọn tiêu đề rồi create thành công."
  actual: "Agent gọi create với tiêu đề 109 ký tự, nhận INVALID_ARGUMENT cap 104, không retry; báo cáo explore_repo không được lưu."
  error: "INVALID_ARGUMENT: Tiêu đề quá dài (tối đa 104 ký tự)."
  timeline: "Lượt UAT explore_repo sau fix handshake, 2026-11-17 (report cbe1466b)."
  repro: "Team turn: agent explore_repo xong thì write_doc create với tiêu đề 109 ký tự như log đã dán."
---

## Current Focus
bug_class: bohrbug  # deterministic: schema + message strings are fixed for given inputs
hypothesis: "write_doc.title schema description có cap cố định/âm (120) nhưng cap thực tế là động = 120 - prefix.length; refusal message chỉ đưa số, không nêu rõ 'bỏ prefix' hay 'rút gọn', nên model thấy tiêu đề 109 > cap 104 nhưng không có chỉ dẫn tự sửa."
test: "Viết focused failing tests: (1) schema title.description nêu cap động (= 120 trừ prefix agent), (2) refusal message create có hướng dẫn rút gọn/bỏ prefix; chạy test mục tiêu trước (RED), apply fix, chạy lại (GREEN) + adjacent tests + tsc."
expecting: "Schema described dynamic cap; refusal message tells model to shorten by N char / drop duplicated prefix so it can retry create successfully."
next_action: "apply minimal fix to schema title.description + create refusal message, then run tests GREEN"

tdd_checkpoint:
  test_file: "tests/services/ai/office/teamTools.test.ts"
  test_names:
    - "advertises the dynamic title cap on write_doc.title so the model can size it up front"
    - "create over-long-title refusal tells the model how to shorten and retry"
    - "create accepts a bare title exactly at the effective cap and refuses cap+1 with guidance"
  status: "green"
  failure_output: "AssertionError: expected 'Tiêu đề tài liệu. Bỏ trống khi action = list.' to contain '120'; expected 'Tiêu đề quá dài (tối đa 115 ký tự).' to match /rút gọn|ngắn lại|shorten|trim|cắt bớt/"
  green_result: "4/4 driving tests pass; 75/75 full file; tsc clean."

reasoning_checkpoint:
  hypothesis: "Model không tự sửa vì hai thông điệp nó đọc được đều thiếu hướng dẫn: schema `write_doc.title` không nêu cap (120 - prefix) và refusal chỉ đưa số ('tối đa 104') không nói rút gọn/bỏ prefix."
  confirming_evidence:
    - "Trực tiếp quan sát: schema description = 'Tiêu đề tài liệu. Bỏ trống khi action = list.' — zero length info."
    - "Trực tiếp quan sát: refusal = 'Tiêu đề quá dài (tối đa 104 ký tự).' — số nhưng không có recovery path; UAT ghi nhận agent bỏ cuộc."
    - "executeTeamTool trả JSON refusal làm tool result duy nhất model thấy; description/properties description đi vào tool schema — cả hai đều tới model nguyên vẹn."
  falsification_test: "Sau fix, nếu schema vẫn không chứa cap/prefix hoặc refusal vẫn thiếu lệnh 'rút gọn/bỏ prefix' thì test vẫn RED — chứng tỏ giả thuyết 'thiếu hướng dẫn' sai và nguyên nhân ở chỗ khác."
  fix_rationale: "Bổ sung thông tin tự-sửa đúng vào 2 nơi model thực đọc (tool schema + refusal result), thay vì tự cắt tiêu đề của agent (đổi dữ liệu người dùng — vi phạm data safety). Sửa đúng cơ chế: model tự rút gọn rồi retry."
  blind_spots:
    - "Không chạy được LLM thật trong unit test để chứng minh model thực sự retry — cần owner UAT xác nhận."
    - "Cách diễn đạt tiếng Việt ảnh hưởng hành vi model thế nào không đo được bằng test; chỉ kiểm tra string có chứa hướng dẫn."
    - "Chưa kiểm tra prompt assembly của team-run có truyền tool schema tới model không (giả định có, vì các tool khác cùng cơ chế)."
  candidate_causes:
    - "code: schema + refusal message thiếu hướng dẫn tự sửa (nguyên nhân được xác nhận)"
    - "data: tiêu đề 109 ký tự + prefix agent bị lặp làm độ dài hiệu dụng vượt cap 104 (trigger input, không phải defect)"
    - "config: NOTE_TITLE_MAX_LENGTH=120 trừ động prefix.length làm cap không cố định (đã nêu rõ trong schema mới)"
  and_gate: "no — thiếu hướng dẫn tự sửa là đủ để giải thích việc model bỏ cuộc: với BẤT KỲ tiêu đề vượt cap, model chỉ nhận một con số và (theo UAT) không retry. Tiêu đề 109 là input trigger bình thường mà tool phải xử lý, không phải điều kiện defect cộng thêm."

## Evidence
<!-- APPEND only -->
- timestamp: 2026-11-17
  checked: src/services/ai/office/teamTools.ts:975-997 (writeDoc create) + :316-330 (TEAM_TOOL_DEFINITIONS.write_doc schema) + :16,897-898 (constants)
  found: "`write_doc.title` description = 'Tiêu đề tài liệu. Bỏ trống khi action = list.' — no length limit at all. Refusal at :990-996 emits `Tiêu đề quá dài (tối đa ${120 - prefix.length} ký tự).` — states the number but no instruction to shorten/drop prefix. Cap is dynamic: MAX_DOC_TITLE_LENGTH(120) - ctx.agentName prefix length; UAT prefix 'explore_repo...' length ~16 => cap 104, title 109 > 104."
  implication: "Model is told a bare number with no recovery path; with title 109 vs cap 104 it cannot infer it should trim 5 chars or re-check a duplicated prefix, so it abandons the write. Matches symptoms exactly."
- timestamp: 2026-11-17
  checked: teamTools.test.ts:1712-1742 (WR-02 over-long title tests) + :108-122 (schema advertising precedent for explore_repo)
  found: "Existing WR-02 test only asserts `message` contains 'quá dài' and no note written — no assertion the message is actionable or the schema advertises a cap. There IS precedent for schema-description tests (explore_repo timeoutSeconds)."
  implication: "Can add strong specified-oracle tests: schema must carry the cap, refusal must carry a recovery instruction; both are directly assertable strings."
- timestamp: 2026-11-17
  checked: teamRunCoordinator.ts:1379-1380, :914-937; aiTools.ts:93-104
  found: "`executeTeamTool` result string (the JSON refusal) is returned to the model as the tool result; refusal message is the only recovery text the model sees. AiToolDefinition.function.description and properties[].description are free-form strings sent to the model as the tool schema."
  implication: "Improving schema description + refusal message is the correct lever: both reach the model verbatim. Rejected alternative: auto-truncating the title would silently alter agent-authored data (data safety) — not chosen."

## Eliminated
<!-- APPEND only -->
- hypothesis: "Tự cắt ngắn tiêu đề trong handler (auto-truncate) để create luôn thành công."
  evidence: "Bác bỏ trên nguyên tắc data safety: tiêu đề là dữ liệu do agent/người dùng soạn; cắt âm thầm làm mất nội dung báo cáo và che lỗi. Cách đúng là cho model tự sửa qua schema + refusal."
  timestamp: 2026-11-17
- hypothesis: "git_read adjacent tests (5 failures) do fix này gây ra."
  evidence: "Stash toàn bộ thay đổi của tôi (tag debug-write-doc-title-too-long-verify-20261117) rồi chạy lại: vẫn đúng 5 failed | 51 passed trên baseline. Các failure liên quan escape branch/cat --/working-copy fallback của git remote, không liên quan write_doc."
  timestamp: 2026-11-17

## Resolution
root_cause: "Tool schema `write_doc.title` không nêu giới hạn độ dài (động = 120 - prefix tên agent) và refusal message chỉ đưa con số cap mà không có hướng dẫn tự sửa, nên model nhận 'tối đa 104' cho tiêu đề 109 nhưng không biết phải rút gọn/bỏ prefix lặp để retry — bỏ cuộc, không lưu báo cáo."
fix: "Thêm cap động + quy tắc prefix + lệnh 'rút gọn' vào `TEAM_TOOL_DEFINITIONS.write_doc.parameters.properties.title.description`, và sửa refusal create thành 'tối đa N ký tự SAU KHI TRỪ prefix tên agent. Hãy rút gọn tiêu đề rồi gọi lại create; nếu đã dán lại prefix từ list thì bỏ bớt phần lặp'."
files_changed:
  - "src/services/ai/office/teamTools.ts"
  - "tests/services/ai/office/teamTools.test.ts"
oracle_type: "specified — schema/refusal là contract string gửi tới model; test khẳng định trực tiếp nội dung phải chứa cap và hướng dẫn rút gọn."
reproduction: "write_doc create với title 109 ký tự + agentName prefix (~16) => cap 104 => INVALID_ARGUMENT 'Tiêu đề quá dài (tối đa 104 ký tự).', agent không retry. Trong test: agentName 'An' prefix 5 => cap 115; title bare 120 => refusal."
verification:
  target_test: { result: pass }
  mutation_check:
    result: skipped
    reason: "Không có Stryker config/cài đặt trong repo. Thay thế = manual mutation: (1) revert schema description -> test 'advertises dynamic title cap' FAIL; (2) revert refusal message -> 2 tests 'shorten and retry'/'effective cap' FAIL. Cả 2 mutant đều bị giết => test assert root-cause behavior."
    mutant_killed: "2/2 (manual)"
  no_op_deletion: { result: pass, deletion_justified_by_rca: false }
  adjacent_tests:
    result: pass
    suites_run: ["tests/services/ai/office/teamTools.test.ts (75/75)"]
    note: "teamToolsGitRead.test.ts có 5 failures NHƯNG là pre-existing (xác nhận trên baseline đã stash fix); không phải hồi quy."
  revert_and_reconfirm:
    result: pass
    bug_returned_on_revert: true
    fixed_on_reapply: true
    note: "Stash fix -> manual mutant tái tạo đúng RED (schema thiếu cap, refusal thiếu hướng dẫn); apply lại -> 4/4 GREEN."
  guardrail_verdict: accepted
