# Phase 07: PWA Offline Capability & Lifecycle Hardening - Pattern Map

**Mapped:** 2026-09-27  
**Files analyzed:** 18  
**Analogs found:** 18 / 18  

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `vite.config.ts` | config | file-I/O | `vite.config.ts` | exact |
| `index.html` | config | file-I/O | `index.html` | exact |
| `src/types/virtual-pwa.d.ts` | config/type | transform | `src/types/navigation.ts` | exact |
| `src/context/FormGuardContext.tsx` | provider | event-driven | `src/components/common/AriaLiveRegion.tsx` | role-match |
| `src/hooks/useNetworkStatus.ts` | hook | event-driven | `src/hooks/useNetworkStatus.ts` | exact |
| `src/hooks/usePWAInstall.ts` | hook | event-driven | `src/hooks/useNetworkStatus.ts` | exact |
| `src/hooks/useServiceWorkerUpdate.ts` | hook | event-driven | `src/hooks/useNetworkStatus.ts` | exact |
| `src/hooks/useStoragePersistence.ts` | hook | request-response | `src/hooks/useNetworkStatus.ts` | role-match |
| `src/components/pwa/UpdateBanner.tsx` | component | event-driven | `src/components/settings/PostRestoreBanner.tsx` | exact |
| `src/components/pwa/ActiveFormGuardModal.tsx` | component | request-response | `src/components/shell/UpgradeModal.tsx` | exact |
| `src/components/pwa/InstallButton.tsx` | component | request-response | `src/components/shell/StatusBadge.tsx` | exact |
| `src/components/pwa/IosInstallModal.tsx` | component | request-response | `src/components/shell/UpgradeModal.tsx` | exact |
| `src/components/settings/PwaStatusCard.tsx` | component | request-response | `src/components/settings/SnapshotRollbackCard.tsx` | exact |
| `src/components/settings/StoragePersistenceCard.tsx` | component | request-response | `src/components/settings/SnapshotRollbackCard.tsx` | exact |
| `src/components/shell/AppShell.tsx` | component | request-response | `src/components/shell/AppShell.tsx` | exact |
| `src/views/SettingsView.tsx` | component | CRUD | `src/views/SettingsView.tsx` | exact |
| `src/main.tsx` | config | batch | `src/main.tsx` | exact |
| `tests/components/pwa/UpdateBanner.test.tsx` | test | event-driven | `tests/components/settings/BackupExportCard.test.tsx` | exact |

---

## Pattern Assignments

### `src/hooks/usePWAInstall.ts` & `src/hooks/useServiceWorkerUpdate.ts` (hook, event-driven)

**Analog:** `src/hooks/useNetworkStatus.ts`

**Imports & Hook State Pattern** (lines 1-13):
```typescript
import { useState, useEffect } from 'react';

export function useNetworkStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
      return navigator.onLine;
    }
    return true;
  });
```

**Window Event Subscription & Cleanup Pattern** (lines 14-28):
```typescript
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
```

---

### `src/context/FormGuardContext.tsx` (provider, event-driven)

**Analog:** `src/components/common/AriaLiveRegion.tsx`

**Observer Registration & Set Storage Pattern** (lines 3-11):
```typescript
type Listener = (msg: string) => void;
const listeners = new Set<Listener>();

export function announceToScreenReader(message: string): void {
  listeners.forEach((fn) => fn(message));
}
```

**Context Hook / State Distribution Pattern** (lines 18-30):
```typescript
export const AriaLiveRegion: React.FC = () => {
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    const handler: Listener = (msg) => {
      setAnnouncement(msg);
    };
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);
```

---

### `src/components/pwa/UpdateBanner.tsx` (component, event-driven)

**Analog:** `src/components/settings/PostRestoreBanner.tsx`

