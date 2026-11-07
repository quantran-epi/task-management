import React, { useMemo } from 'react';
import { TreeSelect, Tag } from 'antd';
import { FolderOutlined, BranchesOutlined } from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import type { System, SystemType } from '../../types/models';
import { isLogicalParent, isSubsystem } from '../../db/repositories/systemRepo';

export interface TargetSystemsSelectorProps {
  value?: string[];
  onChange?: (value: string[]) => void;
  placeholder?: string;
  style?: React.CSSProperties;
  db?: TaskPlannerDatabase;
  disabled?: boolean;
  /** Subsystem ids pre-selected by the caller (D-34 soft lock) — marked, still removable. */
  preselectedIds?: string[];
  /** Caller already holds the system list; avoids a first-paint window where values render raw. */
  systems?: System[];
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
  preselectedIds = [],
  systems,
}) => {
  const liveSystems = useLiveQuery(() => db.systems.toArray(), [db]) ?? [];
  const allSystems = systems ?? liveSystems;

  const treeData = useMemo(() => {
    if (!allSystems || allSystems.length === 0) return [];

    // D-24: classification keys on `type` alone. A parent is a LOGICAL_GROUP, never
    // "anything without a parentId" — an unparented SERVICE is still a subsystem.
    const parentNodes: System[] = allSystems.filter(isLogicalParent);
    const subsystemNodes: System[] = allSystems.filter(isSubsystem);

    const preselected = new Set(preselectedIds);

    const renderSubsystem = (child: System, iconColor: string): TreeNode => ({
      key: child.id,
      value: child.id,
      selectable: true,
      title: (
        <span>
          <BranchesOutlined style={{ marginRight: 6, color: iconColor }} />
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
          {preselected.has(child.id) && (
            <Tag color="blue" style={{ marginLeft: 6, fontSize: 10, padding: '0 4px', lineHeight: '16px' }}>
              Đã chọn sẵn
            </Tag>
          )}
        </span>
      ),
    });

    const result: TreeNode[] = parentNodes.map((parent) => {
      const children = subsystemNodes.filter((c) => c.parentId === parent.id);
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
        children: children.map((child) => renderSubsystem(child, '#13c2c2')),
      };
    });

    // Subsystems with no parent, or whose parent row is missing, land under a synthetic
    // selectable group rather than becoming group headers themselves.
    const parentIds = new Set(parentNodes.map((p) => p.id));
    const orphaned = subsystemNodes.filter((c) => !c.parentId || !parentIds.has(c.parentId));
    if (orphaned.length > 0) {
      result.push({
        key: '__orphaned__',
        value: '__orphaned__',
        selectable: false,
        title: <span style={{ color: '#faad14' }}>Chưa phân nhóm hệ thống</span>,
        children: orphaned.map((child) => renderSubsystem(child, '#faad14')),
      });
    }

    return result;
  }, [allSystems, preselectedIds]);

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
