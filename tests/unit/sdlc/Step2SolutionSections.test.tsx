import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Step2SolutionView } from '../../../src/components/sdlc/steps/Step2SolutionView';

/**
 * Plan 31.2-16 Task 1 — D-39 / UI-SPEC §5d.
 *
 * The solution artifact must render one section per CR target subsystem, with the subsystem
 * code as a cyan mono tag, and an explicit muted line for an unaffected subsystem.
 */
const UNAFFECTED_MARKER = 'Không có thay đổi ở subsystem này';

const SOLUTION = [
  '# SOLUTION — CR-1',
  '',
  '## Kiến trúc giải pháp mục tiêu',
  'Nội dung chung.',
  '',
  '### [SC-AUTH-API] Card Authorization API',
  '- Thay đổi: thêm endpoint kiểm tra hạn mức',
  '- File dự kiến: src/auth.ts',
  '',
  '### [SC-LEDGER] Card Ledger Service',
  UNAFFECTED_MARKER,
].join('\n');

const renderPreview = (props: Partial<React.ComponentProps<typeof Step2SolutionView>> = {}) => {
  render(
    <Step2SolutionView
      changeRequestId="p1"
      initialContent={SOLUTION}
      hasIntakeBaseline
      onCommitSolution={vi.fn().mockResolvedValue(undefined)}
      {...props}
    />
  );
  fireEvent.click(screen.getByText('Xem trước'));
};

describe('Step2SolutionView per-subsystem sections (D-39)', () => {
  it('renders the subsystem code as a tag beside the subsystem name', () => {
    renderPreview();

    expect(screen.getByText('SC-AUTH-API')).toBeInTheDocument();
    expect(screen.getByText('Card Authorization API')).toBeInTheDocument();
    expect(screen.getByText('SC-LEDGER')).toBeInTheDocument();
    expect(screen.getByText('Card Ledger Service')).toBeInTheDocument();
  });

  it('renders the unaffected marker as a muted line, not an empty section', () => {
    renderPreview();

    expect(screen.getByText(UNAFFECTED_MARKER)).toBeInTheDocument();
    expect(screen.queryByText(/Thay đổi: thêm endpoint kiểm tra hạn mức/)).toBeInTheDocument();
  });

  it('keeps the conventions summary card above the solution body', () => {
    renderPreview({ conventionsSummary: { globalText: 'Quy ước chung', sshStatus: 'connected' } });

    const card = screen.getByText(/Global:/i);
    const section = screen.getByText('Card Authorization API');
    expect(
      card.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('falls back to the plain markdown body when the solution has no subsystem sections', () => {
    render(
      <Step2SolutionView
        changeRequestId="p1"
        initialContent={'# SOLUTION\n\n## Kiến trúc\nNội dung.'}
        hasIntakeBaseline
        onCommitSolution={vi.fn().mockResolvedValue(undefined)}
      />
    );
    fireEvent.click(screen.getByText('Xem trước'));

    expect(screen.getByText('Kiến trúc')).toBeInTheDocument();
    expect(screen.queryByText(UNAFFECTED_MARKER)).toBeNull();
  });
});
