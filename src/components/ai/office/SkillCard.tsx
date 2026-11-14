import React, { useState } from 'react';
import { Button, Popconfirm, Tag, theme } from 'antd';
import type { AiSkill } from '../../../types/aiOffice';

export interface SkillCardProps {
  skill: AiSkill;
  agentCount: number;
  /** D-29: pending proposals for this skill. Both call sites pass it (IN-04). */
  pendingCount?: number | undefined;
  onEdit: () => void;
  onDelete: () => void;
}

/** UI-SPEC §2 skill card — name, 2-line description clamp, usage caption. */
export const SkillCard: React.FC<SkillCardProps> = ({
  skill,
  agentCount,
  pendingCount,
  onEdit,
  onDelete,
}) => {
  const { token } = theme.useToken();
  const [hovered, setHovered] = useState(false);

  return (
    <div
      data-testid={`skill-card-${skill.id}`}
      style={{
        background: token.colorBgContainer,
        border: `1px solid ${hovered ? token.colorBorder : token.colorBorderSecondary}`,
        borderRadius: 8,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ fontSize: 14, fontWeight: 600 }}>{skill.name}</div>

      <div
        style={{
          fontSize: 13.5,
          color: token.colorTextSecondary,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {skill.description}
      </div>

      {pendingCount !== undefined && pendingCount > 0 && (
        <Tag
          color="warning"
          data-testid={`skill-card-pending-${skill.id}`}
          style={{ fontSize: 12, margin: 0 }}
        >
          {`${pendingCount} chờ duyệt`}
        </Tag>
      )}

      <div style={{ fontSize: 12, color: token.colorTextSecondary }}>
        {`Đang dùng bởi ${agentCount} nhân viên`}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button size="small" onClick={onEdit}>
          Sửa
        </Button>
        <Popconfirm
          title={`Xóa kỹ năng «${skill.name}»? Kỹ năng còn được gán cho nhân viên sẽ không xóa được — gỡ khỏi các nhân viên đó trước.`}
          okText="Xóa"
          cancelText="Hủy"
          okButtonProps={{ danger: true }}
          onConfirm={onDelete}
        >
          <Button size="small" type="text" danger>
            Xóa
          </Button>
        </Popconfirm>
      </div>
    </div>
  );
};

export default SkillCard;
