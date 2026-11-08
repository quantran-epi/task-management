import React, { useState } from 'react';
import { Avatar, Button, Popconfirm, Tag, theme } from 'antd';
import { CrownOutlined } from '@ant-design/icons';
import type { AiEmployee, AiLead } from '../../../types/aiOffice';
import { agentColorFor, agentTextColorFor } from './AgentAttributionRow';

function initialOf(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() ?? '?';
}

function cardSurface(token: ReturnType<typeof theme.useToken>['token'], hovered: boolean): React.CSSProperties {
  return {
    background: token.colorBgContainer,
    border: `1px solid ${hovered ? token.colorBorder : token.colorBorderSecondary}`,
    borderRadius: 8,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  };
}

export interface EmployeeCardProps {
  employee: AiEmployee;
  skillName?: string | undefined;
  teamCount: number;
  onEdit: () => void;
  onDelete: () => void;
}

/** UI-SPEC §2 employee card. */
export const EmployeeCard: React.FC<EmployeeCardProps> = ({
  employee,
  skillName,
  teamCount,
  onEdit,
  onDelete,
}) => {
  const { token } = theme.useToken();
  const [hovered, setHovered] = useState(false);
  const color = agentColorFor(employee.id);

  return (
    <div
      data-testid={`employee-card-${employee.id}`}
      style={cardSurface(token, hovered)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Avatar
          size={32}
          shape="circle"
          style={{ backgroundColor: color, color: agentTextColorFor(color), flexShrink: 0 }}
        >
          {initialOf(employee.name)}
        </Avatar>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{employee.name}</div>
          <div style={{ fontSize: 12, color: token.colorTextSecondary }}>{employee.role}</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        <Tag style={{ fontSize: 12 }}>{employee.model}</Tag>
        {skillName ? (
          <Tag style={{ fontSize: 12, background: token.colorFillAlter }}>{skillName}</Tag>
        ) : (
          <Tag style={{ fontSize: 12 }}>Không dùng kỹ năng</Tag>
        )}
      </div>

      <div>
        <Tag style={{ fontSize: 12 }}>{teamCount} nhóm</Tag>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button size="small" onClick={onEdit}>
          Sửa
        </Button>
        <Popconfirm
          title={`Xóa nhân viên: «${employee.name}» sẽ bị xóa khỏi mọi nhóm đang dùng. Lịch sử hội thoại vẫn được giữ.`}
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

export interface LeadCardProps {
  lead: AiLead;
  onEdit: () => void;
  onDelete: () => void;
}

/** UI-SPEC §2 lead card — same surface, crown + Lead tag, no skill or team rows. */
export const LeadCard: React.FC<LeadCardProps> = ({ lead, onEdit, onDelete }) => {
  const { token } = theme.useToken();
  const [hovered, setHovered] = useState(false);
  const color = agentColorFor(lead.id);

  return (
    <div
      data-testid={`lead-card-${lead.id}`}
      style={cardSurface(token, hovered)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Avatar
          size={32}
          shape="square"
          style={{ backgroundColor: color, color: agentTextColorFor(color), flexShrink: 0 }}
        >
          {initialOf(lead.name)}
        </Avatar>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <CrownOutlined style={{ fontSize: 11, color: token.colorPrimary }} />
            <span style={{ fontSize: 14, fontWeight: 600 }}>{lead.name}</span>
          </div>
          <div style={{ fontSize: 12, color: token.colorTextSecondary }}>{lead.role}</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        <Tag style={{ fontSize: 12 }}>{lead.model}</Tag>
        <Tag style={{ fontSize: 12 }}>Lead</Tag>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button size="small" onClick={onEdit}>
          Sửa
        </Button>
        <Popconfirm
          title="Xóa lead: Các nhóm đang dùng lead này sẽ cần chọn lead khác trước khi chạy tiếp."
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

export default EmployeeCard;
