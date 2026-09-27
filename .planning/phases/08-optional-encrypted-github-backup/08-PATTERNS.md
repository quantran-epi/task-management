# Phase 8: Optional Encrypted GitHub Backup - Pattern Map

**Mapped:** 2026-09-27
**Files analyzed:** 18 (15 new, 3 modified)
**Analogs found:** 18 / 18

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/context/GitHubAuthContext.tsx` | provider | event-driven | `src/context/FormGuardContext.tsx` | exact |
| `src/services/crypto/types.ts` | model | transform | `src/types/backup.ts` | exact |
| `src/services/crypto/base64.ts` | utility | transform | `src/utils/time.ts` | role-match |
| `src/services/crypto/webCrypto.ts` | service | transform | `src/services/backup/exportBackup.ts` | role-match |
| `src/services/crypto/index.ts` | utility | request-response | `src/services/backup/index.ts` | exact |
| `src/services/github/types.ts` | model | transform | `src/types/backup.ts` | exact |
| `src/services/github/githubApi.ts` | service | request-response | `src/services/storage/storagePersistence.ts` | role-match |
| `src/services/github/githubSyncService.ts` | service | batch | `src/services/backup/restoreBackup.ts` | exact |
| `src/services/github/index.ts` | utility | request-response | `src/services/backup/index.ts` | exact |
| `src/components/settings/GitHubConfigCard.tsx` | component | CRUD | `src/components/settings/BackupExportCard.tsx` | exact |
| `src/components/settings/GitHubSyncCard.tsx` | component | request-response | `src/components/settings/BackupExportCard.tsx` | exact |
| `src/components/settings/GitHubConflictModal.tsx` | component | request-response | `src/components/settings/ImportPreviewModal.tsx` | exact |
| `src/components/settings/GitHubPassphraseModal.tsx` | component | request-response | `src/components/settings/ImportPreviewModal.tsx` | exact |
| `src/types/models.ts` | model | CRUD | `src/types/models.ts` | exact |
| `src/views/SettingsView.tsx` | component | CRUD | `src/views/SettingsView.tsx` | exact |
| `src/components/shell/AppShell.tsx` | component | event-driven | `src/components/shell/AppShell.tsx` | exact |
| `tests/services/crypto/webCrypto.test.ts` | test | transform | `tests/services/backup/exportBackup.test.ts` | exact |
| `tests/services/github/githubApi.test.ts` | test | request-response | `tests/services/backup/restoreFailure.test.ts` | role-match |

---

## Pattern Assignments

### `src/context/GitHubAuthContext.tsx` (provider, event-driven)

**Analog:** `src/context/FormGuardContext.tsx`

**Imports pattern** (`src/context/FormGuardContext.tsx:1`):
```typescript
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
```

**Context & Provider pattern** (`src/context/FormGuardContext.tsx:9-48`):
```typescript
export interface GitHubAuthContextType {
  token: string | null;
  passphrase: string | null;
  setCredentials: (token: string, passphrase?: string) => void;
  setPassphrase: (passphrase: string) => void;
  clearSession: () => void;
  hasToken: boolean;
  hasPassphrase: boolean;
}

const GitHubAuthContext = createContext<GitHubAuthContextType | undefined>(undefined);

export const GitHubAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState<string | null>(null);

  const clearSession = useCallback(() => {
    setToken(null);
    setPassphrase(null);
  }, []);

  const value = useMemo<GitHubAuthContextType>(
    () => ({
      token,
      passphrase,
      setCredentials: (t: string, p?: string) => {
        setToken(t.trim());
        if (p !== undefined) setPassphrase(p);
      },
      setPassphrase: (p: string) => setPassphrase(p),
      clearSession,
      hasToken: Boolean(token),
      hasPassphrase: Boolean(passphrase),
    }),
    [token, passphrase, clearSession]
  );

  return <GitHubAuthContext.Provider value={value}>{children}</GitHubAuthContext.Provider>;
};
```

**Hook & Fallback pattern** (`src/context/FormGuardContext.tsx:50-61`):
```typescript
export function useGitHubAuth(): GitHubAuthContextType {
  const context = useContext(GitHubAuthContext);
  if (!context) {
    return {
      token: null,
      passphrase: null,
      setCredentials: () => {},
      setPassphrase: () => {},
      clearSession: () => {},
      hasToken: false,
      hasPassphrase: false,
    };
  }
  return context;
}
```

---

### `src/services/crypto/webCrypto.ts` (service, transform)

**Analog:** `src/services/backup/exportBackup.ts`

**Imports pattern** (`src/services/backup/exportBackup.ts:1-5`):
```typescript
import { bytesToBase64, base64ToBytes } from './base64';
import type { EncryptedEnvelope } from './types';
```

**Constants and Core Derivation Pattern**:
```typescript
export const PBKDF2_ITERATIONS = 600000;
export const SALT_BYTE_LENGTH = 16;
export const IV_BYTE_LENGTH = 12; // 96-bit standard for AES-GCM

