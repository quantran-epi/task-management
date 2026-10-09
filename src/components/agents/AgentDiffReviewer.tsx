import React, { useState, useMemo, useEffect, useRef } from 'react';
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
  ConfigProvider,
  Popover,
  Select,
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
  SettingOutlined,
} from '@ant-design/icons';
import type { DiffFile, DiffHunk, DiffViewMode } from '../../types/agent';
import { DiffHunkView } from './DiffHunkView';
import { DiffInlineCommentModal } from './DiffInlineCommentModal';
import {
  buildWorktreeFileTree,
  DEFAULT_EXCLUDED_PATTERNS,
  type FileTreeNode,
} from '../../utils/fileTreeBuilder';

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
  onMentionFile?: (filePath: string) => void;
  worktreePath?: string | null;
}

const detectLanguage = (filePath: string): string => {
  const ext = filePath.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return 'javascript';
    case 'json':
      return 'json';
    case 'html':
      return 'html';
    case 'css':
    case 'scss':
    case 'less':
      return 'css';
    case 'rs':
      return 'rust';
    case 'py':
      return 'python';
    case 'md':
    case 'markdown':
      return 'markdown';
    case 'yaml':
    case 'yml':
      return 'yaml';
    case 'sh':
    case 'bash':
    case 'zsh':
      return 'bash';
    case 'sql':
      return 'sql';
    default:
      return 'plaintext';
  }
};

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
  onMentionFile,
  worktreePath,
}) => {
  const { token } = theme.useToken();
  const [acting, setActing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [customExcludes, setCustomExcludes] = useState<string[]>(DEFAULT_EXCLUDED_PATTERNS);
  const [previewLanguageOverride, setPreviewLanguageOverride] = useState<string | null>(null);
  const [treeScope, setTreeScope] = useState<'diff' | 'all'>('diff');

  const treeContainerRef = useRef<HTMLDivElement>(null);
  const [treeHeight, setTreeHeight] = useState(500);

  const isTestEnv = typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 200);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!treeContainerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.height > 0) {
          setTreeHeight(Math.floor(entry.contentRect.height));
        }
      }
    });
    observer.observe(treeContainerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setPreviewLanguageOverride(null);
  }, [selectedFilePath]);

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
      await api.invoke('reveal_in_file_explorer', { path: fullPath });
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

  // Build full hierarchy tree from worktree paths and changed diff files with exclusions
  const treeData = useMemo(() => {
    const filesToBuild = treeScope === 'diff' && diffFiles.length > 0 ? [] : allWorktreeFiles;
    const rawTree = buildWorktreeFileTree(filesToBuild, diffFiles, customExcludes);
    if (!debouncedSearch) return rawTree;

    const lower = debouncedSearch.toLowerCase();
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
  }, [treeScope, allWorktreeFiles, diffFiles, debouncedSearch, customExcludes]);

  // Extract folder keys containing changed files (diffFiles) or selected file to avoid lag on huge repos
  const diffFolderKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const df of diffFiles) {
      const p = (df.newPath || df.oldPath || '').replace(/\\/g, '/');
      if (!p) continue;
      const segments = p.split('/').filter(Boolean);
      let curr = '';
      for (let i = 0; i < segments.length - 1; i++) {
        curr = curr ? `${curr}/${segments[i]}` : segments[i]!;
        keys.add(curr);
      }
    }
    if (selectedFilePath) {
      const p = selectedFilePath.replace(/\\/g, '/');
      const segments = p.split('/').filter(Boolean);
      let curr = '';
      for (let i = 0; i < segments.length - 1; i++) {
        curr = curr ? `${curr}/${segments[i]}` : segments[i]!;
        keys.add(curr);
      }
    }
    // If search filter is active, expand ONLY ancestors of matching items (max 250 keys)
    if (debouncedSearch) {
      function collectMatchingAncestors(nodes: FileTreeNode[], ancestors: string[]) {
        for (const n of nodes) {
          if (keys.size >= 250) return;
          const nextAncestors = n.isDir ? [...ancestors, n.key] : ancestors;
          if (n.path.toLowerCase().includes(debouncedSearch.toLowerCase())) {
            for (const anc of ancestors) {
              keys.add(anc);
            }
          }
          if (n.children) {
            collectMatchingAncestors(n.children, nextAncestors);
          }
        }
      }
      collectMatchingAncestors(treeData, []);
    }
    return Array.from(keys);
  }, [diffFiles, selectedFilePath, debouncedSearch, treeData]);

  // Keep folder nodes containing diffs expanded by default
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  useEffect(() => {
    if (diffFolderKeys.length > 0) {
      setExpandedKeys((prev) => Array.from(new Set([...prev, ...diffFolderKeys])));
    }
  }, [diffFolderKeys]);

  // Context menu builder for any file/folder item
  const getContextMenuItems = (node: FileTreeNode): NonNullable<MenuProps['items']> => {
    const items: NonNullable<MenuProps['items']> = [
      {
        key: 'copy-path',
        icon: <CopyOutlined />,
        label: 'Sao chép đường dẫn (Copy Path)',
        onClick: () => {
          void navigator.clipboard?.writeText(node.path);
          message.success(`Đã sao chép: ${node.path}`);
        },
      },
    ];

    if (node.isLeaf) {
      if (onMentionFile) {
        items.push({
          key: 'mention-file',
          icon: <CommentOutlined style={{ color: '#1677ff' }} />,
          label: 'Nhắc đến trong chatbox (@file)',
          onClick: () => {
            onMentionFile(node.path);
            message.success(`Đã thêm @${node.path} vào chatbox`);
          },
        });
      }
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
        label: 'Mở trong PC Explorer/Finder',
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

    return items;
  };

  const hasChanges = diffFiles.length > 0;
  const isSelectedFileChanged = Boolean(selectedFile);

  return (
    <ConfigProvider
      theme={{
        token: {
          zIndexPopupBase: 2000,
        },
      }}
    >
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
                zIndex: 999,
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
                padding: '8px 10px',
                borderBottom: `1px solid ${token.colorBorderSecondary}`,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
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
                <span
                  style={{
                    whiteSpace: 'nowrap',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  Thư mục làm việc
                </span>
                <Popover
                  trigger="click"
                  placement="bottomRight"
                  title={<span style={{ fontSize: 12 }}>Loại trừ khỏi Explorer</span>}
                  content={
                    <div style={{ width: 230, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        Bỏ qua thư mục quá lớn để tối ưu hiệu năng:
                      </Text>
                      <Space wrap size={[4, 4]}>
                        {customExcludes.map((pattern) => (
                          <Tag
                            key={pattern}
                            closable
                            onClose={() => setCustomExcludes((prev) => prev.filter((p) => p !== pattern))}
                            style={{ margin: 0, fontSize: 10 }}
                          >
                            {pattern}
                          </Tag>
                        ))}
                      </Space>
                      <Input
                        size="small"
                        placeholder="Thêm folder (Enter)..."
                        onPressEnter={(e) => {
                          const val = (e.target as HTMLInputElement).value.trim();
                          if (val && !customExcludes.includes(val)) {
                            setCustomExcludes((prev) => [...prev, val]);
                            (e.target as HTMLInputElement).value = '';
                          }
                        }}
                      />
                    </div>
                  }
                >
                  <Button
                    type="text"
                    size="small"
                    icon={<SettingOutlined style={{ fontSize: 11 }} />}
                    style={{ height: 20, padding: '0 4px', fontSize: 10, color: token.colorTextTertiary }}
                  >
                    Bỏ qua
                  </Button>
                </Popover>
              </div>

              <Segmented
                block
                size="small"
                value={treeScope}
                onChange={(val) => setTreeScope(val as 'diff' | 'all')}
                options={[
                  { label: `Diff (${diffFiles.length})`, value: 'diff' },
                  { label: `Tất cả (${allWorktreeFiles.length || diffFiles.length})`, value: 'all' },
                ]}
                style={{ fontSize: 11 }}
              />

              <Input
                size="small"
                prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
                placeholder="Tìm tập tin..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                allowClear
              />
            </div>

            {/* Tree Component */}
            <div ref={treeContainerRef} style={{ flex: 1, minHeight: 200, overflow: 'hidden', padding: '4px 2px' }}>
              <Tree
                showIcon={false}
                blockNode
                virtual={!isTestEnv}
                height={treeHeight}
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
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              {/* Unchanged File Content Viewer Toolbar */}
              <div
                style={{
                  padding: '6px 12px',
                  backgroundColor: token.colorFillAlter,
                  borderBottom: `1px solid ${token.colorBorderSecondary}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexShrink: 0,
                }}
              >
                <Space direction="horizontal" size={8}>
                  <FileTextOutlined style={{ fontSize: 13, color: token.colorTextSecondary }} />
                  <Text strong style={{ fontSize: 12 }}>
                    {selectedFilePath}
                  </Text>
                  <Tag style={{ fontSize: 10, margin: 0 }}>READ-ONLY</Tag>
                </Space>

                <Space direction="horizontal" size={6}>
                  <Select
                    size="small"
                    style={{ width: 110 }}
                    value={
                      previewLanguageOverride ||
                      (selectedFilePath ? detectLanguage(selectedFilePath) : 'plaintext')
                    }
                    onChange={(val) => setPreviewLanguageOverride(val)}
                    options={[
                      { label: 'TypeScript', value: 'typescript' },
                      { label: 'JavaScript', value: 'javascript' },
                      { label: 'JSON', value: 'json' },
                      { label: 'HTML', value: 'html' },
                      { label: 'CSS', value: 'css' },
                      { label: 'Rust', value: 'rust' },
                      { label: 'Python', value: 'python' },
                      { label: 'Markdown', value: 'markdown' },
                      { label: 'YAML', value: 'yaml' },
                      { label: 'Bash', value: 'bash' },
                      { label: 'Plain Text', value: 'plaintext' },
                    ]}
                  />

                  {onMentionFile && (
                    <Button
                      size="small"
                      icon={<CommentOutlined />}
                      onClick={() => {
                        onMentionFile(selectedFilePath);
                        message.success(`Đã thêm @${selectedFilePath} vào chatbox`);
                      }}
                      style={{ fontSize: 11, padding: '0 6px', height: 22 }}
                    >
                      Nhắc (@file)
                    </Button>
                  )}

                  <Button
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => {
                      if (selectedFileContent) {
                        void navigator.clipboard?.writeText(selectedFileContent);
                        message.success('Đã sao chép nội dung tập tin');
                      }
                    }}
                    style={{ fontSize: 11, padding: '0 6px', height: 22 }}
                  >
                    Sao chép
                  </Button>

                  <Button
                    size="small"
                    icon={<FolderOpenOutlined />}
                    onClick={() => handleOpenInExplorer(selectedFilePath)}
                    style={{ fontSize: 11, padding: '0 6px', height: 22 }}
                  >
                    Explorer
                  </Button>
                </Space>
              </div>

              {/* Code viewer with line numbers */}
              <div
                style={{
                  flex: 1,
                  overflow: 'auto',
                  display: 'flex',
                  backgroundColor: token.colorBgContainer,
                  fontFamily:
                    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                  fontSize: 12,
                  lineHeight: '20px',
                }}
              >
                {selectedFileContent !== null ? (
                  <>
                    <div
                      style={{
                        padding: '12px 8px',
                        textAlign: 'right',
                        userSelect: 'none',
                        color: token.colorTextQuaternary,
                        borderRight: `1px solid ${token.colorBorderSecondary}`,
                        backgroundColor: token.colorFillAlter,
                        minWidth: 40,
                      }}
                    >
                      {(selectedFileContent || '').split('\n').map((_, i) => (
                        <div key={i}>{i + 1}</div>
                      ))}
                    </div>
                    <pre
                      style={{
                        margin: 0,
                        padding: '12px 16px',
                        flex: 1,
                        whiteSpace: 'pre',
                        color: token.colorText,
                        overflowX: 'auto',
                      }}
                    >
                      {selectedFileContent}
                    </pre>
                  </>
                ) : (
                  <div style={{ padding: 16, color: token.colorTextSecondary }}>
                    Đang tải nội dung tập tin...
                  </div>
                )}
              </div>
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
  </ConfigProvider>
  );
};
