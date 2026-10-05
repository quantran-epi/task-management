import React, { useState } from 'react';
import {
  Typography,
  Button,
  Segmented,
  Tag,
  Space,
  Empty,
  Popconfirm,
  theme,
  Tooltip,
} from 'antd';
import {
  CheckOutlined,
  UndoOutlined,
  FileTextOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import type { DiffFile, DiffViewMode } from '../../types/agent';
import { DiffHunkView } from './DiffHunkView';
import { DiffInlineCommentModal } from './DiffInlineCommentModal';

const { Text } = Typography;

export interface AgentDiffReviewerProps {
  diffFiles: DiffFile[];
  totalAdditions: number;
  totalDeletions: number;
  viewMode: DiffViewMode;
  onViewModeChange: (mode: DiffViewMode) => void;
  selectedFilePath: string | null;
  onSelectFilePath: (path: string | null) => void;
  selectedFile: DiffFile | null;
  loading: boolean;
  onRefreshDiff?: () => Promise<void>;
  onAcceptAll: () => Promise<string>;
  onRevertAll: () => Promise<void>;
  onRevertFile: (filePath: string) => Promise<void>;
  onSendFeedback?: (formattedPrompt: string) => Promise<void>;
}

export const AgentDiffReviewer: React.FC<AgentDiffReviewerProps> = ({
  diffFiles,
  totalAdditions,
  totalDeletions,
  viewMode,
  onViewModeChange,
  selectedFilePath,
  onSelectFilePath,
  selectedFile,
  loading,
  onRefreshDiff,
  onAcceptAll,
  onRevertAll,
  onRevertFile,
  onSendFeedback,
}) => {
  const { token } = theme.useToken();
  const [acting, setActing] = useState(false);

  // Inline feedback modal state
  const [commentModalOpen, setCommentModalOpen] = useState(false);
  const [commentTarget, setCommentTarget] = useState<{
    filePath: string;
    lineNumber: number;
    code: string;
  }>({ filePath: '', lineNumber: 0, code: '' });

  const handleLineClick = (filePath: string, lineNumber: number, code: string) => {
    if (!onSendFeedback) return;
    setCommentTarget({ filePath, lineNumber, code });
    setCommentModalOpen(true);
  };

  const handleAcceptAll = async () => {
    setActing(true);
    try {
      await onAcceptAll();
    } finally {
      setActing(false);
    }
  };

  const handleRevertAll = async () => {
    setActing(true);
    try {
      await onRevertAll();
    } finally {
      setActing(false);
    }
  };

  const handleRevertCurrentFile = async (filePath: string) => {
    setActing(true);
    try {
      await onRevertFile(filePath);
    } finally {
      setActing(false);
    }
  };

  const hasChanges = diffFiles.length > 0;

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: token.colorBgContainer,
        overflow: 'hidden',
      }}
    >
      {/* Top Action Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <Space orientation="horizontal" size={8}>
          <Segmented
            value={viewMode}
            onChange={(val) => onViewModeChange(val as DiffViewMode)}
            options={[
              { label: 'Unified', value: 'unified' },
              { label: 'Side-by-side', value: 'split' },
            ]}
            size="small"
          />

          <Tag color="success" style={{ margin: 0, fontWeight: 600 }}>
            +{totalAdditions}
          </Tag>
          <Tag color="error" style={{ margin: 0, fontWeight: 600 }}>
            -{totalDeletions}
          </Tag>
          {onRefreshDiff && (
            <Tooltip title="Làm mới diff">
              <Button
                size="small"
                type="text"
                icon={<ReloadOutlined spin={loading} />}
                onClick={() => void onRefreshDiff()}
              />
            </Tooltip>
          )}
        </Space>

        <Space orientation="horizontal" size={8}>
          <Popconfirm
            title="Hủy bỏ tất cả thay đổi"
            description="Hoàn tác toàn bộ thay đổi mã nguồn trong worktree này? Tiến trình chưa commit sẽ bị xóa."
            onConfirm={handleRevertAll}
            okText="Hủy tất cả"
            cancelText="Đóng"
            okButtonProps={{ danger: true }}
            disabled={!hasChanges || acting}
          >
            <Button
              size="small"
              danger
              icon={<UndoOutlined />}
              disabled={!hasChanges || acting}
            >
              Revert All
            </Button>
          </Popconfirm>

          <Button
            size="small"
            type="primary"
            icon={<CheckOutlined />}
            style={{ backgroundColor: '#4f46e5' }}
            onClick={handleAcceptAll}
            loading={acting}
            disabled={!hasChanges}
          >
            Accept All
          </Button>
        </Space>
      </div>

      {/* Main Diff Content Pane (File List on Left + Code Diff on Right) */}
      {!hasChanges && !loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Chưa có thay đổi mã nguồn nào"
          />
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* File List Sidebar */}
          <div
            style={{
              width: 220,
              borderRight: `1px solid ${token.colorBorderSecondary}`,
              overflowY: 'auto',
              backgroundColor: token.colorFillAlter,
              display: 'flex',
              flexDirection: 'column',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                padding: '6px 10px',
                fontSize: 11,
                fontWeight: 600,
                color: token.colorTextSecondary,
                borderBottom: `1px solid ${token.colorBorderSecondary}`,
              }}
            >
              TẬP TIN ĐÃ THAY ĐỔI ({diffFiles.length})
            </div>
            {diffFiles.map((file) => {
              const isSelected =
                file.newPath === selectedFilePath || file.oldPath === selectedFilePath;
              return (
                <div
                  key={file.newPath}
                  onClick={() => onSelectFilePath(file.newPath)}
                  style={{
                    padding: '8px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    fontSize: 12,
                    backgroundColor: isSelected ? token.colorBgContainer : 'transparent',
                    borderLeft: isSelected ? `3px solid #4f46e5` : '3px solid transparent',
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectFilePath(file.newPath);
                    }
                  }}
                >
                  <Space orientation="horizontal" size={6} style={{ overflow: 'hidden', flex: 1 }}>
                    <FileTextOutlined style={{ fontSize: 13 }} />
                    <Text
                      style={{ fontSize: 12, width: 120 }}
                      ellipsis={{ tooltip: file.newPath }}
                    >
                      {file.newPath.split('/').pop() || file.newPath}
                    </Text>
                  </Space>
                  <Space orientation="horizontal" size={4}>
                    {file.additions > 0 && (
                      <span style={{ color: '#52c41a', fontSize: 10 }}>+{file.additions}</span>
                    )}
                    {file.deletions > 0 && (
                      <span style={{ color: '#ff4d4f', fontSize: 10 }}>-{file.deletions}</span>
                    )}
                  </Space>
                </div>
              );
            })}
          </div>

          {/* Code Comparator View */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              backgroundColor: token.colorBgContainer,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {selectedFile ? (
              <div>
                {/* File Header Bar */}
                <div
                  style={{
                    padding: '8px 12px',
                    backgroundColor: token.colorFillAlter,
                    borderBottom: `1px solid ${token.colorBorderSecondary}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Space orientation="horizontal" size={8}>
                    <Text strong style={{ fontSize: 13 }}>
                      {selectedFile.newPath}
                    </Text>
                    <Tag
                      color={
                        selectedFile.status === 'added'
                          ? 'success'
                          : selectedFile.status === 'deleted'
                          ? 'error'
                          : 'processing'
                      }
                      style={{ fontSize: 10 }}
                    >
                      {selectedFile.status.toUpperCase()}
                    </Tag>
                  </Space>

                  <Popconfirm
                    title="Hủy bỏ thay đổi"
                    description={`Hoàn tác toàn bộ thay đổi mã nguồn trong file "${selectedFile.newPath}" về trạng thái ban đầu?`}
                    onConfirm={() => handleRevertCurrentFile(selectedFile.newPath)}
                    okText="Hoàn tác"
                    cancelText="Đóng"
                    okButtonProps={{ danger: true }}
                    disabled={acting}
                  >
                    <Button
                      size="small"
                      danger
                      type="text"
                      icon={<UndoOutlined />}
                      disabled={acting}
                    >
                      Revert File
                    </Button>
                  </Popconfirm>
                </div>

                {/* Hunks */}
                {selectedFile.hunks.map((hunk, hIdx) => (
                  <DiffHunkView
                    key={hIdx}
                    hunk={hunk}
                    filePath={selectedFile.newPath}
                    viewMode={viewMode}
                    onLineClick={handleLineClick}
                  />
                ))}
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                }}
              >
                <Empty description="Chọn một tập tin từ danh sách để xem thay đổi" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Inline Comment Modal */}
      {onSendFeedback && (
        <DiffInlineCommentModal
          open={commentModalOpen}
          filePath={commentTarget.filePath}
          lineNumber={commentTarget.lineNumber}
          selectedCode={commentTarget.code}
          onClose={() => setCommentModalOpen(false)}
          onSubmit={async (prompt) => {
            await onSendFeedback(prompt);
          }}
        />
      )}
    </div>
  );
};
