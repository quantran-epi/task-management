import React, { useEffect, useMemo, useState } from 'react';
import { Button, Collapse, Drawer, Input, theme } from 'antd';
import { db as defaultDb, type TaskPlannerDatabase } from '../../../db';
import {
  countAgentsUsingSkill,
  createSkill,
  updateSkill,
} from '../../../db/repositories/aiOfficeRepo';
import { MarkdownContentRenderer } from '../ChatMessageBubble';
import { AiSkillInputSchema } from '../../../validation/aiOfficeSchemas';
import type { AiSkill } from '../../../types/aiOffice';

const CODE_FONT =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

export interface SkillEditorDrawerProps {
  open: boolean;
  skill: AiSkill | null;
  onCancel: () => void;
  onSaved: () => void;
  db?: TaskPlannerDatabase | undefined;
}

/**
 * UI-SPEC §4. The description is the only text an agent receives up front (D-24); the
 * body is read on demand, so the label says so explicitly.
 *
 * The preview renders through `MarkdownContentRenderer`, the only permitted path to
 * `renderSafeMarkdown` — this file never emits raw HTML itself (T-34-47).
 */
export const SkillEditorDrawer: React.FC<SkillEditorDrawerProps> = ({
  open,
  skill,
  onCancel,
  onSaved,
  db = defaultDb,
}) => {
  const { token } = theme.useToken();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [agentCount, setAgentCount] = useState(0);

  useEffect(() => {
    if (!open) return;
    setName(skill?.name ?? '');
    setDescription(skill?.description ?? '');
    setBody(skill?.body ?? '');
  }, [open, skill]);

  useEffect(() => {
    if (!open || !skill) {
      setAgentCount(0);
      return;
    }
    let cancelled = false;
    void countAgentsUsingSkill(skill.id, db).then((count) => {
      if (!cancelled) setAgentCount(count);
    });
    return () => {
      cancelled = true;
    };
  }, [open, skill, db]);

  const valid = useMemo(
    () => AiSkillInputSchema.safeParse({ name, description, body }).success,
    [name, description, body]
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      if (skill) await updateSkill(skill.id, { name, description, body }, db);
      else await createSkill({ name, description, body }, db);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      width={560}
      placement="right"
      open={open}
      onClose={onCancel}
      destroyOnHidden
      title={skill ? 'Sửa kỹ năng' : 'Thêm kỹ năng'}
      footer={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 12, color: token.colorTextSecondary }}>
            {`Đang dùng bởi ${agentCount} nhân viên`}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button onClick={onCancel}>Hủy</Button>
            <Button
              type="primary"
              disabled={!valid}
              loading={saving}
              onClick={handleSave}
              data-testid="skill-editor-save"
            >
              Lưu kỹ năng
            </Button>
          </div>
        </div>
      }
    >
      <div
        data-testid="skill-editor-drawer"
        style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <div>
          <div style={{ fontSize: 12, marginBottom: 4 }}>Tên</div>
          <Input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} aria-label="Tên" />
        </div>

        <div>
          <div style={{ fontSize: 12, marginBottom: 4 }}>Mô tả (nhân viên chỉ thấy phần này)</div>
          <Input.TextArea
            rows={2}
            maxLength={300}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            aria-label="Mô tả (nhân viên chỉ thấy phần này)"
          />
        </div>

        <div>
          <div style={{ fontSize: 12, marginBottom: 4 }}>Nội dung</div>
          <Input.TextArea
            rows={14}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            aria-label="Nội dung"
            style={{ fontFamily: CODE_FONT, fontSize: 12, whiteSpace: 'pre' }}
          />
        </div>

        <Collapse
          size="small"
          items={[
            {
              key: 'preview',
              label: 'Xem trước',
              children: <MarkdownContentRenderer content={body} />,
            },
          ]}
        />
      </div>
    </Drawer>
  );
};

export default SkillEditorDrawer;
