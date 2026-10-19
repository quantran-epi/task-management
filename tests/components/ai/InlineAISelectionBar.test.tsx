import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  InlineAISelectionBar,
  calculatePopupPosition,
  GAP,
  type SelectionRectInfo,
} from '../../../src/components/ai/InlineAISelectionBar';
import { AIChatDrawer } from '../../../src/components/ai/AIChatDrawer';
import { AIChatProvider, useAIChat } from '../../../src/context/AIChatContext';
import { TaskPlannerDatabase } from '../../../src/db';
import * as selectionContextUtils from '../../../src/utils/selectionContext';
import * as nineRouterTokenService from '../../../src/services/ai/nineRouterTokenService';

describe('InlineAISelectionBar positioning math', () => {
  it('places popup strictly above selection when clearance exists (rect.top >= popupHeight + GAP + 10)', () => {
    const rect: SelectionRectInfo = {
      top: 200,
      bottom: 230,
      left: 100,
      right: 300,
      width: 200,
    };
    const popupWidth = 320;
    const popupHeight = 40;
    const viewportWidth = 1000;
    const scrollX = 0;
    const scrollY = 0;

    const result = calculatePopupPosition(rect, popupWidth, popupHeight, viewportWidth, scrollX, scrollY);

    expect(result.placedBelow).toBe(false);
    // y must be rect.top - popupHeight - GAP = 200 - 40 - 8 = 152
    expect(result.y).toBe(200 - 40 - GAP);
    // x centered: 100 + 100 - 160 = 40 (within margins 16 to 1000 - 320 - 16)
    expect(result.x).toBe(40);
  });

  it('flips popup strictly below selection when clearance is insufficient (rect.top < popupHeight + GAP + 10)', () => {
    const rect: SelectionRectInfo = {
      top: 30, // Near top of viewport
      bottom: 60,
      left: 100,
      right: 300,
      width: 200,
    };
    const popupWidth = 320;
    const popupHeight = 40;
    const viewportWidth = 1000;

    const result = calculatePopupPosition(rect, popupWidth, popupHeight, viewportWidth, 0, 0);

    expect(result.placedBelow).toBe(true);
    // y must be rect.bottom + GAP = 60 + 8 = 68
    expect(result.y).toBe(60 + GAP);
  });

  it('clamps horizontal position within viewport margins', () => {
    // Too far left
    const leftRect: SelectionRectInfo = {
      top: 200,
      bottom: 220,
      left: 10,
      right: 40,
      width: 30,
    };
    const leftResult = calculatePopupPosition(leftRect, 320, 40, 1000, 0, 0);
    expect(leftResult.x).toBe(16);

    // Too far right
    const rightRect: SelectionRectInfo = {
      top: 200,
      bottom: 220,
      left: 950,
      right: 990,
      width: 40,
    };
    const rightResult = calculatePopupPosition(rightRect, 320, 40, 1000, 0, 0);
    expect(rightResult.x).toBe(1000 - 320 - 16);
  });
});

describe('InlineAISelectionBar component mention workflow', () => {
  let db: TaskPlannerDatabase;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    db = new TaskPlannerDatabase(`test-inline-ai-${Date.now()}-${Math.random()}`);
    vi.spyOn(nineRouterTokenService, 'getNineRouterApiKey').mockResolvedValue('test-key');
    vi.spyOn(nineRouterTokenService, 'getNineRouterConfig').mockResolvedValue({
      endpoint: 'https://api.9router.com',
      defaultModel: 'gpt-4o',
      charLimit: 12000,
    });
  });

  it('renders "Mention vào Chat" button and populates AIChatDrawer input without auto-sending', async () => {
    vi.spyOn(selectionContextUtils, 'resolveEntityHierarchy').mockResolvedValue({
      targetType: 'task',
      targetId: 'task-123',
      targetTitle: 'Task Kiểm Thử',
      hierarchyPath: 'Dự án "Demo" > Tác vụ "Task Kiểm Thử"',
      fullContextText: 'Context content',
    });

    const TestShell = () => {
      const { isOpen, closeChat, activeScope } = useAIChat();
      return (
        <div>
          <InlineAISelectionBar db={db} />
          <AIChatDrawer
            open={isOpen}
            onClose={closeChat}
            db={db}
            activeScope={activeScope}
          />
        </div>
      );
    };

    render(
      <AIChatProvider>
        <TestShell />
      </AIChatProvider>
    );

    // Mock window selection
    const mockRange = {
      getBoundingClientRect: () => ({
        top: 250,
        bottom: 270,
        left: 200,
        right: 400,
        width: 200,
        height: 20,
      }),
    };

    const mockSelection = {
      isCollapsed: false,
      toString: () => 'Đoạn văn bản được chọn để kiểm thử draft mention',
      anchorNode: document.createElement('div'),
      getRangeAt: () => mockRange,
    };

    vi.spyOn(window, 'getSelection').mockReturnValue(mockSelection as any);

    // Trigger mouseup on document to show toolbar
    fireEvent.mouseUp(document);

    // Wait for the popup toolbar to appear with "Mention vào Chat" button
    const mentionBtn = await screen.findByRole('button', { name: /Mention vào Chat/i });
    expect(mentionBtn).toBeInTheDocument();

    // Click Mention button
    fireEvent.click(mentionBtn);

    // Wait for ChatDrawer textarea to open and have the draft value loaded
    const textarea = (await screen.findByLabelText('Nội dung tin nhắn trò chuyện AI')) as HTMLTextAreaElement;
    await waitFor(() => {
      expect(textarea.value).toContain('[Trích đoạn từ Dự án "Demo" > Tác vụ "Task Kiểm Thử"]');
      expect(textarea.value).toContain('> Đoạn văn bản được chọn để kiểm thử draft mention');
    });

    // Check that scope is attached to task-123 and not forced to global
    expect(screen.getByText(/Đang gắn ngữ cảnh: Task Kiểm Thử/i)).toBeInTheDocument();
  });
});
