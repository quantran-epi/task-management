import React, { useState, useMemo } from 'react';
import {
  Typography,
  Button,
  Segmented,
  Tag,
  Space,
  Empty,
  Popconfirm,
  theme,
  Tree,
  Dropdown,
  message,
  Spin,
} from 'antd';
import {
  CheckOutlined,
  UndoOutlined,
  FileTextOutlined,
  ReloadOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
  FolderOutlined,
  FolderOpenOutlined,
  CommentOutlined,
} from '@ant-design/icons';
import type { DiffFile, DiffHunk, DiffViewMode } from '../../types/agent';
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
  onAcceptFile?: (filePath: string) => Promise<string>;
  onAcceptHunk?: (file: DiffFile, hunk: DiffHunk) => Promise<string>;
  onAcceptLine?: (file: DiffFile, hunk: DiffHunk, targetLineIndex: number) => Promise<string>;
  onRevertAll: () => Promise<void>;
  onRevertFile: (filePath: string) => Promise<void>;
  onSendFeedback?: (formattedPrompt: string) => Promise<void>;
  worktreePath?: string | null;
}

interface InternalTreeNode {
  key: string;
  name: string;
  isLeaf: boolean;
  filePath?: string;
  diffFile?: DiffFile;
  additions: number;
  deletions: number;
  children?: InternalTreeNode[];
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
  onAcceptFile,
  onAcceptHunk,
  onAcceptLine,
  onRevertAll,
  onRevertFile,
  onSendFeedback,
  worktreePath,
}) => {
  const { token } = theme.useToken();
  const [acting, setActing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

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

  const handleReviewFile = (filePath: string) => {
    if (!onSendFeedback) return;
    setCommentTarget({ filePath, lineNumber: 0, code: '' });
    setCommentModalOpen(true);
  };

  const handleOpenInExplorer = async (filePath: string) => {
    const fullPath = worktreePath
      ? `${worktreePath.replace(/[/\\]+$/, '')}/${filePath}`
      : filePath;
    try {
      const api = await import('@tauri-apps/api/core');
      await api.invoke('open_local_path', { path: fullPath });
    } catch {
      message.info(`Đường dẫn tập tin: ${fullPath}`);
    }
  };

  const handleAcceptAll = async () => {
    setActing(true);
    try {
      await onAcceptAll();
    } finally {
      setActing(false);
    }
  };

  const handleAcceptFile = async (filePath: string) => {
    if (!onAcceptFile) return;
    setActing(true);
    try {
      await onAcceptFile(filePath);
      message.success(`Đã chấp nhận thay đổi cho: ${filePath}`);
    } catch (err) {
      message.error(`Không thể chấp nhận thay đổi: ${String(err)}`);
    } finally {
      setActing(false);
    }
  };

  const handleAcceptHunk = async (file: DiffFile, hunk: DiffHunk) => {
    if (!onAcceptHunk) return;
    setActing(true);
    try {
      await onAcceptHunk(file, hunk);
      message.success('Đã chấp nhận hunk thành công');
    } catch (err) {
      message.error(`Không thể chấp nhận hunk: ${String(err)}`);
    } finally {
      setActing(false);
    }
  };

  const handleAcceptLine = async (file: DiffFile, hunk: DiffHunk, targetLineIndex: number) => {
    if (!onAcceptLine) return;
    setActing(true);
    try {
      await onAcceptLine(file, hunk, targetLineIndex);
      message.success('Đã chấp nhận dòng thay đổi');
    } catch (err) {
      message.error(`Không thể chấp nhận dòng: ${String(err)}`);
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

  // Build tree hierarchy for changed files
  const { treeData, folderKeys } = useMemo(() => {
    const root: InternalTreeNode = {
      key: '',
      name: '',
      isLeaf: false,
      additions: 0,
      deletions: 0,
      children: [],
    };

    const detectedFolderKeys: string[] = [];

    diffFiles.forEach((file) => {
      const filePath = file.newPath || file.oldPath;
      const parts = filePath.split('/');
      let current = root;
      let currentPath = '';

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i] || '';
        const isLeaf = i === parts.length - 1;
        currentPath = currentPath ? `${currentPath}/${part}` : part;

        if (isLeaf) {
          if (!current.children) current.children = [];
          current.children.push({
            key: filePath,
            name: part,
            isLeaf: true,
            filePath,
            diffFile: file,
            additions: file.additions,
            deletions: file.deletions,
          });
        } else {
          const folderKey = `${currentPath}/`;
          if (!detectedFolderKeys.includes(folderKey)) {
            detectedFolderKeys.push(folderKey);
          }
          if (!current.children) current.children = [];
          let folderNode = current.children.find((c) => c.key === folderKey && !c.isLeaf);
          if (!folderNode) {
            folderNode = {
              key: folderKey,
              name: part,
              isLeaf: false,
              additions: 0,
              deletions: 0,
              children: [],
            };
            current.children.push(folderNode);
          }
          current = folderNode;
        }
      }
    });

    const aggregate = (node: InternalTreeNode) => {
      if (node.isLeaf) return;
      let add = 0;
      let del = 0;
      (node.children || []).forEach((child) => {
        aggregate(child);
        add += child.additions;
        del += child.deletions;
      });
      node.additions = add;
      node.deletions = del;
      node.children?.sort((a, b) => {
        if (a.isLeaf !== b.isLeaf) return a.isLeaf ? 1 : -1;
        return a.name.localeCompare(b.name);
      });
    };

    aggregate(root);

    // Map internal tree nodes to Ant Design Tree format
    const formatTreeNode = (node: InternalTreeNode): any => {
      if (node.isLeaf && node.diffFile) {
        const file = node.diffFile;
        const menuItems = [
          {
            key: 'review',
            icon: <CommentOutlined />,
            label: 'Review file cho Agent',
            onClick: () => handleReviewFile(file.newPath),
          },
          {
            key: 'explorer',
            icon: <FolderOpenOutlined />,
            label: 'Mở trong Explorer / Finder',
            onClick: () => handleOpenInExplorer(file.newPath),
          },
          { type: 'divider' as const },
          {
            key: 'accept',
            icon: <CheckOutlined style={{ color: '#52c41a' }} />,
            label: 'Accept file này',
            disabled: acting,
            onClick: () => handleAcceptFile(file.newPath),
          },
          {
            key: 'revert',
            icon: <UndoOutlined style={{ color: '#ff4d4f' }} />,
            danger: true,
            label: 'Reject / Hoàn tác file này',
            disabled: acting,
            onClick: () => handleRevertCurrentFile(file.newPath),
          },
        ];

        return {
          key: node.key,
          isLeaf: true,
          icon: <FileTextOutlined style={{ color: '#6366f1' }} />,
          title: (
            <Dropdown menu={{ items: menuItems }} trigger={['contextMenu']}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                }}
              >
                <Text style={{ fontSize: 12 }} ellipsis={{ tooltip: file.newPath }}>
                  {node.name}
                </Text>
                <Space size={4} style={{ marginLeft: 6, flexShrink: 0 }}>
                  {file.additions > 0 && (
                    <span style={{ color: '#52c41a', fontSize: 10 }}>+{file.additions}</span>
                  )}
                  {file.deletions > 0 && (
                    <span style={{ color: '#ff4d4f', fontSize: 10 }}>-{file.deletions}</span>
                  )}
                </Space>
              </div>
            </Dropdown>
          ),
        };
      }

      return {
        key: node.key,
        isLeaf: false,
        icon: ({ expanded }: { expanded?: boolean }) =>
          expanded ? (
            <FolderOpenOutlined style={{ color: '#f59e0b' }} />
          ) : (
            <FolderOutlined style={{ color: '#f59e0b' }} />
          ),
        title: (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
            }}
          >
            <Text style={{ fontSize: 12 }}>{node.name}</Text>
            <Space size={4} style={{ marginLeft: 6, flexShrink: 0 }}>
              {node.additions > 0 && (
                <span style={{ color: '#52c41a', fontSize: 10 }}>+{node.additions}</span>
              )}
              {node.deletions > 0 && (
                <span style={{ color: '#ff4d4f', fontSize: 10 }}>-{node.deletions}</span>
              )}
            </Space>
          </div>
        ),
        children: (node.children || []).map(formatTreeNode),
      };
    };

    return {
      treeData: (root.children || []).map(formatTreeNode),
      folderKeys: detectedFolderKeys,
    };
  }, [diffFiles, acting, worktreePath]);

  // Keep folder nodes expanded by default whenever new folders arrive
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  React.useEffect(() => {
    if (folderKeys.length > 0) {
      setExpandedKeys((prev) => Array.from(new Set([...prev, ...folderKeys])));
    }
  }, [folderKeys]);

  return (
    <div
      style={{
        height: isFullscreen ? '100vh' : '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: token.colorBgContainer,
        overflow: 'hidden',
        ...(isFullscreen
          ? {
              position: 'fixed',
              inset: 0,
              zIndex: 1100,
              borderRadius: 0,
            }
          : {}),
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
          backgroundColor: token.colorFillAlter,
        }}
      >
        <Space direction="horizontal" size={8}>
          <Text strong style={{ fontSize: 13 }}>
            Git Diff
          </Text>
          {hasChanges && (
            <Space size={4} style={{ fontSize: 12 }}>
              <span style={{ color: '#52c41a', fontWeight: 600 }}>+{totalAdditions}</span>
              <span style={{ color: '#ff4d4f', fontWeight: 600 }}>-{totalDeletions}</span>
              <span style={{ color: token.colorTextSecondary }}>({diffFiles.length} files)</span>
            </Space>
          )}
        </Space>

        <Space direction="horizontal" size={8}>
          {/* View Mode Switcher */}
          <Segmented
            size="small"
            value={viewMode}
            onChange={(val) => onViewModeChange(val as DiffViewMode)}
            options={[
              { label: 'Unified', value: 'unified' },
              { label: 'Side-by-side', value: 'split' },
            ]}
          />

          {/* Fullscreen Toggle */}
          <Button
            size="small"
            type="text"
            icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
            onClick={() => setIsFullscreen(!isFullscreen)}
            aria-label={isFullscreen ? 'Thoát toàn màn hình diff' : 'Mở rộng diff toàn màn hình'}
          />

          {/* Refresh Diff */}
          {onRefreshDiff && (
            <Button
              size="small"
              type="text"
              icon={<ReloadOutlined spin={loading} />}
              onClick={() => void onRefreshDiff()}
              aria-label="Tải lại Git diff"
            />
          )}

          {/* Revert All Changes */}
          <Popconfirm
            title="Hoàn tác toàn bộ thay đổi"
            description="Bạn có chắc chắn muốn hủy tất cả thay đổi mã nguồn trong worktree này?"
            onConfirm={handleRevertAll}
            okText="Hoàn tác tất cả"
            cancelText="Đóng"
            okButtonProps={{ danger: true }}
            disabled={!hasChanges || acting || loading}
          >
            <Button
              size="small"
              danger
              icon={<UndoOutlined />}
              loading={acting}
              disabled={!hasChanges || loading}
            >
              Revert All
            </Button>
          </Popconfirm>

          {/* Accept All Changes */}
          <Button
            size="small"
            type="primary"
            icon={<CheckOutlined />}
            style={{ backgroundColor: '#4f46e5' }}
            onClick={handleAcceptAll}
            loading={acting}
            disabled={!hasChanges || loading}
          >
            Accept All
          </Button>
        </Space>
      </div>

      {/* Main Diff Content Pane (File Tree on Left + Code Diff on Right) with Loading Overlay */}
      <Spin
        spinning={loading}
        tip="Đang tải git diff..."
        style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}
      >
        {!hasChanges && !loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="Chưa có thay đổi mã nguồn nào"
            />
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden', height: '100%' }}>
          {/* File Folder Tree Sidebar */}
          <div
            style={{
              width: 260,
              borderRight: `1px solid ${token.colorBorderSecondary}`,
              overflowY: 'auto',
              overflowX: 'auto',
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
            <div style={{ padding: '4px', flex: 1 }}>
              <Tree
                showIcon
                blockNode
                virtual={false}
                expandedKeys={expandedKeys}
                onExpand={(keys) => setExpandedKeys(keys as string[])}
                selectedKeys={selectedFilePath ? [selectedFilePath] : []}
                onSelect={(keys) => {
                  const key = keys[0];
                  if (typeof key === 'string' && !key.endsWith('/')) {
                    onSelectFilePath(key);
                  }
                }}
                treeData={treeData}
                style={{ backgroundColor: 'transparent', fontSize: 12 }}
              />
            </div>
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
                  <Space direction="horizontal" size={8}>
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

                  <Space direction="horizontal" size={6}>
                    {/* Review File Button */}
                    {onSendFeedback && (
                      <Button
                        size="small"
                        type="default"
                        icon={<CommentOutlined />}
                        onClick={() => handleReviewFile(selectedFile.newPath)}
                      >
                        Review File
                      </Button>
                    )}

                    {/* Open in Explorer Button */}
                    <Button
                      size="small"
                      type="default"
                      icon={<FolderOpenOutlined />}
                      onClick={() => handleOpenInExplorer(selectedFile.newPath)}
                    >
                      Explorer
                    </Button>

                    {/* Accept File Button */}
                    {onAcceptFile && (
                      <Button
                        size="small"
                        type="primary"
                        icon={<CheckOutlined />}
                        style={{ backgroundColor: '#16a34a' }}
                        onClick={() => handleAcceptFile(selectedFile.newPath)}
                        loading={acting}
                      >
                        Accept File
                      </Button>
                    )}

                    {/* Revert File Button */}
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
                  </Space>
                </div>

                {/* Hunks */}
                {selectedFile.hunks.map((hunk, hIdx) => (
                  <DiffHunkView
                    key={hIdx}
                    hunk={hunk}
                    filePath={selectedFile.newPath}
                    viewMode={viewMode}
                    onLineClick={handleLineClick}
                    onAcceptHunk={(h) => handleAcceptHunk(selectedFile, h)}
                    onAcceptLine={(_h, lineIdx) => handleAcceptLine(selectedFile, hunk, lineIdx)}
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
      </Spin>

      {/* Inline / File Comment Modal */}
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
