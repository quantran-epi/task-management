import React, { useState, useMemo } from 'react';
import { Button, Input, Select, Space, Empty, message } from 'antd';
import { PlusOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import { getAllSystems, createSystem, updateSystem, deleteSystem } from '../db/repositories/systemRepo';
import { getSshConfigs } from '../services/sshService';
import { PageHeader } from '../components/common/PageHeader';
import { SystemTable } from '../components/systems/SystemTable';
import { SystemModal } from '../components/systems/SystemModal';
import type { System, SystemType } from '../types/models';

export interface SystemCatalogViewProps {
  db?: TaskPlannerDatabase | undefined;
}

export const SystemCatalogView: React.FC<SystemCatalogViewProps> = ({ db = defaultDb }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingSystem, setEditingSystem] = useState<System | null>(null);
  const [defaultParentId, setDefaultParentId] = useState<string | null>(null);

  // Live queries
  const systems = useLiveQuery(() => getAllSystems(db), [db]) ?? [];
  const sshConfigs = useLiveQuery(() => getSshConfigs(db), [db]) ?? [];

  // Filter systems
  const filteredSystems = useMemo(() => {
    let list = systems;
    if (typeFilter !== 'ALL') {
      list = list.filter((s) => s.type === typeFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.code.toLowerCase().includes(q) ||
          (s.description && s.description.toLowerCase().includes(q)) ||
          (s.remoteRepoPath && s.remoteRepoPath.toLowerCase().includes(q))
      );
    }
    return list;
  }, [systems, typeFilter, searchQuery]);

  const handleOpenCreateParent = () => {
    setEditingSystem(null);
    setDefaultParentId(null);
    setModalOpen(true);
  };

  const handleAddSubsystem = (parentId: string) => {
    setEditingSystem(null);
    setDefaultParentId(parentId);
    setModalOpen(true);
  };

  const handleEditSystem = (system: System) => {
    setEditingSystem(system);
    setDefaultParentId(system.parentId);
    setModalOpen(true);
  };

  const handleDeleteSystem = async (system: System) => {
    try {
      await deleteSystem(system.id, db);
      message.success(`Đã xóa hệ thống "${system.name}"`);
    } catch (err: any) {
      message.error(err?.message || 'Không thể xóa hệ thống do còn subsystem con');
    }
  };

  const handleSaveSystem = async (values: any) => {
    try {
      if (editingSystem) {
        await updateSystem(editingSystem.id, values, db);
        message.success({ content: 'Đã cập nhật hệ thống', duration: 1.5 });
      } else {
        await createSystem(values, db);
        message.success({ content: 'Đã tạo hệ thống mới', duration: 1.5 });
      }
      setModalOpen(false);
    } catch (err: any) {
      message.error({ content: err?.message || 'Không thể lưu hệ thống', duration: 2 });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title="Danh mục hệ thống (Enterprise Systems Catalog)"
        subtitle="Quản lý cấu trúc Parent Systems, Subsystems deployable, thông tin SSH và kho mã nguồn từ xa"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleOpenCreateParent}
            data-testid="btn-create-system"
          >
            Tạo hệ thống
          </Button>
        }
      />

      {/* Toolbar: Search, Type filter */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          padding: '10px 14px',
          background: 'var(--bg-island, #ffffff)',
          borderRadius: 8,
          border: '1px solid var(--border, #e9eaee)',
        }}
      >
        <Space size="middle">
          <Input
            prefix={<SearchOutlined style={{ color: 'var(--fg-muted, #6c707e)' }} />}
            placeholder="Tìm kiếm hệ thống theo tên, code, repo..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            allowClear
            style={{ width: 280 }}
          />

          <Select
            value={typeFilter}
            onChange={setTypeFilter}
            style={{ width: 180 }}
            options={[
              { value: 'ALL', label: 'Tất cả loại hệ thống' },
              { value: 'LOGICAL_GROUP', label: 'Parent System' },
              { value: 'SERVICE', label: 'Service / Microservice' },
              { value: 'SCHEMA', label: 'Database Schema' },
              { value: 'UI', label: 'Frontend UI' },
              { value: 'WORKER', label: 'Worker / Batch Job' },
            ]}
          />
        </Space>

        <Button
          icon={<ReloadOutlined />}
          onClick={() => {
            setSearchQuery('');
            setTypeFilter('ALL');
          }}
        >
          Đặt lại bộ lọc
        </Button>
      </div>

      {/* Body: Hierarchical System Table or Empty State */}
      {systems.length === 0 ? (
        <div
          style={{
            padding: '48px 16px',
            background: 'var(--bg-island, #ffffff)',
            borderRadius: 8,
            border: '1px solid var(--border, #e9eaee)',
            textAlign: 'center',
          }}
        >
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <div>
                <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 6 }}>
                  Chưa có hệ thống nào trong danh mục
                </div>
                <div style={{ color: 'var(--fg-secondary, #5f6269)', maxWidth: 460, margin: '0 auto 16px' }}>
                  Tạo nhóm hệ thống logic (Parent System) hoặc subsystem deployable (dịch vụ, schema DB) để quản lý cấu hình SSH và mã nguồn.
                </div>
              </div>
            }
          >
            <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenCreateParent}>
              Tạo hệ thống
            </Button>
          </Empty>
        </div>
      ) : (
        <SystemTable
          systems={filteredSystems}
          sshConfigs={sshConfigs}
          onAddSubsystem={handleAddSubsystem}
          onEditSystem={handleEditSystem}
          onDeleteSystem={handleDeleteSystem}
        />
      )}

      {/* System Modal */}
      <SystemModal
        open={modalOpen}
        system={editingSystem}
        defaultParentId={defaultParentId}
        onClose={() => {
          setModalOpen(false);
          setEditingSystem(null);
          setDefaultParentId(null);
        }}
        onSave={handleSaveSystem}
        db={db}
      />
    </div>
  );
};

export default SystemCatalogView;
