import React, { useState, useEffect, useMemo } from 'react';
import { Tooltip, Button, Popconfirm, Select } from 'antd';
import {
  CodeOutlined,
  CloseOutlined,
  ClearOutlined,
  ReloadOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
  PlusOutlined,
  CloudServerOutlined,
} from '@ant-design/icons';
import { useLayoutStore } from '../store/layoutStore';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { getSshConfigs } from '../../services/sshService';
import { closePtySession } from '../../services/sshPtyService';
import { RemoteTerminalPanel } from './RemoteTerminalPanel';
import type { SshConfig } from '../../types/ssh';

export interface BottomToolWindowProps {
  db?: TaskPlannerDatabase | undefined;
  children?: React.ReactNode;
  config?: SshConfig | undefined;
  onClear?: (() => void) | undefined;
  onReconnect?: (() => void) | undefined;
}

export interface TerminalTabItem {
  id: string;
  title: string;
}

export function BottomToolWindow({
  children,
  config,
  db = defaultDb,
  onClear,
  onReconnect,
}: BottomToolWindowProps) {
  const [terminalTabs, setTerminalTabs] = useState<TerminalTabItem[]>([
    { id: 'term-1', title: 'Terminal 1' },
  ]);
  const [activeTerminalId, setActiveTerminalId] = useState<string>('term-1');
  const [configs, setConfigs] = useState<SshConfig[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState<string>(config?.id || '');

  const bottomActiveId = useLayoutStore((s) => s.bottomActiveId);
  const isBottomMaximized = useLayoutStore((s) => s.isBottomMaximized);
  const toggleBottomMaximize = useLayoutStore((s) => s.toggleBottomMaximize);
  const toggleToolWindow = useLayoutStore((s) => s.toggleToolWindow);

  // When bottom panel is reopened and has no tabs, automatically add 1 fresh terminal tab
  useEffect(() => {
    if (bottomActiveId === 'terminal' && terminalTabs.length === 0) {
      const newId = `term-${Date.now()}`;
      setTerminalTabs([{ id: newId, title: 'Terminal 1' }]);
      setActiveTerminalId(newId);
    }
  }, [bottomActiveId, terminalTabs.length]);

  useEffect(() => {
    let mounted = true;
    getSshConfigs(db)
      .then((saved) => {
        if (!mounted) return;
        setConfigs(saved);
        if (!selectedConfigId && saved.length > 0 && saved[0]) {
          setSelectedConfigId(saved[0].id);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [db, selectedConfigId]);

  const activeConfig = useMemo(() => {
    if (config) return config;
    return configs.find((c) => c.id === selectedConfigId) || configs[0];
  }, [config, configs, selectedConfigId]);

  const handleNewTab = () => {
    const nextIndex = terminalTabs.length + 1;
    const newId = `term-${Date.now()}`;
    const newTab: TerminalTabItem = {
      id: newId,
      title: `Terminal ${nextIndex}`,
    };
    setTerminalTabs((prev) => [...prev, newTab]);
    setActiveTerminalId(newId);
  };

  const handleCloseTab = (tabId: string) => {
    // Explicitly kill the remote SSH PTY session to prevent zombie processes
    closePtySession(tabId).catch(() => {});

    setTerminalTabs((prev) => {
      const remaining = prev.filter((t) => t.id !== tabId);
      if (remaining.length === 0) {
        // When closing the last terminal, close the bottom panel and clear all tabs
        toggleToolWindow('bottom', 'terminal');
        setActiveTerminalId('');
        return [];
      }
      if (activeTerminalId === tabId) {
        const closedIdx = prev.findIndex((t) => t.id === tabId);
        const nextActive = remaining[Math.min(closedIdx, remaining.length - 1)];
        if (nextActive) {
          setActiveTerminalId(nextActive.id);
        }
      }
      return remaining;
    });
  };

  const handleToggleMaximize = () => {
    toggleBottomMaximize();
  };

  const handleMinimize = () => {
    // Minimize panel: does NOT kill sessions, keeps background processes alive
    toggleToolWindow('bottom', 'terminal');
  };

  return (
    <div
      data-testid="bottom-tool-window"
      className="workbench-toolwindow-bottom"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        background: 'var(--bg-island, #ffffff)',
        overflow: 'hidden',
        borderTop: '1px solid var(--border, #e9eaee)',
      }}
    >
      {/* Header Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 32,
          padding: '0 8px',
          background: 'var(--bg-elev, #f7f8fa)',
          borderBottom: '1px solid var(--border, #e9eaee)',
          userSelect: 'none',
        }}
      >
        {/* Left: Dynamic Terminal Tabs list */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, overflowX: 'auto' }}>
          {terminalTabs.map((tab) => {
            const isActive = activeTerminalId === tab.id;
            return (
              <div
                key={tab.id}
                data-testid={`terminal-tab-${tab.id}`}
                onClick={() => setActiveTerminalId(tab.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '3px 8px',
                  fontSize: 'var(--font-size-small, 12px)',
                  fontWeight: isActive ? 600 : 400,
                  color: isActive
                    ? 'var(--accent, #3871e1)'
                    : 'var(--fg-secondary, #5f6269)',
                  background: isActive
                    ? 'var(--bg-island, #ffffff)'
                    : 'transparent',
                  border: 'none',
                  borderBottom: isActive
                    ? '2px solid var(--accent, #3871e1)'
                    : '2px solid transparent',
                  cursor: 'pointer',
                  borderRadius: '3px 3px 0 0',
                }}
              >
                <CodeOutlined style={{ fontSize: 12 }} />
                <span>{tab.title}</span>

                {/* Tab close button with confirmation prompt */}
                <Popconfirm
                  title="Đóng terminal này?"
                  description="Tiến trình đang chạy trên remote sẽ bị dừng hoàn toàn."
                  okText="Đóng"
                  cancelText="Hủy"
                  okButtonProps={{ danger: true, size: 'small' }}
                  cancelButtonProps={{ size: 'small' }}
                  onConfirm={(e) => {
                    e?.stopPropagation();
                    handleCloseTab(tab.id);
                  }}
                  onCancel={(e) => e?.stopPropagation()}
                >
                  <span
                    role="button"
                    tabIndex={0}
                    data-testid={`close-tab-${tab.id}`}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 16,
                      height: 16,
                      marginLeft: 2,
                      borderRadius: 2,
                      color: 'var(--fg-muted, #8c8f9c)',
                      cursor: 'pointer',
                    }}
                  >
                    <CloseOutlined style={{ fontSize: 10 }} />
                  </span>
                </Popconfirm>
              </div>
            );
          })}

          {/* New Tab button (+) */}
          <Tooltip title="Mở thêm Terminal mới (mở tại root)">
            <Button
              type="text"
              size="small"
              data-testid="new-terminal-tab-btn"
              icon={<PlusOutlined style={{ fontSize: 11 }} />}
              onClick={handleNewTab}
              style={{ width: 22, height: 22, padding: 0, marginLeft: 2 }}
            />
          </Tooltip>

          {/* SSH Target Host Selector (independent from File Explorer) */}
          {configs.length > 1 && (
            <Select
              size="small"
              value={activeConfig?.id}
              onChange={(newId) => setSelectedConfigId(newId)}
              style={{ width: 140, marginLeft: 8, fontSize: 11 }}
              options={configs.map((c) => ({
                label: c.name || `${c.username}@${c.host}`,
                value: c.id,
              }))}
            />
          )}
        </div>

        {/* Right: Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {activeConfig && (
            <span
              style={{
                fontSize: 11,
                color: 'var(--fg-muted, #8c8f9c)',
                marginRight: 6,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <CloudServerOutlined style={{ fontSize: 12, color: '#f59e0b' }} />
              {activeConfig.username}@{activeConfig.host}
            </span>
          )}

          {onClear && (
            <Tooltip title="Clear Terminal">
              <Button
                type="text"
                size="small"
                icon={<ClearOutlined style={{ fontSize: 12 }} />}
                onClick={onClear}
                style={{ width: 22, height: 22, padding: 0 }}
              />
            </Tooltip>
          )}

          {onReconnect && (
            <Tooltip title="Reconnect Session">
              <Button
                type="text"
                size="small"
                icon={<ReloadOutlined style={{ fontSize: 12 }} />}
                onClick={onReconnect}
                style={{ width: 22, height: 22, padding: 0 }}
              />
            </Tooltip>
          )}

          <Tooltip title={isBottomMaximized ? 'Restore Panel Size' : 'Maximize Panel'}>
            <Button
              type="text"
              size="small"
              icon={
                isBottomMaximized ? (
                  <FullscreenExitOutlined style={{ fontSize: 12 }} />
                ) : (
                  <FullscreenOutlined style={{ fontSize: 12 }} />
                )
              }
              onClick={handleToggleMaximize}
              style={{ width: 22, height: 22, padding: 0 }}
            />
          </Tooltip>

          <Tooltip title="Thu nhỏ Bottom Panel (Tiến trình vẫn tiếp tục chạy)">
            <Button
              type="text"
              size="small"
              icon={<CloseOutlined style={{ fontSize: 12 }} />}
              onClick={handleMinimize}
              data-testid="bottom-panel-close-btn"
              style={{ width: 22, height: 22, padding: 0 }}
            />
          </Tooltip>
        </div>
      </div>

      {/* Body: Keep all active tabs mounted at root so background tasks never pause */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
        {children ||
          terminalTabs.map((tab) => (
            <div
              key={tab.id}
              style={{
                display: activeTerminalId === tab.id ? 'flex' : 'none',
                flexDirection: 'column',
                width: '100%',
                height: '100%',
              }}
            >
              <RemoteTerminalPanel
                sessionId={tab.id}
                config={activeConfig}
                db={db}
                isActive={activeTerminalId === tab.id}
              />
            </div>
          ))}
      </div>
    </div>
  );
}
export default BottomToolWindow;

