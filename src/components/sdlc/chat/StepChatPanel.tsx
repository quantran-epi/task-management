import React, { useState, useEffect, useRef } from 'react';
import { theme, Button, Input, Space, Typography } from 'antd';
import { SendOutlined, RobotOutlined, ClearOutlined } from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../../db';
import { getStepThread } from '../../../services/wizard/sdlcCrManager';
import { saveMessage } from '../../../db/repositories/chatRepo';
import { streamChatEvents } from '../../../services/ai/nineRouterClient';
import { getNineRouterConfig, getNineRouterApiKey } from '../../../services/ai/nineRouterTokenService';
import type { SdlcStepId } from '../../../services/wizard/workflowSchemas';
import { renderSafeMarkdown } from '../../../utils/markdown';

export interface StepChatPanelProps {
  projectId: string;
  crId: string;
  stepId: SdlcStepId;
  stepGroundingContext?: string;
  db?: TaskPlannerDatabase;
}

export const StepChatPanel: React.FC<StepChatPanelProps> = ({
  projectId,
  crId,
  stepId,
  stepGroundingContext = '',
  db = defaultDb,
}) => {
  const { token } = theme.useToken();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  // Initialize or fetch isolated thread for this step
  useEffect(() => {
    let cancelled = false;
    async function loadThread() {
      if (!projectId || !crId || !stepId) return;
      try {
        const thread = await getStepThread(projectId, crId, stepId, db);
        if (!cancelled) {
          setThreadId(thread.id);
        }
      } catch {
        // Handled silently
      }
    }
    loadThread();
    return () => {
      cancelled = true;
    };
  }, [projectId, crId, stepId, db]);

  // Read messages strictly bound to this isolated step threadId
  const messages = useLiveQuery(
    () => (threadId ? db.chatMessages.where('threadId').equals(threadId).sortBy('createdAt') : []),
    [threadId, db]
  ) ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, streamingText]);

  const handleSendMessage = async () => {
    const text = inputText.trim();
    if (!text || !threadId || isStreaming) return;

    setInputText('');
    await saveMessage(
      {
        threadId,
        role: 'user',
        content: text,
      },
      db
    );

    // Call AI stream
    setIsStreaming(true);
    setStreamingText('');

    try {
      const config = await getNineRouterConfig(db);
      const apiKey = await getNineRouterApiKey(db);
      const systemPrompt = `Bạn là trợ lý AI chuyên gia hỗ trợ quy trình SDLC tại bước [${stepId}].
Ngữ cảnh kỹ thuật bước hiện tại:
${stepGroundingContext}

Hãy trả lời ngắn gọn, tập trung vào nhiệm vụ của bước [${stepId}], phân tích logic kỹ thuật và hỗ trợ người dùng đạt chuẩn bàn giao.`;

      const historyMsgs = messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

      const stream = streamChatEvents({
        endpoint: config.endpoint,
        apiKey: apiKey ?? '',
        payload: {
          model: config.model || 'gpt-4o',
          messages: [
            { role: 'system', content: systemPrompt },
            ...historyMsgs,
            { role: 'user', content: text },
          ],
        },
      });

      let accumulated = '';
      for await (const chunk of stream) {
        if (chunk.type === 'text') {
          accumulated += chunk.delta;
          setStreamingText(accumulated);
        }
      }

      if (accumulated.trim()) {
        await saveMessage(
          {
            threadId,
            role: 'assistant',
            content: accumulated,
          },
          db
        );
      }
    } catch (err: any) {
      await saveMessage(
        {
          threadId,
          role: 'assistant',
          content: `Lỗi kết nối AI: ${err?.message || 'Không thể tạo phản hồi'}`,
        },
        db
      );
    } finally {
      setIsStreaming(false);
      setStreamingText('');
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: token.colorBgContainer,
        borderLeft: `1px solid ${token.colorBorderSecondary}`,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Space size={8}>
          <RobotOutlined style={{ color: token.colorPrimary, fontSize: 16 }} />
          <Typography.Text strong style={{ fontSize: 13 }}>
            Trợ lý AI ({stepId})
          </Typography.Text>
        </Space>
      </div>

      {/* Messages Transcript */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {messages.length === 0 && !streamingText && (
          <div style={{ textAlign: 'center', margin: 'auto', color: token.colorTextSecondary, fontSize: 13 }}>
            Chưa có tin nhắn nào cho bước {stepId}. Hãy đặt câu hỏi hoặc yêu cầu AI hỗ trợ.
          </div>
        )}

        {messages.map((m) => {
          const isUser = m.role === 'user';
          return (
            <div
              key={m.id}
              style={{
                alignSelf: isUser ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                padding: '10px 14px',
                borderRadius: token.borderRadiusLG,
                background: isUser ? token.colorPrimary : token.colorFillAlter,
                color: isUser ? '#fff' : token.colorText,
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              {isUser ? (
                <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
              ) : (
                <div
                  dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(m.content) }}
                  style={{ overflowWrap: 'break-word' }}
                />
              )}
            </div>
          );
        })}

        {streamingText && (
          <div
            style={{
              alignSelf: 'flex-start',
              maxWidth: '85%',
              padding: '10px 14px',
              borderRadius: token.borderRadiusLG,
              background: token.colorFillAlter,
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            <div
              dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(streamingText) }}
              style={{ overflowWrap: 'break-word' }}
            />
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: 12, borderTop: `1px solid ${token.colorBorderSecondary}` }}>
        <Space orientation="horizontal" style={{ width: '100%' }}>
          <Input.TextArea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onPressEnter={(e) => {
              if (!e.shiftKey) {
                e.preventDefault();
                void handleSendMessage();
              }
            }}
            placeholder={`Hỏi AI trợ giúp bước này (${stepId})...`}
            autoSize={{ minRows: 1, maxRows: 4 }}
            disabled={isStreaming}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            loading={isStreaming}
            onClick={() => void handleSendMessage()}
          />
        </Space>
      </div>
    </div>
  );
};
