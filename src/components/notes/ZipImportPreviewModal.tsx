import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  Table,
  Button,
  Input,
  Checkbox,
  Radio,
  Select,
  Typography,
  Tag,
  Drawer,
  Alert,
  Spin,
  message,
} from 'antd';
import {
  FileTextOutlined,
  EyeOutlined,
  FolderAddOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import JSZip from 'jszip';
import type { Note } from '../../types/models';
import { renderSafeMarkdown } from '../../utils/markdown';
import { extractMarkdownMetadata } from '../../utils/smartIngestion';

const { Text } = Typography;

export interface ExtractedZipDoc {
  key: string;
  relativePath: string;
  fileName: string;
  detectedTitle: string;
  tags: string[];
  body: string;
  wordCount: number;
  sizeBytes: number;
  selected: boolean;
}

/**
 * Strips common root directory prefix from paths if all items are wrapped inside
 * a single top-level folder (e.g. "my-project/README.md" -> "README.md").
 */
export function stripCommonRootPrefix(relativePaths: string[]): {
  commonPrefix: string;
  strippedPaths: string[];
} {
  if (relativePaths.length === 0) {
    return { commonPrefix: '', strippedPaths: [] };
  }

  const splitPaths = relativePaths.map((p) => p.split('/').filter(Boolean));

  // If any file is directly at the root, there is no single enclosing common directory
  if (splitPaths.some((parts) => parts.length <= 1)) {
    return { commonPrefix: '', strippedPaths: [...relativePaths] };
  }

  const firstDir = splitPaths[0]?.[0];
  if (!firstDir) {
    return { commonPrefix: '', strippedPaths: [...relativePaths] };
  }

  const allShareFirstDir = splitPaths.every((parts) => parts[0] === firstDir);
  if (!allShareFirstDir) {
    return { commonPrefix: '', strippedPaths: [...relativePaths] };
  }

  const prefixWithSlash = `${firstDir}/`;
  const stripped = relativePaths.map((p) =>
    p.startsWith(prefixWithSlash) ? p.slice(prefixWithSlash.length) : p
  );

  return { commonPrefix: firstDir, strippedPaths: stripped };
}

export interface ZipImportPreviewModalProps {
  open: boolean;
  onClose: () => void;
  zipFile: File | null;
  folders: Note[];
  currentFolderId?: string | null;
  onImportDocs: (
    docsToImport: Array<{ title: string; body: string; parentId?: string | undefined; tags?: string[] | undefined }>,
    folderIdToNavigate?: string
  ) => Promise<void>;
  onCreateFolder?: (name: string, parentId?: string) => Promise<Note>;
}

export const ZipImportPreviewModal: React.FC<ZipImportPreviewModalProps> = ({
  open,
  onClose,
  zipFile,
  folders,
  currentFolderId,
  onImportDocs,
  onCreateFolder,
}) => {
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [extractedDocs, setExtractedDocs] = useState<ExtractedZipDoc[]>([]);
  const [previewDoc, setPreviewDoc] = useState<ExtractedZipDoc | null>(null);
  const [searchFilter, setSearchFilter] = useState('');

  // Target folder mode: 'existing' or 'new'
  const [targetMode, setTargetMode] = useState<'existing' | 'new'>('new');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(currentFolderId || null);
  const [newFolderName, setNewFolderName] = useState('');
  const [preserveStructure, setPreserveStructure] = useState(true);

  // Unzip and extract markdown files whenever zipFile changes
  useEffect(() => {
    if (!open || !zipFile) {
      setExtractedDocs([]);
      setPreviewDoc(null);
      return;
    }

    const defaultFolderName = zipFile.name.replace(/\.[^/.]+$/, '').trim();
    setNewFolderName(defaultFolderName || 'Tài liệu nhập từ Zip');
    setSelectedFolderId(currentFolderId || null);

    let isMounted = true;
    setLoading(true);

    const extractZip = async () => {
      try {
        const zip = await JSZip.loadAsync(zipFile);
        const docs: ExtractedZipDoc[] = [];

        const entries: Array<{ relativePath: string; entry: JSZip.JSZipObject }> = [];
        zip.forEach((relativePath, entry) => {
          // Exclude folders, macOS hidden files, non-markdown
          if (
            !entry.dir &&
            !relativePath.includes('__MACOSX') &&
            !relativePath.split('/').some((part) => part.startsWith('.')) &&
            (relativePath.toLowerCase().endsWith('.md') || relativePath.toLowerCase().endsWith('.markdown'))
          ) {
            entries.push({ relativePath, entry });
          }
        });

        // Strip common root folder prefix if all entries are wrapped in one top-level directory
        const rawPaths = entries.map((e) => e.relativePath);
        const { commonPrefix, strippedPaths } = stripCommonRootPrefix(rawPaths);

        // If common prefix exists and default folder name was generic, offer common prefix
        if (commonPrefix && (defaultFolderName.toLowerCase() === 'archive' || !defaultFolderName)) {
          setNewFolderName(commonPrefix);
        }

        // Read all markdown files in parallel
        await Promise.all(
          entries.map(async ({ entry }, idx) => {
            const relativePath = strippedPaths[idx] || entries[idx]!.relativePath;
            const body = await entry.async('string');
            const pathParts = relativePath.split('/');
            const fileName = pathParts[pathParts.length - 1] || 'document.md';

            // Detect title and tags using smart ingestion metadata
            const metadata = extractMarkdownMetadata(body);
            const detectedTitle = metadata.title || fileName.replace(/\.(md|markdown)$/i, '').trim();

            const words = body.trim() ? body.trim().split(/\s+/).length : 0;
            const sizeBytes = new Blob([body]).size;

            docs.push({
              key: `doc-${idx}-${relativePath}`,
              relativePath,
              fileName,
              detectedTitle: detectedTitle || fileName,
              tags: metadata.tags,
              body,
              wordCount: words,
              sizeBytes,
              selected: true,
            });
          })
        );

        // Sort by path
        docs.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

        if (isMounted) {
          setExtractedDocs(docs);
          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to unzip:', err);
        message.error('Không thể đọc file zip. Vui lòng kiểm tra lại định dạng file.');
        if (isMounted) setLoading(false);
      }
    };

    void extractZip();

    return () => {
      isMounted = false;
    };
  }, [open, zipFile, currentFolderId]);

  // Hierarchical folder options with indentation
  const folderTreeOptions = useMemo(() => {
    const map = new Map<string, { note: Note; depth: number; path: string }>();
    const roots: Note[] = [];

    folders.forEach((f) => {
      if (!f.parentId || !folders.some((p) => p.id === f.parentId)) {
        roots.push(f);
      }
    });

    const traverse = (node: Note, depth: number, parentPath: string) => {
      const currentPath = parentPath ? `${parentPath} / ${node.title}` : node.title || 'Không tên';
      map.set(node.id, { note: node, depth, path: currentPath });
      const children = folders.filter((f) => f.parentId === node.id);
      children.forEach((c) => traverse(c, depth + 1, currentPath));
    };

    roots.forEach((r) => traverse(r, 0, ''));

    const options: Array<{ label: string; value: string | null }> = [
      { label: '📁 Thư mục gốc (Root / Inbox)', value: null },
    ];

    map.forEach(({ depth, path }, id) => {
      const indent = '— '.repeat(depth);
      options.push({
        label: `${indent}📁 ${path}`,
        value: id,
      });
    });

    return options;
  }, [folders]);

  // Filtered docs for preview table
  const filteredDocs = useMemo(() => {
    if (!searchFilter.trim()) return extractedDocs;
    const q = searchFilter.trim().toLowerCase();
    return extractedDocs.filter(
      (d) =>
        d.detectedTitle.toLowerCase().includes(q) ||
        d.relativePath.toLowerCase().includes(q) ||
        d.fileName.toLowerCase().includes(q)
    );
  }, [extractedDocs, searchFilter]);

  const selectedCount = extractedDocs.filter((d) => d.selected).length;

  const handleToggleSelectAll = (checked: boolean) => {
    setExtractedDocs((prev) => prev.map((d) => ({ ...d, selected: checked })));
  };

  const handleToggleItem = (key: string, checked: boolean) => {
    setExtractedDocs((prev) =>
      prev.map((d) => (d.key === key ? { ...d, selected: checked } : d))
    );
  };

  const handleTitleChange = (key: string, newTitle: string) => {
    setExtractedDocs((prev) =>
      prev.map((d) => (d.key === key ? { ...d, detectedTitle: newTitle } : d))
    );
  };

  const handleConfirmImport = async () => {
    const docsToImport = extractedDocs.filter((d) => d.selected);
    if (docsToImport.length === 0) {
      message.warning('Vui lòng chọn ít nhất một tài liệu để nhập');
      return;
    }

    setImporting(true);
    try {
      let rootDestinationId = selectedFolderId || undefined;

      // 1. Create top-level folder if 'new' targetMode selected
      if (targetMode === 'new') {
        const name = newFolderName.trim() || 'Tài liệu nhập từ Zip';
        if (onCreateFolder) {
          const createdFolder = await onCreateFolder(name, undefined);
          rootDestinationId = createdFolder.id;
        }
      }

      // 2. Handle nested subfolders if preserveStructure is checked
      const folderPathMap = new Map<string, string>(); // relative dir -> created folder ID
      if (rootDestinationId) {
        folderPathMap.set('', rootDestinationId);
      }

      if (preserveStructure && onCreateFolder) {
        // Find all unique folder paths from relativePaths
        const dirPaths = new Set<string>();
        for (const doc of docsToImport) {
          const parts = doc.relativePath.split('/');
          parts.pop(); // remove fileName
          if (parts.length > 0) {
            let currentAccum = '';
            for (const part of parts) {
              currentAccum = currentAccum ? `${currentAccum}/${part}` : part;
              dirPaths.add(currentAccum);
            }
          }
        }

        // Sort dirPaths by length so parents are created before children
        const sortedDirs = Array.from(dirPaths).sort((a, b) => a.split('/').length - b.split('/').length);

        for (const dir of sortedDirs) {
          const parts = dir.split('/');
          const dirName = parts[parts.length - 1] || 'folder';
          const parentDir = parts.slice(0, -1).join('/');
          const parentFolderId = folderPathMap.get(parentDir) || rootDestinationId;

          const created = await onCreateFolder(dirName, parentFolderId);
          folderPathMap.set(dir, created.id);
        }
      }

      // 3. Prepare payload for batch persistence
      const finalDocs = docsToImport.map((doc) => {
        let parentId = rootDestinationId;
        if (preserveStructure) {
          const parts = doc.relativePath.split('/');
          parts.pop();
          const dir = parts.join('/');
          if (dir && folderPathMap.has(dir)) {
            parentId = folderPathMap.get(dir);
          }
        }

        return {
          title: doc.detectedTitle.trim() || doc.fileName,
          body: doc.body,
          tags: doc.tags,
          ...(parentId ? { parentId } : {}),
        };
      });

      await onImportDocs(finalDocs, rootDestinationId);
      message.success(`Đã nhập thành công ${finalDocs.length} tài liệu!`);
      onClose();
    } catch (err) {
      console.error('Import failed:', err);
      message.error('Nhập tài liệu thất bại. Vui lòng thử lại.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileTextOutlined style={{ color: '#4f46e5' }} />
            <span>Xem trước & Nhập tài liệu từ Zip</span>
            {zipFile && (
              <Tag color="blue" style={{ marginLeft: 6 }}>
                {zipFile.name}
              </Tag>
            )}
          </div>
        }
        open={open}
        onCancel={onClose}
        width={920}
        style={{ top: 24 }}
        footer={[
          <Button key="cancel" onClick={onClose} disabled={importing}>
            Hủy
          </Button>,
          <Button
            key="submit"
            type="primary"
            style={{ backgroundColor: '#4f46e5' }}
            loading={importing}
            disabled={selectedCount === 0 || loading}
            icon={<CheckCircleOutlined />}
            onClick={handleConfirmImport}
          >
            Nhập {selectedCount} tài liệu đã chọn
          </Button>,
        ]}
      >
        {loading ? (
          <div style={{ padding: '60px 0', textAlign: 'center' }}>
            <Spin size="large" />
            <Text type="secondary" style={{ display: 'block', marginTop: 16 }}>
              Đang giải nén và phân tích các tệp Markdown...
            </Text>
          </div>
        ) : extractedDocs.length === 0 ? (
          <div style={{ padding: '40px 0', textAlign: 'center' }}>
            <Alert
              type="warning"
              showIcon
              message="Không tìm thấy tệp Markdown"
              description="File zip không chứa tệp .md hoặc .markdown hợp lệ."
            />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Top configuration box: target destination folder */}
            <div
              style={{
                padding: '12px 14px',
                backgroundColor: '#f8fafc',
                borderRadius: 8,
                border: '1px solid #e2e8f0',
              }}
            >
              <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>
                Vị trí lưu trữ tài liệu:
              </Text>
              <Radio.Group
                value={targetMode}
                onChange={(e) => setTargetMode(e.target.value)}
                style={{ marginBottom: 10 }}
              >
                <Radio value="new">Tạo thư mục mới gom tất cả tài liệu</Radio>
                <Radio value="existing">Lưu vào thư mục hiện có</Radio>
              </Radio.Group>

              {targetMode === 'new' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, maxWidth: 420 }}>
                  <Input
                    prefix={<FolderAddOutlined style={{ color: '#4f46e5' }} />}
                    placeholder="Tên thư mục mới..."
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                  />
                </div>
              ) : (
                <div style={{ maxWidth: 420 }}>
                  <Select
                    style={{ width: '100%' }}
                    value={selectedFolderId}
                    onChange={(val) => setSelectedFolderId(val)}
                    options={folderTreeOptions}
                  />
                </div>
              )}

              <div style={{ marginTop: 10 }}>
                <Checkbox
                  checked={preserveStructure}
                  onChange={(e) => setPreserveStructure(e.target.checked)}
                >
                  Tự động tái tạo cấu trúc thư mục con từ đường dẫn trong file zip
                </Checkbox>
              </div>
            </div>

            {/* Filter and summary toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Checkbox
                  indeterminate={selectedCount > 0 && selectedCount < extractedDocs.length}
                  checked={selectedCount === extractedDocs.length && extractedDocs.length > 0}
                  onChange={(e) => handleToggleSelectAll(e.target.checked)}
                >
                  Chọn tất cả ({selectedCount}/{extractedDocs.length})
                </Checkbox>
              </div>
              <Input.Search
                placeholder="Tìm theo tên file hoặc tiêu đề..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                allowClear
                style={{ width: 280 }}
              />
            </div>

            {/* Documents Table */}
            <Table
              dataSource={filteredDocs}
              size="small"
              pagination={{ pageSize: 8, showSizeChanger: false }}
              scroll={{ y: 320 }}
              columns={[
                {
                  title: '',
                  dataIndex: 'selected',
                  key: 'selected',
                  width: 44,
                  render: (_: unknown, record: ExtractedZipDoc) => (
                    <Checkbox
                      checked={record.selected}
                      onChange={(e) => handleToggleItem(record.key, e.target.checked)}
                    />
                  ),
                },
                {
                  title: 'Tiêu đề tài liệu',
                  dataIndex: 'detectedTitle',
                  key: 'detectedTitle',
                  render: (val: string, record: ExtractedZipDoc) => (
                    <Input
                      value={val}
                      size="small"
                      onChange={(e) => handleTitleChange(record.key, e.target.value)}
                      style={{ fontWeight: 500 }}
                    />
                  ),
                },
                {
                  title: 'Đường dẫn trong zip',
                  dataIndex: 'relativePath',
                  key: 'relativePath',
                  width: 240,
                  render: (path: string) => (
                    <Text type="secondary" style={{ fontSize: 12 }} ellipsis={{ tooltip: path }}>
                      {path}
                    </Text>
                  ),
                },
                {
                  title: 'Kích thước',
                  key: 'size',
                  width: 110,
                  render: (_: unknown, record: ExtractedZipDoc) => (
                    <span style={{ fontSize: 12, color: '#64748b' }}>
                      {record.wordCount} từ ({Math.round(record.sizeBytes / 1024 * 10) / 10} KB)
                    </span>
                  ),
                },
                {
                  title: 'Xem',
                  key: 'action',
                  width: 60,
                  align: 'center',
                  render: (_: unknown, record: ExtractedZipDoc) => (
                    <Button
                      type="text"
                      size="small"
                      icon={<EyeOutlined />}
                      onClick={() => setPreviewDoc(record)}
                      title="Xem nội dung markdown"
                    />
                  ),
                },
              ]}
            />
          </div>
        )}
      </Modal>

      {/* Markdown Content Preview Drawer */}
      <Drawer
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <FileTextOutlined style={{ color: '#4f46e5' }} />
            <span>{previewDoc?.detectedTitle || previewDoc?.fileName}</span>
          </div>
        }
        open={Boolean(previewDoc)}
        onClose={() => setPreviewDoc(null)}
        width={560}
      >
        {previewDoc && (
          <div>
            <div style={{ marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #f0f0f0' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Đường dẫn: {previewDoc.relativePath} • {previewDoc.wordCount} từ
              </Text>
            </div>
            <div
              className="markdown-preview-content"
              style={{ fontSize: 14, lineHeight: 1.6 }}
              dangerouslySetInnerHTML={{
                __html: renderSafeMarkdown(previewDoc.body),
              }}
            />
          </div>
        )}
      </Drawer>
    </>
  );
};
