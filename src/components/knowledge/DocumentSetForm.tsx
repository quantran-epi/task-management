import { DeleteOutlined, DownOutlined, PlusOutlined, UpOutlined } from '@ant-design/icons';
import { Button, Checkbox, Form, Input, List, Modal, Radio, Space, Tooltip, Typography, theme } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import type { DocumentSet, Note } from '../../types/models';

const { Text } = Typography;

export interface DocumentSetFormValue {
  name: string;
  documentIds: string[];
}

export interface DocumentSetFormProps {
  notes: readonly Note[];
  initialSet?: DocumentSet;
  currentFolderId?: string;
  onSave: (value: DocumentSetFormValue) => void | Promise<void>;
  onPublish?: () => void;
}

export function snapshotFolderMembers(notes: readonly Note[], folderId?: string): string[] {
  return notes
    .filter((note) => !note.deletedAt && note.type !== 'folder' && note.parentId === folderId)
    .map((note) => note.id);
}

export function DocumentSetForm({ notes, initialSet, currentFolderId, onSave }: DocumentSetFormProps) {
  const { token } = theme.useToken();
  const [name, setName] = useState(initialSet?.name ?? '');
  const [mode, setMode] = useState<'empty' | 'folder' | 'manual'>(initialSet ? 'manual' : 'empty');
  const [members, setMembers] = useState<string[]>(initialSet?.documentIds ?? []);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftSelection, setDraftSelection] = useState<string[]>(members);
  const documents = useMemo(() => notes.filter((note) => !note.deletedAt && note.type !== 'folder'), [notes]);
  const noteById = useMemo(() => new Map(documents.map((note) => [note.id, note])), [documents]);

  useEffect(() => {
    if (!initialSet) return;
    setName(initialSet.name);
    setMembers(initialSet.documentIds);
    setMode('manual');
  }, [initialSet]);

  const chooseMode = (nextMode: 'empty' | 'folder' | 'manual') => {
    setMode(nextMode);
    if (nextMode === 'empty') setMembers([]);
    if (nextMode === 'folder') setMembers(snapshotFolderMembers(notes, currentFolderId));
    if (nextMode === 'manual') {
      setDraftSelection(members);
      setPickerOpen(true);
    }
  };

  const move = (index: number, offset: number) => {
    const target = index + offset;
    if (target < 0 || target >= members.length) return;
    setMembers((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  };

  const save = () => onSave({ name: name.trim().slice(0, 120), documentIds: members });

  return (
    <Form layout="vertical">
      <Form.Item label="Tên bộ tài liệu" required>
        <Input aria-label="Tên bộ tài liệu" value={name} onChange={(event) => setName(event.target.value.slice(0, 122))} />
      </Form.Item>
      {!initialSet && (
        <Form.Item label="Khởi tạo từ">
          <Radio.Group value={mode} onChange={(event) => chooseMode(event.target.value)}>
            <Space direction="vertical">
              <Radio value="empty">Bộ trống</Radio>
              <Radio value="folder">Từ thư mục hiện tại</Radio>
              <Radio value="manual">Chọn tài liệu</Radio>
            </Space>
          </Radio.Group>
          {mode === 'folder' && (
            <Text type="secondary" style={{ display: 'block', marginTop: token.marginSM }}>
              Tài liệu thêm hoặc di chuyển sau này không tự thay đổi bộ này.
            </Text>
          )}
        </Form.Item>
      )}
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Button
          aria-label="Thêm tài liệu"
          icon={<PlusOutlined />}
          onClick={() => {
            setDraftSelection(members);
            setPickerOpen(true);
          }}
        >
          Thêm tài liệu
        </Button>
        {members.length === 0 ? (
          <Text type="secondary">Bộ tài liệu chưa có thành viên.</Text>
        ) : (
          <List
            dataSource={members}
            renderItem={(documentId, index) => {
              const title = noteById.get(documentId)?.title || 'Tài liệu không tên';
              return (
                <List.Item
                  data-testid={`member-${documentId}`}
                  actions={[
                    <Tooltip title="Đưa lên" key="up">
                      <Button aria-label="Đưa lên" icon={<UpOutlined />} disabled={index === 0} onClick={() => move(index, -1)} />
                    </Tooltip>,
                    <Tooltip title="Đưa xuống" key="down">
                      <Button aria-label="Đưa xuống" icon={<DownOutlined />} disabled={index === members.length - 1} onClick={() => move(index, 1)} />
                    </Tooltip>,
                    <Tooltip title={`Gỡ ${title}`} key="remove">
                      <Button aria-label={`Gỡ ${title}`} danger icon={<DeleteOutlined />} onClick={() => setMembers((current) => current.filter((id) => id !== documentId))} />
                    </Tooltip>,
                  ]}
                >
                  <Tooltip title={documentId}><Text ellipsis>{title}</Text></Tooltip>
                </List.Item>
              );
            }}
          />
        )}
        <Button disabled={!name.trim()} onClick={save}>Lưu thay đổi</Button>
      </Space>
      <Modal
        title="Chọn tài liệu"
        open={pickerOpen}
        okText="Xong"
        cancelText="Hủy"
        onCancel={() => setPickerOpen(false)}
        onOk={() => {
          const retained = members.filter((id) => draftSelection.includes(id));
          const added = draftSelection.filter((id) => !retained.includes(id));
          setMembers([...retained, ...added]);
          setMode('manual');
          setPickerOpen(false);
        }}
      >
        <Input.Search placeholder="Tìm tài liệu" style={{ marginBottom: token.marginSM }} />
        <Checkbox.Group value={draftSelection} onChange={(values) => setDraftSelection(values.map(String))}>
          <Space direction="vertical">
            {documents.map((document) => (
              <Checkbox key={document.id} value={document.id}>
                {document.title || 'Tài liệu không tên'}{document.parentId ? ` — ${document.parentId}` : ''}
              </Checkbox>
            ))}
          </Space>
        </Checkbox.Group>
      </Modal>
    </Form>
  );
}
