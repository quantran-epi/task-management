import { useState, useMemo } from 'react';
import { Tree, Input, Empty, Typography, Button, Dropdown, Modal, message, type MenuProps } from 'antd';
import {
  FolderOutlined,
  FolderOpenOutlined,
  BranchesOutlined,
  SearchOutlined,
  InboxOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ExportOutlined,
  RocketOutlined,
  CloudServerOutlined,
  CodeOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import {
  getAllSystems,
  deleteSystem,
  createSystem,
  updateSystem,
  isLogicalParent,
  isSubsystem,
} from '../../db/repositories/systemRepo';
import { createChangeRequest } from '../../db/repositories/changeRequestRepo';
import { useLayoutStore } from '../store/layoutStore';
import { useSystemActions } from '../hooks/useSystemActions';
import { SystemModal } from '../../components/systems/SystemModal';
import { ChangeRequestModal } from '../../components/changeRequests/ChangeRequestModal';
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
  const [crModalTarget, setCrModalTarget] = useState<System | null>(null);

  const openTab = useLayoutStore((s) => s.openTab);
  const { openGit, openTerminal, disabledReason } = useSystemActions();

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

  const handleCreateCr = (system: System) => {
    setCrModalTarget(system);
  };

  // D-30 / T-31.2-32: parent and subsystem action sets diverge. A parent never gets `Tạo CR`.
  // Disabled Git/Terminal items carry the tooltip copy `Chưa cấu hình SSH/Repo — mở System Catalog`
  // from `useSystemActions().disabledReason`.
  const getNodeMenu = (system: System): MenuProps['items'] => {
    const isParent = isLogicalParent(system);
    const reason = isParent ? undefined : disabledReason(system);

    const openDetailItem = {
      key: 'open-detail',
      icon: <ExportOutlined style={{ color: 'var(--accent, #3871e1)' }} />,
      label: 'Xem chi tiết',
      onClick: () => handleOpenDetail(system),
    };

    const editItem = {
      key: 'edit',
      icon: <EditOutlined />,
      label: 'Sửa',
      onClick: () => handleEdit(system),
    };

    const deleteItem = {
      key: 'delete',
      icon: <DeleteOutlined style={{ color: 'var(--danger, #c54e58)' }} />,
      danger: true,
      label: 'Xóa',
      onClick: () => handleDelete(system),
    };

    if (isParent) {
      return [
        openDetailItem,
        {
          key: 'add-subsystem',
          icon: <PlusOutlined style={{ color: '#13c2c2' }} />,
          label: 'Thêm subsystem',
          onClick: () => handleCreateSubsystem(system.id),
        },
        editItem,
        { type: 'divider' },
        deleteItem,
      ];
    }

    return [
      openDetailItem,
      {
        key: 'create-cr',
        icon: <RocketOutlined style={{ color: 'var(--accent, #3871e1)' }} />,
        label: 'Tạo CR',
        onClick: () => handleCreateCr(system),
      },
      {
        key: 'open-git',
        icon: <CloudServerOutlined />,
        label: 'Mở Git',
        disabled: !!reason,
        ...(reason ? { title: reason } : {}),
        onClick: () => openGit(system),
      },
      {
        key: 'open-terminal',
        icon: <CodeOutlined />,
        label: 'Mở Terminal',
        disabled: !!reason,
        ...(reason ? { title: reason } : {}),
        onClick: () => openTerminal(system),
      },
      editItem,
      { type: 'divider' },
      deleteItem,
    ];
  };

  const renderSubsystemNode = (c: System): DataNode => ({
    key: `sys:${c.id}`,
    title: (
      <Dropdown menu={{ items: getNodeMenu(c) ?? [] }} trigger={['contextMenu']}>
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
  });

  const treeData = useMemo<DataNode[]>(() => {
    const q = searchQuery.trim().toLowerCase();

    // D-24: parents are identified by their type alone, never by a missing parent link.
    const parents = systems.filter(isLogicalParent);
    const subsystems = systems.filter(isSubsystem);

    const matches = (s: System) =>
      !q || s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q);

    const parentNodes = parents
      .map((p) => {
        const childNodes = subsystems.filter((c) => c.parentId === p.id).map(renderSubsystemNode);
        if (!matches(p) && childNodes.length === 0) return null;

        return {
          key: `sys:${p.id}`,
          title: (
            <Dropdown menu={{ items: getNodeMenu(p) ?? [] }} trigger={['contextMenu']}>
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
          icon: ({ expanded }: { expanded?: boolean }) =>
            expanded ? (
              <FolderOpenOutlined style={{ color: '#722ed1' }} />
            ) : (
              <FolderOutlined style={{ color: '#722ed1' }} />
            ),
          children: childNodes,
        };
      })
      .filter(Boolean) as DataNode[];

    // Unparented subsystems are still subsystems: render them at root with the subsystem
    // action set so `Tạo CR` / `Mở Git` / `Mở Terminal` stay reachable.
    const parentIds = new Set(parents.map((p) => p.id));
    const unparented = subsystems.filter(
      (c) => (!c.parentId || !parentIds.has(c.parentId)) && matches(c)
    );

    return [...parentNodes, ...unparented.map(renderSubsystemNode)];
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
            motion={false as any}
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
          // Let invariant errors propagate — SystemModal renders them inline (T-31.2-31).
          if (editingSystem) {
            await updateSystem(editingSystem.id, values, db);
            message.success('Đã cập nhật hệ thống');
          } else {
            await createSystem(values, db);
            message.success('Đã tạo hệ thống mới');
          }
          setModalOpen(false);
        }}
        db={db}
      />

      {/* D-34: `Tạo CR` from a subsystem pre-fills and soft-locks that subsystem. */}
      <ChangeRequestModal
        open={!!crModalTarget}
        initialTargets={crModalTarget ? [{ systemId: crModalTarget.id }] : []}
        systems={systems}
        onClose={() => setCrModalTarget(null)}
        onSave={async (values) => {
          await createChangeRequest(values as any, db);
          message.success('Đã tạo Change Request mới');
          setCrModalTarget(null);
        }}
        db={db}
      />
    </div>
  );
}

export default SystemsExplorer;
