import React, { useMemo } from 'react';
import { TreeSelect, Tag } from 'antd';
import { FolderOutlined, BranchesOutlined } from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import type { System, SystemType } from '../../types/models';

export interface TargetSystemsSelectorProps {
  value?: string[];
  onChange?: (value: string[]) => void;
  placeholder?: string;
  style?: React.CSSProperties;
  db?: TaskPlannerDatabase;
  disabled?: boolean;
}

interface TreeNode {
  title: React.ReactNode;
  value: string;
  key: string;
  selectable?: boolean;
  disabled?: boolean;
  children?: TreeNode[];
}

const TYPE_TAG_COLORS: Record<SystemType, string> = {
  LOGICAL_GROUP: '#722ed1',
  SERVICE: '#13c2c2',
  SCHEMA: '#fa8c16',
  UI: '#1677ff',
  WORKER: '#52c41a',
};

const TYPE_LABELS: Record<SystemType, string> = {
  LOGICAL_GROUP: 'Parent System',
  SERVICE: 'Service',
  SCHEMA: 'DB Schema',
  UI: 'Frontend UI',
  WORKER: 'Worker Job',
};

export const TargetSystemsSelector: React.FC<TargetSystemsSelectorProps> = ({
  value = [],
  onChange,
  placeholder = 'Chọn các subsystem chịu ảnh hưởng...',
  style,
  db = defaultDb,
  disabled = false,
}) => {
  const allSystems = useLiveQuery(() => db.systems.toArray(), [db]) ?? [];

  const treeData = useMemo(() => {
    if (!allSystems || allSystems.length === 0) return [];

    const parentNodes: System[] = allSystems.filter(
      (s) => s.parentId === null || s.type === 'LOGICAL_GROUP'
    );
    const childNodes: System[] = allSystems.filter(
      (s) => s.parentId !== null && s.type !== 'LOGICAL_GROUP'
    );

    const result: TreeNode[] = parentNodes.map((parent) => {
      const children = childNodes.filter((c) => c.parentId === parent.id);
      return {
        key: parent.id,
        value: parent.id,
        selectable: false, // Parent system (Logical Group) cannot be directly targeted
        disabled: false,
        title: (
          <span>
            <FolderOutlined style={{ marginRight: 6, color: '#722ed1' }} />
            <span style={{ fontWeight: 600 }}>{parent.name}</span>
            <span style={{ color: '#8c8c8c', marginLeft: 6, fontSize: 11 }}>[{parent.code}]</span>
          </span>
        ),
        children: children.map((child) => ({
          key: child.id,
          value: child.id,
          selectable: true,
          title: (
            <span>
              <BranchesOutlined style={{ marginRight: 6, color: '#13c2c2' }} />
              <span>{child.name}</span>
              <span style={{ fontFamily: 'monospace', color: '#595959', marginLeft: 6, fontSize: 11 }}>
                ({child.code})
              </span>
              <Tag
                color={TYPE_TAG_COLORS[child.type]}
                style={{ marginLeft: 6, fontSize: 10, padding: '0 4px', lineHeight: '16px' }}
              >
                {TYPE_LABELS[child.type]}
              </Tag>
            </span>
          ),
        })),
      };
    });

    // Check for orphaned subsystems (child with missing parent)
    const matchedChildIds = new Set(
      result.flatMap((p) => (p.children ?? []).map((c) => c.value))
    );
    const orphaned = childNodes.filter((c) => !matchedChildIds.has(c.id));
    if (orphaned.length > 0) {
      result.push({
        key: '__orphaned__',
        value: '__orphaned__',
        selectable: false,
        title: <span style={{ color: '#faad14' }}>Chưa phân nhóm hệ thống</span>,
        children: orphaned.map((child) => ({
          key: child.id,
          value: child.id,
          selectable: true,
          title: (
            <span>
              <BranchesOutlined style={{ marginRight: 6, color: '#faad14' }} />
              <span>{child.name}</span>
              <span style={{ fontFamily: 'monospace', marginLeft: 6 }}>({child.code})</span>
            </span>
          ),
        })),
      });
    }

    return result;
  }, [allSystems]);

  return (
    <div data-testid="target-systems-selector">
      <TreeSelect
        treeData={treeData}
        value={value}
        onChange={onChange}
        treeCheckable
        showCheckedStrategy={TreeSelect.SHOW_CHILD}
        placeholder={placeholder}
        style={{ width: '100%', ...style }}
        disabled={disabled}
        allowClear
        treeDefaultExpandAll
      />
    </div>
  );
};
