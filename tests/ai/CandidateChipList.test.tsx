import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CandidateChipList } from '../../src/components/ai/grounded/CandidateChipList';

describe('CandidateChipList', () => {
  it('1. Candidate variant renders items with kind tag + URN tooltip', () => {
    const handleSelect = vi.fn();
    const items = [
      { id: '1', label: 'Tiến trình 60000006', kind: 'PROCESS', urn: 'urn:taskmate:sys:CORE' },
    ];

    render(
      <CandidateChipList
        items={items}
        variant="candidate"
        onSelect={handleSelect}
      />
    );

    expect(screen.getByText('Tiến trình 60000006')).toBeInTheDocument();
    expect(screen.getByText('PROCESS')).toBeInTheDocument();
  });

  it('2. Refinement variant renders items without URN tooltip', () => {
    const handleSelect = vi.fn();
    const items = [
      { id: '1', label: 'Thu hẹp theo tiến trình 60000006' },
    ];

    render(
      <CandidateChipList
        items={items}
        variant="refinement"
        onSelect={handleSelect}
      />
    );

    expect(screen.getByText('Thu hẹp theo tiến trình 60000006')).toBeInTheDocument();
    expect(screen.queryByText('PROCESS')).not.toBeInTheDocument();
  });

  it('3. Max 3 chips rendered when 5 items passed', () => {
    const items = [
      { id: '1', label: 'Mục 1' },
      { id: '2', label: 'Mục 2' },
      { id: '3', label: 'Mục 3' },
      { id: '4', label: 'Mục 4' },
      { id: '5', label: 'Mục 5' },
    ];

    render(
      <CandidateChipList
        items={items}
        variant="refinement"
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByText('Mục 1')).toBeInTheDocument();
    expect(screen.getByText('Mục 2')).toBeInTheDocument();
    expect(screen.getByText('Mục 3')).toBeInTheDocument();
    expect(screen.queryByText('Mục 4')).not.toBeInTheDocument();
    expect(screen.queryByText('Mục 5')).not.toBeInTheDocument();
  });

  it('4. Enter/Space activate onSelect', () => {
    const handleSelect = vi.fn();
    const items = [{ id: '1', label: 'Mục 1' }];

    render(
      <CandidateChipList
        items={items}
        variant="refinement"
        onSelect={handleSelect}
      />
    );

    const chip = screen.getByRole('button', { name: 'Mục 1' });
    fireEvent.keyDown(chip, { key: 'Enter', code: 'Enter' });
    expect(handleSelect).toHaveBeenCalledWith(items[0]);

    fireEvent.keyDown(chip, { key: ' ', code: 'Space' });
    expect(handleSelect).toHaveBeenCalledTimes(2);
  });

  it('5. aria-label includes full URN for candidate chips', () => {
    const items = [
      { id: '1', label: 'Tiến trình 60000006', kind: 'PROCESS', urn: 'urn:taskmate:sys:CORE' },
    ];

    render(
      <CandidateChipList
        items={items}
        variant="candidate"
        onSelect={vi.fn()}
      />
    );

    const chip = screen.getByRole('button', {
      name: 'Tiến trình 60000006 (PROCESS) urn:taskmate:sys:CORE',
    });
    expect(chip).toBeInTheDocument();
  });
});
