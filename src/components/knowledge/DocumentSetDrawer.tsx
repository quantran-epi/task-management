import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  CloudOutlined,
  EditOutlined,
  LeftOutlined,
  LoadingOutlined,
  PlusOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { Alert, Button, Drawer, Empty, List, Skeleton, Space, Tag, Tooltip, Typography, theme } from 'antd';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '../../db';
import type { DocumentSet, Note, PublishAttemptCache, PublishPrimaryState } from '../../types/models';
import { AttemptHistoryList } from './AttemptHistoryList';
import { DocumentSetForm, type DocumentSetFormValue } from './DocumentSetForm';

const { Text, Title } = Typography;

const STATE_UI = {
  'Never published': { label: 'Chưa xuất bản', icon: <CloudOutlined />, color: 'default' },
  'In sync': { label: 'Đã đồng bộ', icon: <CheckCircleOutlined />, color: 'success' },
  'Local changes': { label: 'Có thay đổi cục bộ', icon: <EditOutlined />, color: 'processing' },
  Publishing: { label: 'Đang xuất bản', icon: <LoadingOutlined spin />, color: 'processing' },
  Warning: { label: 'Cảnh báo', icon: <WarningOutlined />, color: 'warning' },
  Failed: { label: 'Thất bại', icon: <CloseCircleOutlined />, color: 'error' },
} as const;

export function publishStateLabel(state: PublishPrimaryState): string {
  return STATE_UI[state].label;
}

export interface DocumentSetDrawerProps {
  open: boolean;
  sets?: readonly DocumentSet[];
  notes?: readonly Note[];
  attempts?: readonly PublishAttemptCache[];
  selectedSetId?: string;
  state?: PublishPrimaryState;
  activeSetId?: string;
  activeSummary?: string;
  cachedAt?: string;
  offline?: boolean;
  configured: boolean;
  loading?: boolean;
  currentFolderId?: string;
  creating?: boolean;
  onClose: () => void;
  onSave: (setId: string | undefined, value: DocumentSetFormValue) => void | Promise<void>;
  onPreview: (set: DocumentSet) => void;
  onCreate?: () => void;
  onCancelCreate?: () => void;
  onOpenSettings?: () => void;
}

