import React from 'react';
import { Button, theme } from 'antd';
import {
  ApartmentOutlined,
  BranchesOutlined,
  CheckSquareOutlined,
  CloseOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import type { AiTeamLinkItemType } from '../../../types/aiOffice';

export interface LinkedItemRow {
  id: string;
  itemType: AiTeamLinkItemType;
  name: string;
}

export interface LinkedItemsListProps {
  items: LinkedItemRow[];
  onRemove?: ((linkId: string) => void) | undefined;
}

function iconFor(itemType: AiTeamLinkItemType): React.ReactNode {
  switch (itemType) {
    case 'cr':
      return <BranchesOutlined />;
    case 'task':
      return <CheckSquareOutlined />;
    case 'system':
      return <ApartmentOutlined />;
    case 'note':
    case 'document':
    default:
      return <FileTextOutlined />;
  }
}

/** UI-SPEC §9 linked item rows. */
export const LinkedItemsList: React.FC<LinkedItemsListProps> = ({ items, onRemove }) => {
  const { token } = theme.useToken();

  if (items.length === 0) {
    return (
      <div data-testid="linked-items-list" style={{ fontSize: 12, color: token.colorTextSecondary }}>
        Chưa liên kết mục nào.
      </div>
    );
  }

  return (
    <div data-testid="linked-items-list">
      {items.map((item) => (
        <div
          key={item.id}
          data-testid={`linked-item-${item.id}`}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}
        >
          <span style={{ fontSize: 12, color: token.colorTextSecondary, flexShrink: 0 }}>
            {iconFor(item.itemType)}
          </span>
          <span
            style={{
              fontSize: 13.5,
              fontWeight: 400,
              flex: 1,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {item.name}
          </span>
          {onRemove && (
            <Button
              type="text"
              size="small"
              icon={<CloseOutlined />}
              aria-label={`Bỏ liên kết ${item.name}`}
              onClick={() => onRemove(item.id)}
              style={{ width: 22, height: 22, padding: 0 }}
            />
          )}
        </div>
      ))}
    </div>
  );
};

export default LinkedItemsList;
