import {
  AlignmentType,
  Document,
  Footer,
  Header,
  HeadingLevel,
  LevelFormat,
  PageBreak,
  PageNumber,
  Paragraph,
  TableOfContents,
  TextRun,
} from 'docx';
import {
  apiTable,
  DOCX_FONT,
  docxParagraph,
  executionMatrixTable,
  fileLayoutTable,
  glossaryTable,
  inputRulesTable,
  notificationTable,
  riskTable,
  staffingTable,
  supplied,
  type ApiContractRow,
  type ExecutionMatrixRow,
  type FileLayoutRow,
  type GlossaryRow,
  type InputRuleRow,
  type NotificationRow,
  type RiskRow,
  type StaffingRow,
} from './docxShared';

export interface Pl02Metadata {
  crCode: string;
  featureName: string;
  requestingUnit: string;
  author: string;
  createdDate: string;
}

export interface Pl02Feature {
  name: string;
  description: string;
  formName?: string | undefined;
  application?: string | undefined;
  approvalRequirement?: string | undefined;
  targetTable?: string | undefined;
  templateImageDescription?: string | undefined;
  fileLayout: FileLayoutRow[];
  inputRules: InputRuleRow[];
  processingRules: string[];
  flowSteps: ExecutionMatrixRow[];
}

export interface Pl02DocxPayload {
  schemaVersion: 1;
  kind: 'PL02';
  status: 'approved';
  inputRevision: number;
  draftRevision: number;
  approvedRevision: number;
  metadata: Pl02Metadata;
  introduction: {
    purpose: string;
    users: string;
    deploymentScope: string;
    risks: RiskRow[];
    glossary: GlossaryRow[];
  };
  features: Pl02Feature[];
  permissions: string[];
  notifications: NotificationRow[];
  apiContracts: ApiContractRow[];
  staffing: StaffingRow[];
}

const HEADINGS = 'pl02-headings';
const BULLETS = 'pl02-bullets';
const missingRisk: RiskRow = { type: '', description: '', mitigation: '', owner: '' };
const missingGlossary: GlossaryRow = { abbreviation: '', explanation: '' };
const missingFileLayout: FileLayoutRow = { column: '', format: '', required: '', description: '' };
const missingInputRule: InputRuleRow = { field: '', rule: '' };
const missingStep: ExecutionMatrixRow = { actor: '', target: '', action: '' };
const missingNotification: NotificationRow = { content: '', push: '', m4u: '' };
const missingApi: ApiContractRow = { field: '', dataType: '', description: '' };
const missingStaffing: StaffingRow = {
  workItem: '',
  fromDate: '',
  toDate: '',
  businessOwner: '',
  deliveryOwner: '',
};

function heading(text: string, level: 1 | 2 | 3): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, font: DOCX_FONT, bold: true })],
    heading: level === 1
      ? HeadingLevel.HEADING_1
      : level === 2
        ? HeadingLevel.HEADING_2
        : HeadingLevel.HEADING_3,
    numbering: { reference: HEADINGS, level: level - 1 },
    spacing: { before: level === 1 ? 240 : 160, after: 100 },
  });
}

function bullet(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: supplied(text), font: DOCX_FONT })],
    numbering: { reference: BULLETS, level: 0 },
    spacing: { after: 60 },
  });
}

function optionalField(label: string, value?: string): Paragraph[] {
  return value?.trim() ? [docxParagraph(`${label}: ${value}`)] : [];
}

function coverLine(text: string, size: number): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text, bold: true, font: DOCX_FONT, size })],
    spacing: { after: 180 },
  });
}

