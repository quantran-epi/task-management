// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MermaidAssistantView } from '../MermaidAssistantView';
import * as mermaidFixer from '../../services/ai/mermaidFixerService';

// Mock mermaid module
vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockImplementation(async (id: string) => ({
      svg: `<svg id="${id}-svg"><g><text>Rendered Diagram</text></g></svg>`,
    })),
  },
}));

// Mock fake Dexie db
const mockDb = {
  notes: {
    get: vi.fn().mockResolvedValue(null),
    add: vi.fn().mockResolvedValue('note-1'),
    update: vi.fn().mockResolvedValue(1),
  },
  tasks: { toArray: vi.fn().mockResolvedValue([]) },
  changeRequests: { toArray: vi.fn().mockResolvedValue([]) },
  systems: { toArray: vi.fn().mockResolvedValue([]) },
} as any;

describe('MermaidAssistantView AI Prompt Modal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders expand button and opens modal for detailed AI prompt input', async () => {
    render(<MermaidAssistantView initialCode="flowchart TD\nStart --> End" db={mockDb} />);

    // Check AI diagram fixer label exists
    expect(screen.getByText('AI Diagram Fixer & Enhancer')).toBeInTheDocument();

    // Check expand button exists
    const expandBtn = screen.getByLabelText('Mở rộng soạn thảo AI prompt');
    expect(expandBtn).toBeInTheDocument();

    // Initially modal is not open
    expect(screen.queryByText('Soạn thảo yêu cầu AI Diagram Fixer & Enhancer')).not.toBeInTheDocument();

    // Click expand button to open modal
    fireEvent.click(expandBtn);

    // Modal should now be open
    expect(screen.getByText('Soạn thảo yêu cầu AI Diagram Fixer & Enhancer')).toBeInTheDocument();
    expect(screen.getByText('Gửi AI ngay')).toBeInTheDocument();
  });

  it('allows typing long prompt in modal and sends it to fixMermaidWithAi', async () => {
    const fixSpy = vi.spyOn(mermaidFixer, 'fixMermaidWithAi').mockResolvedValue({
      fixedCode: 'flowchart TD\nStart --> DB[(Database)] --> End',
    });

    render(<MermaidAssistantView initialCode="flowchart TD\nStart --> End" db={mockDb} />);

    // Open modal
    fireEvent.click(screen.getByLabelText('Mở rộng soạn thảo AI prompt'));

    // Type detailed multi-line prompt
    const modalTextarea = screen.getByPlaceholderText(/Bổ sung thêm luồng xử lý lỗi/i);
    fireEvent.change(modalTextarea, {
      target: { value: 'Thêm node Database dạng hình trụ nối giữa Start và End' },
    });

    // Click "Gửi AI ngay"
    const submitBtn = screen.getByText('Gửi AI ngay');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(fixSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'Thêm node Database dạng hình trụ nối giữa Start và End',
        })
      );
    });
  });
});