export function DocumentSetDrawer(props: DocumentSetDrawerProps) {
  const { token } = theme.useToken();
  const queriedSets = useLiveQuery(() => db.documentSets.toArray(), []);
  const queriedNotes = useLiveQuery(() => db.notes.toArray(), []);
  const queriedAttempts = useLiveQuery(() => db.publishAttempts.toArray(), []);
  const liveSets = props.sets ? [...props.sets] : queriedSets;
  const liveNotes = props.notes ? [...props.notes] : queriedNotes;
  const liveAttempts = props.attempts ? [...props.attempts] : queriedAttempts;
  const [internalSelectedId, setInternalSelectedId] = useState<string>();
  const [internalCreating, setInternalCreating] = useState(false);
  const isCreating = props.creating ?? internalCreating;

  const handleCreate = () => {
    setInternalSelectedId(undefined);
    if (props.onCreate) {
      props.onCreate();
    } else {
      setInternalCreating(true);
    }
  };

  const handleCancelCreate = () => {
    if (props.onCancelCreate) {
      props.onCancelCreate();
    } else {
      setInternalCreating(false);
    }
  };

  const selectedId = props.selectedSetId ?? internalSelectedId;
  const selected = !isCreating ? liveSets?.find((set) => set.id === selectedId) : undefined;
  const state = props.state ?? 'Never published';
  const stateUi = STATE_UI[state];
  const previewDisabled = !selected?.documentIds.length || !props.configured || props.activeSetId === selected?.id || state === 'Publishing';

  return (
    <Drawer
      open={props.open}
      onClose={props.onClose}
      width={520}
      styles={{ body: { background: token.colorBgContainer, padding: token.padding } }}
      title={isCreating ? 'Tạo bộ tài liệu mới' : 'Bộ tài liệu xuất bản'}
      extra={!isCreating ? <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>Tạo bộ tài liệu</Button> : null}
    >
      <Text type="secondary">
        {isCreating
          ? 'Tạo nhóm tài liệu từ thư mục hiện tại hoặc chọn thủ công để chuẩn bị xuất bản.'
          : 'Quản lý nhóm tài liệu gửi thủ công đến Knowledge Server.'}
      </Text>
      <div style={{ marginTop: token.margin }}>
        {props.loading || !liveSets || !liveNotes || !liveAttempts ? (
          <Skeleton active />
        ) : isCreating ? (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <Button type="text" icon={<LeftOutlined />} onClick={handleCancelCreate}>
              Hủy tạo / Quay lại danh sách
            </Button>
            <DocumentSetForm
              notes={liveNotes}
              {...(props.currentFolderId ? { currentFolderId: props.currentFolderId } : {})}
              onSave={async (value) => {
                await props.onSave(undefined, value);
                handleCancelCreate();
              }}
            />
          </Space>
        ) : !selected ? (
          liveSets.length === 0 ? (
            <Empty
              description={
                <Space direction="vertical">
                  <Title level={3}>Chưa có bộ tài liệu</Title>
                  <Text>Tạo một bộ từ thư mục hiện tại hoặc chọn tài liệu thủ công để xuất bản lên Knowledge Server.</Text>
                  <Button type="primary" onClick={handleCreate}>Tạo bộ tài liệu</Button>
                </Space>
              }
            />
          ) : (
            <List
              dataSource={liveSets}
              renderItem={(set) => (
                <List.Item actions={[<Button key="open" onClick={() => setInternalSelectedId(set.id)}>Mở chi tiết</Button>]}>
                  <List.Item.Meta title={<Tooltip title={set.name}>{set.name}</Tooltip>} description={`${set.documentIds.length} tài liệu`} />
                  <Tag icon={STATE_UI['Never published'].icon}>{STATE_UI['Never published'].label}</Tag>
                </List.Item>
              )}
            />
          )
        ) : (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <Button type="text" icon={<LeftOutlined />} onClick={() => setInternalSelectedId(undefined)}>Danh sách bộ tài liệu</Button>
            <Space wrap>
              <Tooltip title={stateUi.label}><Tag color={stateUi.color} icon={stateUi.icon}>{stateUi.label}</Tag></Tooltip>
              {props.activeSummary && <Text>{props.activeSummary}</Text>}
            </Space>
            {props.offline && props.cachedAt && <Alert type="warning" showIcon message={`Dữ liệu trạng thái gần nhất: ${props.cachedAt}`} description="Không thể tải trạng thái từ Knowledge Server. Bạn vẫn có thể chỉnh sửa và tìm kiếm tài liệu cục bộ. Kiểm tra kết nối rồi thử lại." />}
            {!props.configured && <Alert type="info" showIcon message="Chưa cấu hình Knowledge Server." action={<Button onClick={props.onOpenSettings}>Mở cài đặt</Button>} />}
            <DocumentSetForm
              notes={liveNotes}
              initialSet={selected}
              {...(props.currentFolderId ? { currentFolderId: props.currentFolderId } : {})}
              onSave={(value) => props.onSave(selected.id, value)}
            />
            <Button aria-label="Xem trước xuất bản" type="primary" disabled={previewDisabled} onClick={() => props.onPreview(selected)}>Xem trước xuất bản</Button>
            <section aria-labelledby="attempt-history-heading">
              <Title level={3} id="attempt-history-heading">Lịch sử xuất bản</Title>
              <AttemptHistoryList attempts={liveAttempts.filter((attempt) => attempt.setId === selected.id)} />
            </section>
          </Space>
        )}
      </div>
    </Drawer>
  );
}
