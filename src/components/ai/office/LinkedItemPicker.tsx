import React, { useEffect, useMemo, useState } from 'react';
import { Button, Input, Modal, Select, theme } from 'antd';
import { useLiveQuery } from 'dexie-react-hooks';
import type { TaskPlannerDatabase } from '../../../db';
import type { AiTeamLinkItemType } from '../../../types/aiOffice';

export interface LinkedItemCandidate {
  id: string;
  itemType: AiTeamLinkItemType;
  name: string;
}

export interface LinkedItemPickerProps {
  open: boolean;
  db: TaskPlannerDatabase;
  onCancel: () => void;
  onAdd: (item: LinkedItemCandidate) => void;
}

const TYPE_OPTIONS: Array<{ label: string; value: AiTeamLinkItemType }> = [
  { label: 'Yêu cầu thay đổi', value: 'cr' },
  { label: 'Công việc', value: 'task' },
  { label: 'Hệ thống', value: 'system' },
  { label: 'Ghi chú', value: 'note' },
  { label: 'Tài liệu', value: 'document' },
];

/**
 * UI-SPEC §9 picker. Only the five declared item types are offered (T-34-54); the
 * modal stays open after a pick so multi-add needs one open, not five.
 */
export const LinkedItemPicker: React.FC<LinkedItemPickerProps> = ({ open, db, onCancel, onAdd }) => {
  const { token } = theme.useToken();
  const [itemType, setItemType] = useState<AiTeamLinkItemType>('cr');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (open) {
      setItemType('cr');
      setQuery('');
    }
  }, [open]);

  const candidates = useLiveQuery<LinkedItemCandidate[]>(async () => {
    if (!open) return [];
    if (itemType === 'cr') {
      const rows = await db.changeRequests.toArray();
      return rows.map((row) => ({ id: row.id, itemType: 'cr' as const, name: `${row.code} · ${row.name}` }));
    }
    if (itemType === 'task') {
      const rows = await db.tasks.toArray();
      return rows.map((row) => ({ id: row.id, itemType: 'task' as const, name: row.name }));
    }
    if (itemType === 'system') {
      const rows = await db.systems.toArray();
      return rows.map((row) => ({ id: row.id, itemType: 'system' as const, name: `${row.code} · ${row.name}` }));
    }
    const rows = await db.notes.toArray();
    return rows
      .filter((row) => !row.deletedAt)
      .map((row) => ({ id: row.id, itemType, name: row.title || 'Không tên' }));
  }, [db, itemType, open]) ?? [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((row) => row.name.toLowerCase().includes(q));
  }, [candidates, query]);

  return (
    <Modal
      width={560}
      title="Liên kết mục"
      open={open}
      onCancel={onCancel}
      data-testid="linked-item-picker"
      footer={
        <Button type="primary" onClick={onCancel}>
          Xong
        </Button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <Select
            value={itemType}
            onChange={(value: AiTeamLinkItemType) => setItemType(value)}
            options={TYPE_OPTIONS}
            style={{ width: 180 }}
            aria-label="Loại mục"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm mục..."
            aria-label="Tìm mục"
            allowClear
          />
        </div>

        <div style={{ maxHeight: 360, overflowY: 'auto' }} role="list">
          {filtered.length === 0 ? (
            <div style={{ fontSize: 12, color: token.colorTextSecondary, padding: '8px 0' }}>
              Không có mục nào phù hợp.
            </div>
          ) : (
            filtered.map((row) => (
              <div
                key={`${row.itemType}-${row.id}`}
                role="listitem"
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}
              >
                <span
                  style={{
                    fontSize: 13.5,
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {row.name}
                </span>
                <Button size="small" onClick={() => onAdd(row)} data-testid={`linked-picker-add-${row.id}`}>
                  Liên kết
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
};

export default LinkedItemPicker;
