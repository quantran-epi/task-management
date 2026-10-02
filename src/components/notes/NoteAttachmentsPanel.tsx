import React, { useState, useEffect } from 'react';
import {
  Upload,
  Button,
  Image,
  Input,
  Popconfirm,
  Space,
  Typography,
  message,
  Card,
  Tooltip,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  CheckOutlined,
  CameraOutlined,
} from '@ant-design/icons';
import type { UploadFile } from 'antd';
import type { NoteAttachment } from '../../types/models';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { addNoteAttachment, deleteNoteAttachment } from '../../db/repositories/noteRepo';
import { captureFocusedWindowScreenshot } from '../../utils/screenshotCapture';

const MAX_ATTACHMENTS = 5;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;

export interface NoteAttachmentsPanelProps {
  noteId?: string | undefined;
  attachments?: NoteAttachment[] | undefined;
  onChange?: ((attachments: NoteAttachment[]) => void) | undefined;
  /** Staging mode for unsaved notes (held in memory until note creation) */
  stagedFiles?: Array<{ file: File; caption?: string | undefined }> | undefined;
  onStagedFilesChange?: ((staged: Array<{ file: File; caption?: string | undefined }>) => void) | undefined;
  db?: TaskPlannerDatabase | undefined;
  readOnly?: boolean | undefined;
}

