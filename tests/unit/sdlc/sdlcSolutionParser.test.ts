import { describe, it, expect } from 'vitest';
import { extractSolutionMarkdown, extractChatSummary } from '../../../src/utils/sdlcSolutionParser';

describe('extractSolutionMarkdown', () => {
  it('returns empty string for falsy input', () => {
    expect(extractSolutionMarkdown('')).toBe('');
    expect(extractSolutionMarkdown(undefined as any)).toBe('');
  });

  it('strips thinking blocks and extracts markdown fenced block with SOLUTION heading', () => {
    const raw = `<think>
Architectural design thought process...
Need Redis and PostgreSQL.
</think>
Here is the design:
\`\`\`markdown
# SOLUTION — CR-2026-01 FaceID
## 1. Overview
Scope of FaceID.
\`\`\`
Hope this helps!`;

    const extracted = extractSolutionMarkdown(raw);
    expect(extracted).toContain('# SOLUTION — CR-2026-01 FaceID');
    expect(extracted).toContain('## 1. Overview');
    expect(extracted).not.toContain('<think>');
    expect(extracted).not.toContain('Hope this helps!');
  });

  it('extracts plain markdown starting from # SOLUTION if no fenced codeblock is present', () => {
    const raw = `<think>Analyzing...</think>
# SOLUTION — Hệ thống chuyển tiền
## 1. Tổng quan
Chi tiết giải pháp chuyển tiền.
## 2. API
POST /api/transfer`;

    const extracted = extractSolutionMarkdown(raw);
    expect(extracted.startsWith('# SOLUTION — Hệ thống chuyển tiền')).toBe(true);
    expect(extracted).toContain('POST /api/transfer');
    expect(extracted).not.toContain('<think>');
  });

  it('falls back to clean stripped response if no explicit # SOLUTION marker exists', () => {
    const raw = `<think>Thinking...</think>## Kiến trúc sơ bộ
Tích hợp cổng thanh toán.`;

    const extracted = extractSolutionMarkdown(raw);
    expect(extracted).toBe('## Kiến trúc sơ bộ\nTích hợp cổng thanh toán.');
  });

  describe('extractChatSummary', () => {
    it('returns empty string for falsy input', () => {
      expect(extractChatSummary('')).toBe('');
      expect(extractChatSummary(undefined as any)).toBe('');
    });

    it('extracts conversational text outside fenced solution block', () => {
      const raw = `<think>Thought</think>Đã hoàn thành phân tích kiến trúc giải pháp. Vui lòng xem chi tiết tại trình soạn thảo bên trái.
\`\`\`markdown
# SOLUTION — CR-2026-01 FaceID
## 1. Overview
Scope of FaceID.
\`\`\`
Nếu bạn muốn bổ sung thêm trường dữ liệu nào, hãy báo cho tôi nhé!`;

      const summary = extractChatSummary(raw);
      expect(summary).toContain('Đã hoàn thành phân tích kiến trúc giải pháp.');
      expect(summary).toContain('Nếu bạn muốn bổ sung thêm trường dữ liệu nào, hãy báo cho tôi nhé!');
      expect(summary).not.toContain('# SOLUTION — CR-2026-01 FaceID');
      expect(summary).not.toContain('Scope of FaceID');
    });

    it('extracts leading conversational text before explicit # SOLUTION heading when no code block', () => {
      const raw = `Dưới đây là thiết kế kiến trúc chi tiết. Vui lòng xem trình soạn thảo bên trái:
# SOLUTION — Chuyển tiền
## 1. Tổng quan
Nội dung chi tiết.`;

      const summary = extractChatSummary(raw);
      expect(summary).toContain('Dưới đây là thiết kế kiến trúc chi tiết');
      expect(summary).not.toContain('## 1. Tổng quan');
    });

    it('returns default notice if text contains only solution without summary', () => {
      const raw = `\`\`\`markdown
# SOLUTION — Chuyển tiền
## 1. Tổng quan
\`\`\``;

      const summary = extractChatSummary(raw);
      expect(summary).toContain('trình soạn thảo bên trái');
    });
  });
});
