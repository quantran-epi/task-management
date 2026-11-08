import React, { useState } from 'react';
import { Button, theme } from 'antd';
import type { AiSkill } from '../../../types/aiOffice';

export interface SkillCardProps {
  skill: AiSkill;
  agentCount: number;
  onEdit: () => void;
  onDelete: () => void;
}

/** UI-SPEC §2 skill card — name, 2-line description clamp, usage caption. */
export const SkillCard: React.FC<SkillCardProps> = ({ skill, agentCount, onEdit, onDelete }) => {
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

      <div style={{ fontSize: 12, color: token.colorTextSecondary }}>
        {`Đang dùng bởi ${agentCount} nhân viên`}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button size="small" onClick={onEdit}>
          Sửa
        </Button>
        <Button size="small" type="text" danger onClick={onDelete}>
          Xóa
        </Button>
      </div>
    </div>
  );
};

export default SkillCard;
