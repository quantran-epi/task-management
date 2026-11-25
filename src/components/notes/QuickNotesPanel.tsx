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

export interface QuickNotesPanelProps {
  db?: TaskPlannerDatabase;
}

export const QuickNotesPanel: React.FC<QuickNotesPanelProps> = ({ db = defaultDb }) => {
  const [entityType, setEntityType] = useState<QuickNotesEntityType>('');
  const [entityId, setEntityId] = useState<string | undefined>(undefined);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const entityOptions = useLiveQuery(async (): Promise<EntityOption[]> => {
    if (!entityType) return [];
    if (entityType === 'cr') {
      const rows = await db.changeRequests.toArray();
      return rows.slice(0, 200).map((cr) => ({ label: cr.code || cr.name, value: cr.id }));
    }
    if (entityType === 'task') {
      const rows = await db.tasks.toArray();
      return rows.slice(0, 200).map((task) => ({ label: task.name, value: task.id }));
    }
    const rows = await db.systems.toArray();
    return rows.slice(0, 200).map((system) => ({ label: system.name, value: system.id }));
  }, [db, entityType], []);

  const notes = useLiveQuery(async (): Promise<Note[]> => {
    const rows = await db.notes.filter((note) => !note.deletedAt && note.type !== 'diagram').toArray();
    return rows
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 20);
  }, [db], []);

  const selectedEntityLabel = entityOptions?.find((option) => option.value === entityId)?.label;

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
                : 'Chọn loại thực thể trước'
        }
        options={entityOptions ?? []}
        onChange={(value) => setEntityId(value)}
        filterOption={(input, option) => searchIncludes(String(option?.label ?? ''), input)}
      />

      <QuickNoteEntry
        db={db}
        {...(entityType ? { defaultEntityType: entityType } : {})}
        {...(entityId ? { defaultEntityId: entityId } : {})}
      />

      {!notes || notes.length === 0 ? (
        <Empty description="Chưa có ghi chú nào" />
      ) : (
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          {notes.map((note) => (
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
                  {selectedEntityLabel && note.entityId === entityId && (
                    <Tag style={{ marginLeft: 6 }}>{selectedEntityLabel}</Tag>
                  )}
                  <div
                    style={{
                      fontSize: 13,
                      color: 'var(--fg-secondary)',
                      maxHeight: 120,
                      overflowY: 'auto',
                      whiteSpace: 'pre-wrap',
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
