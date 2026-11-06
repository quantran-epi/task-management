import React, { useState, useEffect } from 'react';
import { Tooltip, Button } from 'antd';
import {
  CodeOutlined,
  FileTextOutlined,
  CloseOutlined,
  ClearOutlined,
  ReloadOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
} from '@ant-design/icons';
import { useLayoutStore } from '../store/layoutStore';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { getSshConfigs } from '../../services/sshService';
import { RemoteTerminalPanel } from './RemoteTerminalPanel';
import type { SshConfig } from '../../types/ssh';

export interface BottomToolWindowProps {
  db?: TaskPlannerDatabase | undefined;
  children?: React.ReactNode;
  config?: SshConfig | undefined;
  repoPath?: string | undefined;
  onClear?: (() => void) | undefined;
  onReconnect?: (() => void) | undefined;
}

export function BottomToolWindow({
  children,
  config,
  repoPath,
  db = defaultDb,
  onClear,
  onReconnect,
}: BottomToolWindowProps) {
  const [activeTab, setActiveTab] = useState<'terminal' | 'output'>('terminal');
  const [isMaximized, setIsMaximized] = useState(false);
  const [resolvedConfig, setResolvedConfig] = useState<SshConfig | undefined>(config);

  const activeRemoteConfigId = useLayoutStore((s) => s.activeRemoteConfigId);
  const activeRemoteRepoPath = useLayoutStore((s) => s.activeRemoteRepoPath);
  const setPanelSize = useLayoutStore((s) => s.setPanelSize);
  const toggleToolWindow = useLayoutStore((s) => s.toggleToolWindow);

  useEffect(() => {
    if (config) {
      setResolvedConfig(config);
      return;
    }
    let mounted = true;
    getSshConfigs(db)
      .then((configs) => {
        if (!mounted) return;
        if (activeRemoteConfigId) {
          const match = configs.find((c) => c.id === activeRemoteConfigId);
          if (match) {
            setResolvedConfig(match);
            return;
          }
        }
        if (configs.length > 0 && configs[0]) {
          setResolvedConfig(configs[0]);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [config, db, activeRemoteConfigId]);

  const effectiveRepoPath = repoPath ?? (activeRemoteRepoPath || resolvedConfig?.defaultRemotePath || '');

  const handleToggleMaximize = () => {
    if (isMaximized) {
      setPanelSize('bottom', 30);
      setIsMaximized(false);
    } else {
      setPanelSize('bottom', 60);
      setIsMaximized(true);
    }
  };

  const handleClose = () => {
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
        {/* Left: Tab selectors */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            type="button"
            data-testid="bottom-tab-terminal"
            onClick={() => setActiveTab('terminal')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '3px 10px',
              fontSize: 'var(--font-size-small, 12px)',
              fontWeight: activeTab === 'terminal' ? 600 : 400,
              color:
                activeTab === 'terminal'
                  ? 'var(--accent, #3871e1)'
                  : 'var(--fg-secondary, #5f6269)',
              background:
                activeTab === 'terminal'
                  ? 'var(--bg-island, #ffffff)'
                  : 'transparent',
              border: 'none',
              borderBottom:
                activeTab === 'terminal'
                  ? '2px solid var(--accent, #3871e1)'
                  : '2px solid transparent',
              cursor: 'pointer',
              borderRadius: '3px 3px 0 0',
            }}
          >
            <CodeOutlined style={{ fontSize: 12 }} />
            <span>Terminal</span>
          </button>

          <button
            type="button"
            data-testid="bottom-tab-output"
            onClick={() => setActiveTab('output')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '3px 10px',
              fontSize: 'var(--font-size-small, 12px)',
              fontWeight: activeTab === 'output' ? 600 : 400,
              color:
                activeTab === 'output'
                  ? 'var(--accent, #3871e1)'
                  : 'var(--fg-secondary, #5f6269)',
              background:
                activeTab === 'output'
                  ? 'var(--bg-island, #ffffff)'
                  : 'transparent',
              border: 'none',
              borderBottom:
                activeTab === 'output'
                  ? '2px solid var(--accent, #3871e1)'
                  : '2px solid transparent',
              cursor: 'pointer',
              borderRadius: '3px 3px 0 0',
            }}
          >
            <FileTextOutlined style={{ fontSize: 12 }} />
            <span>Output</span>
          </button>
        </div>

        {/* Right: Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
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

          <Tooltip title={isMaximized ? 'Restore Panel Size' : 'Maximize Panel'}>
            <Button
              type="text"
              size="small"
              icon={
                isMaximized ? (
                  <FullscreenExitOutlined style={{ fontSize: 12 }} />
                ) : (
                  <FullscreenOutlined style={{ fontSize: 12 }} />
                )
              }
              onClick={handleToggleMaximize}
              style={{ width: 22, height: 22, padding: 0 }}
            />
          </Tooltip>

          <Tooltip title="Close Bottom Panel">
            <Button
              type="text"
              size="small"
              icon={<CloseOutlined style={{ fontSize: 12 }} />}
              onClick={handleClose}
              data-testid="bottom-panel-close-btn"
              style={{ width: 22, height: 22, padding: 0 }}
            />
          </Tooltip>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
        {activeTab === 'terminal' ? (
          children || (
            <RemoteTerminalPanel
              config={resolvedConfig}
              repoPath={effectiveRepoPath}
              db={db}
            />
          )
        ) : (
          <div
            style={{
              padding: 12,
              fontFamily: 'monospace',
              fontSize: 12,
              color: 'var(--fg-secondary, #5f6269)',
              height: '100%',
              overflow: 'auto',
            }}
          >
            Output logs are idle.
          </div>
        )}
      </div>
    </div>
  );
}
export default BottomToolWindow;
