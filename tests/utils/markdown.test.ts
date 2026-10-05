import { describe, it, expect } from 'vitest';
import { renderSafeMarkdown } from '../../src/utils/markdown';

describe('renderSafeMarkdown', () => {
  describe('inline code handling', () => {
    it('preserves identifiers with underscores inside backticks without turning them into italics', () => {
      const input = 'Check column `T_TRANS_TYPE` in database';
      const output = renderSafeMarkdown(input);
      expect(output).toContain('<code>T_TRANS_TYPE</code>');
      expect(output).not.toContain('<em>');
      expect(output).not.toContain('TTRANSTYPE');
    });

    it('handles multiple code spans with underscores', () => {
      const input = 'Use `SVFE_SHB.T_TRANS_TYPE` and `AUTH_STATUS_CODE`';
      const output = renderSafeMarkdown(input);
      expect(output).toContain('<code>SVFE_SHB.T_TRANS_TYPE</code>');
      expect(output).toContain('<code>AUTH_STATUS_CODE</code>');
      expect(output).not.toContain('<em>');
    });

    it('protects code spans containing dunders and bold markdown markers', () => {
      const input = 'Method `__init__` and `**not_bold**`';
      const output = renderSafeMarkdown(input);
      expect(output).toContain('<code>__init__</code>');
      expect(output).toContain('<code>**not_bold**</code>');
      expect(output).not.toContain('<strong>');
    });

    it('protects code spans containing asterisks and strikethrough', () => {
      const input = 'Formula `a * b * c` and `~~tilde~~`';
      const output = renderSafeMarkdown(input);
      expect(output).toContain('<code>a * b * c</code>');
      expect(output).toContain('<code>~~tilde~~</code>');
      expect(output).not.toContain('<em>');
      expect(output).not.toContain('<del>');
    });

    it('protects code spans containing URLs and links', () => {
      const input = 'Call `https://api.example.com` or `[text](url)`';
      const output = renderSafeMarkdown(input);
      expect(output).toContain('<code>https://api.example.com</code>');
      expect(output).toContain('<code>[text](url)</code>');
      expect(output).not.toContain('<a href');
    });

    it('supports double backticks for code with internal backtick', () => {
      const input = 'Here is ``code with ` backtick``';
      const output = renderSafeMarkdown(input);
      expect(output).toContain('<code>code with ` backtick</code>');
    });

    it('escapes raw HTML inside inline code safely', () => {
      const input = 'Type `List<String>` and `<script>alert(1)</script>`';
      const output = renderSafeMarkdown(input);
      expect(output).toContain('<code>List&lt;String&gt;</code>');
      expect(output).toContain('<code>&lt;script&gt;alert(1)&lt;/script&gt;</code>');
    });
  });

  describe('intra-word underscore preservation (plain text)', () => {
    it('does not italicize snake_case or database identifiers in plain text', () => {
      const input = 'Query table SVFE_SHB.T_TRANS_TYPE with user_id and order_id';
      const output = renderSafeMarkdown(input);
      expect(output).toContain('SVFE_SHB.T_TRANS_TYPE');
      expect(output).toContain('user_id');
      expect(output).toContain('order_id');
      expect(output).not.toContain('<em>');
    });

    it('still formats real standalone italic text with underscores', () => {
      const input = 'This is _italic text_ and _another_';
      const output = renderSafeMarkdown(input);
      expect(output).toContain('<em>italic text</em>');
      expect(output).toContain('<em>another</em>');
    });

    it('handles parenthesized italic with underscores', () => {
      const input = '(_italic in parens_)';
      const output = renderSafeMarkdown(input);
      expect(output).toContain('(<em>italic in parens</em>)');
    });

    it('does not format underscores surrounded by whitespace', () => {
      const input = 'This is _ not italic _ text';
      const output = renderSafeMarkdown(input);
      expect(output).toContain('_ not italic _');
      expect(output).not.toContain('<em>');
    });
  });

  describe('asterisk bold and italic', () => {
    it('formats *italic* and **bold** correctly', () => {
      const input = 'Normal *italic* and **bold** text';
      const output = renderSafeMarkdown(input);
      expect(output).toContain('<em>italic</em>');
      expect(output).toContain('<strong>bold</strong>');
    });

    it('does not format math multiplication asterisks as italic', () => {
      const input = 'Calculate 2 * 3 * 4 = 24';
      const output = renderSafeMarkdown(input);
      expect(output).toContain('2 * 3 * 4 = 24');
      expect(output).not.toContain('<em>');
    });

    it('formats bold containing italic text', () => {
      const input = '**bold and *italic* inside**';
      const output = renderSafeMarkdown(input);
      expect(output).toContain('<strong>bold and <em>italic</em> inside</strong>');
    });
  });

  describe('fenced code blocks and table integration', () => {
    it('renders fenced code blocks with code containing underscores', () => {
      const input = '```sql\nSELECT T_TRANS_TYPE FROM SVFE_SHB;\n```';
      const output = renderSafeMarkdown(input);
      expect(output).toContain('<code class="language-sql">SELECT T_TRANS_TYPE FROM SVFE_SHB;</code>');
    });

    it('renders table cells with inline code containing underscores', () => {
      const input = '| Column | Type |\n|---|---|\n| `T_TRANS_TYPE` | varchar |';
      const output = renderSafeMarkdown(input);
      expect(output).toContain('<code>T_TRANS_TYPE</code>');
      expect(output).not.toContain('<em>');
    });

    it('renders list items with inline code containing underscores', () => {
      const input = '- `T_TRANS_TYPE`: mã giao dịch\n- `AUTH_STATUS`: trạng thái xác thực';
      const output = renderSafeMarkdown(input);
      expect(output).toContain('<code>T_TRANS_TYPE</code>');
      expect(output).toContain('<code>AUTH_STATUS</code>');
      expect(output).not.toContain('<em>');
    });
  });
});
