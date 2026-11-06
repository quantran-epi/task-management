import React from 'react';
import { Select, Button, Tooltip, Popover, Badge, Switch, Typography, Dropdown, theme } from 'antd';
import type { MenuProps } from 'antd';
import {
  ReloadOutlined,
  ExperimentFilled,
  ExperimentOutlined,
  ThunderboltFilled,
  ThunderboltOutlined,
  ClearOutlined,
  ApiOutlined,
  DatabaseOutlined,
  FolderOpenOutlined,
  SettingOutlined,
  MoreOutlined,
} from '@ant-design/icons';
import type { McpServerConfig } from '../../services/ai/mcpClient';

export interface ChatTabToolboxProps {
  // Tab ID
  activeTabId: string;

  // Compact layout (e.g. for SDLC StepChatPanel or narrow sidebars)
  compact?: boolean;

  // Model (tab-isolated)
  selectedModel: string;
  availableModels: string[];
  onModelChange: (model: string) => void;
  onRefreshModels?: () => Promise<void> | void;
  isRefreshingModels?: boolean;

  // Analysis mode (tab-isolated)
  analysisMode?: boolean;
  onToggleAnalysisMode?: (tabId: string) => void;

  // Auto-approve mutations (tab-isolated)
  autoApproveMutations?: boolean;
  onToggleAutoApproveMutations?: (tabId: string) => void;

  // MCP Enabled (tab-isolated)
  mcpEnabled?: boolean;
  onToggleMcpEnabled?: (tabId: string) => void;
  mcpServers?: McpServerConfig[];
  onToggleMcpServer?: (id: string, enabled: boolean) => void;
  onOpenMcpSettings?: () => void;

  // Oracle SQLcl (remote connection for AI tool loop)
  onOpenOracleSettings?: () => void;
  oracleToolEnabled?: boolean;

  // SSH File System (remote connection for AI tool loop)
  onOpenSshFsSettings?: () => void;
  sshFsToolEnabled?: boolean;

  // Clear context
  onClearContext: () => void;
}

