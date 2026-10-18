import React, { useState, useMemo, useRef, useEffect } from 'react';
import { APP_NAME } from '../constants/app';
import {
  Button,
  Space,
  Typography,
  Empty,
  Tooltip,
  message,
  Modal,
  Select,
  Input,
} from 'antd';
import {
  PlusOutlined,
  ExportOutlined,
  RobotOutlined,
  CopyOutlined,
  DatabaseOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import type { Note, DocumentSet, PublishPrimaryState } from '../types/models';
import {
  updateNote,
  createNote,
  softDeleteNote,
  permanentDeleteNote,
  restoreNote,
  batchCreateNotes,
  bulkPermanentDeleteNotes,
} from '../db/repositories/noteRepo';
import { getBacklinksForDoc } from '../db/repositories/documentLinkRepo';
import { PageHeader } from '../components/common/PageHeader';
import { openNotesPopout } from '../utils/notesPopout';
import { DocumentSetDrawer } from '../components/knowledge/DocumentSetDrawer';
import { PublishPreviewModal } from '../components/knowledge/PublishPreviewModal';
import { formatOversizedAtomicBlockError } from '../components/knowledge/PublishProgressPanel';
import type { DocumentSetFormValue } from '../components/knowledge/DocumentSetForm';
import {
  computeSha256,
  createDocumentSet,
  getDocumentPublishStatuses,
  normalizeMarkdownForHash,
  updateDocumentSet,
  type DocumentPublishStatus,
} from '../db/repositories/documentSetRepo';
import { useOptionalKnowledgeConfig } from '../services/knowledge/knowledgeConfig';
import { createKnowledgeClient, KnowledgeClientError } from '../services/knowledge/knowledgeClient';
import { PublishSession } from '../services/knowledge/publishOrchestrator';
import type { CachedActiveSnapshotManifest, ChangePreview } from '../services/knowledge/changePreview';

import { DocFolderTree } from '../components/notes/DocFolderTree';
import { DocEditorPane } from '../components/notes/DocEditorPane';
import { ZipImportPreviewModal } from '../components/notes/ZipImportPreviewModal';
import { TaskDrawer } from '../components/tasks/TaskDrawer';
import { ResizeSplitter } from '../components/common/ResizeSplitter';

const { Text } = Typography;

export const AI_KNOWLEDGE_DOC_PROMPT = `Bạn là chuyên gia soạn thảo tài liệu tri thức (knowledge document) cho ${APP_NAME}.
Hãy tạo tài liệu Markdown tối ưu đồng thời cho hệ thống tìm kiếm BM25, đồ thị tri thức Knowledge Graph (Neo4j) và ngữ cảnh của AI Assistant theo đúng các nguyên tắc sau:

1. TIÊU ĐỀ BẮT BUỘC:
- Dòng đầu tiên của tài liệu BẮT BUỘC là tiêu đề H1 duy nhất:
  # Tiêu đề tài liệu
- Tiêu đề phải rõ nghĩa, chứa danh từ/thuật ngữ nghiệp vụ chính xác, tối đa 120 ký tự.

2. PHẠM VI, ĐỘ DÀI & GIỚI HẠN KHỐI NGUYÊN TỬ (ATOMIC BLOCKS):
- Nguyên tắc: 1 tài liệu = 1 chủ đề/quy trình/thành phần độc lập.
- Giữ toàn bộ tài liệu dưới 50.000 ký tự (khuyến nghị 1.000 - 8.000 ký tự). Nếu chủ đề quá rộng, hãy tách thành các tài liệu con.
- KHỐI NGUYÊN TỬ (Bảng hoặc Code block): TUYỆT ĐỐI KHÔNG để một bảng hoặc khối mã đơn lẻ dài quá 50.000 ký tự (sẽ gây lỗi chặn publish hệ thống). Bảng lớn cần chia nhỏ theo từng nhóm bước/chủ đề.

3. HASHTAGS PHÂN LOẠI:
- Ngay sau tiêu đề H1, thêm một dòng chứa inline hashtags dạng:
  #tag-one #tag-two #he-thong
- Dùng hashtag ngắn gọn để hỗ trợ phân loại và lọc tài liệu.

4. CẤU TRÚC TIÊU ĐỀ H2/H3:
- Sử dụng các tiêu đề mục rõ ràng, có ngữ nghĩa (ví dụ: ## Tóm tắt, ## Phạm vi, ## Thuật ngữ, ## Quy tắc, ## Luồng xử lý, ## Bảng tiến trình & bước thực thi, ## Bảng trạng thái/Mã lỗi, ## Ví dụ, ## Ngoại lệ, ## Nguồn).
- TUYỆT ĐỐI KHÔNG dùng tiêu đề mơ hồ như: ## Ghi chú, ## Notes, ## Khác, ## Misc.

5. NỘI DUNG TỰ CHỨA ĐỦ (SELF-CONTAINED):
- Mỗi đoạn/section phải tự chứa đủ ngữ cảnh để khi AI chỉ trích xuất một đoạn khoảng 1.500 ký tự vẫn hiểu được đầy đủ.
- Lặp lại tên chủ thể hoặc thuật ngữ chính xác trong từng section thay vì dùng đại từ mơ hồ ("nó", "hệ thống này", "chức năng trên").
- Đưa từ khóa tìm kiếm mà người dùng thực tế sẽ tra cứu vào trực tiếp trong tiêu đề và nội dung.

6. ĐỊNH DANH KỸ THUẬT & TRÍCH XUẤT KNOWLEDGE GRAPH:
- Để hệ thống build Graph quan hệ (Neo4j) tự động trích xuất chính xác các thực thể và quan hệ (CALLS, INVOKES, WRITES_TO, USES_TYPE, PRECEDES):
  + Tên thủ tục/hàm/thành phần (SoftwareComponent): Sử dụng cú pháp có tiền tố schema hoặc hệ thống rõ ràng và luôn bọc trong cặp dấu backtick code (ví dụ: \`MAIN1.PKG_PAYMENT.PROCESS_TXN\`, \`BILLING.SYNC_SERVICE\`). Tránh viết tên cộc lốc không rõ schema khiến parser cách ly (quarantine).
  + Tên bảng dữ liệu (DatabaseObject): Viết hoa, có tiền tố schema nếu có và luôn bọc trong cặp dấu backtick code (ví dụ: \`MAIN1.TBL_PAYMENT_LOG\`, \`MAIN1.TBL_TRANSACTIONS\`).
  + Mã chu kỳ/loại (CycleType): Sử dụng mã chuẩn có định danh (ví dụ: \`CYTP1002\`, \`DAILY_CYCLE\`).
  + Bảng các bước thực thi: Khi mô tả luồng hoặc bước xử lý kỹ thuật, sử dụng bảng có các cột chuẩn sau:
    * THU_TU / ORDER: Thứ tự thực thi tuần tự (1, 2, 3...) để xác định luồng và xây dựng quan hệ PRECEDES.
    * TEN_BUOC / PROCEDURE: Tên hành động hoặc tên bước rõ nghĩa đóng vai trò định danh chính (canonical step identity).
    * TARGET: Thủ tục hoặc đối tượng/tiến trình được gọi (quan hệ CALLS / INVOKES). Bọc mã trong cặp dấu backtick code.
    * WRITES / GHI / TARGET_TABLE: Tên bảng cơ sở dữ liệu bị ghi hoặc cập nhật (quan hệ WRITES_TO). Bọc mã trong cặp dấu backtick code.
    * GHI_CHU: Ghi chú hoặc mô tả bổ sung cho bước.
    * QUY TẮC ĐỊNH DANH BƯỚC (STEP_ID): Chỉ đưa cột STEP_ID / MA_BUOC vào bảng khi tài liệu gốc ĐÃ CÓ SẴN mã định danh bước từ hệ thống cũ. TUYỆT ĐỐI KHÔNG tự bịa hoặc tự sinh mã giả như STEP_01, STEP_02 nếu nguồn không có.

7. ĐỊNH DẠNG NGÀY & NGUỒN (SOURCES):
- Dùng ngày tuyệt đối dạng ISO YYYY-MM-DD (ví dụ: 2026-10-05). Tuyệt đối không dùng ngày tương đối ("hôm qua", "tuần tới", "sắp tới").
- Luôn có mục ## Nguồn (Sources) ở cuối ghi rõ mã ticket/ServiceDesk, procedure/API, tài liệu tham chiếu và ngày cập nhật.

8. KHÔNG PHỤ THUỘC YAML FRONTMATTER:
- Mọi thông tin cốt lõi (tiêu đề, thẻ, ngày, mô tả) phải hiển thị rõ ràng trong nội dung Markdown chuẩn. Không phụ thuộc vào YAML frontmatter để nạp dữ liệu.

9. BẢO MẬT & DỮ LIỆU NHẠY CẢM:
- TUYỆT ĐỐI KHÔNG đưa mật khẩu, API key, access token, PAT, secret hoặc thông tin xác thực riêng tư vào tài liệu.

---
MẪU KHUNG CHUẨN ĐỂ ÁP DỤNG:

# Tiêu đề nghiệp vụ hoặc thành phần

#domain-tag #system-tag

## Tóm tắt
Mô tả ngắn gọn mục đích và câu hỏi nghiệp vụ mà tài liệu này giải quyết.

## Phạm vi
Phạm vi áp dụng của quy tắc hoặc thành phần này (hệ thống, phân hệ, dịch vụ phụ trách).

## Thuật ngữ
- **Thuật ngữ A**: Định nghĩa ngắn gọn, chính xác.
- **Thuật ngữ B**: Định nghĩa ngắn gọn, chính xác.

## Quy tắc
1. Quy tắc thứ nhất (ghi rõ điều kiện và kết quả).
2. Quy tắc thứ hai.

## Luồng xử lý
1. Bước 1: Hành động cụ thể.
2. Bước 2: Hành động tiếp theo.

## Các bước thực thi & Quan hệ thành phần
| THU_TU | TEN_BUOC | TARGET | WRITES | GHI_CHU |
|---|---|---|---|---|
| 1 | Khởi tạo giao dịch | \`MAIN1.PKG_PAYMENT.INIT_TXN\` | \`MAIN1.TBL_TXN_QUEUE\` | Khởi tạo phiên thanh toán mới |
| 2 | Xử lý thanh toán | \`MAIN1.PKG_PAYMENT.EXECUTE_PAYMENT\` | \`MAIN1.TBL_PAYMENT_LOG\` | Trừ số dư và ghi nhận nhật ký |
| 3 | Đồng bộ đối soát | \`MAIN1.PKG_SETTLEMENT.SYNC\` | \`MAIN1.TBL_SETTLEMENT\` | Đối soát dữ liệu cuối ngày |

## Trạng thái và mã lỗi
| Mã | Ý nghĩa | Hành động xử lý |
|---|---|---|
| 00 | Thành công | Tiếp tục quy trình |
| 05 | Từ chối | Kiểm tra điều kiện |

## Ví dụ
Mô tả ví dụ đầu vào cụ thể và kết quả mong đợi.

## Ngoại lệ
Các trường hợp đặc biệt không áp dụng luồng tiêu chuẩn.

## Nguồn
- Tài liệu/Ticket tham chiếu: SD-XXXXX / MAIN1.PKG_PAYMENT
- Ngày xác minh: YYYY-MM-DD`;

export const RECOMMENDED_DOC_TEMPLATE = `# Tiêu đề nghiệp vụ hoặc thành phần

#domain-tag #system-tag

## Tóm tắt
Mô tả ngắn gọn mục đích và câu hỏi nghiệp vụ mà tài liệu này giải quyết.

## Phạm vi
Phạm vi áp dụng của quy tắc hoặc thành phần này.

## Thuật ngữ
- **Thuật ngữ A**: Định nghĩa ngắn gọn, chính xác.
- **Thuật ngữ B**: Định nghĩa ngắn gọn, chính xác.

## Quy tắc
1. Quy tắc thứ nhất (ghi rõ điều kiện và kết quả).
2. Quy tắc thứ hai.

## Luồng xử lý
1. Bước 1: Hành động cụ thể.
2. Bước 2: Hành động tiếp theo.

## Các bước thực thi & Quan hệ thành phần
| THU_TU | TEN_BUOC | TARGET | WRITES | GHI_CHU |
|---|---|---|---|---|
| 1 | Khởi tạo quy trình | \`MAIN1.PKG_EXAMPLE.INIT\` | \`MAIN1.TBL_STAGING\` | Nạp dữ liệu vào bảng tạm |
| 2 | Xử lý nghiệp vụ chính | \`MAIN1.PKG_EXAMPLE.PROCESS\` | \`MAIN1.TBL_CORE_DATA\` | Cập nhật bảng nghiệp vụ chính |

## Trạng thái và mã lỗi
| Mã | Ý nghĩa | Hành động xử lý |
|---|---|---|
| 00 | Thành công | Tiếp tục quy trình |
| 05 | Từ chối | Kiểm tra điều kiện |

## Ví dụ
Mô tả ví dụ đầu vào cụ thể và kết quả mong đợi.

## Ngoại lệ
Các trường hợp đặc biệt không áp dụng luồng tiêu chuẩn.

## Nguồn
- Tài liệu/Ticket tham chiếu: SD-XXXXX / PROC_NAME
- Ngày xác minh: YYYY-MM-DD`;

export interface NotesViewProps {
  db?: TaskPlannerDatabase | undefined;
  initialDocId?: string | undefined;
}

const FOLDER_PREF_KEY = 'planner:docs_active_folder';
const TREE_WIDTH_PREF_KEY = 'planner:docs_tree_width';
const DEFAULT_TREE_WIDTH = 320;
const MIN_TREE_WIDTH = 220;
const MAX_TREE_WIDTH = 600;

export const NotesView: React.FC<NotesViewProps> = ({ db = defaultDb, initialDocId }) => {
  const knowledgeConfig = useOptionalKnowledgeConfig();
  const isConfigured = Boolean(knowledgeConfig.enabled && knowledgeConfig.baseUrl);

  const [treeWidth, setTreeWidth] = useState<number>(() => {
    try {
      const stored = localStorage.getItem(TREE_WIDTH_PREF_KEY);
      if (stored) {
        const val = parseInt(stored, 10);
        if (!isNaN(val) && val >= MIN_TREE_WIDTH && val <= MAX_TREE_WIDTH) {
          return val;
        }
      }
    } catch {}
    return DEFAULT_TREE_WIDTH;
  });

  const handleTreeResize = (newWidth: number) => {
    setTreeWidth(newWidth);
    try {
      localStorage.setItem(TREE_WIDTH_PREF_KEY, String(newWidth));
    } catch {}
  };

  const handleTreeReset = () => {
    setTreeWidth(DEFAULT_TREE_WIDTH);
    try {
      localStorage.setItem(TREE_WIDTH_PREF_KEY, String(DEFAULT_TREE_WIDTH));
    } catch {}
  };

  const [activeFilter, setActiveFilter] = useState<string>(() => {
    try {
      const stored = localStorage.getItem(FOLDER_PREF_KEY);
      return stored && stored !== 'inbox' && stored !== 'all' ? stored : 'root_docs';
    } catch {
      return 'root_docs';
    }
  });

  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(initialDocId ?? null);
  const [activeDrawerTaskId, setActiveDrawerTaskId] = useState<string | null>(null);

  const [aiPromptModalOpen, setAiPromptModalOpen] = useState<boolean>(false);
  const [documentSetDrawerOpen, setDocumentSetDrawerOpen] = useState(false);
  const [creatingDocumentSet, setCreatingDocumentSet] = useState(false);
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [publishSession, setPublishSession] = useState<PublishSession | null>(null);
  const [publishPreview, setPublishPreview] = useState<ChangePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [reconcilingAttemptId, setReconcilingAttemptId] = useState<string>();
  const [reconciliationErrorsBySet, setReconciliationErrorsBySet] = useState<Record<string, string>>({});

  const handleFilterChange = (filter: string) => {
    setActiveFilter(filter);
    setSelectedDocId(null);
    try {
      localStorage.setItem(FOLDER_PREF_KEY, filter);
    } catch {}
  };

  // Sync selectedDocId when initialDocId prop changes
  useEffect(() => {
    if (initialDocId) {
      setSelectedDocId(initialDocId);
    }
  }, [initialDocId]);

  // Sync selectedDocId from hash change (e.g. #/notes?doc=...)
  useEffect(() => {
    const syncFromHash = () => {
      const hash = window.location.hash;
      const match = hash.match(/[?&]doc=([^&]+)/);
      if (match && match[1]) {
        try {
          const docId = decodeURIComponent(match[1]);
          if (docId) {
            setSelectedDocId(docId);
          }
        } catch {
          // ignore uri decode error
        }
      }
    };

    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);
    return () => {
      window.removeEventListener('hashchange', syncFromHash);
    };
  }, []);

  // Fetch all notes from database
  const allNotes = useLiveQuery(
    async () => {
      const records = await db.notes.toArray();
      return records.sort((a, b) => {
        if (a.isPinned !== b.isPinned) {
          return a.isPinned ? -1 : 1;
        }
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
    },
    [db]
  );

  // Auto-switch activeFilter to document's parent folder or special folder when selectedDocId is set
  useEffect(() => {
    if (!selectedDocId || !allNotes) return;
    const doc = allNotes.find((n) => n.id === selectedDocId);
    if (doc) {
      const targetFilter = doc.deletedAt
        ? 'trash'
        : doc.type === 'quick_note'
          ? 'quick_notes'
          : doc.parentId || 'root_docs';
      setActiveFilter(targetFilter);
    }
  }, [selectedDocId, allNotes]);

  // Tree renders metadata-only records. Full Markdown remains available for editor/admin flows.
  // ponytail: split full-note hydration into dedicated repository queries when non-tree flows stop needing allNotes.
  const treeNotes = useMemo(
    () => (allNotes ?? []).map((note) => ({ ...note, body: '' })),
    [allNotes]
  );
  const loadSearchNotes = React.useCallback(() => db.notes.toArray(), [db]);

  // Selected document instance for editor pane
  const activeDocument = useMemo(() => {
    if (!allNotes || !selectedDocId) return null;
    const found = allNotes.find((n) => n.id === selectedDocId && n.type !== 'folder');
    return found || null;
  }, [allNotes, selectedDocId]);

  const publishStatuses = useLiveQuery(async () => {
    const documentIds = (allNotes ?? [])
      .filter((note) => note.type !== 'folder' && !note.deletedAt)
      .map((note) => note.id);
    return getDocumentPublishStatuses(documentIds, db);
  }, [db, allNotes]) as Record<string, DocumentPublishStatus> | undefined;

  const documentSets = useLiveQuery(() => db.documentSets.toArray(), [db]);
  const publishAttempts = useLiveQuery(() => db.publishAttempts.toArray(), [db]);
  const publishedDocuments = useLiveQuery(() => db.publishedDocuments.toArray(), [db]);
  const noteHashes = useLiveQuery(async () => {
    const entries = await Promise.all(
      (allNotes ?? [])
        .filter((note) => note.type !== 'folder' && !note.deletedAt)
        .map(async (note) => [note.id, await computeSha256(normalizeMarkdownForHash(note.body))] as const)
    );
    return Object.fromEntries(entries) as Record<string, string>;
  }, [allNotes], {} as Record<string, string>);

  const setStatus = useMemo(() => {
    const statesBySet: Record<string, PublishPrimaryState> = {};
    const activeAttemptIdsBySet: Record<string, string> = {};
    for (const set of documentSets ?? []) {
      const attempts = (publishAttempts ?? [])
        .filter((attempt) => attempt.setId === set.id)
        .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
      const publishing = attempts.find((attempt) => attempt.status === 'Publishing');
      if (publishing) {
        statesBySet[set.id] = 'Publishing';
        activeAttemptIdsBySet[set.id] = publishing.id;
        continue;
      }
      const newestTerminal = attempts[0];
      if (newestTerminal?.status === 'Failed' || newestTerminal?.status === 'Warning') {
        statesBySet[set.id] = newestTerminal.status;
        continue;
      }
      const metadata = (publishedDocuments ?? []).filter((item) => item.setId === set.id);
      if (metadata.length === 0) {
        statesBySet[set.id] = 'Never published';
        continue;
      }
      const metadataById = new Map(metadata.map((item) => [item.documentId, item]));
      const membershipMatches =
        metadata.length === set.documentIds.length &&
        set.documentIds.every((documentId) => metadataById.has(documentId));
      const hashesMatch =
        membershipMatches &&
        set.documentIds.every(
          (documentId) =>
            noteHashes?.[documentId] === metadataById.get(documentId)?.publishedContentHash
        );
      statesBySet[set.id] = hashesMatch ? 'In sync' : 'Local changes';
    }
    return { statesBySet, activeAttemptIdsBySet };
  }, [documentSets, publishAttempts, publishedDocuments, noteHashes]);

  const cachedAt = useMemo(() => {
    const attempts = (publishAttempts ?? []).filter((a) => a.completedAt);
    if (!attempts.length) return undefined;
    attempts.sort(
      (a, b) => new Date(b.completedAt ?? 0).getTime() - new Date(a.completedAt ?? 0).getTime()
    );
    return attempts[0]?.completedAt;
  }, [publishAttempts]);

  const handleSaveDocumentSet = async (
    setId: string | undefined,
    value: DocumentSetFormValue
  ) => {
    try {
      if (setId) {
        await updateDocumentSet(setId, value, db);
        message.success('Đã cập nhật bộ tài liệu');
      } else {
        await createDocumentSet(value, db);
        message.success('Đã tạo bộ tài liệu mới');
      }
      setCreatingDocumentSet(false);
    } catch (err) {
      console.error('Failed to save document set:', err);
      message.error(err instanceof Error ? err.message : 'Không thể lưu bộ tài liệu');
    }
  };

  const handleReconcileAttempt = async (setId: string, attemptId: string) => {
    if (!isConfigured || reconcilingAttemptId) return;
    setReconcilingAttemptId(attemptId);
    setReconciliationErrorsBySet((current) => {
      const next = { ...current };
      delete next[setId];
      return next;
    });
    try {
      const cachedAttempt = await db.publishAttempts.get(attemptId);
      if (!cachedAttempt?.submittedDocuments?.length) {
        setReconciliationErrorsBySet((current) => ({
          ...current,
          [setId]: 'Không thể tiếp tục kiểm tra: thiếu ảnh chụp đã gửi được lưu cục bộ.',
        }));
        return;
      }
      const client = createKnowledgeClient({
        baseUrl: knowledgeConfig.baseUrl,
        token: knowledgeConfig.token,
        db,
      });
      const session = new PublishSession({ client, db });
      const result = await session.pollAcceptedAttempt(attemptId);
      if (result.uncertain) {
        setReconciliationErrorsBySet((current) => ({
          ...current,
          [setId]: 'Mất kết nối — chưa xác định kết quả.',
        }));
      }
    } catch {
      setReconciliationErrorsBySet((current) => ({
        ...current,
        [setId]: 'Không thể kiểm tra trạng thái. Kiểm tra kết nối rồi thử lại.',
      }));
    } finally {
      setReconcilingAttemptId(undefined);
    }
  };

  const handlePreviewDocumentSet = async (set: DocumentSet) => {
    if (!isConfigured || previewLoading) {
      if (!isConfigured) message.warning('Hãy cấu hình Knowledge Server trước khi xuất bản.');
      return;
    }
    setPreviewLoading(true);
    try {
      const client = createKnowledgeClient({
        baseUrl: knowledgeConfig.baseUrl,
        token: knowledgeConfig.token,
        db,
      });
      let activeManifest: CachedActiveSnapshotManifest | null = null;
      try {
        activeManifest = await client.getSnapshotManifest(set.id);
      } catch (err: unknown) {
        if (
          err instanceof KnowledgeClientError &&
          err.status === 404 &&
          err.serverCode === 'SNAPSHOT_NOT_FOUND'
        ) {
          activeManifest = null;
        } else {
          if (err instanceof KnowledgeClientError) {
            if (err.code === 'NETWORK_ERROR') {
              message.error('Không thể kết nối Knowledge Server. Kiểm tra máy chủ và mạng rồi thử lại.');
            } else if (err.status === 401) {
              message.error('Token phiên không hợp lệ hoặc đã hết hạn.');
            } else if (err.status === 403) {
              message.error('Token phiên không có quyền truy cập Knowledge Server.');
            } else if (err.code === 'INVALID_RESPONSE') {
              message.error('Knowledge Server phản hồi không hợp lệ.');
            } else {
              message.error('Máy chủ Knowledge Server gặp lỗi khi kiểm tra ảnh chụp.');
            }
          } else {
            message.error('Không thể kiểm tra ảnh chụp trên Knowledge Server.');
          }
          return;
        }
      }
      const session = new PublishSession({ client, db });
      const setNotes = (allNotes ?? []).filter(
        (note) => set.documentIds.includes(note.id) && !note.deletedAt
      );
      const preview = await session.buildPreview({
        documentSet: set,
        notes: setNotes,
        activeManifest,
      });
      setPublishSession(session);
      setPublishPreview(preview);
      setPublishModalOpen(true);
    } catch (error: unknown) {
      message.error(formatOversizedAtomicBlockError(error) ?? 'Không thể tạo bản xem trước xuất bản.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePublishPreview = () => {
    setPublishModalOpen(false);
    setPublishSession(null);
    setPublishPreview(null);
  };

  // Current selected folder note if viewing a specific folder
  const currentFolder = useMemo(() => {
    if (!allNotes || typeof activeFilter !== 'string') return null;
    return allNotes.find((n) => n.id === activeFilter && n.type === 'folder') || null;
  }, [allNotes, activeFilter]);

  // Create new document action (supports explicit target folder)
  const handleCreateDocument = async (targetFolderId?: string) => {
    const isQuickNoteMode = activeFilter === 'quick_notes' && !targetFolderId;
    const effectiveFolderId =
      targetFolderId ??
      (typeof activeFilter === 'string' && !['root_docs', 'pinned', 'quick_notes', 'trash'].includes(activeFilter)
        ? activeFilter
        : undefined);

    try {
      const newDoc = await createNote(
        isQuickNoteMode
          ? {
              title: 'Ghi chú nhanh mới',
              body: '',
              type: 'quick_note',
              parentId: undefined,
              tags: activeTag ? [activeTag] : [],
            }
          : {
              title: 'Tài liệu mới',
              body: RECOMMENDED_DOC_TEMPLATE,
              type: 'document',
              parentId: effectiveFolderId,
              tags: activeTag ? [activeTag] : [],
            },
        db
      );

      // If document was created in a folder, switch view to that folder so doc is immediately visible
      if (effectiveFolderId && activeFilter !== effectiveFolderId) {
        handleFilterChange(effectiveFolderId);
      }

      setSelectedDocId(newDoc.id);
      message.success(isQuickNoteMode ? 'Đã tạo ghi chú nhanh mới' : 'Đã tạo tài liệu mới');
    } catch {
      message.error(isQuickNoteMode ? 'Không thể tạo ghi chú nhanh' : 'Không thể tạo tài liệu');
    }
  };

  // Create folder action (supports root & subfolder)
  const handleCreateFolder = async (name: string, parentId?: string): Promise<Note> => {
    try {
      const newFolder = await createNote(
        {
          title: name,
          body: '',
          type: 'folder',
          parentId: parentId || undefined,
        },
        db
      );
      handleFilterChange(newFolder.id);
      message.success(`Đã tạo thư mục "${name}"`);
      return newFolder;
    } catch (err) {
      message.error('Không thể tạo thư mục');
      throw err;
    }
  };

  // Rename folder action
  const handleRenameFolder = async (folderId: string, newName: string) => {
    try {
      await updateNote(folderId, { title: newName }, db);
      message.success(`Đã đổi tên thư mục thành "${newName}"`);
    } catch {
      message.error('Không thể đổi tên thư mục');
    }
  };

  // Delete folder action (reassigns child documents to Inbox and deletes folder and subfolders)
  const handleDeleteFolder = async (folder: Note) => {
    const getAllDescendantFolderIds = (parentId: string): string[] => {
      const children = (allNotes || []).filter(
        (n) => n.type === 'folder' && n.parentId === parentId && !n.deletedAt
      );
      return [parentId, ...children.flatMap((c) => getAllDescendantFolderIds(c.id))];
    };
    const folderIdsToDelete = getAllDescendantFolderIds(folder.id);
    const affectedDocs = (allNotes || []).filter(
      (n) => n.type !== 'folder' && folderIdsToDelete.includes(n.parentId || '') && !n.deletedAt
    );

    Modal.confirm({
      title: `Xóa thư mục "${folder.title || 'Không tên'}"?`,
      content:
        affectedDocs.length > 0
          ? `Thư mục (và các thư mục con) đang chứa ${affectedDocs.length} tài liệu. Các tài liệu này sẽ được chuyển về Inbox (không bị xóa).`
          : 'Bạn có chắc chắn muốn xóa thư mục này?',
      okText: 'Xóa thư mục',
      okType: 'danger',
      cancelText: 'Hủy',
      onOk: async () => {
        try {
          for (const child of affectedDocs) {
            await updateNote(child.id, { parentId: null }, db);
          }
          for (const fId of folderIdsToDelete) {
            await permanentDeleteNote(fId, db);
          }
          if (folderIdsToDelete.includes(typeof activeFilter === 'string' ? activeFilter : '')) {
            handleFilterChange('inbox');
          }
          message.success('Đã xóa thư mục');
        } catch {
          message.error('Không thể xóa thư mục');
        }
      },
    });
  };

  // Recursive delete folder action: permanently deletes folder, all subfolders and all contained documents
  const handleDeleteFolderRecursive = async (folder: Note) => {
    const getAllDescendantFolderIds = (parentId: string): string[] => {
      const children = (allNotes || []).filter(
        (n) => n.type === 'folder' && n.parentId === parentId && !n.deletedAt
      );
      return [parentId, ...children.flatMap((c) => getAllDescendantFolderIds(c.id))];
    };
    const folderIdsToDelete = getAllDescendantFolderIds(folder.id);
    const affectedDocs = (allNotes || []).filter(
      (n) => n.type !== 'folder' && folderIdsToDelete.includes(n.parentId || '')
    );
    const totalItems = folderIdsToDelete.length + affectedDocs.length;
    const subfolderCount = folderIdsToDelete.length - 1;

    Modal.confirm({
      title: `Xóa vĩnh viễn toàn bộ thư mục "${folder.title || 'Không tên'}"?`,
      content: (
        <div>
          <p style={{ color: '#dc2626', fontWeight: 600, marginBottom: 8 }}>
            Hành động này KHÔNG THỂ hoàn tác!
          </p>
          <p style={{ margin: 0 }}>
            Sẽ xóa vĩnh viễn thư mục này
            {subfolderCount > 0 ? `, ${subfolderCount} thư mục con` : ''} và{' '}
            <strong>{affectedDocs.length} tài liệu/file</strong> bên trong.
          </p>
        </div>
      ),
      okText: `Xóa vĩnh viễn (${totalItems} mục)`,
      okType: 'danger',
      cancelText: 'Hủy',
      onOk: async () => {
        try {
          const docIdsToDelete = affectedDocs.map((d) => d.id);
          const allIdsToDelete = [...folderIdsToDelete, ...docIdsToDelete];

          await bulkPermanentDeleteNotes(allIdsToDelete, db);

          if (selectedDocId && docIdsToDelete.includes(selectedDocId)) {
            setSelectedDocId(null);
          }

          if (folderIdsToDelete.includes(typeof activeFilter === 'string' ? activeFilter : '')) {
            handleFilterChange('root_docs');
          }
          message.success(`Đã xóa vĩnh viễn thư mục và ${affectedDocs.length} tài liệu`);
        } catch {
          message.error('Không thể xóa thư mục');
        }
      },
    });
  };

  // Special folder clear/empty handlers
  const handleEmptyTrash = async () => {
    const trashItems = (allNotes || []).filter((n) => Boolean(n.deletedAt));
    if (trashItems.length === 0) return;

    Modal.confirm({
      title: 'Dọn sạch thùng rác?',
      content: `Sẽ xóa vĩnh viễn ${trashItems.length} mục trong thùng rác. Hành động này không thể hoàn tác!`,
      okText: `Xóa vĩnh viễn (${trashItems.length})`,
      okType: 'danger',
      cancelText: 'Hủy',
      onOk: async () => {
        try {
          const ids = trashItems.map((n) => n.id);
          await bulkPermanentDeleteNotes(ids, db);
          if (selectedDocId && ids.includes(selectedDocId)) {
            setSelectedDocId(null);
          }
          message.success('Đã dọn sạch thùng rác');
        } catch {
          message.error('Không thể dọn sạch thùng rác');
        }
      },
    });
  };

  const handleClearSpecialFolder = async (
    specialKey: 'root_docs' | 'quick_notes',
    title: string
  ) => {
    const targetNotes = (allNotes || []).filter((n) => {
      if (n.deletedAt) return false;
      if (specialKey === 'root_docs') {
        return !n.parentId && n.type === 'document';
      }
      if (specialKey === 'quick_notes') {
        return n.type === 'quick_note';
      }
      return false;
    });

    if (targetNotes.length === 0) return;

    Modal.confirm({
      title: `Xóa tất cả trong "${title}"?`,
      content: `Chuyển toàn bộ ${targetNotes.length} tài liệu vào thùng rác?`,
      okText: 'Chuyển vào thùng rác',
      okType: 'danger',
      cancelText: 'Hủy',
      onOk: async () => {
        try {
          for (const doc of targetNotes) {
            await softDeleteNote(doc.id, db);
          }
          if (selectedDocId && targetNotes.some((d) => d.id === selectedDocId)) {
            setSelectedDocId(null);
          }
          message.success(`Đã chuyển ${targetNotes.length} tài liệu vào thùng rác`);
        } catch {
          message.error('Không thể xóa tài liệu');
        }
      },
    });
  };

  const handleUnpinAll = async () => {
    const pinned = (allNotes || []).filter((n) => n.isPinned && !n.deletedAt);
    if (pinned.length === 0) return;

    try {
      for (const doc of pinned) {
        await updateNote(doc.id, { isPinned: false }, db);
      }
      message.success(`Đã bỏ ghim ${pinned.length} tài liệu`);
    } catch {
      message.error('Không thể bỏ ghim tài liệu');
    }
  };

  // Hierarchical folder options with indentation and breadcrumb path
  const hierarchicalFolderOptions = useMemo(() => {
    const folders = (allNotes || []).filter((n) => n.type === 'folder' && !n.deletedAt);
    const map = new Map<string, { note: Note; depth: number; path: string }>();
    const roots = folders.filter((f) => !f.parentId || !folders.some((p) => p.id === f.parentId));

    const traverse = (node: Note, depth: number, parentPath: string) => {
      const currentPath = parentPath ? `${parentPath} / ${node.title}` : node.title || 'Không tên';
      map.set(node.id, { note: node, depth, path: currentPath });
      const children = folders.filter((f) => f.parentId === node.id);
      children.forEach((c) => traverse(c, depth + 1, currentPath));
    };
    roots.forEach((r) => traverse(r, 0, ''));
    return Array.from(map.values());
  }, [allNotes]);

  // Move document to folder state & action
  const [movingDoc, setMovingDoc] = useState<Note | null>(null);
  const [targetFolderSelect, setTargetFolderSelect] = useState<string | null>(null);

  const handleOpenMoveDocModal = (doc: Note) => {
    setMovingDoc(doc);
    setTargetFolderSelect(doc.parentId || null);
  };

  const handleConfirmMoveDoc = async () => {
    if (!movingDoc) return;
    try {
      await updateNote(movingDoc.id, { parentId: targetFolderSelect }, db);
      message.success('Đã chuyển thư mục thành công');
      setMovingDoc(null);
    } catch {
      message.error('Không thể chuyển thư mục');
    }
  };

  // Move folder to another folder state & action (with cycle prevention)
  const [movingFolder, setMovingFolder] = useState<Note | null>(null);
  const [targetParentFolderSelect, setTargetParentFolderSelect] = useState<string | null>(null);

  const handleOpenMoveFolderModal = (folder: Note) => {
    setMovingFolder(folder);
    setTargetParentFolderSelect(folder.parentId || null);
  };

  // Prevent cycle: folder cannot be moved into itself or its descendants
  const invalidTargetFolderIds = useMemo(() => {
    if (!movingFolder || !allNotes) return new Set<string>();
    const invalid = new Set<string>([movingFolder.id]);
    const getDescendants = (parentId: string) => {
      const children = allNotes.filter(
        (n) => n.type === 'folder' && n.parentId === parentId && !n.deletedAt
      );
      for (const c of children) {
        invalid.add(c.id);
        getDescendants(c.id);
      }
    };
    getDescendants(movingFolder.id);
    return invalid;
  }, [movingFolder, allNotes]);

  const handleConfirmMoveFolder = async () => {
    if (!movingFolder) return;
    try {
      await updateNote(movingFolder.id, { parentId: targetParentFolderSelect }, db);
      message.success('Đã di chuyển thư mục thành công');
      setMovingFolder(null);
    } catch {
      message.error('Không thể di chuyển thư mục');
    }
  };

  // Zip Import state & triggers
  const [zipImportModalOpen, setZipImportModalOpen] = useState(false);
  const [selectedZipFile, setSelectedZipFile] = useState<File | null>(null);
  const zipFileInputRef = useRef<HTMLInputElement>(null);

  const handleOpenZipImport = () => {
    if (zipFileInputRef.current) {
      zipFileInputRef.current.value = '';
      zipFileInputRef.current.click();
    }
  };

  const handleZipFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedZipFile(file);
      setZipImportModalOpen(true);
    }
  };

  const handleBatchImportDocs = async (
    docsToImport: Array<{ title: string; body: string; parentId?: string | undefined; tags?: string[] | undefined }>,
    destinationFolderId?: string
  ) => {
    await batchCreateNotes(
      docsToImport.map((d) => ({
        title: d.title,
        body: d.body,
        type: 'document',
        tags: d.tags ?? [],
        ...(d.parentId ? { parentId: d.parentId } : {}),
      })),
      db
    );
    if (destinationFolderId) {
      handleFilterChange(destinationFolderId);
    }
  };

  // Available folders for move action
  const availableFolders = useMemo(() => {
    return (allNotes || []).filter((n) => n.type === 'folder' && !n.deletedAt);
  }, [allNotes]);

  // Update document action
  const handleUpdateDocument = async (id: string, updates: Partial<Note>) => {
    try {
      await updateNote(id, updates, db);
    } catch (err) {
      console.warn('Failed to update doc:', err);
    }
  };

  // Delete document action (soft delete vs permanent delete with backlinks warning)
  const handleDeleteDocument = async (note: Note) => {
    if (note.deletedAt) {
      try {
        const backlinks = await getBacklinksForDoc(note.id, db);
        const backlinkCount = backlinks.tasks.length + backlinks.projects.length + backlinks.referencingNotes.length;

        if (backlinkCount > 0) {
          Modal.confirm({
            title: 'Cảnh báo xóa vĩnh viễn',
            content: `Tài liệu "${note.title || 'Không tiêu đề'}" đang được ${backlinkCount} mục liên kết (Tasks/Projects). Vẫn tiếp tục xóa vĩnh viễn?`,
            okText: 'Xóa vĩnh viễn',
            okType: 'danger',
            cancelText: 'Hủy',
            onOk: async () => {
              await permanentDeleteNote(note.id, db);
              message.success('Đã xóa vĩnh viễn tài liệu');
              if (selectedDocId === note.id) setSelectedDocId(null);
            },
          });
          return;
        }

        await permanentDeleteNote(note.id, db);
        message.success('Đã xóa vĩnh viễn tài liệu');
        if (selectedDocId === note.id) setSelectedDocId(null);
      } catch {
        message.error('Không thể xóa vĩnh viễn');
      }
    } else {
      try {
        await softDeleteNote(note.id, db);
        message.success('Đã chuyển tài liệu vào thùng rác');
        if (selectedDocId === note.id) setSelectedDocId(null);
      } catch {
        message.error('Không thể chuyển vào thùng rác');
      }
    }
  };

  // Restore document action
  const handleRestoreDocument = async (note: Note) => {
    try {
      await restoreNote(note.id, db);
      message.success(`Đã khôi phục tài liệu "${note.title || 'Không tiêu đề'}"`);
    } catch {
      message.error('Không thể khôi phục tài liệu');
    }
  };

  const handleOpenPopout = () => {
    openNotesPopout().catch((err) => {
      console.warn('Failed to open notes popout:', err);
    });
  };

  const handleCopyAiPrompt = async () => {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard API unavailable');
      }
      await navigator.clipboard.writeText(AI_KNOWLEDGE_DOC_PROMPT);
      message.success('Đã sao chép prompt hướng dẫn AI vào clipboard');
    } catch {
      message.error('Không thể sao chép prompt vào clipboard');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 84px)', overflow: 'hidden' }}>
      {/* 1. Page Header */}
      <PageHeader
        title="Ghi chú & Tài liệu"
        subtitle="Hệ thống quản lý tri thức, tài liệu Markdown và ghi chú nhanh cá nhân"
        extra={
          <Space>
            <Button icon={<DatabaseOutlined />} onClick={() => setDocumentSetDrawerOpen(true)}>
              Bộ tài liệu
            </Button>
            <Tooltip title="Xem prompt chuẩn để dán vào AI ngoài tạo tài liệu Markdown phù hợp tìm kiếm">
              <Button icon={<RobotOutlined />} onClick={() => setAiPromptModalOpen(true)}>
                Prompt AI cho tài liệu
              </Button>
            </Tooltip>
            <Tooltip title="Mở danh sách ghi chú trong cửa sổ nổi riêng biệt (Always on Top)">
              <Button icon={<ExportOutlined />} onClick={handleOpenPopout}>
                Cửa sổ nổi
              </Button>
            </Tooltip>
          </Space>
        }
      />

      {/* 2. Fixed 2-Column Main Workspace */}
      <div
        className="docs-2column-layout"
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          border: '1px solid #f0f0f0',
          borderRadius: 8,
          overflow: 'hidden',
          backgroundColor: '#ffffff',
        }}
      >
        {/* Column 1: Searchable Tree Panel (resizable) */}
        <DocFolderTree
          notes={treeNotes}
          loadSearchNotes={loadSearchNotes}
          selectedDocId={activeDocument?.id ?? null}
          activeFilter={activeFilter}
          onSelectFilter={handleFilterChange}
          onSelectDoc={(doc) => setSelectedDocId(doc.id)}
          onCreateDoc={handleCreateDocument}
          onCreateFolder={async (name, parentId) => {
            await handleCreateFolder(name, parentId);
          }}
          onRenameFolder={handleRenameFolder}
          onMoveFolder={handleOpenMoveFolderModal}
          onDeleteFolder={handleDeleteFolder}
          onDeleteFolderRecursive={handleDeleteFolderRecursive}
          onEmptyTrash={handleEmptyTrash}
          onClearSpecialFolder={handleClearSpecialFolder}
          onUnpinAll={handleUnpinAll}
          onOpenZipImport={handleOpenZipImport}
          activeTag={activeTag}
          onSelectTag={setActiveTag}
          publishStatuses={publishStatuses}
          onTogglePin={(doc) => handleUpdateDocument(doc.id, { isPinned: !doc.isPinned })}
          onDeleteDoc={handleDeleteDocument}
          onRestoreDoc={handleRestoreDocument}
          onMoveDocToFolder={handleOpenMoveDocModal}
          width={treeWidth}
        />

        {/* Resizable Divider between Tree and Editor Pane */}
        <ResizeSplitter
          side="left"
          currentWidth={treeWidth}
          minWidth={MIN_TREE_WIDTH}
          maxWidth={MAX_TREE_WIDTH}
          defaultWidth={DEFAULT_TREE_WIDTH}
          onResize={handleTreeResize}
          onReset={handleTreeReset}
        />

        {/* Column 2: Document Editor Pane or Empty State */}
        <div style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
          {activeDocument ? (
            <DocEditorPane
              key={activeDocument.id}
              doc={activeDocument}
              onUpdateDoc={handleUpdateDocument}
              onDeleteDoc={handleDeleteDocument}
              onRestoreDoc={handleRestoreDocument}
              onSelectDoc={(id) => setSelectedDocId(id)}
              onOpenTask={(taskId) => setActiveDrawerTaskId(taskId)}
              onOpenProject={(projectId) => {
                window.location.hash = `#/projects?project=${encodeURIComponent(projectId)}`;
              }}
              db={db}
              publishStatus={publishStatuses?.[activeDocument.id]}
            />
          ) : (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 32,
                backgroundColor: '#ffffff',
              }}
            >
              <Empty
                image={<FileTextOutlined style={{ fontSize: 48, color: '#d1d5db' }} />}
                description={
                  <div style={{ marginTop: 8 }}>
                    <Text strong style={{ fontSize: 16, color: '#374151', display: 'block' }}>
                      Chưa chọn tài liệu
                    </Text>
                    <Text type="secondary" style={{ fontSize: 13, display: 'block', marginTop: 4 }}>
                      Chọn một tài liệu từ cây thư mục bên trái để xem và chỉnh sửa, hoặc tạo tài liệu mới.
                    </Text>
                  </div>
                }
              >
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => handleCreateDocument()}
                  style={{ backgroundColor: '#4f46e5', marginTop: 12 }}
                >
                  Tạo tài liệu mới
                </Button>
              </Empty>
            </div>
          )}
        </div>
      </div>

      {/* Document Set Drawer */}
      <DocumentSetDrawer
        open={documentSetDrawerOpen}
        database={db}
        sets={documentSets ?? []}
        notes={allNotes ?? []}
        attempts={publishAttempts ?? []}
        statesBySet={setStatus.statesBySet}
        activeAttemptIdsBySet={setStatus.activeAttemptIdsBySet}
        {...(reconcilingAttemptId ? { reconcilingAttemptId } : {})}
        reconciliationErrorsBySet={reconciliationErrorsBySet}
        configured={isConfigured}
        loading={previewLoading}
        creating={creatingDocumentSet}
        {...(cachedAt ? { cachedAt } : {})}
        {...(currentFolder?.id ? { currentFolderId: currentFolder.id } : {})}
        onClose={() => {
          setDocumentSetDrawerOpen(false);
          setCreatingDocumentSet(false);
        }}
        onCreate={() => setCreatingDocumentSet(true)}
        onCancelCreate={() => setCreatingDocumentSet(false)}
        onSave={handleSaveDocumentSet}
        onPreview={handlePreviewDocumentSet}
        onReconcileAttempt={handleReconcileAttempt}
        onOpenSettings={() => { window.location.hash = '#/settings'; }}
      />

      {publishSession && publishPreview && (
        <PublishPreviewModal
          open={publishModalOpen}
          preview={publishPreview}
          session={publishSession}
          documentTitles={Object.fromEntries(
            (allNotes ?? []).map((note) => [note.id, note.title || 'Không tiêu đề'])
          )}
          onClose={closePublishPreview}
        />
      )}

      {/* Move Document to Folder Modal */}
      <Modal
        title={`Chuyển "${movingDoc?.title || 'Tài liệu'}" sang thư mục`}
        open={Boolean(movingDoc)}
        onOk={handleConfirmMoveDoc}
        onCancel={() => setMovingDoc(null)}
        okText="Chuyển"
        cancelText="Hủy"
      >
        <div style={{ padding: '8px 0' }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
            Chọn thư mục đích:
          </Text>
          <Select
            style={{ width: '100%' }}
            value={targetFolderSelect ?? ''}
            onChange={(val) => setTargetFolderSelect(val || null)}
            options={[
              { value: '', label: '📥 Inbox (Không nằm trong thư mục nào)' },
              ...hierarchicalFolderOptions.map(({ note, depth, path }) => ({
                value: note.id,
                label: `${'— '.repeat(depth)}📁 ${path}`,
              })),
            ]}
          />
        </div>
      </Modal>

      {/* Move Folder to Folder Modal */}
      <Modal
        title={`Di chuyển thư mục "${movingFolder?.title || 'Không tên'}"`}
        open={Boolean(movingFolder)}
        onOk={handleConfirmMoveFolder}
        onCancel={() => setMovingFolder(null)}
        okText="Di chuyển"
        cancelText="Hủy"
      >
        <div style={{ padding: '8px 0' }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
            Chọn thư mục cha mới:
          </Text>
          <Select
            style={{ width: '100%' }}
            value={targetParentFolderSelect ?? ''}
            onChange={(val) => setTargetParentFolderSelect(val || null)}
            options={[
              { value: '', label: '📁 Thư mục gốc (Root)' },
              ...hierarchicalFolderOptions
                .filter(({ note }) => !invalidTargetFolderIds.has(note.id))
                .map(({ note, depth, path }) => ({
                  value: note.id,
                  label: `${'— '.repeat(depth)}📁 ${path}`,
                })),
            ]}
          />
        </div>
      </Modal>

      {/* Hidden file input for zip upload */}
      <input
        type="file"
        ref={zipFileInputRef}
        accept=".zip"
        style={{ display: 'none' }}
        onChange={handleZipFileSelected}
      />

      {/* Zip Import Preview Modal */}
      <ZipImportPreviewModal
        open={zipImportModalOpen}
        onClose={() => {
          setZipImportModalOpen(false);
          setSelectedZipFile(null);
        }}
        zipFile={selectedZipFile}
        folders={availableFolders}
        currentFolderId={typeof activeFilter === 'string' && availableFolders.some((f) => f.id === activeFilter) ? activeFilter : null}
        onImportDocs={handleBatchImportDocs}
        onCreateFolder={handleCreateFolder}
      />

      {/* AI Document Generation Prompt Modal */}
      <Modal
        title={`Hướng dẫn AI tạo tài liệu tối ưu cho ${APP_NAME}`}
        open={aiPromptModalOpen}
        onCancel={() => setAiPromptModalOpen(false)}
        width={760}
        footer={[
          <Button key="close" onClick={() => setAiPromptModalOpen(false)}>
            Đóng
          </Button>,
          <Button
            key="copy"
            type="primary"
            icon={<CopyOutlined />}
            onClick={handleCopyAiPrompt}
            aria-label="Sao chép prompt"
          >
            Sao chép prompt
          </Button>,
        ]}
      >
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <Text type="secondary">
            Dán prompt này vào bất kỳ AI Assistant bên ngoài (Claude, ChatGPT, Open-WebUI, ...) khi bạn muốn tạo tài liệu Markdown để nạp vào {APP_NAME}.
          </Text>
          <Input.TextArea
            readOnly
            value={AI_KNOWLEDGE_DOC_PROMPT}
            rows={18}
            style={{
              fontFamily: 'monospace',
              fontSize: 12,
              backgroundColor: '#fafafa',
            }}
          />
        </Space>
      </Modal>

      {/* Task Drawer when clicking linked task from editor */}
      <TaskDrawer
        open={Boolean(activeDrawerTaskId)}
        taskId={activeDrawerTaskId}
        onClose={() => setActiveDrawerTaskId(null)}
        db={db}
      />
    </div>
  );
};
