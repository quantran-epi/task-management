import { describe, it, expect } from 'vitest';
import { matchesDocSearch } from '../../src/utils/docSearch';

describe('matchesDocSearch', () => {
  it('returns true for empty or whitespace-only search queries', () => {
    expect(matchesDocSearch('', { title: 'Doc 1' })).toBe(true);
    expect(matchesDocSearch('   ', { title: 'Doc 1', body: 'Body' })).toBe(true);
  });

  it('matches single word query against title or body', () => {
    const doc = { title: 'Meeting Notes', body: 'Discuss project architecture' };
    expect(matchesDocSearch('meeting', doc)).toBe(true);
    expect(matchesDocSearch('architecture', doc)).toBe(true);
    expect(matchesDocSearch('budget', doc)).toBe(false);
  });

  it('matches multi-word broken queries across title and body regardless of order', () => {
    const doc = {
      title: 'Design Specifications',
      body: 'Detailed system architecture and layout specs for 2026',
    };
    // "design" in title, "architecture" in body
    expect(matchesDocSearch('design architecture', doc)).toBe(true);
    // reversed order
    expect(matchesDocSearch('architecture design', doc)).toBe(true);
    // multiple spaces between words
    expect(matchesDocSearch('  design    specs   2026  ', doc)).toBe(true);
  });

  it('fails if any search word is missing from doc', () => {
    const doc = {
      title: 'Design Specifications',
      body: 'Detailed system architecture',
    };
    expect(matchesDocSearch('design architecture missingWord', doc)).toBe(false);
  });

  it('matches across tags and extraTexts', () => {
    const doc = {
      title: 'API Guide',
      body: 'Guide for integration',
      tags: ['backend', 'v2'],
    };
    const extraTexts = ['attachment_schema.json', 'Project Apollo'];

    // query matching tag and extraText
    expect(matchesDocSearch('backend apollo', doc, extraTexts)).toBe(true);
    // query matching title and attachment
    expect(matchesDocSearch('guide schema', doc, extraTexts)).toBe(true);
  });

  it('supports Vietnamese diacritic-insensitive matching', () => {
    const doc = {
      title: 'Kế hoạch phát triển',
      body: 'Hướng dẫn thiết kế chi tiết',
      tags: ['dự án'],
    };

    // Unaccented query matches accented content
    expect(matchesDocSearch('ke hoach', doc)).toBe(true);
    expect(matchesDocSearch('phat trien', doc)).toBe(true);
    expect(matchesDocSearch('thiet ke', doc)).toBe(true);
    expect(matchesDocSearch('du an', doc)).toBe(true);

    // Mixed query terms
    expect(matchesDocSearch('kế hoạch thiet ke', doc)).toBe(true);
    expect(matchesDocSearch('phat trien huong dan', doc)).toBe(true);

    // Negative case
    expect(matchesDocSearch('ke hoach bao cao', doc)).toBe(false);
  });
});