export async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}
```

**Core Transform pattern (Encrypt & Decrypt)**:
```typescript
export async function encryptPayload(
  payloadJson: string,
  passphrase: string
): Promise<EncryptedEnvelope> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTE_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTE_LENGTH));
  const key = await deriveKey(passphrase, salt);

  const enc = new TextEncoder();
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(payloadJson)
  );

  return {
    app: 'personal-task-planner',
    format: 'encrypted-v1',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    crypto: {
      algorithm: 'AES-GCM',
      keyLength: 256,
      kdf: 'PBKDF2',
      kdfParams: {
        hash: 'SHA-256',
        iterations: PBKDF2_ITERATIONS,
        salt: bytesToBase64(salt),
      },
      iv: bytesToBase64(iv),
    },
    ciphertext: bytesToBase64(new Uint8Array(ciphertextBuffer)),
  };
}

export async function decryptPayload(
  envelope: EncryptedEnvelope,
  passphrase: string
): Promise<string> {
  if (envelope.app !== 'personal-task-planner' || envelope.format !== 'encrypted-v1') {
    throw new Error('Định dạng tệp mã hóa không hợp lệ');
  }

  const salt = base64ToBytes(envelope.crypto.kdfParams.salt);
  const iv = base64ToBytes(envelope.crypto.iv);
  const ciphertext = base64ToBytes(envelope.ciphertext);

  const key = await deriveKey(passphrase, salt);

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(decryptedBuffer);
}
```

---

### `src/services/github/githubApi.ts` (service, request-response)

**Analog:** `src/services/storage/storagePersistence.ts`

**Imports and Interface pattern** (`src/services/storage/storagePersistence.ts:1-6`):
```typescript
export interface GitHubConfig {
  owner: string;
  repo: string;
  branch: string;
}

export interface RemoteFileMetadata {
  exists: boolean;
  sha?: string;
  size?: number;
  contentBase64?: string;
}

export const BACKUP_FILE_PATH = '.task-management/backup.enc.json';
```

**Request-Response pattern with Fetch & Error Handling**:
```typescript
export async function fetchRemoteBackupMetadata(
  config: GitHubConfig,
  token: string
): Promise<RemoteFileMetadata> {
  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${BACKUP_FILE_PATH}?ref=${config.branch}`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github.v3+json',
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 404) {
    return { exists: false };
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.message || `Lỗi GitHub API: HTTP ${response.status}`);
  }

  const data = await response.json();
  return {
    exists: true,
    sha: data.sha,
    size: data.size,
    contentBase64: data.content,
  };
}

export async function uploadEncryptedBackup(
  config: GitHubConfig,
  token: string,
  contentBase64: string,
  remoteSha?: string,
  message: string = 'chore: update encrypted task planner backup [skip ci]'
): Promise<{ sha: string; commitSha: string }> {
  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${BACKUP_FILE_PATH}`;
  const body: Record<string, unknown> = {
    message,
    content: contentBase64,
    branch: config.branch,
  };
  if (remoteSha) {
    body.sha = remoteSha;
  }

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Accept: 'application/vnd.github.v3+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (response.status === 409) {
    throw new Error('CONFLICT_409');
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.message || `Tải lên thất bại: HTTP ${response.status}`);
  }

  const result = await response.json();
  return {
    sha: result.content.sha,
    commitSha: result.commit.sha,
  };
}
```

---

### `src/components/settings/GitHubConflictModal.tsx` (component, request-response)

**Analog:** `src/components/settings/ImportPreviewModal.tsx`

**Imports pattern** (`src/components/settings/ImportPreviewModal.tsx:1-12`):
```typescript
import React, { useState } from 'react';
import { Modal, Input, Typography, Alert, Space, Button } from 'antd';
import { WarningOutlined } from '@ant-design/icons';
import { announceToScreenReader } from '../common/AriaLiveRegion';