export function buildPl02Document(payload: Pl02DocxPayload): Document {
  const cr = payload.metadata.crCode.startsWith('#')
    ? payload.metadata.crCode
    : `#${payload.metadata.crCode}`;
  const children = [
    new Paragraph({ spacing: { before: 1000 } }),
    coverLine('TÀI LIỆU ĐẶC TẢ CHỨC NĂNG', 32),
    coverLine(supplied(payload.metadata.featureName).toUpperCase(), 28),
    coverLine(cr, 24),
    docxParagraph(`Đơn vị yêu cầu: ${supplied(payload.metadata.requestingUnit)}`),
    docxParagraph(`Người lập: ${supplied(payload.metadata.author)}`),
    docxParagraph(`Ngày lập: ${supplied(payload.metadata.createdDate)}`),
    new Paragraph({ children: [new PageBreak()] }),
    coverLine('MỤC LỤC', 28),
    new TableOfContents('MỤC LỤC', { hyperlink: true, headingStyleRange: '1-3' }),
    new Paragraph({ children: [new PageBreak()] }),
    heading('GIỚI THIỆU CHUNG', 1),
    heading('Mục đích yêu cầu', 2),
    docxParagraph(payload.introduction.purpose),
    heading('Đối tượng sử dụng.', 2),
    docxParagraph(payload.introduction.users),
    heading('Phạm vi triển khai', 2),
    docxParagraph(payload.introduction.deploymentScope),
    heading('Nhận diện đánh giá rủi ro khi triển khai (nếu có).', 2),
    riskTable(payload.introduction.risks.length > 0 ? payload.introduction.risks : [missingRisk]),
    heading('Các thuật ngữ viết tắt', 2),
    glossaryTable(payload.introduction.glossary.length > 0 ? payload.introduction.glossary : [missingGlossary]),
    heading('YÊU CẦU CHỨC NĂNG', 1),
  ];

  const features = payload.features.length > 0
    ? payload.features
    : [{
        name: '(chưa cung cấp)',
        description: '',
        fileLayout: [],
        inputRules: [],
        processingRules: [],
        flowSteps: [],
      }];

  for (const feature of features) {
    children.push(
      heading(feature.name, 2),
      docxParagraph(feature.description),
      ...optionalField('Tên biểu mẫu', feature.formName),
      ...optionalField('Ứng dụng', feature.application),
      ...optionalField('Yêu cầu phê duyệt', feature.approvalRequirement),
      ...optionalField('Bảng dữ liệu đích', feature.targetTable),
      heading('Cấu trúc biểu mẫu', 3),
      fileLayoutTable(feature.fileLayout.length > 0 ? feature.fileLayout : [missingFileLayout]),
      ...(feature.templateImageDescription?.trim()
        ? [heading('Template upload', 3), docxParagraph(feature.templateImageDescription)]
        : []),
      heading('Hướng dẫn nhập dữ liệu', 3),
      inputRulesTable(feature.inputRules.length > 0 ? feature.inputRules : [missingInputRule]),
      heading('Quy tắc xử lý dữ liệu', 3),
      ...(feature.processingRules.length > 0
        ? feature.processingRules.map(bullet)
        : [docxParagraph('')]),
      heading('BẢNG CÁC BƯỚC THỰC HIỆN', 3),
      executionMatrixTable(feature.flowSteps.length > 0 ? feature.flowSteps : [missingStep]),
    );
  }

  children.push(
    heading('Phân quyền sử dụng chức năng', 2),
    ...(payload.permissions.length > 0 ? payload.permissions.map(bullet) : [docxParagraph('')]),
    heading('Cấu hình thông báo', 2),
    notificationTable(payload.notifications.length > 0 ? payload.notifications : [missingNotification]),
    fileLayoutTable(payload.features[0]?.fileLayout.length
      ? payload.features[0].fileLayout
      : [missingFileLayout], 'TRƯỜNG'),
    apiTable(payload.apiContracts.length > 0 ? payload.apiContracts : [missingApi]),
    heading('KẾ HOẠCH VÀ NHÂN SỰ THAM GIA', 1),
    staffingTable(payload.staffing.length > 0 ? payload.staffing : [missingStaffing]),
  );

  return new Document({
    creator: payload.metadata.author,
    title: `PL02 ${payload.metadata.crCode} - ${payload.metadata.featureName}`,
    description: 'Tài liệu đặc tả chức năng PL02',
    features: { updateFields: true },
    theme: {
      fonts: {
        headings: { latin: DOCX_FONT, eastAsia: DOCX_FONT, complexScript: DOCX_FONT },
        body: { latin: DOCX_FONT, eastAsia: DOCX_FONT, complexScript: DOCX_FONT },
      },
    },
    styles: {
      default: {
        document: {
          run: {
            font: { ascii: DOCX_FONT, hAnsi: DOCX_FONT, eastAsia: DOCX_FONT, cs: DOCX_FONT },
            size: 22,
          },
          paragraph: { spacing: { line: 276 } },
        },
        title: { run: { font: DOCX_FONT } },
        heading1: { run: { font: DOCX_FONT, bold: true, size: 26 } },
        heading2: { run: { font: DOCX_FONT, bold: true, size: 24 } },
        heading3: { run: { font: DOCX_FONT, bold: true, size: 22 } },
      },
    },
    numbering: {
      config: [
        {
          reference: HEADINGS,
          levels: [
            {
              level: 0,
              format: LevelFormat.UPPER_ROMAN,
              text: '%1.',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 360, hanging: 360 } } },
            },
            {
              level: 1,
              format: LevelFormat.DECIMAL,
              text: '%2.',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
            {
              level: 2,
              format: LevelFormat.LOWER_LETTER,
              text: '%3.',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 1080, hanging: 360 } } },
            },
          ],
        },
        {
          reference: BULLETS,
          levels: [{
            level: 0,
            format: LevelFormat.BULLET,
            text: '•',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          }],
        },
      ],
    },
    sections: [{
      properties: {
        page: {
          margin: {
            top: 1134,
            right: 1134,
            bottom: 1134,
            left: 1418,
            header: 567,
            footer: 567,
            gutter: 0,
          },
        },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({
              text: `NGÂN HÀNG TMCP SÀI GÒN – HÀ NỘI | ${payload.metadata.crCode}`,
              bold: true,
              font: DOCX_FONT,
              size: 18,
            })],
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: 'Tài liệu này chứa các thông tin NỘI BỘ của SHB, cấm sao chép, in ấn dưới mọi hình thức nếu không được sự cho phép của SHB. ',
                font: DOCX_FONT,
                size: 16,
              }),
              new TextRun({ children: [PageNumber.CURRENT], font: DOCX_FONT, size: 16 }),
            ],
          })],
        }),
      },
      children,
    }],
  });
}