export const ChatTabToolbox: React.FC<ChatTabToolboxProps> = ({
  activeTabId,
  compact = false,
  selectedModel,
  availableModels,
  onModelChange,
  onRefreshModels,
  isRefreshingModels = false,
  analysisMode = false,
  onToggleAnalysisMode,
  autoApproveMutations = false,
  onToggleAutoApproveMutations,
  mcpEnabled = true,
  onToggleMcpEnabled,
  mcpServers = [],
  onToggleMcpServer,
  onOpenMcpSettings,
  onOpenOracleSettings,
  oracleToolEnabled = false,
  onOpenSshFsSettings,
  sshFsToolEnabled = false,
  onClearContext,
}) => {
  const { token } = theme.useToken();
  const enabledMcpCount = mcpServers.filter((s) => s.enabled).length;
  // MCP is considered active if tab-level mcpEnabled is true AND at least one server is enabled
  const isMcpActive = mcpEnabled && enabledMcpCount > 0;

  // Master toggle handler: toggles tab mcpEnabled and if turning on with 0 servers, turns on first server
  const handleMasterMcpToggle = (checked: boolean) => {
    if (onToggleMcpEnabled) {
      if (checked !== mcpEnabled) {
        onToggleMcpEnabled(activeTabId);
      }
    }
    // If turning on and no server is enabled, enable all available servers
    if (checked && enabledMcpCount === 0 && mcpServers.length > 0 && onToggleMcpServer) {
      for (const server of mcpServers) {
        onToggleMcpServer(server.id, true);
      }
    } else if (!checked && onToggleMcpServer) {
      // If user explicitly turns off master switch in popover, disable all servers
      for (const server of mcpServers) {
        if (server.enabled) {
          onToggleMcpServer(server.id, false);
        }
      }
    }
  };

  const mcpPopoverContent = (
    <div style={{ width: 260 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
          paddingBottom: 6,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Typography.Text strong style={{ fontSize: 12 }}>
            Máy chủ MCP
          </Typography.Text>
          <Switch
            size="small"
            checked={isMcpActive}
            onChange={handleMasterMcpToggle}
            aria-label="Bật/tắt toàn bộ MCP"
          />
        </div>
        {onOpenMcpSettings && (
          <Button
            type="link"
            size="small"
            icon={<SettingOutlined />}
            onClick={onOpenMcpSettings}
            style={{ padding: 0, fontSize: 11 }}
          >
            Cài đặt
          </Button>
        )}
      </div>

      {mcpServers.length === 0 ? (
        <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', padding: '8px 0' }}>
          Chưa có máy chủ MCP nào. Thêm trong Cài đặt.
        </Typography.Text>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
          {mcpServers.map((server) => (
            <div
              key={server.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '4px 0',
              }}
            >
              <div style={{ minWidth: 0, flex: 1, marginRight: 8 }}>
                <Typography.Text
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    display: 'block',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {server.name}
                </Typography.Text>
                <Typography.Text
                  type="secondary"
                  style={{
                    fontSize: 10,
                    display: 'block',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {server.url}
                </Typography.Text>
              </div>
              <Switch
                size="small"
                checked={server.enabled}
                onChange={(checked) => {
                  onToggleMcpServer?.(server.id, checked);
                  // Auto-enable tab-level mcpEnabled if enabling a server
                  if (checked && !mcpEnabled && onToggleMcpEnabled) {
                    onToggleMcpEnabled(activeTabId);
                  }
                }}
                aria-label={`Bật/tắt ${server.name}`}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // Compact dropdown menu items when compact={true}
  const compactMenuItems: MenuProps['items'] = [
    ...(onToggleAnalysisMode
      ? [
          {
            key: 'analysis-mode',
            label: (
              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleAnalysisMode(activeTabId);
                }}
              >
                <span>Chế độ phân tích (chỉ đọc)</span>
                <Switch size="small" checked={analysisMode} />
              </div>
            ),
            icon: analysisMode ? <ExperimentFilled style={{ color: token.colorPrimary }} /> : <ExperimentOutlined />,
          },
        ]
      : []),
    ...(onToggleAutoApproveMutations
      ? [
          {
            key: 'auto-approve',
            label: (
              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleAutoApproveMutations(activeTabId);
                }}
              >
                <span>Tự động duyệt thay đổi</span>
                <Switch size="small" checked={autoApproveMutations} />
              </div>
            ),
            icon: autoApproveMutations ? <ThunderboltFilled style={{ color: token.colorError }} /> : <ThunderboltOutlined />,
          },
        ]
      : []),
    ...(onOpenOracleSettings
      ? [
          {
            key: 'oracle-sqlcl',
            label: 'Cấu hình Oracle SQLcl',
            icon: (
              <DatabaseOutlined
                style={{ color: oracleToolEnabled ? token.colorPrimary : undefined }}
              />
            ),
            onClick: onOpenOracleSettings,
          },
        ]
      : []),
    ...(onOpenSshFsSettings
      ? [
          {
            key: 'ssh-fs',
            label: 'Cấu hình SSH File System',
            icon: (
              <FolderOpenOutlined
                style={{ color: sshFsToolEnabled ? token.colorPrimary : undefined }}
              />
            ),
            onClick: onOpenSshFsSettings,
          },
        ]
      : []),
    {
      type: 'divider',
    },
    {
      key: 'clear-context',
      label: 'Đặt lại hội thoại (/clear)',
      icon: <ClearOutlined />,
      onClick: onClearContext,
    },
  ];

  return (
    <div
      data-testid="chat-tab-toolbox"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '5px 12px',
        background: token.colorFillAlter,
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
        gap: 8,
        fontSize: 12,
        boxSizing: 'border-box',
      }}
    >
      {/* Left controls: Tab Model selection */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
        <span style={{ fontSize: 11, color: token.colorTextSecondary, flexShrink: 0 }}>Mô hình:</span>
        <Select
          size="small"
          value={selectedModel}
          onChange={onModelChange}
          showSearch
          filterOption={(input, option) =>
            ((option?.label as string) ?? '').toLowerCase().includes(input.toLowerCase())
          }
          style={{ minWidth: 110, maxWidth: 170, flex: 1 }}
          popupMatchSelectWidth={false}
          getPopupContainer={(node) => node.parentElement || document.body}
          popupStyle={{ zIndex: 1300 }}
          aria-label="Chọn mô hình AI cho tab này"
          options={
            availableModels.length > 0
              ? availableModels.map((m) => ({ label: m, value: m }))
              : selectedModel
                ? [{ label: selectedModel, value: selectedModel }]
                : []
          }
        />

        {onRefreshModels && (
          <Tooltip title="Làm mới danh sách mô hình">
            <Button
              type="text"
              size="small"
              aria-label="Làm mới danh sách mô hình"
              icon={<ReloadOutlined spin={isRefreshingModels} />}
              onClick={onRefreshModels}
              loading={isRefreshingModels}
              style={{ width: 22, height: 22, padding: 0, flexShrink: 0 }}
            />
          </Tooltip>
        )}
      </div>

      {/* Right controls: Tab Toggles (Analysis mode, Auto-approve, MCP, Clear context) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {compact ? (
          <>
            {/* Unified MCP Popover Button in compact mode */}
            <Popover
              content={mcpPopoverContent}
              title={null}
              trigger="click"
              placement="bottomRight"
              getPopupContainer={(node) => node.parentElement || document.body}
            >
              <Tooltip title={isMcpActive ? `MCP: ĐANG BẬT (${enabledMcpCount} máy chủ)` : "MCP: ĐANG TẮT"}>
                <Badge
                  count={enabledMcpCount}
                  size="small"
                  offset={[-2, 2]}
                  style={{ backgroundColor: isMcpActive ? '#10b981' : token.colorTextQuaternary }}
                >
                  <Button
                    size="small"
                    type={isMcpActive ? 'primary' : 'default'}
                    icon={<ApiOutlined />}
                    aria-label="Quản lý máy chủ MCP"
                    data-testid="tab-mcp-manage-btn"
                    style={{
                      fontSize: 11,
                      padding: '0 6px',
                      height: 22,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    MCP
                  </Button>
                </Badge>
              </Tooltip>
            </Popover>

            {/* Dropdown menu for auxiliary options in compact mode */}
            <Dropdown menu={{ items: compactMenuItems }} trigger={['click']} placement="bottomRight">
              <Button
                size="small"
                type="text"
                icon={<MoreOutlined />}
                aria-label="Tùy chọn bổ sung"
                data-testid="tab-compact-more-btn"
                style={{ width: 22, height: 22, padding: 0, color: token.colorTextSecondary }}
              />
            </Dropdown>
          </>
        ) : (
          <>
            {/* Analysis Mode Toggle */}
            {onToggleAnalysisMode && (
              <Tooltip title={analysisMode ? "Chế độ phân tích: ĐANG BẬT (AI chỉ đọc dữ liệu & tra cứu tri thức)" : "Chế độ phân tích: ĐANG TẮT (Bật để AI ưu tiên tra cứu tri thức/DB)"}>
                <Button
                  size="small"
                  type={analysisMode ? 'primary' : 'default'}
                  icon={analysisMode ? <ExperimentFilled data-testid="analysis-mode-header-tag" /> : <ExperimentOutlined />}
                  onClick={() => onToggleAnalysisMode(activeTabId)}
                  style={{
                    fontSize: 11,
                    padding: '0 6px',
                    height: 22,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  Phân tích
                </Button>
              </Tooltip>
            )}

            {/* Unified Single MCP Popover Toggle Button */}
            <Popover
              content={mcpPopoverContent}
              title={null}
              trigger="click"
              placement="bottomRight"
              getPopupContainer={(node) => node.parentElement || document.body}
            >
              <Tooltip title={isMcpActive ? `MCP: ĐANG BẬT (${enabledMcpCount} máy chủ)` : "MCP: ĐANG TẮT (Bấm để bật và chọn máy chủ)"}>
                <Badge
                  count={enabledMcpCount}
                  size="small"
                  offset={[-2, 2]}
                  style={{ backgroundColor: isMcpActive ? '#10b981' : token.colorTextQuaternary }}
                >
                  <Button
                    size="small"
                    type={isMcpActive ? 'primary' : 'default'}
                    icon={<ApiOutlined />}
                    aria-label="Quản lý và bật/tắt MCP"
                    data-testid="tab-mcp-btn"
                    data-manage-testid="tab-mcp-manage-btn"
                    style={{
                      fontSize: 11,
                      padding: '0 6px',
                      height: 22,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    MCP
                  </Button>
                </Badge>
              </Tooltip>
            </Popover>

            {/* Auto Approve Toggle */}
            {onToggleAutoApproveMutations && (
              <Tooltip title={autoApproveMutations ? "Tự động duyệt thay đổi: ĐANG BẬT (AI tự động ghi DB)" : "Tự động duyệt thay đổi: ĐANG TẮT (Hỏi xác nhận trước khi sửa DB)"}>
                <Button
                  size="small"
                  data-testid="tab-auto-approve-btn"
                  type={autoApproveMutations ? 'primary' : 'default'}
                  danger={autoApproveMutations}
                  icon={autoApproveMutations ? <ThunderboltFilled /> : <ThunderboltOutlined />}
                  onClick={() => onToggleAutoApproveMutations(activeTabId)}
                  style={{
                    fontSize: 11,
                    padding: '0 6px',
                    height: 22,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  Tự duyệt
                </Button>
              </Tooltip>
            )}

            {/* Oracle SQLcl Remote Tool Config Button */}
            {onOpenOracleSettings && (
              <Tooltip
                title={
                  oracleToolEnabled
                    ? 'Oracle SQLcl: ĐANG BẬT (Bấm để xem/đổi kết nối remote)'
                    : 'Oracle SQLcl: Bấm để chọn SSH & kết nối DB cho AI'
                }
              >
                <Button
                  size="small"
                  type={oracleToolEnabled ? 'primary' : 'default'}
                  icon={<DatabaseOutlined />}
                  onClick={onOpenOracleSettings}
                  aria-label="Cấu hình Oracle SQLcl"
                  data-testid="tab-oracle-btn"
                  style={{
                    fontSize: 11,
                    padding: '0 6px',
                    height: 22,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  Oracle
                </Button>
              </Tooltip>
            )}

            {/* SSH File System Remote Tool Config Button */}
            {onOpenSshFsSettings && (
              <Tooltip
                title={
                  sshFsToolEnabled
                    ? 'SSH File System: ĐANG BẬT (Bấm để xem/đổi máy chủ remote)'
                    : 'SSH File System: Bấm để chọn SSH duyệt file/log cho AI'
                }
              >
                <Button
                  size="small"
                  type={sshFsToolEnabled ? 'primary' : 'default'}
                  icon={<FolderOpenOutlined />}
                  onClick={onOpenSshFsSettings}
                  aria-label="Cấu hình SSH File System"
                  data-testid="tab-ssh-fs-btn"
                  style={{
                    fontSize: 11,
                    padding: '0 6px',
                    height: 22,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  SSH Files
                </Button>
              </Tooltip>
            )}

            {/* Clear Context Button */}
            <Tooltip title="Đặt lại ngữ cảnh hội thoại (/clear)">
              <Button
                type="text"
                size="small"
                icon={<ClearOutlined />}
                onClick={onClearContext}
                aria-label="Đặt lại ngữ cảnh (/clear)"
                style={{ width: 22, height: 22, padding: 0, color: token.colorTextSecondary }}
              />
            </Tooltip>
          </>
        )}
      </div>
    </div>
  );
};