const { Text, Paragraph } = Typography;
```

**Guarded Keyword Input & Action pattern** (`src/components/settings/ImportPreviewModal.tsx:313-324`):
```typescript
export interface GitHubConflictModalProps {
  open: boolean;
  remoteSha?: string;
  localSha?: string;
  onPullAndPreview: () => void;
  onForceOverwrite: () => void;
  onCancel: () => void;
}

export const GitHubConflictModal: React.FC<GitHubConflictModalProps> = ({
  open,
  remoteSha,
  localSha,
  onPullAndPreview,
  onForceOverwrite,
  onCancel,
}) => {
  const [confirmKeyword, setConfirmKeyword] = useState('');

  const isOverwriteUnlocked = confirmKeyword === 'OVERWRITE';

  return (
    <Modal
      open={open}
      title={
        <Space>
          <WarningOutlined style={{ color: '#faad14' }} />
          <span>Xung đột bản sao lưu từ xa</span>
        </Space>
      }
      onCancel={() => {
        setConfirmKeyword('');
        onCancel();
      }}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          Hủy bỏ
        </Button>,
        <Button key="pull" type="primary" onClick={onPullAndPreview}>
          Tải và xem trước bản remote
        </Button>,
        <Button
          key="overwrite"
          danger
          disabled={!isOverwriteUnlocked}
          onClick={() => {
            setConfirmKeyword('');
            onForceOverwrite();
          }}
        >
          Ghi đè bản remote bằng dữ liệu máy này
        </Button>,
      ]}
    >
      <Alert
        type="warning"
        showIcon
        message="Bản sao lưu trên GitHub đã thay đổi kể từ lần đồng bộ trước"
        description={`SHA trên GitHub: ${remoteSha?.slice(0, 7) || 'N/A'} | SHA ghi nhận tại máy: ${localSha?.slice(0, 7) || 'Chưa có'}`}
        style={{ marginBottom: 16 }}
      />
      <Paragraph>
        Bạn có thể tải bản từ xa về để xem trước sự khác biệt, hoặc ghi đè bản trên GitHub bằng dữ liệu hiện tại trên thiết bị này.
      </Paragraph>
      <div style={{ marginTop: 16 }}>
        <Paragraph>
          Để ghi đè bắt buộc, nhập chính xác từ khóa <Text code strong>OVERWRITE</Text> bên dưới:
        </Paragraph>
        <Input
          value={confirmKeyword}
          onChange={(e) => setConfirmKeyword(e.target.value)}
          placeholder="OVERWRITE"
          aria-label="Xác nhận từ khóa OVERWRITE"
        />
      </div>
    </Modal>
  );
};
```

---

### `src/components/settings/GitHubConfigCard.tsx` (component, CRUD)

**Analog:** `src/components/settings/BackupExportCard.tsx`

**Imports & Live Query pattern** (`src/components/settings/BackupExportCard.tsx:1-12`):
```typescript
import React, { useState, useEffect } from 'react';
import { Card, Button, Form, Input, Space, notification, Typography } from 'antd';
import { GithubOutlined, CheckCircleOutlined, ClearOutlined, SaveOutlined } from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { useGitHubAuth } from '../../context/GitHubAuthContext';
import { testGitHubConnection } from '../../services/github/githubApi';
import { announceToScreenReader } from '../common/AriaLiveRegion';
```

**Database Settings Read/Write & Form Pattern**:
```typescript
// Reads non-sensitive repo coordinates from IndexedDB
const repoSettings = useLiveQuery(async () => {
  const [owner, repo, branch] = await Promise.all([
    db.settings.get('github_owner'),
    db.settings.get('github_repo'),
    db.settings.get('github_branch'),
  ]);
  return {
    owner: (owner?.value as string) || '',
    repo: (repo?.value as string) || '',
    branch: (branch?.value as string) || 'main',
  };
}, [db]);

