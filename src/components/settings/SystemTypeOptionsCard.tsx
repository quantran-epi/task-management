import React, { useCallback, useState } from 'react';
import { Button, Card, Input, Popconfirm, Space, Table, Tag, Tooltip, Typography, useMessage } from '../ui';
const { Paragraph, Text } = Typography;
import { DeleteOutlined, EditOutlined, PlusOutlined, TagsOutlined } from '../ui/icon';
import type { ColumnsType } from 'antd/es/table';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import {
  LOGICAL_GROUP_TYPE,
  SYSTEM_TYPE_FALLBACK_COLOR,
  SYSTEM_TYPE_VALUE_MAX_LENGTH,
  isValidSystemTypeValue,
  setSystemTypeOptions,
  toSystemTypeValue,
  useSystemTypeOptions,
  type SystemTypeOption,
} from '../../services/system/systemTypeSettings';


export interface SystemTypeOptionsCardProps {
  db?: TaskPlannerDatabase;
}

interface Draft {
  value: string;
  label: string;
  color: string;
}

const EMPTY_DRAFT: Draft = { value: '', label: '', color: SYSTEM_TYPE_FALLBACK_COLOR };

/**
 * Phase 261116-e64: the user-extensible system type list. Every mutation writes the
 * `system_type_options` settings row so all surfaces refresh through their live query.
 */
