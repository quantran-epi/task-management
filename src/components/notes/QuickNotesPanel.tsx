import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button, Card, Empty, Segmented, Select, Space, Tag, Typography } from '../ui';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import type { Note, NoteEntityType } from '../../types/models';
import { QuickNoteEntry } from './QuickNoteEntry';
import { NoteDetailModal } from './NoteDetailModal';
import { NoteEditor } from './NoteEditor';
import { renderSafeMarkdown } from '../../utils/markdown';
import { readNoteMarkdown } from '../../utils/noteBody';
import { searchIncludes } from '../../utils/searchText';

type QuickNotesEntityType = '' | NoteEntityType;

interface EntityOption {
  label: string;
  value: string;
}

interface EntityName {
  label: string;
  type: NoteEntityType;
}

export interface QuickNotesPanelProps {
  db?: TaskPlannerDatabase;
}

export const QuickNotesPanel: React.FC<QuickNotesPanelProps> = ({ db = defaultDb }) => {
  const [entityType, setEntityType] = useState<QuickNotesEntityType>('');
  const [entityId, setEntityId] = useState<string | undefined>(undefined);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [listEntityFilter, setListEntityFilter] = useState<string | undefined>(undefined);

  const entityNames = useLiveQuery(async (): Promise<Map<string, EntityName>> => {
    const [crs, tasks, systems, milestones] = await Promise.all([
      db.changeRequests.toArray(),
      db.tasks.toArray(),
      db.systems.toArray(),
      db.crMilestones.toArray(),
    ]);
    const names = new Map<string, EntityName>();
    crs.forEach((cr) => names.set(cr.id, { label: cr.code || cr.name, type: 'cr' }));
    tasks.forEach((task) => names.set(task.id, { label: task.name, type: 'task' }));
    systems.forEach((system) => names.set(system.id, { label: system.name, type: 'system' }));
    milestones.forEach((ms) => names.set(ms.id, { label: ms.name, type: 'crMilestone' }));
    return names;
  }, [db], new Map<string, EntityName>());

  const entityOptions: EntityOption[] = entityType
    ? [...(entityNames?.entries() ?? [])]
        .filter(([, entity]) => entity.type === entityType)
        .slice(0, 200)
        .map(([value, entity]) => ({ label: entity.label, value }))
    : [];

  const notes = useLiveQuery(async (): Promise<Note[]> => {
    const rows = await db.notes.filter((note) => !note.deletedAt && note.type === 'quick_note').toArray();
    return rows
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 20);
  }, [db], []);

  const listFilterOptions: EntityOption[] = [
    { label: 'Tất cả', value: '' },
    ...Array.from(
      new Map(
        notes
          .flatMap((note) => {
            const value = note.entityId;
            const label = value ? entityNames?.get(value)?.label : undefined;
            return value && label ? [[value, { label, value }] as const] : [];
          })
      ).values()
    ),
  ];

  const visibleNotes = listEntityFilter ? notes.filter((note) => note.entityId === listEntityFilter) : notes;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '12px', height: '100%', overflowY: 'auto' }}>
      <div>
        <Typography.Text strong>Ghi chú nhanh</Typography.Text>
        <div>
          <Typography.Text type="secondary" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--fg-muted)' }}>
            Chọn thực thể để gắn ghi chú (tuỳ chọn)
          </Typography.Text>
        </div>
      </div>

      <Segmented<QuickNotesEntityType>
        value={entityType}
        onChange={(value) => {
          setEntityType(value);
          setEntityId(undefined);
        }}
        options={[
          { label: 'Không liên kết', value: '' },
          { label: 'CR', value: 'cr' },
          { label: 'Task', value: 'task' },
          { label: 'Hệ thống', value: 'system' },
          { label: 'Mốc', value: 'crMilestone' },
        ]}
      />

      <Select<string>
        showSearch
        disabled={!entityType}
        allowClear
        data-testid="quick-notes-entity-select"
        value={entityId ?? null}
        placeholder={
          entityType === 'cr'
            ? 'Tìm Change Request...'
            : entityType === 'task'
              ? 'Tìm tác vụ...'
              : entityType === 'system'
                ? 'Tìm hệ thống...'
                : entityType === 'crMilestone'
                  ? 'Tìm mốc triển khai...'
                  : 'Chọn loại thực thể trước'
        }
        options={entityOptions}
        onChange={(value) => setEntityId(value)}
        filterOption={(input, option) => searchIncludes(String(option?.label ?? ''), input)}
      />

      <QuickNoteEntry
        db={db}
        {...(entityType ? { defaultEntityType: entityType } : {})}
        {...(entityId ? { defaultEntityId: entityId } : {})}
      />

      <Select<string>
        showSearch
        allowClear={false}
        data-testid="quick-notes-list-filter"
        value={listEntityFilter ?? ''}
        placeholder="Lọc theo thực thể đã gắn"
        options={listFilterOptions}
        onChange={(value) => setListEntityFilter(value || undefined)}
        filterOption={(input, option) => searchIncludes(String(option?.label ?? ''), input)}
      />

      {visibleNotes.length === 0 ? (
        <Empty description="Chưa có ghi chú nào" />
      ) : (
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          {visibleNotes.map((note) => (
            <Card
              key={note.id}
              size="small"
              data-ai-context-type="note"
              data-ai-context-id={note.id}
              style={{ background: 'var(--bg-island)', border: '1px solid var(--border)' }}
              styles={{ body: { padding: '10px 12px' } }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  {note.title && <Typography.Text strong>{note.title}</Typography.Text>}
                  {(() => {
                    const linkedLabel = note.entityId ? entityNames?.get(note.entityId)?.label : undefined;
                    return linkedLabel ? <Tag style={{ marginLeft: 6 }}>{linkedLabel}</Tag> : null;
                  })()}
                  <div
                    style={{
                      fontSize: 'var(--font-size-small)',
                      color: 'var(--fg-secondary)',
                      lineHeight: '1.4',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                    dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(readNoteMarkdown(note.body)) }}
                  />
                </div>
                <Button size="small" onClick={() => setSelectedNote(note)}>
                  Chi tiết
                </Button>
              </div>
            </Card>
          ))}
        </Space>
      )}

      <NoteDetailModal
        open={Boolean(selectedNote)}
        note={selectedNote}
        onClose={() => setSelectedNote(null)}
        onEdit={(note) => {
          setSelectedNote(null);
          setEditingNote(note);
          setEditorOpen(true);
        }}
        db={db}
      />

      {editorOpen && (
        <NoteEditor
          open={editorOpen}
          onClose={() => {
            setEditorOpen(false);
            setEditingNote(null);
          }}
          note={editingNote}
          db={db}
        />
      )}
    </div>
  );
};
