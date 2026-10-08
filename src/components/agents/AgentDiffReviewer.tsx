import React, { useState, useMemo, useEffect } from 'react';
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
  Dropdown,
  Tree,
  Input,
  message,
} from 'antd';
import type { MenuProps } from 'antd';
import type { DataNode } from 'antd/es/tree';
import {
  CheckOutlined,
  UndoOutlined,
  FileTextOutlined,
  FolderOutlined,
  ReloadOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
  CopyOutlined,
  SearchOutlined,
  EyeOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  CommentOutlined,
  FolderOpenOutlined,
} from '@ant-design/icons';
import type { DiffFile, DiffHunk, DiffViewMode } from '../../types/agent';
import { DiffHunkView } from './DiffHunkView';
import { DiffInlineCommentModal } from './DiffInlineCommentModal';
import { buildWorktreeFileTree, type FileTreeNode } from '../../utils/fileTreeBuilder';

const { Text } = Typography;

export interface AgentDiffReviewerProps {
  diffFiles: DiffFile[];
  allWorktreeFiles?: string[];
  selectedFileContent?: string | null;
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
  onRevertHunk?: (filePath: string, hunk: DiffHunk) => Promise<void>;
  onSendFeedback?: (formattedPrompt: string) => Promise<void>;
  worktreePath?: string | null;
}