export const NoteAttachmentsPanel: React.FC<NoteAttachmentsPanelProps> = ({
  noteId,
  attachments = [],
  onChange,
  stagedFiles = [],
  onStagedFilesChange,
  db = defaultDb,
  readOnly = false,
}) => {
  const [objectUrls, setObjectUrls] = useState<Map<string, string>>(new Map());
  const [editingCaptionId, setEditingCaptionId] = useState<string | null>(null);
  const [captionInput, setCaptionInput] = useState<string>('');
  const [uploading, setUploading] = useState<boolean>(false);

  // Maintain object URLs for Blobs and staged Files
  useEffect(() => {
    const urls = new Map<string, string>();

    // For persisted attachments with Blob data
    attachments.forEach((att) => {
      if (att.data) {
        urls.set(att.id, URL.createObjectURL(att.data));
      }
    });

    // For staged files
    stagedFiles.forEach((staged, idx) => {
      urls.set(`staged-${idx}`, URL.createObjectURL(staged.file));
    });

    setObjectUrls(urls);

    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [attachments, stagedFiles]);

  const totalCount = (noteId ? attachments.length : stagedFiles.length);

  const beforeUpload = (file: File) => {
    if (totalCount >= MAX_ATTACHMENTS) {
      message.error(`Mỗi ghi chú chỉ được đính kèm tối đa ${MAX_ATTACHMENTS} ảnh`);
      return Upload.LIST_IGNORE;
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type as (typeof ALLOWED_MIME_TYPES)[number])) {
      message.error('Chỉ hỗ trợ định dạng ảnh: PNG, JPEG, GIF, WebP');
      return Upload.LIST_IGNORE;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      message.error('Dung lượng ảnh không được vượt quá 5MB');
      return Upload.LIST_IGNORE;
    }

    return true;
  };

  const handleCustomRequest = async ({ file }: { file: string | Blob | File | UploadFile }) => {
    const nativeFile = file as File;
    if (noteId) {
      setUploading(true);
      try {
        const newAttachment = await addNoteAttachment(
          {
            noteId,
            fileName: nativeFile.name,
            mimeType: nativeFile.type as (typeof ALLOWED_MIME_TYPES)[number],
            sizeBytes: nativeFile.size,
            data: nativeFile,
          },
          db
        );
        onChange?.([...attachments, newAttachment]);
        message.success('Đã tải ảnh lên thành công');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Tải ảnh thất bại';
        message.error(msg);
      } finally {
        setUploading(false);
      }
    } else {
      // Staged mode
      onStagedFilesChange?.([...stagedFiles, { file: nativeFile, caption: '' }]);
    }
  };

  const handleCapture = async () => {
    setUploading(true);
    try {
      const file = await captureFocusedWindowScreenshot();
      if (beforeUpload(file) !== true) return;
      await handleCustomRequest({ file });
      message.success('Đã chụp cửa sổ');
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Không thể chụp cửa sổ');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteAttachment = async (id: string) => {
    if (noteId) {
      try {
        await deleteNoteAttachment(id, db);
        onChange?.(attachments.filter((a) => a.id !== id));
        message.success('Đã xóa ảnh đính kèm');
      } catch (err) {
        message.error('Không thể xóa ảnh');
      }
    }
  };

  const handleDeleteStaged = (index: number) => {
    const updated = [...stagedFiles];
    updated.splice(index, 1);
    onStagedFilesChange?.(updated);
  };

  const handleSaveCaption = async (att: NoteAttachment) => {
    try {
      const updated = { ...att, caption: captionInput.trim() || undefined };
      await db.noteAttachments.put(updated);
      onChange?.(attachments.map((a) => (a.id === att.id ? updated : a)));
      setEditingCaptionId(null);
      message.success('Đã cập nhật chú thích');
    } catch {
      message.error('Không thể lưu chú thích');
    }
  };

  const handleSaveStagedCaption = (index: number) => {
    const updated = [...stagedFiles];
    if (updated[index]) {
      updated[index] = { ...updated[index]!, caption: captionInput.trim() || undefined };
      onStagedFilesChange?.(updated);
    }
    setEditingCaptionId(null);
  };

  return (
    <div>
      <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography.Text strong>
          Ảnh chụp màn hình ({totalCount}/{MAX_ATTACHMENTS})
        </Typography.Text>
        {!readOnly && totalCount < MAX_ATTACHMENTS && (
          <Space size={4}>
            <Upload
              accept="image/png,image/jpeg,image/gif,image/webp"
              showUploadList={false}
              beforeUpload={beforeUpload}
              customRequest={({ file }) => void handleCustomRequest({ file })}
            >
              <Button size="small" icon={<PlusOutlined />} loading={uploading}>
                Thêm ảnh
              </Button>
            </Upload>
            <Button
              size="small"
              icon={<CameraOutlined />}
              loading={uploading}
              onClick={() => void handleCapture()}
            >
              Chụp cửa sổ
            </Button>
          </Space>
        )}
      </div>

      <Image.PreviewGroup>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {/* Persisted attachments */}
          {attachments.map((att) => {
            const previewUrl = objectUrls.get(att.id);
            const isEditing = editingCaptionId === att.id;

            return (
              <Card
                key={att.id}
                size="small"
                style={{ width: 140, padding: 0 }}
                styles={{ body: { padding: 8 } }}
              >
                <div style={{ width: '100%', height: 72, display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#f5f5f5', borderRadius: 4, overflow: 'hidden' }}>
                  {previewUrl && (
                    <Image
                      src={previewUrl}
                      alt={att.caption || att.fileName}
                      width={124}
                      height={72}
                      style={{ objectFit: 'cover' }}
                    />
                  )}
                </div>
                <div style={{ marginTop: 6 }}>
                  {isEditing ? (
                    <Space.Compact style={{ width: '100%' }}>
                      <Input
                        size="small"
                        value={captionInput}
                        onChange={(e) => setCaptionInput(e.target.value)}
                        placeholder="Chú thích..."
                        onPressEnter={() => void handleSaveCaption(att)}
                      />
                      <Button
                        size="small"
                        icon={<CheckOutlined />}
                        onClick={() => void handleSaveCaption(att)}
                      />
                    </Space.Compact>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography.Text
                        ellipsis
                        style={{ fontSize: 11, color: att.caption ? 'inherit' : '#8c8c8c', maxWidth: 80 }}
                        title={att.caption || att.fileName}
                      >
                        {att.caption || att.fileName}
                      </Typography.Text>
                      {!readOnly && (
                        <Space size={2}>
                          <Tooltip title="Sửa chú thích">
                            <Button
                              type="text"
                              size="small"
                              icon={<EditOutlined style={{ fontSize: 12 }} />}
                              onClick={() => {
                                setEditingCaptionId(att.id);
                                setCaptionInput(att.caption || '');
                              }}
                            />
                          </Tooltip>
                          <Popconfirm
                            title="Xóa ảnh này?"
                            onConfirm={() => void handleDeleteAttachment(att.id)}
                            okText="Xóa"
                            cancelText="Hủy"
                          >
                            <Button
                              type="text"
                              danger
                              size="small"
                              icon={<DeleteOutlined style={{ fontSize: 12 }} />}
                            />
                          </Popconfirm>
                        </Space>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}

          {/* Staged attachments (new unsaved note) */}
          {stagedFiles.map((staged, idx) => {
            const key = `staged-${idx}`;
            const previewUrl = objectUrls.get(key);
            const isEditing = editingCaptionId === key;

            return (
              <Card
                key={key}
                size="small"
                style={{ width: 140, padding: 0 }}
                styles={{ body: { padding: 8 } }}
              >
                <div style={{ width: '100%', height: 72, display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#f5f5f5', borderRadius: 4, overflow: 'hidden' }}>
                  {previewUrl && (
                    <Image
                      src={previewUrl}
                      alt={staged.caption || staged.file.name}
                      width={124}
                      height={72}
                      style={{ objectFit: 'cover' }}
                    />
                  )}
                </div>
                <div style={{ marginTop: 6 }}>
                  {isEditing ? (
                    <Space.Compact style={{ width: '100%' }}>
                      <Input
                        size="small"
                        value={captionInput}
                        onChange={(e) => setCaptionInput(e.target.value)}
                        placeholder="Chú thích..."
                        onPressEnter={() => handleSaveStagedCaption(idx)}
                      />
                      <Button
                        size="small"
                        icon={<CheckOutlined />}
                        onClick={() => handleSaveStagedCaption(idx)}
                      />
                    </Space.Compact>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography.Text
                        ellipsis
                        style={{ fontSize: 11, color: staged.caption ? 'inherit' : '#8c8c8c', maxWidth: 80 }}
                        title={staged.caption || staged.file.name}
                      >
                        {staged.caption || staged.file.name}
                      </Typography.Text>
                      {!readOnly && (
                        <Space size={2}>
                          <Tooltip title="Sửa chú thích">
                            <Button
                              type="text"
                              size="small"
                              icon={<EditOutlined style={{ fontSize: 12 }} />}
                              onClick={() => {
                                setEditingCaptionId(key);
                                setCaptionInput(staged.caption || '');
                              }}
                            />
                          </Tooltip>
                          <Button
                            type="text"
                            danger
                            size="small"
                            icon={<DeleteOutlined style={{ fontSize: 12 }} />}
                            onClick={() => handleDeleteStaged(idx)}
                          />
                        </Space>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </Image.PreviewGroup>
    </div>
  );
};