const handleSaveRepoConfig = async (values: { owner: string; repo: string; branch: string }) => {
  await db.transaction('rw', db.settings, async () => {
    await db.settings.put({ key: 'github_owner', value: values.owner.trim() });
    await db.settings.put({ key: 'github_repo', value: values.repo.trim() });
    await db.settings.put({ key: 'github_branch', value: values.branch.trim() || 'main' });
  });
  notification.success({ message: 'Đã lưu cấu hình kho lưu trữ' });
  announceToScreenReader('Đã lưu cấu hình kho lưu trữ GitHub');
};
```

---

### `src/components/settings/GitHubSyncCard.tsx` (component, request-response)

**Analog:** `src/components/settings/BackupExportCard.tsx`

**Imports & Status Tag pattern**:
```typescript
import React, { useState } from 'react';
import { Card, Button, Space, Tag, Typography, notification } from 'antd';
import { CloudUploadOutlined, CloudDownloadOutlined, GithubOutlined } from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import dayjs from 'dayjs';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { useGitHubAuth } from '../../context/GitHubAuthContext';
import { announceToScreenReader } from '../common/AriaLiveRegion';
```

**Sync Actions & Metadata Display Pattern** (`src/components/settings/BackupExportCard.tsx:23-53`):
```typescript
// Query last synced info from db.settings
const syncMetadata = useLiveQuery(async () => {
  const [sha, lastAt] = await Promise.all([
    db.settings.get('last_synced_sha'),
    db.settings.get('last_synced_at'),
  ]);
  return {
    sha: sha?.value as string | undefined,
    lastAt: lastAt?.value as string | undefined,
  };
}, [db]);
```

---

## Shared Patterns

### 1. In-Memory Session-Only Secret Isolation
**Source:** `src/context/FormGuardContext.tsx`
**Apply to:** `src/context/GitHubAuthContext.tsx`, `GitHubConfigCard.tsx`, `GitHubSyncCard.tsx`
- Secrets (token, passphrase) are stored exclusively in React `useState` inside `GitHubAuthProvider`.
- Never passed into `db.settings.put`, `localStorage`, `sessionStorage`, cookies, URL parameters, or `console.log`.
- `clearSession()` sets both to `null`.
- Window reload/unload naturally purges secrets.

### 2. Guarded Keyword Confirmation
**Source:** `src/components/settings/ImportPreviewModal.tsx:313-324`
**Apply to:** `GitHubConflictModal.tsx` (`OVERWRITE`), `ImportPreviewModal.tsx` (`RESTORE`), `ResetDbModal.tsx` (`DELETE`)
```typescript
const isUnlocked = confirmKeyword === EXPECTED_KEYWORD;

<Input
  value={confirmKeyword}
  onChange={(e) => setConfirmKeyword(e.target.value)}
  placeholder={EXPECTED_KEYWORD}
  aria-label={`Xác nhận từ khóa ${EXPECTED_KEYWORD}`}
/>
<Button danger disabled={!isUnlocked} onClick={handleAction}>
  {actionLabel}
</Button>
```

### 3. Screen Reader Announcements
**Source:** `src/components/common/AriaLiveRegion.tsx`
**Apply to:** All settings cards and modal completions
```typescript
import { announceToScreenReader } from '../common/AriaLiveRegion';

// Usage:
announceToScreenReader('Đang kết nối với GitHub...');
announceToScreenReader('Đã tải lên bản sao lưu mã hóa thành công');
```

### 4. Dexie Settings Persistence Pattern
**Source:** `src/components/settings/StoragePersistenceCard.tsx` and `src/views/SettingsView.tsx`
**Apply to:** `GitHubConfigCard.tsx`, `githubSyncService.ts`
```typescript
// Saving non-sensitive metadata to settings
await db.settings.put({ key: 'github_owner', value: owner });
await db.settings.put({ key: 'last_synced_sha', value: sha });
await db.settings.put({ key: 'last_synced_at', value: new Date().toISOString() });

// Reactive read
const value = useLiveQuery(() => db.settings.get(key), [db, key]);
```

### 5. Binary-Safe Base64 Conversion
**Source:** `src/services/crypto/base64.ts`
**Apply to:** Web Crypto salt/IV/ciphertext transport and GitHub Contents API Base64 payloads
```typescript
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const cleanBase64 = base64.replace(/\s+/g, '');
  const binary = atob(cleanBase64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
```

---

## No Analog Found

All 18 planned files have clear analogs within the existing codebase. The Web Crypto and GitHub API modules represent new domain capabilities, but their architectural roles (pure service, typed model, React provider, modal with keyword confirmation, card with reactive query) map 1:1 to established codebase patterns.

---

## Metadata

**Analog search scope:** `src/`, `tests/`
**Files scanned:** 38
**Pattern extraction date:** 2026-09-27
