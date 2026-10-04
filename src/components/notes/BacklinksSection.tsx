import React from 'react';
import { Typography, List, Tag } from 'antd';
import { LinkOutlined, CheckSquareOutlined, FolderOutlined, FileTextOutlined } from '@ant-design/icons';
import type { Task, Project, Note } from '../../types/models';

const { Text } = Typography;

export interface BacklinksSectionProps {
  tasks: Task[];
  projects: Project[];
  referencingNotes?: Note[];
  onOpenTask?: (taskId: string) => void;
  onOpenProject?: (projectId: string) => void;
  onOpenNote?: (noteId: string) => void;
}

export const BacklinksSection: React.FC<BacklinksSectionProps> = ({
  tasks,
  projects,
  referencingNotes = [],
  onOpenTask,
  onOpenProject,
  onOpenNote,
}) => {
  const totalCount = tasks.length + projects.length + referencingNotes.length;

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

        {projects.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <Text type="secondary" style={{ fontSize: 12, marginRight: 4 }}>
              Dự án:
            </Text>
            {projects.map((project) => (
              <Tag
                key={project.id}
                color="purple"
                icon={<FolderOutlined />}
                style={{ cursor: onOpenProject ? 'pointer' : 'default' }}
                onClick={() => onOpenProject?.(project.id)}
              >
                {project.name}
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
