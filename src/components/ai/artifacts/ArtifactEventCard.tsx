import React from 'react';
import { Button, Card, Tag, Tooltip, Typography, theme } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';
import type { SdlcArtifactKind } from '../../../services/wizard/workflowSchemas';

export interface ArtifactEvent {
  id: string;
  kind: SdlcArtifactKind;
  title: string;
  version: number;
  hash: string;
  status: 'draft' | 'approved';
  readOnly?: boolean;
  ctaLabel?: string;
}

export interface ArtifactEventCardProps {
  event: ArtifactEvent;
  onOpen: (eventId: string) => void;
  onCta?: (eventId: string) => void;
}

/**
 * Metadata-only version card (T-25.3-30). The artifact body stays in the
 * editor/preview; the transcript only ever carries type/title/version/status.
 */
export const ArtifactEventCard: React.FC<ArtifactEventCardProps> = ({
  event,
  onOpen,
  onCta,
}) => {
  const { token } = theme.useToken();
  const ctaLabel = event.ctaLabel ?? 'Mở tài liệu';
  const isDraft = event.status === 'draft';

  return (
    <Card
      size="small"
      data-testid="ai-artifact-event-card"
      data-artifact-id={event.id}
      style={{ marginBottom: 8, background: token.colorFillAlter }}
      styles={{ body: { padding: 8 } }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <FileTextOutlined style={{ color: token.colorPrimary }} />
        <Typography.Text strong style={{ fontSize: 14 }}>
          {event.title}
        </Typography.Text>
        <Tag color={isDraft ? 'default' : 'success'} style={{ margin: 0, fontSize: 12 }}>
          {isDraft ? 'Bản nháp' : `Đã duyệt (v${event.version})`}
        </Tag>
        <Tag style={{ margin: 0, fontSize: 12 }}>{`v${event.version}`}</Tag>
        <Tag style={{ margin: 0, fontSize: 12 }}>{event.kind}</Tag>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Button size="small" onClick={() => onOpen(event.id)}>
            Xem chi tiết
          </Button>
          <Tooltip
            title={event.readOnly ? 'Phiên bản đã đóng hoặc không còn hiệu lực' : ''}
          >
            <Button
              size="small"
              type="primary"
              disabled={event.readOnly === true}
              onClick={() => onCta?.(event.id)}
            >
              {ctaLabel}
            </Button>
          </Tooltip>
        </div>
      </div>
    </Card>
  );
};

export default ArtifactEventCard;
