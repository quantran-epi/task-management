import React, { useState } from 'react';
import {
  List,
  Button,
  Tag,
  Empty,
  Tooltip,
  Modal,
  message,
  Popconfirm,
  Space,
} from 'antd';
import {
  ApartmentOutlined,
  PlusOutlined,
  EyeOutlined,
  EditOutlined,
  DisconnectOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import type { Note, NoteEntityType } from '../../types/models';
import {
  createNote,
  updateNote,
  softDeleteNote,
} from '../../db/repositories/noteRepo';
import { useLayoutStore } from '../../workbench/store/layoutStore';
import { MermaidViewer } from '../ai/MermaidViewer';

export interface EntityDiagramsSectionProps {
  entityType: NoteEntityType;
  entityId: string;
  db?: TaskPlannerDatabase | undefined;
  embedded?: boolean | undefined;
}

const DEFAULT_NEW_DIAGRAM = `flowchart TD
  Start([Bắt đầu]) --> Step1[Xử lý]
  Step1 --> Finish([Hoàn thành])`;

export const EntityDiagramsSection: React.FC<EntityDiagramsSectionProps> = ({
  entityType,
  entityId,
  db = defaultDb,
  embedded = false,
}) => {
  const openTab = useLayoutStore((s) => s.openTab);

  const [previewDiagram, setPreviewDiagram] = useState<Note | null>(null);

  // Live query for diagrams linked to this entity
  const diagrams = useLiveQuery(
    async () => {
      if (!entityId) return [];
      const records = await db.notes
        .where('entityId')
        .equals(entityId)
        .filter((n) => n.entityType === entityType && n.type === 'diagram' && !n.deletedAt)
        .toArray();

      return records.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    },
    [entityType, entityId, db],
    []
  );

  const handleOpenStudio = (diagram: Note) => {
    openTab({
      id: `mermaid-${diagram.id}`,
      title: diagram.title || 'Biểu đồ',
      viewType: 'mermaid',
      closable: true,
      params: { noteId: diagram.id, code: diagram.body },
    });
  };

  const handleCreateDiagram = async () => {
    try {
      const typeLabel =
        entityType === 'task'
          ? 'Tác vụ'
          : entityType === 'project'
          ? 'Dự án'
          : 'Milestone';

      const newDiag = await createNote(
        {
          title: `Biểu đồ ${typeLabel} mới`,
          body: DEFAULT_NEW_DIAGRAM,
          type: 'diagram',
          tags: ['diagram'],
          entityType,
          entityId,
        },
        db
      );

      handleOpenStudio(newDiag);
      message.success('Đã tạo biểu đồ mới và mở trong Diagram Studio');
    } catch {
      message.error('Không thể tạo biểu đồ');
    }
  };

  const handleUnlink = async (diagramId: string) => {
    try {
      await updateNote(
        diagramId,
        {
          entityType: undefined,
          entityId: undefined,
        },
        db
      );
      message.success('Đã huỷ gắn kết với đối tượng này');
    } catch {
      message.error('Không thể huỷ liên kết');
    }
  };

  const handleDelete = async (diagramId: string) => {
    try {
      await softDeleteNote(diagramId, db);
      message.success('Đã chuyển biểu đồ vào thùng rác');
    } catch {
      message.error('Không thể xoá biểu đồ');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {!embedded && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Space>
            <ApartmentOutlined style={{ fontSize: 16, color: '#10b981' }} />
            <span style={{ fontWeight: 600 }}>Biểu đồ liên quan ({diagrams.length})</span>
          </Space>
          <Button
            size="small"
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleCreateDiagram}
            style={{ backgroundColor: '#10b981' }}
          >
            Tạo biểu đồ
          </Button>
        </div>
      )}

      {diagrams.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Chưa có biểu đồ nào được gắn với đối tượng này"
          style={{ margin: '16px 0' }}
        >
          <Button icon={<PlusOutlined />} onClick={handleCreateDiagram} size="small">
            Tạo biểu đồ đầu tiên
          </Button>
        </Empty>
      ) : (
        <List
          size="small"
          dataSource={diagrams}
          renderItem={(diag) => (
            <List.Item
              key={diag.id}
              actions={[
                <Tooltip key="preview" title="Xem nhanh">
                  <Button
                    type="text"
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() => setPreviewDiagram(diag)}
                  />
                </Tooltip>,
                <Tooltip key="studio" title="Mở trong Diagram Studio">
                  <Button
                    type="text"
                    size="small"
                    icon={<EditOutlined style={{ color: 'var(--accent, #3871e1)' }} />}
                    onClick={() => handleOpenStudio(diag)}
                  />
                </Tooltip>,
                <Popconfirm
                  key="unlink"
                  title="Huỷ gắn kết biểu đồ này?"
                  description="Biểu đồ vẫn tồn tại trong Diagram Explorer nhưng không còn gắn với mục này."
                  okText="Huỷ liên kết"
                  cancelText="Bỏ qua"
                  onConfirm={() => handleUnlink(diag.id)}
                >
                  <Tooltip title="Huỷ liên kết">
                    <Button
                      type="text"
                      size="small"
                      icon={<DisconnectOutlined style={{ color: '#d97706' }} />}
                    />
                  </Tooltip>
                </Popconfirm>,
                <Popconfirm
                  key="delete"
                  title="Xoá biểu đồ này?"
                  description="Biểu đồ sẽ chuyển vào thùng rác."
                  okText="Xoá"
                  okType="danger"
                  cancelText="Huỷ"
                  onConfirm={() => handleDelete(diag.id)}
                >
                  <Tooltip title="Xoá biểu đồ">
                    <Button
                      type="text"
                      size="small"
                      icon={<DeleteOutlined style={{ color: '#ef4444' }} />}
                    />
                  </Tooltip>
                </Popconfirm>,
              ]}
              style={{
                borderRadius: 6,
                border: '1px solid var(--border, #f0f0f0)',
                marginBottom: 8,
                padding: '8px 12px',
                background: 'var(--bg-elev, #fafafa)',
              }}
            >
              <List.Item.Meta
                avatar={<ApartmentOutlined style={{ fontSize: 18, color: '#10b981', marginTop: 2 }} />}
                title={
                  <a
                    onClick={() => handleOpenStudio(diag)}
                    style={{ fontWeight: 600, color: 'var(--fg-strong, #1f2937)' }}
                  >
                    {diag.title || 'Biểu đồ không tên'}
                  </a>
                }
                description={
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#6b7280' }}>
                    <Tag color="cyan" style={{ fontSize: 10, margin: 0, padding: '0 4px', lineHeight: '16px' }}>
                      MERMAID
                    </Tag>
                    <span>Cập nhật: {new Date(diag.updatedAt).toLocaleDateString('vi-VN')}</span>
                  </div>
                }
              />
            </List.Item>
          )}
        />
      )}

      {/* Quick Preview Modal */}
      {previewDiagram && (
        <Modal
          title={
            <Space>
              <ApartmentOutlined style={{ color: '#10b981' }} />
              <span>{previewDiagram.title || 'Xem nhanh biểu đồ'}</span>
            </Space>
          }
          open={Boolean(previewDiagram)}
          onCancel={() => setPreviewDiagram(null)}
          width={800}
          footer={[
            <Button key="close" onClick={() => setPreviewDiagram(null)}>
              Đóng
            </Button>,
            <Button
              key="edit"
              type="primary"
              icon={<EditOutlined />}
              onClick={() => {
                const d = previewDiagram;
                setPreviewDiagram(null);
                handleOpenStudio(d);
              }}
            >
              Mở trong Studio
            </Button>,
          ]}
        >
          <div style={{ minHeight: 300, maxHeight: 600, overflow: 'auto', padding: 8 }}>
            <MermaidViewer code={previewDiagram.body} />
          </div>
        </Modal>
      )}
    </div>
  );
};
