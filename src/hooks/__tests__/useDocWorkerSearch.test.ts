import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDocWorkerSearch } from '../useDocWorkerSearch';
import type { Note } from '../../types/models';

describe('useDocWorkerSearch', () => {
  const mockNotes: Note[] = [
    {
      id: 'doc-1',
      title: 'Học React và TypeScript',
      body: 'Hướng dẫn sử dụng hook và functional component cơ bản.',
      tags: ['frontend', 'react'],
      isPinned: false,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'doc-2',
      title: 'Tối ưu hóa Database IndexedDB',
      body: 'Sử dụng Dexie và Web Worker để tăng tốc tìm kiếm.',
      tags: ['database', 'performance'],
      isPinned: false,
      createdAt: '2026-01-02T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
    },
  ];

  it('returns null matchIds when query is empty', () => {
    const { result } = renderHook(() => useDocWorkerSearch(mockNotes, ''));
    expect(result.current.matchIds).toBeNull();
    expect(result.current.isSearching).toBe(false);
  });

  it('falls back to matchesDocSearch matching when Worker is unavailable in test environment', () => {
    const { result } = renderHook(() => useDocWorkerSearch(mockNotes, 'IndexedDB'));
    expect(result.current.matchIds).toEqual(['doc-2']);
  });

  it('matches multi-word queries across fields', () => {
    const { result } = renderHook(() => useDocWorkerSearch(mockNotes, 'React hook'));
    expect(result.current.matchIds).toEqual(['doc-1']);
  });
});