**Banner Presentation & Action Button Pattern** (lines 11-49):
```typescript
export const PostRestoreBanner: React.FC<PostRestoreBannerProps> = ({
  onRollback,
  onDownloadSnapshot,
  onClose,
}) => {
  return (
    <Alert
      type="success"
      showIcon
      icon={<CheckCircleOutlined />}
      closable
      {...(onClose ? { onClose } : {})}
      style={{ marginBottom: 16 }}
      message="Khôi phục dữ liệu thành công"
      description={
        <div>
          <p style={{ margin: '0 0 8px 0' }}>
            Toàn bộ dữ liệu từ tệp sao lưu đã được áp dụng vào hệ thống.
          </p>
          <Space>
            <Button size="small" danger onClick={onRollback}>
              Hoàn tác về bản trước đó
            </Button>
            <Button size="small" onClick={onDownloadSnapshot}>
              Tải snapshot về máy
            </Button>
          </Space>
        </div>
      }
    />
  );
};
```

---

### `src/components/pwa/ActiveFormGuardModal.tsx` & `src/components/pwa/IosInstallModal.tsx` (component, request-response)

**Analog:** `src/components/shell/UpgradeModal.tsx`

**Modal Alert & Lifecycle Pattern** (lines 21-42):
```typescript
  return (
    <Modal
      title="Nâng cấp cơ sở dữ liệu bị chặn"
      open={blocked}
      closable={false}
      footer={[
        <Button
          key="reload"
          type="primary"
          onClick={() => window.location.reload()}
        >
          Tải lại trang
        </Button>,
      ]}
    >
      <Alert
        type="warning"
        message="Xung đột tab trình duyệt"
        description="Nâng cấp cơ sở dữ liệu bị chặn bởi một tab khác. Vui lòng đóng các tab khác và tải lại trang."
        showIcon
      />
    </Modal>
  );
```

---

### `src/components/pwa/InstallButton.tsx` (component, request-response)

**Analog:** `src/components/shell/StatusBadge.tsx`

**Badge / Tooltip Header Button Pattern** (lines 5-17):
```typescript
export const StatusBadge: React.FC = () => {
  const isOnline = useNetworkStatus();

  return (
    <Tooltip title={isOnline ? 'Trực tuyến (kết nối IndexedDB)' : 'Ngoại tuyến (dữ liệu lưu cục bộ)'}>
      <Badge
        status={isOnline ? 'success' : 'warning'}
        text={isOnline ? 'Trực tuyến' : 'Ngoại tuyến'}
        style={{ cursor: 'pointer' }}
      />
    </Tooltip>
  );
};
```

---

### `src/components/settings/PwaStatusCard.tsx` & `src/components/settings/StoragePersistenceCard.tsx` (component, request-response)

**Analog:** `src/components/settings/SnapshotRollbackCard.tsx`

**Settings Status Card with Tags & Actions Pattern** (lines 89-145):
```typescript
  return (
    <Card
      title={
        <span>
          <HistoryOutlined style={{ marginRight: 8 }} />
          Bản sao an toàn trước khi nhập (Pre-Import Snapshot)
        </span>
      }
    >
      <Paragraph type="secondary">
        Trước mỗi lần khôi phục dữ liệu từ tệp sao lưu, hệ thống tự động lưu giữ một bản chụp...
      </Paragraph>

      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <div>
          <Text strong>Bản an toàn tự động trước khi nhập:</Text>{' '}
          <Text type="secondary">
            {new Date(snapshotRecord.timestamp).toLocaleString('vi-VN')}
          </Text>
        </div>

        <div>
          <Space wrap>
            <Tag color="blue">Dự án: {snapshotRecord.counts.projects}</Tag>
            <Tag color="cyan">Cột mốc: {snapshotRecord.counts.milestones}</Tag>
          </Space>
        </div>

        <Space wrap style={{ marginTop: 8 }}>
          <Button danger icon={<UndoOutlined />} onClick={handleRollback} loading={loading}>
            Khôi phục từ bản an toàn này
          </Button>
          <Button icon={<DownloadOutlined />} onClick={handleDownload}>
            Tải bản snapshot về máy
          </Button>
        </Space>
      </Space>
    </Card>
  );
```

