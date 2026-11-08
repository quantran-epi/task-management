import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Checkbox,
  Input,
  Modal,
  Segmented,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  theme,
  Typography,
} from 'antd';
import {
  BranchesOutlined,
  ExperimentOutlined,
  EyeOutlined,
  GlobalOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import {
  ResearchPayloadSchema,
  type ResearchFinding,
  type ResearchPayload,
} from '../../../services/ai/researchService';
import type { ResearchArtifactVersion } from '../../../services/wizard/artifactRepo';

// -------------------------------------------------------------------------------------------------
// Shared helpers
// -------------------------------------------------------------------------------------------------

/** D-06: every stored version carries an unvalidated `unknown` payload; only a parsed one renders. */
export function parseResearchPayload(payload: unknown): ResearchPayload | null {
  const parsed = ResearchPayloadSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

export function findingTag(finding: ResearchFinding): string {
  return finding.scope === 'web'
    ? '[EXTERNAL:WEB]'
    : `[EXTERNAL:REPO:${finding.systemCode ?? 'UNKNOWN'}]`;
}

function countByScope(findings: readonly ResearchFinding[]): { web: number; repo: number } {
  return {
    web: findings.filter((finding) => finding.scope === 'web').length,
    repo: findings.filter((finding) => finding.scope === 'repo').length,
  };
}

function versionLabel(version: number, isLatest: boolean): string {
  return isLatest ? `RESEARCH v${version} (Mới nhất)` : `RESEARCH v${version}`;
}

// -------------------------------------------------------------------------------------------------
// Summary card (D-10, UI-SPEC §6)
// -------------------------------------------------------------------------------------------------

export interface ResearchSummaryCardProps {
  research?: ResearchPayload | null | undefined;
  version?: number | undefined;
  /** Full CR-scoped history from `loadAllResearchArtifacts`; drives the D-06 version selector. */
  versions?: ResearchArtifactVersion[] | undefined;
  loading?: boolean | undefined;
  onTriggerResearch?: (() => void) | undefined;
}

export const ResearchSummaryCard: React.FC<ResearchSummaryCardProps> = ({
  research,
  version,
  versions,
  loading = false,
  onTriggerResearch,
}) => {
  const { token } = theme.useToken();
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  const findings = research?.findings ?? [];
  const { web, repo } = countByScope(findings);
  const hasResearch = Boolean(research) && version !== undefined;

  return (
    <>
      <Card
        size="small"
        style={{ background: '#fafbfc', borderColor: '#e9eaee', borderRadius: token.borderRadiusSM }}
        styles={{ body: { padding: '8px 14px' } }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <Space size={16} wrap style={{ alignItems: 'center' }}>
            <Space size={6} style={{ alignItems: 'center' }}>
              <ExperimentOutlined style={{ color: token.colorPrimary }} />
              <span style={{ fontSize: 13, fontWeight: 500, color: token.colorText }}>
                Nghiên cứu bên ngoài:
              </span>
              {hasResearch ? (
                <>
                  <Tag color="processing" style={{ margin: 0 }}>
                    RESEARCH v{version}
                  </Tag>
                  <Tag color="blue" icon={<GlobalOutlined />} style={{ margin: 0 }}>
                    Web: {web}
                  </Tag>
                  <Tag color="cyan" icon={<BranchesOutlined />} style={{ margin: 0 }}>
                    Repo: {repo}
                  </Tag>
                </>
              ) : (
                <Tag color="default" style={{ margin: 0 }}>
                  Chưa có dữ liệu
                </Tag>
              )}
            </Space>
          </Space>

          <Space size={8}>
            {onTriggerResearch && (
              <Button
                size="small"
                icon={<ReloadOutlined />}
                loading={loading}
                onClick={onTriggerResearch}
              >
                {hasResearch ? 'Nghiên cứu lại' : 'Nghiên cứu (Claude Code)'}
              </Button>
            )}
            <Button
              size="small"
              icon={<EyeOutlined />}
              disabled={!hasResearch}
              onClick={() => setDetailModalOpen(true)}
            >
              Xem chi tiết
            </Button>
          </Space>
        </div>
      </Card>

      <ResearchDetailModal
        open={detailModalOpen}
        research={research ?? null}
        {...(version !== undefined ? { version } : {})}
        {...(versions ? { versions } : {})}
        onCancel={() => setDetailModalOpen(false)}
      />
    </>
  );
};

// -------------------------------------------------------------------------------------------------
// Detail modal (D-06 history, UI-SPEC §7)
// -------------------------------------------------------------------------------------------------

export interface ResearchDetailModalProps {
  open: boolean;
  research: ResearchPayload | null;
  version?: number | undefined;
  versions?: ResearchArtifactVersion[] | undefined;
  onCancel: () => void;
  crCode?: string | undefined;
}

export const ResearchDetailModal: React.FC<ResearchDetailModalProps> = ({
  open,
  research,
  version,
  versions,
  onCancel,
  crCode,
}) => {
  const { token } = theme.useToken();

  const history = useMemo(
    () =>
      (versions ?? [])
        .map((entry) => ({ version: entry.version, payload: parseResearchPayload(entry.payload) }))
        .filter((entry): entry is { version: number; payload: ResearchPayload } => entry.payload !== null)
        .sort((left, right) => right.version - left.version),
    [versions]
  );

  const latestVersion = history[0]?.version ?? version;
  const [selected, setSelected] = useState<number | undefined>(latestVersion);

  // Reopening the modal always starts at the current version, never a stale selection.
  useEffect(() => {
    if (open) setSelected(latestVersion);
  }, [open, latestVersion]);

  const active = history.find((entry) => entry.version === selected);
  const payload = active?.payload ?? research;
  const activeVersion = active?.version ?? version;
  const findings = payload?.findings ?? [];
  const skipped = payload?.skippedSystems ?? [];

  const columns = [
    {
      title: 'Nguồn',
      dataIndex: 'tag',
      key: 'tag',
      width: 200,
      render: (tag: string) => (
        <Tag color={tag === '[EXTERNAL:WEB]' ? 'blue' : 'cyan'} style={{ fontFamily: 'monospace', margin: 0 }}>
          {tag}
        </Tag>
      ),
    },
    { title: 'Kết luận', dataIndex: 'claim', key: 'claim' },
    {
      title: 'Nguồn trích dẫn',
      dataIndex: 'source',
      key: 'source',
      width: 260,
      render: (source: string) =>
        /^https?:\/\//i.test(source) ? (
          <a href={source} target="_blank" rel="noreferrer noopener" style={{ color: token.colorPrimary }}>
            {source}
          </a>
        ) : (
          <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{source}</span>
        ),
    },
    {
      title: 'Độ tin cậy',
      dataIndex: 'confidence',
      key: 'confidence',
      width: 110,
      render: (confidence: number) => <Tag style={{ margin: 0 }}>{Math.round(confidence * 100)}%</Tag>,
    },
  ];

  const rows = findings.map((finding, index) => ({
    key: `${index}:${finding.source}`,
    tag: findingTag(finding),
    claim: finding.claim,
    source: finding.source,
    confidence: finding.confidence,
  }));

  const summaryTab = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {skipped.length > 0 && (
        <div
          role="alert"
          style={{
            padding: '8px 12px',
            border: '1px solid #faad14',
            borderRadius: token.borderRadiusSM,
            background: '#fffbe6',
            fontSize: 12,
          }}
        >
          <Typography.Text strong>Hệ thống chưa nghiên cứu được:</Typography.Text>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {skipped.map((system) => (
              <li key={system.systemId}>
                {system.code}: {system.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <Typography.Text strong>Tóm tắt tổng quan</Typography.Text>
        <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
          {payload?.summary ?? 'Chưa có dữ liệu nghiên cứu.'}
        </div>
      </div>

      <div>
        <Typography.Text strong>Danh sách phát hiện ({findings.length})</Typography.Text>
        <Table
          size="small"
          style={{ marginTop: 6 }}
          columns={columns}
          dataSource={rows}
          pagination={false}
          locale={{ emptyText: 'Chưa có phát hiện nào' }}
        />
      </div>
    </div>
  );

  const rawTab = (
    <pre
      style={{
        margin: 0,
        maxHeight: '50vh',
        overflow: 'auto',
        padding: 12,
        background: '#1e1f22',
        color: '#f7f8fa',
        borderRadius: token.borderRadiusSM,
        fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Monaco, Consolas, monospace",
        fontSize: 12,
        lineHeight: 1.4,
      }}
    >
      {payload?.rawOutput ?? (payload ? JSON.stringify(payload, null, 2) : '')}
    </pre>
  );

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      footer={null}
      width={900}
      title={crCode ? `Chi tiết nghiên cứu bên ngoài — CR ${crCode}` : 'Chi tiết nghiên cứu bên ngoài'}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {history.length > 1 && (
          <Segmented
            value={selected}
            onChange={(value) => setSelected(value as number)}
            options={history.map((entry, index) => ({
              label: versionLabel(entry.version, index === 0),
              value: entry.version,
            }))}
          />
        )}
        {history.length <= 1 && activeVersion !== undefined && (
          <Tag color="processing" style={{ margin: 0, alignSelf: 'flex-start' }}>
            RESEARCH v{activeVersion}
          </Tag>
        )}

        <Tabs
          items={[
            { key: 'summary', label: 'Tóm tắt & phát hiện', children: summaryTab },
            { key: 'raw', label: 'Raw Output', children: rawTab },
          ]}
        />
      </div>
    </Modal>
  );
};

// -------------------------------------------------------------------------------------------------
// Manual trigger modal (D-08, UI-SPEC §2)
// -------------------------------------------------------------------------------------------------

export interface ResearchTargetSystem {
  systemId: string;
  code: string;
  name: string;
}

export interface ResearchTriggerPayload {
  questions: string[];
  targetSystemIds: string[];
  includeWeb: boolean;
}

export interface ResearchTriggerModalProps {
  open: boolean;
  targetSystems: ResearchTargetSystem[];
  onCancel: () => void;
  onSubmit: (payload: ResearchTriggerPayload) => void;
}

export const ResearchTriggerModal: React.FC<ResearchTriggerModalProps> = ({
  open,
  targetSystems,
  onCancel,
  onSubmit,
}) => {
  const [questionText, setQuestionText] = useState('');
  const [selectedSystemIds, setSelectedSystemIds] = useState<string[]>([]);
  const [includeWeb, setIncludeWeb] = useState(true);

  // Every open starts from a clean form; a cancelled run must not leak its parameters.
  useEffect(() => {
    if (!open) return;
    setQuestionText('');
    setSelectedSystemIds([]);
    setIncludeWeb(true);
  }, [open]);

  // Every question becomes one shell argument and one remote prompt line, so bound both.
  const MAX_QUESTIONS = 20;
  const MAX_QUESTION_CHARS = 500;
  const allQuestions = questionText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const questions = allQuestions
    .slice(0, MAX_QUESTIONS)
    .map((question) => question.slice(0, MAX_QUESTION_CHARS));
  const overLimit = allQuestions.length > MAX_QUESTIONS;
  const canSubmit = questions.length > 0 && selectedSystemIds.length > 0;

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      title="Nghiên cứu bên ngoài bằng Claude Code"
      okText="Bắt đầu nghiên cứu"
      cancelText="Hủy"
      okButtonProps={{ disabled: !canSubmit }}
      onOk={() => onSubmit({ questions, targetSystemIds: selectedSystemIds, includeWeb })}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <Typography.Text strong>Câu hỏi cần nghiên cứu</Typography.Text>
          <Input.TextArea
            style={{ marginTop: 6 }}
            rows={4}
            value={questionText}
            onChange={(event) => setQuestionText(event.target.value)}
            placeholder="Nội dung câu hỏi cần nghiên cứu..."
          />
          {overLimit && (
            <Typography.Text type="warning" style={{ fontSize: 12 }}>
              Chỉ {MAX_QUESTIONS} câu hỏi đầu tiên được gửi đi.
            </Typography.Text>
          )}
        </div>

        <div>
          <Typography.Text strong>Hệ thống mục tiêu</Typography.Text>
          <div style={{ marginTop: 6 }}>
            {targetSystems.length === 0 ? (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                CR chưa có hệ thống mục tiêu nào. Hãy thêm subsystem vào CR trước khi nghiên cứu.
              </Typography.Text>
            ) : (
              <Checkbox.Group
                value={selectedSystemIds}
                onChange={(values) => setSelectedSystemIds(values as string[])}
                options={targetSystems.map((system) => ({
                  label: `${system.code} — ${system.name}`,
                  value: system.systemId,
                }))}
              />
            )}
          </div>
        </div>

        <Space size={8} style={{ alignItems: 'center' }}>
          <Switch checked={includeWeb} onChange={setIncludeWeb} />
          <span style={{ fontSize: 13 }}>Tìm kiếm Web (WebSearch/WebFetch)</span>
        </Space>
      </div>
    </Modal>
  );
};
