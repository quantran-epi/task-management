import { describe, it, expect } from 'vitest';
import {
  normalizeVietnamese,
  tokenize,
  rankBM25,
  extractRelevantSnippet,
  type BM25Document,
} from '../../src/utils/bm25';

describe('BM25 Lexical Ranking & Vietnamese Normalization (REQ-14.2, D-10, D-11)', () => {
  describe('normalizeVietnamese', () => {
    it('converts diacritic characters to base Latin and lowercases', () => {
      expect(normalizeVietnamese('Báo cáo tiến độ')).toBe('bao cao tien do');
      expect(normalizeVietnamese('Đơn vị ĐỒNG BẰNG')).toBe('don vi dong bang');
      expect(normalizeVietnamese('Kế hoạch sprint & dự án')).toBe('ke hoach sprint & du an');
    });

    it('handles empty and whitespace-only strings', () => {
      expect(normalizeVietnamese('')).toBe('');
      expect(normalizeVietnamese('   ')).toBe('');
    });
  });

  describe('tokenize', () => {
    it('extracts alpha-numeric word tokens with length > 1, stripping punctuation', () => {
      const tokens = tokenize('Báo cáo #1: Tiến độ dự án, SHB-2024!');
      expect(tokens).toEqual(['bao', 'cao', 'tien', 'do', 'du', 'an', 'shb', '2024']);
      expect(tokens.includes('1')).toBe(false); // length <= 1 filtered
    });

    it('returns empty array on punctuation-only input', () => {
      expect(tokenize('!@#$%^&*()')).toEqual([]);
    });
  });

  describe('rankBM25', () => {
    const docs: BM25Document[] = [
      {
        id: 'doc-title',
        title: 'Kiến trúc bảo mật hệ thống thanh toán',
        tags: ['architecture'],
        body: 'Tài liệu mô tả chi tiết quy trình xử lý giao dịch.',
      },
      {
        id: 'doc-tag',
        title: 'Tài liệu tổng quan dự án',
        tags: ['thanh toán', 'security'],
        body: 'Tổng quan các tính năng của phần mềm.',
      },
      {
        id: 'doc-body',
        title: 'Báo cáo hàng tuần',
        tags: ['weekly'],
        body: 'Hôm nay chúng tôi thảo luận về module thanh toán và bảo mật.',
      },
      {
        id: 'doc-unrelated',
        title: 'Hướng dẫn onboarding nhân sự',
        tags: ['hr'],
        body: 'Quy trình tiếp nhận nhân viên mới và cấp phát thiết bị.',
      },
    ];

    it('returns empty array when query is empty or doc list is empty', () => {
      expect(rankBM25('', docs)).toEqual([]);
      expect(rankBM25('   ', docs)).toEqual([]);
      expect(rankBM25('thanh toan', [])).toEqual([]);
    });

    it('ranks documents matching in Title higher than documents matching only in Body due to Title x3 weighting', () => {
      // Both doc-title and doc-body match 'thanh toan', but doc-title has it in title
      const results = rankBM25('thanh toan', [docs[0]!, docs[2]!]);
      expect(results.length).toBe(2);
      expect(results[0]?.doc.id).toBe('doc-title');
      expect(results[0]?.score).toBeGreaterThan(results[1]?.score ?? 0);
    });

    it('ranks documents matching in Tags higher than documents matching only in Body due to Tags x2 weighting', () => {
      // doc-tag has 'thanh toán' in tags, doc-body has it in body
      const results = rankBM25('thanh toan', [docs[1]!, docs[2]!]);
      expect(results.length).toBe(2);
      expect(results[0]?.doc.id).toBe('doc-tag');
      expect(results[0]?.score).toBeGreaterThan(results[1]?.score ?? 0);
    });

    it('matches non-diacritic query terms to documents containing diacritics', () => {
      const results = rankBM25('bao cao', docs);
      expect(results.some((r) => r.doc.id === 'doc-body')).toBe(true);
      expect(results[0]?.doc.id).toBe('doc-body');
    });

    it('excludes documents with score 0', () => {
      const results = rankBM25('onboarding', docs);
      expect(results.length).toBe(1);
      expect(results[0]?.doc.id).toBe('doc-unrelated');
    });
  });

  describe('extractRelevantSnippet', () => {
    const sampleBody = `
# Giới thiệu chung
Dự án PlannerMate hỗ trợ lập kế hoạch công việc và phân bổ thời gian.

## Kiến trúc bảo mật
Hệ thống sử dụng Web Crypto API với chuẩn AES-GCM 256 bit và PBKDF2 để mã hóa dữ liệu cục bộ trước khi đồng bộ.
Mọi khóa mã hóa được dẫn xuất từ passphrase của người dùng và không bao giờ lưu trữ trên đĩa.

## Tích hợp Jira
Hỗ trợ gọi REST API trực tiếp từ trình duyệt mà không cần máy chủ trung gian.
    `.trim();

    it('extracts the heading and lines surrounding the highest-scoring keyword match within maxChars budget', () => {
      const snippet = extractRelevantSnippet(sampleBody, 'AES-GCM PBKDF2 ma hoa', 500);
      expect(snippet).toContain('Kiến trúc bảo mật');
      expect(snippet).toContain('AES-GCM');
      expect(snippet).toContain('PBKDF2');
      expect(snippet.length).toBeLessThanOrEqual(500);
    });

    it('returns beginning of text if no query match found', () => {
      const snippet = extractRelevantSnippet(sampleBody, 'khong_ton_tai', 100);
      expect(snippet.length).toBeLessThanOrEqual(100);
      expect(snippet).toContain('Giới thiệu chung');
    });
  });
});
