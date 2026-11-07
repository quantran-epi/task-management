import React, { useState, useMemo } from 'react';
import { Button, Input, Select, Space, Modal, message } from 'antd';
import { PlusOutlined, SearchOutlined, FilterOutlined } from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import {
  getAllChangeRequests,
  createChangeRequest,
  updateChangeRequest,
  deleteChangeRequest,
} from '../db/repositories/changeRequestRepo';
import { ChangeRequestTable } from '../components/changeRequests/ChangeRequestTable';
import { ChangeRequestModal } from '../components/changeRequests/ChangeRequestModal';
import { PageHeader } from '../components/common/PageHeader';
import { ProjectSdlcView } from './ProjectSdlcView';
import type { ChangeRequest, CrType, CrStatus } from '../types/models';
import type { ChangeRequestInput, ChangeRequestUpdate } from '../validation/schemas';
import { useLayoutStore } from '../workbench/store/layoutStore';

export interface ChangeRequestsViewProps {
  db?: TaskPlannerDatabase;
}

export const ChangeRequestsView: React.FC<ChangeRequestsViewProps> = ({ db = defaultDb }) => {
  const [crModalOpen, setCrModalOpen] = useState(false);
  const [editingCR, setEditingCR] = useState<ChangeRequest | null>(null);
  const [activeSdlcCrId, setActiveSdlcCrId] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<CrType | 'ALL'>('ALL');
  const [filterSystemId, setFilterSystemId] = useState<string | 'ALL'>('ALL');

  const openTab = useLayoutStore((s) => s.openTab);

  const changeRequests = useLiveQuery(() => getAllChangeRequests(db), [db]) ?? [];
  const tasks = useLiveQuery(() => db.tasks.toArray(), [db]) ?? [];
  const systems = useLiveQuery(() => db.systems.toArray(), [db]) ?? [];

  const filteredCRs = useMemo(() => {
    return changeRequests.filter((cr) => {
      if (filterType !== 'ALL' && cr.type !== filterType) {
        return false;
      }
      if (filterSystemId !== 'ALL') {
        if (!cr.targetSystemIds || !cr.targetSystemIds.includes(filterSystemId)) {
          return false;
        }
      }
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchName = cr.name.toLowerCase().includes(q);
        const matchCode = cr.code?.toLowerCase().includes(q) ?? false;
        const matchDesc = cr.description?.toLowerCase().includes(q) ?? false;
        if (!matchName && !matchCode && !matchDesc) {
          return false;
        }
      }
      return true;
    });
  }, [changeRequests, filterType, filterSystemId, searchQuery]);

  const handleOpenCreateCR = () => {
    setEditingCR(null);
    setCrModalOpen(true);
  };

  const handleOpenEditCR = (cr: ChangeRequest) => {
    setEditingCR(cr);
    setCrModalOpen(true);
  };

  const handleSaveCR = async (values: ChangeRequestInput | ChangeRequestUpdate) => {
    try {
      if (editingCR) {
        await updateChangeRequest(editingCR.id, values as ChangeRequestUpdate, db);
        message.success('Đã cập nhật Change Request');
      } else {
        await createChangeRequest(values as ChangeRequestInput, db);
        message.success('Đã tạo Change Request mới');
      }
      setCrModalOpen(false);
    } catch {
      message.error('Không thể lưu Change Request');
    }
  };

  const handleDeleteCRPrompt = (cr: ChangeRequest) => {
    const childTasks = tasks.filter((t) => t.projectId === cr.id);
    Modal.confirm({
      title: `Xóa Change Request: Xóa CR '${cr.name}'?`,
      content: (
        <div>
          <p>
            Toàn bộ các tác vụ con ({childTasks.length} tác vụ), tài liệu SDLC (SOLUTION, PL03B, CAB) và lịch sử thảo luận liên quan sẽ bị xóa vĩnh viễn.
          </p>
        </div>
      ),
      okText: 'Xóa vĩnh viễn',
      okType: 'danger',
      cancelText: 'Hủy',
      onOk: async () => {
        try {
          await deleteChangeRequest(cr.id, db);
          message.success('Đã xóa Change Request');
        } catch {
          message.error('Không thể xóa Change Request');
        }
      },
    });
  };

  if (activeSdlcCrId) {
    return (
      <ProjectSdlcView
        projectId={activeSdlcCrId}
        onBack={() => setActiveSdlcCrId(null)}
        db={db}
      />
    );
  }

  const subsystemOptions = systems
    .filter((s) => s.parentId !== null && s.type !== 'LOGICAL_GROUP')
    .map((s) => ({ label: `${s.name} (${s.code})`, value: s.id }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title="Quản lý Change Requests (CR)"
        subtitle="Quản lý các đợt phát triển tính năng, nâng cấp và sửa lỗi theo Catalog hệ thống Enterprise"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleOpenCreateCR}
            data-testid="btn-create-cr"
            style={{ backgroundColor: '#3871e1' }}
          >
            Tạo Change Request
          </Button>
        }
      />

      {/* Filter Toolbar */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'center',
          padding: '10px 14px',
          background: '#f9f9fb',
          borderRadius: 6,
          border: '1px solid #e9eaee',
        }}
      >
        <Input
          prefix={<SearchOutlined style={{ color: '#8c8c8c' }} />}
          placeholder="Tìm theo tên hoặc mã CR..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ width: 260 }}
          allowClear
          data-testid="cr-search-input"
        />

        <Space size={6}>
          <span style={{ fontSize: 13, color: '#595959' }}>
            <FilterOutlined style={{ marginRight: 4 }} />
            Loại CR:
          </span>
          <Select
            value={filterType}
            onChange={(val) => setFilterType(val)}
            style={{ width: 170 }}
            options={[
              { label: 'Tất cả loại CR', value: 'ALL' },
              { label: 'New Feature', value: 'NEW_FEATURE' },
              { label: 'Enhancement', value: 'ENHANCEMENT' },
              { label: 'Bugfix', value: 'BUGFIX' },
            ]}
          />
        </Space>

        <Space size={6}>
          <span style={{ fontSize: 13, color: '#595959' }}>Target Subsystem:</span>
          <Select
            value={filterSystemId}
            onChange={(val) => setFilterSystemId(val)}
            style={{ width: 220 }}
            options={[
              { label: 'Tất cả Subsystems', value: 'ALL' },
              ...subsystemOptions,
            ]}
          />
        </Space>
      </div>

      <ChangeRequestTable
        changeRequests={filteredCRs}
        tasks={tasks}
        systems={systems}
        onEditChangeRequest={handleOpenEditCR}
        onDeleteChangeRequest={handleDeleteCRPrompt}
        onOpenSdlcStudio={(crId) => setActiveSdlcCrId(crId)}
        onViewTasks={(crId) => {
          openTab({
            id: 'tasks',
            title: 'Tasks',
            viewType: 'tasks',
            params: { projectId: crId },
          });
        }}
        db={db}
      />

      <ChangeRequestModal
        open={crModalOpen}
        changeRequest={editingCR}
        onClose={() => setCrModalOpen(false)}
        onSave={handleSaveCR}
        db={db}
      />
    </div>
  );
};

export default ChangeRequestsView;