---

### `src/components/shell/AppShell.tsx` (component, request-response)

**Analog:** `src/components/shell/AppShell.tsx`

**Header Action Group & Modal Mounting Pattern** (lines 60-98):
```typescript
        <Header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 16px',
            background: token.colorBgContainer,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <Space>
            {isMobile && (
              <Button
                icon={<MenuOutlined />}
                onClick={() => setDrawerOpen(true)}
                aria-label="Mở menu"
                style={{ minHeight: 44, minWidth: 44 }}
              />
            )}
            <Title level={4} style={{ margin: 0 }}>
              Task Planner
            </Title>
          </Space>
          <Space size="middle">
            <StatusBadge />
            <Button onClick={() => setResetModalOpen(true)} danger size="small">
              Đặt lại CSDL
            </Button>
          </Space>
        </Header>

        <Content style={{ margin: 16 }}>{children}</Content>
      </Layout>

      <UpgradeModal />
      <ResetDbModal open={resetModalOpen} onClose={() => setResetModalOpen(false)} />
      <AriaLiveRegion />
    </Layout>
```

---

### `src/views/SettingsView.tsx` (component, CRUD)

**Analog:** `src/views/SettingsView.tsx`

**Data Tab Space Direction Vertical Pattern** (lines 111-149):
```typescript
    {
      key: 'data',
      label: (
        <span>
          <DatabaseOutlined style={{ marginRight: 8 }} />
          Sao lưu & Dữ liệu
        </span>
      ),
      children: (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          {showPostRestoreBanner && (
            <PostRestoreBanner
              onRollback={handleBannerRollback}
              onDownloadSnapshot={handleBannerDownload}
              onClose={() => setShowPostRestoreBanner(false)}
            />
          )}

          <BackupExportCard db={db} />
          <BackupImportCard db={db} onRestoreSuccess={handleRestoreSuccess} />
          <SnapshotRollbackCard db={db} />
        </Space>
      ),
    },
```

---

## Shared Patterns

### Accessible Announcements (AriaLiveRegion)
**Source:** `src/components/common/AriaLiveRegion.tsx` (lines 9-11)  
**Apply to:** `useNetworkStatus` transitions, `usePWAInstall` install completion, `StoragePersistenceCard` persistence request feedback.
```typescript
import { announceToScreenReader } from '../common/AriaLiveRegion';

// Usage:
announceToScreenReader('Đang làm việc ngoại tuyến, dữ liệu lưu cục bộ');
announceToScreenReader('Đã kết nối lại mạng');
announceToScreenReader('Ứng dụng đã được cài đặt thành công!');
```

### Ant Design Message Notifications
**Source:** `src/views/SettingsView.tsx` / `src/components/settings/BackupExportCard.tsx`  
**Apply to:** Online/offline toast notifications, update check responses, install success.
```typescript
import { message } from 'antd';

message.warning('Đang làm việc ngoại tuyến, dữ liệu lưu cục bộ');
message.success('Đã kết nối lại mạng');
```

### Testing Ant Design Components & Mocks
**Source:** `tests/components/settings/BackupExportCard.test.tsx` (lines 1-35)  
**Apply to:** All PWA unit/component tests (`InstallButton.test.tsx`, `UpdateBanner.test.tsx`, `PwaStatusCard.test.tsx`, `StoragePersistenceCard.test.tsx`).
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

describe('Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders elements and responds to user interaction', async () => {
    render(<Component />);
    expect(screen.getByText('...')).toBeInTheDocument();
  });
});
```

---

## No Analog Found

All 18 files have direct or close analogs in the existing codebase.

---

## Metadata

**Analog search scope:** `src/hooks/`, `src/components/`, `src/views/`, `src/context/`, `tests/`  
**Files scanned:** 64  
**Pattern extraction date:** 2026-09-27  
