import React, { useEffect, useMemo, useState } from 'react';
import { Button, Checkbox, Empty, Input, Modal, Segmented, Typography, theme } from 'antd';
import dayjs from 'dayjs';
import { db } from '../../../db';
import type { Note } from '../../../types/models';
import { renderSafeMarkdown } from '../../../utils/markdown';
interface SdlcSourceRef {
  id: string;
  title: string;
  body?: string;
  version: number;
  hash: string;
  updatedAt: string;
}

const { Text, Title } = Typography;

export interface NoteSourcePickerModalProps {
  open: boolean;
  title?: string | undefined;
  kind?: 'PL01' | 'PL02' | undefined;
  projectId: string;
  projectName?: string | undefined;
  initialSelectedIds?: string[] | undefined;
  onApply: (sources: SdlcSourceRef[]) => void | Promise<void>;
  onClose: () => void;
}

async function computeSha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export const NoteSourcePickerModal: React.FC<NoteSourcePickerModalProps> = ({
  open,
  title,
  kind = 'PL01',
  projectId,
  projectName = 'Dự án',
  initialSelectedIds = [],
  onApply,
  onClose,
}) => {
  const { token } = theme.useToken();
  const [scope, setScope] = useState<'project' | 'all'>('project');
  const [searchQuery, setSearchQuery] = useState('');
  const [allNotes, setAllNotes] = useState<Note[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(initialSelectedIds));
  const [previewNoteId, setPreviewNoteId] = useState<string | null>(null);
  const [focusedNoteId, setFocusedNoteId] = useState<string | null>(null);
  const [showFullPreview, setShowFullPreview] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedIds(new Set(initialSelectedIds));
    setSearchQuery('');
    setScope('project');
    setShowFullPreview(false);

    void db.notes.toArray().then((notes: Note[]) => {
      const nonDeleted = notes.filter((n) => !n.deletedAt);
      setAllNotes(nonDeleted);
      const firstSelected = nonDeleted.find((n) => initialSelectedIds.includes(n.id));
      setPreviewNoteId(firstSelected ? firstSelected.id : null);
    });
  }, [initialSelectedIds, open, projectId]);

  const modalTitle =
    title ?? (kind === 'PL01' ? 'Chọn nguồn yêu cầu nghiệp vụ (PL01)' : 'Chọn nguồn đặc tả chức năng (PL02)');

  // Filter notes by scope and search query
  const filteredNotes = useMemo(() => {
    return allNotes.filter((note) => {
      if (scope === 'project' && note.entityId !== projectId) {
        return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const noteTitle = (note.title || 'Untitled Note').toLowerCase();
        if (!noteTitle.includes(query)) {
          return false;
        }
      }
      return true;
    });
  }, [allNotes, projectId, scope, searchQuery]);

  const activePreviewNote = useMemo(() => {
    return allNotes.find((n) => n.id === previewNoteId) ?? null;
  }, [allNotes, previewNoteId]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleApply = async () => {
    try {
      setApplying(true);
      const selectedNotes = allNotes.filter((n) => selectedIds.has(n.id));
      const sourceRefs: SdlcSourceRef[] = [];

      for (const note of selectedNotes) {
        const hash = await computeSha256(note.body);
        sourceRefs.push({
          id: note.id,
          title: note.title || 'Untitled Note',
          body: note.body,
          version: note.sdlcArtifact?.version ?? 1,
          hash,
          updatedAt: note.updatedAt,
        });
      }

      await onApply(sourceRefs);
      onClose();
    } finally {
      setApplying(false);
    }
  };

  const previewBody = activePreviewNote?.body ?? '';
  const previewLines = previewBody.split(/\r?\n/);
  const truncatedPreview =
    !showFullPreview && previewLines.length > 40
      ? previewLines.slice(0, 40).join('\n')
      : previewBody;

  return (
    <Modal
      open={open}
      title={
        <Title level={4} style={{ margin: 0, fontSize: 16 }}>
          {modalTitle}
        </Title>
      }
      onCancel={onClose}
      width="min(720px, calc(100vw - 32px))"
      footer={[
        <span key="summary" style={{ float: 'left', lineHeight: '32px', fontSize: 13, color: token.colorTextSecondary }}>
          Đã chọn {selectedIds.size} tài liệu cho {kind}
        </span>,
        <Button key="cancel" onClick={onClose} disabled={applying}>
          Hủy bỏ
        </Button>,
        <Button
          key="apply"
          type="primary"
          onClick={() => void handleApply()}
          disabled={selectedIds.size === 0 || applying}
          loading={applying}
        >
          Áp dụng {selectedIds.size} nguồn
        </Button>,
      ]}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
        {/* Toolbar: Scope toggle + Search input */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
          <Segmented
            value={scope}
            onChange={(val) => setScope(val as 'project' | 'all')}
            options={[
              { label: 'Chỉ dự án hiện tại', value: 'project' },
              { label: 'Toàn hệ thống', value: 'all' },
            ]}
          />
          <Input.Search
            placeholder="Tìm theo tiêu đề tài liệu…"
            allowClear
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: 240 }}
          />
        </div>

        {/* Content pane: List on left, preview on right */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 12,
            minHeight: 320,
            maxHeight: 'calc(100vh - 320px)',
          }}
        >
          {/* Note List */}
          <div
            style={{
              overflowY: 'auto',
              border: `1px solid ${token.colorBorderSecondary}`,
              borderRadius: token.borderRadiusSM,
              padding: 4,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            {filteredNotes.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center' }}>
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    <Text type="secondary" style={{ fontSize: 13 }}>
                      Không tìm thấy tài liệu phù hợp. Đổi từ khóa hoặc chuyển sang Toàn hệ thống.
                    </Text>
                  }
                />
              </div>
            ) : (
              filteredNotes.map((note) => {
                const isChecked = selectedIds.has(note.id);
                const isPreview = activePreviewNote?.id === note.id;
                const formattedDate = dayjs(note.updatedAt).format('DD/MM/YYYY');
                const noteProject = note.entityId === projectId ? projectName : 'Dự án khác';

                return (
                  <div
                    key={note.id}
                    role="option"
                    tabIndex={focusedNoteId === note.id ? 0 : -1}
                    aria-selected={isChecked}
                    aria-label={`${note.title || 'Untitled Note'}${isChecked ? ', đã chọn' : ', chưa chọn'}`}
                    onFocus={() => setFocusedNoteId(note.id)}
                    onClick={() => setPreviewNoteId(note.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        setPreviewNoteId(note.id);
                      } else if (event.key === ' ') {
                        event.preventDefault();
                        toggleSelect(note.id);
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 10px',
                      borderRadius: token.borderRadiusSM,
                      backgroundColor: isPreview
                        ? token.colorFillTertiary
                        : isChecked
                          ? token.colorFillAlter
                          : token.colorBgContainer,
                      cursor: 'pointer',
                      border: `1px solid ${isPreview ? token.colorPrimary : token.colorBorderSecondary}`,
                    }}
                  >
                    <Checkbox
                      checked={isChecked}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleSelect(note.id);
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 400,
                          color: token.colorText,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {note.title || 'Untitled Note'}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: token.colorTextSecondary, marginTop: 2 }}>
                        {noteProject} · Cập nhật {formattedDate}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Read-only Preview */}
          <div
            aria-live="polite"
            style={{
              overflowY: 'auto',
              border: `1px solid ${token.colorBorderSecondary}`,
              borderRadius: token.borderRadiusSM,
              padding: 12,
              backgroundColor: token.colorBgContainer,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {activePreviewNote ? (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, borderBottom: `1px solid ${token.colorBorderSecondary}`, paddingBottom: 8, marginBottom: 8 }}>
                  <div>
                    <span style={{ fontSize: 16, fontWeight: 600, color: token.colorText }}>
                      {activePreviewNote.title || 'Untitled Note'}
                    </span>
                    <div style={{ fontSize: 11, color: token.colorTextSecondary }}>
                      Phiên bản: {activePreviewNote.sdlcArtifact?.version ?? 1} · ID: {activePreviewNote.id.slice(0, 8)}...
                    </div>
                  </div>
                  {previewLines.length > 40 && (
                    <Button
                      size="small"
                      type="link"
                      onClick={() => setShowFullPreview((prev) => !prev)}
                    >
                      {showFullPreview ? 'Thu gọn' : 'Xem toàn bộ'}
                    </Button>
                  )}
                </div>

                <div
                  style={{
                    flex: 1,
                    fontSize: 13,
                    lineHeight: 1.5,
                    overflowY: 'auto',
                    color: token.colorText,
                  }}
                  dangerouslySetInnerHTML={{
                    __html: renderSafeMarkdown(truncatedPreview),
                  }}
                />
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  Chọn một tài liệu để xem trước nội dung.
                </Text>
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};
