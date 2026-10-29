import {
  AlignmentType,
  Document,
  HeadingLevel,
  Paragraph,
  TextRun,
} from 'docx';
import { DOCX_FONT, docxParagraph, signOffTable, supplied } from './docxShared';

export type CabSourceKind = 'PL02' | 'PL03B' | 'PL07';

export interface CabSourceRef {
  kind: CabSourceKind;
  artifactId: string;
  version: number;
  hash: string;
  projectId: string;
  threadId: string;
  approved: boolean;
}

export interface CabDocxPayload {
  schemaVersion: 1;
  kind: 'CAB';
  status: 'approved';
  inputRevision: number;
  draftRevision: number;
  approvedRevision: number;
  projectId: string;
  threadId: string;
  sourceArtifactIds: Record<CabSourceKind, string>;
  sources: CabSourceRef[];
  expectedVersions: Record<CabSourceKind, number>;
  expectedHashes: Record<CabSourceKind, string>;
  title: string;
  contextObjective: string;
  businessChanges: string[];
  technicalChanges: string[];
  sit: string | null;
  uat: string | null;
  risks: string[];
  unresolvedDrift: string[];
  rollback: { summary: string; verified: boolean };
  caveats: string[];
}

const MAX_LIST_ITEMS = 12;
const MAX_ITEM_CHARS = 600;
const MAX_TEXT_CHARS = 4_000;

function boundedText(value: string, max = MAX_TEXT_CHARS): string {
  return supplied(value).slice(0, max);
}

function heading(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text, bold: true, font: DOCX_FONT, size: 24 })],
    spacing: { before: 160, after: 80 },
  });
}

function list(values: readonly string[], empty = '(chưa cung cấp)'): Paragraph[] {
  const items = values.length > 0 ? values.slice(0, MAX_LIST_ITEMS) : [empty];
  return items.map((value) => new Paragraph({
    bullet: { level: 0 },
    children: [new TextRun({ text: boundedText(value, MAX_ITEM_CHARS), font: DOCX_FONT, size: 22 })],
    spacing: { after: 60 },
  }));
}

export function buildCabDocument(payload: CabDocxPayload): Document {
  const tests = [
    `SIT: ${payload.sit ? boundedText(payload.sit) : 'chưa cung cấp'}`,
    `UAT: ${payload.uat ? boundedText(payload.uat) : 'chưa cung cấp'}`,
  ];
  const rollbackState = payload.rollback.verified
    ? `Rollback đã được kiểm chứng: ${boundedText(payload.rollback.summary, 1_500)}`
    : `Rollback chưa được kiểm chứng: ${boundedText(payload.rollback.summary, 1_500)}`;
  const riskItems = [
    ...payload.risks,
    ...payload.unresolvedDrift.map((item) => `Drift chưa xử lý: ${item}`),
    ...payload.caveats,
  ];

  return new Document({
    styles: {
      default: {
        document: { run: { font: DOCX_FONT, size: 22 } },
        heading1: { run: { font: DOCX_FONT, size: 24, bold: true } },
      },
    },
    sections: [{
      properties: { page: { margin: { top: 900, right: 900, bottom: 900, left: 900 } } },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: boundedText(payload.title, 200), bold: true, font: DOCX_FONT, size: 28 })],
          spacing: { after: 180 },
        }),
        heading('BỐI CẢNH VÀ MỤC TIÊU'),
        docxParagraph(boundedText(payload.contextObjective)),
        heading('THAY ĐỔI NGHIỆP VỤ CHÍNH'),
        ...list(payload.businessChanges),
        heading('THAY ĐỔI KỸ THUẬT CHÍNH'),
        ...list(payload.technicalChanges),
        heading('KẾT QUẢ KIỂM THỬ SIT/UAT'),
        ...list(tests),
        heading('RỦI RO VÀ DRIFT CHƯA XỬ LÝ'),
        ...list(riskItems, 'Không ghi nhận; cần xác nhận trước quyết định triển khai.'),
        heading('PHƯƠNG ÁN ROLLBACK'),
        docxParagraph(rollbackState),
        signOffTable('CÁN BỘ PHÁT TRIỂN', 'CÁN BỘ PHÊ DUYỆT'),
      ],
    }],
  });
}
