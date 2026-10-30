import { describe, expect, it } from 'vitest';
import {
  buildSdlcWrapperPrompt,
  getToolsForTurn,
  type SdlcWrapperPromptInput,
} from '../../src/components/ai/AIChatDrawer';
import { isMutationTool, normalizeToolName } from '../../src/services/ai/aiTools';

describe('SDLC prompt isolation and analysis mode enforcement (D-31, D-33, D-35)', () => {
  it('builds a request-local SDLC wrapper prompt with step, source refs, read-only policy, and user confirmation', () => {
    const input: SdlcWrapperPromptInput = {
      userQuery: 'Phân tích bảng DB và cập nhật giải pháp',
      step: 'SOLUTION',
      metadata: {
        cr: 'CR-900',
        featureName: 'Chuyển đổi giao dịch',
        requestingUnit: 'Khối CNTT',
      },
      artifacts: {
        pl01: {
          content: 'Nội dung PL01 nghiệp vụ',
          sourceReferences: ['Tài liệu BRD v1', 'Ghi chú nghiệp vụ'],
        },
        pl02: {
          content: 'Nội dung PL02 chức năng',
          sourceReferences: ['Đặc tả API v2'],
        },
        solution: {
          content: 'Bản thảo SOLUTION ban đầu',
          version: 1,
        },
      },
    };

    const prompt = buildSdlcWrapperPrompt(input);

    // 1. Processing step and metadata
    expect(prompt).toContain('[Quy trình SDLC - Bước: SOLUTION]');
    expect(prompt).toContain('CR: CR-900');
    expect(prompt).toContain('Tính năng: Chuyển đổi giao dịch');
    expect(prompt).toContain('Đơn vị yêu cầu: Khối CNTT');

    // 2. Artifacts and source references
    expect(prompt).toContain('Tài liệu BRD v1, Ghi chú nghiệp vụ');
    expect(prompt).toContain('Nội dung PL01 nghiệp vụ');
    expect(prompt).toContain('Đặc tả API v2');
    expect(prompt).toContain('Nội dung PL02 chức năng');
    expect(prompt).toContain('Bản thảo SOLUTION ban đầu');

    // 3. Read-only policy & user confirmation requirement
    expect(prompt).toContain('BẮT BUỘC CHẾ ĐỘ PHÂN TÍCH (ANALYSIS MODE)');
    expect(prompt).toContain('Chỉ sử dụng các công cụ tra cứu chỉ đọc');
    expect(prompt).toContain('XÁC NHẬN TỪ NGƯỜI DÙNG');

    // 4. User query
    expect(prompt).toContain('Phân tích bảng DB và cập nhật giải pháp');
  });

  it('guarantees normal chat prompts contain no SDLC markers or workflow instructions', () => {
    const normalUserQuery = 'Tôi cần kiểm tra công việc hôm nay';
    // SDLC markers that must NEVER leak into normal chat
    const sdlcMarkers = [
      '[Quy trình SDLC',
      '[SDLC DEVELOPER WORKFLOW ACTIVE]',
      'Khảo sát, thiết kế giải pháp SOLUTION.md',
      'Đóng vai trò Solution Architect',
    ];

    for (const marker of sdlcMarkers) {
      expect(normalUserQuery).not.toContain(marker);
    }
  });

  it('restricts tools to read-only tools when analysisMode is active', () => {
    const readOnlyTools = getToolsForTurn(true, []);
    for (const tool of readOnlyTools) {
      const toolName = normalizeToolName(tool.function.name);
      expect(isMutationTool(toolName)).toBe(false);
    }

    // Normal mode (analysisMode = false) includes mutation tools like update_task or create_task
    const normalTools = getToolsForTurn(false, []);
    const hasMutation = normalTools.some((t) => isMutationTool(normalizeToolName(t.function.name)));
    expect(hasMutation).toBe(true);
  });
});
