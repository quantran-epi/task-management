import { DeleteOutlined, DownOutlined, PlusOutlined, UpOutlined } from '@ant-design/icons';
import {
  Button,
  Checkbox,
  Collapse,
  Form,
  Input,
  List,
  Modal,
  Radio,
  Select,
  Space,
  Tag,
  Tooltip,
  Typography,
  theme,
} from 'antd';
import { useEffect, useMemo, useState } from 'react';
import type {
  DocumentSet,
  DocumentSetPreset,
  DocumentSetRelation,
  DocumentSetRelationKind,
  DocumentSetScope,
  Note,
} from '../../types/models';

const { Text } = Typography;

export interface DocumentSetFormValue {
  name: string;
  documentIds: string[];
  preset?: DocumentSetPreset | undefined;
  scope?: DocumentSetScope | undefined;
  aliases?: readonly string[] | undefined;
  relations?: readonly DocumentSetRelation[] | undefined;
  isBase?: boolean | undefined;
}

export interface DocumentSetFormProps {
  notes: readonly Note[];
  initialSet?: DocumentSet;
  availableSets?: readonly DocumentSet[];
  currentFolderId?: string;
  onSave: (value: DocumentSetFormValue) => void | Promise<void>;
  onPublish?: () => void;
}

export function snapshotFolderMembers(notes: readonly Note[], folderId?: string): string[] {
  return notes
    .filter((note) => !note.deletedAt && note.type !== 'folder' && note.parentId === folderId)
    .map((note) => note.id);
}

const PRESET_OPTIONS: { label: string; value: DocumentSetPreset }[] = [
  { label: 'Chung', value: 'Chung' },
  { label: 'Theo môi trường', value: 'TheoMoiTruong' },
  { label: 'Theo module', value: 'TheoModule' },
  { label: 'Theo phiên bản', value: 'TheoPhienBan' },
  { label: 'Bổ sung', value: 'BoSung' },
  { label: 'Tùy chỉnh', value: 'TuyChinh' },
];

