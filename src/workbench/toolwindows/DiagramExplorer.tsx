import React, { useState, useMemo, useCallback } from 'react';
import {
  Input,
  Button,
  Dropdown,
  Modal,
  Tooltip,
  Typography,
  Empty,
  Select,
  message,
  type MenuProps,
} from 'antd';
import {
  FolderOutlined,
  FolderFilled,
  PlusOutlined,
  ApartmentOutlined,
  DeleteOutlined,
  MoreOutlined,
  EditOutlined,
  FolderAddOutlined,
  CaretRightOutlined,
  CaretDownOutlined,
  SearchOutlined,
  UndoOutlined,
  CheckSquareOutlined,
  ProjectOutlined,
  FlagOutlined,
  CopyOutlined,
  SwapOutlined,
  LinkOutlined,
  CodeOutlined,
  PushpinFilled,
  PushpinOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import type { Note, NoteEntityType } from '../../types/models';
import {
  createNote,
  updateNote,
  softDeleteNote,
  restoreNote,
  permanentDeleteNote,
  bulkPermanentDeleteNotes,
} from '../../db/repositories/noteRepo';
import { useLayoutStore } from '../store/layoutStore';

const { Text } = Typography;

export interface DiagramExplorerProps {
  db?: TaskPlannerDatabase | undefined;
}

export interface DiagramFolderTreeNode {
  id: string;
  folder: Note;
  title: string;
  parentId?: string | undefined;
  children: DiagramFolderTreeNode[];
  depth: number;
  diagrams: Note[];
}

const DEFAULT_NEW_DIAGRAM_TEMPLATE = `flowchart TD
  Start([Bắt đầu]) --> Step1[Bước 1: Tiếp nhận yêu cầu]
  Step1 --> Decision{Hợp lệ không?}
  Decision -- Có --> Process[Xử lý tác vụ]
  Decision -- Không --> Reject[Từ chối & Báo lỗi]
  Process --> Finish([Hoàn thành])`;

export function DiagramExplorer({ db = defaultDb }: DiagramExplorerProps) {
  const openTab = useLayoutStore((s) => s.openTab);
  const activeTabId = useLayoutStore((s) => s.activeTabId);
  const openTabs = useLayoutStore((s) => s.openTabs);
  const activeTab = openTabs.find((t) => t.id === activeTabId);

  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(
    () => new Set<string>(['root_diagrams'])
  );

  // Modals state (All Popups - perfectly matching Docs Explorer UX)
  const [newFolderModalOpen, setNewFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [parentFolderForNew, setParentFolderForNew] = useState<Note | null>(null);

  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renamingItem, setRenamingItem] = useState<{ id: string; name: string; isFolder: boolean } | null>(null);
  const [renamedName, setRenamedName] = useState('');

  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [movingDiagram, setMovingDiagram] = useState<Note | null>(null);

  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkingDiagram, setLinkingDiagram] = useState<Note | null>(null);
  const [selectedEntityType, setSelectedEntityType] = useState<NoteEntityType | undefined>(undefined);
  const [selectedEntityId, setSelectedEntityId] = useState<string | undefined>(undefined);

  // Live query for notes
  const allNotes = useLiveQuery(
    async () => {
      return await db.notes.toArray();
    },
    [db],
    []
  );

  const tasks = useLiveQuery(() => db.tasks.toArray(), [db], []);
  const changeRequests = useLiveQuery(() => db.changeRequests.toArray(), [db], []);
  const systems = useLiveQuery(() => db.systems.toArray(), [db], []);

  // Filter active diagrams & diagram folders
  const activeNotes = useMemo(
    () => (allNotes || []).filter((n) => !n.deletedAt),
    [allNotes]
  );

  const trashNotes = useMemo(
    () =>
      (allNotes || []).filter(
        (n) =>
          Boolean(n.deletedAt) &&
          (n.type === 'diagram' || (n.type === 'folder' && n.tags?.includes('diagram')))
      ),
    [allNotes]
  );

  const activeDiagrams = useMemo(
    () => activeNotes.filter((n) => n.type === 'diagram'),
    [activeNotes]
  );

  const activeFolders = useMemo(
    () => activeNotes.filter((n) => n.type === 'folder' && n.tags?.includes('diagram')),
    [activeNotes]
  );

  const pinnedDiagrams = useMemo(
    () => activeDiagrams.filter((d) => Boolean(d.isPinned)),
    [activeDiagrams]
  );

  const rootDiagrams = useMemo(
    () => activeDiagrams.filter((d) => !d.parentId),
    [activeDiagrams]
  );

  // Active diagram ID in editor
  const selectedDiagramId = useMemo(() => {
    if (activeTab?.viewType === 'mermaid' && activeTab.params?.noteId) {
      return activeTab.params.noteId;
    }
    return null;
  }, [activeTab]);

  const toggleFolderExpand = (folderId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const handleOpenDiagram = useCallback(
    (diagram: Note) => {
      openTab({
        id: `mermaid-${diagram.id}`,
        title: diagram.title || 'Untitled Diagram',
        viewType: 'mermaid',
        closable: true,
        params: { noteId: diagram.id, code: diagram.body },
      });
    },
    [openTab]
  );

  const handleCreateDiagram = useCallback(
    async (targetFolderId?: string) => {
      try {
        const newDiagram = await createNote(
          {
            title: 'Biểu đồ mới',
            body: DEFAULT_NEW_DIAGRAM_TEMPLATE,
            type: 'diagram',
            parentId: targetFolderId,
            tags: ['diagram'],
          },
          db
        );

        if (targetFolderId) {
          setExpandedFolderIds((prev) => new Set(prev).add(targetFolderId));
        } else {
          setExpandedFolderIds((prev) => new Set(prev).add('root_diagrams'));
        }

        handleOpenDiagram(newDiagram);
        message.success('Đã tạo biểu đồ mới');
      } catch {
        message.error('Không thể tạo biểu đồ');
      }
    },
    [db, handleOpenDiagram]
  );

  // Popup Modal Handlers
  const handleOpenCreateFolder = (parentFolder?: Note) => {
    setParentFolderForNew(parentFolder || null);
    setNewFolderName('');
    setNewFolderModalOpen(true);
  };

  const handleConfirmCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      const newFolder = await createNote(
        {
          title: newFolderName.trim(),
          body: '',
          type: 'folder',
          parentId: parentFolderForNew ? parentFolderForNew.id : undefined,
          tags: ['diagram'],
        },
        db
      );

      setExpandedFolderIds((prev) => {
        const next = new Set(prev).add(newFolder.id);
        if (parentFolderForNew) next.add(parentFolderForNew.id);
        return next;
      });

      message.success(`Đã tạo thư mục "${newFolderName.trim()}"`);
      setNewFolderModalOpen(false);
      setNewFolderName('');
      setParentFolderForNew(null);
    } catch {
      message.error('Không thể tạo thư mục');
    }
  };

  const handleOpenRename = (item: Note) => {
    setRenamingItem({ id: item.id, name: item.title || '', isFolder: item.type === 'folder' });
    setRenamedName(item.title || '');
    setRenameModalOpen(true);
  };

  const handleConfirmRename = async () => {
    if (!renamingItem || !renamedName.trim()) return;
    try {
      await updateNote(renamingItem.id, { title: renamedName.trim() }, db);
      message.success(`Đã đổi tên thành "${renamedName.trim()}"`);
      setRenameModalOpen(false);
      setRenamingItem(null);
      setRenamedName('');
    } catch {
      message.error('Không thể đổi tên');
    }
  };

  const handleTogglePin = async (diagram: Note) => {
    try {
      await updateNote(diagram.id, { isPinned: !diagram.isPinned }, db);
      message.success(diagram.isPinned ? 'Đã bỏ ghim' : 'Đã ghim biểu đồ');
    } catch {
      message.error('Không thể cập nhật ghim');
    }
  };

  const handleDuplicateDiagram = async (diagram: Note) => {
    try {
      const cloned = await createNote(
        {
          title: `${diagram.title || 'Biểu đồ'} (bản sao)`,
          body: diagram.body,
          type: 'diagram',
          parentId: diagram.parentId,
          tags: ['diagram'],
          entityType: diagram.entityType,
          entityId: diagram.entityId,
        },
        db
      );
      handleOpenDiagram(cloned);
      message.success('Đã nhân bản biểu đồ');
    } catch {
      message.error('Không thể nhân bản biểu đồ');
    }
  };

  const handleDeleteItem = (item: Note) => {
    const isFolder = item.type === 'folder';
    Modal.confirm({
      title: `Xoá ${isFolder ? 'thư mục' : 'biểu đồ'} "${item.title || 'không tên'}"?`,
      content: isFolder
        ? 'Các biểu đồ bên trong thư mục này sẽ được chuyển vào thùng rác.'
        : 'Biểu đồ sẽ được chuyển vào thùng rác.',
      okText: 'Xoá',
      okType: 'danger',
      cancelText: 'Huỷ',
      onOk: async () => {
        try {
          await softDeleteNote(item.id, db);
          message.success('Đã chuyển vào thùng rác');
        } catch {
          message.error('Không thể xoá');
        }
      },
    });
  };

  const handleRestoreItem = async (item: Note) => {
    try {
      await restoreNote(item.id, db);
      message.success(`Đã khôi phục "${item.title || 'biểu đồ'}"`);
    } catch {
      message.error('Không thể khôi phục');
    }
  };

  const handlePermanentDeleteItem = (item: Note) => {
    Modal.confirm({
      title: `Xoá vĩnh viễn "${item.title || 'không tên'}"?`,
      content: 'Hành động này không thể hoàn tác.',
      okText: 'Xoá vĩnh viễn',
      okType: 'danger',
      cancelText: 'Huỷ',
      onOk: async () => {
        try {
          await permanentDeleteNote(item.id, db);
          message.success('Đã xoá vĩnh viễn');
        } catch {
          message.error('Không thể xoá vĩnh viễn');
        }
      },
    });
  };

  const handleEmptyTrash = () => {
    if (trashNotes.length === 0) return;
    Modal.confirm({
      title: `Dọn sạch toàn bộ thùng rác (${trashNotes.length} mục)?`,
      content: 'Toàn bộ biểu đồ và thư mục trong thùng rác sẽ bị xoá vĩnh viễn.',
      okText: 'Dọn sạch',
      okType: 'danger',
      cancelText: 'Huỷ',
      onOk: async () => {
        try {
          await bulkPermanentDeleteNotes(
            trashNotes.map((n) => n.id),
            db
          );
          message.success('Đã dọn sạch thùng rác diagram');
        } catch {
          message.error('Không thể dọn thùng rác');
        }
      },
    });
  };

  const handleConfirmMove = async (targetFolderId: string | null) => {
    if (!movingDiagram) return;
    try {
      await updateNote(movingDiagram.id, { parentId: targetFolderId }, db);
      message.success('Đã chuyển thư mục thành công');
      setMoveModalOpen(false);
      setMovingDiagram(null);
    } catch {
      message.error('Không thể chuyển thư mục');
    }
  };

  const handleConfirmLink = async () => {
    if (!linkingDiagram) return;
    try {
      await updateNote(
        linkingDiagram.id,
        {
          entityType: selectedEntityType,
          entityId: selectedEntityId,
        },
        db
      );
      message.success('Đã cập nhật liên kết');
      setLinkModalOpen(false);
      setLinkingDiagram(null);
    } catch {
      message.error('Không thể cập nhật liên kết');
    }
  };

  // Build folder hierarchy
  const folderTree = useMemo(() => {
    const folderMap = new Map<string, DiagramFolderTreeNode>();

    for (const f of activeFolders) {
      const folderDiagrams = activeDiagrams.filter((d) => d.parentId === f.id);
      folderMap.set(f.id, {
        id: f.id,
        folder: f,
        title: f.title || 'Thư mục không tên',
        parentId: f.parentId,
        children: [],
        depth: 0,
        diagrams: folderDiagrams,
      });
    }

    const roots: DiagramFolderTreeNode[] = [];
    for (const node of folderMap.values()) {
      if (node.parentId && folderMap.has(node.parentId)) {
        folderMap.get(node.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    const setDepths = (nodes: DiagramFolderTreeNode[], depth: number) => {
      for (const n of nodes) {
        n.depth = depth;
        setDepths(n.children, depth + 1);
      }
    };
    setDepths(roots, 0);

    return roots;
  }, [activeFolders, activeDiagrams]);

  // Search filter
  const isSearching = Boolean(searchQuery.trim());
  const searchResults = useMemo(() => {
    if (!isSearching) return [];
    const q = searchQuery.toLowerCase().trim();
    return activeDiagrams.filter(
      (d) =>
        d.title?.toLowerCase().includes(q) ||
        d.body?.toLowerCase().includes(q)
    );
  }, [activeDiagrams, searchQuery, isSearching]);

  // Render individual diagram item (Identical UI/UX to DocFolderTree's renderDocItem)
  const renderDiagramItem = (diag: Note, depth: number = 0) => {
    const isSelected = selectedDiagramId === diag.id;

    const diagMenu: MenuProps['items'] = [
      {
        key: 'open',
        label: 'Mở trong Diagram Studio',
        icon: <ApartmentOutlined style={{ color: '#10b981' }} />,
        onClick: () => handleOpenDiagram(diag),
      },
      {
        key: 'pin',
        label: diag.isPinned ? 'Bỏ ghim' : 'Ghim lên đầu',
        icon: diag.isPinned ? <PushpinFilled style={{ color: '#d97706' }} /> : <PushpinOutlined />,
        onClick: () => handleTogglePin(diag),
      },
      {
        key: 'rename',
        label: 'Đổi tên biểu đồ',
        icon: <EditOutlined />,
        onClick: () => handleOpenRename(diag),
      },
      {
        key: 'duplicate',
        label: 'Nhân bản biểu đồ',
        icon: <CopyOutlined style={{ color: '#10b981' }} />,
        onClick: () => handleDuplicateDiagram(diag),
      },
      {
        key: 'link',
        label: 'Gắn liên kết Task / CR...',
        icon: <LinkOutlined style={{ color: '#3871e1' }} />,
        onClick: () => {
          setLinkingDiagram(diag);
          setSelectedEntityType(diag.entityType);
          setSelectedEntityId(diag.entityId);
          setLinkModalOpen(true);
        },
      },
      {
        key: 'move',
        label: 'Chuyển thư mục',
        icon: <SwapOutlined />,
        onClick: () => {
          setMovingDiagram(diag);
          setMoveModalOpen(true);
        },
      },
      {
        key: 'copy-code',
        label: 'Sao chép mã Mermaid',
        icon: <CodeOutlined />,
        onClick: async () => {
          try {
            await navigator.clipboard.writeText(diag.body);
            message.success('Đã sao chép mã Mermaid');
          } catch {
            message.error('Không thể sao chép');
          }
        },
      },
      { type: 'divider' },
      {
        key: 'delete',
        label: 'Xoá biểu đồ',
        icon: <DeleteOutlined />,
        danger: true,
        onClick: () => handleDeleteItem(diag),
      },
    ];

    return (
      <Dropdown key={diag.id} menu={{ items: diagMenu }} trigger={['contextMenu']}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => handleOpenDiagram(diag)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleOpenDiagram(diag);
            }
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '4px 8px 4px 6px',
            paddingLeft: depth === 0 ? 8 : 34 + (depth - 1) * 16,
            borderRadius: 4,
            cursor: 'pointer',
            backgroundColor: isSelected ? '#d1fae5' : 'transparent',
            color: isSelected ? '#065f46' : '#374151',
            fontWeight: isSelected ? 600 : 400,
            fontSize: 12.5,
            transition: 'all 0.15s ease',
            margin: '1px 0',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
            <span style={{ fontSize: 13, flexShrink: 0, color: isSelected ? '#059669' : '#10b981' }}>
              <ApartmentOutlined />
            </span>
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={diag.title || 'Untitled Diagram'}
            >
              {diag.title || 'Untitled Diagram'}
            </span>

            {diag.isPinned && (
              <PushpinFilled style={{ fontSize: 10, color: '#f59e0b', flexShrink: 0 }} />
            )}

            {diag.entityType === 'task' && (
              <Tooltip title="Gắn với tác vụ">
                <CheckSquareOutlined style={{ fontSize: 11, color: '#1677ff', flexShrink: 0 }} />
              </Tooltip>
            )}
            {diag.entityType === 'cr' && (
              <Tooltip title="Gắn với Change Request">
                <ProjectOutlined style={{ fontSize: 11, color: '#ea580c', flexShrink: 0 }} />
              </Tooltip>
            )}
            {diag.entityType === 'system' && (
              <Tooltip title="Gắn với hệ thống">
                <FlagOutlined style={{ fontSize: 11, color: '#8b5cf6', flexShrink: 0 }} />
              </Tooltip>
            )}
          </div>

          <div
            style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0, marginLeft: 4 }}
            onClick={(e) => e.stopPropagation()}
          >
            <Dropdown menu={{ items: diagMenu }} trigger={['click']} placement="bottomRight">
              <Button
                type="text"
                size="small"
                icon={<MoreOutlined style={{ fontSize: 11, color: '#9ca3af' }} />}
                style={{ width: 18, height: 18, padding: 0 }}
              />
            </Dropdown>
          </div>
        </div>
      </Dropdown>
    );
  };

  // Render system special folders (Identical UI/UX to DocFolderTree's renderSpecialFolder)
  const renderSpecialCategory = (
    id: string,
    title: string,
    icon: React.ReactNode,
    itemsList: Note[],
    color: string,
    extraAction?: React.ReactNode
  ) => {
    const isExpanded = expandedFolderIds.has(id);
    const count = itemsList.length;

    const specialMenu: MenuProps['items'] = [
      ...(id === 'trash' && count > 0
        ? [
            {
              key: 'empty_trash',
              label: 'Dọn sạch thùng rác (Xoá vĩnh viễn)',
              icon: <DeleteOutlined />,
              danger: true,
              onClick: handleEmptyTrash,
            },
          ]
        : []),
    ];

    const categoryContent = (
      <div
        role="button"
        tabIndex={0}
        onClick={() => toggleFolderExpand(id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleFolderExpand(id);
          }
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '5px 8px 5px 4px',
          borderRadius: 6,
          cursor: 'pointer',
          backgroundColor: 'transparent',
          color: '#262626',
          fontWeight: 400,
          fontSize: 13,
          transition: 'all 0.15s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, flex: 1 }}>
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => toggleFolderExpand(id, e)}
            style={{
              width: 16,
              height: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              color: '#9ca3af',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            {count > 0 ? (
              isExpanded ? <CaretDownOutlined /> : <CaretRightOutlined />
            ) : (
              <span style={{ width: 10 }} />
            )}
          </span>
          <span style={{ fontSize: 14, flexShrink: 0, color, display: 'flex', alignItems: 'center' }}>
            {icon}
          </span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {title}
          </span>
        </div>

        <div
          style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, marginLeft: 4 }}
          onClick={(e) => e.stopPropagation()}
        >
          <span
            style={{
              fontSize: 11,
              padding: '1px 6px',
              borderRadius: 10,
              backgroundColor: '#f0f0f0',
              color: '#8c8c8c',
            }}
          >
            {count}
          </span>
          {extraAction}
          {specialMenu.length > 0 && (
            <Dropdown menu={{ items: specialMenu }} trigger={['click']} placement="bottomRight">
              <Button
                type="text"
                size="small"
                icon={<MoreOutlined style={{ fontSize: 11, color: '#9ca3af' }} />}
                style={{ width: 18, height: 18, padding: 0 }}
              />
            </Dropdown>
          )}
        </div>
      </div>
    );

    return (
      <div key={id} style={{ display: 'flex', flexDirection: 'column' }}>
        {specialMenu.length > 0 ? (
          <Dropdown menu={{ items: specialMenu }} trigger={['contextMenu']}>
            {categoryContent}
          </Dropdown>
        ) : (
          categoryContent
        )}

        {isExpanded && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {count === 0 ? (
              <div style={{ padding: '4px 8px 4px 34px', fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>
                Trống
              </div>
            ) : (
              itemsList.map((item) =>
                id === 'trash' ? (
                  /* Deleted item in trash */
                  <Dropdown
                    key={item.id}
                    menu={{
                      items: [
                        {
                          key: 'restore',
                          label: 'Khôi phục',
                          icon: <UndoOutlined style={{ color: '#10b981' }} />,
                          onClick: () => handleRestoreItem(item),
                        },
                        {
                          key: 'delete_permanent',
                          label: 'Xoá vĩnh viễn',
                          icon: <DeleteOutlined style={{ color: '#ef4444' }} />,
                          danger: true,
                          onClick: () => handlePermanentDeleteItem(item),
                        },
                      ],
                    }}
                    trigger={['contextMenu']}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '4px 8px 4px 28px',
                        color: '#9ca3af',
                        fontSize: 12,
                      }}
                    >
                      <span style={{ textDecoration: 'line-through', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.title || 'Untitled Diagram'}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Tooltip title="Khôi phục">
                          <Button
                            type="text"
                            size="small"
                            icon={<UndoOutlined style={{ fontSize: 11, color: '#10b981' }} />}
                            onClick={() => handleRestoreItem(item)}
                            style={{ width: 18, height: 18, padding: 0 }}
                          />
                        </Tooltip>
                        <Tooltip title="Xoá vĩnh viễn">
                          <Button
                            type="text"
                            size="small"
                            icon={<DeleteOutlined style={{ fontSize: 11, color: '#ef4444' }} />}
                            onClick={() => handlePermanentDeleteItem(item)}
                            style={{ width: 18, height: 18, padding: 0 }}
                          />
                        </Tooltip>
                      </div>
                    </div>
                  </Dropdown>
                ) : (
                  renderDiagramItem(item, 1)
                )
              )
            )}
          </div>
        )}
      </div>
    );
  };

  // Render user folder node (Identical UI/UX to DocFolderTree's renderFolderNode)
  const renderFolderNode = (node: DiagramFolderTreeNode): React.ReactNode => {
    const isExpanded = expandedFolderIds.has(node.id);
    const count = node.diagrams.length;

    const folderMenu: MenuProps['items'] = [
      {
        key: 'new_diagram',
        label: 'Tạo biểu đồ mới',
        icon: <PlusOutlined style={{ color: '#10b981' }} />,
        onClick: () => handleCreateDiagram(node.id),
      },
      {
        key: 'new_subfolder',
        label: 'Thư mục con mới',
        icon: <FolderAddOutlined style={{ color: '#eab308' }} />,
        onClick: () => handleOpenCreateFolder(node.folder),
      },
      { type: 'divider' },
      {
        key: 'rename',
        label: 'Đổi tên thư mục',
        icon: <EditOutlined />,
        onClick: () => handleOpenRename(node.folder),
      },
      {
        key: 'delete',
        label: 'Xoá thư mục',
        icon: <DeleteOutlined />,
        danger: true,
        onClick: () => handleDeleteItem(node.folder),
      },
    ];

    const folderContent = (
      <div
        role="button"
        tabIndex={0}
        onClick={() => toggleFolderExpand(node.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleFolderExpand(node.id);
          }
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '5px 8px 5px 4px',
          paddingLeft: node.depth === 0 ? 4 : 4 + node.depth * 14,
          borderRadius: 6,
          cursor: 'pointer',
          backgroundColor: 'transparent',
          color: '#262626',
          fontWeight: 500,
          fontSize: 13,
          transition: 'all 0.15s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, flex: 1 }}>
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => toggleFolderExpand(node.id, e)}
            style={{
              width: 16,
              height: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              color: '#9ca3af',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            {node.children.length > 0 || count > 0 ? (
              isExpanded ? <CaretDownOutlined /> : <CaretRightOutlined />
            ) : (
              <span style={{ width: 10 }} />
            )}
          </span>
          <span style={{ fontSize: 14, flexShrink: 0, color: '#eab308', display: 'flex', alignItems: 'center' }}>
            {isExpanded ? <FolderFilled /> : <FolderOutlined />}
          </span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {node.title}
          </span>
        </div>

        <div
          style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, marginLeft: 4 }}
          onClick={(e) => e.stopPropagation()}
        >
          <span
            style={{
              fontSize: 11,
              padding: '1px 6px',
              borderRadius: 10,
              backgroundColor: '#f0f0f0',
              color: '#8c8c8c',
            }}
          >
            {count}
          </span>
          <Tooltip title="Tạo biểu đồ trong thư mục">
            <Button
              type="text"
              size="small"
              icon={<PlusOutlined style={{ fontSize: 11, color: '#10b981' }} />}
              onClick={() => handleCreateDiagram(node.id)}
              style={{ width: 18, height: 18, padding: 0 }}
            />
          </Tooltip>
          <Dropdown menu={{ items: folderMenu }} trigger={['click']} placement="bottomRight">
            <Button
              type="text"
              size="small"
              icon={<MoreOutlined style={{ fontSize: 11, color: '#9ca3af' }} />}
              style={{ width: 18, height: 18, padding: 0 }}
            />
          </Dropdown>
        </div>
      </div>
    );

    return (
      <div key={node.id} style={{ display: 'flex', flexDirection: 'column' }}>
        <Dropdown menu={{ items: folderMenu }} trigger={['contextMenu']}>
          {folderContent}
        </Dropdown>

        {isExpanded && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {/* Child subfolders */}
            {node.children.map((child) => renderFolderNode(child))}

            {/* Diagrams in this folder */}
            {node.diagrams.map((d) => renderDiagramItem(d, node.depth + 1))}

            {node.children.length === 0 && count === 0 && (
              <div
                style={{
                  padding: `4px 8px 4px ${34 + node.depth * 14}px`,
                  fontSize: 11,
                  color: '#9ca3af',
                  fontStyle: 'italic',
                }}
              >
                Trống
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        background: 'var(--bg-island, #ffffff)',
        overflow: 'hidden',
        boxSizing: 'border-box',
        padding: '8px 6px',
      }}
    >
      {/* 1. Search Bar (Same design as DocFolderTree) */}
      <div style={{ marginBottom: 8, padding: '0 4px' }}>
        <Input
          prefix={<SearchOutlined style={{ color: '#8c8c8c', fontSize: 13 }} />}
          placeholder="Tìm kiếm biểu đồ..."
          allowClear
          size="small"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            fontSize: 12,
            borderRadius: 6,
          }}
        />
      </div>

      {/* 2. Content Scroll Area */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
        {isSearching ? (
          /* Search results mode */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ padding: '4px 8px', fontSize: 11, color: '#8c8c8c', fontWeight: 600 }}>
              KẾT QUẢ TÌM KIẾM ({searchResults.length})
            </div>
            {searchResults.length > 0 ? (
              searchResults.map((d) => renderDiagramItem(d, 0))
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="Không tìm thấy biểu đồ phù hợp"
                style={{ marginTop: 24 }}
              />
            )}
          </div>
        ) : (
          /* Normal mode */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
            {/* Pinned system category */}
            {pinnedDiagrams.length > 0 &&
              renderSpecialCategory(
                'pinned',
                'Đã ghim',
                <PushpinFilled style={{ color: '#f59e0b' }} />,
                pinnedDiagrams,
                '#f59e0b'
              )}

            {/* Root Diagrams (without folder) */}
            {renderSpecialCategory(
              'root_diagrams',
              'Biểu đồ chung (Chưa phân loại)',
              <ApartmentOutlined style={{ color: '#10b981' }} />,
              rootDiagrams,
              '#10b981',
              <Tooltip title="Tạo biểu đồ mới">
                <Button
                  type="text"
                  size="small"
                  icon={<PlusOutlined style={{ fontSize: 11, color: '#10b981' }} />}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCreateDiagram(undefined);
                  }}
                  style={{ width: 18, height: 18, padding: 0 }}
                />
              </Tooltip>
            )}

            {/* Dedicated Diagram Trash Can */}
            {trashNotes.length > 0 &&
              renderSpecialCategory(
                'trash',
                'Thùng rác',
                <DeleteOutlined style={{ color: '#ef4444' }} />,
                trashNotes,
                '#ef4444'
              )}

            {/* User Folders Header */}
            <div style={{ marginTop: 8, marginBottom: 2 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '4px 8px',
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', color: '#8c8c8c' }}>
                  THƯ MỤC
                </span>
                <Tooltip title="Thêm thư mục gốc">
                  <Button
                    type="text"
                    size="small"
                    icon={<PlusOutlined style={{ fontSize: 11, color: '#8c8c8c' }} />}
                    onClick={() => handleOpenCreateFolder(undefined)}
                    style={{ width: 20, height: 20, padding: 0 }}
                  />
                </Tooltip>
              </div>

              {folderTree.length === 0 ? (
                <div
                  style={{
                    padding: '8px',
                    textAlign: 'center',
                    border: '1px dashed #e5e7eb',
                    borderRadius: 6,
                    margin: '2px 4px',
                  }}
                >
                  <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                    Chưa có thư mục
                  </Text>
                  <Button
                    size="small"
                    type="dashed"
                    icon={<PlusOutlined />}
                    onClick={() => handleOpenCreateFolder(undefined)}
                    style={{ fontSize: 11 }}
                  >
                    Tạo thư mục
                  </Button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {folderTree.map((rootNode) => renderFolderNode(rootNode))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* POPUP MODAL: Tạo thư mục mới (Identical to DocFolderTree) */}
      <Modal
        title={parentFolderForNew ? `Tạo thư mục con trong "${parentFolderForNew.title}"` : 'Tạo thư mục mới'}
        open={newFolderModalOpen}
        onOk={handleConfirmCreateFolder}
        onCancel={() => {
          setNewFolderModalOpen(false);
          setNewFolderName('');
          setParentFolderForNew(null);
        }}
        okText="Tạo thư mục"
        cancelText="Huỷ"
        okButtonProps={{ disabled: !newFolderName.trim() }}
        destroyOnClose
      >
        <Input
          placeholder="Nhập tên thư mục..."
          value={newFolderName}
          onChange={(e) => setNewFolderName(e.target.value)}
          onPressEnter={handleConfirmCreateFolder}
          autoFocus
          style={{ marginTop: 12 }}
        />
      </Modal>

      {/* POPUP MODAL: Đổi tên (Unified for folder & diagram, identical to DocFolderTree) */}
      <Modal
        title={renamingItem?.isFolder ? 'Đổi tên thư mục' : 'Đổi tên biểu đồ'}
        open={renameModalOpen}
        onOk={handleConfirmRename}
        onCancel={() => {
          setRenameModalOpen(false);
          setRenamingItem(null);
          setRenamedName('');
        }}
        okText="Lưu tên mới"
        cancelText="Huỷ"
        okButtonProps={{ disabled: !renamedName.trim() }}
        destroyOnClose
      >
        <Input
          placeholder="Nhập tên mới..."
          value={renamedName}
          onChange={(e) => setRenamedName(e.target.value)}
          onPressEnter={handleConfirmRename}
          autoFocus
          style={{ marginTop: 12 }}
        />
      </Modal>

      {/* POPUP MODAL: Di chuyển vào thư mục */}
      <Modal
        title="Chuyển thư mục"
        open={moveModalOpen}
        onCancel={() => {
          setMoveModalOpen(false);
          setMovingDiagram(null);
        }}
        footer={null}
        destroyOnClose
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto', marginTop: 10 }}>
          <button
            type="button"
            onClick={() => handleConfirmMove(null)}
            style={{
              padding: '8px 12px',
              textAlign: 'left',
              border: '1px solid var(--border, #e9eaee)',
              borderRadius: 6,
              background: movingDiagram?.parentId === undefined ? '#d1fae5' : 'transparent',
              color: movingDiagram?.parentId === undefined ? '#065f46' : 'inherit',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            📁 Thư mục gốc (Chưa phân loại)
          </button>
          {activeFolders.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => handleConfirmMove(f.id)}
              style={{
                padding: '8px 12px',
                textAlign: 'left',
                border: '1px solid var(--border, #e9eaee)',
                borderRadius: 6,
                background: movingDiagram?.parentId === f.id ? '#d1fae5' : 'transparent',
                color: movingDiagram?.parentId === f.id ? '#065f46' : 'inherit',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              📁 {f.title || 'Thư mục không tên'}
            </button>
          ))}
        </div>
      </Modal>

      {/* POPUP MODAL: Gắn liên kết Task / CR / System */}
      <Modal
        title="Gắn liên kết biểu đồ"
        open={linkModalOpen}
        onOk={handleConfirmLink}
        onCancel={() => {
          setLinkModalOpen(false);
          setLinkingDiagram(null);
        }}
        okText="Lưu liên kết"
        cancelText="Huỷ"
        destroyOnClose
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Loại đối tượng</div>
            <Select
              value={selectedEntityType || 'none'}
              onChange={(val) => {
                if (val === 'none') {
                  setSelectedEntityType(undefined);
                  setSelectedEntityId(undefined);
                } else {
                  setSelectedEntityType(val as NoteEntityType);
                  setSelectedEntityId(undefined);
                }
              }}
              style={{ width: '100%' }}
              options={[
                { value: 'none', label: 'Không gắn liên kết' },
                { value: 'task', label: '📌 Tác vụ (Task)' },
                { value: 'cr', label: '📁 Change Request (CR)' },
                { value: 'system', label: '🚩 Hệ thống (System)' },
              ]}
            />
          </div>

          {selectedEntityType && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                Chọn {selectedEntityType === 'task' ? 'Tác vụ' : selectedEntityType === 'cr' ? 'Change Request' : 'Hệ thống'}
              </div>
              <Select
                showSearch
                placeholder={`Chọn ${selectedEntityType}...`}
                value={selectedEntityId}
                onChange={(val) => setSelectedEntityId(val)}
                style={{ width: '100%' }}
                filterOption={(input, option) =>
                  (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                }
                options={
                  selectedEntityType === 'task'
                    ? (tasks || []).map((t) => ({ value: t.id, label: t.name }))
                    : selectedEntityType === 'cr'
                    ? (changeRequests || []).map((cr) => ({ value: cr.id, label: cr.code || cr.name }))
                    : (systems || []).map((s) => ({ value: s.id, label: s.name }))
                }
              />
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
