import React from 'react';
import { Select, Button, Tooltip, Switch, Tag, theme, Space } from 'antd';
import {
  ReloadOutlined,
  ExperimentFilled,
  ExperimentOutlined,
  ThunderboltFilled,
  ThunderboltOutlined,
  ClearOutlined,
  DisconnectOutlined,
} from '@ant-design/icons';
import type { ActiveScope } from '../../context/AIChatContext';

export interface ChatTabToolboxProps {
  // Model
  selectedModel: string;
  availableModels: string[];
  onModelChange: (model: string) => void;
  onRefreshModels?: () => Promise<void> | void;
  isRefreshingModels?: boolean;

  // Analysis mode (tab-isolated)
  analysisMode?: boolean;
  onToggleAnalysisMode?: () => void;

  // Auto-approve mutations (tab-isolated)
  autoApproveMutations?: boolean;
  onToggleAutoApproveMutations?: () => void;

  // Scope / Context
  currentScope: ActiveScope;
  onOpenScopePicker: () => void;
  onDetachScope: () => void;

  // Clear context
  onClearContext: () => void;
}

export const ChatTabToolbox: React.FC<ChatTabToolboxProps> = ({
  selectedModel,
  availableModels,
  onModelChange,
  onRefreshModels,
  isRefreshingModels = false,
  analysisMode = false,
  onToggleAnalysisMode,
  autoApproveMutations = false,
  onToggleAutoApproveMutations,
  currentScope,
  onOpenScopePicker,
  onDetachScope,
  onClearContext,
}) => {
  const { token } = theme.useToken();

  return (
    <div
      data-testid="chat-tab-toolbox"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 12px',
        background: token.colorFillAlter,
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
        gap: 8,
        fontSize: 12,
        boxSizing: 'border-box',
      }}
    >
      {/* Left controls: Scope + Model */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
        {/* Scope pill */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 8px',
            background: token.colorBgContainer,
            border: `1px solid ${token.colorBorderSecondary}`,
            borderRadius: token.borderRadiusSM,
            maxWidth: 160,
          }}
        >
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: 11,
              fontWeight: 500,
              color: currentScope.type === 'global' ? token.colorTextSecondary : token.colorPrimary,
            }}
            title={currentScope.title || currentScope.type}
          >
            {currentScope.type === 'global'
              ? 'Toàn cục'
              : currentScope.title || currentScope.id}
          </span>
          <Button
            type="link"
            size="small"
            onClick={onOpenScopePicker}
            style={{ padding: 0, height: 'auto', fontSize: 11 }}
          >
            Đổi
          </Button>
          {currentScope.type !== 'global' && (
            <Button
              type="text"
              size="small"
              icon={<DisconnectOutlined style={{ fontSize: 10 }} />}
              onClick={onDetachScope}
              title="Gỡ gắn ngữ cảnh"
              style={{ padding: 0, height: 'auto', width: 14, color: token.colorTextSecondary }}
            />
          )}
        </div>

        {/* Model selector */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Select
            size="small"
            value={selectedModel}
            onChange={onModelChange}
            showSearch
            filterOption={(input, option) =>
              ((option?.label as string) ?? '').toLowerCase().includes(input.toLowerCase())
            }
            style={{ width: 135 }}
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
            <Tooltip title="Làm mới mô hình">
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
      </div>

      {/* Right controls: Tab Toggles (Analysis mode, Auto-approve, Clear context) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {/* Analysis Mode Toggle */}
        {onToggleAnalysisMode && (
          <Tooltip title={analysisMode ? "Chế độ phân tích: ĐANG BẬT (AI chỉ đọc dữ liệu & tra cứu tri thức)" : "Chế độ phân tích: ĐANG TẮT (Bật để AI ưu tiên tra cứu tri thức/DB)"}>
            <Button
              size="small"
              type={analysisMode ? 'primary' : 'default'}
              icon={analysisMode ? <ExperimentFilled data-testid="analysis-mode-header-tag" /> : <ExperimentOutlined />}
              onClick={onToggleAnalysisMode}
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

        {/* Auto Approve Toggle */}
        {onToggleAutoApproveMutations && (
          <Tooltip title={autoApproveMutations ? "Tự động duyệt thay đổi: ĐANG BẬT (AI tự động ghi DB)" : "Tự động duyệt thay đổi: ĐANG TẮT (Hỏi xác nhận trước khi sửa DB)"}>
            <Button
              size="small"
              type={autoApproveMutations ? 'primary' : 'default'}
              danger={autoApproveMutations}
              icon={autoApproveMutations ? <ThunderboltFilled /> : <ThunderboltOutlined />}
              onClick={onToggleAutoApproveMutations}
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
            style={{ width: 22, height: 22, padding: 0, color: token.colorTextSecondary }}
          />
        </Tooltip>
      </div>
    </div>
  );
};
