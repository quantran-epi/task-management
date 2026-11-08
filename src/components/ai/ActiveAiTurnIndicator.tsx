import React, { useEffect, useState } from 'react';
import { Badge, Button, Dropdown, MenuProps, Tooltip, Typography, theme } from 'antd';
import { SyncOutlined, StopOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { aiTurnManager, useActiveAiTurns, type ActiveAiTurn } from '../../services/ai/aiTurnManager';
import { formatElapsedTicker } from '../../utils/time';
import { useAIChat } from '../../context/AIChatContext';
import { useLayoutStore } from '../../workbench/store/layoutStore';

export interface ActiveAiTurnIndicatorProps {
  compact?: boolean;
}

export const ActiveAiTurnIndicator: React.FC<ActiveAiTurnIndicatorProps> = ({ compact = false }) => {
  const { token } = theme.useToken();
  const activeTurns = useActiveAiTurns();
  const { openChat } = useAIChat();

  // Tick elapsed time every second while at least one turn is active
  const [, setTick] = useState(0);
  useEffect(() => {
    if (activeTurns.length === 0) return undefined;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [activeTurns.length]);

  if (!activeTurns || activeTurns.length === 0) {
    return null;
  }

  const handleOpenChat = (turn?: ActiveAiTurn) => {
    try {
      // In IntelliJ Workbench, ensure right tool window is open with ai_chat
      const setToolWindowActive = useLayoutStore.getState().setToolWindowActive;
      if (typeof setToolWindowActive === 'function') {
        setToolWindowActive('right', 'ai_chat');
      }
    } catch {}

    if (turn?.scopeKey) {
      openChat({ type: 'global', id: turn.scopeKey, title: turn.title });
    } else {
      openChat();
    }
  };

  const getElapsedSeconds = (startedAt: number) => {
    return Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  };

  // Single active turn capsule
  if (activeTurns.length === 1) {
    const turn = activeTurns[0]!;
    const elapsedSec = getElapsedSeconds(turn.startedAt);
    const statusText = turn.streamingStatusLabel || 'Đang phản hồi...';

    return (
      <div
        data-testid="active-ai-turn-capsule"
        onClick={() => handleOpenChat(turn)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: compact ? 6 : 8,
          padding: compact ? '1px 8px' : '2px 10px',
          background: token.colorFillAlter,
          borderRadius: compact ? 12 : 16,
          border: `1px solid ${token.colorBorderSecondary}`,
          height: compact ? 20 : 32,
          boxSizing: 'border-box',
          cursor: 'pointer',
        }}
        title="Nhấn để mở AI Chat"
      >
        <SyncOutlined
          spin
          data-testid="ai-turn-spinner"
          style={{
            fontSize: compact ? 11 : 13,
            color: token.colorPrimary,
            flexShrink: 0,
          }}
        />

        <div style={{ display: 'inline-flex', flexDirection: 'column', maxWidth: compact ? 130 : 160 }}>
          <Tooltip title={`${turn.title} (${statusText})`}>
            <Typography.Text
              ellipsis
              style={{
                fontSize: compact ? 11.5 : 13,
                fontWeight: 500,
                lineHeight: compact ? '14px' : 1.2,
                color: token.colorText,
              }}
            >
              {turn.title}
            </Typography.Text>
          </Tooltip>
        </div>

        <Typography.Text
          data-testid="ai-turn-elapsed"
          style={{
            fontVariantNumeric: 'tabular-nums',
            fontSize: compact ? 11.5 : 13,
            fontWeight: 600,
            color: token.colorPrimary,
            lineHeight: compact ? '14px' : 1.2,
          }}
        >
          {formatElapsedTicker(elapsedSec)}
        </Typography.Text>

        <Tooltip title="Dừng tiến trình AI">
          <Button
            type="text"
            size="small"
            data-testid="abort-ai-turn-btn"
            icon={<StopOutlined style={{ fontSize: compact ? 11 : 13, color: token.colorError }} />}
            onClick={(e) => {
              e.stopPropagation();
              aiTurnManager.abortTurn(turn.id);
            }}
            aria-label="Dừng tiến trình AI"
            style={{
              minWidth: compact ? 18 : 22,
              minHeight: compact ? 18 : 22,
              width: compact ? 18 : 22,
              height: compact ? 18 : 22,
              padding: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          />
        </Tooltip>
      </div>
    );
  }

  // Multi-turn dropdown menu
  const menuItems: MenuProps['items'] = [
    ...activeTurns.map((turn) => {
      const elapsedSec = getElapsedSeconds(turn.startedAt);
      const statusText = turn.streamingStatusLabel || 'Đang xử lý';

      return {
        key: turn.id,
        label: (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              minWidth: 260,
              padding: '4px 0',
            }}
            onClick={() => handleOpenChat(turn)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
              <SyncOutlined spin style={{ fontSize: 12, color: token.colorPrimary }} />
              <div style={{ minWidth: 0 }}>
                <Typography.Text strong ellipsis style={{ fontSize: 12, display: 'block' }}>
                  {turn.title}
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  {statusText}
                </Typography.Text>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <Typography.Text
                style={{
                  fontVariantNumeric: 'tabular-nums',
                  fontSize: 12,
                  fontWeight: 600,
                  color: token.colorPrimary,
                }}
              >
                {formatElapsedTicker(elapsedSec)}
              </Typography.Text>
              <Tooltip title="Dừng tiến trình này">
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<StopOutlined style={{ fontSize: 12 }} />}
                  onClick={(e) => {
                    e.stopPropagation();
                    aiTurnManager.abortTurn(turn.id);
                  }}
                  aria-label={`Dừng tiến trình ${turn.title}`}
                />
              </Tooltip>
            </div>
          </div>
        ),
      };
    }),
    {
      type: 'divider',
    },
    {
      key: 'abort-all',
      danger: true,
      label: (
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', padding: '2px 0' }}
          onClick={() => aiTurnManager.abortAll()}
        >
          <CloseCircleOutlined />
          <span>Dừng tất cả tiến trình AI</span>
        </div>
      ),
    },
  ];

  return (
    <Dropdown menu={{ items: menuItems }} placement="topRight" trigger={['click']}>
      <div
        data-testid="active-ai-turns-multi-capsule"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: compact ? 6 : 8,
          padding: compact ? '1px 8px' : '2px 10px',
          background: token.colorFillAlter,
          borderRadius: compact ? 12 : 16,
          border: `1px solid ${token.colorBorderSecondary}`,
          height: compact ? 20 : 32,
          boxSizing: 'border-box',
          cursor: 'pointer',
        }}
      >
        <Badge
          count={activeTurns.length}
          size="small"
          style={{
            backgroundColor: token.colorPrimary,
            boxShadow: 'none',
          }}
        />
        <Typography.Text
          style={{
            fontSize: compact ? 11.5 : 13,
            fontWeight: 500,
            lineHeight: compact ? '14px' : 1.2,
          }}
        >
          {activeTurns.length} tiến trình AI
        </Typography.Text>
        <SyncOutlined spin style={{ fontSize: compact ? 10 : 12, color: token.colorPrimary }} />
      </div>
    </Dropdown>
  );
};

export default ActiveAiTurnIndicator;
