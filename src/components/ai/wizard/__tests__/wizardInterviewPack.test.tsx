import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GapFillQuestionCard, type GapFillQuestion } from '../GapFillQuestionCard';

const openQuestion: GapFillQuestion = {
  id: 'gap-1',
  topic: '<img src=x onerror=alert(1)> Quy tắc hạn mức',
  description: 'Chưa rõ giá trị <script>alert(1)</script> trong mục II.2.',
  templateSection: 'PL02 II.2',
  suggestions: ['Theo CIF', 'Theo tài khoản'],
  evidenceSources: ['SOLUTION.md', '<b>Kiến trúc</b>', 'Nguồn 3', 'Nguồn 4'],
  answer: null,
  outcome: 'open',
};

describe('GapFillQuestionCard', () => {
  it('renders exact question copy and prefills suggestion without submitting', () => {
    const onSuggestion = vi.fn();
    const onSkip = vi.fn();
    render(<GapFillQuestionCard question={openQuestion} onSuggestion={onSuggestion} onSkip={onSkip} />);

    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(
      'Cần làm rõ: <img src=x onerror=alert(1)> Quy tắc hạn mức',
    );
    expect(screen.getByText('Chưa rõ giá trị <script>alert(1)</script> trong mục II.2.')).toBeInTheDocument();
    expect(screen.getByText('Nhập câu trả lời hoặc chọn gợi ý bên dưới')).toBeInTheDocument();
    expect(screen.getByText('Dựa trên 4 nguồn đã tra cứu: SOLUTION.md, <b>Kiến trúc</b>, Nguồn 3 và 1 nguồn khác')).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
    expect(document.querySelector('img')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Theo CIF' }));
    expect(onSuggestion).toHaveBeenCalledOnce();
    expect(onSuggestion).toHaveBeenCalledWith('gap-1', 'Theo CIF');
    expect(onSkip).not.toHaveBeenCalled();
  });

  it('skips explicit question as omitted without supplying an answer', () => {
    const onSkip = vi.fn();
    render(<GapFillQuestionCard question={openQuestion} onSuggestion={vi.fn()} onSkip={onSkip} />);

    fireEvent.click(screen.getByRole('button', { name: 'Bỏ qua mục này' }));
    expect(onSkip).toHaveBeenCalledWith('gap-1', 'omitted');
  });

  it('collapses answered and skipped questions into status summaries', () => {
    const { rerender } = render(
      <GapFillQuestionCard
        question={{ ...openQuestion, outcome: 'answered', answer: 'Áp dụng theo CIF' }}
        onSuggestion={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Đã trả lời: Áp dụng theo CIF');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    rerender(
      <GapFillQuestionCard
        question={{ ...openQuestion, outcome: 'omitted', answer: null }}
        onSuggestion={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Đã bỏ qua: (chưa cung cấp)');
  });

  it('uses 24px spacing when multiple question cards stack', () => {
    render(
      <div data-testid="stack" style={GapFillQuestionCard.stackStyle}>
        <GapFillQuestionCard question={openQuestion} onSuggestion={vi.fn()} onSkip={vi.fn()} />
        <GapFillQuestionCard question={{ ...openQuestion, id: 'gap-2' }} onSuggestion={vi.fn()} onSkip={vi.fn()} />
      </div>,
    );
    expect(screen.getByTestId('stack')).toHaveStyle({ gap: '24px' });
  });
});

describe('wizard pack and drift contracts', () => {
  it.todo('passes selected browser File identity through click, Enter, Space, and drop');
  it.todo('shows validated pack identity before explicit confirm and maps stable errors without raw paths');
  it.todo('renders three drift groups and blocks clean state for partial coverage');
});
