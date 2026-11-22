import { describe, it, expect } from 'vitest';
import { foldForSearch, searchIncludes } from './searchText';
import { normalizeVietnamese } from './bm25';

describe('searchText fold', () => {
  it('folds all U/Ư diacritic variants to plain u', () => {
    expect(foldForSearch('  ƯỨỮỰỪỬŨũUu  ')).toBe('uuuuuuuuuu');
    expect(foldForSearch('Đường  ')).toBe('duong');
    expect(foldForSearch('')).toBe('');
  });

  it('matches across U/Ư variants in both directions', () => {
    expect(searchIncludes('Công việc Ưu tiên', 'uu')).toBe(true);
    expect(searchIncludes('Nhiệm vụ u', 'ư')).toBe(true);
    expect(searchIncludes('bản ghi Ũ', 'u')).toBe(true);
    expect(searchIncludes('abc', 'ư')).toBe(false);
  });

  it('delegates to canonical normalizeVietnamese without changing it', () => {
    expect(foldForSearch('Ứu ĐƯỜNG  ')).toBe(normalizeVietnamese('Ứu ĐƯỜNG  '));
    expect(normalizeVietnamese('Ưu điểm')).toBe('uu diem');
  });
});