export const SystemTypeOptionsCard: React.FC<SystemTypeOptionsCardProps> = ({ db = defaultDb }) => {
  const message = useMessage();
  const options = useSystemTypeOptions(db);
  const usageCounts = useLiveQuery(async () => {
    const counts = new Map<string, number>();
    for (const system of await db.systems.toArray()) {
      counts.set(system.type, (counts.get(system.type) ?? 0) + 1);
    }
    return counts;
  }, [db]);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftIsNew, setDraftIsNew] = useState(false);

  const persist = useCallback(
    async (next: SystemTypeOption[]) => {
      setSaving(true);
      try {
        await setSystemTypeOptions(next, db);
        message.success('Đã lưu danh sách loại hệ thống');
        return true;
      } catch {
        message.error('Không lưu được danh sách loại hệ thống');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [db]
  );

  const commitDraft = async () => {
    if (!draft) return;
    const value = toSystemTypeValue(draft.value, options);
    const label = draft.label.trim() || draft.value.trim() || value;
    const color = draft.color.trim() || SYSTEM_TYPE_FALLBACK_COLOR;

    if (!isValidSystemTypeValue(value)) {
      message.error(
        `Loại hệ thống phải có chữ cái hoặc số, tối đa ${SYSTEM_TYPE_VALUE_MAX_LENGTH} ký tự (ví dụ: SERVICE)`
      );
      return;
    }

    // LOGICAL_GROUP is the parent marker the whole app keys on: never renamed.
    if (!draftIsNew && draft.value === LOGICAL_GROUP_TYPE) {
      message.error('LOGICAL_GROUP là dấu hiệu hệ thống cha — không thể đổi tên');
      return;
    }

    const duplicate = options.some(
      (opt) => opt.value === value && (draftIsNew || opt.value !== draft.value)
    );
    if (duplicate) {
      message.error(`Loại hệ thống "${value}" đã tồn tại`);
      return;
    }

    const next = draftIsNew
      ? [...options, { value, label, color }]
      : options.map((opt) =>
          opt.value === draft.value ? { value, label, color } : opt
        );
    if (await persist(next)) {
      setDraft(null);
      setDraftIsNew(false);
    }
  };

  /** A delete leaves the raw value rendering in grey, so it is allowed — just announced. */
  const handleDelete = async (option: SystemTypeOption) => {
    await persist(options.filter((opt) => opt.value !== option.value));
  };

  const columns: ColumnsType<SystemTypeOption> = [
    {
      title: 'Giá trị',
      dataIndex: 'value',
      key: 'value',
      render: (value: string) => <Text code>{value}</Text>,
    },
    {
      title: 'Nhãn hiển thị',
      dataIndex: 'label',
      key: 'label',
    },
    {
      title: 'Màu',
      dataIndex: 'color',
      key: 'color',
      width: 140,
      render: (color: string) => (
        <Space size={6}>
          <span
            style={{
              display: 'inline-block',
              width: 14,
              height: 14,
              borderRadius: 3,
              background: color,
              border: '1px solid rgba(0,0,0,0.15)',
            }}
          />
          <Text type="secondary" style={{ fontSize: 'var(--font-size-small)' }}>
            {color}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 130,
      render: (_: unknown, option: SystemTypeOption) => {
        const isLogicalGroup = option.value === LOGICAL_GROUP_TYPE;
        const editButton = (
          <Button
            size="small"
            type="text"
            icon={<EditOutlined />}
            disabled={isLogicalGroup}
            onClick={() => {
              setDraft({ value: option.value, label: option.label, color: option.color });
              setDraftIsNew(false);
            }}
            title={isLogicalGroup ? undefined : 'Sửa loại hệ thống'}
          />
        );
        const deleteButton = (
          <Button
            size="small"
            type="text"
            danger
            icon={<DeleteOutlined />}
            disabled={isLogicalGroup}
            title={isLogicalGroup ? undefined : 'Xóa loại hệ thống'}
          />
        );
        return (
          <Space size={2}>
            {isLogicalGroup ? (
              <Tooltip title="LOGICAL_GROUP là dấu hiệu hệ thống cha — không thể sửa hay xóa">
                {editButton}
              </Tooltip>
            ) : (
              editButton
            )}
            {isLogicalGroup ? (
              <Tooltip title="LOGICAL_GROUP là dấu hiệu hệ thống cha — không thể sửa hay xóa">
                {deleteButton}
              </Tooltip>
            ) : (
              <Popconfirm
                title={`Xóa loại "${option.label}"?`}
                description={`${
                  usageCounts?.get(option.value) ?? 0
                } hệ thống đang dùng loại này; chúng vẫn hiển thị giá trị gốc màu xám.`}
                okText="Xóa"
                okType="danger"
                cancelText="Hủy"
                onConfirm={() => handleDelete(option)}
              >
                {deleteButton}
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <Card
      title={
        <Space>
          <TagsOutlined style={{ color: '#13c2c2' }} />
          <span>Loại hệ thống</span>
        </Space>
      }
      style={{ marginBottom: 16 }}
      extra={
        <Button
          icon={<PlusOutlined />}
          onClick={() => {
            setDraft({ ...EMPTY_DRAFT });
            setDraftIsNew(true);
          }}
          data-testid="system-type-option-add"
        >
          Thêm loại
        </Button>
      }
    >
      <Paragraph type="secondary">
        Danh sách này là nguồn duy nhất cho nhãn và màu loại hệ thống trên toàn ứng dụng. Giá trị
        được chuẩn hóa từ chữ bạn gõ (ví dụ: <Text code>Payment Gateway</Text> →{' '}
        <Text code>PAYMENT_GATEWAY</Text>).
      </Paragraph>

      <Table<SystemTypeOption>
        rowKey="value"
        size="small"
        pagination={false}
        dataSource={[...options]}
        columns={columns}
      />

      {draft && (
        <Space align="end" wrap style={{ marginTop: 12 }}>
          <Space direction="vertical" size={2}>
            <Text style={{ fontSize: 'var(--font-size-small)' }}>Giá trị</Text>
            <Input
              value={draft.value}
              maxLength={SYSTEM_TYPE_VALUE_MAX_LENGTH}
              disabled={!draftIsNew}
              onChange={(e) => setDraft({ ...draft, value: e.target.value })}
              placeholder="PAYMENT_GATEWAY"
              style={{ width: 200 }}
              data-testid="system-type-option-value"
            />
          </Space>
          <Space direction="vertical" size={2}>
            <Text style={{ fontSize: 'var(--font-size-small)' }}>Nhãn hiển thị</Text>
            <Input
              value={draft.label}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              placeholder="Payment Gateway"
              style={{ width: 200 }}
            />
          </Space>
          <Space direction="vertical" size={2}>
            <Text style={{ fontSize: 'var(--font-size-small)' }}>Màu (hex)</Text>
            <Input
              value={draft.color}
              onChange={(e) => setDraft({ ...draft, color: e.target.value })}
              placeholder={'#8c8c8c' /* ponytail: sample hex value for users, not a style token */}
              style={{ width: 120 }}
            />
          </Space>
          <Button type="primary" loading={saving} onClick={commitDraft}>
            Lưu
          </Button>
          <Button
            onClick={() => {
              setDraft(null);
              setDraftIsNew(false);
            }}
          >
            Hủy
          </Button>
          {draft.value.trim() !== '' && !toSystemTypeValue(draft.value, options) && (
            <Tag color="warning">Giá trị chưa đúng định dạng</Tag>
          )}
        </Space>
      )}
    </Card>
  );
};

export default SystemTypeOptionsCard;
