import React from 'react';
import { Select, Button, Tooltip, Popover, Badge, Switch, Typography, theme } from 'antd';
import {
  ReloadOutlined,
  ExperimentFilled,
  ExperimentOutlined,
  ThunderboltFilled,
  ThunderboltOutlined,
  ClearOutlined,
  ApiOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import type { McpServerConfig } from '../../services/ai/mcpClient';

export interface ChatTabToolboxProps {
  // Tab ID
  activeTabId: string;

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

  // Clear context
  onClearContext: () => void;
}

export const ChatTabToolbox: React.FC<ChatTabToolboxProps> = ({
  activeTabId,
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
  onClearContext,
}) => {
  const { token } = theme.useToken();
  const enabledMcpCount = mcpServers.filter((s) => s.enabled).length;

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
        <Typography.Text strong style={{ fontSize: 12 }}>
          Máy chủ MCP
        </Typography.Text>
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
                onChange={(checked) => onToggleMcpServer?.(server.id, checked)}
                aria-label={`Bật/tắt ${server.name}`}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <span style={{ fontSize: 11, color: token.colorTextSecondary }}>Mô hình:</span>
        <Select
          size="small"
          value={selectedModel}
          onChange={onModelChange}
          showSearch
          filterOption={(input, option) =>
            ((option?.label as string) ?? '').toLowerCase().includes(input.toLowerCase())
          }
          style={{ width: 145 }}
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
              style={{ width: 22, height: 22, padding: 0 }}
            />
          </Tooltip>
        )}
      </div>

      {/* Right controls: Tab Toggles (Analysis mode, Auto-approve, MCP, Clear context) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
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

        {/* MCP Tab Toggle & Server List Management */}
        <div style={{ display: 'inline-flex', alignItems: 'center' }}>
          {onToggleMcpEnabled && (
            <Tooltip title={mcpEnabled ? "Công cụ MCP tab này: ĐANG BẬT" : "Công cụ MCP tab này: ĐANG TẮT"}>
              <Button
                size="small"
                data-testid="tab-mcp-btn"
                aria-label={mcpEnabled ? "Tắt công cụ MCP tab này" : "Bật công cụ MCP tab này"}
                type={mcpEnabled ? 'primary' : 'default'}
                icon={<ApiOutlined />}
                onClick={() => onToggleMcpEnabled(activeTabId)}
                style={{
                  fontSize: 11,
                  padding: '0 6px',
                  height: 22,
                  borderTopRightRadius: 0,
                  borderBottomRightRadius: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                MCP
              </Button>
            </Tooltip>
          )}

          <Popover
            content={mcpPopoverContent}
            title={null}
            trigger="click"
            placement="bottomRight"
            getPopupContainer={(node) => node.parentElement || document.body}
          >
            <Tooltip title={`Danh sách máy chủ MCP (${enabledMcpCount} máy chủ đang bật)`}>
              <Badge
                count={enabledMcpCount}
                size="small"
                offset={[-2, 2]}
                style={{ backgroundColor: enabledMcpCount > 0 ? '#10b981' : token.colorTextQuaternary }}
              >
                <Button
                  size="small"
                  type={mcpEnabled ? 'primary' : 'default'}
                  icon={<SettingOutlined style={{ fontSize: 10 }} />}
                  aria-label="Quản lý danh sách máy chủ MCP"
                  data-testid="tab-mcp-manage-btn"
                  style={{
                    height: 22,
                    padding: '0 4px',
                    borderTopLeftRadius: onToggleMcpEnabled ? 0 : undefined,
                    borderBottomLeftRadius: onToggleMcpEnabled ? 0 : undefined,
                    borderLeft: onToggleMcpEnabled ? 0 : undefined,
                  }}
                />
              </Badge>
            </Tooltip>
          </Popover>
        </div>

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
      </div>
    </div>
  );
};
