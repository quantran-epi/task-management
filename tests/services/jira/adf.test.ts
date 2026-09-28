import { describe, it, expect } from 'vitest';
import { textToAdf } from '../../../src/services/jira/adf';

describe('Atlassian Document Format v3 Serializer (adf.ts)', () => {
  it('handles empty or undefined text by returning empty content doc', () => {
    expect(textToAdf()).toEqual({
      version: 1,
      type: 'doc',
      content: [],
    });
    expect(textToAdf('')).toEqual({
      version: 1,
      type: 'doc',
      content: [],
    });
    expect(textToAdf('   \n  \t  ')).toEqual({
      version: 1,
      type: 'doc',
      content: [],
    });
  });

  it('converts single line text into a paragraph node with text node', () => {
    const result = textToAdf('Simple task description');
    expect(result).toEqual({
      version: 1,
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Simple task description' }],
        },
      ],
    });
  });

  it('converts multiline text into multiple paragraph nodes preserving line breaks', () => {
    const result = textToAdf('Line 1\nLine 2');
    expect(result).toEqual({
      version: 1,
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Line 1' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Line 2' }],
        },
      ],
    });
  });

  it('handles blank intermediate lines as empty paragraphs without text content', () => {
    const result = textToAdf('Line 1\n\nLine 3');
    expect(result).toEqual({
      version: 1,
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Line 1' }],
        },
        {
          type: 'paragraph',
          content: [],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Line 3' }],
        },
      ],
    });
  });
});
