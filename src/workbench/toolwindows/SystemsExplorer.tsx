import React, { useState, useMemo } from 'react';
import { Tree, Input, Empty, Typography, Button, Dropdown, Modal, message, type MenuProps } from 'antd';
import {
  ApartmentOutlined,
  FolderOutlined,
  BranchesOutlined,
  SearchOutlined,
  InboxOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ExportOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { getAllSystems, deleteSystem, createSystem, updateSystem } from '../../db/repositories/systemRepo';
import { useLayoutStore } from '../store/layoutStore';
import { SystemModal } from '../../components/systems/SystemModal';
import type { DataNode } from 'antd/es/tree';
import type { System } from '../../types/models';

export interface SystemsExplorerProps {
  db?: TaskPlannerDatabase | undefined;
}

export function SystemsExplorer({ db = defaultDb }: SystemsExplorerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSystem, setEditingSystem] = useState<System | null>(null);
  const [defaultParentId, setDefaultParentId] = useState<string | null>(null);

  const openTab = useLayoutStore((s) => s.openTab);

  const systems = useLiveQuery(() => getAllSystems(db), [db]) ?? [];

  const handleOpenDetail = (targetSystem: System) => {
    openTab({
      id: `system-${targetSystem.id}`,
      title: targetSystem.name,
      viewType: 'system_detail',
      closable: true,
      params: { systemId: targetSystem.id },
    });
  };

  const handleOpenCatalog = () => {
    openTab({
      id: 'systems',
      title: 'Danh mục hệ thống',
      viewType: 'systems',
      closable: true,
    });
  };

  const handleCreateSubsystem = (parentId: string) => {
    setEditingSystem(null);
    setDefaultParentId(parentId);
    setModalOpen(true);
  };

  const handleEdit = (system: System) => {
    setEditingSystem(system);
    setDefaultParentId(system.parentId);
    setModalOpen(true);
  };

  const handleDelete = (system: System) => {
    Modal.confirm({
      title: `Xóa hệ thống "${system.name}"?`,
      content: `Xóa hệ thống '${system.name}'? Toàn bộ liên kết SSH và cấu hình repo của hệ thống này sẽ bị hủy. Các subsystem con cần được gán lại hệ thống cha.`,
      okText: 'Xóa',
      okType: 'danger',
      cancelText: 'Hủy',
      onOk: async () => {
        try {
          await deleteSystem(system.id, db);
          message.success(`Đã xóa hệ thống "${system.name}"`);
        } catch (err: any) {
          message.error(err?.message || 'Không thể xóa hệ thống do còn subsystem con');
        }
      },
    });
  };

  const getNodeMenu = (system: System): MenuProps['items'] => {
    const isParent = system.parentId === null || system.type === 'LOGICAL_GROUP';
    return [
      {
        key: 'open-detail',
        icon: <ExportOutlined style={{ color: 'var(--accent, #3871e1)' }} />,
        label: 'Xem chi tiết',
        onClick: () => handleOpenDetail(system),
      },
      ...(isParent
        ? [
            {
              key: 'add-subsystem',
              icon: <PlusOutlined style={{ color: '#13c2c2' }} />,
              label: 'Thêm subsystem',
              onClick: () => handleCreateSubsystem(system.id),
            },
          ]
        : []),
      {
        key: 'edit',
        icon: <EditOutlined />,
        label: 'Sửa',
        onClick: () => handleEdit(system),
      },
      {
        type: 'divider',
      },
      {
        key: 'delete',
        icon: <DeleteOutlined style={{ color: 'var(--danger, #c54e58)' }} />,
        danger: true,
        label: 'Xóa',
        onClick: () => handleDelete(system),
      },
    ];
  };

  const treeData = useMemo<DataNode[]>(() => {
    const q = searchQuery.trim().toLowerCase();

    // Group parents (parentId === null or type === LOGICAL_GROUP)
    const parents = systems.filter((s) => s.parentId === null || s.type === 'LOGICAL_GROUP');

    return parents
      .map((p) => {
        const children = systems.filter((s) => s.parentId === p.id);
        const filteredChildren = q
          ? children.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q))
          : children;

        const childNodes: DataNode[] = filteredChildren.map((c) => ({
          key: `sys:${c.id}`,
          title: (
            <Dropdown menu={{ items: getNodeMenu(c) }} trigger={['contextMenu']}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  width: '100%',
                  justifyContent: 'space-between',
                  gap: 6,
                }}
              >
                <Typography.Text ellipsis style={{ flex: 1, fontSize: 13, lineHeight: '20px' }}>
                  {c.name}
                </Typography.Text>
                <span
                  style={{
                    fontSize: 10,
                    padding: '0 4px',
                    borderRadius: 3,
                    background: '#e6fffb',
                    color: '#08979c',
                    border: '1px solid #87e8de',
                    flexShrink: 0,
                  }}
                >
                  {c.code}
                </span>
              </span>
            </Dropdown>
          ),
          icon: <BranchesOutlined style={{ color: '#13c2c2' }} />,
          isLeaf: true,
        }));

        const matchParent = !q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q) || childNodes.length > 0;
        if (!matchParent) return null;

        return {
          key: `sys:${p.id}`,
          title: (
            <Dropdown menu={{ items: getNodeMenu(p) }} trigger={['contextMenu']}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  gap: 6,
                }}
              >
                <Typography.Text ellipsis strong style={{ flex: 1, fontSize: 13, lineHeight: '20px' }}>
                  {p.name}
                </Typography.Text>
                <span
                  style={{
                    fontSize: 10,
                    padding: '0 4px',
                    borderRadius: 3,
                    background: '#f9f0ff',
                    color: '#722ed1',
                    border: '1px solid #d3adf7',
                    flexShrink: 0,
                  }}
                >
                  {p.code}
                </span>
              </span>
            </Dropdown>
          ),
          icon: <FolderOutlined style={{ color: '#722ed1' }} />,
          children: childNodes,
        };
      })
      .filter(Boolean) as DataNode[];
  }, [systems, searchQuery]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header filter & quick action */}
      <div
        style={{
          padding: '8px 10px',
          borderBottom: '1px solid var(--border, #e9eaee)',
          display: 'flex',
          gap: 6,
          alignItems: 'center',
        }}
      >
        <Input
          prefix={<SearchOutlined style={{ color: 'var(--fg-muted, #6c707e)', fontSize: 12 }} />}
          placeholder="Lọc hệ thống, subsystem..."
          allowClear
          size="small"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            fontSize: 'var(--font-size-small, 12px)',
            borderRadius: 'var(--radius-control, 4px)',
            flex: 1,
          }}
        />
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined />}
          onClick={() => {
            setEditingSystem(null);
            setDefaultParentId(null);
            setModalOpen(true);
          }}
          title="Tạo hệ thống mới"
          style={{ height: 24, padding: '0 8px', fontSize: 12 }}
        >
          Tạo
        </Button>
      </div>

      {/* Tree container */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '4px 6px' }}>
        {treeData.length > 0 ? (
          <Tree
            showIcon
            blockNode
            defaultExpandAll
            treeData={treeData}
            onSelect={(selectedKeys) => {
              if (selectedKeys.length === 0) return;
              const key = selectedKeys[0]?.toString() || '';
              const systemId = key.replace(/^sys:/, '');
              const target = systems.find((s) => s.id === systemId);
              if (target) {
                handleOpenDetail(target);
              }
            }}
            onDoubleClick={(_, node) => {
              const key = node.key.toString();
              const systemId = key.replace(/^sys:/, '');
              const target = systems.find((s) => s.id === systemId);
              if (target) {
                handleOpenDetail(target);
              }
            }}
            style={{
              background: 'transparent',
              fontSize: 'var(--font-size-ui, 13px)',
            }}
          />
        ) : (
          <Empty
            image={<InboxOutlined style={{ fontSize: 28, color: 'var(--fg-muted, #6c707e)' }} />}
            description="Chưa có hệ thống nào"
            style={{ marginTop: 24 }}
          >
            <Button size="small" type="primary" onClick={() => setModalOpen(true)}>
              Tạo hệ thống
            </Button>
          </Empty>
        )}
      </div>

      {/* System Create/Edit Modal */}
      <SystemModal
        open={modalOpen}
        system={editingSystem}
        defaultParentId={defaultParentId}
        onClose={() => {
          setModalOpen(false);
          setEditingSystem(null);
          setDefaultParentId(null);
        }}
        onSave={async (values) => {
          try {
            if (editingSystem) {
              await updateSystem(editingSystem.id, values, db);
              message.success('Đã cập nhật hệ thống');
            } else {
              await createSystem(values, db);
              message.success('Đã tạo hệ thống mới');
            }
            setModalOpen(false);
          } catch (err: any) {
            message.error(err?.message || 'Không thể lưu hệ thống');
          }
        }}
        db={db}
      />
    </div>
  );
}

export default SystemsExplorer;
