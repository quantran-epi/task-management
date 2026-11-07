import React from 'react';
import { Typography, Tag } from 'antd';
import { LinkOutlined, CheckSquareOutlined, ProjectOutlined, FileTextOutlined } from '@ant-design/icons';
import type { Task, ChangeRequest, Note } from '../../types/models';

const { Text } = Typography;

export interface BacklinksSectionProps {
  tasks: Task[];
  changeRequests: ChangeRequest[];
  referencingNotes?: Note[] | undefined;
  onOpenTask?: ((taskId: string) => void) | undefined;
  onOpenCr?: ((crId: string) => void) | undefined;
  onOpenNote?: ((noteId: string) => void) | undefined;
}

export const BacklinksSection: React.FC<BacklinksSectionProps> = ({
  tasks,
  changeRequests,
  referencingNotes = [],
  onOpenTask,
  onOpenCr,
  onOpenNote,
}) => {
  const totalCount = tasks.length + changeRequests.length + referencingNotes.length;

  if (totalCount === 0) {
    return null;
  }

  return (
    <div
      style={{
        marginTop: 24,
        paddingTop: 16,
        borderTop: '1px solid #f0f0f0',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <LinkOutlined style={{ color: '#4f46e5' }} />
        <Text strong style={{ fontSize: 13 }}>
          Được liên kết từ ({totalCount})
        </Text>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {tasks.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <Text type="secondary" style={{ fontSize: 12, marginRight: 4 }}>
              Tác vụ:
            </Text>
            {tasks.map((task) => (
              <Tag
                key={task.id}
                color="blue"
                icon={<CheckSquareOutlined />}
                style={{ cursor: onOpenTask ? 'pointer' : 'default' }}
                onClick={() => onOpenTask?.(task.id)}
              >
                {task.name}
              </Tag>
            ))}
          </div>
        )}

        {changeRequests.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <Text type="secondary" style={{ fontSize: 12, marginRight: 4 }}>
              Change Request:
            </Text>
            {changeRequests.map((cr) => (
              <Tag
                key={cr.id}
                color="purple"
                icon={<ProjectOutlined />}
                style={{ cursor: onOpenCr ? 'pointer' : 'default' }}
                onClick={() => onOpenCr?.(cr.id)}
              >
                {cr.code || cr.name}
              </Tag>
            ))}
          </div>
        )}

        {referencingNotes.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <Text type="secondary" style={{ fontSize: 12, marginRight: 4 }}>
              Tài liệu khác:
            </Text>
            {referencingNotes.map((note) => (
              <Tag
                key={note.id}
                color="default"
                icon={<FileTextOutlined />}
                style={{ cursor: onOpenNote ? 'pointer' : 'default' }}
                onClick={() => onOpenNote?.(note.id)}
              >
                {note.title || 'Không tiêu đề'}
              </Tag>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
