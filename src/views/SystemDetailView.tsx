import React, { useState } from 'react';
import { Card, Tag, Button, Typography, Space, Table, Empty, Descriptions, Breadcrumb, message } from 'antd';
import {
  ApartmentOutlined,
  BranchesOutlined,
  CloudServerOutlined,
  EditOutlined,
  PlusOutlined,
  RocketOutlined,
  FolderOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import { getSystem, getAllSystems, updateSystem, createSystem, isLogicalParent } from '../db/repositories/systemRepo';
import { getAllChangeRequests, createChangeRequest } from '../db/repositories/changeRequestRepo';
import { getSshConfigs } from '../services/sshService';
import { useLayoutStore } from '../workbench/store/layoutStore';
import { SystemModal } from '../components/systems/SystemModal';
import { ChangeRequestModal } from '../components/changeRequests/ChangeRequestModal';
import type { System, SystemType, ChangeRequest } from '../types/models';

export interface SystemDetailViewProps {
  systemId: string;
  db?: TaskPlannerDatabase | undefined;
}

const SYSTEM_TYPE_TAG: Record<SystemType, { label: string; color: string }> = {
  LOGICAL_GROUP: { label: 'Parent System (Logical Group)', color: 'purple' },
  SERVICE: { label: 'Service / Microservice', color: 'blue' },
  SCHEMA: { label: 'Database Schema', color: 'cyan' },
  UI: { label: 'Frontend UI', color: 'green' },
  WORKER: { label: 'Background Worker', color: 'orange' },
};

export const SystemDetailView: React.FC<SystemDetailViewProps> = ({
  systemId,
  db = defaultDb,
}) => {
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [createChildModalOpen, setCreateChildModalOpen] = useState(false);
  const [createCrModalOpen, setCreateCrModalOpen] = useState(false);

  const openTab = useLayoutStore((s) => s.openTab);

  // Queries
  const system = useLiveQuery(() => (systemId ? getSystem(systemId, db) : undefined), [systemId, db]);
  const allSystems = useLiveQuery(() => getAllSystems(db), [db]) ?? [];
  const sshConfigs = useLiveQuery(() => getSshConfigs(db), [db]) ?? [];
  const allCrs = useLiveQuery(() => getAllChangeRequests(db), [db]) ?? [];

  if (!system) {
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <Empty description="Không tìm thấy thông tin hệ thống" />
      </div>
    );
  }

  const isParent = isLogicalParent(system);
  const parentSystem = system.parentId ? allSystems.find((s) => s.id === system.parentId) : null;
  const childSubsystems = allSystems.filter((s) => s.parentId === system.id);
  const sshConfig = system.sshConfigId ? sshConfigs.find((c) => c.id === system.sshConfigId) : null;

  // Change requests impacting this system
  const relatedCrs = allCrs.filter((cr) => cr.targetSystemIds?.includes(system.id));

  const handleOpenSystem = (targetSys: System) => {
    openTab({
      id: `system-${targetSys.id}`,
      title: targetSys.name,
      viewType: 'system_detail',
      closable: true,
      params: { systemId: targetSys.id },
    });
  };

  const handleOpenSdlc = (crId: string) => {
    openTab({
      id: `sdlc-${crId}`,
      title: 'SDLC Studio',
      viewType: 'sdlc',
      closable: true,
      params: { projectId: crId },
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '16px 20px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Breadcrumb navigation */}
      <Breadcrumb
        items={[
          {
            title: (
              <span
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                onClick={() => {
                  openTab({
                    id: 'systems',
                    title: 'Danh mục hệ thống',
                    viewType: 'systems',
                    closable: true,
                  });
                }}
              >
                <ApartmentOutlined /> Danh mục hệ thống
              </span>
            ),
          },
          ...(parentSystem
            ? [
                {
                  title: (
                    <span
                      style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                      onClick={() => handleOpenSystem(parentSystem)}
                    >
                      <FolderOutlined /> {parentSystem.name} ({parentSystem.code})
                    </span>
                  ),
                },
              ]
            : []),
          {
            title: `${system.name} (${system.code})`,
          },
        ]}
      />

      {/* Header bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
          padding: '16px 20px',
          background: 'var(--bg-island, #ffffff)',
          borderRadius: 8,
          border: '1px solid var(--border, #e9eaee)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Typography.Title level={4} style={{ margin: 0 }}>
              {system.name}
            </Typography.Title>
            <Tag color="cyan" style={{ fontFamily: 'monospace', fontSize: 13, padding: '2px 8px', margin: 0 }}>
              {system.code}
            </Tag>
            <Tag color={SYSTEM_TYPE_TAG[system.type]?.color || 'default'} style={{ margin: 0 }}>
              {SYSTEM_TYPE_TAG[system.type]?.label || system.type}
            </Tag>
          </div>
          {system.description && (
            <Typography.Paragraph type="secondary" style={{ margin: 0, fontSize: 13 }}>
              {system.description}
            </Typography.Paragraph>
          )}
        </div>

        <Space>
          <Button icon={<EditOutlined />} onClick={() => setEditModalOpen(true)}>
            Chỉnh sửa
          </Button>
          {isParent && (
            <Button
              icon={<PlusOutlined />}
              onClick={() => setCreateChildModalOpen(true)}
            >
              Thêm subsystem
            </Button>
          )}
          <Button
            type="primary"
            icon={<RocketOutlined />}
            onClick={() => setCreateCrModalOpen(true)}
          >
            Tạo CR cho hệ thống này
          </Button>
        </Space>
      </div>

      {/* Deployment & Remote Repository Card */}
      {!isParent && (
        <Card
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CloudServerOutlined style={{ color: '#f59e0b' }} />
              <span>Cấu hình SSH & Kho mã nguồn từ xa</span>
            </div>
          }
          size="small"
        >
          <Descriptions bordered column={{ xs: 1, sm: 2, md: 3 }} size="small">
            <Descriptions.Item label="Máy chủ SSH">
              {sshConfig ? (
                <span>
                  <strong>{sshConfig.name}</strong> ({sshConfig.username}@{sshConfig.host}:{sshConfig.port})
                </span>
              ) : (
                <span style={{ color: 'var(--fg-muted, #8c8c8c)' }}>Chưa cấu hình SSH</span>
              )}
            </Descriptions.Item>

            <Descriptions.Item label="Đường dẫn Repository">
              {system.remoteRepoPath ? (
                <Typography.Text copyable code style={{ fontSize: 12 }}>
                  {system.remoteRepoPath}
                </Typography.Text>
              ) : (
                <span style={{ color: 'var(--fg-muted, #8c8c8c)' }}>Chưa khai báo</span>
              )}
            </Descriptions.Item>

            <Descriptions.Item label="Nhánh Base mặc định">
              <Tag color="blue" style={{ fontFamily: 'monospace' }}>
                {system.defaultBaseBranch || 'origin/main'}
              </Tag>
            </Descriptions.Item>
          </Descriptions>
        </Card>
      )}

      {/* Child Subsystems List (for Logical Group) */}
      {isParent && (
        <Card
          title={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <BranchesOutlined style={{ color: '#13c2c2' }} />
                <span>Danh sách Subsystems con ({childSubsystems.length})</span>
              </div>
              <Button
                type="link"
                size="small"
                icon={<PlusOutlined />}
                onClick={() => setCreateChildModalOpen(true)}
              >
                Thêm subsystem
              </Button>
            </div>
          }
          size="small"
        >
          {childSubsystems.length > 0 ? (
            <Table
              dataSource={childSubsystems}
              rowKey="id"
              pagination={false}
              size="small"
              columns={[
                {
                  title: 'Tên subsystem',
                  dataIndex: 'name',
                  key: 'name',
                  render: (text, record: System) => (
                    <a onClick={() => handleOpenSystem(record)} style={{ fontWeight: 600 }}>
                      {text}
                    </a>
                  ),
                },
                {
                  title: 'Mã (Code)',
                  dataIndex: 'code',
                  key: 'code',
                  width: 130,
                  render: (code) => <Tag color="cyan" style={{ fontFamily: 'monospace' }}>{code}</Tag>,
                },
                {
                  title: 'Loại',
                  dataIndex: 'type',
                  key: 'type',
                  width: 160,
                  render: (type: SystemType) => (
                    <Tag color={SYSTEM_TYPE_TAG[type]?.color || 'default'}>
                      {SYSTEM_TYPE_TAG[type]?.label || type}
                    </Tag>
                  ),
                },
                {
                  title: 'Đường dẫn Repo',
                  dataIndex: 'remoteRepoPath',
                  key: 'remoteRepoPath',
                  render: (p) => (p ? <Typography.Text code style={{ fontSize: 11 }}>{p}</Typography.Text> : '-'),
                },
              ]}
            />
          ) : (
            <Empty description="Hệ thống này chưa có subsystem con nào" style={{ margin: '16px 0' }}>
              <Button size="small" type="primary" onClick={() => setCreateChildModalOpen(true)}>
                Thêm subsystem ngay
              </Button>
            </Empty>
          )}
        </Card>
      )}

      {/* Change Requests Impacting this System */}
      <Card
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <RocketOutlined style={{ color: '#1677ff' }} />
            <span>Change Requests ảnh hưởng hệ thống này ({relatedCrs.length})</span>
          </div>
        }
        size="small"
      >
        {relatedCrs.length > 0 ? (
          <Table
            dataSource={relatedCrs}
            rowKey="id"
            pagination={false}
            size="small"
            columns={[
              {
                title: 'Mã CR',
                dataIndex: 'code',
                key: 'code',
                width: 140,
                render: (code, record) => (
                  <Tag
                    color={
                      record.type === 'NEW_FEATURE'
                        ? '#1677ff'
                        : record.type === 'ENHANCEMENT'
                          ? '#52c41a'
                          : '#faad14'
                    }
                    style={{ fontFamily: 'monospace', fontWeight: 600 }}
                  >
                    {code || (record as any).crCode || 'CR'}
                  </Tag>
                ),
              },
              {
                title: 'Tiêu đề Change Request',
                dataIndex: 'name',
                key: 'name',
                render: (text) => <strong>{text}</strong>,
              },
              {
                title: 'Loại CR',
                dataIndex: 'type',
                key: 'type',
                width: 120,
                render: (type) => (
                  <Tag
                    color={type === 'NEW_FEATURE' ? '#1677ff' : type === 'ENHANCEMENT' ? '#52c41a' : '#faad14'}
                  >
                    {type === 'NEW_FEATURE' ? 'Tạo mới' : type === 'ENHANCEMENT' ? 'Nâng cấp' : 'Sửa lỗi'}
                  </Tag>
                ),
              },
              {
                title: 'Trạng thái',
                dataIndex: 'status',
                key: 'status',
                width: 110,
                render: (st) => (
                  <Tag color={st === 'completed' ? 'success' : st === 'active' ? 'processing' : 'default'}>
                    {st === 'completed' ? 'Hoàn tất' : st === 'active' ? 'Đang chạy' : 'Đã lập'}
                  </Tag>
                ),
              },
              {
                title: 'Thao tác',
                key: 'action',
                width: 120,
                render: (_, record) => (
                  <Button
                    type="link"
                    size="small"
                    onClick={() => handleOpenSdlc(record.id)}
                  >
                    Mở SDLC Studio
                  </Button>
                ),
              },
            ]}
          />
        ) : (
          <Empty description="Chưa có Change Request nào liên kết với hệ thống này" style={{ margin: '16px 0' }}>
            <Button size="small" type="primary" onClick={() => setCreateCrModalOpen(true)}>
              Tạo Change Request mới
            </Button>
          </Empty>
        )}
      </Card>

      {/* Edit System Modal */}
      <SystemModal
        open={editModalOpen}
        system={system}
        onClose={() => setEditModalOpen(false)}
        onSave={async (values) => {
          await updateSystem(system.id, values, db);
          message.success('Đã cập nhật hệ thống');
          setEditModalOpen(false);
        }}
        db={db}
      />

      {/* Create Subsystem Modal */}
      <SystemModal
        open={createChildModalOpen}
        defaultParentId={system.id}
        onClose={() => setCreateChildModalOpen(false)}
        onSave={async (values) => {
          await createSystem({ ...values, parentId: system.id }, db);
          message.success('Đã tạo subsystem con mới');
          setCreateChildModalOpen(false);
        }}
        db={db}
      />

      {/* Create CR targeting this system Modal */}
      <ChangeRequestModal
        open={createCrModalOpen}
        initialTargets={[{ systemId: system.id }]}
        onClose={() => setCreateCrModalOpen(false)}
        onSave={async (values) => {
          await createChangeRequest(values as any, db);
          message.success('Đã tạo Change Request mới cho hệ thống này');
          setCreateCrModalOpen(false);
        }}
        db={db}
      />
    </div>
  );
};

export default SystemDetailView;
