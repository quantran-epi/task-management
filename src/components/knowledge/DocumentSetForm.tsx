import { Button, Checkbox, Collapse, Form, Input, Radio, Select, Space, Tag, Typography, useAntdToken, FormItem, RadioGroup } from '../ui';
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
  documentIds?: string[] | undefined;
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
  if (!folderId) {
    return notes
      .filter((note) => !note.deletedAt && note.type !== 'folder' && !note.parentId)
      .map((note) => note.id);
  }

  const folderIds = new Set<string>([folderId]);
  let addedNew = true;
  while (addedNew) {
    addedNew = false;
    for (const note of notes) {
      if (!note.deletedAt && note.type === 'folder' && note.parentId && folderIds.has(note.parentId) && !folderIds.has(note.id)) {
        folderIds.add(note.id);
        addedNew = true;
      }
    }
  }

  return notes
    .filter((note) => !note.deletedAt && note.type !== 'folder' && note.parentId && folderIds.has(note.parentId))
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
  const { token } = useAntdToken();
  const [name, setName] = useState(initialSet?.name ?? '');
  const [mode, setMode] = useState<'empty' | 'folder'>('empty');

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

  const chooseMode = (nextMode: 'empty' | 'folder') => setMode(nextMode);

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
      // Membership is a creation-only decision. On edit we must not emit documentIds,
      // otherwise updateDocumentSet would overwrite the membership managed in Detail.
      ...(!initialSet
        ? { documentIds: mode === 'folder' ? snapshotFolderMembers(notes, currentFolderId) : [] }
        : {}),
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
    <Form layout="vertical" className="doc-set-form-compact" style={{ width: '100%', minWidth: 0 }}>
      {/* 1. Friendly Presets Radio (D-18) */}
      <div className="doc-set-form-group-title">Phạm vi bộ tài liệu</div>
      <FormItem label="Mẫu thiết lập phạm vi (Preset)">
        <RadioGroup
          aria-label="Scope preset"
          value={preset}
          onChange={(e) => handlePresetChange(e.target.value)}
        >
          <Space className="doc-set-preset-grid" direction="vertical">
            {PRESET_OPTIONS.map((opt) => (
              <Radio key={opt.value} value={opt.value}>
                {opt.label}
              </Radio>
            ))}
          </Space>
        </RadioGroup>
      </FormItem>

      {/* 2. Preset-specific fields */}
      {preset === 'TheoMoiTruong' && (
        <FormItem
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
        </FormItem>
      )}

      {(preset === 'TheoModule' || preset === 'TuyChinh') && (
        <FormItem
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
        </FormItem>
      )}

      {preset === 'TheoPhienBan' && (
        <FormItem label="Phiên bản (Version)">
          <Input
            aria-label="Phiên bản"
            placeholder="Ví dụ: v2026.10, 2.4.0..."
            value={version ?? ''}
            onChange={(e) => setVersion(e.target.value)}
          />
        </FormItem>
      )}

      {preset === 'BoSung' && (
        <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }}>
          <FormItem
            label="Loại quan hệ bổ sung"
            required
          >
            <RadioGroup
              aria-label="Relation kind"
              value={supplementRelationKind}
              onChange={(e) => setSupplementRelationKind(e.target.value)}
            >
              <Space className="doc-set-preset-grid" direction="vertical">
                <Radio value="EXTENDS">EXTENDS (Mở rộng)</Radio>
                <Radio value="SUPPLEMENTS">SUPPLEMENTS (Bổ trợ)</Radio>
                <Radio value="SUPERSEDES">SUPERSEDES (Thay thế)</Radio>
              </Space>
            </RadioGroup>
          </FormItem>

          <FormItem
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
          </FormItem>
        </Space>
      )}

      {/* 3. Collapsed Advanced Panel (D-18) */}
      <div className="doc-set-form-group-title">Cấu hình nâng cao</div>
      <Collapse
        activeKey={activeCollapseKeys}
        onChange={(keys) => setActiveCollapseKeys(typeof keys === 'string' ? [keys] : keys)}
        style={{ marginBottom: 12 }}
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
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--gap-6)' }}>
                    {aliases.map((al) => (
                      <Tag
                        key={al}
                        closable
                        onClose={() => handleRemoveAlias(al)}
                        style={{ fontSize: 'var(--font-size-small)' }}
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
      <div className="doc-set-form-group-title">Thông tin bộ tài liệu</div>
      <FormItem label="Tên bộ tài liệu" required>
        <Input
          aria-label="Tên bộ tài liệu"
          value={name}
          onChange={(event) => setName(event.target.value.slice(0, 122))}
        />
      </FormItem>

      {/* 5. Initialize from (only for creation) */}
      {!initialSet && (
        <FormItem label="Khởi tạo từ">
          <RadioGroup value={mode} onChange={(event) => chooseMode(event.target.value as 'empty' | 'folder')}>
            <Space className="doc-set-preset-grid" direction="vertical">
              <Radio value="empty">Bộ trống</Radio>
              <Radio value="folder">Từ thư mục hiện tại</Radio>
            </Space>
          </RadioGroup>
          {mode === 'folder' && (
            <Text type="secondary" style={{ display: 'block', marginTop: token.marginSM }}>
              Tài liệu thêm hoặc di chuyển sau này không tự thay đổi bộ này.
            </Text>
          )}
        </FormItem>
      )}

      <Button disabled={!name.trim()} onClick={save}>
        Lưu thay đổi
      </Button>
    </Form>
  );
}
