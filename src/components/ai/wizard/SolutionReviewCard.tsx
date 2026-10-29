import React, { useState } from 'react';
import { Button, Card, Space, Tag, theme, Typography } from 'antd';
import { EditOutlined, SaveOutlined } from '@ant-design/icons';
import { MarkdownContentRenderer } from '../ChatMessageBubble';

const { Text } = Typography;

export interface SolutionReviewPayload {
  messageId: string;
  version: number;
  title: string;
  featureMode: 'new' | 'existing';
  currentSystem?: string | undefined;
  affectedSurfaces?: readonly string[] | undefined;
  markdown: string;
  saved?: { savedAt: string; noteId: string } | undefined;
}

export interface SolutionReviewCardProps {
  solution: Readonly<SolutionReviewPayload>;
  onSave: (messageId: string, version: number) => void | Promise<void>;
  onRequestEdit: (messageId: string, version: number) => void;
  onOpenNote: (noteId: string) => void;
}

export const SolutionReviewCard: React.FC<SolutionReviewCardProps> = ({ solution, onSave, onRequestEdit, onOpenNote }) => {
  const { token } = theme.useToken();
  const [expanded, setExpanded] = useState(false);

  return (
    <Card
      size="small"
      title={<span style={{ fontSize: 20, fontWeight: 600 }}>SOLUTION.md — v{solution.version}</span>}
      extra={<Tag color="processing">v{solution.version}</Tag>}
      styles={{ body: { padding: 16 } }}
      style={{ borderColor: token.colorBorderSecondary, borderRadius: token.borderRadius }}
    >
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        {solution.featureMode === 'existing' && (
          <section aria-labelledby={`solution-surfaces-${solution.messageId}`}>
            <h3 id={`solution-surfaces-${solution.messageId}`} style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Hiện trạng hệ thống</h3>
            <p style={{ margin: '4px 0 8px', fontSize: 14 }}>{solution.currentSystem || '(chưa cung cấp)'}</p>
            <Text strong style={{ fontSize: 12 }}>Danh sách màn hình/API/bảng bị ảnh hưởng</Text>
            <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
              {(solution.affectedSurfaces ?? []).map((surface) => <li key={surface}>{surface}</li>)}
            </ul>
          </section>
        )}
        <div>
          <Button type="link" size="small" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
            {expanded ? 'Thu gọn' : 'Xem toàn bộ'}
          </Button>
          {expanded && <MarkdownContentRenderer content={solution.markdown} />}
        </div>
        {solution.saved ? (
          <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Tag color="processing">v{solution.version}</Tag>
            <span>Đã lưu SOLUTION.md phiên bản v{solution.version} · {solution.saved.savedAt}</span>
            <a href={`#/notes?doc=${encodeURIComponent(solution.saved.noteId)}`} onClick={(event) => { event.preventDefault(); onOpenNote(solution.saved!.noteId); }}>Mở tài liệu</a>
          </div>
        ) : (
          <Space wrap>
            <Button type="primary" aria-label="Lưu SOLUTION.md" icon={<SaveOutlined />} onClick={() => onSave(solution.messageId, solution.version)}>Lưu SOLUTION.md</Button>
            <Button aria-label="Yêu cầu chỉnh sửa thêm" icon={<EditOutlined />} onClick={() => onRequestEdit(solution.messageId, solution.version)}>Yêu cầu chỉnh sửa thêm</Button>
          </Space>
        )}
      </Space>
    </Card>
  );
};
