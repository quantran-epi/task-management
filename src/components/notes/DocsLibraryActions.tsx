import { useRef, useState } from 'react';
import { Button, Modal, Space, Typography, TextArea, useMessage } from '../ui';
import { APP_NAME } from '../../constants/app';
import { CopyOutlined, DatabaseOutlined, RobotOutlined, UploadOutlined } from '../ui/icon';
import type { TaskPlannerDatabase } from '../../db';
import type { Note } from '../../types/models';
import { batchCreateNotes, createNote } from '../../db/repositories/noteRepo';
import { ZipImportPreviewModal, type ZipImportPreviewModalProps } from './ZipImportPreviewModal';

const { Text } = Typography;

export const AI_KNOWLEDGE_DOC_PROMPT = `Bạn là chuyên gia soạn thảo tài liệu tri thức (knowledge document) cho ${APP_NAME}.
Hãy tạo tài liệu Markdown tối ưu đồng thời cho hệ thống tìm kiếm BM25, đồ thị tri thức Knowledge Graph (Neo4j) và ngữ cảnh của AI Assistant theo đúng các nguyên tắc sau:

1. TRUNG THÀNH TUYỆT ĐỐI VỚI NGUỒN (SOURCE FIDELITY):
- Chỉ trình bày lại thông tin có trong tài liệu nguồn. Được phép tái cấu trúc và định dạng lại, nhưng TUYỆT ĐỐI KHÔNG được thêm kiến thức mới.
- TUYỆT ĐỐI KHÔNG tự tạo hoặc suy diễn: sự kiện, ngày tháng/năm, mã ticket (SD-…, JIRA-…), nguồn/tài liệu tham chiếu, tên procedure/bảng/cột/package/schema, mã lỗi, mã chu kỳ, quan hệ giữa các thành phần (CALLS / INVOKES / WRITES_TO / USES_TYPE / PRECEDES), ví dụ, ngoại lệ, con số, ngưỡng, SLA, và kết luận không có câu nguồn tương ứng.
- Thông tin thiếu hoặc mơ hồ: ghi marker [THIẾU THÔNG TIN: <mô tả ngắn>] hoặc [CHƯA XÁC MINH: <mô tả ngắn>] ngay tại vị trí đó; tuyệt đối không thay bằng giá trị phỏng đoán.
- KHÔNG bịa nội dung để lấp chỗ trống: section trong khung mẫu mà nguồn không có dữ liệu phải được lược bỏ hoặc giữ lại kèm marker thiếu thông tin; khung mẫu chỉ là gợi ý định dạng, không phải danh sách bắt buộc phải điền đủ.
- Mọi khẳng định phải truy vết được về một câu trong nguồn; nếu không truy vết được, hạ xuống marker [CHƯA XÁC MINH: ...].

2. TIÊU ĐỀ BẮT BUỘC:
- Dòng đầu tiên của tài liệu BẮT BUỘC là tiêu đề H1 duy nhất:
  # Tiêu đề tài liệu
- Tiêu đề phải rõ nghĩa, chứa danh từ/thuật ngữ nghiệp vụ chính xác, tối đa 120 ký tự.

3. PHẠM VI, ĐỘ DÀI & GIỚI HẠN KHỐI NGUYÊN TỬ (ATOMIC BLOCKS):
- Nguyên tắc: 1 tài liệu = 1 chủ đề/quy trình/thành phần độc lập.
- Giữ toàn bộ tài liệu dưới 50.000 ký tự (khuyến nghị 1.000 - 8.000 ký tự). Nếu chủ đề quá rộng, hãy tách thành các tài liệu con.
- KHỐI NGUYÊN TỬ (Bảng hoặc Code block): TUYỆT ĐỐI KHÔNG để một bảng hoặc khối mã đơn lẻ dài quá 50.000 ký tự (sẽ gây lỗi chặn publish hệ thống). Bảng lớn cần chia nhỏ theo từng nhóm bước/chủ đề.

4. HASHTAGS PHÂN LOẠI:
- Ngay sau tiêu đề H1, thêm một dòng chứa inline hashtags dạng:
  #tag-one #tag-two #he-thong
- Dùng hashtag ngắn gọn để hỗ trợ phân loại và lọc tài liệu.

5. CẤU TRÚC TIÊU ĐỀ H2/H3:
- Sử dụng các tiêu đề mục rõ ràng, có ngữ nghĩa (ví dụ: ## Tóm tắt, ## Phạm vi, ## Thuật ngữ, ## Quy tắc, ## Luồng xử lý, ## Bảng tiến trình & bước thực thi, ## Bảng trạng thái/Mã lỗi, ## Ví dụ, ## Ngoại lệ, ## Nguồn).
- TUYỆT ĐỐI KHÔNG dùng tiêu đề mơ hồ như: ## Ghi chú, ## Notes, ## Khác, ## Misc.

6. NỘI DUNG TỰ CHỨA ĐỦ (SELF-CONTAINED):
- Mỗi đoạn/section phải tự chứa đủ ngữ cảnh để khi AI chỉ trích xuất một đoạn khoảng 1.500 ký tự vẫn hiểu được đầy đủ.
- Lặp lại tên chủ thể hoặc thuật ngữ chính xác trong từng section thay vì dùng đại từ mơ hồ ("nó", "hệ thống này", "chức năng trên").
- Đưa từ khóa tìm kiếm mà người dùng thực tế sẽ tra cứu vào trực tiếp trong tiêu đề và nội dung.

7. ĐỊNH DANH KỸ THUẬT & TRÍCH XUẤT KNOWLEDGE GRAPH:
- Để hệ thống build Graph quan hệ (Neo4j) tự động trích xuất chính xác các thực thể và quan hệ (CALLS, INVOKES, WRITES_TO, USES_TYPE, PRECEDES):
  + Tên thủ tục/hàm/thành phần (SoftwareComponent): Giữ nguyên tên có trong nguồn, bọc trong cặp dấu backtick code (ví dụ: \`<schema.package.procedure từ nguồn>\`). Tránh viết tên cộc lốc không rõ schema khiến parser cách ly (quarantine).
  + Tên bảng dữ liệu (DatabaseObject): Giữ nguyên tên có trong nguồn, bọc trong cặp dấu backtick code (ví dụ: \`<schema.table từ nguồn>\`).
  + Mã chu kỳ/loại (CycleType): Chỉ dùng mã có trong nguồn (ví dụ: \`<mã chu kỳ từ nguồn>\`).
  + Bảng các bước thực thi: Khi mô tả luồng hoặc bước xử lý kỹ thuật, sử dụng bảng có các cột chuẩn sau:
    * THU_TU / ORDER: Thứ tự thực thi tuần tự (1, 2, 3...) để xác định luồng và xây dựng quan hệ PRECEDES.
    * TEN_BUOC / PROCEDURE: Tên hành động hoặc tên bước rõ nghĩa đóng vai trò định danh chính (canonical step identity).
    * TARGET: Thủ tục hoặc đối tượng/tiến trình được gọi (quan hệ CALLS / INVOKES). Bọc mã trong cặp dấu backtick code.
    * WRITES / GHI / TARGET_TABLE: Tên bảng cơ sở dữ liệu bị ghi hoặc cập nhật (quan hệ WRITES_TO). Bọc mã trong cặp dấu backtick code.
    * GHI_CHU: Ghi chú hoặc mô tả bổ sung cho bước.
    * QUY TẮC ĐỊNH DANH BƯỚC (STEP_ID): Chỉ đưa cột STEP_ID / MA_BUOC vào bảng khi tài liệu gốc ĐÃ CÓ SẴN mã định danh bước từ hệ thống cũ. TUYỆT ĐỐI KHÔNG tự bịa hoặc tự sinh mã giả như STEP_01, STEP_02 nếu nguồn không có.

8. ĐỊNH DẠNG NGÀY & NGUỒN (SOURCES):
- Dùng ngày tuyệt đối dạng ISO YYYY-MM-DD khi nguồn có ngày. Tuyệt đối không dùng ngày tương đối ("hôm qua", "tuần tới", "sắp tới").
- Chỉ chép ngày, mã ticket/ServiceDesk, procedure/API và tài liệu tham chiếu từ nguồn. Nếu nguồn không có dữ liệu này, dùng marker [THIẾU THÔNG TIN: ...] và KHÔNG điền giá trị giữ chỗ.
- Mục ## Nguồn (Sources) không bắt buộc phải có đầy đủ; được phép lược bỏ hoặc chỉ chứa marker thiếu thông tin.

9. KHÔNG PHỤ THUỘC YAML FRONTMATTER:
- Mọi thông tin cốt lõi (tiêu đề, thẻ, ngày, mô tả) phải hiển thị rõ ràng trong nội dung Markdown chuẩn. Không phụ thuộc vào YAML frontmatter để nạp dữ liệu.

10. BẢO MẬT & DỮ LIỆU NHẠY CẢM:
- TUYỆT ĐỐI KHÔNG đưa mật khẩu, API key, access token, PAT, secret hoặc thông tin xác thực riêng tư vào tài liệu.

---
MẪU KHUNG CHUẨN ĐỂ ÁP DỤNG (CHỈ LÀ KHUNG ĐỊNH DẠNG — mọi giá trị mẫu chỉ mang tính minh họa, TUYỆT ĐỐI KHÔNG sao chép vào kết quả):

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
| 1 | <tên bước từ nguồn> | \`<procedure từ nguồn, bọc backtick>\` | \`<bảng từ nguồn, bọc backtick>\` | <ghi chú từ nguồn> |
| 2 | <tên bước từ nguồn> | \`<procedure từ nguồn, bọc backtick>\` | \`<bảng từ nguồn, bọc backtick>\` | <ghi chú từ nguồn> |

## Trạng thái và mã lỗi
| Mã | Ý nghĩa | Hành động xử lý |
|---|---|---|
| <mã từ nguồn> | <ý nghĩa từ nguồn> | <hành động xử lý từ nguồn> |

## Ví dụ
(chỉ thêm nếu nguồn có ví dụ; nếu không, lược bỏ section này hoặc dùng [THIẾU THÔNG TIN: ...])

## Ngoại lệ
(chỉ thêm nếu nguồn có ngoại lệ; nếu không, lược bỏ section này hoặc dùng [THIẾU THÔNG TIN: ...])

## Nguồn
- Tài liệu/Ticket tham chiếu: [THIẾU THÔNG TIN: chưa có nguồn trong tài liệu gốc]
- Ngày xác minh: [THIẾU THÔNG TIN: chưa có ngày trong tài liệu gốc]`;

