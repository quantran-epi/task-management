import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MultiPackTable } from '../../../src/components/sdlc/pack/MultiPackTable';
import type { ChangePackHistoryItem } from '../../../src/services/wizard/sdlcCrManager';

describe('MultiPackTable', () => {
  const packs: ChangePackHistoryItem[] = [
    {
      hash: 'hash-pack-1',
      filename: 'change-pack-v1.zip',
      uploadedAt: '2026-11-01T10:00:00.000Z',
      fileSize: 1024 * 50,
      driftSummary: {
        outsideSolution: 1,
        missingImplementation: 0,
        divergent: 2,
      },
    },
    {
      hash: 'hash-pack-2',
      filename: 'change-pack-v2.zip',
      uploadedAt: '2026-11-01T11:00:00.000Z',
      fileSize: 1024 * 65,
      driftSummary: {
        outsideSolution: 0,
        missingImplementation: 0,
        divergent: 0,
      },
    },
  ];

  it('renders pack history and highlights ACTIVE pack', () => {
    render(
      <MultiPackTable
        packs={packs}
        activePackHash="hash-pack-2"
        onSelectActive={vi.fn()}
        onDeletePack={vi.fn()}
      />
    );

    expect(screen.getByText('change-pack-v1.zip')).toBeInTheDocument();
    expect(screen.getByText('change-pack-v2.zip')).toBeInTheDocument();

    // Active tag should be present on pack 2
    expect(screen.getByText('Đang kích hoạt')).toBeInTheDocument();
  });

  it('triggers onSelectActive when clicking set active button on inactive pack', () => {
    const handleSelectActive = vi.fn();

    render(
      <MultiPackTable
        packs={packs}
        activePackHash="hash-pack-2"
        onSelectActive={handleSelectActive}
        onDeletePack={vi.fn()}
      />
    );

    const activateBtn = screen.getByRole('button', { name: /Chọn làm Active/i });
    fireEvent.click(activateBtn);

    expect(handleSelectActive).toHaveBeenCalledWith('hash-pack-1');
  });

  it('triggers onDeletePack when clicking delete on inactive pack', async () => {
    const handleDeletePack = vi.fn();

    render(
      <MultiPackTable
        packs={packs}
        activePackHash="hash-pack-2"
        onSelectActive={vi.fn()}
        onDeletePack={handleDeletePack}
      />
    );

    const deleteBtn = screen.getByRole('button', { name: /Xóa pack/i });
    fireEvent.click(deleteBtn);

    // Popconfirm opens popup with 'Xóa' confirm button
    const confirmBtn = await screen.findByRole('button', { name: 'Xóa' });
    fireEvent.click(confirmBtn);

    expect(handleDeletePack).toHaveBeenCalledWith('hash-pack-1');
  });

  it('prevents deleting the active pack', () => {
    const handleDeletePack = vi.fn();

    render(
      <MultiPackTable
        packs={[packs[1]!]}
        activePackHash="hash-pack-2"
        onSelectActive={vi.fn()}
        onDeletePack={handleDeletePack}
      />
    );

    expect(screen.queryByRole('button', { name: /Xóa pack/i })).not.toBeInTheDocument();
  });
});
