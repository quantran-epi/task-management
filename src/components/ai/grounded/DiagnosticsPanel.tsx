import React from 'react';
import { Collapse, Descriptions, Tag, Typography, theme } from 'antd';
import type {
  CompleteModalityStatus,
  GraphRetainedCounts,
  StageDiagnostic,
} from '../../../services/knowledge/retrievalProtocol';
import type { ChatMessageGrounding } from '../../../services/ai/groundedAnswerSchemas';
import { StageDiagnosticsList } from './StageDiagnosticsList';

const { Text } = Typography;

export interface DiagnosticsPanelProps {
  diagnostics: CompleteModalityStatus | null;
  scope?: ChatMessageGrounding['scope'] | undefined;
  coverageWarnings?: readonly string[] | undefined;
  fallbackReason?: string | undefined;
  routerSource?: string | undefined;
  promptVersion?: string | undefined;
  schemaVersion?: number | undefined;
  repairs?: number | undefined;
  graphCounts?: GraphRetainedCounts | undefined;
  stages?: readonly StageDiagnostic[] | undefined;
  graphBeforeFusion?: GraphRetainedCounts | undefined;
  graphAfterFusion?: GraphRetainedCounts | undefined;
  forceOpen?: boolean | undefined;
}

function renderStatusTag(status: string) {
  if (status === 'ok') {
    return <Tag color="success" style={{ margin: 0, fontSize: 11, fontWeight: 600 }}>OK</Tag>;
  }
  if (status === 'degraded' || status === 'truncated') {
    return <Tag color="warning" style={{ margin: 0, fontSize: 11, fontWeight: 600 }}>{status.toUpperCase()}</Tag>;
  }
  return <Tag color="error" style={{ margin: 0, fontSize: 11, fontWeight: 600 }}>{status.toUpperCase()}</Tag>;
}

/**
 * DiagnosticsPanel renders retrieval modality status, timings, scope resolution source,
 * and truncation flags without ever disclosing user query text, raw source excerpts,
 * or ungrounded model output (AI-SPEC §7 invariant: content-free diagnostics).
 */
export const DiagnosticsPanel: React.FC<DiagnosticsPanelProps> = ({
  diagnostics,
  scope,
  coverageWarnings = [],
  fallbackReason = 'NONE',
  routerSource,
  promptVersion = 'v1',
  schemaVersion = 1,
  repairs = 0,
  graphCounts,
  stages,
  graphBeforeFusion,
  graphAfterFusion,
  forceOpen = false,
}) => {
  const { token } = theme.useToken();

  const items = [
    {
      key: 'fulltext',
      label: 'Toàn văn (BM25)',
      children: diagnostics?.fulltext ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {renderStatusTag(diagnostics.fulltext.status)}
          <Text type="secondary" style={{ fontSize: 12 }}>
            {diagnostics.fulltext.latencyMs}ms ({diagnostics.fulltext.itemCount} mục)
          </Text>
        </span>
      ) : '—',
    },
    {
      key: 'vector',
      label: 'Ngữ nghĩa (Vector)',
      children: diagnostics?.vector ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {renderStatusTag(diagnostics.vector.status)}
          <Text type="secondary" style={{ fontSize: 12 }}>
            {diagnostics.vector.latencyMs}ms ({diagnostics.vector.itemCount} mục)
          </Text>
        </span>
      ) : '—',
    },
    {
      key: 'graph',
      label: 'Đồ thị (Graph)',
      children: diagnostics?.graph ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {renderStatusTag(diagnostics.graph.status)}
          <Text type="secondary" style={{ fontSize: 12 }}>
            {diagnostics.graph.latencyMs}ms ({diagnostics.graph.itemCount} mục)
          </Text>
        </span>
      ) : '—',
    },
    ...(graphCounts
      ? [
          {
            key: 'graphCounts',
            label: 'Thực thể / Cạnh / Đường dẫn',
            children: (
              <Text style={{ fontSize: 12 }}>
                Thực thể: {graphCounts.entity} · Cạnh: {graphCounts.edge} · Đường dẫn:{' '}
                {graphCounts.path}
              </Text>
            ),
          },
        ]
      : []),
    ...(graphBeforeFusion
      ? [
          {
            key: 'graphBeforeFusion',
            label: 'Trước hợp nhất',
            children: (
              <Text style={{ fontSize: 12 }}>
                Trước hợp nhất: {graphBeforeFusion.entity} thực thể / {graphBeforeFusion.edge}{' '}
                cạnh / {graphBeforeFusion.path} đường dẫn
              </Text>
            ),
          },
        ]
      : []),
    ...(graphAfterFusion
      ? [
          {
            key: 'graphAfterFusion',
            label: 'Sau hợp nhất',
            children: (
              <Text style={{ fontSize: 12 }}>
                Sau hợp nhất: {graphAfterFusion.entity} thực thể / {graphAfterFusion.edge} cạnh /{' '}
                {graphAfterFusion.path} đường dẫn
              </Text>
            ),
          },
        ]
      : []),
    {
      key: 'routerSource',
      label: 'Nguồn định tuyến',
      children: (
        <Tag style={{ margin: 0, fontSize: 11, fontWeight: 600 }}>
          {routerSource ?? (scope?.routedScope ? 'semantic' : 'default')}
        </Tag>
      ),
    },
    {
      key: 'fallbackReason',
      label: 'Lý do chuyển tiếp',
      children: (
        <Tag
          color={fallbackReason === 'NONE' ? 'default' : 'warning'}
          style={{ margin: 0, fontSize: 11, fontWeight: 600 }}
        >
          {fallbackReason}
        </Tag>
      ),
    },
    {
      key: 'versions',
      label: 'Phiên bản / Sửa lỗi',
      children: (
        <Text style={{ fontSize: 12 }}>
          Schema v{schemaVersion} · Prompt {promptVersion} · {repairs} lần sửa
        </Text>
      ),
    },
  ];

  if (stages && stages.length > 0) {
    items.push({
      key: 'stages',
      label: 'Chi tiết theo bước',
      children: <StageDiagnosticsList stages={stages} />,
    });
  }

  if (coverageWarnings.length > 0) {
    items.push({
      key: 'warnings',
      label: 'Cảnh báo phạm vi',
      children: (
        <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: token.colorWarningText }}>
          {coverageWarnings.map((w, idx) => (
            <li key={idx}>{w}</li>
          ))}
        </ul>
      ),
    });
  }

  return (
    <div className="diagnostics-panel" style={{ marginTop: 12 }}>
      <Collapse
        size="small"
        defaultActiveKey={forceOpen ? ['diagnostics'] : []}
        items={[
          {
            key: 'diagnostics',
            label: (
              <span style={{ fontWeight: 600, fontSize: 13, color: token.colorTextSecondary }}>
                Chi tiết chẩn đoán truy xuất
              </span>
            ),
            children: (
              <Descriptions
                size="small"
                column={1}
                bordered
                items={items}
              />
            ),
          },
        ]}
      />
    </div>
  );
};
