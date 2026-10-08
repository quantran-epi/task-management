import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AIChatDrawer } from '../../../src/components/ai/AIChatDrawer';
import { TaskPlannerDatabase } from '../../../src/db';
import * as desktopNotification from '../../../src/utils/desktopNotification';
import * as nineRouterClient from '../../../src/services/ai/nineRouterClient';
import * as nineRouterTokenService from '../../../src/services/ai/nineRouterTokenService';
import * as graphitiMcpClient from '../../../src/services/ai/graphitiMcpClient';
import { APP_NAME } from '../../../src/constants/app';

vi.mock('../../../src/utils/pptxExport', () => ({
  exportPresentationAsFile: vi.fn(),
}));

describe('AIChatDrawer - Desktop Notification on completion', () => {
  let db: TaskPlannerDatabase;
  const originalHidden = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
  const originalHasFocus = Document.prototype.hasFocus;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.spyOn(graphitiMcpClient, 'getGraphitiMcpToolDefinitions').mockResolvedValue([]);
    vi.spyOn(nineRouterTokenService, 'getNineRouterApiKey').mockResolvedValue('test-api-key');
    vi.spyOn(nineRouterTokenService, 'getNineRouterConfig').mockResolvedValue({
      endpoint: 'https://api.9router.com',
      defaultModel: 'gpt-4o',
      charLimit: 12000,
    });
    vi.spyOn(desktopNotification, 'isNotificationPermissionGranted').mockResolvedValue(true);
    vi.spyOn(desktopNotification, 'requestNotificationPermission').mockResolvedValue(true);
    vi.spyOn(desktopNotification, 'sendDesktopNotification').mockResolvedValue(true);

    db = new TaskPlannerDatabase(`test-aichat-notif-${Date.now()}-${Math.random()}`);
  });

  afterEach(() => {
    if (originalHidden) {
      Object.defineProperty(Document.prototype, 'hidden', originalHidden);
    }
    Document.prototype.hasFocus = originalHasFocus;
  });

  it('requests notification permission on drawer open if not granted', async () => {
    vi.spyOn(desktopNotification, 'isNotificationPermissionGranted').mockResolvedValue(false);
    const requestSpy = vi.spyOn(desktopNotification, 'requestNotificationPermission').mockResolvedValue(true);

    render(
      React.createElement(AIChatDrawer, {
        open: true,
        onClose: vi.fn(),
        db,
        activeScope: { type: 'global' },
      })
    );

    await waitFor(() => {
      expect(requestSpy).toHaveBeenCalled();
    });
  });

  it('dispatches desktop notification when AI finishes while document is hidden', async () => {
    Object.defineProperty(Document.prototype, 'hidden', {
      configurable: true,
      get: () => true,
    });
    Document.prototype.hasFocus = () => false;

    const mockResponseText = `Đây là câu trả lời thử nghiệm từ trợ lý AI của ${APP_NAME}.`;
    vi.spyOn(nineRouterClient, 'streamChatEvents').mockImplementation(async function* () {
      yield { type: 'text', delta: mockResponseText };
    } as any);
    vi.spyOn(nineRouterClient, 'streamChatCompletion').mockImplementation(async function* () {
      yield mockResponseText;
    } as any);

    render(
      React.createElement(AIChatDrawer, {
        open: true,
        onClose: vi.fn(),
        db,
        activeScope: { type: 'global' },
      })
    );

    const textarea = screen.getByLabelText('Nội dung tin nhắn trò chuyện AI');
    fireEvent.change(textarea, { target: { value: 'Xin chào' } });
    fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));

    await waitFor(() => {
      expect(desktopNotification.sendDesktopNotification).toHaveBeenCalledWith({
        title: `${APP_NAME} AI`,
        body: mockResponseText,
        tag: 'ai-turn-finished',
      });
    });
  });

  it('dispatches desktop notification with truncated body if response exceeds 120 chars when blurred', async () => {
    Object.defineProperty(Document.prototype, 'hidden', {
      configurable: true,
      get: () => false,
    });
    Document.prototype.hasFocus = () => false; // blurred

    const longResponseText = 'A'.repeat(150);
    vi.spyOn(nineRouterClient, 'streamChatEvents').mockImplementation(async function* () {
      yield { type: 'text', delta: longResponseText };
    } as any);
    vi.spyOn(nineRouterClient, 'streamChatCompletion').mockImplementation(async function* () {
      yield longResponseText;
    } as any);

    render(
      React.createElement(AIChatDrawer, {
        open: true,
        onClose: vi.fn(),
        db,
        activeScope: { type: 'global' },
      })
    );

    const textarea = screen.getByLabelText('Nội dung tin nhắn trò chuyện AI');
    fireEvent.change(textarea, { target: { value: 'Tin nhắn dài' } });
    fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));

    await waitFor(() => {
      expect(desktopNotification.sendDesktopNotification).toHaveBeenCalledWith({
        title: `${APP_NAME} AI`,
        body: 'A'.repeat(120) + '...',
        tag: 'ai-turn-finished',
      });
    });
  });

  it('does NOT dispatch desktop notification when document is visible and focused', async () => {
    Object.defineProperty(Document.prototype, 'hidden', {
      configurable: true,
      get: () => false,
    });
    Document.prototype.hasFocus = () => true;

    const mockResponseText = 'Câu trả lời khi đang active.';
    vi.spyOn(nineRouterClient, 'streamChatEvents').mockImplementation(async function* () {
      yield { type: 'text', delta: mockResponseText };
    } as any);
    vi.spyOn(nineRouterClient, 'streamChatCompletion').mockImplementation(async function* () {
      yield mockResponseText;
    } as any);

    render(
      React.createElement(AIChatDrawer, {
        open: true,
        onClose: vi.fn(),
        db,
        activeScope: { type: 'global' },
      })
    );

    const textarea = screen.getByLabelText('Nội dung tin nhắn trò chuyện AI');
    fireEvent.change(textarea, { target: { value: 'Đang xem tab' } });
    fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));

    await waitFor(() => {
      expect(screen.getByText(mockResponseText)).toBeInTheDocument();
    });

    expect(desktopNotification.sendDesktopNotification).not.toHaveBeenCalled();
  });
});