export const AgentDiffReviewer: React.FC<AgentDiffReviewerProps> = ({
  diffFiles,
  allWorktreeFiles = [],
  selectedFileContent,
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
  onRevertHunk,
  onSendFeedback,
  worktreePath,
}) => {
  const { token } = theme.useToken();
  const [acting, setActing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');

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

  const handleAcceptHunkAction = async (file: DiffFile, hunk: DiffHunk) => {
    if (onAcceptHunk) {
      setActing(true);
      try {
        await onAcceptHunk(file, hunk);
        message.success('Đã chấp nhận hunk thành công');
      } catch (err) {
        message.error(`Không thể chấp nhận hunk: ${String(err)}`);
      } finally {
        setActing(false);
      }
    } else if (onSendFeedback) {
      const path = file.newPath || file.oldPath;
      await onSendFeedback(
        `User accepted diff hunk in ${path}: lines ${hunk.newStart}-${hunk.newStart + hunk.newCount}. Proceed with implementation.`
      );
    }
  };

  const handleAcceptLineAction = async (file: DiffFile, hunk: DiffHunk, targetLineIndex: number) => {
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

  const handleRejectHunkAction = async (filePath: string, hunk: DiffHunk) => {
    if (onRevertHunk) {
      await onRevertHunk(filePath, hunk);
    }
  };

  // Build full hierarchy tree from all worktree paths and changed diff files
  const treeData = useMemo(() => {
    const rawTree = buildWorktreeFileTree(allWorktreeFiles, diffFiles);
    if (!searchFilter.trim()) return rawTree;

    const lower = searchFilter.toLowerCase().trim();
    function filterNode(node: FileTreeNode): FileTreeNode | null {
      if (node.path.toLowerCase().includes(lower)) {
        return node;
      }
      if (node.children) {
        const matchingKids: FileTreeNode[] = [];
        for (const child of node.children) {
          const match = filterNode(child);
          if (match) matchingKids.push(match);
        }
        if (matchingKids.length > 0) {
          return { ...node, children: matchingKids };
        }
      }
      return null;
    }

    return rawTree.map(filterNode).filter((n): n is FileTreeNode => n !== null);
  }, [allWorktreeFiles, diffFiles, searchFilter]);

  // Extract all folder keys from treeData to auto-expand directories
  const folderKeys = useMemo(() => {
    const keys: string[] = [];
    function collect(nodes: FileTreeNode[]) {
      for (const node of nodes) {
        if (node.isDir || !node.isLeaf) {
          keys.push(node.key);
          if (node.children) {
            collect(node.children);
          }
        }
      }
    }
    collect(treeData);
    return keys;
  }, [treeData]);

  // Keep folder nodes expanded by default whenever new folders arrive
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  useEffect(() => {
    if (folderKeys.length > 0) {
      setExpandedKeys((prev) => Array.from(new Set([...prev, ...folderKeys])));
    }
  }, [folderKeys]);

  // Context menu builder for any file/folder item
  const getContextMenuItems = (node: FileTreeNode): NonNullable<MenuProps['items']> => {
    const isChanged = Boolean(node.diffFile);
    const items: NonNullable<MenuProps['items']> = [
      {
        key: 'copy-path',
        icon: <CopyOutlined />,
        label: 'Sao chép đường dẫn (Copy Path)',
        onClick: () => {
          void navigator.clipboard?.writeText(node.path);
        },
      },
    ];

    if (node.isLeaf) {
      items.push({
        key: 'view-file',
        icon: <EyeOutlined />,
        label: 'Xem tập tin',
        onClick: () => {
          onSelectFilePath(node.path);
        },
      });
      items.push({
        key: 'open-explorer',
        icon: <FolderOpenOutlined />,
        label: 'Mở trong thư mục (Explorer)',
        onClick: () => {
          void handleOpenInExplorer(node.path);
        },
      });
      if (onSendFeedback) {
        items.push({
          key: 'review-file',
          icon: <CommentOutlined />,
          label: 'Nhận xét tập tin',
          onClick: () => {
            handleReviewFile(node.path);
          },
        });
      }
    }

    if (isChanged && node.isLeaf) {
      if (onAcceptFile) {
        items.push({
          key: 'accept-file',
          icon: <CheckOutlined style={{ color: '#52c41a' }} />,
          label: 'Chấp nhận thay đổi file (Accept File)',
          onClick: () => {
            void handleAcceptFile(node.path);
          },
        });
      }
      items.push(
        {
          type: 'divider',
        },
        {
          key: 'revert-file',
          danger: true,
          icon: <UndoOutlined />,
          label: 'Hoàn tác thay đổi file (Revert)',
          onClick: () => {
            void handleRevertCurrentFile(node.path);
          },
        }
      );
    }

    return items;
  };

  const hasChanges = diffFiles.length > 0;
  const isSelectedFileChanged = Boolean(selectedFile);

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
          padding: '6px 10px',
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          flexWrap: 'nowrap',
          gap: 8,
          backgroundColor: token.colorBgContainer,
        }}
      >
        <Space direction="horizontal" size={6} style={{ flexShrink: 0 }}>
          <Tooltip title={sidebarCollapsed ? 'Mở thanh cây thư mục' : 'Thu gọn thanh thư mục'}>
            <Button
              size="small"
              type="text"
              icon={sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setSidebarCollapsed((prev) => !prev)}
            />
          </Tooltip>

          <Segmented
            value={viewMode}
            onChange={(val) => onViewModeChange(val as DiffViewMode)}
            options={[
              { label: 'Unified', value: 'unified' },
              { label: 'Side-by-side', value: 'split' },
            ]}
            size="small"
          />

          <Tag color="success" style={{ margin: 0, fontWeight: 600, fontSize: 11 }}>
            +{totalAdditions}
          </Tag>
          <Tag color="error" style={{ margin: 0, fontWeight: 600, fontSize: 11 }}>
            -{totalDeletions}
          </Tag>

          {onRefreshDiff && (
            <Tooltip title="Làm mới diff">
              <Button
                size="small"
                type="text"
                icon={<ReloadOutlined spin={loading} />}
                onClick={() => void onRefreshDiff()}
                aria-label="Tải lại Git diff"
              />
            </Tooltip>
          )}

          <Tooltip title={isFullscreen ? 'Thoát toàn màn hình diff' : 'Mở rộng diff toàn màn hình'}>
            <Button
              size="small"
              type="text"
              icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
              onClick={() => setIsFullscreen((prev) => !prev)}
              aria-label={isFullscreen ? 'Thoát toàn màn hình diff' : 'Mở rộng diff toàn màn hình'}
            />
          </Tooltip>
        </Space>

        <Space direction="horizontal" size={6} style={{ flexShrink: 0 }}>
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

      {/* Main Diff Content Pane (File Tree Sidebar on Left + Content View on Right) */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Full Directory Tree Sidebar */}
        {!sidebarCollapsed && (
          <div
            style={{
              width: 250,
              minWidth: 200,
              maxWidth: 320,
              borderRight: `1px solid ${token.colorBorderSecondary}`,
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: token.colorFillAlter,
              flexShrink: 0,
            }}
          >
            {/* Sidebar Header & Search */}
            <div
              style={{
                padding: '6px 8px',
                borderBottom: `1px solid ${token.colorBorderSecondary}`,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: 11,
                  fontWeight: 600,
                  color: token.colorTextSecondary,
                }}
              >
                <span>THƯ MỤC LÀM VIỆC</span>
                {diffFiles.length > 0 && (
                  <Tag color="processing" style={{ margin: 0, fontSize: 10 }}>
                    {diffFiles.length} file đổi
                  </Tag>
                )}
              </div>
              <Input
                size="small"
                prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
                placeholder="Tìm file..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                allowClear
              />
            </div>

            {/* Tree Component */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 2px' }}>
              <Tree
                showIcon={false}
                blockNode
                virtual={false}
                expandedKeys={expandedKeys}
                onExpand={(keys) => setExpandedKeys(keys as string[])}
                selectedKeys={selectedFilePath ? [selectedFilePath] : []}
                onSelect={(_, info) => {
                  const node = info.node as unknown as FileTreeNode;
                  if (node && node.isLeaf) {
                    onSelectFilePath(node.path);
                  }
                }}
                treeData={treeData as unknown as DataNode[]}
                titleRender={(nodeData) => {
                  const node = nodeData as unknown as FileTreeNode;
                  const isSelected = node.path === selectedFilePath;
                  const df = node.diffFile;

                  return (
                    <Dropdown
                      menu={{ items: getContextMenuItems(node) }}
                      trigger={['contextMenu']}
                    >
                      <div
                        onClick={() => {
                          if (node.isLeaf) {
                            onSelectFilePath(node.path);
                          }
                        }}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '2px 4px',
                          cursor: 'pointer',
                          borderRadius: 3,
                          backgroundColor: isSelected ? token.colorPrimaryBg : 'transparent',
                          color: isSelected ? token.colorPrimaryText : undefined,
                        }}
                      >
                        <Space size={5} style={{ overflow: 'hidden', flex: 1 }}>
                          {node.isDir ? (
                            <FolderOutlined style={{ color: '#1677ff', fontSize: 12 }} />
                          ) : (
                            <FileTextOutlined
                              style={{
                                color: df ? '#4f46e5' : token.colorTextSecondary,
                                fontSize: 12,
                              }}
                            />
                          )}
                          <Text
                            ellipsis={{ tooltip: node.path }}
                            style={{
                              fontSize: 12,
                              fontWeight: df ? 600 : 400,
                              color: df
                                ? df.status === 'deleted'
                                  ? '#ff4d4f'
                                  : df.status === 'added'
                                  ? '#52c41a'
                                  : token.colorText
                                : token.colorTextSecondary,
                            }}
                          >
                            {String(node.title)}
                          </Text>
                        </Space>

                        {df && (
                          <Space size={3} style={{ flexShrink: 0, paddingLeft: 4 }}>
                            {df.additions > 0 && (
                              <span style={{ color: '#52c41a', fontSize: 10 }}>+{df.additions}</span>
                            )}
                            {df.deletions > 0 && (
                              <span style={{ color: '#ff4d4f', fontSize: 10 }}>-{df.deletions}</span>
                            )}
                          </Space>
                        )}
                      </div>
                    </Dropdown>
                  );
                }}
              />
            </div>
          </div>
        )}

        {/* Content Viewer (Diff or File Content) */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            backgroundColor: token.colorBgContainer,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {isSelectedFileChanged && selectedFile ? (
            <div>
              {/* File Header Bar */}
              <div
                style={{
                  padding: '6px 12px',
                  backgroundColor: token.colorFillAlter,
                  borderBottom: `1px solid ${token.colorBorderSecondary}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <Space direction="horizontal" size={8} style={{ overflow: 'hidden' }}>
                  <Text strong ellipsis={{ tooltip: selectedFile.newPath }} style={{ fontSize: 12 }}>
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
                    style={{ fontSize: 10, margin: 0 }}
                  >
                    {selectedFile.status.toUpperCase()}
                  </Tag>
                </Space>

                <Space direction="horizontal" size={6}>
                  {onSendFeedback && (
                    <Button
                      size="small"
                      type="default"
                      icon={<CommentOutlined />}
                      onClick={() => handleReviewFile(selectedFile.newPath)}
                      style={{ fontSize: 11, padding: '0 6px', height: 22 }}
                    >
                      Review
                    </Button>
                  )}

                  <Button
                    size="small"
                    type="default"
                    icon={<FolderOpenOutlined />}
                    onClick={() => handleOpenInExplorer(selectedFile.newPath)}
                    style={{ fontSize: 11, padding: '0 6px', height: 22 }}
                  >
                    Explorer
                  </Button>

                  {onAcceptFile && (
                    <Button
                      size="small"
                      type="primary"
                      icon={<CheckOutlined />}
                      style={{ backgroundColor: '#16a34a', fontSize: 11, padding: '0 6px', height: 22 }}
                      onClick={() => handleAcceptFile(selectedFile.newPath)}
                      loading={acting}
                    >
                      Accept File
                    </Button>
                  )}

                  <Popconfirm
                    title="Hủy bỏ thay đổi"
                    description={`Hoàn tác toàn bộ thay đổi trong "${selectedFile.newPath}"?`}
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
                      style={{ fontSize: 11, padding: '0 6px', height: 22 }}
                    >
                      Revert File
                    </Button>
                  </Popconfirm>
                </Space>
              </div>

              {/* Hunks with Accept & Reject Actions */}
              {selectedFile.hunks.map((hunk, hIdx) => (
                <DiffHunkView
                  key={hIdx}
                  hunk={hunk}
                  filePath={selectedFile.newPath}
                  viewMode={viewMode}
                  onLineClick={handleLineClick}
                  onAcceptHunk={() => handleAcceptHunkAction(selectedFile, hunk)}
                  onRejectHunk={() => handleRejectHunkAction(selectedFile.newPath, hunk)}
                  onAcceptLine={(_h, lineIdx) => handleAcceptLineAction(selectedFile, hunk, lineIdx)}
                />
              ))}
            </div>
          ) : selectedFilePath ? (
            <div>
              {/* Unchanged File Content Viewer */}
              <div
                style={{
                  padding: '6px 12px',
                  backgroundColor: token.colorFillAlter,
                  borderBottom: `1px solid ${token.colorBorderSecondary}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Space direction="horizontal" size={8}>
                  <FileTextOutlined style={{ fontSize: 13, color: token.colorTextSecondary }} />
                  <Text strong style={{ fontSize: 12 }}>
                    {selectedFilePath}
                  </Text>
                  <Tag style={{ fontSize: 10, margin: 0 }}>UNCHANGED</Tag>
                </Space>
              </div>
              <pre
                style={{
                  margin: 0,
                  padding: 12,
                  fontSize: 12,
                  lineHeight: '20px',
                  fontFamily:
                    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  color: token.colorText,
                }}
              >
                {selectedFileContent !== null
                  ? selectedFileContent
                  : 'Đang tải nội dung tập tin...'}
              </pre>
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
              <Empty description="Chọn một tập tin từ cây thư mục để xem chi tiết" />
            </div>
          )}
        </div>
      </div>

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