export function DocumentSetForm({
  notes,
  initialSet,
  availableSets = [],
  currentFolderId,
  onSave,
}: DocumentSetFormProps) {
  const { token } = theme.useToken();
  const [name, setName] = useState(initialSet?.name ?? '');
  const [mode, setMode] = useState<'empty' | 'folder' | 'manual'>(initialSet ? 'manual' : 'empty');
  const [members, setMembers] = useState<string[]>(initialSet?.documentIds ?? []);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftSelection, setDraftSelection] = useState<string[]>(members);
  const documents = useMemo(() => notes.filter((note) => !note.deletedAt && note.type !== 'folder'), [notes]);
  const noteById = useMemo(() => new Map(documents.map((note) => [note.id, note])), [documents]);

  // Scope facets (D-17, D-18)
  const [preset, setPreset] = useState<DocumentSetPreset>(initialSet?.preset ?? 'Chung');
  const [domain, setDomain] = useState<string>(initialSet?.scope?.domain ?? 'General');
  const [environment, setEnvironment] = useState<string | null>(initialSet?.scope?.environment ?? null);
  const [version, setVersion] = useState<string | null>(initialSet?.scope?.version ?? null);
  const [isBase, setIsBase] = useState<boolean>(initialSet?.isBase ?? true);
  const [aliases, setAliases] = useState<string[]>(initialSet?.aliases ? [...initialSet.aliases] : []);
  const [aliasInput, setAliasInput] = useState<string>('');
  const [relations, setRelations] = useState<DocumentSetRelation[]>(
    initialSet?.relations ? [...initialSet.relations] : []
  );
  const [supplementRelationKind, setSupplementRelationKind] = useState<DocumentSetRelationKind>(
    initialSet?.relations?.[0]?.kind ?? 'SUPPLEMENTS'
  );
  const [supplementTargetSetId, setSupplementTargetSetId] = useState<string>(
    initialSet?.relations?.[0]?.targetSetId ?? ''
  );
  const [customEnvSelected, setCustomEnvSelected] = useState<boolean>(false);
  const [activeCollapseKeys, setActiveCollapseKeys] = useState<string[]>([]);
  const [submittedAttempt, setSubmittedAttempt] = useState<boolean>(false);

  useEffect(() => {
    if (!initialSet) return;
    setName(initialSet.name);
    setMembers(initialSet.documentIds);
    setMode('manual');
    setPreset(initialSet.preset ?? 'Chung');
    setDomain(initialSet.scope?.domain ?? 'General');
    setEnvironment(initialSet.scope?.environment ?? null);
    setVersion(initialSet.scope?.version ?? null);
    setIsBase(initialSet.isBase ?? true);
    setAliases(initialSet.aliases ? [...initialSet.aliases] : []);
    setRelations(initialSet.relations ? [...initialSet.relations] : []);
    if (initialSet.relations?.[0]) {
      setSupplementRelationKind(initialSet.relations[0].kind);
      setSupplementTargetSetId(initialSet.relations[0].targetSetId);
    }
  }, [initialSet]);

  const handlePresetChange = (nextPreset: DocumentSetPreset) => {
    setPreset(nextPreset);
    if (nextPreset === 'Chung') {
      setIsBase(true);
      setEnvironment(null);
      setVersion(null);
    } else if (nextPreset === 'TheoMoiTruong') {
      setIsBase(false);
      setVersion(null);
    } else if (nextPreset === 'TheoModule') {
      setIsBase(false);
      setEnvironment(null);
      setVersion(null);
    } else if (nextPreset === 'TheoPhienBan') {
      setIsBase(false);
      setEnvironment(null);
    } else if (nextPreset === 'BoSung') {
      setIsBase(false);
      setEnvironment(null);
      setVersion(null);
    } else if (nextPreset === 'TuyChinh') {
      setActiveCollapseKeys(['advanced']);
    }
  };

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

  const handleAddAlias = () => {
    const trimmed = aliasInput.trim();
    if (trimmed && !aliases.includes(trimmed)) {
      setAliases([...aliases, trimmed]);
      setAliasInput('');
    }
  };

  const handleRemoveAlias = (toRemove: string) => {
    setAliases(aliases.filter((a) => a !== toRemove));
  };

  // Validation rules (D-18):
  // - scope.domain required for every preset
  // - For TheoMoiTruong: environment required
  // - For BoSung: supplementTargetSetId required
  // - For TheoPhienBan: version required (or at least one facet)
  const isValid = useMemo(() => {
    if (!name.trim()) return false;
    if (!domain.trim()) return false;
    if (preset === 'TheoMoiTruong' && !environment?.trim()) return false;
    if (preset === 'BoSung' && (!supplementTargetSetId.trim() || !supplementRelationKind)) return false;
    return true;
  }, [name, domain, preset, environment, supplementTargetSetId, supplementRelationKind]);

  const save = () => {
    setSubmittedAttempt(true);
    if (!isValid) return;

    let computedRelations: DocumentSetRelation[] = [...relations];
    if (preset === 'BoSung' && supplementTargetSetId) {
      computedRelations = [{ kind: supplementRelationKind, targetSetId: supplementTargetSetId }];
    }

    const payload: DocumentSetFormValue = {
      name: name.trim().slice(0, 120),
      documentIds: members,
      preset,
      scope: {
        domain: domain.trim(),
        environment: environment?.trim() || null,
        version: version?.trim() || null,
      },
      aliases,
      relations: computedRelations,
      isBase: preset === 'Chung' ? true : isBase,
    };

    void onSave(payload);
  };

  return (
    <Form layout="vertical">
      {/* 1. Friendly Presets Radio (D-18) */}
      <Form.Item label="Mẫu thiết lập phạm vi (Preset)">
        <Radio.Group
          aria-label="Scope preset"
          value={preset}
          onChange={(e) => handlePresetChange(e.target.value)}
        >
          <Space direction="vertical">
            {PRESET_OPTIONS.map((opt) => (
              <Radio key={opt.value} value={opt.value}>
                {opt.label}
              </Radio>
            ))}
          </Space>
        </Radio.Group>
      </Form.Item>

      {/* 2. Preset-specific fields */}
      {preset === 'TheoMoiTruong' && (
        <Form.Item
          label="Môi trường (Environment)"
          required
          {...(submittedAttempt && !environment ? { validateStatus: 'error', help: 'Vui lòng chọn hoặc nhập môi trường' } : {})}
        >
          <Select
            aria-label="Môi trường"
            placeholder="Chọn môi trường (SIT, UAT, PROD...)"
            value={customEnvSelected ? 'Khac' : environment}
            onChange={(val) => {
              if (val === 'Khac') {
                setCustomEnvSelected(true);
                setEnvironment('');
              } else {
                setCustomEnvSelected(false);
                setEnvironment(val);
              }
            }}
            allowClear
            options={[
              { label: 'SIT', value: 'SIT' },
              { label: 'UAT', value: 'UAT' },
              { label: 'PROD', value: 'PROD' },
              { label: 'Khác (nhập tự do)', value: 'Khac' },
            ]}
          />
          {customEnvSelected && (
            <Input
              aria-label="Tên môi trường khác"
              placeholder="Nhập tên môi trường..."
              style={{ marginTop: 8 }}
              value={environment ?? ''}
              onChange={(e) => setEnvironment(e.target.value)}
            />
          )}
        </Form.Item>
      )}

      {(preset === 'TheoModule' || preset === 'TuyChinh') && (
        <Form.Item
          label="Miền / Phân hệ (Domain / Module)"
          required
          {...(submittedAttempt && !domain.trim() ? { validateStatus: 'error', help: 'Vui lòng nhập tên miền / module' } : {})}
        >
          <Input
            aria-label="Domain input"
            placeholder="Ví dụ: CoreBanking, CardSystem..."
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
          />
        </Form.Item>
      )}

      {preset === 'TheoPhienBan' && (
        <Form.Item label="Phiên bản (Version)">
          <Input
            aria-label="Phiên bản"
            placeholder="Ví dụ: v2026.10, 2.4.0..."
            value={version ?? ''}
            onChange={(e) => setVersion(e.target.value)}
          />
        </Form.Item>
      )}

      {preset === 'BoSung' && (
        <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }}>
          <Form.Item
            label="Loại quan hệ bổ sung"
            required
          >
            <Radio.Group
              aria-label="Relation kind"
              value={supplementRelationKind}
              onChange={(e) => setSupplementRelationKind(e.target.value)}
            >
              <Radio value="EXTENDS">EXTENDS (Mở rộng)</Radio>
              <Radio value="SUPPLEMENTS">SUPPLEMENTS (Bổ trợ)</Radio>
              <Radio value="SUPERSEDES">SUPERSEDES (Thay thế)</Radio>
            </Radio.Group>
          </Form.Item>

          <Form.Item
            label="Bộ tài liệu cha / liên quan"
            required
            {...(submittedAttempt && !supplementTargetSetId ? { validateStatus: 'error', help: 'Vui lòng chọn bộ tài liệu liên quan' } : {})}
          >
            <Select
              aria-label="Parent set selector"
              placeholder="Chọn bộ tài liệu liên quan..."
              value={supplementTargetSetId || undefined}
              onChange={(val) => setSupplementTargetSetId(val ?? '')}
              options={availableSets.map((s) => ({ label: s.name, value: s.id }))}
            />
          </Form.Item>
        </Space>
      )}

      {/* 3. Collapsed Advanced Panel (D-18) */}
      <Collapse
        activeKey={activeCollapseKeys}
        onChange={(keys) => setActiveCollapseKeys(typeof keys === 'string' ? [keys] : keys)}
        style={{ marginBottom: 16 }}
        items={[
          {
            key: 'advanced',
            label: 'Thiết lập nâng cao (Bí danh, Quan hệ, Miền tri thức gốc)',
            children: (
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                {/* Aliases Input */}
                <div>
                  <Text strong style={{ display: 'block', marginBottom: 6 }}>
                    Bí danh tìm kiếm (Aliases)
                  </Text>
                  <Space style={{ marginBottom: 8 }}>
                    <Input
                      aria-label="Nhập bí danh"
                      placeholder="Thêm bí danh..."
                      value={aliasInput}
                      onChange={(e) => setAliasInput(e.target.value)}
                      onPressEnter={handleAddAlias}
                    />
                    <Button aria-label="Thêm bí danh" onClick={handleAddAlias}>
                      Thêm
                    </Button>
                  </Space>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {aliases.map((al) => (
                      <Tag
                        key={al}
                        closable
                        onClose={() => handleRemoveAlias(al)}
                        style={{ fontSize: 12 }}
                      >
                        {al}
                      </Tag>
                    ))}
                  </div>
                </div>

                {/* isBase Override */}
                <div>
                  <Checkbox
                    aria-label="isBase checkbox"
                    checked={isBase}
                    onChange={(e) => setIsBase(e.target.checked)}
                  >
                    Là bộ tri thức gốc / nền tảng (Base Knowledge)
                  </Checkbox>
                </div>
              </Space>
            ),
          },
        ]}
      />

      {/* 4. Name */}
      <Form.Item label="Tên bộ tài liệu" required>
        <Input
          aria-label="Tên bộ tài liệu"
          value={name}
          onChange={(event) => setName(event.target.value.slice(0, 122))}
        />
      </Form.Item>

      {/* 5. Initialize from (only for creation) */}
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

      {/* 6. Document membership list */}
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
                      <Button
                        aria-label="Đưa lên"
                        icon={<UpOutlined />}
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                      />
                    </Tooltip>,
                    <Tooltip title="Đưa xuống" key="down">
                      <Button
                        aria-label="Đưa xuống"
                        icon={<DownOutlined />}
                        disabled={index === members.length - 1}
                        onClick={() => move(index, 1)}
                      />
                    </Tooltip>,
                    <Tooltip title={`Gỡ ${title}`} key="remove">
                      <Button
                        aria-label={`Gỡ ${title}`}
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => setMembers((current) => current.filter((id) => id !== documentId))}
                      />
                    </Tooltip>,
                  ]}
                >
                  <Tooltip title={documentId}>
                    <Text ellipsis>{title}</Text>
                  </Tooltip>
                </List.Item>
              );
            }}
          />
        )}
        <Button disabled={!name.trim()} onClick={save}>
          Lưu thay đổi
        </Button>
      </Space>

      {/* 7. Modal document picker */}
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
                {document.title || 'Tài liệu không tên'}
                {document.parentId ? ` — ${document.parentId}` : ''}
              </Checkbox>
            ))}
          </Space>
        </Checkbox.Group>
      </Modal>
    </Form>
  );
}