interface DocsLibraryActionsProps {
  db: TaskPlannerDatabase;
  notes: Note[];
  currentFolderId?: string | undefined;
  onSelectFolder: (folderId: string) => void;
  /** Opens the single document-set library tab. */
  onOpenLibrary?: () => void;
}

export function DocsLibraryActions({
  db,
  notes,
  currentFolderId,
  onSelectFolder,
  onOpenLibrary,
}: DocsLibraryActionsProps) {
  const message = useMessage();
  const [aiPromptModalOpen, setAiPromptModalOpen] = useState(false);
  const [selectedZipFile, setSelectedZipFile] = useState<File | null>(null);
  const zipFileInputRef = useRef<HTMLInputElement>(null);

  const handleBatchImportDocs: ZipImportPreviewModalProps['onImportDocs'] = async (
    docsToImport,
    destinationFolderId
  ) => {
    await batchCreateNotes(
      docsToImport.map((doc) => ({
        title: doc.title,
        body: doc.body,
        type: 'document',
        tags: doc.tags ?? [],
        ...(doc.parentId ? { parentId: doc.parentId } : {}),
      })),
      db
    );
    if (destinationFolderId) onSelectFolder(destinationFolderId);
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
    <>
      <Space wrap size={4}>
        <Button
          size="small"
          icon={<DatabaseOutlined />}
          aria-label="Bộ tài liệu"
          onClick={() => onOpenLibrary?.()}
        >
          Bộ tài liệu
        </Button>
        <Button
          size="small"
          icon={<UploadOutlined />}
          onClick={() => {
            if (zipFileInputRef.current) {
              zipFileInputRef.current.value = '';
              zipFileInputRef.current.click();
            }
          }}
        >
          Nhập Zip
        </Button>
        <Button size="small" icon={<RobotOutlined />} onClick={() => setAiPromptModalOpen(true)}>
          Prompt AI
        </Button>
      </Space>
      <input
        type="file"
        ref={zipFileInputRef}
        accept=".zip"
        style={{ display: 'none' }}
        onChange={(event) => setSelectedZipFile(event.target.files?.[0] ?? null)}
      />
      <ZipImportPreviewModal
        open={Boolean(selectedZipFile)}
        onClose={() => setSelectedZipFile(null)}
        zipFile={selectedZipFile}
        folders={notes.filter((note) => note.type === 'folder' && !note.deletedAt)}
        currentFolderId={currentFolderId ?? null}
        onImportDocs={handleBatchImportDocs}
        onCreateFolder={(name, parentId) => createNote({ title: name, body: '', type: 'folder', parentId }, db)}
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
          <TextArea
            readOnly
            value={AI_KNOWLEDGE_DOC_PROMPT}
            rows={18}
            style={{
              fontFamily: 'monospace',
              fontSize: 'var(--font-size-small)',
              backgroundColor: 'var(--bg-elev)',
            }}
          />
        </Space>
      </Modal>

    </>
  );
}
